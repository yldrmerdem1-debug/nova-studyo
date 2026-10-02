// @ts-check
/*
 * INFOGRAPHIC timing — plain JavaScript (like src/timeline.js) so the render
 * (src/infographics/*.tsx), the sound plan (timeline.js planSfx) and Node
 * tooling all read the SAME key frames: when each bar grows, each slice
 * sweeps, each icon lights, when the scale zooms out, each node pops and the
 * stat lands. No React, no scenes.tsx (scenes.tsx imports devices/timing.ts,
 * which imports this: no cycle), no locale state — matching folds Turkish
 * dotted/dotless i so it works for tr-TR and en-US alike.
 *
 * Reveals follow the narration: an item appears when its label or its value
 * is SPOKEN (wordTimes), a few frames early so the motion lands on the word.
 * Without a voice (or when a word is never said) a reading pace takes over.
 */

export const INFO_TYPES = ['bars', 'donut', 'icons', 'scale', 'flow', 'stat'];
/** @param {unknown} t */
export const isInfoType = (t) => INFO_TYPES.includes(String(t));

/* ------------------------------------------------------------------ words */

/** Lower-case, Turkish i folded, diacritics off: "İstanbul'un" -> "istanbulun". */
export function fold(s) {
  return String(s ?? '')
    .normalize('NFC')
    .replace(/[İI]/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}
export const normWord = (w) => fold(w).replace(/[^\p{L}\p{N}]/gu, '');

/** v3 performance tags out of a token list ("[whispers]", a tag split in two). */
function untag(tokens) {
  let open = false;
  return tokens.map((tok) => {
    let s = String(tok ?? '');
    if (open) {
      const e = s.indexOf(']');
      if (e < 0) return '';
      s = s.slice(e + 1);
      open = false;
    }
    s = s.replace(/\[[^\]]*\]/g, '');
    const o = s.indexOf('[');
    if (o >= 0) {
      open = true;
      s = s.slice(0, o);
    }
    return s;
  });
}

/**
 * Spoken tokens with times: `raw` keeps digits and separators ("$5,800"),
 * `n` is the folded word. Hyphenated number words ("twenty-one") split.
 * @param {{word:string,t:number}[]|undefined} wordTimes
 */
export function spokenOf(wordTimes) {
  const list = Array.isArray(wordTimes) ? wordTimes : [];
  const clean = untag(list.map((w) => w?.word));
  const out = [];
  list.forEach((w, i) => {
    const raw = String(clean[i] ?? '').trim();
    if (!raw || !Number.isFinite(w?.t)) return;
    const parts = /\d/.test(raw) ? [raw] : raw.split(/[-‐–—]/);
    for (const p of parts) {
      const n = normWord(p);
      if (n) out.push({ raw: p, n, t: Number(w.t) });
    }
  });
  return out;
}

const STOP = new Set([
  'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'for', 'with', 'by', 'from', 'is', 'was', 'were', 'his', 'her', 'their', 'its', 'that', 'this', 'as', 'than',
  'bir', 'bu', 'su', 've', 'ile', 'de', 'da', 'ki', 'mi', 'ne', 'icin', 'gibi', 'kadar', 'daha', 'cok', 'en', 'her', 'ama', 'olan', 'olarak',
]);

/** Suffix-tolerant word match: "cooper" ~ "cooperin", "gemi" ~ "gemiler"; never "bil" ~ "bilinmeyen". */
export function stemMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (/^\d+$/.test(s) || /^\d+$/.test(l)) return false;
  if (s.length >= 4 && s.length >= l.length * 0.45 && l.startsWith(s)) return true;
  return s.length >= 5 && l.slice(0, 5) === s.slice(0, 5);
}

/** Content words of a label (folded). */
export function contentWords(text) {
  return String(text ?? '')
    .split(/[\s/\-–—]+/)
    .map(normWord)
    .filter((w) => w && (w.length >= 3 || /^\d+$/.test(w)) && !STOP.has(w));
}

