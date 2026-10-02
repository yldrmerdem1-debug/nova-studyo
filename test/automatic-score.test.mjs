import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const isolatedHome=fs.mkdtempSync(path.join(os.tmpdir(),'nova-score-home-'));
const isolatedMusic=path.join(isolatedHome,'music');
fs.mkdirSync(isolatedMusic,{recursive:true});
const bundledMusic=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','music');
for(const name of ['music-provenance.json','Tempting Secrets.mp3','Constance.mp3','Dark Times.mp3','Lost Time.mp3','Long Road Ahead.mp3']) {
  fs.copyFileSync(path.join(bundledMusic,name),path.join(isolatedMusic,name));
}
process.env.NOVA_HOME=isolatedHome;
const {getScoreCatalog, scoreMoodForSection, scoreProvenanceForFile}=await import('../src/pipeline/score-catalog.js');
const {muzikPlani}=await import('../src/pipeline/muzik.js');

const catalog=getScoreCatalog();
assert.equal(catalog.length,5,'five reviewed tracks are bundled');
assert.ok(catalog.every(t=>t.artist==='Kevin MacLeod' && t.license==='CC BY 4.0' && t.sourceUrl && t.licenseUrl));
assert.ok(catalog.every(t=>/^[a-f0-9]{64}$/.test(t.sha256) && t.duration>120));

const files=catalog.map(t=>t.file);
const plan=muzikPlani({theme:'belgesel',id:'score-moods',editorialPlan:{sections:[
  {scoreMood:'suspenseful',text:'Tehlikeli yolculuk başlıyor.'},
  {scoreMood:'somber',text:'Kayıpların ardından yas tutuluyor.'},
  {scoreMood:'epic',text:'Eve dönüş ve zafer.'},
]}},[90,160,120],files);
assert.equal(plan.length,3);
assert.notEqual(plan[0].dosya,plan[1].dosya,'adjacent sections use different cues when alternatives exist');
assert.ok(plan[0].provenance.composerMood.toLowerCase().includes('suspenseful'));
assert.ok(plan[1].provenance.composerMood.toLowerCase().includes('somber'));
assert.ok(plan[2].provenance.composerMood.toLowerCase().includes('epic'));
assert.ok(plan.every(b=>b.provenance.duration>=b.sure+3),'selection avoids looping a short cue when a long enough cue exists');

const legacy=['custom-alpha.mp3','custom-beta.mp3'];
const fallback=muzikPlani({theme:'belgesel',id:'legacy'},[60,60],legacy);
assert.equal(fallback.length,2);
assert.ok(fallback.every(b=>legacy.includes(b.dosya) && !b.provenance));
assert.equal(scoreProvenanceForFile(path.join(isolatedMusic,files[0])).title,catalog[0].title);

assert.equal(scoreMoodForSection({editorialPlan:{sections:[{index:2,mood:'epic'},{index:0,mood:'somber'}]}},0),'somber');
assert.equal(scoreMoodForSection({editorialPlan:{sections:[{index:2,mood:'epic'},{index:0,mood:'somber'}]}},1),'','missing explicit index must not borrow a positional section');
assert.equal(scoreMoodForSection({editorialPlan:{sections:[{mood:'first'},{mood:'second'}]}},1),'second','legacy positional plans still work');

const catalogTemp=fs.mkdtempSync(path.join(os.tmpdir(),'nova-catalog-'));
const catalogFile=path.join(catalogTemp,'music-provenance.json');
const audio=path.join(catalogTemp,'cue.mp3');
fs.writeFileSync(audio,'verified bytes');
const sha=crypto.createHash('sha256').update(fs.readFileSync(audio)).digest('hex');
fs.writeFileSync(catalogFile,JSON.stringify([{title:'One',artist:'A',file:'cue.mp3',sourceUrl:'https://x',licenseUrl:'https://l',sha256:sha,duration:10}]));
assert.equal(getScoreCatalog(catalogFile).length,1);
fs.writeFileSync(catalogFile,JSON.stringify([
  {title:'One',artist:'A',file:'cue.mp3',sourceUrl:'https://x',licenseUrl:'https://l',sha256:sha,duration:10},
  {title:'Two',artist:'A',file:'two.mp3',sourceUrl:'https://x',licenseUrl:'https://l',duration:20},
]));
assert.equal(getScoreCatalog(catalogFile).length,2,'catalog cache refreshes after file replacement');
assert.equal(scoreProvenanceForFile(audio,{catalogFile}).title,'One');
fs.writeFileSync(audio,'overwritten user track');
assert.equal(scoreProvenanceForFile(audio,{catalogFile}),null,'changed bytes are not credited as the reviewed work');
fs.rmSync(catalogTemp,{recursive:true,force:true});

const tooLong=muzikPlani({theme:'belgesel',id:'long-section'},[400],files);
assert.equal(tooLong[0].provenance.duration,Math.max(...catalog.map(x=>x.duration)),'when looping is unavoidable the longest cue is selected');

const moodPick=mood=>muzikPlani({theme:'belgesel',id:'same-documentary',editorialPlan:{sections:[{index:0,mood}]}},[90],files)[0].provenance;
const tension=moodPick('tension'),wonder=moodPick('wonder'),resolve=moodPick('resolve');
assert.equal(tension.title,'Constance','director tension maps to suspense/intensity tags');
assert.equal(wonder.title,'Long Road Ahead','director wonder maps to mystical tags');
assert.equal(resolve.title,'Tempting Secrets','director resolve maps to uplifting tags');
assert.equal(new Set([tension.title,wonder.title,resolve.title]).size,3,'director mood materially changes otherwise identical score selection');

console.log('Automatic score tests passed');
fs.rmSync(isolatedHome,{recursive:true,force:true});
