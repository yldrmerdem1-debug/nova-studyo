import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-token-retry-'));process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const {callJSON}=await import('../src/llm.js');
const schema={type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false};
test('truncated structured response retries at doubled bounded ceiling and accounts both responses',async()=>{
 const sent=[];const usage={};const result=await callJSON({user:'Write',schema,maxTokens:32000,usage,request:async p=>{sent.push(p);return {model:'offline',usage:{input_tokens:100,output_tokens:20},stop_reason:sent.length===1?'max_tokens':'end_turn',content:[{type:'text',text:sent.length===1?'{"text":':'{"text":"Done"}'}]};}});
 assert.equal(result.text,'Done');assert.deepEqual(sent.map(p=>p.max_tokens),[32000,64000]);assert.equal(usage.requests,2);assert.equal(usage.inputTokens,200);assert.equal(usage.outputTokens,40);
});
test('permanent truncation stops after three paid responses and never accepts partial JSON',async()=>{
 const ceilings=[];const usage={};await assert.rejects(callJSON({user:'Write',schema,maxTokens:32000,usage,request:async p=>{ceilings.push(p.max_tokens);return {model:'offline',usage:{input_tokens:100,output_tokens:20},stop_reason:'max_tokens',content:[{type:'text',text:'{"text":"Looks valid but is incomplete"}'}]};}}),/3 denemede/);
 assert.deepEqual(ceilings,[32000,64000,64000]);assert.equal(usage.requests,3);
});
