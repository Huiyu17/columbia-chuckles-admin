// Real React DOM regression checks in headless Chromium. Server calls are mocked;
// this never signs in, connects to Supabase, or changes production records.
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch {
  playwright = require(path.join(process.env.USERPROFILE, ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright"));
}

// Bundle installed React and the actual TSX component without adding a test
// framework or a temporary route to the application.
const modules = [], registered = new Map();
const virtual = {
  "next/link": "exports.__esModule=true; exports.default=p=>require('react').createElement('a',{href:p.href,className:p.className},p.children);",
  "next/navigation": "exports.useRouter = () => ({ refresh: () => window.refreshRecord() });",
  "next/image": "exports.__esModule = true; exports.default = function ImageStub(p) { return require('react').createElement('img', {src:p.src,alt:p.alt,width:p.width,height:p.height}); };",
  "@/app/actions/resources": "exports.saveResource = (_, operation, id, payload) => window.saveRecord(operation, id, payload); exports.uploadAdminImage = async form => window.uploadImage ? window.uploadImage(form) : ({error: 'Not used in this test'});",
  "@/app/actions/reference-options": "exports.searchReferenceOptions = (...args) => window.searchChoices(...args);",
  "@/app/actions/prompt-chain-test": "exports.preparePromptChainTest = input => window.prepareChainTest(input); exports.runPromptChainTest = plan => window.runChainTest(plan);",
};
async function add(filename, source) {
  if (registered.has(filename)) return registered.get(filename);
  const id = modules.length; registered.set(filename, id); modules.push(null);
  source ??= await readFile(filename, "utf8");
  const code = filename.endsWith(".ts") || filename.endsWith(".tsx")
    ? ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText
    : source;
  const deps = {};
  for (const [, request] of code.matchAll(/require\(["']([^"']+)["']\)/g)) {
    if (virtual[request]) deps[request] = await add(request, virtual[request]);
    else {
      let resolved;
      if (request.startsWith("@/")) resolved = path.join(root, `${request.slice(2)}.ts`);
      else {
        try { resolved = createRequire(path.isAbsolute(filename) ? filename : path.join(root, "package.json")).resolve(request); }
        catch (error) {
          if (!request.startsWith(".")) throw error;
          for (const suffix of [".ts", ".tsx"]) {
            const candidate = path.resolve(path.dirname(filename), `${request}${suffix}`);
            try { await access(candidate); resolved = candidate; break; } catch { /* Try next source extension. */ }
          }
          if (!resolved) throw error;
        }
      }
      deps[request] = await add(resolved);
    }
  }
  modules[id] = `[function(require,module,exports){${code}\n},${JSON.stringify(deps)}]`;
  return id;
}
const entry = await add(path.join(root, "editor-test-entry.ts"), `
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import ResourceEditor from './components/ResourceEditor.tsx';
  import RecordIdentifier from './components/RecordIdentifier.tsx';
  import RefreshStatusesButton from './components/RefreshStatusesButton.tsx';
  import PromptChainTestPanel from './components/PromptChainTestPanel.tsx';
  import PromptChainMix from './components/PromptChainMix.tsx';
  import GenerationRequestsTable from './components/GenerationRequestsTable.tsx';
  import ConfigurationRow from './components/ConfigurationRow.tsx';
  import ImagesGallery from './components/ImagesGallery.tsx';
  const columns = [
    {name:'id',type:'uuid',primary:true,required:true},
    {name:'enabled',type:'boolean',required:true},
    {name:'weight',type:'numeric',required:true},
    {name:'note',type:'text',required:false},
  ].map(c => ({default_value:null,generated:false,primary:false,...c}));
  window.record = {id:'5faf8067-a61b-4183-9f86-2844a3f7f1ae',enabled:false,weight:1,note:'Original note'};
  window.secondID = '5faf8067-0000-4000-8000-000000000002';
  window.showSecondID = false;
  window.failSave = false;
  window.creating = false;
  window.showReferences = false;
  window.showChainTest = false;
  const root = createRoot(document.getElementById('root'));
  window.refreshRecord = () => { window.refreshCalls = (window.refreshCalls ?? 0) + 1; root.render(React.createElement(React.Fragment,null,
    React.createElement('pre', {id:'saved-record'}, JSON.stringify(window.record)),
    React.createElement(RecordIdentifier, {id:window.record.id}),
    window.showSecondID ? React.createElement(RecordIdentifier, {id:window.secondID}) : null,
    React.createElement(RefreshStatusesButton),
    React.createElement(ResourceEditor, {resource:'prompt-chain-mix',mode:'update',columns,
      row:window.creating ? undefined : window.record}),
    React.createElement('section', {id:'reference-fixture'}, window.showReferences
      ? React.createElement(ResourceEditor, {key:window.referenceRevision,resource:window.referenceResource,mode:'crud',columns:window.referenceColumns,
        row:window.referenceCreating ? undefined : window.referenceRecord,choices:window.referenceChoices}) : null),
    React.createElement('section', {id:'chain-test-fixture'}, window.showChainTest
      ? React.createElement(PromptChainTestPanel,{key:window.chainTestKey,workflows:window.chainChoices,images:window.chainImages,workflowId:window.chainWorkflowId}) : null),
    React.createElement('section', {id:'mix-fixture'}, window.showMix ? React.createElement(PromptChainMix,{chains:window.mixChains,rows:window.mixRows}) : null),
    React.createElement('section', {id:'requests-fixture'}, window.showRequests ? React.createElement(GenerationRequestsTable,window.requestProps) : null),
    React.createElement('table',{id:'configuration-fixture',className:'configuration-table',style:{width:'1100px'}},window.showConfiguration ? React.createElement('tbody',null,React.createElement(ConfigurationRow,{columns:4,variant:'provider',editor:React.createElement(ResourceEditor,{resource:'llm-providers',mode:'crud',columns:[{name:'id',type:'uuid',primary:true,required:true,generated:false,default_value:null},{name:'name',type:'text',primary:false,required:true,generated:false,default_value:null}],row:{id:'provider-fixture',name:'Google'}})},React.createElement('td',null,'Google'),React.createElement('td',null,'1'),React.createElement('td',null,'Created today'))) : null),
    React.createElement('section',{id:'images-fixture'},window.showImages?React.createElement(ImagesGallery,window.imageProps):null))); };
  window.saveRecord = async (operation, id, payload) => {
    window.lastSavedId = id;
    window.lastSavedPayload = payload;
    await new Promise(r => setTimeout(r, 10));
    if(window.failSave) return {error:'Database rejected this change'};
    if(window.showReferences) {
      window.referenceRecord = {...window.referenceRecord,...payload};
      for(const field of Object.keys(window.referenceChoices)) {
        window.referenceChoices[field].selected = window.referenceAllOptions.filter(option => option.id === payload[field]);
      }
    } else window.record = {...window.record,...payload,weight:Number(payload.weight)};
    window.refreshRecord();
    return {success:true};
  };
  window.refreshRecord();
`);
const bundle = `(()=>{const process={env:{NODE_ENV:'development'}}; const modules=[${modules.join(",")}];const cache={};function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};const [fn,deps]=modules[id];fn(name=>load(deps[name]),module,module.exports);return module.exports;}load(${entry});})();`;
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
try { await access(playwright.chromium.executablePath()); }
catch {
  // The runtime may provide Chromium separately from the Playwright package.
  const cache = path.join(process.env.LOCALAPPDATA, "ms-playwright");
  const installed = (await readdir(cache)).filter(name => name.startsWith("chromium_headless_shell-")).sort().at(-1);
  if (installed) executablePath ??= path.join(cache, installed, "chrome-headless-shell-win64/chrome-headless-shell.exe");
}
const browser = await playwright.chromium.launch({ headless: true, executablePath });
let checks = 0;
try {
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  const errors = []; page.on("pageerror", error => { errors.push(error.message); console.error(error.message); });
  page.setDefaultTimeout(10000);
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => document.querySelector('select[name="enabled"]'), { timeout: 5000 })
    .catch(error => { throw new Error(`${error.message}\n${errors.join("\n")}`); });
  const enabled = page.locator('select[name="enabled"]');
  const weight = page.locator('[name="weight"]');
  const note = page.locator('[name="note"]');
  const nullable = page.locator('input[name="null:note"]');
  const save = () => page.getByRole("button", { name: "Save changes", exact: true }).click();
  const saved = () => page.getByRole("status").filter({ hasText: "Saved successfully." }).waitFor();
  async function check(name, fn) { await fn(); console.log(`ok ${++checks} - ${name}`); }

  const copy = page.getByRole('button', {name:'Copy complete record ID',exact:true}).first();
  await check("refresh statuses requests fresh server data without modifying the record", async () => {
    const before = await page.evaluate(() => ({ calls:window.refreshCalls, record:JSON.stringify(window.record) }));
    await page.getByRole('button', {name:'Refresh generation and caption statuses'}).click();
    assert.equal(await page.evaluate(() => window.refreshCalls), before.calls + 1);
    assert.equal(await page.evaluate(() => JSON.stringify(window.record)), before.record);
  });
  await check("short ID shows eight characters plus ellipsis and copying uses the complete UUID", async () => {
    assert.equal(await page.locator('.record-short-id').textContent(), 'ID: 5faf8067…');
    await page.evaluate(() => {
      window.copiedIDs = [];
      Object.defineProperty(navigator, 'clipboard', {configurable:true,value:{writeText:async text => {window.copiedIDs.push(text);}}});
    });
    await copy.click();
    await page.waitForFunction(() => document.querySelector('.record-id-copy').textContent === 'Copied');
    assert.deepEqual(await page.evaluate(() => window.copiedIDs), ['5faf8067-a61b-4183-9f86-2844a3f7f1ae']);
    assert.equal(await page.evaluate(() => window.lastSavedId), undefined);
    await page.waitForFunction(() => document.querySelector('.record-id-copy').textContent === 'Copy ID');
  });
  await check("clipboard permission failure gives visible guidance and supports retry", async () => {
    await page.evaluate(() => {navigator.clipboard.writeText = async () => {throw Error('Permission denied');};});
    await copy.click();
    await page.getByRole('status').filter({hasText:'Could not copy'}).waitFor();
    assert.equal(await copy.textContent(), 'Copy ID');
    await page.evaluate(() => {navigator.clipboard.writeText = async text => {window.copiedIDs.push(text);};});
    await copy.click();
    await page.getByRole('status').filter({hasText:'Complete ID copied.'}).waitFor();
  });
  await check("unavailable clipboard gives guidance instead of throwing", async () => {
    await page.evaluate(() => {Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});});
    await copy.click(); await page.getByRole('status').filter({hasText:'Could not copy'}).waitFor();
  });
  await check("cards with identical short IDs copy their own complete keys independently", async () => {
    await page.evaluate(() => {
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text => {window.copiedIDs.push(text);}}});
      window.showSecondID = true; window.refreshRecord();
    });
    const secondCopy = page.getByRole('button',{name:'Copy complete record ID',exact:true}).nth(1);
    await secondCopy.click();
    await page.waitForFunction(() => document.querySelectorAll('.record-id-copy')[1].textContent === 'Copied');
    assert.equal(await copy.textContent(),'Copy ID');
    assert.equal(await page.evaluate(() => window.copiedIDs.at(-1)), '5faf8067-0000-4000-8000-000000000002');
    assert.deepEqual(await page.locator('.record-short-id').allTextContents(),['ID: 5faf8067…','ID: 5faf8067…']);
    await page.evaluate(() => {window.showSecondID = false; window.refreshRecord();});
  });

  await check("saving False → True synchronizes editor and record without reloading", async () => {
    await enabled.selectOption("true"); await save(); await saved();
    assert.equal(await enabled.inputValue(), "true");
    assert.equal(await page.evaluate(() => window.record.enabled), true);
    assert.equal(await page.evaluate(() => window.lastSavedId), '5faf8067-a61b-4183-9f86-2844a3f7f1ae');
  });
  await check("saving True → False works on the same mounted editor", async () => {
    await enabled.selectOption("false"); await save(); await saved();
    assert.equal(await enabled.inputValue(), "false");
    assert.equal(await page.evaluate(() => window.record.enabled), false);
  });
  await check("text, numeric and nullable fields show newly saved values", async () => {
    await weight.fill("2"); await note.fill("Updated note"); await save(); await saved();
    assert.equal(await weight.inputValue(), "2"); assert.equal(await note.inputValue(), "Updated note");
    await nullable.check(); await save(); await saved();
    assert.equal(await nullable.isChecked(), true); assert.equal(await note.inputValue(), "");
    assert.equal(await page.evaluate(() => window.record.note), null);
  });
  await check("fresh server record values replace old defaults while preserving success feedback", async () => {
    await page.evaluate(() => { window.record = {...window.record,enabled:true,weight:3,note:'Refreshed note'}; window.refreshRecord(); });
    await page.waitForFunction(() => document.querySelector('[name="weight"]').value === '3');
    assert.equal(await enabled.inputValue(), "true"); assert.equal(await note.inputValue(), "Refreshed note");
    assert.equal(await nullable.isChecked(), false); await saved();
  });
  await check("failed save keeps unsaved input and leaves displayed record unchanged", async () => {
    await page.evaluate(() => { window.failSave = true; });
    await enabled.selectOption("false"); await note.fill("Keep this unsaved note"); await save();
    await page.getByRole("status").filter({ hasText: "Database rejected" }).waitFor();
    assert.equal(await enabled.inputValue(), "false"); assert.equal(await note.inputValue(), "Keep this unsaved note");
    assert.equal(await page.evaluate(() => window.record.enabled), true);
    assert.equal(await page.evaluate(() => window.record.note), "Refreshed note");
  });
  await check("create form clears fields only after a successful save", async () => {
    await page.evaluate(() => { window.failSave = false; window.creating = true; window.refreshRecord(); });
    await enabled.selectOption("true"); await weight.fill("4"); await note.fill("New record");
    await page.getByRole("button", { name: "Create record", exact: true }).click(); await saved();
    assert.equal(await note.inputValue(), ""); assert.equal(await enabled.inputValue(), "true");
  });
  const reference = page.locator('#reference-fixture');
  async function referenceFixture(field, options, current, required = true, resource = 'prompt-chain-mix') {
    await page.evaluate(({field, options, current, required, resource}) => {
      window.referenceRevision = (window.referenceRevision ?? 0) + 1;
      window.showReferences = true; window.failSave = false; window.referenceResource = resource;
      window.referenceCreating = false;
      window.referenceColumns = [
        {name:'id',type:'uuid',primary:true,required:true,generated:false,default_value:null},
        {name:field,type:'uuid',primary:false,required,generated:false,default_value:null},
      ];
      window.referenceRecord = {id:'picker-record',[field]:current};
      window.referenceAllOptions = options;
      window.referenceChoices = {[field]:{options:options.slice(0,25),selected:options.filter(o => o.id === current),total:options.length,page:1}};
      window.lookupCalls = []; window.failLookup = false;
      window.searchChoices = async (key, name, query, pageNumber, selectedId) => {
        window.lookupCalls.push({key,name,query,pageNumber,selectedId});
        if(window.failLookup) return {options:[],selected:[],total:0,page:1,error:'Choices temporarily unavailable'};
        const filtered = window.referenceAllOptions.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
        return {options:filtered.slice((pageNumber-1)*25,pageNumber*25),selected:window.referenceAllOptions.filter(o=>o.id===selectedId),total:filtered.length,page:pageNumber};
      };
      window.refreshRecord();
    }, {field, options, current, required, resource});
  }
  const firstWorkflow = {id:'70000000-0000-4000-8000-000000000001',label:'Grounded campus caption',description:'Prompt chain'};
  const secondWorkflow = {id:'70000000-0000-4000-8000-000000000003',label:'Alternative campus caption'};
  await check("workflow selection uses names in a dropdown and saves the complete related ID", async () => {
    await referenceFixture('prompt_chain_id',[firstWorkflow,secondWorkflow],firstWorkflow.id);
    const workflow = reference.getByLabel('Prompt chain',{exact:true});
    assert.equal(await reference.locator('input[name="prompt_chain_id"],textarea[name="prompt_chain_id"]').count(),0);
    await workflow.selectOption({label:'Alternative campus caption'});
    await reference.getByRole('button',{name:'Save changes',exact:true}).click();
    await reference.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();
    assert.equal(await page.evaluate(() => window.lastSavedPayload.prompt_chain_id),secondWorkflow.id);
    assert.equal(await workflow.inputValue(),secondWorkflow.id);
  });
  await check("reference search finds choices beyond the first page without changing the current value", async () => {
    const options = [firstWorkflow,...Array.from({length:24},(_,i)=>({id:`80000000-0000-4000-8000-${String(i).padStart(12,'0')}`,label:`Workflow ${i}`})),secondWorkflow];
    await referenceFixture('prompt_chain_id',options,firstWorkflow.id);
    const search = reference.getByRole('searchbox',{name:'Search prompt chains'});
    await search.fill('Alternative');
    await reference.getByRole('option',{name:'Alternative campus caption'}).waitFor({state:'attached'});
    assert.equal(await reference.getByLabel('Prompt chain',{exact:true}).inputValue(),firstWorkflow.id);
    const before = await page.evaluate(() => window.lastSavedPayload);
    await search.press('Enter');
    assert.deepEqual(await page.evaluate(() => window.lastSavedPayload),before);
    await reference.getByLabel('Prompt chain',{exact:true}).selectOption({label:'Alternative campus caption'});
    await search.fill('');
    assert.equal(await reference.getByLabel('Prompt chain',{exact:true}).inputValue(),secondWorkflow.id);
  });
  await check("loading more reference options keeps the existing selection", async () => {
    const options = [firstWorkflow,...Array.from({length:24},(_,i)=>({id:`81000000-0000-4000-8000-${String(i).padStart(12,'0')}`,label:`Workflow ${i}`})),secondWorkflow];
    await referenceFixture('prompt_chain_id',options,firstWorkflow.id);
    await reference.getByRole('button',{name:'Load more prompt chains'}).click();
    await reference.getByRole('option',{name:'Alternative campus caption'}).waitFor({state:'attached'});
    assert.equal(await reference.getByLabel('Prompt chain',{exact:true}).inputValue(),firstWorkflow.id);
  });
  await check("lookup failure and retry preserve the saved reference instead of silently clearing it", async () => {
    await referenceFixture('llm_model_id',[{...firstWorkflow,label:'Google'},{...secondWorkflow,label:'Other provider'}],firstWorkflow.id,true,'llm-models');
    await page.evaluate(() => {window.failLookup=true;});
    await reference.getByRole('searchbox',{name:'Search models'}).fill('Other');
    await reference.getByRole('button',{name:'Retry choices'}).waitFor();
    assert.equal(await reference.getByLabel('AI model',{exact:true}).inputValue(),firstWorkflow.id);
    await page.evaluate(() => {window.failLookup=false;});
    await reference.getByRole('button',{name:'Retry choices'}).click();
    await reference.getByRole('option',{name:'Other provider'}).waitFor({state:'attached'});
    assert.equal(await reference.getByLabel('AI model',{exact:true}).inputValue(),firstWorkflow.id);
  });
  await check("optional image and owner references can be cleared by choosing None", async () => {
    for(const [field,resource,label] of [['image_id','generation-examples','Image'],['user_id','images','Owner']]) {
      await referenceFixture(field,[{...firstWorkflow,label:field==='image_id'?'Sleepy student':'Campus Creator (creator@example.edu)'}],firstWorkflow.id,false,resource);
      assert.equal(await reference.locator(`input[name="null:${field}"]`).count(),0);
      if(field==='image_id') assert.equal(await reference.getByRole('searchbox').count(),0);
      await reference.getByLabel(label,{exact:true}).selectOption('');
      await reference.getByRole('button',{name:'Save changes',exact:true}).click();
      await reference.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();
      assert.equal(await page.evaluate(name => window.lastSavedPayload[name],field),null);
      assert.equal(await reference.getByLabel(label,{exact:true}).inputValue(),'');
    }
  });
  await check("missing saved references remain selected and required choices cannot be submitted empty", async () => {
    await referenceFixture('provider_id',[],firstWorkflow.id,true,'llm-models');
    const provider = reference.getByLabel('AI provider',{exact:true});
    assert.equal(await provider.inputValue(),firstWorkflow.id);
    assert.equal(await reference.getByRole('option',{name:'Previously selected provider (unavailable)'}).count(),1);
    await provider.selectOption('');
    assert.equal(await provider.evaluate(element => element.validity.valueMissing),true);
  });
  await check("late search responses cannot overwrite newer search results", async () => {
    await referenceFixture('llm_model_id',[{...firstWorkflow,label:'Google'}],firstWorkflow.id,true,'llm-models');
    await page.evaluate(() => {
      window.firstSearchStarted=false;window.firstSearchFinished=false;
      window.searchChoices=async(key,name,query)=>{
        if(query==='first') {window.firstSearchStarted=true;await new Promise(resolve=>setTimeout(resolve,800));window.firstSearchFinished=true;}
        return {options:[{id:query==='first'?'first-result':'second-result',label:query==='first'?'First result':'Second result'}],selected:[],total:1,page:1};
      };
    });
    const search=reference.getByRole('searchbox',{name:'Search models'});
    await search.fill('first');await page.waitForFunction(()=>window.firstSearchStarted);
    await search.fill('second');await reference.getByRole('option',{name:/Second result/}).waitFor({state:'attached'});
    await page.waitForFunction(()=>window.firstSearchFinished);
    assert.equal(await reference.getByRole('option',{name:/First result/}).count(),0);
    assert.equal(await reference.getByLabel('AI model',{exact:true}).inputValue(),firstWorkflow.id);
  });
  await check("successful creation resets the controlled reference selector as well as text fields", async () => {
    await referenceFixture('provider_id',[{...firstWorkflow,label:'Google'}],null,true,'llm-models');
    await page.evaluate(()=>{window.referenceCreating=true;window.refreshRecord();});
    const provider=reference.getByLabel('AI provider',{exact:true});
    assert.equal(await reference.getByRole('searchbox').count(),0);
    assert.equal(await reference.getByRole('link',{name:/View selected provider/}).count(),0);
    await provider.selectOption({label:'Google'});
    await reference.getByRole('button',{name:'Create record',exact:true}).click();
    await reference.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();
    assert.equal(await page.evaluate(()=>window.lastSavedPayload.provider_id),firstWorkflow.id);
    assert.equal(await provider.inputValue(),'');
  });
  const testPanel=page.locator('#chain-test-fixture');
  async function chainTestFixture() {
    await page.evaluate(()=>{
      window.showReferences=false;window.showChainTest=true;window.chainTestKey=(window.chainTestKey??0)+1;
      window.chainWorkflowId='70000000-0000-4000-8000-000000000001';
      window.chainChoices={options:[{id:window.chainWorkflowId,label:'Grounded campus caption'}],selected:[],total:1,page:1};
      window.chainImages={options:[{id:'80000000-0000-4000-8000-000000000001',label:'A sleepy student'}],selected:[],total:1,page:1};
      window.previewCalls=[];window.testCalls=[];window.testFailure=false;window.prepareFailure=false;
      window.prepareChainTest=async input=>{
        window.previewCalls.push(input);
        if(window.prepareFailure) return {error:'No workflows are enabled. Choose a specific workflow.'};
        return {plan:{input,actorId:'admin',angleIndex:0,fingerprint:'snapshot',workflow:{id:window.chainWorkflowId,name:'Grounded campus caption'},
          step:{id:'step',order:0,instruction:'Write a caption grounded in this photo.'},model:{id:'model',name:'test-model',provider:'Google'},
          image:{id:input.imageId,url:'',description:'A sleepy student',usesPhoto:false},selection:{mode:input.mode,enabled:false,weight:1,eligibleCount:0},
          basePrompt:'Shared caption rules',prompt:'Shared caption rules. Write a caption grounded in this photo.',recentCaptionCount:0}};
      };
      window.runChainTest=async plan=>{
        window.testCalls.push(plan);await new Promise(resolve=>setTimeout(resolve,700));
        return {source:'admin-test',modelCalled:true,response:window.testFailure?'':'A test caption from the model.',
          error:window.testFailure?'The AI service could not complete this test.':undefined,latencyMs:650,inputTokens:120,outputTokens:8,
          validation:window.testFailure?'not-run':'passed'};
      };
      window.refreshRecord();
    });
    await testPanel.getByLabel('Image',{exact:true}).selectOption({label:'A sleepy student'});
    await testPanel.getByRole('textbox',{name:'Scene',exact:true}).fill('Waiting outside the library');
  }
  await check("Test run previews actual instructions without calling the model",async()=>{
    await chainTestFixture();
    assert.equal(await page.evaluate(()=>window.previewCalls.length),0);
    await testPanel.getByRole('button',{name:'Preview prompt only'}).click();
    await testPanel.getByRole('status').filter({hasText:'Preview ready'}).waitFor();
    assert.equal(await page.evaluate(()=>window.testCalls.length),0);
    assert.ok((await testPanel.textContent()).includes('Write a caption grounded in this photo.'));
    assert.equal(await testPanel.locator('.test-stage').count(),4);
  });
  await check("running a preview visualizes the live model phase and displays response/usage without publishing",async()=>{
    await testPanel.getByRole('button',{name:'Run test',exact:true}).click();
    await testPanel.getByRole('status').filter({hasText:'Waiting for the model'}).waitFor();
    await testPanel.getByText('A test caption from the model.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>window.previewCalls.length),1);
    assert.equal(await page.evaluate(()=>window.testCalls.length),1);
    assert.ok((await testPanel.textContent()).includes('120'));assert.ok((await testPanel.textContent()).includes('Passed'));
    assert.equal(await testPanel.getByRole('button',{name:/Publish/}).count(),0);
  });
  await check("changing scene invalidates the previous preview and run result",async()=>{
    await testPanel.getByRole('textbox',{name:'Scene',exact:true}).fill('A different library scene');
    assert.equal(await testPanel.getByText('A test caption from the model.',{exact:true}).count(),0);
    await testPanel.getByRole('button',{name:'Preview prompt only'}).click();
    await testPanel.getByRole('status').filter({hasText:'Preview ready'}).waitFor();
    assert.equal(await page.evaluate(()=>window.previewCalls.at(-1).scene),'A different library scene');
  });
  await check("test preparation/provider failures are visible and never fabricated as successful output",async()=>{
    await chainTestFixture();await page.evaluate(()=>{window.prepareFailure=true;});
    await testPanel.getByRole('button',{name:'Run test',exact:true}).click();
    await testPanel.getByRole('alert').filter({hasText:'No workflows are enabled'}).waitFor();
    assert.equal(await page.evaluate(()=>window.testCalls.length),0);
    await page.evaluate(()=>{window.prepareFailure=false;window.testFailure=true;});
    await testPanel.getByRole('button',{name:'Run test',exact:true}).click();
    await testPanel.getByRole('alert').filter({hasText:'AI service could not complete'}).waitFor();
    assert.equal(await testPanel.getByText('A test caption from the model.',{exact:true}).count(),0);
  });
  await check("independent mix previews proportions and saves full record IDs together", async () => {
    await page.evaluate(() => {
      window.showMix=true;
      window.mixChains=[{id:'chain-a',name:'Chain A'},{id:'chain-b',name:'Chain B'}];
      window.mixRows=[{id:'mix-a-full',prompt_chain_id:'chain-a',enabled:true,weight:1},{id:'mix-b-full',prompt_chain_id:'chain-b',enabled:true,weight:1}];
      window.mixWrites=[];
      window.saveRecord=async (_,id,payload)=>{window.mixWrites.push({id,payload});return {success:true};};
      window.refreshRecord();
    });
    const mix=page.locator('#mix-fixture');
    assert.equal(await mix.getByText('50.0%',{exact:true}).count(),2);
    assert.equal(await mix.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);
    await mix.getByLabel('Weight for Chain A',{exact:true}).fill('2');
    await mix.getByText('Unsaved changes.',{exact:false}).waitFor();
    assert.equal(await mix.getByText('50.0%',{exact:true}).count(),2);
    assert.equal(await mix.getByText('66.7%',{exact:true}).count(),1);
    assert.equal(await mix.getByText('33.3%',{exact:true}).count(),1);
    await mix.getByRole('button',{name:'Discard changes',exact:true}).click();
    assert.equal(await mix.getByLabel('Weight for Chain A',{exact:true}).inputValue(),'1');
    assert.equal(await mix.getByRole('columnheader',{name:'Preview chance',exact:true}).count(),0);
    await mix.getByLabel('Weight for Chain A',{exact:true}).fill('2');
    await mix.getByRole('button',{name:'Save changes',exact:true}).click();
    await mix.getByRole('status').filter({hasText:'Saved successfully'}).waitFor();
    assert.equal(await mix.getByRole('button',{name:'Save changes',exact:true}).isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=>window.mixWrites),[{id:'mix-a-full',payload:{enabled:true,weight:2}},{id:'mix-b-full',payload:{enabled:true,weight:1}}]);
    await mix.getByLabel('Enable Chain B',{exact:true}).uncheck();
    assert.equal(await mix.getByText('100.0%',{exact:true}).count(),1);
    await mix.getByLabel('Enable Chain A',{exact:true}).uncheck();
    await mix.getByText('No chain is selected.',{exact:false}).waitFor();
  });
  await check("request table filters chain/model/style/status and shows readable output details",async()=>{
    await page.evaluate(()=>{
      window.showRequests=true;
      window.requestProps={query:'',chains:[{id:'a',name:'Chain A'},{id:'b',name:'Chain B'}],images:[{id:'photo',url:'https://example.com/image.png',alt_text:'Sleepy student'}],users:{user:{first_name:'Campus',last_name:'Creator'}},
        rows:[{id:'request-a',prompt_chain_id:'a',user_id:'user',image_id:'photo',status:'completed',created_at:'2026-10-30T12:00:00Z',request:{context:'Library morning',model:'Gemini A',style:'absurd',prompt:'Actual prompt instructions'}},
          {id:'request-b',prompt_chain_id:'b',status:'failed',created_at:'2026-10-29T12:00:00Z',request:{context:'Dorm evening',model:'Gemini B',style:'deadpan'}}],
        states:{'request-a':{state:'published',label:'Published',description:'Visible on main site',href:'/media/caption-a'},'request-b':{state:'not-created',label:'Not created',description:'No preview created'}},
        responses:[{id:'response-a',generation_request_id:'request-a',response:'A real funny caption',latency_ms:1234,input_tokens:0,output_tokens:12}]};
      window.refreshRecord();
    });
    const table=page.locator('#requests-fixture');
    for(const [label,value] of [['Prompt chain','a'],['Model','Gemini A'],['Style','absurd'],['Generation status','completed'],['Caption status','published']])await table.getByLabel(label,{exact:true}).selectOption(value);
    assert.equal(await table.locator('tbody > tr').count(),1);
    await table.getByRole('button',{name:'View details',exact:true}).click();
    assert.equal(await table.getByText('A real funny caption',{exact:true}).count(),0);
    assert.equal(await table.getByText('Visible on main site',{exact:true}).count(),0);
    assert.equal(await table.getByRole('link',{name:'View model response',exact:false}).getAttribute('href'),'/manage/llm-responses?request=request-a');
    assert.equal(await table.getByRole('link',{name:'View caption in AI media',exact:false}).getAttribute('href'),'/media/caption-a');
    assert.equal(await table.getByRole('img',{name:'Sleepy student'}).count(),1);
    assert.equal(await table.getByText('Campus Creator',{exact:true}).count(),1);
    assert.equal(await table.getByText('View full record',{exact:true}).count(),0);
    await table.getByLabel('Generation status',{exact:true}).selectOption('failed');
    await table.getByText('No requests match these filters.',{exact:true}).waitFor();
  });
  await check("response table shows actual output and usage with request/caption navigation",async()=>{
    await page.addStyleTag({content:await readFile(path.join(root,'app/globals.css'),'utf8')});
    await page.evaluate(()=>{
      const props=window.requestProps, request=props.rows[0], response=props.responses[0];
      window.requestProps={...props,key:'responses',responseView:true,query:'request-a',rows:[{...request,id:response.id,generation_request_id:request.id,responseRecord:response}],states:{[response.id]:props.states[request.id]}};
      window.refreshRecord();
    });
    const table=page.locator('#requests-fixture');
    const before=await table.locator('tbody > tr').first().locator('td').evaluateAll(cells=>cells.map(cell=>({x:cell.getBoundingClientRect().x,width:cell.getBoundingClientRect().width})));
    await table.getByRole('button',{name:'View details',exact:true}).click();
    const after=await table.locator('tbody > tr').first().locator('td').evaluateAll(cells=>cells.map(cell=>({x:cell.getBoundingClientRect().x,width:cell.getBoundingClientRect().width})));
    before.forEach((cell,index)=>{assert.ok(Math.abs(cell.x-after[index].x)<1);assert.ok(Math.abs(cell.width-after[index].width)<1);});
    assert.equal(await table.getByLabel('Search responses',{exact:true}).inputValue(),'');
    assert.equal(await table.getByText('Responses for the selected request',{exact:true}).count(),1);
    assert.ok((await table.textContent()).includes('In: 0'));
    assert.equal(await table.getByText('A real funny caption',{exact:true}).count(),1);
    assert.equal(await table.getByRole('link',{name:'View generation request',exact:false}).getAttribute('href'),'/manage/generation-requests?record=request-a');
    await table.getByLabel('Model',{exact:true}).selectOption('Gemini A');
    assert.equal(await table.getByRole('button',{name:'Close',exact:true}).count(),1);
    assert.equal(await table.getByRole('columnheader',{name:'Photo',exact:true}).count(),0);
    assert.equal(await table.getByRole('columnheader',{name:'User',exact:true}).count(),0);
    assert.equal(await table.getByLabel('Caption status',{exact:true}).count(),0);
    assert.equal(await table.getByLabel('Style',{exact:true}).count(),0);
    await table.getByLabel('Result',{exact:true}).selectOption('Returned');
    assert.equal(await table.getByRole('columnheader').count(),6);
  });
  await check("configuration editing expands a full-width row without moving original cells",async()=>{
    await page.addStyleTag({content:await readFile(path.join(root,'app/globals.css'),'utf8')});
    await page.setViewportSize({width:1400,height:900});
    await page.evaluate(()=>{window.showConfiguration=true;window.refreshRecord();});
    const table=page.locator('#configuration-fixture');
    const before=await table.locator('tbody > tr').first().locator('td').first().boundingBox();
    await table.getByRole('button',{name:'Edit',exact:true}).click();
    const after=await table.locator('tbody > tr').first().locator('td').first().boundingBox();
    assert.ok(Math.abs(before.width-after.width)<1);
    const nameBox=await table.getByLabel('Name',{exact:true}).boundingBox();
    const saveBox=await table.getByRole('button',{name:'Save changes',exact:true}).boundingBox();
    const deleteBox=await table.getByRole('button',{name:'Delete record',exact:true}).boundingBox();
    assert.ok(saveBox.x>nameBox.x+nameBox.width);assert.ok(deleteBox.x>saveBox.x);
    assert.ok(Math.abs(saveBox.y-deleteBox.y)<2);
    assert.equal(await table.locator('tbody > tr').count(),2);
    assert.equal(await table.locator('tbody > tr').first().locator('td').count(),4);
    assert.equal(await table.locator('tbody > tr').nth(1).locator('td').getAttribute('colspan'),'4');
    await table.getByLabel('Name',{exact:true}).fill('Edited provider');
    await table.getByRole('button',{name:'Close',exact:true}).click();
    assert.equal(await table.locator('tbody > tr').count(),1);
    assert.equal(await table.getByLabel('Name',{exact:true}).count(),0);
  });
  await check("images support owner/name filters and caption links without editable file locations",async()=>{
    await page.evaluate(()=>{
      window.showImages=true;
      const columns=[{name:'id',type:'uuid',primary:true,required:true},{name:'url',type:'text',required:true},{name:'storage_path',type:'text',required:false},{name:'alt_text',type:'text',required:true},{name:'user_id',type:'uuid',required:false}].map(c=>({default_value:null,generated:false,primary:false,...c}));
      window.imageProps={query:'',selected:'',columns,choices:{user_id:{options:[{id:'user-one',label:'Campus Creator'}],selected:[],total:1,page:1}},rows:[{id:'image-one',url:'https://example.com/photo.png',storage_path:'private/system-path',user_id:'user-one',alt_text:'Sleepy student'},{id:'image-two',url:'https://example.com/preset.png',user_id:null,alt_text:'Happy student'}]};
      window.saveRecord=async(_,id,payload)=>{window.imageSaved={id,payload};return {success:true};};
      window.refreshRecord();
    });
    const gallery=page.locator('#images-fixture');
    await gallery.getByLabel('Uploaded by',{exact:true}).selectOption('user-one');
    assert.equal(await gallery.locator('.image-uploader .avatar').count(),1);
    assert.equal(await gallery.getByRole('link',{name:'Campus Creator',exact:true}).getAttribute('href'),'/users/user-one');
    assert.equal(await gallery.locator('article').count(),1);
    assert.equal(await gallery.getByRole('link',{name:'View captions',exact:false}).getAttribute('href'),'/media?image=image-one');
    await gallery.getByLabel('Search images',{exact:true}).fill('Campus Creator');
    assert.equal(await gallery.locator('article').count(),1);
    await gallery.getByRole('button',{name:'Edit',exact:true}).click();
    assert.equal(await gallery.locator('input[name="url"],input[name="storage_path"]').count(),0);
    assert.equal(await gallery.getByRole('searchbox').count(),0);
    assert.equal(await gallery.getByRole('link',{name:/View selected user/}).count(),0);
    await gallery.locator('article').getByLabel('Image description',{exact:true}).fill('Resting student');
    await gallery.getByRole('button',{name:'Save changes',exact:true}).click();
    await gallery.getByRole('status').filter({hasText:'Saved successfully.'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.imageSaved),{id:'image-one',payload:{alt_text:'Resting student',user_id:'user-one'}});
  });
  await check("image cards align and successful upload feedback clears automatically",async()=>{
    const gallery=page.locator('#images-fixture');
    await gallery.getByLabel('Search images',{exact:true}).fill('');
    await gallery.getByLabel('Uploaded by',{exact:true}).selectOption('');
    assert.equal(await gallery.getByRole('option',{name:'Sample photos',exact:true}).count(),1);
    await gallery.getByRole('button',{name:'Close',exact:true}).click();
    const boxes=await gallery.locator('article').evaluateAll(cards=>cards.map(card=>({top:card.getBoundingClientRect().top,height:card.getBoundingClientRect().height})));
    assert.equal(boxes.length,2);assert.ok(Math.abs(boxes[0].height-boxes[1].height)<2);
    await page.evaluate(()=>{window.uploadImage=async()=>({success:true});});
    await gallery.locator('summary').filter({hasText:'Upload image'}).click();
    assert.equal(await gallery.getByRole('heading',{name:'Upload a new image',exact:true}).count(),0);
    await gallery.locator('input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10])});
    await gallery.locator('details input[name="alt_text"]').fill('A test photo');
    await gallery.locator('details form').getByRole('button',{name:'Upload image',exact:true}).click();
    const notice=gallery.getByRole('status').filter({hasText:'Image uploaded.'});
    await notice.waitFor({state:'visible'});
    await notice.waitFor({state:'hidden',timeout:6000});
  });
  assert.deepEqual(errors, []);
  console.log(`\n${checks} browser regression checks passed.`);
} finally { await browser.close(); }
