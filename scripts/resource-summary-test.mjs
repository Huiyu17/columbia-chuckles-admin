// Presentation/read-only lookup checks. No credentials, network calls or writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = fileURLToPath(new URL("../", import.meta.url));
const cache = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (cache.has(filename)) return cache.get(filename);
  const loadedModule = { exports: {} }; cache.set(filename, loadedModule.exports);
  const code = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const localRequire = name => {
    if (name === "next/link") return function LinkStub(props) {
      return React.createElement("a", { href: props.href }, props.children);
    };
    if (name === "next/image") return function ImageStub(props) {
      return React.createElement("img", { src: props.src, alt: props.alt, width: props.width, height: props.height });
    };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      return load(/\.tsx?$/.test(target) ? target : `${target}.ts`);
    }
    return require(name);
  };
  new Function("require", "module", "exports", code)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const { summarizeResource: summary, emptyRelations, preview, resourceDate } = load("lib/resource-summary.ts");
const { loadResourceRelations } = load("lib/resource-relations.ts");
const Card = load("components/ResourceCardSummary.tsx").default;
const { captionLifecycle, unavailableCaption } = load("lib/caption-lifecycle.ts");
const id = "70000000-0000-4000-8000-000000000001";
const relations = emptyRelations();
relations.chains[id] = { id, name: "Grounded campus caption" };
relations.models[id] = { id, name: "Gemini model" };
relations.providers[id] = { id, name: "Google" };
relations.users[id] = { id, first_name: "Campus", last_name: "Creator" };
let count = 0;
async function check(name, run) { await run(); console.log(`ok ${++count} - ${name}`); }

