import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, fitFont, textWidth } from './fonts';
import { LETTERBOX, Media, clipOf } from './fx';
import { paperTexture, seededRng } from './paper';
import { labelIndex, spokenOf } from './infographics/timing.js';
import type { FontKey, Genre, HeadlineScene } from './types';

/*
 * HEADLINE — a period newspaper front page. The sheet lies on a dark desk;
 * the camera starts tilted over the masthead, rolls down onto the headline
 * while it typesets letter by letter, lands with the last letter (the engine
 * punches the frame there) and keeps pushing slowly towards the photo. Every
 * size is solved from the text, so a two-word and an eight-word headline both
 * fill the page width and never leave it.
 */

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Page size in its own px (larger than the frame: the camera moves over it). */
const PW = 1640;
const PH = 2300;
const M = 56;
const CW = PW - 2 * M;
const NCOL = 6;
const GAP = 26;
const COLW = (CW - (NCOL - 1) * GAP) / NCOL;

export type Lang = 'en' | 'tr' | 'ru';

const CYR = /[Ѐ-ӿ]/;
const TR_CHARS = /[İŞĞÇÖÜışğçöü]/;
const TR_MONTH = /\b(OCAK|ŞUBAT|MART|NİSAN|MAYIS|HAZİRAN|TEMMUZ|AĞUSTOS|EYLÜL|EKİM|KASIM|ARALIK)\b/i;

function paperLang(s: HeadlineScene): Lang {
  const all = `${s.paper ?? ''} ${s.headline ?? ''}`;
  if (CYR.test(all)) return 'ru';
  if (TR_CHARS.test(`${s.paper ?? ''} ${s.headline ?? ''} ${s.date ?? ''}`) || TR_MONTH.test(s.date ?? '')) return 'tr';
  return 'en';
}
const LOCALE: Record<Lang, string> = { en: 'en-US', tr: 'tr-TR', ru: 'ru-RU' };
const up = (t: string, lang: Lang) => t.toLocaleUpperCase(LOCALE[lang]);

export interface NewsStyle {
  tone: string;
  age: number;
  ink: string;
  mastFont: FontKey;
  mastColor: string;
  hedFont: FontKey;
  hedTrackEm: number;
  /** Largest headline size per line count. */
  hedCap: [number, number, number];
  desk: string;
  soviet: boolean;
  blur: number;
}

export function newsStyle(g: Genre, lang: Lang, paper: string): NewsStyle {
  const soviet = lang === 'ru';
  const ascii = /^[\x20-\x7E]*$/.test(paper);
  const tones: Record<string, [string, number]> = {
    documentary: ['#e6d8b7', 0.8],
    crime: ['#e0dbcc', 0.7],
    inspire: ['#eedfbf', 0.75],
    finance: ['#ebe4cf', 0.55],
    horror: ['#d6cbb0', 1],
    science: ['#e8e4d8', 0.45],
    epic: ['#e0cea4', 0.9],
  };
  const [tone, age] = tones[g.id] ?? tones.documentary;
  const mastFont: FontKey = soviet ? 'oswald' : g.id === 'finance' || g.id === 'science' || !ascii ? 'oldstandard' : 'fraktur';
  const hedFont: FontKey = g.id === 'finance' ? 'oldstandard' : g.id === 'epic' ? 'cinzel' : 'oswald';
  return {
    tone: soviet ? '#d9ceb2' : tone,
    age: soviet ? Math.max(age, 0.95) : age,
    ink: '#1f1b16',
    mastFont,
    mastColor: soviet ? '#a8141c' : '#15120e',
    hedFont,
    hedTrackEm: hedFont === 'oswald' ? 0.005 : hedFont === 'cinzel' ? 0.02 : 0.01,
    hedCap: g.id === 'finance' ? [190, 150, 118] : [280, 215, 165],
    desk: g.bg,
    soviet,
    blur: soviet || g.id === 'horror' ? 0.55 : 0.3,
  };
}

/* ---------------------------------------------------------- greeked text */

