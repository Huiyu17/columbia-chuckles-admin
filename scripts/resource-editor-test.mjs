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
  "next/navigation": "exports.useRouter = () => ({ refresh: () => window.refreshRecord() });",
  "@/app/actions/resources": "exports.saveResource = (_, operation, id, payload) => window.saveRecord(operation, id, payload); exports.uploadAdminImage = async () => ({error: 'Not used in this test'});",
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
      const resolved = request.startsWith("@/") ? path.join(root, `${request.slice(2)}.ts`)
        : createRequire(path.isAbsolute(filename) ? filename : path.join(root, "package.json")).resolve(request);
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
  const root = createRoot(document.getElementById('root'));
  window.refreshRecord = () => { window.refreshCalls = (window.refreshCalls ?? 0) + 1; root.render(React.createElement(React.Fragment,null,
    React.createElement('pre', {id:'saved-record'}, JSON.stringify(window.record)),
    React.createElement(RecordIdentifier, {id:window.record.id}),
    window.showSecondID ? React.createElement(RecordIdentifier, {id:window.secondID}) : null,
    React.createElement(RefreshStatusesButton),
    React.createElement(ResourceEditor, {resource:'prompt-chain-mix',mode:'update',columns,
      row:window.creating ? undefined : window.record}))); };
  window.saveRecord = async (operation, id, payload) => {
    window.lastSavedId = id;
    await new Promise(r => setTimeout(r, 10));
    if(window.failSave) return {error:'Database rejected this change'};
    window.record = {...window.record,...payload,weight:Number(payload.weight)};
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
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => document.querySelector('select[name="enabled"]'), { timeout: 5000 })
    .catch(error => { throw new Error(`${error.message}\n${errors.join("\n")}`); });
  const enabled = page.locator('select[name="enabled"]');
  const weight = page.locator('textarea[name="weight"]');
  const note = page.locator('textarea[name="note"]');
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
    assert.equal(await note.inputValue(), ""); assert.equal(await enabled.inputValue(), "");
  });
  assert.deepEqual(errors, []);
  console.log(`\n${checks} browser regression checks passed.`);
} finally { await browser.close(); }
