import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const dataUrl=code=>`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
const humor=dataUrl(compile(await readFile(new URL('../lib/humor.ts',import.meta.url),'utf8')));
const history=dataUrl(compile(await readFile(new URL('../lib/tool-run-history.ts',import.meta.url),'utf8')).replace('"./humor"',JSON.stringify(humor)));
const server=compile(await readFile(new URL('../lib/tool-run-history-server.ts',import.meta.url),'utf8')).replace('"./tool-run-history"',JSON.stringify(history));
const {loadRecentChainRuns}=await import(dataUrl(server));
const publicRows=Array.from({length:6},(_,index)=>({id:`public-${index+1}`,prompt_chain_id:'chain-a',created_at:`2026-11-0${index+1}T12:00:00Z`,status:'completed',request:{context:'Public scene'}}));
const toolRows=[{id:'tool-a',chain_id:'chain-a',actor_id:'admin-a',scene:'Original tool scene',created_at:'2026-11-10T12:00:00Z',status:'failed',plan:{},outputs:[]},
 {id:'tool-b',chain_id:'chain-b',actor_id:'admin-b',scene:'Three-step test scene',created_at:'2026-11-11T12:00:00Z',status:'completed',plan:{steps:[{},{},{}]},outputs:[]}];
let toolPages=[];
const db={rpc:async(name,args)=>{
 if(name==='admin_tool_run_history'){toolPages.push(args.p_page);return {data:{total:2,rows:[toolRows[args.p_page-1]]},error:null};}
 const rows=args.search_text==='chain-a'?[...publicRows,{id:'false-match',prompt_chain_id:'different-chain',created_at:'2026-11-30T00:00:00Z'}]:[];
 const offset=(args.page_number-1)*3;return {data:{total:rows.length,rows:rows.slice(offset,offset+3)},error:null};
}};
const result=await loadRecentChainRuns(db,['chain-a','chain-b']);
assert.deepEqual(result.recentRuns['chain-a'].map(row=>row.id),['tool-a','public-6','public-5','public-4','public-3']);
assert.equal(result.recentRuns['chain-b'].length,1);assert.equal(result.recentRuns['chain-b'][0].id,'tool-b');
assert.equal(result.recentRuns['chain-b'][0].user_id,'admin-b');assert.equal(result.recentRuns['chain-b'][0].request.source,'prompt-tool');
assert.equal(result.recentRunsIncomplete['chain-a'],false);assert.deepEqual(toolPages,[1,2]);
const publicFailure={rpc:async(name)=>name==='admin_tool_run_history'?{data:{total:toolRows.length,rows:toolRows},error:null}:{data:null,error:{code:'FAILED'}}};
const partial=await loadRecentChainRuns(publicFailure,['chain-a']);assert.equal(partial.recentRuns['chain-a'][0].id,'tool-a');assert.equal(partial.recentRunsIncomplete['chain-a'],true);
const toolFailure={rpc:async(name,args)=>name==='admin_tool_run_history'?{data:null,error:{code:'PGRST202'}}:db.rpc(name,args)};
const publicOnly=await loadRecentChainRuns(toolFailure,['chain-a']);assert.equal(publicOnly.recentRuns['chain-a'][0].id,'public-6');assert.equal(publicOnly.recentRunsIncomplete['chain-a'],true);
const unavailable=await loadRecentChainRuns({rpc:async()=>({data:null,error:{code:'FAILED'}})},['chain-a']);assert.equal(unavailable.recentRuns['chain-a'],undefined);
console.log('Recent runs checks passed: combined sources, tool-only chain, newest five, exact chain matching, paginated reads, actors and honest partial/unavailable states.');
