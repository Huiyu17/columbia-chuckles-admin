import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const dataUrl=source=>`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const humor=dataUrl(compile(await readFile(new URL('../lib/humor.ts',import.meta.url),'utf8')));
const code=compile(await readFile(new URL('../lib/tool-run-history.ts',import.meta.url),'utf8')).replace('"./humor"',JSON.stringify(humor));
const {toolHistoryRecords}=await import(dataUrl(code));
const run={id:'historical-tool-run',actor_id:'admin',chain_id:null,chain_name:'Deleted test chain',image_id:null,image_url:'https://example.com/photo.png',status:'completed',created_at:'2026-11-02T12:00:00Z',
 scene:'Five alarms.\nStill asleep.\n\nSelected humor style: Too relatable. Use recognizable everyday frustrations and observations that feel personally relatable.',
 plan:{steps:[{model:'gemini-model-one'},{model:'gemini-model-two'}]},output:'1. Candidate one\n2. Candidate two',
 outputs:[{order:0,model:'gemini-model-one',prompt:'Actual first prompt',output:'Analysis',latencyMs:0,inputTokens:0,outputTokens:null},{order:1,model:'gemini-model-two',prompt:'Actual second prompt',output:'1. Candidate one\n2. Candidate two',latencyMs:873,inputTokens:807,outputTokens:16}]};
const result=toolHistoryRecords([run]);
assert.equal(result.rows.length,1);assert.equal(result.rows[0].user_id,'admin');
assert.equal(result.rows[0].request.source,'prompt-tool');assert.equal(result.rows[0].request.context,'Five alarms.\nStill asleep.');
assert.equal(result.rows[0].request.style,'relatable');assert.equal(result.rows[0].request.chain_name,'Deleted test chain');
assert.equal(result.rows[0].generation_id,null);assert.equal(result.rows[0].request.output,run.output);
assert.equal(result.responses.length,2);assert.equal(result.responses[0].latency_ms,0);assert.equal(result.responses[0].input_tokens,0);
assert.equal(result.responses[0].output_tokens,null);assert.equal(result.responses[1].model_name,'gemini-model-two');
assert.equal(result.responses[1].prompt,'Actual second prompt');assert.equal(result.responses[1].generation_request_id,run.id);
assert.notEqual(result.responses[0].id,result.responses[1].id);
const blank=toolHistoryRecords([{...run,id:'interrupted',status:'failed',plan:{},outputs:[],scene:'Original scene',error:'Interrupted'}]);
assert.equal(blank.rows[0].request.context,'Original scene');assert.equal(blank.rows[0].request.error,'Interrupted');assert.equal(blank.responses.length,0);
console.log('Admin tool history checks passed: source, scene, deleted configuration, exact per-step usage, model names and empty failed runs.');
