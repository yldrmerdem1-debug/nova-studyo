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

/*
 * YAZIYLA SAYILAR. ÖLÇÜLEN KUSUR (20261024-373aaf, 25 Ekim 2026): anlatım sayıyı seslendirme için yazıyla yazar
 * ("Twelve days separated the impact…"), denetim yalnızca rakamları sayıyordu; "12" geçen başlık 3. denemede
 * "Başlık/kapak sayısı senaryoda yok: 12" diye reddedildi ve SEO eksik kaldı (15 iş günlüğünde aynı ret).
 * İngilizce sayı sözcükleri değere çevrilir: "thirty-two" → 32, "fifty million" → 50000000 ve "$50 Million" için 50.
 */
const UNITS = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const SCALES = {hundred:100,thousand:1e3,million:1e6,billion:1e9};
const NUMBER_WORD = Object.keys({...UNITS,...SCALES}).sort((a,b)=>b.length-a.length).join('|');
const NUMBER_PHRASE = new RegExp(`\\b(?:${NUMBER_WORD})(?:[\\s\\u2010\\u2011-]+(?:${NUMBER_WORD}))*\\b`,'g');
export function spelledNumbers(text) {
  const out = [], flat = String(text || '').toLowerCase().replace(/\b(hundred|thousand|million|billion) and (?=[a-z])/g,'$1 ');
  for (const phrase of flat.match(NUMBER_PHRASE) || []) {
    let total = 0, current = 0, prev = null;
    const flush = () => { if (prev !== null) out.push(total+current); total = current = 0; prev = null; };
    for (const w of phrase.split(/[\s\u2010\u2011-]+/)) {
      if (w in SCALES) {
        if (w === 'hundred') current = (current || 1)*100;
        else { out.push(current || 1); total += (current || 1)*SCALES[w]; current = 0; }
      } else {
        // "twenty two" tek sayı; "two three" ya da "nineteen fifty" iki ayrı sayı.
        if (prev !== null && !(prev in SCALES) && !(UNITS[prev]>=20 && UNITS[prev]%10===0 && UNITS[w]<10)) flush();
        current += UNITS[w];
      }
      prev = w;
    }
    flush();
  }
  return out;
}
// "4,000" ile "4000" aynı sayı: binlik ayırıcı düşer, ondalık ("2.5") kalır.
const plainNumber = n => /^\d{1,3}(?:[.,]\d{3})+$/.test(n) ? n.replace(/[.,]/g,'') : n;

export function validateSeoGrounding(seo, script) {
  const rows = new Map(scenes(script).map(r=>[r.id,norm(r.text)]));
  const evidence = seo.evidence || [], errors = [];
  (seo.titles || []).forEach((title,index)=>{
    const matches = evidence.filter(e=>e.titleIndex===index);
    if (!matches.length) errors.push(`Başlık ${index}: senaryodan kanıt alıntısı eksik`);
    for (const e of matches) if (!rows.has(e.segId) || norm(e.quote).length<12 || !rows.get(e.segId).includes(norm(e.quote))) errors.push(`Başlık ${index}: ${e.segId} kanıt alıntısı senaryoda yok`);
  });
  const full = [...rows.values()].join(' ');
  const supportedNumbers = new Set([...(full.match(/\d+(?:[.,]\d+)*/g) || []).map(plainNumber),...spelledNumbers(full).map(String)]);
  for (const text of [...(seo.titles || []),seo.thumbnailText || '']) for (const number of text.match(/\d+(?:[.,]\d+)*/g)||[]) if (!supportedNumbers.has(plainNumber(number))) errors.push(`Başlık/kapak sayısı senaryoda yok: ${number}`);
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
