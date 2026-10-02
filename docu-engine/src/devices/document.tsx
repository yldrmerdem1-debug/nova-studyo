import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { Media } from '../fx';
import { paperTexture, seededRng } from '../paper';
import type { DocKind, DocumentScene, Genre } from '../types';
import { DevProps, H, W, clamp, ease, isTr, resolveRef, safeBand, upper } from './common';
import { stampFrame } from './timing';
import { DFONT, DevFont, fitLine, measure } from './type';

/*
 * DOCUMENT ZOOM — a sheet on a dark desk. A scan (`image`) is shown whole; a
 * generated document (`doc`) is typeset in its period face: teletype and
 * telegram in caps, a letter on a typewriter, a report on a form, a ledger in
 * ink. Redactions sweep on first, a stamp slams down while the page is still
 * wide, then the camera travels into the highlighted line and a marker
 * sweeps over the words as it arrives.
 */

const PW = 1240;

interface DocStyle {
  tone: string;
  age: number;
  ink: string;
  font: DevFont;
  weight: number;
  size: number;
  lineH: number;
  caps: boolean;
  margin: number;
  head: DevFont;
  headSize: number;
  headWeight: number;
}

function docStyle(kind: DocKind, g: Genre): DocStyle {
  const aged = { horror: 1, epic: 0.9, documentary: 0.75, crime: 0.6, inspire: 0.7, finance: 0.45, science: 0.35 }[g.id] ?? 0.6;
  switch (kind) {
    case 'fbi-teletype':
      return { tone: '#ebe8dc', age: aged * 0.7, ink: '#1c1d22', font: 'courier', weight: 400, size: 31, lineH: 1.5, caps: true, margin: 120, head: 'courier', headSize: 36, headWeight: 700 };
    case 'letter':
      return { tone: '#f1e7d2', age: aged, ink: '#23201c', font: 'elite', weight: 400, size: 31, lineH: 1.55, caps: false, margin: 130, head: 'oldstandard', headSize: 44, headWeight: 700 };
    case 'telegram':
      return { tone: '#e8d7a6', age: aged, ink: '#18140e', font: 'courier', weight: 700, size: 31, lineH: 1.95, caps: true, margin: 110, head: 'oldstandard', headSize: 58, headWeight: 700 };
    case 'ledger':
      return { tone: '#ede3c7', age: aged, ink: '#1c2a55', font: 'hand', weight: 500, size: 42, lineH: 1.32, caps: false, margin: 90, head: 'oldstandard', headSize: 44, headWeight: 700 };
    default:
      return { tone: '#ecebe3', age: aged * 0.8, ink: '#1b1c20', font: 'courier', weight: 400, size: 29, lineH: 1.55, caps: false, margin: 130, head: 'courier', headSize: 34, headWeight: 700 };
  }
}

/** A typed line after wrapping: its text, where it starts in its source line, and marks inside it. */
interface Seg {
  text: string;
  src: number;
  start: number;
  /** Ranges [a, b) in `text`, kind and order index. */
  marks: { a: number; b: number; kind: 'hi' | 'red'; k: number }[];
  /** Page x where the line's text starts. */
  x?: number;
  /** Ledger: the row's date and amount columns (first piece of the row only). */
  date?: string;
  amount?: string;
}

function findAll(hay: string, needle: string, locale: string): [number, number][] {
  const lc = (s: string) => s.toLocaleLowerCase(isTr(locale) ? 'tr-TR' : 'en-US');
  const h = lc(hay);
  const n = lc(needle.trim());
  const out: [number, number][] = [];
  if (!n) return out;
  let i = h.indexOf(n);
  while (i >= 0) {
    out.push([i, i + n.length]);
    i = h.indexOf(n, i + n.length);
  }
  return out;
}

