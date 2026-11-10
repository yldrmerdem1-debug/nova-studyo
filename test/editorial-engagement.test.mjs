import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-engagement-'));process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const moduleUrl = new URL('../src/pipeline/engagement.js',import.meta.url);
const load=async()=>{assert.ok(fs.existsSync(moduleUrl),'engagement helper exists');return import(moduleUrl);};
test('SEO briefing covers every section and ending, including late facts in long scripts',async()=>{
 const {scriptBrief}=await load(); const script={title:'Research',sections:[{title:'Intro',segments:[{text:'Intro fact. '.repeat(1000)}]},{title:'Conclusion',segments:[{text:'A final observation changes the interpretation.'}]}]};const brief=scriptBrief(script);assert.match(brief,/Conclusion/);assert.match(brief,/final observation/);assert.ok(brief.length<4000);
});
test('genre hook instructions differ and require truthful payoff continuity',async()=>{
 const {engagementInstructions}=await load();const news=engagementInstructions({theme:'haber'}),story=engagementInstructions({theme:'hikaye'});assert.notEqual(news,story);for(const x of [news,story]){assert.match(x,/kanıt|doğrula/);assert.match(x,/karşılığ|sonuç/);}
});
test('publication audit flags unsupported title numbers and missing payoff evidence without a fake score',async()=>{
 const {publicationAudit}=await load();const report=publicationAudit({sections:[{title:'Facts',segments:[{text:'The expedition lasted 12 days.'}]}]},{titles:['99 days of danger'],thumbnailText:'Secret 99',pinnedComment:'Thoughts?'});assert.ok(report.warnings.some(w=>w.code==='unsupported-number'));assert.equal(report.score,undefined);
});
test('grounding validator rejects fabricated supporting quotations',async()=>{
 const {validateSeoGrounding}=await load();const script={sections:[{segments:[{text:'The expedition lasted 12 days.'}]}]};const errors=validateSeoGrounding({titles:['A long expedition'],evidence:[{titleIndex:0,segId:'s0g0',quote:'It lasted 99 days.'}]},script);assert.ok(errors.length);
});
test('runSeo repairs unsupported promises and sees the final section in its actual request',async()=>{
 const {runSeo}=await import('../src/pipeline/seo.js'); const script={title:'Expedition',sections:[{title:'Opening',segments:[{text:'An expedition started quietly. '.repeat(400)}]},{title:'Result',segments:[{text:'The expedition lasted 12 days.'}]}]};let n=0;const prompts=[];
 const seo=await runSeo({topic:'Expedition',language:'en',theme:'belgesel'},script,{},()=>{}, {request:async p=>{prompts.push(p);n++;return {model:'offline',usage:{input_tokens:12,output_tokens:12},stop_reason:'end_turn',content:[{type:'text',text:JSON.stringify({titles:[n===1?'Expedition: a journey of 99 days':'Expedition: a journey of 12 days','An expedition explained','Expedition: the journey and its end'],description:'The expedition and its result are explained here. {BOLUMLER}',tags:['journey','expedition','days','result','travel'],thumbnailText:'12 days',pinnedComment:'Which expedition decision mattered most?',evidence:[0,1,2].map(titleIndex=>({titleIndex,segId:'s1g0',quote:'The expedition lasted 12 days.'}))})}]};}});
 assert.equal(n,2);assert.match(prompts[0].messages[0].content,/expedition lasted 12 days/);assert.equal(seo.publicationAudit.warnings.length,0);
});
test('runSections reuses a checkpointed section without requiring an API key',async()=>{
 const {runSections}=await import('../src/pipeline/script.js');const cached={title:'A record',segments:[{text:'In 1942 Nikola Tesla studied a documented machine.',visuals:[{query:'Nikola Tesla 1942',type:'image',kind:'specific'}],emphasis:{type:'none'}}]};
 const result=await runSections({language:'en',theme:'belgesel',durationPreset:'kisa'},'',{title:'Tesla',sections:[{title:'A record'}]},{},()=>{},()=>false,{cached:[cached]});assert.equal(result.sections[0].segments[0].text,cached.segments[0].text);
});
