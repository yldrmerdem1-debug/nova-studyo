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

test('research on the 2026 search tool: no citation blocks, but the searched pages the text links are the provenance (no false "unverified" banner)', async () => {
  const { callText } = await import('../src/llm.js');
  const resp = {
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [
      { type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'irkutsk plague' } },
      { type: 'web_search_tool_result', tool_use_id: 's1', content: [
        { type: 'web_search_result', url: 'https://www.interfax.ru/russia/1120228', title: 'Interfax', page_age: '4 Oct 2026' },
        { type: 'web_search_result', url: 'https://example.org/unused', title: 'Unused' },
      ] },
      { type: 'text', text: 'Rospotrebnadzor: pneumonia of unknown etiology — https://www.interfax.ru/russia/1120228' },
    ],
  };
  const out = await callText({ system: 's', user: 'u', webSearch: true, request: async () => resp });
  assert.doesNotMatch(out, /doğrulanabilir kaynak bağlantısı alınamadı/);
  assert.match(out, /## Kaynak kayıtları/);
  assert.match(out, /interfax\.ru\/russia\/1120228/);
  assert.doesNotMatch(out.split('## Kaynak kayıtları')[1], /example\.org\/unused/);
});

test('OpenAI adapter: Anthropic-shaped request in, Anthropic-shaped answer out (schema, images, web search, citations, usage)', async () => {
  const { openaiBody, fromOpenAI, isOpenAIModel } = await import('../src/llm.js');
  assert.ok(isOpenAIModel('gpt-6.1-sol') && isOpenAIModel('gpt-6-luna') && !isOpenAIModel('claude-opus-5-5'));
  const body = openaiBody({
    system: 'sys', max_tokens: 4000,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Aday 1:' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } }, { type: 'text', text: 'pick' }] }],
    output_config: { format: { type: 'json_schema', schema: { type: 'object' } } },
  }, 'gpt-6-luna');
  assert.equal(body.instructions, 'sys');
  assert.equal(body.max_output_tokens, 4000);
  assert.equal(body.reasoning.effort, 'low', 'a picture check is a quick look');
  assert.deepEqual(body.input[0].content[1], { type: 'input_image', image_url: 'data:image/jpeg;base64,QUJD', detail: 'auto' });
  assert.equal(body.text.format.type, 'json_schema');
  const web = openaiBody({ messages: [{ role: 'user', content: 'research' }], tools: [{ type: 'web_search_20260209', name: 'web_search' }] }, 'gpt-6.1-sol');
  assert.deepEqual(web.tools, [{ type: 'web_search' }]);
  assert.equal(web.reasoning.effort, 'high');
  const msg = fromOpenAI({
    model: 'gpt-6.1-sol', status: 'completed',
    output: [{ type: 'web_search_call' }, { type: 'web_search_call' }, { type: 'message', content: [{ type: 'output_text', text: 'Fact.', annotations: [{ type: 'url_citation', url: 'https://www.interfax.ru/x', title: 'Interfax' }] }] }],
    usage: { input_tokens: 1000, output_tokens: 50, input_tokens_details: { cached_tokens: 200 } },
  }, 'gpt-6.1-sol');
  assert.equal(msg.content[0].text, 'Fact.');
  assert.equal(msg.content[0].citations[0].url, 'https://www.interfax.ru/x');
  assert.deepEqual(msg.usage, { input_tokens: 800, output_tokens: 50, cache_read_input_tokens: 200, server_tool_use: { web_search_requests: 2 } });
  assert.equal(fromOpenAI({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] }).stop_reason, 'max_tokens');
  assert.equal(fromOpenAI({ status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }] }).stop_reason, 'refusal');
});

test('OpenAI adapter: background run is polled to the end; a dropped connection is an overload (falls back), not a crash', async () => {
  const { _openaiMessage } = await import('../src/llm.js');
  const cfg = await import('../src/config.js');
  cfg.saveSettings({ openaiKey: 'sk-test' });
  let polls = 0;
  const fetchFn = async (url, init = {}) => {
    if (init.method === 'POST') return { ok: true, status: 200, json: async () => ({ id: 'r1', status: 'queued' }) };
    polls++;
    return { ok: true, status: 200, json: async () => (polls < 2 ? { id: 'r1', status: 'in_progress' } : { id: 'r1', status: 'completed', model: 'gpt-6-luna', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"choice":2}' }] }], usage: { input_tokens: 10, output_tokens: 5 } }) };
  };
  const msg = await _openaiMessage({ messages: [{ role: 'user', content: 'x' }] }, 'gpt-6-luna', {}, fetchFn);
  assert.equal(msg.content[0].text, '{"choice":2}');
  await assert.rejects(_openaiMessage({ messages: [{ role: 'user', content: 'x' }] }, 'gpt-6-luna', {}, async () => { throw Object.assign(Error('fetch failed'), { cause: { code: 'ECONNRESET' } }); }), (e) => e.status === 503);
});