/** Word-wrap `s` at `maxW`, keeping each piece's offset into `s`. */
function wrapOffsets(s: string, font: DevFont, size: number, maxW: number): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let a = -1;
  let b = -1;
  while ((m = re.exec(s))) {
    const ws = m.index;
    const we = ws + m[0].length;
    if (a < 0) {
      a = ws;
      b = we;
    } else if (measure(s.slice(a, we), font, size) <= maxW) b = we;
    else {
      out.push({ text: s.slice(a, b), start: a });
      a = ws;
      b = we;
    }
    // A single word wider than the line: break it by characters.
    while (measure(s.slice(a, b), font, size) > maxW && b - a > 1) {
      let k = b;
      while (k > a + 1 && measure(s.slice(a, k), font, size) > maxW) k--;
      out.push({ text: s.slice(a, k), start: a });
      a = k;
    }
  }
  if (a >= 0) out.push({ text: s.slice(a, b), start: a });
  return out.length ? out : [{ text: '', start: 0 }];
}

interface DocLayout {
  st: DocStyle;
  size: number;
  segs: Seg[];
  heading: string;
  headSize: number;
  textTop: number;
  lineH: number;
  PH: number;
  hiLine: number;
  hiX: number;
  redCount: number;
  file: string;
  /** Ledger: x of the vertical column rules. */
  rules: number[];
}

function docLayout(scene: DocumentScene, g: Genre, locale: string): DocLayout {
  const kind: DocKind = scene.doc?.kind ?? 'report';
  let st = docStyle(kind, g);
  // Special Elite has no Turkish dotless i: a Turkish letter is typed in Courier Prime instead.
  const allText = `${scene.doc?.heading ?? ''} ${(scene.doc?.lines ?? []).join(' ')}`;
  if (st.font === 'elite' && /[ıİ]/.test(allText)) st = { ...st, font: 'courier', size: st.size - 1 };
  const cap = (t: string) => (st.caps ? upper(t, locale) : t);
  const src = (scene.doc?.lines ?? []).map((l) => cap(String(l ?? '')));
  const heading = cap(String(scene.doc?.heading ?? '').trim());
  const textW = PW - 2 * st.margin;
  const headSize = heading ? fitLine(heading, st.head, { maxW: textW, cap: st.headSize, min: 22, trackEm: 0.04 }) : 0;
  const headBlock = heading ? Math.round(headSize * 1.3) + (kind === 'telegram' ? 120 : kind === 'letter' ? 70 : 60) : 0;
  const textTop = (kind === 'telegram' ? 150 : kind === 'report' ? 190 : kind === 'ledger' ? 120 : 130) + headBlock;
  const r = seededRng(`doc${heading}${src.join('|').slice(0, 200)}`);
  const file = `${10 + Math.floor(r() * 89)}-${100000 + Math.floor(r() * 899999)}`;

  /*
   * Ledger rows: "date | entry | amount" (or "entry | amount"), split on "|",
   * tabs or 3+ spaces. The entry is the typed body (marks apply to it); the
   * date sits in its own left column, the amount right-aligned.
   */
  const ledgerRow = (s: string) => {
    const c = s.split(/\s*\|\s*|\t+|\s{3,}/).filter((x) => x.length);
    if (c.length >= 3) return { date: c[0], body: c.slice(1, -1).join(' — '), amount: c[c.length - 1] };
    if (c.length === 2) return { date: '', body: c[0], amount: c[1] };
    return { date: '', body: c[0] ?? '', amount: '' };
  };
  const bodyOf = (s: string) => (kind === 'ledger' ? ledgerRow(s).body : s);
  const build = (size: number) => {
    const segs: Seg[] = [];
    let dateW = 0;
    let amtW = 0;
    if (kind === 'ledger') {
      for (const s of src) {
        const row = ledgerRow(s);
        if (row.date) dateW = Math.max(dateW, Math.min(300, measure(row.date, st.font, size) + 44));
        if (row.amount) amtW = Math.max(amtW, Math.min(320, measure(row.amount, st.font, size) + 40));
      }
    }
    src.forEach((s, i) => {
      const row = kind === 'ledger' ? ledgerRow(s) : null;
      const body = row ? row.body : s;
      const w = textW - dateW - amtW;
      wrapOffsets(body, st.font, size, w).forEach((p, k) =>
        segs.push({ text: p.text, src: i, start: p.start, marks: [], x: st.margin + dateW, date: k === 0 && row ? row.date : undefined, amount: k === 0 && row ? row.amount : undefined }),
      );
    });
    return segs;
  };
  let size = st.size;
  let segs = build(size);
  const maxH = PW * 1.414 * 1.9;
  while (size > 20 && textTop + segs.length * size * st.lineH + 160 > maxH) {
    size -= 1;
    segs = build(size);
  }
  const lineH = Math.round(size * st.lineH);
  // A telegram is a short form, a ledger a squarer book page; letters and reports are A4.
  const minH = kind === 'telegram' ? PW * 0.72 : kind === 'ledger' ? PW * 1.1 : PW * 1.414;
  const PH = Math.max(Math.round(minH), Math.round(textTop + segs.length * lineH + 170));

  // Marks: every redaction, the first highlight — found in the source line, cut to its wrapped pieces.
  const put = (kind2: 'hi' | 'red', needle: string, k: number, first: boolean) => {
    const n = cap(needle);
    for (let i = 0; i < src.length; i++) {
      const body = bodyOf(src[i]);
      const hits = findAll(body, n, locale);
      if (!hits.length) continue;
      for (const [a, b] of first ? hits.slice(0, 1) : hits) {
        for (const sg of segs) {
          if (sg.src !== i) continue;
          const s0 = sg.start;
          const s1 = sg.start + sg.text.length;
          const x0 = Math.max(a, s0);
          const x1 = Math.min(b, s1);
          if (x1 > x0) sg.marks.push({ a: x0 - s0, b: x1 - s0, kind: kind2, k });
        }
      }
      if (first) return true;
    }
    return false;
  };
  let redCount = 0;
  (scene.redact ?? []).forEach((rd) => {
    if (String(rd ?? '').trim() && put('red', rd, redCount, false)) redCount++;
    else if (String(rd ?? '').trim()) redCount++;
  });
  let hiLine = -1;
  let hiX = PW / 2;
  if (String(scene.highlight ?? '').trim() && put('hi', String(scene.highlight), 0, true)) {
    hiLine = segs.findIndex((s) => s.marks.some((m) => m.kind === 'hi'));
    const sg = segs[hiLine];
    const mk = sg.marks.find((m) => m.kind === 'hi')!;
    const a = measure(sg.text.slice(0, mk.a), st.font, size);
    const b = measure(sg.text.slice(0, mk.b), st.font, size);
    hiX = (sg.x ?? st.margin) + (a + b) / 2;
  }
  // Ledger column rules: before the entry column and before the amounts.
  let amtW = 0;
  if (kind === 'ledger') for (const s of src) if (ledgerRow(s).amount) amtW = Math.max(amtW, Math.min(320, measure(ledgerRow(s).amount, st.font, size) + 40));
  const rules = kind === 'ledger' ? [(segs[0]?.x ?? st.margin) - 16, PW - st.margin - amtW + 8].filter((x, i) => i === 1 || x > st.margin) : [];
  return { st, size, segs, heading, headSize, textTop, lineH, PH, hiLine, hiX, redCount, file, rules };
}

