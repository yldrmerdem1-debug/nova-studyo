import test from 'node:test';
import assert from 'node:assert/strict';
import {planTransitions} from '../src/pipeline/transitions.js';

const evidence={type:'video',provider:'archive',editorial:{sourceRole:'evidence'}};
const reconstruction={type:'image',provider:'ai',editorial:{sourceRole:'illustration'}};
const beats=(a,b,section=false)=>[
 {id:'s0b0',segIndex:0,sectionIndex:0,dur:5,media:a},
 {id:section?'s1b0':'s0b1',segIndex:section?1:0,sectionIndex:section?1:0,firstOfSection:section,dur:5,media:b},
];

test('AI Director separates archival evidence from AI reconstruction in either direction',()=>{
 for(const pair of [[evidence,reconstruction],[reconstruction,evidence]]){
  const ordinary=planTransitions(beats(...pair),{theme:'belgesel',intensity:'sinematik'});
  assert.ok(ordinary[0].sure>0,'baseline documentary dissolve exists');
  const director=planTransitions(beats(...pair),{theme:'belgesel',intensity:'sinematik',director:true});
  assert.equal(director[0].sure,0);
  assert.equal(director[0].tip,'');
 }
});

test('Director keeps a short black chapter boundary and leaves matching evidence alone',()=>{
 const chapter=planTransitions(beats(evidence,reconstruction,true),{theme:'belgesel',intensity:'sinematik',director:true});
 assert.equal(chapter[0].tip,'fadeblack');
 assert.ok(chapter[0].sure>0&&chapter[0].sure<=.45);
 const same=planTransitions(beats(evidence,evidence),{theme:'belgesel',intensity:'sinematik',director:true});
 assert.ok(same[0].sure>0);
});