/**
 * Index of the first spoken token (at or after `from`) that says one of the
 * label's content words. The earliest word wins: a label is on screen as soon
 * as the narrator starts naming it.
 */
export function labelIndex(label, sp, from = 0) {
  const words = contentWords(label);
  if (!words.length) return -1;
  let best = -1;
  for (const w of words) {
    for (let k = from; k < sp.length; k++) {
      if (stemMatch(w, sp[k].n)) {
        if (best < 0 || k < best) best = k;
        break;
      }
    }
  }
  return best;
}

/* ---------------------------------------------------------------- numbers */

const EN_NUM = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12,
};
const TR_NUM = {
  sifir: 0, bir: 1, iki: 2, uc: 3, dort: 4, bes: 5, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  yirmi: 20, otuz: 30, kirk: 40, elli: 50, altmis: 60, yetmis: 70, seksen: 80, doksan: 90,
  yuz: 100, bin: 1e3, milyon: 1e6, milyar: 1e9, trilyon: 1e12,
};
const TR_KEYS = Object.keys(TR_NUM).sort((a, b) => b.length - a.length);
const MULT_WORD = { thousand: 1e3, bin: 1e3, million: 1e6, milyon: 1e6, billion: 1e9, milyar: 1e9, trillion: 1e12, trilyon: 1e12 };
const MULT_SUFFIX = { k: 1e3, m: 1e6, mn: 1e6, b: 1e9, bn: 1e9, t: 1e12 };

/** Turkish case/possessive endings a spoken number can carry (folded): "dokuzu", "üçte", "binde", "ondan". */
const TR_SUFFIX = new Set(['i', 'u', 'a', 'e', 'yi', 'yu', 'ya', 'ye', 'si', 'su', 'in', 'un', 'nin', 'nun', 'de', 'da', 'te', 'ta', 'den', 'dan', 'ten', 'tan', 'le', 'la', 'yle', 'yla', 'lik', 'luk', 'ler', 'lar', 'er', 'ar', 'ser', 'sar', 'inci', 'uncu', 'nci', 'ncu', 'ci', 'cu', 'dir', 'dur', 'tir', 'tur']);

/** A number word ("seventeen", Turkish with a suffix: "dokuzu", "üçte"); null otherwise. Turkish words only in Turkish narration ("on" is 10 there, a preposition in English). */
function numWord(n, tr = true) {
  if (n === 'yuzde' || n === 'percent') return null; // "yüzde elli" = 50 %, not 100
  if (EN_NUM[n] !== undefined) return { v: EN_NUM[n], end: false };
  if (!tr) return null;
  if (TR_NUM[n] !== undefined) return { v: TR_NUM[n], end: false };
  // Only a known ending: "uçak" is not "üç", "altında" is not "altı".
  const k = TR_KEYS.find((x) => n.startsWith(x) && TR_SUFFIX.has(n.slice(x.length)));
  if (k) return { v: TR_NUM[k], end: true };
  return null;
}

/** Sum a run of number words: "two hundred thousand" = 200000, "bin dokuz yüz" = 1900. */
function combine(vals) {
  let total = 0;
  let cur = 0;
  for (const v of vals) {
    if (v >= 1000) {
      total += (cur || 1) * v;
      cur = 0;
    } else if (v === 100) cur = (cur || 1) * 100;
    else cur += v;
  }
  return total + cur;
}

/** Numbers in a digit token: "$5,800" -> [5800], "5.800" -> [5800, 5.8], "13,8" -> [13.8], "38%" -> [38]. */
export function digitValues(raw) {
  const m = String(raw ?? '').match(/\d[\d.,]*/);
  if (!m) return [];
  const s = m[0].replace(/[.,]+$/, '');
  const out = new Set();
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    out.add(Number(s.replace(/[.,]/g, '')));
    if (/^\d{1,3}[.,]\d{3}$/.test(s)) out.add(Number(s.replace(',', '.')));
  } else if (/^\d+[.,]\d+$/.test(s)) out.add(Number(s.replace(',', '.')));
  else out.add(Number(s.replace(/[.,]/g, '')));
  return [...out].filter(Number.isFinite);
}