await check("existing readable names, domains and emails remain primary titles", () => {
  for (const [key, row, expected] of [
    ["prompt-chains", { name: "Campus chain", description: "Grounded jokes" }, "Campus chain"],
    ["terms", { term: "Office hours", definition: "Time for questions" }, "Office hours"],
    ["llm-providers", { name: "Google" }, "Google"],
    ["llm-models", { name: "Gemini model", provider_id: id }, "Gemini model"],
    ["signup-domains", { domain: "example.edu" }, "example.edu"],
    ["whitelisted-emails", { email: "student@example.edu" }, "student@example.edu"],
  ]) assert.equal(summary(key, { id, ...row }, relations).title, expected);
});
await check("steps show one-based step number and actual chain/model names", () => {
  const value = summary("prompt-chain-steps", { id, step_order: 0, prompt: "Write a caption", prompt_chain_id: id, llm_model_id: id }, relations);
  assert.equal(value.title, "Step 1 · Write a caption");
  assert.ok(value.facts.some(f => f.value === "Grounded campus caption"));
  assert.ok(value.facts.some(f => f.value === "Gemini model"));
  assert.ok(summary("prompt-chain-steps", { step_order: 0, llm_model_id: null }).facts.some(f => f.value === "App default model"));
});
await check("mix uses chain name and preserves zero weight and disabled status", () => {
  const value = summary("prompt-chain-mix", { id, prompt_chain_id: id, weight: 0, enabled: false }, relations);
  assert.equal(value.title, "Grounded campus caption"); assert.equal(value.status, "Disabled");
  assert.deepEqual(value.facts, [{ label: "Weight", value: "0" }]);
});
await check("request summaries use actual scene/model/style rather than UUID or full JSON", () => {
  const request = { context: "Week 7 new test", model: "Gemini", style: "absurd" };
  for (const value of [request, JSON.stringify(request)]) {
    const result = summary("generation-requests", { id, user_id: id, status: "completed", request: value }, relations);
    assert.equal(result.title, request.context); assert.equal(result.status, "completed");
    assert.ok(result.facts.some(f => f.value === "Campus Creator"));
    assert.ok(result.facts.some(f => f.value === "Gemini"));
  }
});
await check("examples show short prompt and response previews without altering full content", () => {
  const row = { id, prompt: "A ".repeat(300), response: "Response ".repeat(300) };
  const before = JSON.stringify(row); const result = summary("generation-examples", row);
  assert.ok(result.title.length <= 120); assert.ok(result.preview.length <= 160);
  assert.equal(result.previewLabel, "Response"); assert.equal(JSON.stringify(row), before);
});
await check("responses expose actual model, latency and usage including zero counts", () => {
  const value = summary("llm-responses", { id, response: "A campus joke", llm_model_id: id, latency_ms: 0, input_tokens: 758, output_tokens: 0 }, relations);
  assert.equal(value.title, "A campus joke");
  for (const expected of ["Gemini model", "0 ms", "758", "0"]) assert.ok(value.facts.some(f => f.value === expected));
  const failed = summary("llm-responses", { error: "Provider timed out", response: null });
  assert.equal(failed.title, "Provider timed out"); assert.equal(failed.status, "Failed");
  assert.equal(failed.facts.some(f => /tokens/.test(f.label)), false);
});
await check("missing and malformed values have graceful fallbacks without fabricated names", () => {
  for (const key of ["prompt-chains", "prompt-chain-steps", "prompt-chain-mix", "terms", "generation-requests", "generation-examples", "llm-models", "llm-providers", "llm-responses", "signup-domains", "whitelisted-emails", "images"]) {
    const value = summary(key, { id }); assert.ok(value.title); assert.ok(!value.title.includes(id));
  }
  assert.doesNotThrow(() => summary("generation-requests", { request: "not JSON" }));
  assert.equal(resourceDate("broken timestamp"), "Date unavailable");
  assert.match(resourceDate("2026-10-28T18:57:21Z"), /2:57 PM EDT/);
  assert.ok(preview("😀".repeat(200), 10).endsWith("…"));
});
await check("image headings use alt text and actual uploader profile names", () => {
  const value = summary("images", { alt_text: "A sleepy student", user_id: id }, relations);
  assert.equal(value.title, "A sleepy student"); assert.equal(value.facts[0].value, "Campus Creator");
});
await check("rendered cards show readable summaries, escape text and hide raw IDs", () => {
  const html = renderToStaticMarkup(React.createElement(Card, { resource: "generation-requests", relations,
    row: { id, status: "completed", created_at: "2026-10-28T18:57:21Z", request: { context: "<script>Scene</script>", model: "Gemini" } } }));
  assert.ok(html.includes("&lt;script&gt;Scene&lt;/script&gt;")); assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("Completed")); assert.ok(html.includes("Gemini")); assert.ok(html.includes("EDT"));
  assert.ok(!html.includes(id));
});
await check("related lookups are read-only, deduplicated and require exact record matches", async () => {
  const calls = [];
  const client = { rpc: async (fn, args) => {
    calls.push([fn, args]); return { error: null, data: { rows: [{ id: `${id}-decoy`, name: "Wrong" }, { id, name: args.resource === "prompt_chains" ? "Actual chain" : "Actual model" }] } };
  } };
  const { relations: found, unavailable } = await loadResourceRelations(client, "prompt-chain-steps", [
    { prompt_chain_id: id, llm_model_id: id }, { prompt_chain_id: id, llm_model_id: id },
  ]);
  assert.equal(unavailable, false); assert.equal(calls.length, 2);
  assert.ok(calls.every(([name]) => name === "admin_resource_read"));
  assert.equal(found.chains[id].name, "Actual chain"); assert.equal(found.models[id].name, "Actual model");
});
await check("lookup failures do not prevent records rendering or invent related data", async () => {
  const result = await loadResourceRelations({ rpc: async () => { throw Error("unavailable"); } }, "prompt-chain-mix", [{ prompt_chain_id: id }]);
  assert.equal(result.unavailable, true); assert.deepEqual(result.relations.chains, {});
  assert.equal(summary("prompt-chain-mix", { prompt_chain_id: id }, result.relations).title, "Prompt chain mix");
});
await check("resources without visible relationship IDs make no extra RPCs", async () => {
  const result = await loadResourceRelations({ rpc: () => { throw Error("Unexpected read"); } }, "terms", [{ term: "A term" }]);
  assert.equal(result.unavailable, false);
});
const generationId = "80000000-0000-4000-8000-000000000001";
const captionId = "90000000-0000-4000-8000-000000000001";
const completed = { id, generation_id: generationId, status: "completed" };
const generation = { id: generationId, withdrawn_at: null };
const published = { id: captionId, generation_id: generationId, deleted_at: null, deleted_by: null };
await check("published captions have a working details link and a separate lifecycle state", () => {
  const state = captionLifecycle(completed, generation, [published]);
  assert.equal(state.state, "published"); assert.equal(state.href, `/media/${captionId}`);
  const copy = emptyRelations(); copy.captionStates[id] = state;
  const value = summary("generation-requests", completed, copy);
  assert.equal(value.status, "completed"); assert.equal(value.statusLabel, "Generation"); assert.equal(value.caption.label, "Published");
});
await check("never-published previews are not mislabeled as deleted", () => {
  const state = captionLifecycle(completed, generation, []);
  assert.equal(state.state, "draft"); assert.equal(state.label, "Not published"); assert.equal(state.href, undefined);
});
await check("author Trash, admin removal and restored captions are distinguished", () => {
  for (const [actor, expected] of [["author", "author-trash"], ["admin", "admin-removed"]]) {
    const state = captionLifecycle(completed, { ...generation, withdrawn_at: "2026-10-28T20:00:00Z" }, [{ ...published, deleted_at: "2026-10-28T20:00:00Z", deleted_by: actor }]);
    assert.equal(state.state, expected); assert.equal(state.href, `/media/${captionId}`); assert.match(state.description, /restore/);
  }
  assert.equal(captionLifecycle(completed, generation, [published]).state, "published");
});
await check("permanent deletion requires a withdrawal marker AND no live or hidden caption", () => {
  const state = captionLifecycle(completed, { ...generation, withdrawn_at: "2026-10-28T20:00:00Z" }, []);
  assert.equal(state.state, "deleted"); assert.equal(state.label, "Permanently deleted");
  assert.equal(state.href, undefined); assert.match(state.description, /original AI response is retained/);
  assert.equal(captionLifecycle(completed, undefined, []).state, "unavailable");
});
await check("failed and running attempts without drafts are not reported as deleted", () => {
  assert.equal(captionLifecycle({ status: "failed" }, undefined, []).state, "not-created");
  assert.equal(captionLifecycle({ status: "running" }, undefined, []).state, "pending");
  assert.equal(captionLifecycle({ status: "completed" }, undefined, []).state, "unavailable");
});
await check("request and response cards display generation result independently from deletion", () => {
  const copy = emptyRelations(); copy.captionStates[id] = captionLifecycle(completed, { ...generation, withdrawn_at: "2026-10-28T20:00:00Z" }, []);
  for (const [resource, row] of [["generation-requests", completed], ["llm-responses", { generation_request_id: id, response: "Original AI response" }]]) {
    const html = renderToStaticMarkup(React.createElement(Card, { resource, row, relations: copy }));
    assert.ok(html.includes("Generation:")); assert.ok(html.includes("Completed")); assert.ok(html.includes("Caption:"));
    assert.ok(html.includes("Permanently deleted")); assert.ok(!html.includes("href="));
  }
  assert.equal(unavailableCaption().state, "unavailable");
});