/* --------------------------------------------------------------- pieces */

const inkCache = new Map<string, string>();
/** A rubber-stamp ink mask: mostly solid, with speckled gaps and dry streaks. */
function stampMask(seed: string): string {
  const hit = inkCache.get(seed);
  if (hit !== undefined) return hit;
  if (typeof document === 'undefined') return '';
  const c = document.createElement('canvas');
  c.width = 600;
  c.height = 240;
  const g = c.getContext('2d');
  if (!g) return '';
  const r = seededRng(`ink${seed}`);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 600, 240);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`;
    g.beginPath();
    g.arc(r() * 600, r() * 240, 0.6 + r() * r() * 3.2, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 14; i++) {
    g.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.35})`;
    g.lineWidth = 2 + r() * 6;
    g.beginPath();
    const y = r() * 240;
    g.moveTo(r() * 200, y);
    g.lineTo(300 + r() * 300, y + (r() - 0.5) * 30);
    g.stroke();
  }
  const url = c.toDataURL('image/png');
  inkCache.set(seed, url);
  return url;
}

const Stamp: React.FC<{ text: string; f: number; at: number; x: number; y: number; seed: string; color: string; big?: boolean }> = ({ text, f, at, x, y, seed, color, big }) => {
  const t = f - at;
  if (t < 0) return null;
  const s = interpolate(t, [0, 4, 7], [1.9, 0.96, 1], clamp);
  const o = interpolate(t, [0, 2], [0, 0.88], clamp);
  const size = fitLine(text, 'oswald', { maxW: big ? 860 : 620, cap: big ? 170 : 112, min: 30, trackEm: 0.12 });
  const mask = stampMask(seed);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(-11deg) scale(${s})`,
        opacity: o,
        mixBlendMode: 'multiply',
        WebkitMaskImage: mask ? `url(${mask})` : undefined,
        WebkitMaskSize: '100% 100%',
        maskImage: mask ? `url(${mask})` : undefined,
        maskSize: '100% 100%',
      }}
    >
      <div style={{ border: `7px solid ${color}`, padding: 5, borderRadius: 8 }}>
        <div
          style={{
            border: `3px solid ${color}`,
            borderRadius: 4,
            padding: '6px 26px 4px',
            fontFamily: DFONT.oswald,
            fontWeight: 700,
            fontSize: size,
            lineHeight: 1.1,
            letterSpacing: '0.12em',
            color,
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      </div>
    </div>
  );
};

/** One typed line with its marks: highlight sweeps, redaction bars. */
const Line: React.FC<{
  seg: Seg;
  f: number;
  hiAt: number;
  redAt: (k: number) => number;
  accent: string;
  seed: string;
  jitter: boolean;
}> = ({ seg, f, hiAt, redAt, accent, seed, jitter }) => {
  const cuts = new Set<number>([0, seg.text.length]);
  for (const m of seg.marks) {
    cuts.add(m.a);
    cuts.add(m.b);
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const r = seededRng(`ln${seed}`);
  const pieces: React.ReactNode[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const t = seg.text.slice(a, b);
    const marks = seg.marks.filter((m) => m.a <= a && m.b >= b);
    // Teletype ribbon: letters print a little uneven.
    const txt = jitter
      ? [...t].map((ch, k) => (
          <span key={k} style={{ opacity: 0.78 + r() * 0.22, position: 'relative', top: (r() - 0.5) * 1.6 }}>
            {ch}
          </span>
        ))
      : t;
    let node: React.ReactNode = txt;
    for (const m of marks) {
      if (m.kind === 'hi') {
        const p = interpolate(f, [hiAt, hiAt + 12], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
        node = (
          <span style={{ position: 'relative' }}>
            {node}
            <span
              style={{
                position: 'absolute',
                left: '-0.18em',
                top: '0.02em',
                height: '1.12em',
                width: `calc(${p * 100}% + ${p * 0.36}em)`,
                background: `linear-gradient(180deg, ${accent}99 0%, ${accent}cc 20%, ${accent}bb 85%, ${accent}66 100%)`,
                mixBlendMode: 'multiply',
                borderRadius: '0.12em 0.3em 0.2em 0.1em',
                transform: 'skewX(-6deg) rotate(-0.6deg)',
              }}
            />
          </span>
        );
      } else {
        const at = redAt(m.k);
        const p = interpolate(f, [at, at + 7], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) });
        node = (
          <span style={{ position: 'relative' }}>
            {node}
            <span
              style={{
                position: 'absolute',
                left: '-0.12em',
                top: '0.0em',
                height: '1.1em',
                width: `calc(${p * 100}% + ${p * 0.24}em)`,
                background: '#0d0d0f',
                boxShadow: '0 0 1px #0d0d0f',
                borderRadius: 2,
              }}
            />
          </span>
        );
      }
    }
    pieces.push(<React.Fragment key={i}>{node}</React.Fragment>);
  }
  return <>{pieces}</>;
};

/* ================================================================ SCENE */

export const DocumentScn: React.FC<DevProps & { scene: DocumentScene }> = ({ scene, genre, durFrames, speed, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pic = resolveRef(scene);
  const scan = !!pic.src && !scene.doc?.lines?.length;
  const L = useMemo(() => docLayout(scene, genre, locale), [scene, genre, locale]);
  const kind: DocKind = scene.doc?.kind ?? 'report';
  const st = L.st;
  const PH = scan ? Math.round(PW / Math.min(1.6, Math.max(0.5, pic.w && pic.h ? pic.w / pic.h : 0.72))) : L.PH;
  const seed = `${index ?? 0}|${L.heading}|${scene.highlight ?? ''}`;
  const tex = useMemo(() => paperTexture(`doc${seed}`, { tone: st.tone, w: 620, h: Math.round((620 * PH) / PW), age: st.age, folds: kind === 'letter' ? [0.34, 0.67] : kind === 'telegram' ? [0.5] : [] }), [seed, st.tone, st.age, PH, kind]);

  /* ---- clock ---- */
  const stampAt = stampFrame(durFrames, fps);
  const redAt = (k: number) => Math.round(0.5 * fps) + k * Math.round(0.22 * fps);
  const hasHi = !scan && L.hiLine >= 0;
  const travelA = Math.round(Math.max(stampAt + 0.5 * fps, durFrames * 0.34));
  const travelB = Math.min(durFrames - Math.round(0.9 * fps), Math.round(Math.max(travelA + 1.0 * fps, durFrames * 0.62)));
  const hiAt = travelB - 5;

  /* ---- camera ---- */
  const band = safeBand(genre, 20);
  const top = band.top;
  const bottom = band.bottom;
  const midY = (top + bottom) / 2;
  const zAll = Math.min((W * 0.72) / PW, (bottom - top) / (PH + 60));
  // A scan is the evidence itself: it opens whole. A typed page opens on its top two thirds.
  const z0 = scan ? zAll : Math.max(zAll, 0.72);
  // Start high on the page (the heading), wide.
  const cy0 = Math.min(PH / 2, (bottom - top) / 2 / z0 + 10);
  const hiY = L.textTop + (L.hiLine + 0.5) * L.lineH;
  // Close in on the line, but never so far that the typed block's margins leave the frame.
  const blockW = PW - 2 * st.margin + 80;
  const z1 = hasHi ? Math.min(2.0, (W - 200) / blockW, Math.max(z0 * 1.45, (W * 0.7) / Math.max(420, measure(L.segs[L.hiLine].text, st.font, L.size)))) : z0 * 1.3;
  const slack = Math.max(0, (W - 160) / z1 - blockW) / 2;
  const cx1 = hasHi ? PW / 2 + Math.max(-slack, Math.min(slack, L.hiX - PW / 2)) : PW / 2;
  const cy1 = hasHi ? hiY : scan ? PH * 0.4 : Math.min(PH * 0.42, L.textTop + 200);
  const m = interpolate(f, [travelA, travelB], [0, 1], { ...clamp, easing: ease });
  const after = interpolate(f, [travelB, durFrames], [0, 1], clamp);
  const pre = interpolate(f, [0, travelA], [0, 1], clamp);
  const z = (z0 + (z1 - z0) * m) * (1 + 0.035 * pre * (1 - m) + 0.045 * speed * after);
  const cx = PW / 2 + (cx1 - PW / 2) * m + Math.sin(f / 50) * 5;
  const cy = cy0 + (cy1 - cy0) * m + 18 * pre * (1 - m);
  const rx = 14 * (1 - m) + 4 * m;
  const rz = -3.2 * (1 - m) - 0.8 * m - 0.3 * after;
  const intro = interpolate(f, [0, 7], [0, 1], clamp);

  /* ---- the page ---- */
  const accent = genre.id === 'finance' || genre.id === 'science' ? '#f2d541' : genre.accent;
  const hiColor = genre.id === 'horror' ? '#d8322f' : accent;
  const stampText =
    scene.stamp === true || (typeof scene.stamp === 'string' && !scene.stamp.trim()) ? (isTr(locale) ? 'GİZLİ' : 'CONFIDENTIAL') : typeof scene.stamp === 'string' ? upper(scene.stamp.trim(), locale) : '';
  const stampColor = '#b3141c';

  const live = (i: number) => <Line seg={L.segs[i]} f={f} hiAt={hiAt} redAt={redAt} accent={hiColor} seed={`${seed}${i}`} jitter={kind === 'fbi-teletype'} />;
  const page = scan
    ? null
    : L.segs.map((sg, i) => {
      const y = L.textTop + i * L.lineH;
      const base: React.CSSProperties = {
        position: 'absolute',
        left: st.margin,
        top: y,
        height: L.lineH,
        lineHeight: `${L.lineH}px`,
        whiteSpace: 'pre',
        fontFamily: DFONT[st.font],
        fontWeight: st.weight,
        fontSize: L.size,
        color: st.ink,
      };
      if (kind === 'telegram') {
        const w = measure(sg.text, st.font, L.size) + 36;
        return (
          <div key={i} style={{ ...base, left: st.margin - 18, width: w, height: Math.round(L.size * 1.45), lineHeight: `${Math.round(L.size * 1.45)}px`, top: y + (L.lineH - L.size * 1.45) / 2, paddingLeft: 18, background: '#f6f2e4', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transform: `rotate(${((i * 37) % 7) / 10 - 0.3}deg)` }}>
            {live(i)}
          </div>
        );
      }
      if (kind === 'ledger') {
        return (
          <React.Fragment key={i}>
            {sg.date ? <div style={base}>{sg.date}</div> : null}
            <div style={{ ...base, left: sg.x ?? st.margin }}>{live(i)}</div>
            {sg.amount ? <div style={{ ...base, left: undefined, right: st.margin, textAlign: 'right' }}>{sg.amount}</div> : null}
          </React.Fragment>
        );
      }
      return (
        <div key={i} style={base}>
          {live(i)}
        </div>
      );
    });

  let furniture: React.ReactNode = null;
  if (!scan) {
    const ink = st.ink;
    const hd = L.heading ? (
      <div
        style={{
          position: 'absolute',
          left: st.margin,
          right: st.margin,
          top: kind === 'telegram' ? 58 : kind === 'report' ? 120 : 84,
          textAlign: kind === 'letter' || kind === 'telegram' || kind === 'report' ? 'center' : 'left',
          fontFamily: DFONT[st.head],
          fontWeight: st.headWeight,
          fontSize: L.headSize,
          letterSpacing: '0.04em',
          color: kind === 'telegram' ? '#2a1f0e' : ink,
          whiteSpace: 'nowrap',
          textDecoration: kind === 'report' ? 'underline' : undefined,
          textUnderlineOffset: '0.18em',
        }}
      >
        {L.heading}
      </div>
    ) : null;
    const rule = (y: number, dbl = false, x0 = st.margin, x1 = PW - st.margin, c = ink) => (
      <div style={{ position: 'absolute', left: x0, top: y, width: x1 - x0 }}>
        <div style={{ height: 2, background: c, opacity: 0.8 }} />
        {dbl ? <div style={{ height: 1, background: c, marginTop: 4, opacity: 0.8 }} /> : null}
      </div>
    );
    const headBottom = L.textTop - 44;
    if (kind === 'fbi-teletype') {
      furniture = (
        <>
          <div style={{ position: 'absolute', left: 0, right: 0, top: 44, textAlign: 'center', fontFamily: DFONT.courier, fontSize: 26, color: ink, opacity: 0.8 }}>- 1 -</div>
          {hd}
          {L.heading ? <div style={{ position: 'absolute', left: st.margin, top: headBottom - 6, fontFamily: DFONT.courier, fontSize: L.size, color: ink, opacity: 0.85, whiteSpace: 'pre' }}>{'-'.repeat(Math.floor((PW - 2 * st.margin) / (L.size * 0.6)))}</div> : null}
          <div style={{ position: 'absolute', right: st.margin, top: 44, fontFamily: DFONT.courier, fontSize: 24, color: ink, opacity: 0.7 }}>{L.file}</div>
        </>
      );
    } else if (kind === 'letter') {
      furniture = (
        <>
          {hd}
          {L.heading ? rule(headBottom + 4, true, st.margin + 120, PW - st.margin - 120) : null}
        </>
      );
    } else if (kind === 'report') {
      furniture = (
        <>
          <div style={{ position: 'absolute', left: 50, top: 50, right: 50, bottom: 50, border: `2px solid ${ink}`, opacity: 0.55 }} />
          <div style={{ position: 'absolute', right: st.margin - 30, top: 70, border: `2px solid ${ink}`, padding: '4px 14px', fontFamily: DFONT.courier, fontWeight: 700, fontSize: 24, color: ink, opacity: 0.85 }}>{L.file}</div>
          {hd}
          {rule(headBottom, false, 50, PW - 50)}
        </>
      );
    } else if (kind === 'telegram') {
      furniture = (
        <>
          <div style={{ position: 'absolute', left: 40, right: 40, top: 36, height: L.heading ? L.headSize * 1.3 + 70 : 60, border: '3px solid #3a2a12', opacity: 0.75 }} />
          {hd}
          {rule(headBottom + 10, true, 60, PW - 60, '#3a2a12')}
          <div style={{ position: 'absolute', left: 60, right: 60, top: headBottom + 26, height: 26, backgroundImage: 'repeating-linear-gradient(90deg, #3a2a12 0 2px, transparent 2px 160px)', opacity: 0.35 }} />
        </>
      );
    } else if (kind === 'ledger') {
      furniture = (
        <>
          {hd}
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: L.textTop - L.lineH * 0.15,
              bottom: 80,
              backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${L.lineH - 2}px, rgba(40,70,150,0.35) ${L.lineH - 2}px ${L.lineH}px)`,
            }}
          />
          <div style={{ position: 'absolute', top: 60, bottom: 60, left: st.margin - 20, width: 2, background: 'rgba(190,30,30,0.55)' }} />
          {L.rules.map((x, k) => (
            <div key={k} style={{ position: 'absolute', top: L.textTop - 60, bottom: 80, left: x, width: 2, background: 'rgba(190,30,30,0.45)' }} />
          ))}
          {rule(L.textTop - 40, true, 30, PW - 30, 'rgba(190,30,30,0.7)')}
        </>
      );
    }
  }

  // Where the stamp lands: the upper right of the text, clear of the highlight's line.
  // On a scan the stamp is struck big across the middle, where the camera ends; on a typed page, upper right, clear of the highlight.
  const stampY = scan ? PH * 0.46 : hasHi && Math.abs(hiY - (L.textTop + 70)) < 160 ? Math.min(PH - 220, hiY + 260) : Math.max(220, L.textTop + 40);
  const stampX = scan ? PW * 0.56 : PW - 360;

  return (
    <AbsoluteFill style={{ background: genre.bg, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 62% at 50% 45%, rgba(255,235,200,0.10) 0%, rgba(0,0,0,0.6) 100%)' }} />
      <AbsoluteFill style={{ perspective: 1800, perspectiveOrigin: `960px ${midY}px` }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: PW,
            height: PH,
            transformOrigin: '0 0',
            transform: `translate(960px, ${midY}px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${z}) translate(${-cx}px, ${-cy}px)`,
            background: st.tone,
            boxShadow: '0 50px 140px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,0,0,0.25)',
            opacity: intro,
          }}
        >
          {scan ? (
            // The scan on its sheet: a thin paper margin, as a scanned page has.
            <div style={{ position: 'absolute', inset: 22, overflow: 'hidden', boxShadow: 'inset 0 0 40px rgba(0,0,0,0.25)' }}>
              <Media src={pic.src} durFrames={durFrames} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'url(#duo) contrast(1.04)' }} />
            </div>
          ) : tex ? (
            <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          ) : null}
          {furniture}
          {page}
          {stampText ? <Stamp text={stampText} f={f} at={stampAt} x={stampX} y={stampY} seed={seed} color={stampColor} big={scan} /> : null}
          {/* Ink sits in the paper. */}
          {tex && !scan ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply', opacity: 0.3 }} /> : null}
        </div>
      </AbsoluteFill>
      {/* Depth of field: the page's far edge softens as the camera closes in. */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 70% at 50% ${(midY / H) * 100}%, rgba(0,0,0,0) 55%, rgba(0,0,0,${0.25 + 0.2 * m}) 100%)`, pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