/**
 * Every number the narrator says, with the token index it starts on: digit
 * tokens (with a multiplier word or letter after them), and runs of number
 * words in English or Turkish. Each carries its raw value AND the multiplied
 * one ("13.8 billion" -> 13.8 and 13.8e9), so either way of writing the data matches.
 * @returns {{i:number, t:number, values:number[]}[]}
 */
export function spokenNumbers(sp) {
  const out = [];
  // Turkish number words only in Turkish narration (letters only Turkish has, or its common words).
  const tr = sp.some((x) => /[çğışöüÇĞİŞÖÜ]/.test(x.raw) || /^(ve|bir|bu|ile|icin|kisi|yil)$/.test(x.n));
  const numWord_ = (n) => numWord(n, tr);
  // A comma after a multiplier is the narrator's breath, not the end of the number:
  // "four thousand, seven hundred and seventy-three" is ONE number (4773, not 4000 and 773).
  const stops = (k) => {
    const raw = String(sp[k]?.raw ?? '');
    if (/,$/.test(raw) && (numWord_(sp[k]?.n)?.v ?? 0) >= 1000 && sp[k + 1] && numWord_(sp[k + 1].n)) return false;
    return /[.,;:!?…)"”]$/.test(raw);
  };
  for (let i = 0; i < sp.length; i++) {
    const tok = sp[i];
    if (/\d/.test(tok.raw)) {
      const base = digitValues(tok.raw);
      if (!base.length) continue;
      let mult = 1;
      const suf = tok.raw.replace(/.*\d/, '').replace(/[^a-z]/gi, '').toLowerCase();
      if (MULT_SUFFIX[suf]) mult = MULT_SUFFIX[suf];
      else if (sp[i + 1] && MULT_WORD[sp[i + 1].n]) mult = MULT_WORD[sp[i + 1].n];
      const values = new Set(base);
      if (mult > 1) for (const b of base) values.add(b * mult);
      out.push({ i, t: tok.t, tEnd: (sp[i + 1] && mult > 1 && !MULT_SUFFIX[suf] ? sp[i + 1].t : tok.t), values: [...values] });
      continue;
    }
    const w = numWord_(tok.n);
    if (!w) continue;
    const run = [w.v];
    let j = i + 1;
    let ended = w.end || stops(i);
    while (!ended && j < sp.length) {
      if (sp[j].n === 'and' && sp[j + 1] && numWord_(sp[j + 1].n) && !stops(j)) {
        j++;
        continue;
      }
      const x = numWord_(sp[j].n);
      if (!x) break;
      run.push(x.v);
      ended = x.end || stops(j);
      j++;
    }
    // "a million" / "a hundred": the article counts as one.
    const values = new Set([combine(run)]);
    if (i > 0 && (sp[i - 1].n === 'a' || sp[i - 1].n === 'bir') && run[0] >= 100) values.add(combine([1, ...run]));
    // A digit before a multiplier word ("2.4 million") was handled above; a lone multiplier is not a value.
    if (run.length === 1 && run[0] >= 1000) continue;
    out.push({ i, t: tok.t, tEnd: sp[j - 1].t, values: [...values] });
    i = j - 1;
  }
  return out;
}

/** True when `v` equals one of `values` (1% tolerance: "5,800" vs 5796 is the same fact). */
export function sameNumber(v, values) {
  if (!Number.isFinite(v)) return false;
  return values.some((x) => Number.isFinite(x) && Math.abs(x - v) <= Math.max(Math.abs(v) * 0.01, 1e-9));
}

/** Index of the first spoken token at which `v` is said (or -1). */
export function valueIndex(v, sp, nums = spokenNumbers(sp)) {
  const hit = nums.find((x) => sameNumber(Number(v), x.values));
  return hit ? hit.i : -1;
}

/**
 * The number inside a stat string: "$5,800" -> {num: 5800, decimals: 0,
 * pre: '$', suf: ''}; "38%" -> {num: 38, suf: '%'}; "1 in 3" -> groups 2.
 * `groups` counts separate numbers (more than one: the string types in).
 */