function lifecycleClient({ generations = [generation], captions = [], hidden = [], fail, requests = [completed] } = {}) {
  const calls = [];
  const sources = { generations, captions, hidden };
  function query(table) {
    let field, ids;
    return {
      select() { return this; },
      in(column, values) { field = column; ids = values; return this; },
      order() { return this; },
      async range(from, to) {
        calls.push({ table, from, to, ids });
        const rows = (sources[table] ?? []).filter(row => !field || ids.includes(row[field]));
        return fail === table ? { data: null, error: { message: "Unavailable" } } : { data: rows.slice(from, to + 1), error: null };
      },
    };
  }
  return { calls, client: {
    from: table => query(table),
    rpc: (name, args) => name === "admin_list_withdrawn_captions" ? query("hidden")
      : Promise.resolve({ data: { rows: args.resource === "generation_requests" ? requests : [] }, error: null }),
  } };
}
await check("lifecycle lookup reads hidden captions through the existing admin RPC", async () => {
  const fixture = lifecycleClient({ hidden: [{ ...published, deleted_at: "2026-10-28T20:00:00Z", deleted_by: "author" }] });
  const result = await loadResourceRelations(fixture.client, "generation-requests", [completed]);
  assert.equal(result.unavailable, false); assert.equal(result.relations.captionStates[id].state, "author-trash");
  assert.deepEqual(fixture.calls.find(call => call.table === "hidden").ids, [generationId]);
});
await check("failed hidden-caption reads cannot cause false permanent-deletion labels", async () => {
  const fixture = lifecycleClient({ generations: [{ ...generation, withdrawn_at: "2026-10-28T20:00:00Z" }], fail: "hidden" });
  const result = await loadResourceRelations(fixture.client, "generation-requests", [completed]);
  assert.equal(result.unavailable, true); assert.equal(result.relations.captionStates[id].state, "unavailable");
});
await check("response lifecycle uses its actual linked request and generation", async () => {
  const fixture = lifecycleClient({ captions: [published] });
  const result = await loadResourceRelations(fixture.client, "llm-responses", [{ id: "response", generation_request_id: id }]);
  assert.equal(result.relations.captionStates[id].state, "published");
  assert.equal(summary("llm-responses", { generation_request_id: id, response: "A caption" }, result.relations).caption.state, "published");
});
await check("hidden-caption pagination avoids treating later-page records as deleted", async () => {
  const otherGeneration = "80000000-0000-4000-8000-000000000002";
  const filler = Array.from({ length: 1000 }, (_, n) => ({ ...published, id: `filler-${n}`, generation_id: otherGeneration, deleted_at: "2026-10-28T20:00:00Z", deleted_by: "admin" }));
  const fixture = lifecycleClient({ generations: [generation, { id: otherGeneration, withdrawn_at: "2026-10-28T20:00:00Z" }],
    hidden: [...filler, { ...published, deleted_at: "2026-10-28T20:00:00Z", deleted_by: "author" }] });
  const result = await loadResourceRelations(fixture.client, "generation-requests", [completed, { ...completed, id: "other-request", generation_id: otherGeneration }]);
  assert.equal(result.relations.captionStates[id].state, "author-trash");
  assert.equal(fixture.calls.filter(call => call.table === "hidden").length, 2);
});
console.log(`\n${count} resource summary checks passed.`);
