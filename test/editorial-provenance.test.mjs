import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-provenance-'));process.env.NOVA_HOME=home;process.env.TEMP=home;process.env.TMP=home;
const media=await import('../src/pipeline/media.js');const {kunyeUret,muzikKunyesi}=await import('../src/pipeline/kunye.js');
const {renderSeoMarkdown}=await import('../src/pipeline/seo.js');
test('Wikipedia image resolves Commons author, exact license and license/source URLs',async()=>{
 assert.equal(typeof media.resolveCommonsImage,'function');
 let requested='';const out=await media.resolveCommonsImage('https://upload.wikimedia.org/wikipedia/commons/a/ab/Test_image.jpg',async url=>{requested=url;return {query:{pages:{1:{title:'File:Test image.jpg',imageinfo:[{descriptionurl:'https://commons.wikimedia.org/wiki/File:Test_image.jpg',extmetadata:{Artist:{value:'<a href="https://example.org/ada">Ada Author</a>'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}}]}}}};});
 assert.match(requested,/extmetadata/);assert.equal(out.sahip,'Ada Author');assert.equal(out.lisans,'CC BY-SA 4.0');assert.match(out.lisansUrl,/by-sa\/4.0/);assert.match(out.sayfa,/commons/);assert.equal(out.permissionVerified,true);
 assert.equal(await media.resolveCommonsImage('https://upload.wikimedia.org/wikipedia/en/a/ab/Portrait.jpg',()=>{throw Error('must not fetch');}),null);
});
test('unknown/missing permissions and restricted licenses cannot enter candidate pool',async()=>{
 assert.equal(typeof media.permissionUsable,'function');
 for(const m of [{provider:'wikipedia',lisans:'Wikimedia Commons (serbest)'},{provider:'archive'},{provider:'openverse',lisans:'BY-NC 4.0'}, {provider:'wikimedia',lisans:'CC BY 4.0',sayfa:'https://example.org',lisansUrl:'https://creativecommons.org/licenses/by/4.0/'}]) assert.equal(media.permissionUsable(m),false);
 assert.equal(media.permissionUsable({provider:'wikimedia',lisans:'CC BY 4.0',sahip:'Ada',sayfa:'https://example.org',lisansUrl:'https://creativecommons.org/licenses/by/4.0/'}),true);
 assert.equal(media.permissionUsable({provider:'nasa',lisans:'Not public domain',sayfa:'https://example.org'}),false);
});
test('credits preserve license URLs, source and truthful modification notice',()=>{
 const result=kunyeUret({a:{file:'a.jpg',provider:'wikimedia',sahip:'Ada',eser:'Work',lisans:'CC BY 4.0',lisansUrl:'https://creativecommons.org/licenses/by/4.0/',sayfa:'https://example.org/work',modifications:'Kırpma ve renk düzenlemesi'}});
 assert.match(result.metin,/https:\/\/example.org\/work/);assert.match(result.metin,/https:\/\/creativecommons.org\/licenses\/by\/4.0/);assert.match(result.metin,/Kırpma/);
 const unknown=kunyeUret({a:{file:'a.jpg',provider:'archive'}});assert.match(unknown.metin,/doğrulanamadı/);
 const sourceUrl=kunyeUret({a:{file:'a.jpg',provider:'archive',sahip:'U.S. Navy',eser:'Film',lisans:'Public domain',sourceUrl:'https://example.org/navy-film'}});
 assert.match(sourceUrl.metin,/https:\/\/example\.org\/navy-film/);
});
test('multiple generated scenes receive one clear AI disclosure in publication credits',()=>{
 const result=kunyeUret({
  first:{file:'first.jpg',provider:'ai',eser:'Codebreaking reconstruction',lisans:'AI-generated illustration'},
  second:{file:'second.jpg',provider:'ai',eser:'Carrier deck reconstruction',lisans:'AI-generated illustration'},
  archive:{file:'archive.jpg',provider:'wikimedia',sahip:'U.S. Navy',eser:'Yorktown',lisans:'Public domain',sayfa:'https://commons.wikimedia.org/wiki/File:Yorktown.jpg'},
 },{dil:'en'});
 assert.equal(result.metin.match(/Some scenes were generated with AI\./g)?.length,1);
 assert.match(result.metin,/Yorktown/);
});
test('YouTube description stays within 5000 characters while retaining required image and music credits',()=>{
 const images=Object.fromEntries(Array.from({length:30},(_,i)=>[`pd${i}`,{
  file:`pd${i}.jpg`,provider:'wikimedia',sahip:'U.S. Navy',eser:`Midway archive photograph number ${i} of operational scene`,
  lisans:'Public domain',sayfa:`https://commons.wikimedia.org/wiki/File:Midway_1942_archival_photograph_${i}_with_source_metadata.jpg`,
  modifications:'Framing, subtle camera movement and color grade',
 }]));
 images.licensed={file:'licensed.jpg',provider:'wikimedia',sahip:'Ada Author',eser:'Licensed chart',lisans:'CC BY 4.0',lisansUrl:'https://creativecommons.org/licenses/by/4.0/',sayfa:'https://example.org/chart',modifications:'Cropping and grade'};
 images.ai={file:'ai.jpg',provider:'ai',eser:'Interpretive reconstruction'};
 const markdown=renderSeoMarkdown({language:'en',topic:'Midway'}, {title:'Midway Documentary'},
  {description:'A historically grounded overview. '.repeat(30),tags:['Midway'],thumbnailText:'FOUR MINUTES'},
  [{start:0,title:'Opening'}],714,images,[{file:'Constance.mp3',title:'Constance',artist:'Kevin MacLeod',sourceUrl:'https://example.org/music',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'}]);
 const description=markdown.split('## Açıklama (kopyala-yapıştır)\n```\n')[1].split('\n```')[0];
 assert.ok(description.length<=5000,`description has ${description.length} characters`);
 assert.match(description,/Ada Author/);
 assert.match(description,/https:\/\/example\.org\/chart/);
 assert.match(description,/Constance/);
 assert.match(description,/Some scenes were generated with AI/);
});
test('music filenames never imply YouTube Audio Library origin',()=>{
 const result=muzikKunyesi(['yatak-ilham-sunrise--ada.mp3']);assert.doesNotMatch(result.metin,/YouTube Audio Library/);assert.match(result.metin,/doğrulanamadı/);
});
