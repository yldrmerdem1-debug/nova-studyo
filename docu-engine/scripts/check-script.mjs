// Uzun senaryo denetçisi: node scripts/check-script.mjs <script.json> [--min-words 1350] [--max-chars 11000]
// Motorun ve seslendirmenin sessizce bozulacağı her şeyi üretimden ÖNCE yakalar (ücretli adım yok).
import { readFileSync } from 'node:fs';
import { digitValues, sameNumber, spokenNumbers, spokenOf } from '../src/infographics/timing.js';

const file = process.argv[2];
const arg = (k, d) => (process.argv.includes(k) ? Number(process.argv[process.argv.indexOf(k) + 1]) : d);
const MIN_WORDS = arg('--min-words', 1350);
const MAX_CHARS = arg('--max-chars', 11000);
const GENRES = ['documentary', 'finance', 'horror', 'crime', 'epic', 'science', 'inspire'];
const MOODS = ['curious', 'calm', 'tension', 'dread', 'reveal', 'sad', 'triumph'];
/** İnfografikler (src/infographics): kendi görselini çizer; her sayı ve etiket anlatımdan. */
const INFO = ['bars', 'donut', 'icons', 'scale', 'flow', 'stat'];
const ICONS = ['person', 'ship', 'plane', 'coin', 'house', 'soldier', 'bill', 'building'];
const TYPES = ['title', 'slam', 'counter', 'photo', 'words', 'chart', 'montage', 'headline', 'map', 'board', 'document', 'timeline', 'split', 'quote', ...INFO];
const REGIONS = ['pacific-northwest', 'bosphorus', 'north-atlantic', 'urals', 'wall-street', 'solar-system', 'world'];
const TRANS = ['cut', 'flash', 'zoom', 'glitch', 'blackout', 'whip', 'leak'];
const DOC_KINDS = ['fbi-teletype', 'letter', 'report', 'telegram', 'ledger'];
const ARROWS = ['left', 'right', 'up', 'down'];
/** Kurgu aygıtları kendi görselini çizer (pano, bölünmüş ekran, zaman çizelgesi, yazılı belge, önceki sahnenin portresiyle alıntı). */
const noOwnPicture = (sc) =>
  ['board', 'timeline', 'map', ...INFO].includes(sc.type) || (sc.type === 'split' && !(sc.left?.own || sc.right?.own)) || (sc.type === 'document' && !!sc.doc?.lines?.length) || (sc.type === 'quote' && Number.isInteger(sc.fromScene));

