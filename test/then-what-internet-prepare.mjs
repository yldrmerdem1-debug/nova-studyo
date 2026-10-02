import fs from 'node:fs';import path from 'node:path';
process.env.NOVA_HOME='C:/Users/erdem/Videos/Nova Studyo';
const {getSettings}=await import('../src/config.js');const {newJobFromRequest}=await import('../src/pipeline/index.js');const {createJob,jobDir,updateJob}=await import('../src/store.js');const {writeJson,mapLimit}=await import('../src/util.js');
const {title,sections,fullText}=await import('./then-what-internet-content.mjs');
const review=path.join(process.env.NOVA_HOME,'quality-review/then-what-internet');fs.mkdirSync(review,{recursive:true});
const pointer=path.join(review,'job-id.txt');let job;
if(fs.existsSync(pointer)){job=JSON.parse(fs.readFileSync(path.join(process.env.NOVA_HOME,'data/jobs',fs.readFileSync(pointer,'utf8').trim(),'job.json')));}else{job=newJobFromRequest({topic:title,theme:'belgesel',language:'en',elevenVoiceId:'nPczCjzI2devNBz1zQrb',durationPreset:'standart',ratio:'16:9',visualStyle:'editorial',mediaKind:'mixed',aiSupport:'off',subtitleMode:'classic',mediaMode:'manual',soundDesign:true,sfxVolume:.10,editIntensity:'balanced'});createJob(job);fs.writeFileSync(pointer,job.id);}
const dir=jobDir(job.id);fs.mkdirSync(path.join(dir,'media'),{recursive:true});fs.mkdirSync(path.join(dir,'tts'),{recursive:true});
writeJson(path.join(dir,'content.json'),{title,sections});fs.writeFileSync(path.join(dir,'narration.txt'),fullText);updateJob(job.id,{status:'running',stage:'media',progress:15,message:'Then What senaryosu ve görselleri hazırlanıyor',meta:{title}});
console.log(JSON.stringify({id:job.id,dir,words:fullText.split(/\s+/).length}));
const queries=['smartphone city','payment terminal','grocery store','warehouse workers','delivery truck','shipping containers','doctor paperwork','hospital corridor','server room','network cables','airplane flying','electricity power station','radio studio','paper map','office laptop','people market','community meeting','computer technician','writing notebook','city night','coffee machine','computer typing','satellite earth','mobile phone'];
const dest=path.join(review,'stock');fs.mkdirSync(dest,{recursive:true});let all=[];
const key=getSettings().pexelsKey;if(!key)throw Error('Pexels key unavailable');
const result=await mapLimit(queries,3,async(query,qi)=>{
 const cache=path.join(dest,`q${qi}.json`);let data;
 if(fs.existsSync(cache))data=JSON.parse(fs.readFileSync(cache));else{const res=await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8&orientation=landscape`,{headers:{Authorization:key},signal:AbortSignal.timeout(45000)});if(!res.ok)throw Error(`Pexels HTTP ${res.status}`);data=await res.json();writeJson(cache,data);}
 const out=(data.videos||[]).map(v=>{const files=(v.video_files||[]).filter(f=>f.file_type==='video/mp4'&&f.height>=720&&f.width/f.height>1.5&&f.width/f.height<2.05).sort((a,b)=>Math.abs(a.height-1080)-Math.abs(b.height-1080));if(!files[0]||v.duration<6)return null;return {id:`q${qi}v${v.id}`,query,pexelsId:v.id,title:v.url.split('/').filter(Boolean).at(-1).replace(/[-_0-9]+/g,' '),url:files[0].link,thumb:v.image,width:files[0].width,height:files[0].height,duration:v.duration,provider:'pexels',type:'video',lisans:'Pexels License',lisansUrl:'https://www.pexels.com/license/',sahip:v.user?.name,sayfa:v.url};}).filter(Boolean).slice(0,3);
 for(const c of out){c.preview=path.join(dest,c.id+'.jpg');if(!fs.existsSync(c.preview)){const r=await fetch(c.thumb,{signal:AbortSignal.timeout(45000)});if(r.ok)fs.writeFileSync(c.preview,Buffer.from(await r.arrayBuffer()));}}
 console.log(query+': '+out.length);return out;
});
for(const r of result){if(r.ok)all.push(...r.value);else console.log('Search failed: '+r.error.message);}writeJson(path.join(review,'stock-candidates.json'),all);
