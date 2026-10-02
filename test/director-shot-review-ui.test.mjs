import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../public/quality-desk.js',import.meta.url),'utf8');
const context={window:{}};
vm.runInNewContext(source,context);
const {directorShotHTML}=context.window.NovaQualityDesk;

test('Director final-cut report shows every sampled frame, narration, and seek time safely',()=>{
 const report={generatedAt:'2026-09-23T12:00:00Z',scenes:[
  {id:'s1',timestamp:3.25,frameFile:'director-shot-0001.jpg',reviewFrames:[{position:'first',frameFile:'director-shot-0001-first.jpg'},{position:'middle',frameFile:'director-shot-0001.jpg'},{position:'last',frameFile:'director-shot-0001-last.jpg'}],narration:'The ship moves. The signal failed.',spokenMoment:'The signal failed.',mediaType:'video',status:'ok',observation:'Relevant scene'},
  {id:'s2',timestamp:9.5,frameFile:'director-shot-0002.jpg',narration:'<script>alert(1)</script>',mediaType:'image',status:'mismatch',reason:'Wrong era <b>modern</b>'},
 ]};
 const html=directorShotHTML(report,'/api/jobs/20260923-abcdef');
 assert.match(html,/2 final kesme/);
 assert.match(html,/1 sahne işaretli/);
 assert.match(html,/data-seek="3.25"/);
 assert.match(html,/director-shot-0001\.jpg/);
 assert.match(html,/director-shot-0001-first\.jpg/);
 assert.match(html,/director-shot-0001-last\.jpg/);
 assert.match(html,/Baş · Orta · Son/);
 assert.match(html,/director-shot-0002\.jpg/);
 assert.match(html,/The signal failed\./);
 assert.match(html,/Bu kesmenin anlatımı/);
 assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/Wrong era &lt;b&gt;modern&lt;\/b&gt;/);
});

test('missing old report and invalid proof file names stay safe',()=>{
 assert.match(directorShotHTML(null,'/api/jobs/20260923-abcdef'),/final kesme raporu yok/);
 assert.match(directorShotHTML({scenes:[],warnings:['Review failed safely.']},'/api/jobs/20260923-abcdef'),/Review failed safely\./);
 const html=directorShotHTML({scenes:[{id:'s1',timestamp:1,narration:'Safe',frameFile:'../evil.jpg',status:'warning'}]},'/api/jobs/20260923-abcdef');
 assert.doesNotMatch(html,/\.\.\/evil/);
 assert.match(html,/Kare yok/);
});
