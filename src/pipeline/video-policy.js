import { usesStockVideo } from '../../public/production-modes.js';

const STATIC_KIND = new Set(['document','map','chart','diagram','screenshot']);
const STATIC_QUERY = /\b(portrait|headshot|photograph|photo|document|manuscript|letter|newspaper|map|diagram|chart|graph|blueprint|poster|painting|engraving|statue|logo)\b/i;

export function videoEligible(visual = {}) {
  if (visual.type === 'ai' || STATIC_KIND.has(String(visual.kind || '').toLowerCase())) return false;
  return !STATIC_QUERY.test(String(visual.query || ''));
}

export function shouldSearchVideo(job = {}, visual = {}) {
  return usesStockVideo(job) && videoEligible(visual);
}

function evidence(candidate) {
  if(candidate.hardMismatch||candidate.yer==='baska'||candidate.defects?.length||candidate.motionSatisfied===false||Number.isFinite(candidate.videoTutarlilik)&&candidate.videoTutarlilik<2)return false;
  if (Number.isFinite(candidate.onGorsel)) {
    return candidate.onGorsel >= 2 && (!Number.isFinite(candidate.onKalite) || candidate.onKalite >= 1);
  }
  return !!candidate.metin && Number(candidate.alaka) >= .45;
}

export function preferRelevantVideo(list = [], job = {}, visual = {}) {
  const ordered=[...list];
  if (!shouldSearchVideo(job,visual) || !ordered.length) return ordered;
  const bestStill=ordered.find(c=>c.type==='image');
  const floor=(bestStill?.score ?? ordered[0]?.score ?? 0)-32;
  const videos=ordered.filter(c=>c.type==='video' && evidence(c) && Number(c.score||0)>=floor &&
    (!Number.isFinite(c.duration) || c.duration>=3) && (!Number.isFinite(c.width) || c.width>=640));
  if (!videos.length) return ordered;
  videos.sort((a,b)=>(b.onGorsel??-1)-(a.onGorsel??-1)||(b.onKalite??-1)-(a.onKalite??-1)||(b.score||0)-(a.score||0));
  const chosen=videos[0];
  return [chosen,...ordered.filter(c=>c!==chosen)];
}