export function parseStat(value) {
  const s = String(value ?? '').trim();
  const all = [...s.matchAll(/\d[\d.,]*\d|\d/g)];
  if (!all.length) return { num: NaN, decimals: 0, pre: s, suf: '', groups: 0, text: s };
  const m = all[0];
  const g = m[0];
  let num;
  let decimals = 0;
  if (/^\d{1,3}([.,]\d{3})+$/.test(g)) num = Number(g.replace(/[.,]/g, ''));
  else if (/^\d+[.,]\d+$/.test(g)) {
    num = Number(g.replace(',', '.'));
    decimals = g.split(/[.,]/)[1].length;
  } else num = Number(g.replace(/[.,]/g, ''));
  return { num, decimals, pre: s.slice(0, m.index), suf: s.slice((m.index ?? 0) + g.length), groups: all.length, text: s };
}

/* ------------------------------------------------------------------ plans */

const sec = (s, fps) => Math.round(s * fps);

/**
 * Shared frame window of a scene: `lead` = first reveal without a cue,
 * `last` = the latest a reveal may START so it finishes on screen.
 */
function window_(durFrames, fps) {
  const lead = sec(0.35, fps);
  const last = Math.max(lead + 1, durFrames - sec(1.1, fps));
  return { lead, last, clampF: (f) => Math.max(lead, Math.min(last, Math.round(f))) };
}

/** Frame of the first cue that is said (on the word, never before it: the narrator says it, then it shows); null if none. */
function cueFrame(sp, nums, fps, { label, value } = {}) {
  let k = -1;
  if (value != null && Number.isFinite(Number(value))) k = valueIndex(Number(value), sp, nums);
  const kl = label ? labelIndex(label, sp) : -1;
  if (kl >= 0 && (k < 0 || kl < k)) k = kl;
  if (k < 0) return null;
  return Math.round(sp[k].t * fps);
}

/**
 * Key frames of an infographic scene (scene-local frames). The components
 * draw from this and the sound plan cues from it, so they cannot drift.
 * @param {any} scene
 * @param {number} durFrames
 * @param {number} fps
 */
