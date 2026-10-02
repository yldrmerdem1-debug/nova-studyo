import {scriptScenes} from './checkpoints.js';

/** A user choice only becomes protected when it differs from the recommendation. */
export function recordDirectorPicks(script,candidates,recommended,submitted){
 if(!submitted||typeof submitted!=='object'||Array.isArray(submitted))throw Error('Görsel seçimleri geçersiz.');
 const picks={},changed={};
 for(const scene of scriptScenes(script)){
  const visuals=Array.isArray(scene.segment.visuals)&&scene.segment.visuals.length?scene.segment.visuals:[scene.segment.visual||{}];
  for(const [index,beatId] of scene.beatIds.entries()){
   const visual=visuals[index],key=`${visual.query}||${visual.type}`;
   const value=Object.hasOwn(submitted,beatId)?submitted[beatId]:recommended?.[beatId]??null;
   if(value!==null&&!(candidates?.[key]||[]).some(candidate=>candidate.id===value))throw Error(`${beatId}: görsel seçimi geçersiz.`);
   picks[beatId]=value;
   if(value!==null&&value!==(recommended?.[beatId]??null))changed[beatId]=value;
  }
 }
 return {picks,changed};
}

export function approvedCandidateOrder(ordered,pickedId,protectedId){
 return protectedId ? ordered.filter(candidate=>candidate.id===protectedId) : ordered;
}

export function verifyDirectorChoices(media,changed){
 for(const [beatId,candidateId] of Object.entries(changed||{})){
  const actual=media?.[beatId];
  if(!actual?.file||actual.adayId!==candidateId)throw Error(`${beatId}: seçtiğiniz kaynak indirilemedi veya farklı bir kaynak geldi. Başka aday seçin; otomatik yedek kullanılmadı.`);
  actual.manualChoice=true;
 }
 return media;
}