const WORDS: Record<Lang, { short: string[]; syl: string[] }> = {
  en: {
    short: ['the', 'of', 'and', 'to', 'a', 'in', 'was', 'that', 'his', 'for', 'on', 'by', 'it', 'at', 'from', 'with', 'had', 'as', 'be', 'were'],
    syl: ['con', 'ter', 'ment', 'pre', 'sta', 'tion', 'port', 'ed', 'ing', 'al', 'mar', 'der', 'ver', 'com', 'pro', 'dent', 'ly', 'ex', 'cit', 'ber', 'ward', 'ness', 'ral', 'man', 'go', 'ern', 'ish', 'ful'],
  },
  tr: {
    short: ['ve', 'bir', 'bu', 'da', 'de', 'ile', 'için', 'olan', 'gibi', 'çok', 'her', 'en', 'ki', 'daha'],
    syl: ['lar', 'ler', 'mek', 'dan', 'hü', 'kü', 'met', 'ye', 'rin', 'sı', 'baş', 'va', 'ka', 'le', 'ti', 'nın', 'dı', 'rak', 'ze', 'ri', 'şe', 'ol', 'mış', 'yor'],
  },
  ru: {
    short: ['и', 'в', 'на', 'с', 'по', 'не', 'что', 'к', 'из', 'от', 'за', 'как', 'о', 'до'],
    syl: ['ско', 'ва', 'ни', 'ть', 'ра', 'ко', 'ле', 'ный', 'про', 'ст', 'ве', 'го', 'ция', 'ми', 'ра', 'бо', 'та', 'ски', 'лю', 'де', 'же', 'ро', 'ны', 'вод'],
  },
};

function greekWord(r: () => number, lang: Lang): string {
  const w = WORDS[lang];
  if (r() < 0.38) return w.short[Math.floor(r() * w.short.length)];
  const n = 1 + Math.floor(r() * r() * 4) + (r() < 0.5 ? 1 : 0);
  let s = '';
  for (let i = 0; i < n; i++) s += w.syl[Math.floor(r() * w.syl.length)];
  return s;
}

function greekParagraph(r: () => number, lang: Lang, words: number): string {
  const out: string[] = [];
  let cap = true;
  for (let i = 0; i < words; i++) {
    let w = greekWord(r, lang);
    if (cap || r() < 0.06) w = w[0].toLocaleUpperCase(LOCALE[lang]) + w.slice(1);
    cap = false;
    if (i < words - 1 && r() < 0.07) w += ',';
    if (i < words - 1 && r() < 0.05) {
      w += '.';
      cap = true;
    }
    out.push(w);
  }
  return `${out.join(' ')}.`;
}

function greekHed(r: () => number, lang: Lang, words: number): string {
  return up(Array.from({ length: words }, () => greekWord(r, lang)).join(' '), lang);
}

/* ------------------------------------------------------------- layout */

const SMALL_WORDS = new Set(['of', 'the', 'and', 'a', 'an', 'in', 'on', 'at', 'for', 'to']);
function titleCase(t: string): string {
  return t
    .toLowerCase()
    .split(/(\s+)/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');
}

/** Split into `k` lines with the longest line as short as possible (by characters). */
function splitLines(text: string, k: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (k <= 1 || words.length <= 1) return [words.join(' ')];
  k = Math.min(k, words.length);
  let best: string[] = [words.join(' ')];
  let bestMax = Infinity;
  const rec = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')];
      const max = Math.max(...lines.map((l) => l.length));
      // Prefer the longer line at the bottom on a tie (a pyramid reads calmer).
      if (max < bestMax || (max === bestMax && lines[lines.length - 1].length >= best[best.length - 1].length)) {
        bestMax = max;
        best = lines;
      }
      return;
    }
    for (let i = start + 1; i <= words.length - left + 1; i++) rec(i, left - 1, [...acc, words.slice(start, i).join(' ')]);
  };
  rec(0, k, []);
  return best;
}

export interface HeadlineLayout {
  lang: Lang;
  style: NewsStyle;
  lines: string[];
  hedSize: number;
  hedW: number;
  deck: string[];
  deckSize: number;
  mastText: string;
  mastSize: number;
  yMast: number;
  yFolio: number;
  yHed: number;
  hedH: number;
  yDeck: number;
  deckH: number;
  yBody: number;
  photo: { x: number; y: number; w: number; h: number } | null;
  chars: number;
}

