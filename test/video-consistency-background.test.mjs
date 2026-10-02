import test from 'node:test';
import assert from 'node:assert/strict';
import {arkaPlanSec,arkaPlanGecer,kardesleriBul,yeniArkaDurum} from '../src/pipeline/arkaplan.js';

test('a video rejected for inconsistent content never becomes a fullscreen fallback',()=>{
 const wrong={beatId:'s0b0',file:'unrelated-middle.mp4',type:'video',gorsel:1,kalite:3,videoTutarlilik:1};
 const right={beatId:'s0b1',file:'relevant.jpg',type:'image',gorsel:2,kalite:3};
 const media={s0b0:wrong,s0b1:right};
 assert.equal(arkaPlanGecer(wrong),false);
 assert.deepEqual(kardesleriBul(media,0),[right]);
 assert.equal(arkaPlanSec(media,0,0,yeniArkaDurum()).file,'relevant.jpg');
 assert.equal(arkaPlanSec({s0b0:wrong},0,0,yeniArkaDurum()).type,'card');
});

test('consistency rejection cannot be overridden by a high subject score',()=>{
 for(const videoTutarlilik of [0,1])assert.equal(arkaPlanGecer({file:'v.mp4',type:'video',gorsel:3,kalite:3,videoTutarlilik}),false);
});

test('consistent videos, relevant stills and legacy media keep existing eligibility',()=>{
 for(const videoTutarlilik of [2,3])assert.equal(arkaPlanGecer({file:'v.mp4',type:'video',gorsel:2,kalite:2,videoTutarlilik}),true);
 assert.equal(arkaPlanGecer({file:'legacy.mp4',type:'video',gorsel:2}),true);
 assert.equal(arkaPlanGecer({file:'still.jpg',type:'image',gorsel:1}),true);
});
