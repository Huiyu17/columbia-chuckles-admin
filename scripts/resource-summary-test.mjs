// Presentation/read-only lookup checks. No credentials, network calls or writes.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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
    if (name === "./ResourceEditor") return { __esModule: true, default: props => React.createElement('form', {'data-resource':props.resource,'data-operation':props.row?'edit':'create'},props.row?'Edit form':'Create form') };
    if (name === "next/link") return function LinkStub(props) {
      return React.createElement("a", { href: props.href, 'aria-current': props['aria-current'] }, props.children);
    };
    if (name === "next/image") return function ImageStub(props) {
      return React.createElement("img", { src: props.src, alt: props.alt, width: props.width, height: props.height });
    };
    if (name.startsWith("@/") || name.startsWith(".")) {
      const target = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      return load(/\.tsx?$/.test(target) ? target : existsSync(`${target}.ts`) ? `${target}.ts` : `${target}.tsx`);
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
const { referenceField, referenceOption, fieldHelp } = load("lib/reference-fields.ts");
const { readReferenceOptions, loadReferenceChoices } = load("lib/reference-options.ts");
const WorkflowGuide = load("components/WorkflowGuide.tsx").default;
const ChainOverview = load("components/PromptChainOverview.tsx").default;
const ChainTabs = load("components/PromptChainTabs.tsx").default;
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
await check("workflow guidance explains purpose, sequence and weights without exposing UUIDs", () => {
  for (const resource of ['prompt-chains','prompt-chain-steps','prompt-chain-mix']) {
    const html = renderToStaticMarkup(React.createElement(WorkflowGuide,{resource}));
    for(const label of ['Caption workflows','AI instructions','Workflow selection']) assert.ok(html.includes(label));
    assert.ok(html.includes('view-only')); assert.ok(!html.includes(id));
  }
  assert.match(fieldHelp('prompt-chain-mix','weight'),/Relative selection chance/);
  assert.match(fieldHelp('prompt-chain-mix','enabled'),/generation stops/);
  assert.equal(renderToStaticMarkup(React.createElement(WorkflowGuide,{resource:'terms'})),'');
});
await check("all known references use readable record labels rather than requiring UUID entry", () => {
  for(const field of ['prompt_chain_id','provider_id','llm_model_id','image_id','user_id','generation_id','generation_request_id','prompt_chain_step_id']) assert.ok(referenceField(field));
  assert.equal(referenceOption('prompt_chain_id',{id,name:'Grounded campus caption'}).label,'Grounded campus caption');
  assert.equal(referenceOption('image_id',{id,alt_text:'A sleepy student',url:'https://example.com/image.jpg'}).imageUrl,'https://example.com/image.jpg');
  assert.equal(referenceOption('user_id',{id,first_name:'Campus',last_name:'Creator',email:'creator@example.edu'}).label,'Campus Creator (creator@example.edu)');
  assert.equal(referenceOption('provider_id',{id}).label,'Unnamed provider');
  assert.ok(referenceOption('image_id',{id,alt_text:'😀'.repeat(200)}).label.endsWith('…'));
});
await check("reference search uses existing read-only RPCs and preserves selected records outside the current page", async () => {
  const calls=[];
  const client={rpc:async(name,args)=>{
    calls.push({name,args});
    return {error:null,data:{rows:args.search_text===id?[{id,name:'Currently selected workflow'}]:[{id:'other',name:'Search match'}],total:1}};
  }};
  const result=await readReferenceOptions(client,'prompt_chain_id','Search',1,[id]);
  assert.equal(result.options[0].label,'Search match');
  assert.equal(result.selected[0].label,'Currently selected workflow');
  assert.equal(result.selected[0].id,id);
  assert.ok(calls.every(call=>call.name==='admin_resource_read' && call.args.resource==='prompt_chains'));
});
await check("owner choices support actual names and email search through admin-only user reads", async () => {
  const client={rpc:async name=>{assert.equal(name,'admin_list_users');return {error:null,data:[
    {id,first_name:'Campus',last_name:'Creator',email:'creator@example.edu'},
    {id:'other',first_name:'Other',email:'other@example.edu'},
  ]};}};
  const result=await readReferenceOptions(client,'user_id','CREATOR@',1,[id]);
  assert.equal(result.total,1);assert.equal(result.options[0].id,id);
  assert.equal(result.selected[0].label,'Campus Creator (creator@example.edu)');
});
await check("initial choices deduplicate saved selections and only load actual reference fields", async () => {
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push(args);return {error:null,data:{rows:[{id,name:'Google'}],total:1}};}};
  const result=await loadReferenceChoices(client,[
    {name:'id',primary:true},{name:'provider_id',primary:false},{name:'name',primary:false},
  ],[{provider_id:id},{provider_id:id}]);
  assert.deepEqual(Object.keys(result),['provider_id']);assert.equal(calls.length,1);
  assert.equal(result.provider_id.selected[0].label,'Google');
});
await check("choice read failures surface a retryable error without fabricating records", async () => {
  const result=await readReferenceOptions({rpc:async()=>({data:null,error:{message:'Private internal diagnostic'}})},'prompt_chain_id');
  assert.equal(result.options.length,0);assert.match(result.error,/Retry/);assert.ok(!result.error.includes('Private'));
});
await check("chain list shows actual step counts, models and settings before opening details",()=>{
  const chain={id,name:'Campus workflow',description:'Test configuration'};
  const data={chains:[chain],steps:[{id:'step-b',prompt_chain_id:id,step_order:2,prompt:'Second instruction',llm_model_id:null},
    {id:'step-a',prompt_chain_id:id,step_order:0,prompt:'First instruction',llm_model_id:null}],
    mix:[{prompt_chain_id:id,enabled:false,weight:1}],models:[],providers:[],unavailable:false,defaultModel:'configured-model'};
  const html=renderToStaticMarkup(React.createElement(ChainOverview,{chains:[chain],data}));
  assert.ok(html.includes('Campus workflow'));assert.ok(html.includes('configured-model'));assert.ok(html.includes('Disabled'));
  assert.ok(html.includes('Open workflow'));assert.ok(html.includes('chain='));
  const before=JSON.stringify(data);
  const detail=renderToStaticMarkup(React.createElement(ChainOverview,{chains:[chain],data,selected:chain}));
  assert.ok(detail.indexOf('Step 1')<detail.indexOf('Step 2'));
  assert.ok(detail.indexOf('First instruction')<detail.indexOf('Second instruction'));
  assert.ok(detail.includes('multiple steps'));assert.ok(detail.includes('exactly one step'));
  assert.equal(JSON.stringify(data),before);
});
await check("workspace section links keep the selected workflow and identify the active tab",()=>{
  const html=renderToStaticMarkup(React.createElement(ChainTabs,{active:'test',chainId:id}));
  assert.equal((html.match(/<a /g)??[]).length,4);assert.ok(html.includes('Test run'));
  assert.equal((html.match(/chain=/g)??[]).length,4);assert.ok(html.includes('aria-current="page"'));
});
await check("recent runs use exact chain links and sort across all request pages", async () => {
  const {loadChainDisplay}=load('lib/prompt-chain-display.ts');
  const chain='70000000-0000-4000-8000-000000000004';
  const requests=Array.from({length:26},(_,index)=>({id:`request-${index}`,prompt_chain_id:chain,user_id:'profile-one',request:{context:`Scene ${index}`},created_at:new Date(Date.UTC(2026,0,index+1)).toISOString(),status:'completed'}));
  const calls=[];
  const client={from:table=>{assert.equal(table,'profiles');return {select:()=>({in:async(field,ids)=>{assert.deepEqual(ids,['profile-one']);return {data:[{id:'profile-one',first_name:'Campus',last_name:'Creator'}]};}})};},rpc:async(name,args)=>{
    assert.equal(name,'admin_resource_read');calls.push(args);
    if(args.resource==='generation_requests')return {data:{rows:requests.slice((args.page_number-1)*25,args.page_number*25),total:26},error:null};
    if(args.resource==='llm_responses')return {data:{rows:[{id:'output-one',generation_request_id:'request-25',response:'Actual recorded caption',error:null}],total:1},error:null};
    const rows=args.resource==='prompt_chains'?[{id:chain,name:'Inner monologue caption'}]:[];
    return {data:{rows,total:rows.length},error:null};
  }};
  const data=await loadChainDisplay(client);
  assert.equal(data.recentRuns[chain].length,5);
  assert.equal(data.recentRuns[chain][0].id,'request-25');
  assert.equal(data.recentRuns[chain][0].request.context,'Scene 25');
  assert.equal(data.users['profile-one'].first_name,'Campus');
  assert.ok(calls.some(call=>call.resource==='generation_requests'&&call.page_number===2&&call.search_text===chain));
  const failed=await loadChainDisplay({rpc:async(name,args)=>args.resource==='generation_requests'?{error:{message:'unavailable'}}:client.rpc(name,args)});
  assert.equal(failed.recentRuns[chain],undefined);
});
await check("resource details show readable content and named links without raw database fields",()=>{
  const Details=load('components/ResourceDetails.tsx').default;
  for(const [resource,row,expected] of [
    ['terms',{id,term:'Butler',definition:'Campus library',storage_path:'internal/path'},'Campus library'],
    ['generation-examples',{id,prompt:'Write a caption',response:'A witty caption'},'Expected response'],
    ['llm-models',{id,name:'Gemini',provider_id:id},'Google'],
    ['signup-domains',{id,domain:'example.edu'},'example.edu'],
    ['whitelisted-emails',{id,email:'test@example.edu'},'test@example.edu'],
    ['images',{id,alt_text:'Sleepy student',storage_path:'internal/path'},'Sleepy student'],
  ]){
    const html=renderToStaticMarkup(React.createElement(Details,{resource,row,choices:{provider_id:{options:[{id,label:'Google'}],selected:[],total:1,page:1}},relations:emptyRelations()}));
    assert.ok(html.includes(expected));assert.ok(!html.includes('View details'));
    assert.ok(!html.includes('<details'));assert.ok(!html.includes('Copy ID'));assert.ok(!html.includes(`>${id}<`));
    assert.ok(!html.includes('storage_path'));assert.ok(!html.includes('internal/path'));assert.ok(!html.includes('<pre'));
    assert.ok(!html.includes('provider_id'));assert.ok(!html.includes('?q='));
  }
});
await check("models and providers render together with actual chain assignments and separate CRUD forms",async()=>{
  const Page=load('components/ModelsProvidersPage.tsx').default;
  const fixtures={llm_models:[{id:'model-one',name:'gemini-3.5-flash-lite',provider_id:'provider-one'}],llm_providers:[{id:'provider-one',name:'Google'}],prompt_chains:[{id:'chain-one',name:'Grounded campus caption'}],prompt_chain_steps:[{id:'step-one',prompt_chain_id:'chain-one',llm_model_id:null}],prompt_chain_mix:[{prompt_chain_id:'chain-one',enabled:true,weight:1}]};
  const client={rpc:async(name,args)=>{assert.equal(name,'admin_resource_read');const rows=fixtures[args.resource];return {data:{rows,total:rows.length,columns:[{name:'id',primary:true,generated:false},{name:'name',primary:false,generated:false}]},error:null};}};
  const html=renderToStaticMarkup(await Page({supabase:client,query:'',selected:''}));
  assert.ok(html.indexOf('id="providers"')<html.indexOf('id="models"'));
  assert.ok(html.includes('Grounded campus caption'));assert.ok(html.includes('Google'));
  assert.equal((html.match(/data-resource="llm-providers"/g)??[]).length,1);
  assert.equal((html.match(/data-resource="llm-models"/g)??[]).length,1);
  assert.ok(!html.includes('role="tab"'));assert.ok(!html.includes('API base URL'));
  assert.ok(html.includes('In use'));
  fixtures.prompt_chain_mix[0].enabled=false;
  const disabled=renderToStaticMarkup(await Page({supabase:client,query:'',selected:''}));assert.ok(!disabled.includes('In use'));
  const filtered=renderToStaticMarkup(await Page({supabase:client,query:'no-match',selected:''}));
  assert.ok(filtered.includes('No models match your search'));assert.ok(filtered.includes('Google'));
});
await check("chain template uses placeholders and current instructions without real run data",()=>{
  const Template=load('components/PromptChainTemplate.tsx').default;
  const data={defaultModel:'Configured model',unavailable:false};
  const html=renderToStaticMarkup(React.createElement(Template,{steps:[{id:'step-one',prompt:'Current step instruction',llm_model_id:null}],data}));
  for(const value of ['How this prompt chain works','Illustrative flow','Photo selected','Situation entered by the user','Relatable / Deadpan / Absurd','Caption generated from these inputs','Current prompt chain step configuration','Current step instruction','Configured model'])assert.ok(html.includes(value),value);
  assert.ok(!html.includes('Actual run'));assert.ok(!html.includes('<img'));assert.ok(!html.includes('app default'));
  for(const label of ['Caption writing rules','Humor style','Photo &amp; scene'])assert.ok(html.includes(label));
  assert.ok(!html.includes('{{'));
  assert.ok(!html.includes('{{shared_caption_rules}}'));assert.ok(!html.includes('{{style_instructions}}'));assert.ok(!html.includes('{{photo_context_and_scene}}'));
});
console.log(`\n${count} resource summary checks passed.`);
