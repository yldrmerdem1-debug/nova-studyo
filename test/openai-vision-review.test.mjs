import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewOpenAIShotBatch,isAnthropicCreditError} from '../src/pipeline/openai-vision-review.js';

const data=Buffer.from('jpeg').toString('base64');
const shot={id:'s0b0',timestamp:2.5,narration:'Aircraft approached Midway.',spokenMoment:'approached Midway',mediaType:'video',visualOrigin:'verified-archive',archiveContext:{title:'USS Yorktown deck after Hiryu attack',creator:'U.S. Navy'},reviewFrames:[
 {position:'first',data},{position:'middle',data},{position:'last',data},
]};
const verdict={id:'s0b0',relevance:3,quality:3,hardMismatch:false,textIssue:false,observation:'Visible aircraft over ocean.'};

test('OpenAI final-frame review sends labelled image, narration and strict schema',async()=>{
 let request;
 const got=await reviewOpenAIShotBatch([shot],{openaiKey:'test-key',fetchFn:async(url,options)=>{
  request={url,options};
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({shots:[verdict]})}]}]})};
 }});
 assert.deepEqual(got,[verdict]);
 assert.equal(request.url,'https://api.openai.com/v1/responses');
 assert.equal(request.options.headers.Authorization,'Bearer test-key');
 const body=JSON.parse(request.options.body);
 assert.equal(body.model,'gpt-4.1');
 assert.equal(body.text.format.type,'json_schema');
 assert.equal(body.input[0].content.filter(part=>part.type==='input_image'&&part.image_url.startsWith('data:image/jpeg;base64,')).length,3);
 assert.equal(body.input[0].content.filter(part=>part.type==='input_text'&&/^FINAL SHOT s0b0 (?:FIRST|MIDDLE|LAST)$/.test(part.text)).length,3);
 assert.match(body.input[0].content.find(part=>part.type==='input_text').text,/approached Midway/);
 assert.match(body.input[0].content.find(part=>part.type==='input_text').text,/USS Yorktown deck after Hiryu attack/);
 assert.match(body.input[0].content.find(part=>part.type==='input_text').text,/not visual proof/i);
 assert.match(body.input[0].content.find(part=>part.type==='input_text').text,/verified-archive/);
 assert.match(body.input[0].content.find(part=>part.type==='input_text').text,/AI reconstruction is permitted/i);
});

test('OpenAI final-frame review rejects missing verdicts and never hides errors',async()=>{
 await assert.rejects(reviewOpenAIShotBatch([shot],{openaiKey:'test-key',fetchFn:async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"shots":[]}' }]}]})})}),/one verdict/i);
 await assert.rejects(reviewOpenAIShotBatch([shot],{openaiKey:'test-key',sleepFn:async()=>{},fetchFn:async()=>({ok:false,status:429,json:async()=>({error:{message:'rate limit'}})})}),/OpenAI vision HTTP 429/);
});

test('a temporary vision rate limit retries the same final frames without claiming a pass',async()=>{
 let calls=0;const waits=[];
 const result=await reviewOpenAIShotBatch([shot],{openaiKey:'test-key',sleepFn:async ms=>waits.push(ms),fetchFn:async()=>{
  calls++;
  if(calls<3)return {ok:false,status:429,headers:{get:()=>null},json:async()=>({error:{message:'Rate limit'}})};
  return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:JSON.stringify({shots:[verdict]})}]}]})};
 }});
 assert.deepEqual(result,[verdict]);
 assert.equal(calls,3);
 assert.deepEqual(waits,[4000,8000]);
});

test('only genuine Anthropic credit errors trigger provider fallback',()=>{
 assert.equal(isAnthropicCreditError({status:400,message:'Your credit balance is too low'}),true);
 assert.equal(isAnthropicCreditError({status:400,message:'Invalid request schema'}),false);
 assert.equal(isAnthropicCreditError({status:429,message:'rate limit'}),false);
});
