import { originalScene } from "./humor";
import type { RecordRow } from "./resources";

const object = (value: unknown): RecordRow => value && typeof value === "object" && !Array.isArray(value) ? value as RecordRow : {};
export function toolHistoryRecords(runs: RecordRow[]) {
  const responses: RecordRow[] = [];
  const rows = runs.map(run => {
    const outputs = Array.isArray(run.outputs) ? run.outputs.map(object) : [];
    const plan = object(run.plan);
    const context = typeof run.scene === "string" ? originalScene(run.scene) : "";
    const savedStyle = typeof run.scene === "string" ? run.scene.match(/\n\nSelected humor style: (Too relatable|Dry & deadpan|Absolutely absurd)\./u)?.[1] : undefined;
    const style = savedStyle === "Too relatable" ? "relatable" : savedStyle === "Dry & deadpan" ? "deadpan" : savedStyle === "Absolutely absurd" ? "absurd" : null;
    const models = [...new Set((Array.isArray(plan.steps) ? plan.steps.map(object) : []).map(step => step.model).filter(model => typeof model === "string"))];
    for (const [index, step] of outputs.entries()) responses.push({
      id: `${run.id}:step:${index}`, generation_request_id: run.id, created_at: run.created_at,
      chain_step_order: step.order ?? index, model_name: step.model, prompt: step.prompt, response: step.output,
      error: step.error ?? null, latency_ms: step.latencyMs, input_tokens: step.inputTokens, output_tokens: step.outputTokens,
    });
    return { id: run.id, user_id: run.actor_id, image_id: run.image_id, image_url: run.image_url,
      prompt_chain_id: run.chain_id, generation_id: null, status: run.status, created_at: run.created_at,
      request: { source: "prompt-tool", context, style, model: models.join(", "), chain_name: run.chain_name,
        step_count: Array.isArray(plan.steps) ? plan.steps.length : null, output: run.output, error: run.error } };
  });
  return { rows, responses };
}
