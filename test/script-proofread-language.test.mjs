import test from 'node:test';
import assert from 'node:assert/strict';
import * as scripts from '../src/pipeline/script.js';

const fixture=()=>({title:'Moon',sections:[{segments:[
 {text:'Apollo astronauts left bootprints in the lunar dust. The Moon has no rain to wash them away.'},
 {text:'Small impacts slowly change the lunar surface, and the traces will not remain forever.'}
]}]});
test('English proofreading explicitly preserves English and accepts an English correction',async()=>{
 let request;const script=fixture();
 await scripts.redaksiyon({language:'en',theme:'belgesel'},script,{},()=>{},async args=>{
  request=args;return {duzeltmeler:[{id:'0.1',yeni:'Small impacts gradually change the lunar surface, so these traces will not remain forever.',neden:'dil'}]};
 });
 assert.match(request.system,/English/);
 assert.match(request.user,/Do not translate/);
 assert.doesNotMatch(request.user,/Türkçesine çevir/);
 assert.match(script.sections[0].segments[1].text,/gradually/);
});
test('wrong-language correction cannot replace valid English narration',async()=>{
 const script=fixture(),before=structuredClone(script);
 await scripts.redaksiyon({language:'en'},script,{},()=>{},async()=>({duzeltmeler:[{
  id:'0.1',yeni:'Küçük çarpışmalar Ay yüzeyini yavaşça değiştiriyor ve bu izlerin sonsuza kadar aynı kalması mümkün görünmüyor.',neden:'dil'
 }]}));
 assert.deepEqual(script,before);
});
test('Turkish proofreading still requests Turkish',async()=>{
 let request;await scripts.redaksiyon({language:'tr'},fixture(),{},()=>{},async args=>{request=args;return {duzeltmeler:[]};});
 assert.match(request.system,/Türkçe/);
});
test('ASCII Turkish cannot silently replace English narration',async()=>{
 const script=fixture(),before=structuredClone(script);
 await scripts.redaksiyon({language:'en'},script,{},()=>{},async()=>({duzeltmeler:[{id:'0.1',yeni:'Bu metin tamamen Turkce yazildi ama ozel harf kullanilmadi ve bunun icin bir sorun olarak kaldi.',neden:'dil'}]}));
 assert.deepEqual(script,before);
});
test('proofreading cancellation prevents requests and discards late responses',async()=>{
 let calls=0;const before=fixture();
 await assert.rejects(scripts.redaksiyon({language:'en'},before,{},()=>{},async()=>{calls++;},()=>true),/cancelled/);
 assert.equal(calls,0);
 let cancelled=false;const script=fixture();
 await assert.rejects(scripts.redaksiyon({language:'en'},script,{},()=>{},async()=>{cancelled=true;return {duzeltmeler:[{id:'0.1',yeni:'Small impacts gradually change the lunar surface, so these traces will not remain forever.',neden:'dil'}]};},()=>cancelled),/cancelled/);
 assert.deepEqual(script,before);
});
test('proofreading cannot invent a different numeric fact',async()=>{
 const script=fixture();script.sections[0].segments[0].text='Apollo astronauts landed on the Moon in July 1969 and left visible bootprints in its dust.';
 const before=structuredClone(script);
 await scripts.redaksiyon({language:'en'},script,{},()=>{},async()=>({duzeltmeler:[{id:'0.0',yeni:'Apollo astronauts landed on the Moon in July 1970 and left visible bootprints in its dust.',neden:'sayi'}]}));
 assert.deepEqual(script,before);
});
test('proofreading preserves numeric order and repeated occurrences',async()=>{
 for(const [beforeText,afterText] of [
  ['This record spans from 1969 through 1970 and shows the history of lunar exploration.','This record spans from 1970 through 1969 and shows the history of lunar exploration.'],
  ['The first image was taken in 1969 and the second image was also taken in 1969.','The first image was taken in 1969 and the second image was also taken that year.']
 ]){
  const script=fixture();script.sections[0].segments[0].text=beforeText;
  await scripts.redaksiyon({language:'en'},script,{},()=>{},async()=>({duzeltmeler:[{id:'0.0',yeni:afterText,neden:'sayi'}]}));
  assert.equal(script.sections[0].segments[0].text,beforeText);
 }
});