export function infoPlan(scene, durFrames, fps) {
  const sp = spokenOf(scene?.wordTimes);
  const nums = spokenNumbers(sp);
  const { lead, last, clampF } = window_(durFrames, fps);
  const cue = (o) => cueFrame(sp, nums, fps, o);
  const room = (f, want) => Math.max(sec(0.35, fps), Math.min(want, durFrames - sec(0.5, fps) - f));

  switch (scene?.type) {
    case 'bars': {
      const items = Array.isArray(scene.items) ? scene.items : [];
      const hits = items.map((it) => cue({ label: it?.label, value: it?.value }));
      const found = hits.filter((x) => x != null);
      const grow = clampF(found.length ? Math.min(...found) : lead + 6);
      const growDur = room(grow, sec(1.15, fps));
      const hi = Number.isInteger(scene.highlight) && items[scene.highlight] ? scene.highlight : -1;
      let hl = null;
      if (hi >= 0) {
        const h = hits[hi];
        hl = Math.min(durFrames - sec(0.6, fps), Math.max(grow + growDur - 4, h ?? 0));
      }
      return { kind: 'bars', lead, grow, growDur, hl, hits };
    }
    case 'donut': {
      const slices = Array.isArray(scene.slices) ? scene.slices : [];
      const total = slices.reduce((a, s) => a + Math.max(0, Number(s?.value) || 0), 0) || 1;
      const hits = slices.map((s) => cue({ label: s?.label, value: s?.value }));
      const full = sec(1.25, fps);
      const starts = [];
      const durs = [];
      let t = clampF(hits.find((x) => x != null) ?? lead + 4);
      slices.forEach((s, i) => {
        const frac = Math.max(0, Number(s?.value) || 0) / total;
        const h = hits[i];
        const st = i === 0 ? t : Math.max(t, h != null && h < last ? h : t);
        const d = Math.max(5, Math.round(frac * full));
        starts.push(st);
        durs.push(d);
        t = st + d;
      });
      // Everything must be drawn a breath before the cut: compress when the cues run late.
      const end = t;
      const limit = durFrames - sec(0.7, fps);
      if (end > limit && starts.length) {
        const s0 = starts[0];
        const k = Math.max(0.2, (limit - s0) / Math.max(1, end - s0));
        for (let i = 0; i < starts.length; i++) {
          starts[i] = s0 + Math.round((starts[i] - s0) * k);
          durs[i] = Math.max(3, Math.round(durs[i] * k));
        }
      }
      const drawn = starts.length ? starts[starts.length - 1] + durs[durs.length - 1] : lead;
      const hi = Number.isInteger(scene.highlight) && slices[scene.highlight] ? scene.highlight : -1;
      let hl = null;
      if (hi >= 0) hl = Math.min(durFrames - sec(0.55, fps), Math.max(drawn + 2, hits[hi] ?? 0));
      return { kind: 'donut', lead, starts, durs, drawn, hl, hits };
    }
    case 'icons': {
      const total = Math.max(1, Math.min(100, Math.round(Number(scene.total) || 1)));
      const filled = Math.max(0, Math.min(total, Math.round(Number(scene.filled) || 0)));
      const grid = lead;
      const f1 = cue({ value: filled });
      const f2 = cue({ label: scene.label });
      const ft = cue({ value: total });
      let fill = f1 ?? f2 ?? (ft != null ? ft + sec(0.5, fps) : grid + sec(0.75, fps));
      fill = Math.max(grid + sec(0.45, fps), Math.min(last, fill));
      const dur = room(fill, Math.round(Math.min(2.2, Math.max(0.45, filled * 0.075)) * fps));
      const step = filled > 1 ? dur / (filled - 1) : 0;
      return { kind: 'icons', lead, grid, fill, step, done: fill + (filled > 1 ? dur : 0), total, filled };
    }
    case 'scale': {
      const a = scene.a ?? {};
      const b = scene.b ?? {};
      const av = Math.abs(Number(a.value) || 0);
      const bv = Math.abs(Number(b.value) || 0);
      const smallIsA = av <= bv;
      const small = smallIsA ? a : b;
      const big = smallIsA ? b : a;
      const sIn = clampF(cue({ label: small.label, value: small.value }) ?? lead);
      const bigCue = cue({ label: big.label, value: big.value });
      const zoomDurWant = sec(1.4, fps);
      let zoom = Math.max(sIn + sec(0.95, fps), bigCue ?? sIn + sec(1.5, fps));
      zoom = Math.min(zoom, durFrames - sec(0.6, fps) - Math.min(zoomDurWant, sec(0.7, fps)));
      zoom = Math.max(sIn + 6, zoom);
      const zoomDur = room(zoom, zoomDurWant);
      return { kind: 'scale', lead, smallIn: sIn, zoom, zoomDur, land: zoom + zoomDur, smallIsA };
    }
    case 'flow': {
      const nodes = Array.isArray(scene.nodes) ? scene.nodes : [];
      const hits = nodes.map((nd) => cue({ label: nd?.label }));
      const n = nodes.length;
      const step = Math.max(sec(0.3, fps), Math.min(sec(0.8, fps), Math.floor((last - lead) / Math.max(1, n))));
      // Appearance: the spoken ones on their word, the rest at the pace in between; strictly increasing, >= 8 frames apart.
      const order = nodes.map((_, i) => i);
      const at = new Array(n).fill(0);
      let prev = lead - sec(0.3, fps);
      order.forEach((i) => {
        const want = hits[i] != null ? hits[i] : prev + step;
        const f = Math.max(prev + 8, Math.min(last, want));
        at[i] = f;
        prev = f;
      });
      // Too late for the cut: squeeze the tail.
      const limit = durFrames - sec(0.7, fps);
      if (n && at[n - 1] > limit) {
        const a0 = at[0];
        const k = (limit - a0) / Math.max(1, at[n - 1] - a0);
        for (let i = 1; i < n; i++) at[i] = a0 + Math.round((at[i] - a0) * k);
      }
      return { kind: 'flow', lead, at, hits };
    }
    case 'stat': {
      const p = parseStat(scene.value);
      const h = cue({ value: Number.isFinite(p.num) ? p.num : undefined, label: Number.isFinite(p.num) ? undefined : scene.label });
      // Said: the figure starts counting on its word and lands 0.85 s later (it never runs ahead of the
      // narrator). Never said: the old reading-pace clock.
      const hitF = h ?? lead + sec(0.9, fps);
      const start = h != null ? Math.max(lead, Math.min(last, h)) : Math.max(lead, Math.min(last, hitF - sec(0.85, fps)));
      const land = h != null ? Math.min(durFrames - sec(0.4, fps), start + sec(0.85, fps)) : Math.max(start + sec(0.55, fps), Math.min(durFrames - sec(0.6, fps), hitF + 3));
      const lab = cue({ label: scene.label });
      const labelAt = lab != null ? Math.max(start + 6, lab) : Math.max(start + 6, land - 4);
      return { kind: 'stat', lead, start, land, labelAt, subAt: Math.max(labelAt + 8, land + 6) };
    }
    default:
      return null;
  }
}

