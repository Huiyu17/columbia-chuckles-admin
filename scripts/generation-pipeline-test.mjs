// Tests the main app's real orchestration with fake AI and RPC transports.
// No provider API calls, credentials or hosted database writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../../the-humor-project/lib/generation-pipeline.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { runCaptionGeneration } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
let checks = 0;
const plan = { request_id: "70000000-0000-4000-8000-000000000004", model: "configured-google-model", prompt: "The database-rendered prompt" };
function fixture(overrides = {}) {
  const calls = []; let aiCalls = 0;
  const input = {
    imageId: "an-image", context: "Campus scene", style: "deadpan", basePrompt: "Base prompt", defaultModel: "default-model",
    database: { rpc: async (name, args) => {
      calls.push({ name, args });
      return { data: name === "humor_begin_generation" ? plan : "saved-draft", error: null };
    } },
    generate: async received => { aiCalls++; assert.deepEqual(received, { model: plan.model, prompt: plan.prompt }); return { text: "  A fresh campus joke.  ", inputTokens: 90, outputTokens: 7 }; },
    validate: () => null, describeError: () => "Sanitized provider failure", ...overrides,
  };
  return { input, calls, aiCalls: () => aiCalls };
}
async function check(name, fn) { await fn(); console.log(`ok ${++checks} - ${name}`); }

await check("successful AI call uses database prompt/model and completes with measured usage", async () => {
  const f = fixture(); const result = await runCaptionGeneration(f.input);
  assert.equal(f.calls[0].name, "humor_begin_generation"); assert.equal(f.calls[1].name, "humor_finish_generation");
  assert.equal(f.aiCalls(), 1); assert.equal(result.generationId, "saved-draft"); assert.equal(result.content, "A fresh campus joke.");
  assert.equal(f.calls[1].args.p_input_tokens, 90); assert.equal(f.calls[1].args.p_output_tokens, 7);
  assert.ok(f.calls[1].args.p_latency_ms >= 0); assert.equal(f.calls[1].args.p_error, null);
});
await check("missing migration prevents AI spend and returns an actionable error", async () => {
  const f = fixture({ database: { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) } });
  assert.match((await runCaptionGeneration(f.input)).error, /013_generation_pipeline/); assert.equal(f.aiCalls(), 0);
});
await check("invalid plan prevents provider call", async () => {
  const f = fixture({ database: { rpc: async () => ({ data: {}, error: null }) } });
  assert.ok((await runCaptionGeneration(f.input)).error); assert.equal(f.aiCalls(), 0);
});
await check("disabled or zero-weight chains clearly report unavailable without suggesting retry", async () => {
  const f = fixture({ database: { rpc: async () => ({ data: null, error: { code: "22023", message: "No enabled prompt chain with positive weight" } }) } });
  const result = await runCaptionGeneration(f.input);
  assert.match(result.error, /currently unavailable/);
  assert.match(result.error, /administrator/);
  assert.doesNotMatch(result.error, /try again|retry|22023|positive weight/i);
  assert.equal(f.aiCalls(), 0);
});
await check("provider errors record a failed completion with no sensitive error message", async () => {
  const f = fixture({ generate: async () => { throw Error("SECRET_API_KEY provider detail"); } });
  const result = await runCaptionGeneration(f.input);
  assert.equal(result.error, "Sanitized provider failure"); assert.equal(result.generationId, undefined);
  assert.equal(f.calls[1].args.p_error, "Sanitized provider failure"); assert.equal(f.calls[1].args.p_response, null);
  assert.doesNotMatch(JSON.stringify(f.calls), /SECRET/);
});
await check("rejected output and its real token usage remain observable", async () => {
  const f = fixture({ validate: () => "Duplicate caption" });
  assert.equal((await runCaptionGeneration(f.input)).error, "Duplicate caption");
  assert.equal(f.calls[1].args.p_error, "Duplicate caption"); assert.equal(f.calls[1].args.p_response, "A fresh campus joke.");
  assert.equal(f.calls[1].args.p_output_tokens, 7);
});
await check("lost completion is retried without a second provider call", async () => {
  const f = fixture(); const rpc = f.input.database.rpc; let completions = 0;
  f.input.database.rpc = async (name, args) => name === "humor_finish_generation" && completions++ === 0
    ? { data: null, error: { code: "network" } } : rpc(name, args);
  const result = await runCaptionGeneration(f.input);
  assert.equal(result.generationId, "saved-draft"); assert.equal(f.aiCalls(), 1); assert.equal(completions, 2);
});
await check("persistent logging failure is visible and includes trace ID", async () => {
  const f = fixture(); const rpc = f.input.database.rpc;
  f.input.database.rpc = async (name, args) => name === "humor_begin_generation" ? rpc(name, args) : { data: null, error: { code: "failed" } };
  const result = await runCaptionGeneration(f.input);
  assert.match(result.error, /could not be saved/); assert.equal(result.requestId, plan.request_id); assert.equal(result.generationId, undefined);
});
await check("unavailable or invalid token counts are stored as null", async () => {
  const f = fixture({ generate: async () => ({ text: "Another caption", inputTokens: NaN, outputTokens: -1 }) });
  await runCaptionGeneration(f.input); assert.equal(f.calls[1].args.p_input_tokens, null); assert.equal(f.calls[1].args.p_output_tokens, null);
});
await check("thrown transport errors at completion are retried safely", async () => {
  const f = fixture(); const rpc = f.input.database.rpc; let count = 0;
  f.input.database.rpc = async (name, args) => {
    if (name === "humor_finish_generation" && count++ === 0) throw new Error("Transport interrupted");
    return rpc(name, args);
  };
  assert.equal((await runCaptionGeneration(f.input)).generationId, "saved-draft"); assert.equal(f.aiCalls(), 1);
});
console.log(`\n${checks} generation orchestration checks passed.`);
