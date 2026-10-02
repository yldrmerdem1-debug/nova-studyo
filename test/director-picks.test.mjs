import test from 'node:test';
import assert from 'node:assert/strict';
import {recordDirectorPicks,approvedCandidateOrder,verifyDirectorChoices} from '../src/pipeline/director-picks.js';

const script={sections:[{segments:[{text:'A ship enters the harbor.',visuals:[{query:'harbor ship',type:'video'}]}]}]};
const candidates={'harbor ship||video':[
 {id:'pexels-1',url:'https://example.test/1',type:'video'},
 {id:'pixabay-2',url:'https://example.test/2',type:'video'},
]};

test('only a user-changed candidate becomes a protected Director choice',()=>{
 const initial={s0b0:'pexels-1'};
 assert.deepEqual(recordDirectorPicks(script,candidates,initial,initial),{picks:initial,changed:{}});
 assert.deepEqual(recordDirectorPicks(script,candidates,initial,{s0b0:'pixabay-2'}),{picks:{s0b0:'pixabay-2'},changed:{s0b0:'pixabay-2'}});
 assert.throws(()=>recordDirectorPicks(script,candidates,initial,{s0b0:'other'}),/geçersiz/i);
});

test('a protected choice cannot silently fall back after download failure',()=>{
 const ordered=candidates['harbor ship||video'];
 assert.deepEqual(approvedCandidateOrder(ordered,'pixabay-2','pixabay-2').map(c=>c.id),['pixabay-2']);
 assert.deepEqual(approvedCandidateOrder(ordered,'pexels-1',null).map(c=>c.id),['pexels-1','pixabay-2']);
 assert.throws(()=>verifyDirectorChoices({s0b0:{file:'shot.mp4',type:'video',adayId:'pexels-1'}},{s0b0:'pixabay-2'}),/s0b0/);
 assert.doesNotThrow(()=>verifyDirectorChoices({s0b0:{file:'shot.mp4',type:'video',adayId:'pixabay-2'}},{s0b0:'pixabay-2'}));
});