/* ---------------------------------------------------------- impacts & sfx */

/**
 * Where the frame physically reacts (engine punch/shake/lens split) — kept
 * light, every infographic is type the viewer reads.
 * @returns {{f:number, strength:number}[]}
 */
export function infoImpacts(scene, durFrames, fps) {
  const p = /** @type {any} */ (infoPlan(scene, durFrames, fps));
  if (!p) return [];
  switch (p.kind) {
    case 'bars':
      return p.hl != null ? [{ f: p.hl + 3, strength: 0.12 }] : [];
    case 'donut':
      return p.hl != null ? [{ f: p.hl + 3, strength: 0.14 }] : [];
    case 'icons':
      return p.filled ? [{ f: Math.round(p.done) + 2, strength: 0.1 }] : [];
    case 'scale':
      return [{ f: p.land, strength: 0.2 }];
    case 'flow':
      return p.at.length > 1 ? [{ f: p.at[p.at.length - 1] + 4, strength: 0.1 }] : [];
    case 'stat':
      return [{ f: p.land, strength: 0.22 }];
    default:
      return [];
  }
}

/**
 * Sound cues an infographic asks for (scene-local frames): `ticks` under a
 * count or a fill, `snap` on a landing, a `whoosh` on the scale's pull-out.
 * ticks/snap are story beats (always placed, like a counter's ticks); a
 * whoosh is decoration and yields to the budget (timeline.js planSfx).
 * @returns {{f:number, kind:'ticks'|'snap'|'whoosh', gain:number, align?:'onset'|'peak'}[]}
 */
export function infoSfx(scene, durFrames, fps) {
  const p = /** @type {any} */ (infoPlan(scene, durFrames, fps));
  if (!p) return [];
  switch (p.kind) {
    // No tick beds under a count or a fill: the mechanical clicking read as cheap (1453, user).
    // The landing carries the beat; a fill that ends on a highlight gets one soft snap.
    case 'bars':
      return p.hl != null ? [{ f: p.hl + 3, kind: 'snap', gain: 0.3 }] : [];
    case 'donut':
      return p.hl != null ? [{ f: p.hl + 3, kind: 'snap', gain: 0.3 }] : [];
    case 'icons':
      return [];
    case 'scale':
      return [{ f: p.zoom + Math.round(p.zoomDur * 0.45), kind: 'whoosh', gain: 0.42, align: 'peak' }];
    case 'flow':
      return p.at.length ? [{ f: p.at[0] + 2, kind: 'snap', gain: 0.26 }, ...(p.at.length > 2 ? [{ f: p.at[p.at.length - 1] + 2, kind: 'snap', gain: 0.3 }] : [])] : [];
    case 'stat':
      return [{ f: p.land, kind: 'snap', gain: 0.34 }];
    default:
      return [];
  }
}