export function headlineLayout(scene: HeadlineScene, genre: Genre): HeadlineLayout {
  const lang = paperLang(scene);
  const style = newsStyle(genre, lang, scene.paper ?? '');
  const hed = up(String(scene.headline ?? '').trim() || '—', lang);
  const words = hed.split(/\s+/).filter(Boolean);
  const size = (ls: string[]) =>
    Math.min(...ls.map((l) => fitFont(l, style.hedFont, { maxW: CW, cap: style.hedCap[ls.length - 1] ?? 150, trackEm: style.hedTrackEm, min: 40 })));
  /*
   * One, two or three lines — whichever sets the type biggest, with a
   * handicap for three lines and for an orphan (a last line of one short
   * word: "…16,000,000-SHARE / DAY").
   */
  let lines = [hed];
  let hedSize = size(lines);
  let best = -1;
  for (let k = 1; k <= Math.min(3, words.length); k++) {
    const ls = splitLines(hed, k);
    const sz = size(ls);
    const last = ls[ls.length - 1];
    const orphan = ls.length > 1 && !/\s/.test(last) && last.length <= 5;
    const score = sz * (k === 3 ? 0.9 : 1) * (orphan ? 0.75 : 1);
    if (score > best) {
      best = score;
      lines = ls;
      hedSize = sz;
    }
  }
  const hedW = Math.max(...lines.map((l) => textWidth(l, style.hedFont, hedSize, { trackEm: style.hedTrackEm })));
  const lh = style.hedFont === 'oswald' ? 1.0 : 1.06;
  const hedH = Math.round(lines.length * hedSize * lh);

  const deckText = String(scene.sub ?? '').trim();
  const deckRaw = deckText ? up(deckText, lang) : '';
  const deck = deckRaw ? (deckRaw.length > 46 ? splitLines(deckRaw, 2) : [deckRaw]) : [];
  const deckSize = deck.length ? Math.min(...deck.map((l) => fitFont(l, 'oldstandard', { maxW: CW - 120, cap: 52, trackEm: 0.03, min: 24 }))) : 0;
  const deckH = deck.length ? Math.round(deck.length * deckSize * 1.25) + 40 : 0;

  // Blackletter is set in title case, the way a masthead is lettered (all-caps fraktur is unreadable).
  const paper = String(scene.paper ?? '').trim() || 'THE DAILY NEWS';
  const mastText = style.mastFont === 'fraktur' ? titleCase(paper) : up(paper, lang);
  const earW = 250;
  const mastSize = fitFont(mastText, style.mastFont, { maxW: CW - 2 * earW - 40, cap: 150, trackEm: style.soviet ? 0.02 : 0, min: 50 });
  const yMast = style.soviet ? 92 : 58;
  const yFolio = yMast + Math.round(mastSize * 1.12) + 26;
  const yHed = yFolio + 62 + Math.round(hedSize * 0.1);
  const yDeck = yHed + hedH + 22;
  const yBody = yDeck + deckH + 26;
  let photo: HeadlineLayout['photo'] = null;
  if (scene.image || scene.video) {
    const w = 4 * COLW + 3 * GAP;
    const iw = scene.video ? scene.videoW ?? scene.imgW : scene.imgW;
    const ih = scene.video ? scene.videoH ?? scene.imgH : scene.imgH;
    const aspect = iw && ih ? Math.min(1.9, Math.max(0.9, iw / ih)) : 1.45;
    photo = { x: M + COLW + GAP, y: yBody + 8, w, h: Math.round(Math.min(760, Math.max(520, w / aspect))) };
  }
  return { lang, style, lines, hedSize, hedW, deck, deckSize, mastText, mastSize, yMast, yFolio, yHed, hedH, yDeck, deckH, yBody, photo, chars: lines.join('').replace(/\s/g, '').length };
}

/** The frame the narration first says the headline's words (it is typeset as it is read, never before); null if never. */
function headlineSpoken(scene: HeadlineScene, fps: number): number | null {
  const sp = spokenOf(scene.wordTimes ?? []) as { t: number }[];
  if (!sp.length) return null;
  const k = labelIndex(String(scene.headline ?? ''), sp as never);
  return k >= 0 ? Math.round(sp[k].t * fps) : null;
}

/** Typesetting clock: when the first letter hits and how many frames between letters. */
function typeClock(chars: number, fps: number, at: number | null = null) {
  const start = Math.max(Math.round(0.45 * fps), at ?? 0);
  const step = Math.max(0.55, Math.min(2.2, (1.05 * fps) / Math.max(1, chars)));
  return { start, step, land: Math.round(start + chars * step + 2) };
}

