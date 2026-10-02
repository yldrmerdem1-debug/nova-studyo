import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-editorial-'));
process.env.NOVA_HOME = isolated;
process.env.TEMP = isolated; process.env.TMP = isolated;
const llm = await import('../src/llm.js');
const schema = {type:'object', properties:{sections:{type:'array',minItems:1,items:{type:'object',properties:{title:{type:'string',minLength:1},kind:{type:'string',enum:['news','story']}},required:['title','kind'],additionalProperties:false}}},required:['sections'],additionalProperties:false};
const valid = {sections:[{title:'Opening',kind:'news'}]};
const response = (value, extra={}) => ({model:'test-model', stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify(value)}],usage:{input_tokens:100,output_tokens:20},...extra});
test('recursive validation repairs missing fields and invalid nested enum, then returns valid object', async()=>{
 const replies=[{sections:[{kind:'other'}]},valid]; const prompts=[];
 const result=await llm.callJSON({user:'write',schema,request:async p=>{prompts.push(p);return response(replies.shift());}});
 assert.deepEqual(result,valid); assert.equal(prompts.length,2); assert.match(prompts[1].messages[0].content,/title|kind/);
});
test('fallback prompt contains the entire schema, and overload never disables structured output',async()=>{
 const prompts=[];
 await llm.callJSON({user:'write',schema,request:async p=>{prompts.push(structuredClone(p)); if(prompts.length===1)throw Object.assign(new Error('output_config unsupported'),{status:400}); return response(valid);}});
 assert.match(prompts[1].messages[0].content,/"required"/); assert.match(prompts[1].messages[0].content,/"news"/);
 await assert.rejects(llm.callJSON({user:'x',schema,request:async()=>{throw Object.assign(new Error('overloaded'),{status:529});}}),/overloaded/);
 let p; await llm.callJSON({user:'x',schema,request:async x=>{p=x;return response(valid);}}); assert.ok(p.output_config);
});
test('credit exhaustion does not retry the same paid vision request in a weaker format',async()=>{
 let n=0;
 await assert.rejects(llm.callVisionJSON({user:'x',schema,request:async()=>{n++;throw Object.assign(new Error('Your credit balance is too low'),{status:400});}}),/credit balance/i);
 assert.equal(n,1);
});
test('invalid JSON has bounded repair attempts and counts all failed responses',async()=>{
 let n=0;const usage={}; await assert.rejects(llm.callJSON({user:'x',schema,usage,request:async()=>{n++;return response({});}}),/JSON|şema/i);
 assert.equal(n,3); assert.equal(usage.requests,3);
});
test('vision output is recursively validated too',async()=>{
 let n=0; const result=await llm.callVisionJSON({user:'x',schema,request:async()=>response(++n===1?{}:valid)}); assert.equal(n,2); assert.deepEqual(result,valid);
});
test('cancellation after an invalid response prevents a paid repair request',async()=>{
 let n=0,cancelled=false;
 await assert.rejects(llm.callJSON({user:'x',schema,isCancelled:()=>cancelled,request:async()=>{n++;cancelled=true;return response({});}}),/cancelled/i);
 assert.equal(n,1);
});
test('abort signal is forwarded through the injected request boundary and blocks repair',async()=>{
 const controller=new AbortController();let n=0,seen;
 await assert.rejects(llm.callVisionJSON({user:'x',schema,signal:controller.signal,request:async(_p,_l,_m,_u,control)=>{n++;seen=control.signal;controller.abort();return response({});}}),/cancelled/i);
 assert.equal(seen,controller.signal);assert.equal(n,1);
});
test('pause continuations retain all citations and account each actual model response',async()=>{
 let n=0;const usage={}; const result=await llm.callText({user:'x',usage,webSearch:true,request:async()=>response(null,{model:++n===1?'first':'second',stop_reason:n===1?'pause_turn':'end_turn',content:[{type:'text',text:n===1?'First claim.':'Second claim.',citations:[{type:'web_search_result_location',url:`https://example.org/${n}`,title:`Source ${n}`,cited_text:'Claim'}]}]})});
 assert.equal(usage.requests,2); assert.equal(usage.inputTokens,200); assert.equal(usage.byModel.first.requests,1); assert.match(result,/example.org\/1/);assert.match(result,/example.org\/2/);assert.match(result,/First claim/);
});
test('web unavailable is visible in returned research',async()=>{
 let n=0;const result=await llm.callText({user:'x',webSearch:true,request:async()=>{if(++n===1)throw Object.assign(new Error('web tool unavailable'),{status:400});return response(null,{content:[{type:'text',text:'Draft facts.'}]});}}); assert.match(result,/doğrulanmadı|kullanılamadı/);
});
test('cache rates and unpriced responses remain explicit; cap blocks new requests',async()=>{
 const usage={}; llm.sumUsage(usage,response(null,{usage:{input_tokens:1e6,output_tokens:2e6,cache_read_input_tokens:3e6,cache_creation_input_tokens:4e6}}),{'test-model':{input:2,output:3,cacheRead:0.2,cacheWrite:2.5}});
 assert.equal(usage.inputTokens,8e6);assert.equal(usage.estimatedUsd,18.6);assert.equal(usage.cacheReadTokens,3e6);assert.equal(usage.estimateComplete,true);
 llm.sumUsage(usage,response(null,{model:'unknown'}),{});assert.equal(usage.estimateComplete,false);assert.equal(usage.unpricedRequests,1);
 let n=0;await assert.rejects(llm.callText({user:'x',usage:{budgetUsd:1,estimatedUsd:1},request:async()=>{n++;return response('x');}}),/bütçe/i);assert.equal(n,0);
});
test('legacy token totals without model provenance do not become a complete cost estimate',()=>{
 const usage={inputTokens:4000,outputTokens:2000};llm.sumUsage(usage,response('x'),{'test-model':{input:1,output:1,cacheRead:1,cacheWrite:1}});assert.equal(usage.estimateComplete,false);assert.equal(usage.legacyUnpricedUsage,true);
});
test('zero and null budgets both mean unlimited per UI contract',async()=>{
 let n=0;const request=async()=>{n++;return response('result');};await llm.callText({user:'x',usage:{budgetUsd:0},request});await llm.callText({user:'x',usage:{budgetUsd:null},request});assert.equal(n,2);
});
