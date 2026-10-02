import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
process.env.NOVA_HOME='C:/Users/erdem/Videos/Nova Studyo';
const {jobDir,updateJob}=await import('../src/store.js');
const {getSettings}=await import('../src/config.js');
const {run}=await import('../src/util.js');
const review=path.join(process.env.NOVA_HOME,'quality-review/then-what-internet');
const id=fs.readFileSync(path.join(review,'job-id.txt'),'utf8').trim(),dir=jobDir(id);
const plan=JSON.parse(fs.readFileSync(path.join(dir,'directed-edit-plan.json')));
const stock=JSON.parse(fs.readFileSync(path.join(dir,'stock-assets.json')));
const music=[...new Map(JSON.parse(fs.readFileSync(path.join(dir,'sound-plan.json'))).music.map(m=>[m.title,m])).values()];
const title='What If the Internet Disappeared for 30 Days?';
const times=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const chapters=plan.sections.map(s=>`${times(s.start)} ${s.title}`).join('\n');
const references=[
 ['Internet Society — how the Internet connects','https://www.internetsociety.org/resources/doc/2020/internet-impact-assessment-toolkit/critical-properties-of-the-internet/'],
 ['Square US — offline payment limits','https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode'],
 ['US SAFER Guide — healthcare downtime procedures','https://www.healthit.gov/sites/default/files/topiclanding/2025-01/2.%20Contingency%20Planning%20Final.pdf'],
 ['IMO — digital coordination in shipping','https://www.imo.org/en/mediacentre/pressbriefings/pages/maritime-single-window-advancing-digitalization-in-shipping.aspx'],
 ['GPS.gov — satellite positioning','https://www.gps.gov/gps'],
 ['FAA — aviation communications','https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html'],
 ['NIST — operational technology systems','https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=956505']
];
const musicText=music.map(m=>`"${m.title}" — ${m.artist}\n${m.sourceUrl}`).join('\n\n');
const description=`Your phone has full bars. The lights are on. So why can't you buy breakfast?

What if the public Internet stopped connecting the world's networks for 30 days? Follow the chain from a payment terminal to delivery trucks, hospitals, local communities and the difficult moment when the connection finally returns.

Some systems would keep working. Others would lose something harder to replace: the ability to coordinate.

This is a thought experiment, not a prediction. We assume public Internet interconnection is unavailable while electricity, stored data, local networks and some dedicated communications remain. The timeline is illustrative; effects would vary by system and location.

What would you miss first—and what would surprise you by still working? Tell us in the comments. Subscribe to Then What for more questions that change how you see everyday life.

CHAPTERS
${chapters}

SOURCES AND FURTHER READING
${references.map(([name,url])=>`${name}\n${url}`).join('\n\n')}

VISUALS
Illustrative footage from Pexels, AI-generated scenes and original animated diagrams. These images do not document a real global outage.

MUSIC
${musicText}

Licensed under Creative Commons Attribution 4.0:
https://creativecommons.org/licenses/by/4.0/
Music excerpts edited, faded and mixed with narration.

#WhatIf #Internet #ThenWhat`;
if(title.length>100||description.length>5000)throw Error('YouTube text length exceeded');
const tags=['what if','internet outage','30 days without internet','global internet shutdown','Then What','how the internet works','offline payments','supply chains','GPS','thought experiment'];
const pinnedComment='The Internet is gone for 30 days, but the power stays on. What would cause the biggest problem in your daily life—and what could you still do offline?';
fs.writeFileSync(path.join(dir,'youtube-title.txt'),title+'\n');
fs.writeFileSync(path.join(dir,'youtube-description.txt'),description+'\n');
fs.writeFileSync(path.join(dir,'youtube-pinned-comment.txt'),pinnedComment+'\n');
fs.writeFileSync(path.join(dir,'seo.json'),JSON.stringify({title,titles:[title],description,tags,thumbnailText:'30 DAYS OFFLINE',pinnedComment},null,2));
fs.writeFileSync(path.join(dir,'seo.md'),`# ${title}\n\n${description}\n\n## Pinned comment\n\n${pinnedComment}\n`);
await run(getSettings().ffmpegPath,['-v','error','-i',path.join(dir,'thumbnail.png'),'-vf','scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720','-frames:v','1','-q:v','2','-y',path.join(dir,'thumbnail.jpg')]);
if(fs.statSync(path.join(dir,'thumbnail.jpg')).size>2*1024*1024)throw Error('Cover exceeds upload size');
const usedKeys=[...new Set(plan.beats.map(b=>b.key))],usedStock=usedKeys.filter(k=>stock[k]);
const credits=`# Production credits — ${title}

Original English script and directed edit for Then What. Narration: ElevenLabs Brian, using the previously approved premium voice. Rendered with Nova Studio's shot, transition, subtitle, sound-design and audio-mastering engines. Production recipe: test/then-what-internet-render.mjs.

${plan.beats.length} editorial shots: ${plan.beats.filter(b=>stock[b.key]).length} stock-video shots, ${plan.beats.filter(b=>b.key.startsWith('g_')).length} original-diagram shots, ${plan.beats.filter(b=>!stock[b.key]&&!b.key.startsWith('g_')).length} original AI-illustration shots. Some source assets recur as deliberate visual callbacks.

## Music

${music.map(m=>`- **${m.title}**, ${m.artist}. [Source](${m.sourceUrl}). [${m.license}](${m.licenseUrl}). ISRC: ${m.isrc}. Excerpts, fades, gain adjustment and mix beneath narration.`).join('\n')}

## Illustrative stock footage

Pexels footage is illustrative, not reporting of an actual global outage. No endorsement by the people pictured is implied. Clips are excerpted, reframed where necessary, lightly graded, and overlaid with English captions. [Pexels License](https://www.pexels.com/license/).

${usedStock.map(k=>{const a=stock[k];return `- ${k}: **${a.title.trim()}**, ${a.sahip}. [Original video](${a.sayfa}). ${a.lisans}.`;}).join('\n')}

## Original visuals

- Five AI-generated scene illustrations: checkout, warehouse, hospital, community noticeboard and network engineers. Generated with OpenAI ImageGen for this production; fictional representative scenes.
- Original AI-generated cover: phone with crossed-out Wi-Fi symbol and a lit city, text "30 DAYS OFFLINE".
- Seven original animated diagrams: network interconnection, scenario rules, payment dependency, Square US 72-hour upload example, supply-chain information flow, GPS versus online maps, and reconnection versus recovery. Created in code for this production. Diagram return shots use adjusted source offsets so completed explanations remain visible.

## Research

The premise is hypothetical, and exact effects/timing are illustrative. Source checks distinguish real present-day system capabilities from speculative global consequences.

${references.map(([name,url])=>`- [${name}](${url})`).join('\n')}

Additional primary references: [ECB cash and crisis analysis](https://www.ecb.europa.eu/press/economic-bulletin/articles/2025/html/ecb.ebart202506_02~1a773e2ca3.en.html), [FEMA emergency communications](https://emilms.fema.gov/is_0802a/assets/1B331E24-A50B-BCFA-2B1A-C95C6EC100EB.pdf), [GSMA dedicated IPX networks](https://www.gsma.com/newsroom/wp-content/uploads/IR.34-v20.0-2.pdf).
`;
fs.writeFileSync(path.join(dir,'credits.md'),credits);
console.log(JSON.stringify({metadataReady:true,title,descriptionCharacters:description.length,stockSources:usedStock.length,musicTracks:music.length}));
if(process.argv.includes('--metadata-only'))process.exit(0);
const qa=JSON.parse(fs.readFileSync(path.join(review,'verification.json')));
const visual=JSON.parse(fs.readFileSync(path.join(review,'visual-review.json')));
const sha=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
if(qa.sha256!==sha(path.join(dir,'output.mp4'))||qa.duration<660||qa.width!==1920||qa.height!==1080||qa.fps!=='30/1'||Number(qa.frames)!==plan.frames||qa.decodeErrors!==0||qa.unexpectedBlack.length||qa.audio.truePeakDb>-1.2||Math.abs(qa.audio.integratedLufs+14)>1.5)throw Error('Final verification failed');
if(visual.sha256!==qa.sha256||visual.reviewedShots!==plan.beats.length||visual.materialIssues.length||!visual.asrReviewed)throw Error('Human-visible frame review and ASR review must be recorded first');
const pack=path.join(process.env.NOVA_HOME,'Then What - 30 Days Offline');fs.mkdirSync(pack,{recursive:true});
for(const [src,dst] of [['output.mp4','Then What - 30 Days Offline.mp4'],['thumbnail.jpg','Kapak.jpg'],['thumbnail.png','Kapak - Original.png'],['youtube-title.txt','Baslik.txt'],['youtube-description.txt','Aciklama.txt'],['seo.md','Baslik ve Aciklama.md'],['youtube-pinned-comment.txt','Sabit Yorum.txt'],['subs.srt','English.srt'],['narration.txt','Narration.txt'],['credits.md','Credits.md']])fs.copyFileSync(path.join(dir,src),path.join(pack,dst));
if(sha(path.join(pack,'Then What - 30 Days Offline.mp4'))!==qa.sha256)throw Error('Delivery copy hash mismatch');
const notes=`Then What — 30 Days Offline\n\nBaşlık: ${title}\nVideo: ${qa.duration.toFixed(3)} saniye (${times(Math.round(qa.duration))}), 1920 × 1080, 16:9, 30 FPS, H.264 + AAC.\nSes: İngilizce, ElevenLabs Brian.\nKurgu: ${plan.beats.length} sahne; ${plan.beats.filter(b=>stock[b.key]).length} gerçek hareketli çekim içeren sahne, 7 özgün animasyonlu şema, 5 özgün AI sahne görseli.\nMüzik: 4 farklı Kevin MacLeod parçası, bölüm geçişleriyle eşleşen 5 müzik bloğu; anlatım sırasında otomatik seviye azaltma.\nSes ölçümü: ${qa.audio.integratedLufs} LUFS / ${qa.audio.truePeakDb} dBTP.\nAltyazı: videoya işlenmiş İngilizce altyazılar; SRT ayrıca bulunur.\n\nKontrol: video baştan sona hatasız çözüldü; süre, çözünürlük ve kare sayısı doğrulandı. ${visual.reviewedShots} sahnenin her birinden kareler ve seçilmiş tam boy grafik/altyazı/geçiş örnekleri gözle incelendi. Anlatım, son ses karışımının yerel otomatik konuşma çözümlemesiyle karşılaştırıldı. Bu kontroller insan dinlemesi değildir. Ayrıntılar kalite inceleme klasöründedir.\n\nBaşlık, açıklama, kapak ve sabit yorum hazırdır. Müzik atıflarını açıklamada koru. Credits.md bütün kaynakları içerir. Görseller varsayımsal bir olayı temsil eder; gerçek kesinti görüntüsü değildir.\n\nÜretim: Nova Studio motorları, bu video için yönlendirilmiş kurgu tarifi. YouTube'a yükleme yapılmadı.\nSHA256: ${qa.sha256}\n`;
fs.writeFileSync(path.join(pack,'Bilgi ve Kontrol.txt'),notes);
fs.writeFileSync(path.join(review,'Teslim-kontrolu.txt'),notes);
updateJob(id,{status:'done',stage:'done',progress:100,message:'Then What uzun videosu hazır',needsRerender:false,needsReview:false,qualityWarnings:[],quality:{profile:'belgesel',audio:qa.audio,visuals:visual,warnings:[]},outputs:{video:'output.mp4',thumbnail:'thumbnail.jpg',thumbs:['thumbnail.jpg'],seo:'seo.md',srt:'subs.srt'},meta:{title,durationSec:qa.duration,manualEditorialRecipe:'test/then-what-internet-render.mjs'}});
const planFile=path.join(review,'production-plan.md');fs.writeFileSync(planFile,fs.readFileSync(planFile,'utf8').replace(/- \[ \]/g,'- [x]').replace('approximately 90 motivated shots','142 motivated shots'));
console.log(JSON.stringify({pack,job:id,title,duration:qa.duration,sha256:qa.sha256,audio:qa.audio}));