/** Frame the headline's last letter lands on (the engine punches here). Independent of the line breaks: letters are counted, not lines. */
export function headlineLand(scene: HeadlineScene, fps: number): number {
  const chars = up(String(scene.headline ?? '').trim() || '—', paperLang(scene)).replace(/\s/g, '').length;
  return typeClock(chars, fps, headlineSpoken(scene, fps)).land;
}

/* ------------------------------------------------------------- pieces */

const Rule: React.FC<{ y: number; double?: boolean; x?: number; w?: number; ink: string }> = ({ y, double, x = M, w = CW, ink }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w }}>
    <div style={{ height: 2, background: ink }} />
    {double ? <div style={{ height: 5, background: ink, marginTop: 3 }} /> : null}
  </div>
);

const SovietStar: React.FC<{ size: number; color: string }> = ({ size, color }) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? size * 0.2 : size * 0.5;
    return `${(size / 2 + Math.cos(a) * r).toFixed(1)},${(size / 2 + Math.sin(a) * r).toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon points={pts} fill={color} />
    </svg>
  );
};

/** Halftone print: the picture thresholded against a dot screen (contrast trick), multiplied onto the paper. */
const Halftone: React.FC<{ scene: HeadlineScene; w: number; h: number; durFrames: number; tone: string }> = ({ scene, w, h, durFrames, tone }) => {
  const f = useCurrentFrame();
  const fc = scene.focus ?? [0.5, 0.35];
  // The print is still; only the slightest creep so a long hold on it never freezes.
  const creep = interpolate(f, [0, durFrames], [1.02, 1.06], clamp);
  const pic: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: `${fc[0] * 100}% ${fc[1] * 100}%`,
    transform: `scale(${creep})`,
    transformOrigin: `${fc[0] * 100}% ${fc[1] * 100}%`,
  };
  const media = (filter: string) => (
    <Media src={scene.image} clip={clipOf(scene)} durFrames={durFrames} style={{ ...pic, filter }} />
  );
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', background: tone }}>
      {/* Tonal base under the dots: keeps faces readable at 1080p. */}
      <div style={{ position: 'absolute', inset: 0, mixBlendMode: 'multiply', opacity: 0.55 }}>{media('grayscale(1) contrast(1.15) brightness(1.05)')}</div>
      <div style={{ position: 'absolute', inset: 0, mixBlendMode: 'multiply', opacity: 0.8 }}>
        <div style={{ position: 'absolute', inset: 0, background: '#fff', filter: 'contrast(30)', overflow: 'hidden' }}>
          {media('grayscale(1) brightness(1.1) blur(1.6px)')}
          <div
            style={{
              position: 'absolute',
              left: '-50%',
              top: '-50%',
              width: '200%',
              height: '200%',
              backgroundImage: 'radial-gradient(circle at center, #000 0%, #fff 72%)',
              backgroundSize: '7px 7px',
              transform: 'rotate(22deg)',
              mixBlendMode: 'color-dodge',
            }}
          />
        </div>
      </div>
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 2px rgba(20,16,12,0.85)' }} />
    </div>
  );
};

/* ================================================================ SCENE */

export const Headline: React.FC<{ scene: HeadlineScene; genre: Genre; durFrames: number; speed: number; index?: number }> = ({
  scene,
  genre,
  durFrames,
  speed,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useMemo(() => headlineLayout(scene, genre), [scene, genre]);
  const S = L.style;
  const lang = L.lang;
  const seed = `${scene.paper}|${scene.headline}|${scene.date ?? ''}`;
  const tex = useMemo(() => paperTexture(`np${seed}`, { tone: S.tone, w: 820, h: 1150, age: S.age, folds: [0.5] }), [seed, S.tone, S.age]);

  /* ---- the printed page (static; memoized so a frame only moves the camera) ---- */
  const page = useMemo(() => {
    const r = seededRng(seed);
    const ink = S.ink;
    const folio = (() => {
      const n = 1000 + Math.floor(r() * 28000);
      if (lang === 'ru') return { l: `№ ${1 + Math.floor(r() * 300)} (${n})`, r: `Цена ${[10, 15, 20][Math.floor(r() * 3)]} коп.` };
      if (lang === 'tr') return { l: `SAYI: ${n.toLocaleString('tr-TR')}`, r: `FİYATI ${[5, 10, 25][Math.floor(r() * 3)]} KURUŞ` };
      const vol = ['LX', 'LXI', 'LXXVIII', 'XCIV', 'CXX'][Math.floor(r() * 5)];
      return { l: `VOL. ${vol}. . . . No. ${n.toLocaleString('en-US')}`, r: `PRICE ${['ONE CENT', 'TWO CENTS', 'THREE CENTS'][Math.floor(r() * 3)]}` };
    })();
    const ears =
      lang === 'ru'
        ? [['ВЕЧЕРНИЙ', 'ВЫПУСК'], ['ИЗДАЕТСЯ', 'ЕЖЕДНЕВНО']]
        : lang === 'tr'
          ? [['SON', 'BASKI'], ['HER GÜN', 'ÇIKAR']]
          : [['LATE CITY', 'EDITION'], ['"ALL THE NEWS', 'OF THE DAY"']];
    const earBox = (lines: string[], side: 'left' | 'right') => (
      <div
        style={{
          position: 'absolute',
          top: L.yMast + Math.max(0, L.mastSize * 0.5 - 50),
          [side]: M,
          width: 210,
          border: `2px solid ${ink}`,
          padding: '10px 8px',
          textAlign: 'center',
          fontFamily: FONT.oldstandard,
          fontWeight: 700,
          fontSize: 19,
          lineHeight: 1.25,
          letterSpacing: '0.06em',
          color: ink,
        }}
      >
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    );

    // Body columns: a small column head and justified paragraphs, down to the foot of the page.
    const cols = Array.from({ length: NCOL }, (_, c) => {
      const inPhoto = L.photo && c >= 1 && c <= 4;
      const top = inPhoto && L.photo ? L.photo.y + L.photo.h + (scene.caption ? 64 : 26) : L.yBody + 8;
      const paras: React.ReactNode[] = [];
      paras.push(
        <div key="h" style={{ fontFamily: FONT.oldstandard, fontWeight: 700, fontSize: 21, lineHeight: 1.12, textAlign: 'center', letterSpacing: '0.02em', marginBottom: 6 }}>
          {greekHed(r, lang, 3 + Math.floor(r() * 3))}
        </div>,
        <div key="hr" style={{ width: 70, height: 2, background: ink, margin: '4px auto 8px' }} />,
      );
      for (let p = 0; p < 9; p++) {
        paras.push(
          <p key={p} style={{ margin: 0, textIndent: '1.2em' }}>
            {greekParagraph(r, lang, 26 + Math.floor(r() * 50))}
          </p>,
        );
      }
      return (
        <div
          key={c}
          lang={lang}
          style={{
            position: 'absolute',
            left: M + c * (COLW + GAP),
            top,
            width: COLW,
            height: PH - M - top,
            overflow: 'hidden',
            fontFamily: FONT.oldstandard,
            fontSize: 16.5,
            lineHeight: 1.28,
            color: ink,
            textAlign: 'justify',
            hyphens: 'auto',
          }}
        >
          {paras}
        </div>
      );
    });
    // Rule c sits between columns c and c+1: beside the photo it runs from the body top, under it from the photo's foot.
    const colRules = Array.from({ length: NCOL - 1 }, (_, c) => {
      const x = M + (c + 1) * (COLW + GAP) - GAP / 2;
      const y0 = L.photo && c >= 1 && c <= 3 ? L.photo.y + L.photo.h + (scene.caption ? 60 : 22) : L.yBody;
      return <div key={c} style={{ position: 'absolute', left: x, top: y0, width: 1, height: PH - M - y0, background: `${ink}99` }} />;
    });

    return (
      <>
        {S.soviet ? (
          <div
            style={{
              position: 'absolute',
              top: 34,
              left: M,
              width: CW,
              textAlign: 'center',
              fontFamily: FONT.oldstandard,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: '0.18em',
              color: ink,
            }}
          >
            ПРОЛЕТАРИИ ВСЕХ СТРАН, СОЕДИНЯЙТЕСЬ!
          </div>
        ) : null}
        {earBox(ears[0], 'left')}
        {earBox(ears[1], 'right')}
        <div
          style={{
            position: 'absolute',
            top: L.yMast,
            left: M,
            width: CW,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 22,
          }}
        >
          {S.soviet ? <SovietStar size={Math.round(L.mastSize * 0.8)} color={S.mastColor} /> : null}
          <div
            style={{
              fontFamily: FONT[S.mastFont],
              fontWeight: S.mastFont === 'fraktur' ? 400 : 700,
              fontSize: L.mastSize,
              lineHeight: 1.1,
              color: S.mastColor,
              letterSpacing: S.soviet ? '0.02em' : 0,
              whiteSpace: 'nowrap',
            }}
          >
            {L.mastText}
          </div>
        </div>
        <Rule y={L.yFolio - 12} double ink={ink} />
        <div
          style={{
            position: 'absolute',
            top: L.yFolio,
            left: M,
            width: CW,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: FONT.oldstandard,
            fontWeight: 700,
            fontSize: 21,
            letterSpacing: '0.08em',
            color: ink,
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ width: 460 }}>{folio.l}</span>
          <span style={{ fontSize: 25 }}>{scene.date ? up(scene.date, lang) : ''}</span>
          <span style={{ width: 460, textAlign: 'right' }}>{folio.r}</span>
        </div>
        <Rule y={L.yFolio + 36} double ink={ink} />
        {L.deck.length ? <div style={{ position: 'absolute', left: PW / 2 - 160, top: L.yDeck + L.deckH - 26, width: 320, height: 2, background: ink }} /> : null}
        {cols}
        {colRules}
        {L.photo && scene.caption ? (
          <div
            style={{
              position: 'absolute',
              left: L.photo.x,
              top: L.photo.y + L.photo.h + 10,
              width: L.photo.w,
              fontFamily: FONT.oldstandard,
              fontStyle: 'italic',
              fontSize: 20,
              lineHeight: 1.2,
              color: ink,
              textAlign: 'center',
            }}
          >
            {scene.caption}
          </div>
        ) : null}
      </>
    );
  }, [L, S, lang, seed, scene.caption, scene.date]);

  /* ---- typesetting ---- */
  const clock = typeClock(L.chars, fps, headlineSpoken(scene, fps));
  let ci = 0;
  const hedLines = L.lines.map((line, li) => (
    <div key={li} style={{ whiteSpace: 'nowrap', height: Math.round(L.hedSize * (S.hedFont === 'oswald' ? 1.0 : 1.06)) }}>
      {[...line].map((ch, k) => {
        if (ch === ' ') return <span key={k}> </span>;
        const at = clock.start + ci * clock.step;
        ci++;
        const p = interpolate(f, [at, at + 3], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
        if (p <= 0) return <span key={k} style={{ opacity: 0 }}>{ch}</span>;
        return (
          <span
            key={k}
            style={{
              display: 'inline-block',
              opacity: p,
              transform: `translateY(${(1 - p) * -0.06 * L.hedSize}px) scale(${1 + (1 - p) * 0.3})`,
              transformOrigin: '50% 100%',
              filter: p < 0.99 ? `blur(${(1 - p) * 5}px)` : undefined,
            }}
          >
            {ch}
          </span>
        );
      })}
    </div>
  ));
  const deckP = interpolate(f, [clock.land + 3, clock.land + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });

  /* ---- camera ---- */
  const tr0 = String(scene.translation ?? '').trim();
  const barPx = genre.letterbox ? Math.round(1080 * LETTERBOX) : 0;
  const top = barPx + 40;
  const bottom = 1080 - barPx - (tr0 ? 190 : 60);
  const blockTop = L.yHed - 26;
  const blockBot = L.yDeck + L.deckH + (L.photo ? 150 : 90);
  const zHed = Math.max(0.55, Math.min(1.9, (1920 * 0.8) / Math.max(1, L.hedW), (bottom - top) / (blockBot - blockTop)));
  // Page y that sits on the frame centre when the block's middle is on the middle of the free band.
  const hedCy = (blockTop + blockBot) / 2 + (540 - (top + bottom) / 2) / zHed;
  const z0 = Math.max(0.5, zHed * 0.72);
  const cy0 = L.yMast + 380 / z0 - 60;
  const arrive = Math.max(Math.round(1.0 * fps), clock.land - 4);
  const move = interpolate(f, [0, arrive], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const after = interpolate(f, [arrive, Math.max(arrive + 1, durFrames)], [0, 1], clamp);
  const target = L.photo ? L.photo.y + L.photo.h * 0.25 : hedCy + 200;
  const z = z0 * Math.pow(zHed / z0, move) * (1 + 0.06 * speed * after);
  const cy = cy0 + (hedCy - cy0) * move + (target - hedCy) * 0.12 * after;
  const cx = PW / 2 + Math.sin(f / 47) * 6 + (1 - move) * -40;
  const rx = 26 * (1 - move) + 7 * move - 3 * after;
  const rz = -5 * (1 - move) - 1.3 * move - 0.6 * after;
  const intro = interpolate(f, [0, 8], [0, 1], clamp);

  const sub = L.deck.length ? (
    <div
      style={{
        position: 'absolute',
        top: L.yDeck,
        left: M,
        width: CW,
        textAlign: 'center',
        fontFamily: FONT.oldstandard,
        fontWeight: 400,
        fontSize: L.deckSize,
        lineHeight: 1.25,
        letterSpacing: '0.03em',
        color: S.ink,
        opacity: deckP,
        filter: deckP < 0.99 ? `blur(${(1 - deckP) * 4}px)` : undefined,
      }}
    >
      {L.deck.map((d, i) => (
        <div key={i}>{d}</div>
      ))}
    </div>
  ) : null;

  const tr = tr0;
  const trP = interpolate(f, [clock.land + 10, clock.land + 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const bar = barPx;
  const trSize = tr ? fitFont(tr, genre.body, { maxW: 1400, cap: 42, min: 24 }) : 42;
  const look = genre.look;

  return (
    <AbsoluteFill style={{ background: S.desk, overflow: 'hidden' }}>
      {/* The desk: a pool of light where the paper lies. */}
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 70% 60% at 50% 45%, rgba(255,235,200,0.10) 0%, rgba(0,0,0,0.55) 100%)` }} />
      <AbsoluteFill style={{ perspective: 1700, perspectiveOrigin: '960px 540px' }}>
        <div
          lang={lang}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: PW,
            height: PH,
            transformOrigin: '0 0',
            transform: `translate(960px, 540px) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${z}) translate(${-cx}px, ${-cy}px)`,
            background: S.tone,
            boxShadow: '0 50px 140px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,0,0,0.25)',
            opacity: intro,
          }}
        >
          {tex ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} /> : null}
          <div style={{ position: 'absolute', inset: 0, filter: `blur(${S.blur}px)`, opacity: 0.92 }}>
            {page}
            {L.photo ? (
              <div style={{ position: 'absolute', left: L.photo.x, top: L.photo.y }}>
                <Halftone scene={scene} w={L.photo.w} h={L.photo.h} durFrames={durFrames} tone={S.tone} />
              </div>
            ) : null}
            <div
              style={{
                position: 'absolute',
                top: L.yHed,
                left: M,
                width: CW,
                textAlign: 'center',
                fontFamily: FONT[S.hedFont],
                fontWeight: 700,
                fontSize: L.hedSize,
                lineHeight: S.hedFont === 'oswald' ? 1.0 : 1.06,
                letterSpacing: `${S.hedTrackEm}em`,
                color: S.ink,
                textShadow: S.soviet ? '0.8px 0.6px 0 rgba(20,10,5,0.45)' : '0.5px 0.5px 0 rgba(20,10,5,0.35)',
              }}
            >
              {hedLines}
            </div>
            {sub}
          </div>
          {/* Ink sits IN the paper: the sheet's own grain multiplied back over the print. */}
          {tex ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply', opacity: 0.35 }} /> : null}
        </div>
      </AbsoluteFill>
      {tr && trP > 0 ? (
        <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: Math.max(90, bar + 46), boxSizing: 'border-box' }}>
          <div
            style={{
              fontFamily: FONT[genre.body],
              fontWeight: look === 'label' ? 800 : 600,
              fontSize: trSize,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              padding: look === 'label' ? '12px 30px' : '14px 34px',
              color: look === 'label' ? genre.labelInk : look === 'terminal' ? genre.accent : genre.ink,
              background: look === 'label' ? genre.labelBg : 'rgba(0,0,0,0.72)',
              borderLeft: look === 'label' ? undefined : `4px solid ${genre.accent}`,
              boxShadow: look === 'label' ? `0 8px 0 ${genre.accent2}` : `0 10px 40px rgba(0,0,0,0.5)`,
              transform: `translateY(${(1 - trP) * 30}px) rotate(${genre.collage ? -1 : 0}deg)`,
              opacity: trP,
              textShadow: look === 'glow' ? `0 0 18px ${genre.accent}66` : undefined,
            }}
          >
            {look === 'terminal' ? `> ${tr}` : `“${tr}”`}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
