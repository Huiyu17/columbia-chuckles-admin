import { createHash } from "node:crypto";
import { buildCaptionPrompt, jokeAngles, type HumorStyle } from "./caption-prompt";
import type { RecordRow } from "./resources";

export type ChainTestInput = { mode: "current" | "specific"; workflowId?: string; imageId: string; scene: string; style: HumorStyle };
export type TestConfig = { chains: RecordRow[]; mix: RecordRow[]; steps: RecordRow[]; models: RecordRow[]; providers: RecordRow[]; image: RecordRow; recentCaptions: string[] };
export type PreparedChainTest = {
  input: ChainTestInput; actorId: string; angleIndex: number; fingerprint: string;
  workflow: { id: string; name: string };
  step: { id: string; order: number; instruction: string };
  model: { id: string; name: string; provider: string };
  image: { id: string; url: string; description: string; usesPhoto: boolean };
  selection: { mode: "current" | "specific"; enabled: boolean | null; weight: number | null; eligibleCount: number };
  basePrompt: string; prompt: string; recentCaptionCount: number;
};
export type ChainTestResult = { source: "admin-test"; response: string; error?: string; modelCalled: boolean; latencyMs: number; inputTokens: number | null; outputTokens: number | null; validation: "passed" | "rejected" | "not-run" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (value: unknown) => typeof value === "string" ? value : "";

export function validChainTestInput(value: unknown): value is ChainTestInput {
  if (!value || typeof value !== "object") return false;
  const input = value as ChainTestInput;
  return ["current", "specific"].includes(input.mode) && uuid.test(str(input.imageId))
    && typeof input.scene === "string" && input.scene.trim().length >= 5 && input.scene.trim().length <= 500
    && ["relatable", "deadpan", "absurd"].includes(input.style)
    && (input.mode !== "specific" || uuid.test(str(input.workflowId)));
}
export function selectTestWorkflow(mix: RecordRow[], random: () => number = Math.random): string {
  const candidates = mix.filter(row => row.enabled === true && Number.isFinite(Number(row.weight)) && Number(row.weight) > 0);
  if (!candidates.length) throw new Error("No workflows are enabled with a positive weight. Enable one in Selection settings, or choose Test a specific workflow.");
  const chosen = candidates.map(row => ({ row, score: -Math.log(Math.max(random(), 0.000000000001)) / Number(row.weight) }))
    .sort((a, b) => a.score - b.score)[0].row;
  return String(chosen.prompt_chain_id);
}

/** Same base rules, one-step suffix and model resolution as the caption app.
 * The preview is a snapshot; execution rebuilds and compares it before calling AI. */
export function buildChainTestPlan(config: TestConfig, input: ChainTestInput, actorId: string, defaultModel: string,
  options: { workflowId?: string; angleIndex?: number; random?: () => number } = {}): PreparedChainTest {
  if (!validChainTestInput(input)) throw new Error("Choose an image and style, and enter a scene of 5–500 characters.");
  const workflowId = options.workflowId ?? (input.mode === "specific" ? input.workflowId! : selectTestWorkflow(config.mix, options.random));
  const workflow = config.chains.find(row => row.id === workflowId);
  if (!workflow) throw new Error("This workflow is unavailable. Choose another workflow.");
  const setting = config.mix.find(row => row.prompt_chain_id === workflowId);
  if (input.mode === "current" && (!setting || setting.enabled !== true || !Number.isFinite(Number(setting.weight)) || Number(setting.weight) <= 0)) {
    throw new Error("The selected workflow is no longer eligible. Prepare the test again or choose a specific workflow.");
  }
  const steps = config.steps.filter(row => row.prompt_chain_id === workflowId).sort((a, b) => Number(a.step_order) - Number(b.step_order));
  if (steps.length !== 1) throw new Error("The caption app currently supports exactly one instruction step per workflow. This test follows the same rule.");
  const step = steps[0];
  const model = step.llm_model_id == null
    ? config.models.find(row => row.name === defaultModel && config.providers.some(provider => provider.id === row.provider_id && provider.name === "Google"))
    : config.models.find(row => row.id === step.llm_model_id);
  const provider = config.providers.find(row => row.id === model?.provider_id);
  if (!model || provider?.name !== "Google") throw new Error("This workflow needs a registered Google model. Check LLM models and the app default model setting.");
  if (config.image.id !== input.imageId) throw new Error("The selected image is unavailable.");
  const angleIndex = options.angleIndex ?? Math.floor((options.random ?? Math.random)() * jokeAngles.length);
  if (!Number.isInteger(angleIndex) || angleIndex < 0 || angleIndex >= jokeAngles.length) throw new Error("The test preview is invalid. Prepare it again.");
  const usesPhoto = !!config.image.storage_path;
  const basePrompt = buildCaptionPrompt({ style: input.style, scene: input.scene, imageDescription: str(config.image.alt_text),
    hasPhoto: usesPhoto, recentCaptions: config.recentCaptions, angle: jokeAngles[angleIndex] });
  const instruction = str(step.prompt);
  const prompt = `${basePrompt}\n\nPipeline step instruction:\n${instruction}`;
  if (!instruction.trim() || prompt.length > 30000) throw new Error("This workflow's prompt is empty or too long to run.");
  const plan = {
    input: { ...input, scene: input.scene.trim() }, actorId, angleIndex,
    workflow: { id: workflowId, name: str(workflow.name) || "Unnamed workflow" },
    step: { id: String(step.id), order: Number(step.step_order), instruction },
    model: { id: String(model.id), name: str(model.name), provider: str(provider.name) },
    image: { id: input.imageId, url: str(config.image.url), description: str(config.image.alt_text), usesPhoto },
    selection: { mode: input.mode, enabled: typeof setting?.enabled === "boolean" ? setting.enabled : null,
      weight: setting && Number.isFinite(Number(setting.weight)) ? Number(setting.weight) : null,
      eligibleCount: config.mix.filter(row => row.enabled === true && Number.isFinite(Number(row.weight)) && Number(row.weight) > 0).length },
    basePrompt, prompt, recentCaptionCount: config.recentCaptions.length,
  };
  return { ...plan, fingerprint: createHash("sha256").update(JSON.stringify({ plan, storagePath: config.image.storage_path ?? null })).digest("hex") };
}
