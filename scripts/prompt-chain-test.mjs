// Real preparation/execution code with fake configuration and provider transports.
// No network, hosted writes, or paid AI calls are made by this test suite.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../", import.meta.url));
const modules = new Map();
let config, actor, aiResult, aiError, aiCalls = 0, providerInput, photoError;
const mocks = {
  "@/lib/auth": { adminForAction: async () => actor },
  "@/lib/prompt-chain-test-server": {
    loadChainTestConfig: async () => structuredClone(config),
    testPhoto: async () => { if (photoError) throw Error(photoError); return undefined; },
  },
  "@google/genai": { GoogleGenAI: class {
    interactions = { create: async input => { aiCalls++; providerInput = input; if (aiError) throw aiError; return aiResult; } };
  } },
};
function load(relative) {
  let filename = path.resolve(root, relative);
  if (!/\.[cm]?[jt]sx?$/.test(filename)) filename += existsSync(`${filename}.ts`) ? ".ts" : ".tsx";
  if (modules.has(filename)) return modules.get(filename);
  const loaded = { exports: {} }; modules.set(filename, loaded.exports);
  const code = ts.transpileModule(readFileSync(filename,"utf8"), { compilerOptions: { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true } }).outputText;
  const local = name => mocks[name] ?? (name.startsWith("@/") ? load(name.slice(2))
    : name.startsWith(".") ? load(path.resolve(path.dirname(filename),name)) : require(name));
  new Function("require","module","exports",code)(local,loaded,loaded.exports);
  return loaded.exports;
}
const pure = load("lib/prompt-chain-test.ts");
const actions = load("app/actions/prompt-chain-test.ts");
const workspace = load("lib/prompt-chain-workspace.ts");
const ids = {
  chain:"70000000-0000-4000-8000-000000000001", step:"70000000-0000-4000-8000-000000000002",
  image:"80000000-0000-4000-8000-000000000001", model:"90000000-0000-4000-8000-000000000001",
  provider:"90000000-0000-4000-8000-000000000002", user:"10000000-0000-4000-8000-000000000001",
};
const input = {mode:"specific",workflowId:ids.chain,imageId:ids.image,scene:"Waiting outside the library",style:"deadpan"};
function reset() {
  config = { chains:[{id:ids.chain,name:"Campus captions"}], mix:[{prompt_chain_id:ids.chain,weight:1,enabled:true}],
    steps:[{id:ids.step,prompt_chain_id:ids.chain,step_order:0,llm_model_id:null,prompt:"Write one campus caption."}],
    models:[{id:ids.model,provider_id:ids.provider,name:"test-model"}], providers:[{id:ids.provider,name:"Google"}],
    image:{id:ids.image,url:"https://example.com/preset.jpg",alt_text:"A sleepy student",storage_path:null},recentCaptions:["An earlier joke"] };
  actor = {supabase:{},user:{id:ids.user}};
  aiCalls=0;aiError=null;photoError=null;
  aiResult={output_text:"My library reservation now includes a permanent mailing address.",usage:{total_input_tokens:200,total_output_tokens:0}};
}
let checks=0;
async function check(name,run) { reset();await run();console.log(`ok ${++checks} - ${name}`); }
const savedKey=process.env.GEMINI_API_KEY,savedModel=process.env.GEMINI_MODEL;
process.env.GEMINI_API_KEY="test-only-not-a-real-key";process.env.GEMINI_MODEL="test-model";
try {
  await check("workspace tabs preserve complete chain IDs and escape search values",()=>{
    assert.equal(workspace.promptChainTab('invalid'),'workflows');
    const href=workspace.promptChainHref('steps','some & text',2,ids.chain);
    const url=new URL(href,'http://localhost');
    assert.equal(url.searchParams.get('chain'),ids.chain);assert.equal(url.searchParams.get('q'),'some & text');
    assert.equal(url.searchParams.get('tab'),'steps');assert.equal(workspace.promptChainTabs.length,4);
  });
  await check("plan uses the exact base rules and production step suffix",()=>{
    const plan=pure.buildChainTestPlan(config,input,ids.user,'test-model',{angleIndex:0});
    assert.equal(plan.prompt,`${plan.basePrompt}\n\nPipeline step instruction:\n${config.steps[0].prompt}`);
    assert.equal(plan.step.id,ids.step);assert.equal(plan.model.name,'test-model');
    assert.equal(plan.image.usesPhoto,false);assert.equal(plan.recentCaptionCount,1);
  });
  await check("current selection excludes disabled/zero weights and follows relative weight",()=>{
    const mix=[{prompt_chain_id:'disabled',enabled:false,weight:100},{prompt_chain_id:'zero',enabled:true,weight:0},
      {prompt_chain_id:'one',enabled:true,weight:1},{prompt_chain_id:'two',enabled:true,weight:2}];
    assert.equal(pure.selectTestWorkflow(mix,()=>0.5),'two');
    assert.throws(()=>pure.selectTestWorkflow(mix.slice(0,2)),/No workflows are enabled/);
  });
  await check("manual tests can inspect disabled workflows without changing live settings",()=>{
    config.mix[0].enabled=false;
    const before=JSON.stringify(config);
    assert.ok(pure.buildChainTestPlan(config,input,ids.user,'test-model',{angleIndex:0}));
    assert.equal(JSON.stringify(config),before);
    assert.throws(()=>pure.buildChainTestPlan(config,{...input,mode:'current'},ids.user,'test-model'),/No workflows are enabled/);
  });
  await check("unsupported multi-step/provider configurations fail before a model call",()=>{
    config.steps.push({...config.steps[0],id:'another',step_order:1});
    assert.throws(()=>pure.buildChainTestPlan(config,input,ids.user,'test-model'),/exactly one/);
    config.steps.pop();config.providers[0].name='Other provider';
    assert.throws(()=>pure.buildChainTestPlan(config,input,ids.user,'test-model'),/registered Google model/);
    assert.equal(aiCalls,0);
  });
  await check("preview makes no AI call and does not mutate configuration",async()=>{
    const before=JSON.stringify(config);const result=await actions.preparePromptChainTest(input);
    assert.ok(result.plan);assert.equal(aiCalls,0);assert.equal(JSON.stringify(config),before);
  });
  await check("run returns actual provider output and usage without publishing",async()=>{
    const prepared=await actions.preparePromptChainTest(input);const output=await actions.runPromptChainTest(prepared.plan);
    assert.equal(output.source,'admin-test');assert.equal(output.modelCalled,true);assert.equal(output.validation,'passed');
    assert.equal(output.inputTokens,200);assert.equal(output.outputTokens,0);assert.equal(aiCalls,1);
    assert.equal(providerInput.input,prepared.plan.prompt);assert.equal(providerInput.store,false);
  });
  await check("client-supplied prompt is ignored; execution uses reconstructed server instructions",async()=>{
    const prepared=await actions.preparePromptChainTest(input);
    const output=await actions.runPromptChainTest({...prepared.plan,prompt:'Client replacement prompt'});
    assert.equal(output.validation,'passed');assert.equal(providerInput.input,prepared.plan.prompt);
  });
  await check("changed configuration or tampered snapshot is rejected before provider spend",async()=>{
    const prepared=await actions.preparePromptChainTest(input);
    config.steps[0].prompt='A changed instruction';
    let result=await actions.runPromptChainTest(prepared.plan);assert.match(result.error,/changed since/);assert.equal(result.modelCalled,false);
    const fresh=await actions.preparePromptChainTest(input);
    result=await actions.runPromptChainTest({...fresh.plan,fingerprint:'altered'});assert.match(result.error,/changed since/);
    assert.equal(aiCalls,0);
  });
  await check("duplicate and invalid output remain visible and fail basic caption checks",async()=>{
    const prepared=await actions.preparePromptChainTest(input);aiResult.output_text='An earlier joke';
    const result=await actions.runPromptChainTest(prepared.plan);
    assert.equal(result.validation,'rejected');assert.equal(result.response,'An earlier joke');assert.match(result.error,/repeats/);
  });
  await check("provider failures do not expose raw provider messages or credentials",async()=>{
    const prepared=await actions.preparePromptChainTest(input);aiError=Error('SECRET_PROVIDER_DETAIL');
    const result=await actions.runPromptChainTest(prepared.plan);
    assert.equal(result.modelCalled,true);assert.equal(result.validation,'not-run');assert.ok(!result.error.includes('SECRET'));
  });
  await check("image preparation failure prevents the AI call",async()=>{
    const prepared=await actions.preparePromptChainTest(input);photoError='Image is unavailable';
    const result=await actions.runPromptChainTest(prepared.plan);assert.equal(result.modelCalled,false);assert.equal(aiCalls,0);
  });
  await check("missing API key still allows preview and rejects execution clearly",async()=>{
    const prepared=await actions.preparePromptChainTest(input);delete process.env.GEMINI_API_KEY;
    const result=await actions.runPromptChainTest(prepared.plan);assert.match(result.error,/not configured/);assert.equal(aiCalls,0);
    process.env.GEMINI_API_KEY='test-only-not-a-real-key';
  });
  await check("non-admins cannot preview/run and another admin cannot reuse the snapshot",async()=>{
    const prepared=await actions.preparePromptChainTest(input);
    actor={error:'Only superadmins can do this.'};assert.ok((await actions.preparePromptChainTest(input)).error);
    assert.ok((await actions.runPromptChainTest(prepared.plan)).error);
    actor={supabase:{},user:{id:'different-admin'}};
    assert.match((await actions.runPromptChainTest(prepared.plan)).error,/invalid/);assert.equal(aiCalls,0);
  });
  console.log(`\n${checks} prompt-chain test checks passed.`);
} finally {
  if(savedKey===undefined) delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=savedKey;
  if(savedModel===undefined) delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=savedModel;
}
