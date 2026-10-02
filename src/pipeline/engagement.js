import { getStyleProfile } from './style-profile.js';

export function engagementInstructions(job = {}) {
  const profile = getStyleProfile(job.theme, job.editIntensity || 'balanced');
  return [
    `Açılış türü (${profile.name}): ${profile.hookGuidance}`,
    'İlk 10–15 saniyede somut bir olay, soru veya izleyicinin kazanacağı belirli bir bilgi ver. Selamlama, kanal tanıtımı ve genel konu listesiyle başlama.',
    'Merakın kanıtı araştırmada bulunmalı. Doğrulanmamış iddiayı kesin gerçek gibi sunma; desteklenmeyen rekor, sayı, gizli gerçek veya tehdit uydurma.',
    'Açılıştaki vaadin karşılığını ilerleyen bölümde açıkça ver; kapanış bu sorunun sonucunu bağlasın. Birden fazla cevapsız merak zinciri kurma.',
    'Bölümler önceki bilgiyi tekrar etmek yerine yeni kanıt, somut örnek veya açıklama eklesin. Haber ve eğitimde bilgi için yapay bekleme yaratma.',
  ].join('\n');
}

const scenes = script => (script?.sections || []).flatMap((s,si)=>(s.segments || []).map((g,gi)=>({id:`s${si}g${gi}`,text:String(g.text || ''),title:s.title || '',section:si})));
const norm = text => String(text || '').replace(/\s+/g,' ').trim();

/** Extractive coverage: every segment contributes; first-section truncation is forbidden. */
export function scriptBrief(script) {
  const rows = scenes(script);
  return (script?.sections || []).map((section,si)=>{
    const extracts = rows.filter(r=>r.section===si).map(r=>{
      const sentences = [...new Set(r.text.split(/(?<=[.!?…])\s+/).filter(Boolean))];
      const chosen = [...new Set([sentences[0],...sentences.filter(s=>/\d/.test(s)).slice(0,2),sentences.at(-1)])].filter(Boolean);
      return `[${r.id}] ${chosen.map(s=>s.length>260?s.slice(0,257)+'…':s).join(' ')}`;
    });
    return `Bölüm ${si+1}: ${section.title || ''}\n${extracts.join('\n')}`;
  }).join('\n\n');
}

export function validateSeoGrounding(seo, script) {
  const rows = new Map(scenes(script).map(r=>[r.id,norm(r.text)]));
  const evidence = seo.evidence || [], errors = [];
  (seo.titles || []).forEach((title,index)=>{
    const matches = evidence.filter(e=>e.titleIndex===index);
    if (!matches.length) errors.push(`Başlık ${index}: senaryodan kanıt alıntısı eksik`);
    for (const e of matches) if (!rows.has(e.segId) || norm(e.quote).length<12 || !rows.get(e.segId).includes(norm(e.quote))) errors.push(`Başlık ${index}: ${e.segId} kanıt alıntısı senaryoda yok`);
  });
  const full = [...rows.values()].join(' ');
  const supportedNumbers = new Set(full.match(/\d+(?:[.,]\d+)*/g) || []);
  for (const text of [...(seo.titles || []),seo.thumbnailText || '']) for (const number of text.match(/\d+(?:[.,]\d+)*/g)||[]) if (!supportedNumbers.has(number)) errors.push(`Başlık/kapak sayısı senaryoda yok: ${number}`);
  return [...new Set(errors)];
}

/** Review findings are observable checks, never a predicted engagement score. */
export function publicationAudit(script, seo = {}) {
  const rows = scenes(script), warnings = [];
  for (const message of validateSeoGrounding(seo,script)) warnings.push({code:message.includes('sayısı')?'unsupported-number':'title-evidence',message});
  const opening = rows[0]?.text || '', ending = rows.at(-1)?.text || '';
  if (/^(merhaba|hoş geldiniz|bu videoda|welcome|in this video)/i.test(opening)) warnings.push({code:'generic-opening',message:'Açılış genel tanıtımla başlıyor; somut soruyu veya olayı öne alın.'});
  if (!/[?？]/.test(seo.pinnedComment || '')) warnings.push({code:'pinned-question',message:'Sabit yorumda videodaki bir karar/kanıt hakkında açık bir soru olmalı.'});
  if (!ending) warnings.push({code:'missing-ending',message:'Açılış vaadinin sonucunu değerlendirmek için kapanış metni eksik.'});
  return {opening,ending,sectionCount:script?.sections?.length || 0,segmentCount:rows.length,warnings,
    reviewRequired:['Başlık ve kapak aynı somut vaadi taşıyor mu?','Açılıştaki soru kapanışa kadar kanıtla cevaplanıyor mu?','Sabit yorum videodaki belirli bir örneği tartışmaya açıyor mu?'],
    note:'Otomatik kontroller anlam doğruluğunu veya izleyici tutmayı garanti etmez; yayın öncesi editör incelemesi gerekir.'};
}
