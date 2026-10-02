import {usesAutomaticEditor} from '../../public/production-modes.js';

const MAX_SLOTS=6;
const SECONDS_PER_SHOT=9;

function eligible(job) {
  return usesAutomaticEditor(job) &&
    job?.visualStyle!=='kolaj' && !job?.demo;
}

function wordMatches(text) {
  return [...String(text||'').matchAll(/\S+/gu)];
}

function anchorsFor(text,count) {
  const source=String(text||'').trim();
  const sentences=source.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/gu)?.map(x=>x.trim()).filter(Boolean)||[];
  if(sentences.length>=count) return sentences.slice(0,count);
  const words=wordMatches(source);
  if(!words.length) return [];
  const anchors=[];
  for(let i=0;i<count;i++) {
    const from=Math.floor(i*words.length/count),to=Math.max(from,Math.floor((i+1)*words.length/count)-1);
    const start=words[from]?.index,end=(words[to]?.index||0)+(words[to]?.[0]?.length||0);
    const quote=source.slice(start,end).trim();
    if(quote && !anchors.includes(quote)) anchors.push(quote);
  }
  return anchors;
}

export function ensureEditorialCoverage(job,script) {
  if(!eligible(job)) return script;
  const wordsPerSecond=job?.language==='en'?2.3:2.0;
  for(const section of script?.sections||[]) for(const segment of section?.segments||[]) {
    const visuals=Array.isArray(segment?.visuals)?segment.visuals:null;
    if(!visuals?.length) continue;
    const wordCount=wordMatches(segment.text).length;
    const duration=wordCount/wordsPerSecond;
    const desired=Math.min(MAX_SLOTS,Math.max(1,Math.ceil(duration/SECONDS_PER_SHOT)));
    if(desired<=visuals.length) continue;
    const anchors=anchorsFor(segment.text,desired);
    const used=new Set(visuals.map(v=>String(v?.anchorQuote||'').trim()).filter(Boolean));
    const sourceVisuals=visuals.slice();
    const uncovered=used.size ? anchors : anchors.slice(Math.min(visuals.length,anchors.length));
    let sourceIndex=0;
    for(const anchorQuote of uncovered) {
      if(visuals.length>=desired) break;
      if(used.has(anchorQuote)) continue;
      const source=sourceVisuals[sourceIndex++%sourceVisuals.length];
      if(!source?.query) continue;
      visuals.push({...source,type:source.type==='ai'?'video':source.type, prompt:source.type==='ai'?'':source.prompt,anchorQuote});
      used.add(anchorQuote);
    }
  }
  return script;
}
