"use server";

import { GoogleGenAI } from "@google/genai";
import { adminForAction } from "@/lib/auth";
import { captionProblem } from "@/lib/caption-prompt";
import { buildChainTestPlan, validChainTestInput, type PreparedChainTest, type ChainTestResult } from "@/lib/prompt-chain-test";
import { loadChainTestConfig, testPhoto } from "@/lib/prompt-chain-test-server";

export async function preparePromptChainTest(input: unknown): Promise<{ plan?: PreparedChainTest; error?: string }> {
  const auth = await adminForAction();
  if (auth.error !== undefined) return { error: auth.error };
  if (!validChainTestInput(input)) return { error: "Choose an image and style, and enter a scene of 5–500 characters." };
  try {
    const config = await loadChainTestConfig(auth.supabase, input, auth.user.id);
    return { plan: buildChainTestPlan(config, input, auth.user.id, process.env.GEMINI_MODEL || "gemini-3.5-flash-lite") };
  } catch (error) { return { error: error instanceof Error ? error.message : "Could not prepare the workflow test." }; }
}

export async function runPromptChainTest(prepared: PreparedChainTest): Promise<ChainTestResult> {
  const blank: ChainTestResult = { source: "admin-test", response: "", modelCalled: false, latencyMs: 0, inputTokens: null, outputTokens: null, validation: "not-run" };
  const auth = await adminForAction();
  if (auth.error !== undefined) return { ...blank, error: auth.error };
  if (!prepared || !validChainTestInput(prepared.input) || prepared.actorId !== auth.user.id || typeof prepared.workflow?.id !== "string"
    || !Number.isInteger(prepared.angleIndex) || typeof prepared.fingerprint !== "string") return { ...blank, error: "This preview is invalid. Prepare the test again." };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ...blank, error: "AI testing is not configured for this admin app. The app owner needs to configure GEMINI_API_KEY. Prompt preview is still available." };
  let config, plan, photo;
  try {
    config = await loadChainTestConfig(auth.supabase, prepared.input, auth.user.id);
    plan = buildChainTestPlan(config, prepared.input, auth.user.id, process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
      { workflowId: prepared.workflow.id, angleIndex: prepared.angleIndex });
    if (plan.fingerprint !== prepared.fingerprint) return { ...blank, error: "The workflow, model or input context changed since this preview. Prepare the test again before running it." };
    photo = await testPhoto(auth.supabase, config.image);
  } catch (error) { return { ...blank, error: error instanceof Error ? error.message : "The workflow could not be prepared." }; }
  const started = Date.now();
  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.interactions.create({ model: plan.model.name,
      input: photo ? [{ type: "text", text: plan.prompt }, photo] : plan.prompt, store: false },
      { timeout: 45_000, retries: { strategy: "none" } });
    const response = result.output_text?.trim() ?? "";
    const problem = captionProblem(response, config.recentCaptions);
    const tokenCount = (value: number | undefined) => Number.isSafeInteger(value) && value! >= 0 ? value! : null;
    return { source: "admin-test", modelCalled: true, response: response.slice(0, 20000), latencyMs: Date.now() - started,
      inputTokens: tokenCount(result.usage?.total_input_tokens), outputTokens: tokenCount(result.usage?.total_output_tokens),
      validation: problem ? "rejected" : "passed",
      ...(problem ? { error: problem === "duplicate" ? "The response repeats a recent caption and would be rejected by the caption app." : "The response is empty, too long, or exceeds 30 words and would be rejected by the caption app." } : {}) };
  } catch {
    return { ...blank, modelCalled: true, latencyMs: Date.now() - started, error: "The AI service could not complete this test. It may be unavailable, rate-limited or timed out. Check the model configuration or try again." };
  }
}
