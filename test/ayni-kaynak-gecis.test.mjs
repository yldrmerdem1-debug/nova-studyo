// Aynı kaynağın ardışık iki parçası çözülmeyle bağlanınca çift pozlama oluşuyordu
// (20260923-8aab9f: 12,3 sn harita videosu, 60,9 sn "ford" arşivi).
import test from 'node:test';
import assert from 'node:assert/strict';
import {planTransitions} from '../src/pipeline/transitions.js';
import {getStyleProfile} from '../src/pipeline/style-profile.js';

const shot=(id,segIndex,sectionIndex,file,extra={})=>({id,segIndex,sectionIndex,firstOfSection:false,dur:6,media:{type:'video',file},...extra});

test('aynı videonun devamı düz kesilir, farklı kaynak geçişini korur',()=>{
 for(const intensity of ['sade','sinematik']){
  const beats=[shot('s0b0',0,0,'map.mp4'),shot('s1b0',1,0,'map.mp4'),shot('s2b0',2,0,'ford.mp4'),shot('s3b0',3,0,'ship.mp4')];
  const plan=planTransitions(beats,{theme:'belgesel',intensity});
  assert.deepEqual(plan[0],{tip:'',sure:0},`${intensity}: aynı kaynak`);
  const withProfile=planTransitions(beats,{intensity,profile:getStyleProfile('belgesel','dynamic'),director:true});
  assert.equal(withProfile[0].sure,0);
 }
 // Farklı kaynaklarda katalog geçişi hâlâ kullanılabiliyor (kural her şeyi kesmeye çevirmiyor).
 const varied=Array.from({length:12},(_,i)=>shot(`s${i}b0`,i,0,`clip${i}.mp4`));
 assert.ok(planTransitions(varied,{theme:'belgesel',intensity:'sinematik'}).some(p=>p.sure>0));
});

test('bölüm sınırında aynı kaynak siyaha iner, çözülmez',()=>{
 const beats=[shot('s4b2',4,0,'ford.mp4'),shot('s5b0',5,1,'ford.mp4',{firstOfSection:true})];
 const [p]=planTransitions(beats,{theme:'belgesel',intensity:'sinematik'});
 assert.equal(p.tip,'fadeblack');
 assert.ok(p.sure>=0.4&&p.sure<=0.6,String(p.sure));
});