const s = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
const errors = [];
const warns = [];
const strip = (t) => String(t || '').replace(/\[[^\]]*\]/g, ' ');
const tokens = (t) => strip(t).toLocaleLowerCase('tr-TR').replace(/[.,!?;:"“”'’()\-—…]/g, ' ').split(/\s+/).filter(Boolean);
const hasToken = (say, w) => {
  const sw = tokens(say);
  const ww = tokens(w);
  if (!ww.length) return false;
  for (let i = 0; i + ww.length <= sw.length; i++) {
    if (ww.every((x, k) => sw[i + k] === x || (x.length >= 4 && sw[i + k].startsWith(x)))) return true;
  }
  return false;
};

/*
 * İnfografik sayıları anlatımda (sahnenin ya da komşusunun `say` satırında) SÖYLENMELİ:
 * rakamla ("$5,800", "13,8 milyar") ya da yazıyla ("nine out of ten", "onda dokuzu").
 * Motorun kendi ayrıştırıcısı (src/infographics/timing.js) — ekrandaki sayı sesle aynı olsun.
 */
const said = (i) => {
  const text = s.scenes.slice(Math.max(0, i - 1), i + 2).map((x) => strip(x?.say)).join(' ');
  const sp = spokenOf(text.split(/\s+/).filter(Boolean).map((word, k) => ({ word, t: k })));
  const nums = spokenNumbers(sp);
  return (v) => nums.some((x) => sameNumber(Number(v), x.values));
};
const digitGroups = (t) => [...String(t || '').matchAll(/\d[\d.,]*\d|\d/g)].map((m) => digitValues(m[0]));

/** A `fromScene` points at an EARLIER scene of this file (indices as written, before chapter cards) that has a picture. */
function refCheck(at, what, ref, i) {
  if (ref?.fromScene == null) return;
  const j = ref.fromScene;
  if (!Number.isInteger(j) || j < 0 || j >= i) {
    errors.push(`${at}: ${what} fromScene ${j} önceki bir sahnenin indeksi olmalı`);
    return;
  }
  const t = s.scenes[j];
  if (!t || noOwnPicture(t) || ['counter', 'chart', ...INFO].includes(t.type)) errors.push(`${at}: ${what} fromScene ${j} görseli olmayan bir sahne (${t?.type})`);
}

if (!GENRES.includes(s.genre)) errors.push(`genre geçersiz: ${s.genre}`);
if (!s.id || !s.title) errors.push('id ve title gerekli');
if (!Array.isArray(s.chapters) || s.chapters.length < 6) errors.push('en az 6 bölüm (chapters) gerekli');
if (!s.visualStyle) errors.push('visualStyle gerekli');
const cast = s.cast || {};
let words = 0;
let chars = 0;
const perChapter = {};
const typeCount = {};
const names = {};
let lastType = '';
let run = 0;
s.scenes.forEach((sc, i) => {
  const at = `sahne ${i} (${sc.type})`;
  if (!TYPES.includes(sc.type)) errors.push(`${at}: tip geçersiz`);
  if (sc.mood && !MOODS.includes(sc.mood)) errors.push(`${at}: mood geçersiz ${sc.mood}`);
  if (sc.transition && !TRANS.includes(sc.transition)) errors.push(`${at}: transition geçersiz`);
  if (typeof sc.dur !== 'number' || sc.dur <= 0) errors.push(`${at}: dur gerekli`);
  if (!Number.isInteger(sc.chapter) || sc.chapter < 0 || sc.chapter >= (s.chapters?.length || 0)) errors.push(`${at}: chapter indeksi geçersiz`);
  if (i > 0 && sc.chapter < s.scenes[i - 1].chapter) errors.push(`${at}: bölümler geriye gidemez`);
  if (sc.chapterCard) errors.push(`${at}: bölüm kartlarını pipeline ekler, senaryoya yazma`);
  const say = sc.say || '';
  if (!strip(say).trim()) errors.push(`${at}: say boş`);
  if (/\[[^\]]*[çğıöşüÇĞİÖŞÜ][^\]]*\]/.test(say)) errors.push(`${at}: v3 etiketleri İngilizce olmalı: ${say.slice(0, 60)}`);
  const w = tokens(say).length;
  words += w;
  chars += say.length;
  perChapter[sc.chapter] = (perChapter[sc.chapter] || 0) + w;
  if (w > 26) warns.push(`${at}: ${w} kelime — sahne uzun, ikiye böl`);
  typeCount[sc.type] = (typeCount[sc.type] || 0) + 1;
  run = sc.type === lastType ? run + 1 : 1;
  lastType = sc.type;
  if (run > 3) warns.push(`${at}: aynı tip ${run}. kez üst üste`);
  for (const c of sc.cast || []) if (!cast[c]) errors.push(`${at}: cast "${c}" tanımlı değil`);
  if (sc.source === 'archive' && !sc.search) errors.push(`${at}: archive sahnesi search ister`);
  if (!sc.image && !sc.bg && !sc.imagePrompt && !sc.imagePrompts && ['photo', 'words', 'title', 'slam'].includes(sc.type) && sc.type !== 'slam') errors.push(`${at}: imagePrompt gerekli`);
  if (sc.name) {
    if (sc.source !== 'archive') errors.push(`${at}: name (isim kartı) yalnızca archive sahnede`);
    names[sc.name] = (names[sc.name] || 0) + 1;
  }
  switch (sc.type) {
    case 'title': if (!sc.title) errors.push(`${at}: title gerekli`); break;
    case 'slam':
      if (!sc.word) errors.push(`${at}: word gerekli`);
      else if (!hasToken(say, sc.word)) errors.push(`${at}: slam kelimesi "${sc.word}" say içinde bütün kelime olarak geçmeli`);
      if (sc.word && sc.word.length > 12) warns.push(`${at}: slam kelimesi uzun (${sc.word.length} harf)`);
      break;
    case 'counter':
      if (typeof sc.to !== 'number') errors.push(`${at}: to sayı olmalı`);
      if (sc.to >= 1000 && sc.to <= 2100 && Number.isInteger(sc.to) && !sc.prefix && !sc.suffix && !sc.year) warns.push(`${at}: ${sc.to} bir yıl mı? year:true koy`);
      break;
    case 'photo':
      if (sc.annotate) {
        const a = sc.annotate;
        if (!(a.x >= 0 && a.x <= 1) || !(a.y >= 0 && a.y <= 1)) errors.push(`${at}: annotate x/y 0..1 olmalı (fotoğrafın üzerinde)`);
        if (!String(a.label || '').trim()) errors.push(`${at}: annotate label gerekli`);
        else if (a.label.length > 48) warns.push(`${at}: annotate label uzun (${a.label.length} harf) — iki satıra sığar ama kısa olsun`);
        if (a.r != null && !(a.r > 0 && a.r < 0.6)) errors.push(`${at}: annotate r, fotoğraf genişliğinin kesri olmalı (0..0.6)`);
        if (a.arrow && !ARROWS.includes(a.arrow)) errors.push(`${at}: annotate arrow left|right|up|down olmalı`);
        if (a.at != null && !(a.at >= 0 && a.at < Math.max(sc.dur, 1))) warns.push(`${at}: annotate at sahne süresinin içinde olmalı (saniye)`);
      }
      break;
    case 'board': {
      const items = Array.isArray(sc.items) ? sc.items : [];
      if (items.length < 2) errors.push(`${at}: board en az 2 öğe ister`);
      if (items.length > 9) warns.push(`${at}: board ${items.length} öğe — 9'dan fazlası küçük kalır`);
      items.forEach((it, k) => {
        if (!String(it?.label || '').trim()) errors.push(`${at}: öğe ${k} label ister`);
        refCheck(at, `öğe ${k}`, it, i);
      });
      for (const l of sc.links || []) if (!Array.isArray(l) || l.length !== 2 || !l.every((x) => Number.isInteger(x) && x >= 0 && x < items.length) || l[0] === l[1]) errors.push(`${at}: links [a, b] öğe indeksi çifti olmalı: ${JSON.stringify(l)}`);
      if (sc.focus != null && !(Number.isInteger(sc.focus) && sc.focus >= 0 && sc.focus < items.length)) errors.push(`${at}: focus öğe indeksi geçersiz`);
      break;
    }
    case 'document': {
      const d = sc.doc;
      if (d) {
        if (!DOC_KINDS.includes(d.kind)) errors.push(`${at}: doc.kind ${DOC_KINDS.join('|')} olmalı`);
        if (!Array.isArray(d.lines) || !d.lines.some((l) => String(l || '').trim())) errors.push(`${at}: doc.lines gerekli`);
        const all = (d.lines || []).join(' ').toLocaleLowerCase('tr-TR');
        if (sc.highlight && !all.includes(String(sc.highlight).toLocaleLowerCase('tr-TR'))) warns.push(`${at}: highlight "${sc.highlight}" satırlarda geçmiyor (kamera yakınlaşamaz)`);
        for (const r of sc.redact || []) if (!all.includes(String(r).toLocaleLowerCase('tr-TR'))) warns.push(`${at}: redact "${r}" satırlarda geçmiyor`);
      } else if (!sc.image && !sc.imagePrompt && !sc.search && sc.fromScene == null) errors.push(`${at}: document ya doc (yazılı belge) ya da taranmış görsel (image/search/imagePrompt/fromScene) ister`);
      if (sc.fromScene != null) refCheck(at, 'belge', sc, i);
      if (sc.stamp != null && typeof sc.stamp !== 'string' && sc.stamp !== true) errors.push(`${at}: stamp metin ya da true olmalı`);
      break;
    }
    case 'timeline': {
      const ev = Array.isArray(sc.events) ? sc.events : [];
      if (ev.length < 2) errors.push(`${at}: timeline en az 2 olay ister`);
      if (ev.length > 12) warns.push(`${at}: timeline ${ev.length} olay — 12'den fazlası kalabalık`);
      ev.forEach((e, k) => {
        if (e?.year == null || !String(e.year).trim() || !String(e?.label || '').trim()) errors.push(`${at}: olay ${k} year ve label ister`);
      });
      if (sc.focus != null && !(Number.isInteger(sc.focus) && sc.focus >= 0 && sc.focus < ev.length)) errors.push(`${at}: focus olay indeksi geçersiz`);
      if (sc.span && !(Array.isArray(sc.span) && sc.span.length === 2)) errors.push(`${at}: span [başlangıç, bitiş] olmalı`);
      if (sc.orient && !['horizontal', 'vertical'].includes(sc.orient)) errors.push(`${at}: orient horizontal|vertical olmalı`);
      break;
    }
    case 'split':
      for (const side of ['left', 'right']) {
        const p = sc[side];
        if (!p || (p.fromScene == null && !p.image && !p.own)) errors.push(`${at}: split.${side} fromScene, image ya da own ister`);
        else if (p.own && !(sc.image || sc.imagePrompt || sc.search)) errors.push(`${at}: split.${side} own — sahnenin kendi resmi yok`);
        else refCheck(at, `split.${side}`, p, i);
      }
      if (sc.left?.own && sc.right?.own) errors.push(`${at}: split'te yalnızca bir taraf own olabilir`);
      if (sc.mode && !['versus', 'before-after'].includes(sc.mode)) errors.push(`${at}: mode versus|before-after olmalı`);
      break;
    case 'quote':
      if (!String(sc.quote || '').trim()) errors.push(`${at}: quote gerekli`);
      if (!String(sc.who || '').trim()) errors.push(`${at}: who gerekli`);
      if (sc.quote && !hasToken(say, sc.quote.split(/\s+/).slice(0, 3).join(' '))) warns.push(`${at}: alıntı say içinde geçmiyor — kelimeler sesle eş zamanlı değil, okuma hızında belirir`);
      if (sc.fromScene != null) refCheck(at, 'portre', sc, i);
      break;
    case 'words':
      if (!sc.text) errors.push(`${at}: text gerekli`);
      if (sc.keyword && !tokens(sc.text).includes(tokens(sc.keyword)[0])) errors.push(`${at}: keyword text içinde geçmeli`);
      break;
    case 'chart': if (!Array.isArray(sc.points) || sc.points.length < 3) errors.push(`${at}: chart en az 3 nokta`); break;
    case 'headline':
      if (!String(sc.paper || '').trim()) errors.push(`${at}: paper (gazete adı) gerekli`);
      if (!String(sc.headline || '').trim()) errors.push(`${at}: headline gerekli`);
      else if (sc.headline.trim().split(/\s+/).length > 8) warns.push(`${at}: manşet 8 kelimeden uzun`);
      break;
    case 'map': {
      if (!REGIONS.includes(sc.region)) errors.push(`${at}: region geçersiz: ${sc.region}`);
      const pts = Array.isArray(sc.points) ? sc.points : [];
      if (!pts.length) errors.push(`${at}: map en az 1 nokta ister`);
      pts.forEach((p, k) => {
        if (!String(p?.label || '').trim() || !(p.x >= 0 && p.x <= 1) || !(p.y >= 0 && p.y <= 1)) errors.push(`${at}: nokta ${k} label ve 0..1 x/y ister`);
      });
      for (const r of sc.route || []) if (!Number.isInteger(r) || r < 0 || r >= pts.length) errors.push(`${at}: route indeksi geçersiz: ${r}`);
      if (sc.route && sc.route.length < 2) errors.push(`${at}: route en az 2 nokta`);
      if (sc.focus != null && !(Number.isInteger(sc.focus) && sc.focus >= 0 && sc.focus < pts.length)) errors.push(`${at}: focus indeksi geçersiz`);
      if (sc.line && !['route', 'barrier'].includes(sc.line)) errors.push(`${at}: line route|barrier olmalı`);
      break;
    }
    // ---- infografikler: biçim + "sayı anlatımda söylenmiş mi" ----
    case 'bars': {
      const has = said(i);
      const items = Array.isArray(sc.items) ? sc.items : [];
      if (items.length < 2) errors.push(`${at}: bars en az 2 öğe ister`);
      if (items.length > 8) warns.push(`${at}: bars ${items.length} öğe — 8'den fazlası küçük kalır`);
      items.forEach((it, k) => {
        if (!String(it?.label || '').trim()) errors.push(`${at}: öğe ${k} label ister`);
        if (typeof it?.value !== 'number' || !Number.isFinite(it.value) || it.value < 0) errors.push(`${at}: öğe ${k} value sayı (>= 0) olmalı`);
        else if (!has(it.value)) errors.push(`${at}: öğe ${k} değeri ${it.value} anlatımda geçmiyor (uydurma veri)`);
        if (it?.color != null && !/^#[0-9a-f]{6}$/i.test(it.color)) errors.push(`${at}: öğe ${k} color #rrggbb olmalı`);
      });
      if (sc.highlight != null && !(Number.isInteger(sc.highlight) && sc.highlight >= 0 && sc.highlight < items.length)) errors.push(`${at}: highlight öğe indeksi olmalı`);
      if (sc.unit != null && (typeof sc.unit !== 'string' || sc.unit.length > 14)) warns.push(`${at}: unit kısa bir metin olmalı ('$', '%', ' people')`);
      break;
    }
    case 'donut': {
      const has = said(i);
      const sl = Array.isArray(sc.slices) ? sc.slices : [];
      if (sl.length < 2) errors.push(`${at}: donut en az 2 dilim ister`);
      if (sl.length > 6) warns.push(`${at}: donut ${sl.length} dilim — 6'dan fazlası okunmaz`);
      sl.forEach((x, k) => {
        if (!String(x?.label || '').trim()) errors.push(`${at}: dilim ${k} label ister`);
        if (!(typeof x?.value === 'number' && x.value > 0)) errors.push(`${at}: dilim ${k} value pozitif sayı olmalı`);
      });
      // Söylenmeyen en fazla bir dilim: "geri kalanı" (100'den ya da söylenen toplamdan).
      const unsaid = sl.filter((x) => typeof x?.value === 'number' && !has(x.value));
      const sum = sl.reduce((a, x) => a + (Number(x?.value) || 0), 0);
      if (unsaid.length > 1 || (unsaid.length === 1 && !has(sum) && Math.abs(sum - 100) > 1)) errors.push(`${at}: donut değerleri anlatımda geçmiyor: ${unsaid.map((x) => x.value).join(', ')}`);
      if (sc.highlight != null && !(Number.isInteger(sc.highlight) && sc.highlight >= 0 && sc.highlight < sl.length)) errors.push(`${at}: highlight dilim indeksi olmalı`);
      if (sc.centerLabel && String(sc.centerLabel).length > 24) warns.push(`${at}: centerLabel uzun`);
      break;
    }
    case 'icons': {
      const has = said(i);
      if (!Number.isInteger(sc.total) || sc.total < 1 || sc.total > 100) errors.push(`${at}: icons total 1-100 tam sayı`);
      if (!Number.isInteger(sc.filled) || sc.filled < 0 || sc.filled > sc.total) errors.push(`${at}: icons filled 0..total tam sayı`);
      if (!ICONS.includes(sc.icon)) errors.push(`${at}: icon ${ICONS.join('|')} olmalı`);
      if (!String(sc.label || '').trim()) errors.push(`${at}: icons label gerekli`);
      else if (sc.label.length > 60) warns.push(`${at}: icons label uzun (${sc.label.length} harf)`);
      if (Number.isInteger(sc.total) && Number.isInteger(sc.filled) && !((has(sc.filled) && has(sc.total)) || has((sc.filled / sc.total) * 100)))
        errors.push(`${at}: ${sc.filled}/${sc.total} anlatımda geçmiyor (uydurma veri)`);
      break;
    }
    case 'scale': {
      const has = said(i);
      for (const side of ['a', 'b']) {
        const x = sc[side];
        if (!x || !String(x.label || '').trim() || !(typeof x.value === 'number' && x.value > 0)) errors.push(`${at}: scale.${side} {label, value > 0} ister`);
        else if (!has(x.value)) errors.push(`${at}: scale.${side} değeri ${x.value} anlatımda geçmiyor (uydurma veri)`);
      }
      if (sc.a?.value > 0 && sc.b?.value > 0 && Math.max(sc.a.value, sc.b.value) / Math.min(sc.a.value, sc.b.value) < 1.5) warns.push(`${at}: scale — iki değer arasında ölçek farkı az (< 1.5x); bars daha uygun`);
      break;
    }
    case 'flow': {
      const nodes = Array.isArray(sc.nodes) ? sc.nodes : [];
      const ids = new Set(nodes.map((n) => String(n?.id ?? '')));
      if (nodes.length < 2) errors.push(`${at}: flow en az 2 düğüm ister`);
      if (nodes.length > 7) warns.push(`${at}: flow ${nodes.length} düğüm — 7'den fazlası küçük kalır`);
      if (ids.size !== nodes.length || nodes.some((n) => !String(n?.id ?? '').trim() || !String(n?.label || '').trim())) errors.push(`${at}: flow düğümleri benzersiz id ve label ister`);
      const edges = Array.isArray(sc.edges) ? sc.edges : [];
      if (!edges.length) errors.push(`${at}: flow en az 1 kenar ister`);
      for (const e of edges) if (!Array.isArray(e) || e.length < 2 || !ids.has(String(e[0])) || !ids.has(String(e[1])) || e[0] === e[1]) errors.push(`${at}: flow kenarı [from, to, label?] geçersiz: ${JSON.stringify(e)}`);
      const has = said(i);
      for (const e of edges) if (e?.[2] && digitGroups(e[2]).some((c) => !c.some((v) => has(v)))) errors.push(`${at}: flow ok etiketi "${e[2]}" anlatımda geçmiyor`);
      break;
    }
    case 'stat': {
      const has = said(i);
      const v = String(sc.value ?? '').trim();
      if (!v || !/\d/.test(v)) errors.push(`${at}: stat value rakam içermeli ("$5,800", "38%", "1 in 3")`);
      else if (digitGroups(v).some((c) => !c.some((x) => has(x)))) errors.push(`${at}: stat değeri "${v}" anlatımda geçmiyor (uydurma veri)`);
      if (v.length > 18) warns.push(`${at}: stat value uzun`);
      if (!String(sc.label || '').trim()) errors.push(`${at}: stat label gerekli`);
      if (sc.trend != null && !['up', 'down'].includes(sc.trend)) errors.push(`${at}: trend up|down olmalı`);
      break;
    }
    case 'montage':
      if ((sc.imagePrompts?.length || 0) < 4) errors.push(`${at}: montage en az 4 imagePrompts`);
      if (i !== 0) warns.push(`${at}: montage genelde yalnız açılışta`);
      break;
  }
});
for (const [n, c] of Object.entries(names)) if (c > 2) warns.push(`isim kartı "${n}" ${c} kez — en fazla 2`);
// Görsel kaynak bütçesi: gerçek fotoğraf önce, AI yalnızca fotoğrafı olamayacak anlar.
const MAX_AI = arg('--max-ai', 18);
const src = { archive: 0, stock: 0, prev: 0, ai: 0, none: 0 };
s.scenes.forEach((sc, i) => {
  const at = `sahne ${i} (${sc.type})`;
  let k;
  if (sc.type === 'montage') { src.ai += (sc.imagePrompts || []).filter((p) => typeof p === 'string' || !p?.search).length; return; }
  if (noOwnPicture(sc)) k = 'none';
  else if (sc.type === 'counter' || sc.type === 'chart') k = sc.bg === 'prev' ? 'prev' : 'none';
  else if (sc.bg === 'prev' || sc.bg === 'next') k = 'prev';
  else if (sc.source === 'archive' || sc.source === 'stock') {
    k = sc.source;
    if (!sc.search) errors.push(`${at}: ${sc.source} sahnesi search ister`);
  } else if (sc.imagePrompt || sc.imagePrompts) k = 'ai';
  else k = 'none';
  src[k]++;
  if (sc.type === 'slam' && k === 'ai') warns.push(`${at}: slam arka planı için yeni AI görsel yerine bg:"prev" kullan`);
});
if (src.ai > MAX_AI) errors.push(`AI görsel ${src.ai} (> ${MAX_AI}) — gerçek kişi/yer/olay: archive, genel atmosfer: stock, yazı/slam arka planı: bg:"prev"`);
const perCh = Object.values(perChapter);
const minutes = words / 120;
if (words < MIN_WORDS) errors.push(`toplam ${words} kelime (< ${MIN_WORDS}) — ~${minutes.toFixed(1)} dk, 10 dk'yı geçmez`);
if (chars > MAX_CHARS) errors.push(`seslendirme ${chars} karakter (> ${MAX_CHARS}) — ElevenLabs kredisi yetmez`);
const slams = typeCount.slam || 0;
if (slams > s.chapters.length + 2) warns.push(`${slams} slam — bölüm başına en fazla 1`);
console.log(JSON.stringify({ ok: !errors.length, words, minutes: +minutes.toFixed(1), chars, scenes: s.scenes.length, chapters: s.chapters?.length, perChapter: perCh, typeCount, sources: src, errors: errors.slice(0, 60), warns: warns.slice(0, 40) }, null, 1));
process.exit(errors.length ? 1 : 0);
