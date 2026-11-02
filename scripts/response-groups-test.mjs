import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/response-groups.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {groupResponses,responseModel}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const requests=[{id:'run-one',created_at:'2026-11-02T12:00:00Z',status:'completed',request:{source:'prompt-tool',step_count:2}},
 {id:'run-two',created_at:'2026-11-02T13:00:00Z',status:'failed',request:{source:'caption-app',steps:[{model:'historical-model'},{model:'second-model'}]}},
 {id:'pending',created_at:'2026-11-02T14:00:00Z',status:'running'}];
const responses=[{id:'one-b',generation_request_id:'run-one',chain_step_order:1,response:'ALPHA',model_name:'configured-model',latency_ms:873,input_tokens:807,output_tokens:16},
 {id:'one-a',generation_request_id:'run-one',chain_step_order:0,response:'BETA',latency_ms:0,input_tokens:0,output_tokens:null},
 {id:'two-a',generation_request_id:'run-two',chain_step_order:0,response:'Analysis',latency_ms:100,input_tokens:10,output_tokens:5},
 {id:'orphan',generation_request_id:'missing-request',created_at:'2026-11-01T00:00:00Z',response:'Preserved historical response'}];
const groups=groupResponses(requests,responses);
assert.equal(groups.length,4);assert.equal(groups[0].id,'pending');
const one=groups.find(group=>group.id==='run-one');
assert.deepEqual(one.responses.map(response=>response.id),['one-a','one-b']);
assert.deepEqual(one.duration,{value:873,partial:false});assert.deepEqual(one.input,{value:807,partial:false});
assert.deepEqual(one.output,{value:16,partial:true});assert.equal(one.expectedSteps,2);assert.equal(one.source,'prompt-tool');
assert.equal(responseModel(one,one.responses[1],[]),'configured-model');
const two=groups.find(group=>group.id==='run-two');
assert.equal(two.responses.length,1);assert.equal(two.expectedSteps,2);assert.equal(two.source,'caption-app');
assert.equal(responseModel(two,two.responses[0],[]),'historical-model');
assert.deepEqual(groups[0].duration,{value:null,partial:false});assert.equal(groups[0].responses.length,0);
assert.equal(groups.find(group=>group.id==='missing-request').responses[0].response,'Preserved historical response');
assert.equal(responses[0].id,'one-b');
console.log('Response grouping checks passed: request boundaries, saved step order, snapshot models, exact zero/partial totals, pending and orphan responses.');
