import assert from 'node:assert/strict';
import {ensureEditorialCoverage} from '../src/pipeline/editorial-coverage.js';

const words=n=>Array.from({length:n},(_,i)=>`word${i+1}`).join(' ');
const baseJob={aiSupport:'auto',mediaKind:'mixed',visualStyle:'editorial',language:'en',demo:false};
const original={query:'ancient Ithaca harbor',type:'image',kind:'place',prompt:'',vekil:['Ithaca coast']};
const script={title:'T',sections:[{title:'S',segments:[{
  text:`${words(19)}. ${words(19)}. ${words(18)}.`,
  visuals:[original],emphasis:{type:'none',value:'',label:'',items:[]},
}]}]};
const returned=ensureEditorialCoverage(baseJob,script);
assert.equal(returned,script,'helper mutates and returns the same normalized script');
assert.equal(script.sections[0].segments[0].visuals.length,3,'~24 seconds receives three visual slots');
assert.equal(script.sections[0].segments[0].visuals[0],original,'existing visual object is preserved');
const added=script.sections[0].segments[0].visuals.slice(1);
assert.ok(added.every(v=>v.query==='ancient Ithaca harbor' && v.type==='image'));
assert.equal(new Set(added.map(v=>v.anchorQuote)).size,2,'new slots cover distinct narration sentences');
assert.ok(added.every(v=>script.sections[0].segments[0].text.includes(v.anchorQuote)),'anchors are exact narration substrings');
assert.equal(added[0].anchorQuote,script.sections[0].segments[0].text.match(/[^.]+\./g)[1].trim(),'the original slot retains the opening; additions cover later narration');

const huge={sections:[{segments:[{text:Array.from({length:8},(_,i)=>`scene${i+1} ${words(25)}.`).join(' '),visuals:[{...original}]}]}]};
ensureEditorialCoverage(baseJob,huge);
assert.equal(huge.sections[0].segments[0].visuals.length,6,'coverage is capped at six slots');

for(const job of [
  {...baseJob,aiSupport:'manual'}, {...baseJob,mediaKind:'image'}, {...baseJob,mediaKind:'fullai'},
  {...baseJob,visualStyle:'kolaj'}, {...baseJob,demo:true},
]) {
  const gated={sections:[{segments:[{text:words(100),visuals:[{...original}]}]}]};
  ensureEditorialCoverage(job,gated);
  assert.equal(gated.sections[0].segments[0].visuals.length,1,JSON.stringify(job));
}

const short={sections:[{segments:[{text:words(20),visuals:[{...original},{...original,query:'Odysseus ship'}]}]}]};
ensureEditorialCoverage(baseJob,short);
assert.equal(short.sections[0].segments[0].visuals.length,2,'adequately covered segments receive no duplicates');

console.log('Editorial coverage tests passed');
