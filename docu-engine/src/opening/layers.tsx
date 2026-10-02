import React, { useMemo } from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT, caseLocale, fitFont } from '../fonts';
import { LETTERBOX, Media, clipOf } from '../fx';
import { paperTexture, seededRng } from '../paper';
import { newsStyle } from '../headline';
import { MapScn, mapPlan } from '../map';
import { Quote } from '../devices/quote';
import { boardLook } from '../devices/board';
import { DFONT, fitLine, fitWrap, type DevFont } from '../devices/type';
import { drawn, handLoop, safeBand, surfaceTexture } from '../devices/common';
import { montageCuts, montageWords, norm, slamFrame, textWords, wordFrames } from '../scenes';
import { LookContext, useLook } from '../looks/context';
import type { FontKey, Genre, MapScene, MontageScene, QuoteScene, Scene } from '../types';
import type { Opening, Stamp } from './plan.js';

/*
 * OPENING TREATMENTS (script.opening.kind) — six ways into a video, drawn
 * over (or instead of) the existing cold-open scenes. Nothing here changes
 * what is said or when: every word, number, date, quote and place comes from
 * the opening's own narration and scene fields (src/opening/plan.js).
 *
 *   headlines   the hook words / slams / lines land as newspaper clippings over the pictures
 *   timestamps  each beat with a date or time gets it typed into a stamp, a ticking dial beside it
 *   cold-open   heavier grade + 2.35 bars + flash cuts; a hard cut to the title, a rewind caption
 *   evidence    the opening pictures are pinned on a board one by one, joined by red string
 *   map-dive    the first beat opens on the region map diving into the story's place
 *   quote       the beat holding a real quotation is a black card with the words alone, then silence
 */

const W = 1920;
const H = 1080;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;
const easeOut = Easing.out(Easing.cubic);
const isTr = (locale: string) => /^tr/i.test(locale);
const up = (t: string, locale: string) => String(t ?? '').toLocaleUpperCase(caseLocale(locale));
const cleanWord = (w: string) => w.replace(/[.,!?…:;"“”«»()[\]]/g, '').replace(/^[—–-]+|[—–-]+$/g, '');

/* ================================================================ HEADLINES */

interface HlCue {
  text: string;
  f: number;
  hook?: boolean;
  deck?: string;
  /** A words line: a wide banner low in the frame. */
  line?: boolean;
}

/** When and what each clipping of a hook scene says (all from the scene's own words). */
export function headlineCues(scene: Scene, durFrames: number, fps: number): HlCue[] {
  if (scene.type === 'montage') {
    const ws = montageWords(scene, durFrames, fps)
      .map((w) => ({ text: cleanWord(w.word), f: w.f }))
      .filter((w) => w.text);
    return ws.map((w, i) => ({ ...w, hook: i === ws.length - 1 }));
  }
  if (scene.type === 'slam') return [{ text: String(scene.word ?? ''), f: slamFrame(scene, fps), hook: true, deck: scene.sub }];
  if (scene.type === 'words') {
    const fr = wordFrames(scene, durFrames, fps);
    const text = textWords(scene.text).join(' ');
    return text ? [{ text, f: Math.max(0, (fr[0] ?? 0) - 2), line: true }] : [];
  }
  return [];
}

/** Split into k lines with the longest as short as possible. */
function splitK(text: string, k: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (k <= 1 || words.length <= 1) return [words.join(' ')];
  k = Math.min(k, words.length);
  let best: string[] = [words.join(' ')];
  let bestMax = Infinity;
  const rec = (start: number, left: number, acc: string[]) => {
    if (left === 1) {
      const lines = [...acc, words.slice(start).join(' ')];
      const max = Math.max(...lines.map((l) => l.length));
      if (max < bestMax) {
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

/** Lines and size for a headline: whichever of 1-3 lines sets the type biggest. */
function setHeadline(text: string, font: FontKey, maxW: number, cap: number, trackEm: number, maxLines = 3) {
  let best = { lines: [text], size: 8, score: -1 };
  const words = text.split(/\s+/).filter(Boolean).length;
  for (let k = 1; k <= Math.min(maxLines, words); k++) {
    const ls = splitK(text, k);
    const capK = cap * (k === 1 ? 1 : k === 2 ? 0.86 : 0.74);
    const size = Math.min(...ls.map((l) => fitFont(l, font, { maxW, cap: capK, trackEm, upper: true, min: 28 })));
    const last = ls[ls.length - 1];
    const orphan = ls.length > 1 && !/\s/.test(last) && last.length <= 4;
    const score = size * (k === 3 ? 0.92 : 1) * (orphan ? 0.8 : 1);
    if (score > best.score) best = { lines: ls, size, score };
  }
  return best;
}

/** A torn strip of newsprint: jagged top and bottom edges (seeded). */
function tornClip(seed: string): string {
  const r = seededRng(`torn${seed}`);
  const n = 22;
  const top: string[] = [];
  const bot: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * 100;
    top.push(`${x.toFixed(2)}% ${(r() * 2.6).toFixed(2)}%`);
    bot.push(`${(100 - x).toFixed(2)}% ${(100 - r() * 2.6).toFixed(2)}%`);
  }
  return `polygon(${[...top, ...bot].join(', ')})`;
}

const Clipping: React.FC<{
  text: string;
  genre: Genre;
  locale: string;
  maxW: number;
  cap: number;
  since: number;
  seed: string;
  deck?: string;
  dateline?: string;
  tilt: number;
  dim?: number;
  maxLines?: number;
  /** The hook: lands harder (bigger overshoot). */
  hero?: boolean;
}> = ({ text, genre, locale, maxW, cap, since, seed, deck, dateline, tilt, dim = 0, maxLines = 3, hero }) => {
  const S = newsStyle(genre, isTr(locale) ? 'tr' : 'en', 'x');
  const T = up(text, locale);
  const padX = 38;
  const set = useMemo(() => setHeadline(T, S.hedFont, maxW - 2 * padX, cap, S.hedTrackEm, maxLines), [T, S.hedFont, maxW, cap, S.hedTrackEm, maxLines]);
  const tex = useMemo(() => paperTexture(`clip${genre.id}`, { tone: S.tone, w: 640, h: 320, age: S.age, rings: false }), [genre.id, S.tone, S.age]);
  const clipPath = useMemo(() => tornClip(seed), [seed]);
  if (since < 0) return null;
  const p = interpolate(since, [0, 3, 7], [0, 1.04, 1], clamp);
  const over = hero ? 0.45 : 0.22;
  const lh = S.hedFont === 'oswald' ? 1.02 : 1.08;
  const deckT = deck ? up(deck, locale) : '';
  const deckSize = deckT ? fitFont(deckT, 'oldstandard', { maxW: maxW - 2 * padX, cap: Math.max(26, Math.round(set.size * 0.24)), trackEm: 0.04, min: 20 }) : 0;
  const dl = dateline ? up(dateline, locale) : '';
  return (
    <div
      style={{
        position: 'relative',
        maxWidth: maxW,
        transform: `rotate(${tilt}deg) scale(${1 + (1 - Math.min(1, p)) * over + Math.max(0, p - 1)})`,
        opacity: Math.min(1, p * 2.4),
        filter: `drop-shadow(0 18px 26px rgba(0,0,0,0.6))${dim > 0 ? ` brightness(${1 - dim})` : ''}`,
      }}
    >
      <div style={{ position: 'relative', background: S.tone, clipPath, padding: `${dl ? 20 : 30}px ${padX}px ${deckT ? 22 : 30}px` }}>
        {tex ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.9 }} /> : null}
        <div style={{ position: 'relative', color: S.ink, textAlign: 'center' }}>
          {/* The dateline is set like a newspaper's: small caps, spaced — no decorative rules. */}
          {dl ? <div style={{ fontFamily: FONT.oldstandard, fontWeight: 700, fontSize: 24, letterSpacing: '0.2em', whiteSpace: 'nowrap', marginBottom: 10, opacity: 0.85 }}>{dl}</div> : null}
          <div
            style={{
              fontFamily: FONT[S.hedFont],
              fontWeight: 700,
              fontSize: set.size,
              lineHeight: lh,
              letterSpacing: `${S.hedTrackEm}em`,
              textTransform: 'none',
              whiteSpace: 'nowrap',
              textShadow: '0.6px 0.6px 0 rgba(20,10,5,0.35)',
            }}
          >
            {set.lines.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
          {deckT ? <div style={{ marginTop: 12, fontFamily: FONT.oldstandard, fontStyle: 'italic', fontSize: deckSize, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{deckT}</div> : null}
        </div>
        {/* Ink sits in the paper. */}
        {tex ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', mixBlendMode: 'multiply', opacity: 0.3 }} /> : null}
      </div>
    </div>
  );
};

/** How long the hook clipping holds the frame alone before the paper gives way to the pictures. */
const HERO_HOLD = 48;

/** Corners a clipping may land in (the hook goes centre, a words line low). */
const SPOTS: React.CSSProperties[] = [
  { justifyContent: 'flex-start', alignItems: 'flex-start' },
  { justifyContent: 'flex-end', alignItems: 'flex-end' },
  { justifyContent: 'flex-start', alignItems: 'flex-end' },
  { justifyContent: 'flex-end', alignItems: 'flex-start' },
];

/** The opening's hook: the first thing said that can hit (scene-local frame of its scene). */
export interface Hook {
  scene: number;
  f: number;
  text: string;
  type: 'montage' | 'slam' | 'words' | 'stamp';
  /** The scene draws the hook itself with its own hit (a slam, a montage's last word): no extra sound. */
  native?: boolean;
  /** Montage: which word is the hook (a hard hook slams that word). */
  word?: number;
  /** Montage: the whole spoken line, word by word (a cinematic or quiet hook sets the line as it is said). */
  words?: { text: string; f: number }[];
}

export const HeadlineLayer: React.FC<{
  scene: Scene;
  genre: Genre;
  locale: string;
  durFrames: number;
  beat: number;
  stamp?: Stamp | null;
  /** When the stamp is said (the dateline only goes on clippings that land after it). */
  stampAt?: number | null;
  hook?: Hook | null;
  hookStyle?: HookStyleKind;
}> = ({ scene, genre, locale, durFrames, beat, stamp, stampAt, hook, hookStyle = 'impact' }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const cues = useMemo(() => {
    const own = headlineCues(scene, durFrames, fps).map((c) => ({ ...c, hero: false }));
    // The hook opens the paper: a date said first becomes the first banner; else the first clipping hits as the hook.
    if (hook?.type === 'stamp') return [{ text: hook.text, f: hook.f, hero: true }, ...own.filter((c) => c.f > hook.f + 6)];
    const hi = hook ? own.findIndex((c) => Math.abs(c.f - hook.f) <= 1) : -1;
    if (hi >= 0) own[hi] = { ...own[hi], hero: !own[hi].hook };
    return own;
  }, [scene, durFrames, fps, hook]);
  if (!cues.length) return null;
  const band = safeBand(genre, 40);
  const live = cues.map((c, i) => ({ ...c, i })).filter((c) => f >= c.f);
  if (!live.length) return null;
  const last = live[live.length - 1];
  const finalOn = live.some((c) => c.hook);
  // The hook and the final word hold the frame alone; in between, a pile of at most three corner clippings.
  const shown = finalOn
    ? live.filter((c) => c.hook || f - (cues.find((x) => x.hook)?.f ?? 0) < 4)
    : last.hero
      ? f - last.f < HERO_HOLD ? [last] : []
      : live.filter((c) => !c.hero).slice(-3);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* The pictures sink a little under the paper. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 80% 75% at 50% 50%, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.42) 100%)' }} />
      {shown.map((c) => {
        const since = f - c.f;
        const seed = `${beat}-${c.i}-${c.text}`;
        const tilt = (seededRng(`tilt${seed}`)() - 0.5) * (c.hook || c.hero ? 3 : 6);
        const age = live.length - 1 - live.findIndex((x) => x.i === c.i);
        const dim = c.hook || c.hero ? 0 : Math.min(0.45, age * 0.2);
        // The dateline is the beat's stamp, only on a clipping that lands after the whole stamp has been said (never on the hook itself).
        const dated = stamp && stampAt !== null && stampAt !== undefined && !c.hero && c.f >= stampAt && (c.hook || c.line || c.i === cues.findIndex((x) => !x.hero && x.f >= stampAt));
        const dateline = dated ? stamp!.text : undefined;
        if (c.hook || c.line || c.hero) {
          return (
            <AbsoluteFill
              key={c.i}
              style={{
                boxSizing: 'border-box',
                justifyContent: c.line ? 'flex-end' : 'center',
                alignItems: 'center',
                padding: `${band.top}px 120px ${H - band.bottom}px`,
              }}
            >
              <Clipping
                text={c.text}
                genre={genre}
                locale={locale}
                maxW={c.line ? 1500 : 1560}
                cap={c.line ? 104 : 230}
                since={since}
                seed={seed}
                deck={c.deck}
                dateline={dateline}
                tilt={tilt}
                maxLines={c.line ? 3 : 2}
                hero={(c.hero && hookStyle === 'impact') || c.hook}
              />
            </AbsoluteFill>
          );
        }
        return (
          <AbsoluteFill key={c.i} style={{ boxSizing: 'border-box', ...SPOTS[c.i % SPOTS.length], padding: `${band.top + 10}px 130px ${H - band.bottom + 10}px` }}>
            <Clipping text={c.text} genre={genre} locale={locale} maxW={1080} cap={156} since={since} seed={seed} dateline={dateline} tilt={tilt} dim={dim} maxLines={2} />
          </AbsoluteFill>
        );
      })}
      {last.hero && hookStyle === 'impact' && f - last.f < 4 ? <AbsoluteFill style={{ background: '#fff', opacity: interpolate(f - last.f, [0, 1, 4], [0.7, 0.4, 0], clamp), mixBlendMode: 'screen' }} /> : null}
    </AbsoluteFill>
  );
};

/* ================================================================ HOOK */

export type HookStyleKind = 'impact' | 'cinematic' | 'quiet';

/**
 * The hook beat every opening starts on, in the story's tone:
 *  impact     the first punch the narrator says, slammed in the genre's impact type with a flash
 *             (the engine punches the frame, the sound design hits on the same frame);
 *  cinematic  dramatic but composed: wide-tracked type easing in out of a soft bloom, no flash;
 *  quiet      wonder: the words rise letter by letter out of a blur over the held picture, no hit.
 * It holds a moment, then gives the frame to the treatment.
 */
export const HookSlam: React.FC<{ text: string; genre: Genre; locale: string; at: number; hold?: number; style?: HookStyleKind; words?: { text: string; f: number }[] }> = ({ text, genre, locale, at, hold, style = 'impact', words }) => {
  const f = useCurrentFrame();
  const since = f - at;
  // A line set word by word holds until a beat after its last word.
  const lineEnd = words?.length && style !== 'impact' ? words[words.length - 1].f - at : 0;
  const H0 = lineEnd + (hold ?? (style === 'impact' ? 30 : style === 'cinematic' ? 42 : 54));
  const lineWords = words?.length && style !== 'impact' ? words.map((w) => ({ t: up(w.text, locale), at: w.f - at })) : null;
  const fade = style === 'impact' ? 8 : 14;
  if (since < 0 || since > H0 + fade) return null;
  const T = up(text, locale);
  const out = interpolate(since, [H0, H0 + fade], [1, 0], clamp);
  if (style === 'quiet') {
    const line = lineWords ? lineWords.map((w) => w.t).join(' ') : T;
    const size = fitFont(line, genre.headline, { maxW: 1500, cap: 132, trackEm: 0.14, upper: true, min: 40 });
    const drift = interpolate(since, [0, H0 + fade], [10, -10], clamp);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: out }}>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 65% 55% at 50% 50%, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 100%)' }} />
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', transform: `translateY(${drift}px)` }}>
          <div style={{ fontFamily: FONT[genre.headline], fontWeight: 600, fontSize: size, letterSpacing: '0.14em', color: genre.titleInk ?? genre.ink, whiteSpace: 'nowrap', textShadow: `0 0 40px ${genre.accent}44, 0 4px 24px rgba(0,0,0,0.6)` }}>
            {(lineWords ? lineWords.flatMap((w, k) => [...(k ? ' ' : '') + w.t].map((ch, j) => ({ ch, t0: w.at + j * 1.2 }))) : [...T].map((ch, i) => ({ ch, t0: i * 1.6 }))).map(({ ch, t0 }, i) => {
              const p = interpolate(since, [t0, t0 + 14], [0, 1], { ...clamp, easing: easeOut });
              return (
                <span key={i} style={{ display: 'inline-block', whiteSpace: 'pre', opacity: p, filter: p < 0.98 ? `blur(${(1 - p) * 9}px)` : undefined, transform: `translateY(${(1 - p) * 18}px)` }}>
                  {ch}
                </span>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  if (style === 'cinematic') {
    const line = lineWords ? lineWords.map((w) => w.t).join(' ') : T;
    const size = fitFont(line, genre.headline, { maxW: 1600, cap: 200, trackEm: 0.16, upper: true, min: 50, scaleMax: 1.1 });
    const p = interpolate(since, [0, 16], [0, 1], { ...clamp, easing: easeOut });
    const wordP = (a: number) => interpolate(since, [a, a + 12], [0, 1], { ...clamp, easing: easeOut });
    const track = 0.1 + 0.06 * interpolate(since, [0, H0 + fade], [0, 1], clamp);
    const bloom = interpolate(since, [0, 6, 22], [0, 0.32, 0], clamp);
    return (
      <AbsoluteFill style={{ pointerEvents: 'none', opacity: out }}>
        <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 60% at 50% 50%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.18) 100%)' }} />
        {bloom > 0 ? <AbsoluteFill style={{ background: `radial-gradient(ellipse 50% 40% at 50% 50%, ${genre.accent} 0%, rgba(0,0,0,0) 70%)`, opacity: bloom, mixBlendMode: 'screen' }} /> : null}
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div
            style={{
              fontFamily: FONT[genre.headline],
              fontWeight: 800,
              fontSize: size,
              lineHeight: 0.95,
              letterSpacing: `${track}em`,
              color: genre.titleInk ?? genre.ink,
              whiteSpace: 'nowrap',
              opacity: p,
              transform: `scale(${1.12 - 0.12 * p})`,
              filter: p < 0.98 ? `blur(${(1 - p) * 6}px)` : undefined,
              textShadow: `0 0 50px ${genre.accent}66, 0 8px 30px rgba(0,0,0,0.7)`,
            }}
          >
            {lineWords
              ? lineWords.map((w, k) => (
                  <span key={k} style={{ display: 'inline-block', opacity: wordP(w.at), filter: wordP(w.at) < 0.98 ? `blur(${(1 - wordP(w.at)) * 6}px)` : undefined, marginLeft: k ? '0.35em' : 0 }}>
                    {w.t}
                  </span>
                ))
              : T}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  const trackEm = genre.look === 'glow' ? 0.05 : 0.012;
  const size = fitFont(T, genre.headline, { maxW: 1640, cap: 250, trackEm, upper: true, scaleMax: 1.12, min: 60 });
  const land = interpolate(since, [0, 4], [1.45, 1], { ...clamp, easing: Easing.out(Easing.quad) });
  const echo = interpolate(since, [0, 12], [0, 1], clamp);
  const flash = interpolate(since, [0, 1, 4], [0.75, 0.45, 0], clamp);
  const word = (extra: React.CSSProperties) => (
    <div style={{ fontFamily: FONT[genre.headline], fontWeight: 800, fontSize: size, lineHeight: 0.92, letterSpacing: `${trackEm}em`, whiteSpace: 'nowrap', ...extra }}>{T}</div>
  );
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: out }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 100%)' }} />
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ position: 'relative', transform: `scale(${land * (1 + 0.03 * (since / Math.max(1, H0)))})` }}>
          {echo < 1 ? word({ position: 'absolute', inset: 0, color: 'transparent', WebkitTextStroke: `3px ${genre.accent}`, transform: `scale(${1 + echo * 0.4})`, opacity: (1 - echo) * 0.7 }) : null}
          {word({ color: genre.look === 'terminal' ? genre.ink : genre.accent, textShadow: genre.look === 'glow' ? `0 0 60px ${genre.accent}, 0 0 10px #000` : '0 10px 0 rgba(0,0,0,0.45), 0 0 50px rgba(0,0,0,0.6)' })}
        </div>
      </AbsoluteFill>
      {flash > 0 ? <AbsoluteFill style={{ background: '#fff', opacity: flash, mixBlendMode: 'screen' }} /> : null}
    </AbsoluteFill>
  );
};

/* ================================================================ TIMESTAMPS */

/** Characters typed per frame. */
const TYPE_STEP = 1.4;
export const stampTypeFrames = (text: string) => Math.ceil([...text].length * TYPE_STEP);
/** Ticker-tape paper for the stock-market and space stories; a typed luggage tag for the rest. */
const TAPE_GENRES = new Set(['finance', 'science']);

/**
 * A brass-bezel clock: engraved rim, cream enamel face with minute track, the
 * stamp's own time on its hands (when there is one) and a second hand that
 * ticks once a second.
 */
export const BrassClock: React.FC<{ size: number; time?: string; f: number; fps: number; accent: string; uid: string }> = ({ size, time, f, fps, accent, uid }) => {
  const m = time?.match(/^(\d{1,2})[:.](\d{2})/);
  const hh = m ? +m[1] % 12 : 10;
  const mm = m ? +m[2] : 9;
  const tick = Math.floor(f / fps);
  const into = f - tick * fps;
  const kick = interpolate(into, [0, 2, 5], [-2.5, 1, 0], clamp);
  const sec = tick * 6 + kick + 120;
  const R = size / 2;
  const hand = (deg: number, len: number, tail: number, w: number, color: string) => {
    const a = ((deg - 90) * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const px = -uy * w;
    const py = ux * w;
    const tip = [R + ux * len, R + uy * len];
    const back = [R - ux * tail, R - uy * tail];
    return <polygon points={`${back[0] + px},${back[1] + py} ${tip[0]},${tip[1]} ${back[0] - px},${back[1] - py}`} fill={color} />;
  };
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flex: 'none', filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.6))', overflow: 'visible' }}>
      <defs>
        <radialGradient id={`brass${uid}`} cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#fff1c2" />
          <stop offset="30%" stopColor="#e2b85e" />
          <stop offset="70%" stopColor="#9c6b1d" />
          <stop offset="100%" stopColor="#4f340b" />
        </radialGradient>
        <linearGradient id={`rim${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5a3c0e" />
          <stop offset="50%" stopColor="#c9993f" />
          <stop offset="100%" stopColor="#3d2908" />
        </linearGradient>
        <radialGradient id={`face${uid}`} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#fbf4e2" />
          <stop offset="80%" stopColor="#e6d8b6" />
          <stop offset="100%" stopColor="#bfae86" />
        </radialGradient>
      </defs>
      <circle cx={R} cy={R} r={R} fill={`url(#brass${uid})`} />
      <circle cx={R} cy={R} r={R * 0.86} fill={`url(#rim${uid})`} />
      <circle cx={R} cy={R} r={R * 0.8} fill={`url(#face${uid})`} />
      {Array.from({ length: 60 }, (_, i) => {
        const a = (i * 6 * Math.PI) / 180;
        const big = i % 5 === 0;
        const r0 = R * (big ? 0.62 : 0.7);
        const r1 = R * 0.75;
        return <line key={i} x1={R + Math.cos(a) * r0} y1={R + Math.sin(a) * r0} x2={R + Math.cos(a) * r1} y2={R + Math.sin(a) * r1} stroke="#2a2118" strokeWidth={big ? size * 0.03 : size * 0.01} strokeLinecap="round" />;
      })}
      {hand(hh * 30 + mm * 0.5, R * 0.42, R * 0.1, size * 0.035, '#1c1611')}
      {hand(mm * 6, R * 0.62, R * 0.12, size * 0.024, '#1c1611')}
      {hand(sec, R * 0.7, R * 0.22, size * 0.009, accent)}
      <circle cx={R} cy={R} r={size * 0.04} fill={`url(#brass${uid})`} stroke="#3d2908" strokeWidth={1} />
      {/* The glass: one soft highlight. */}
      <ellipse cx={R * 0.78} cy={R * 0.62} rx={R * 0.42} ry={R * 0.22} fill="#ffffff" opacity={0.16} transform={`rotate(-30 ${R * 0.78} ${R * 0.62})`} />
    </svg>
  );
};

/**
 * The stamp, typed as it is said: a typed luggage tag (or a strip of ticker
 * tape) tied to a brass clock. The date types in on the date's first spoken
 * word, the time on the time's. As the opening's hook it first slams in
 * big and centred, then settles onto the tag.
 */
export const StampLayer: React.FC<{ stamp: Stamp; genre: Genre; locale: string; dateAt: number | null; timeAt: number | null; hero?: boolean; hookStyle?: HookStyleKind; uid: string }> = ({
  stamp,
  genre,
  locale,
  dateAt,
  timeAt,
  hero,
  hookStyle = 'impact',
  uid,
}) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const band = safeBand(genre, 34);
  const tape = TAPE_GENRES.has(genre.id);
  const font: DevFont = tape ? 'plexMono' : 'elite';
  const date = stamp.date ? up(stamp.date, locale) : '';
  const time = stamp.time ? up(stamp.time, locale) : '';
  const full = [date, time].filter(Boolean).join(' · ');
  const first = Math.min(...[dateAt, timeAt].filter((x): x is number => x !== null));
  if (!Number.isFinite(first)) return null;
  // As the hook the first-said part slams centred for a beat, then the tag takes over.
  const heroText = dateAt !== null && (timeAt === null || dateAt <= timeAt) ? date : time;
  const heroHold = hookStyle === 'impact' ? 26 : hookStyle === 'cinematic' ? 38 : 50;
  const tagAt = hero ? first + heroHold - 4 : first - 3;
  // Typed per part, each from its own spoken frame (the hero part is already on the tag when it settles).
  const typedPart = (txt: string, at: number | null) => {
    if (!txt || at === null) return '';
    if (hero && txt === heroText && f >= tagAt) return txt;
    const n = Math.max(0, Math.min([...txt].length, Math.floor((f - at) / TYPE_STEP)));
    return [...txt].slice(0, n).join('');
  };
  const dShown = typedPart(date, dateAt);
  const tShown = typedPart(time, timeAt);
  const shown = [dShown, tShown].filter(Boolean).join(' · ');
  const typing = (date && dShown.length < date.length && dateAt !== null && f >= dateAt) || (time && tShown.length < time.length && timeAt !== null && f >= timeAt);
  const size = fitLine(full, font, { maxW: 980, cap: [...full].length <= 12 ? 84 : 66, min: 32, trackEm: 0.04 });
  const clock = Math.round(size * 2.1);
  const inP = interpolate(f, [tagAt, tagAt + 8], [0, 1], { ...clamp, easing: easeOut });
  const ink = '#1d1a16';
  const tex = useMemo(() => paperTexture(`tag${genre.id}`, { tone: tape ? '#efe9d6' : '#eadfc4', w: 600, h: 200, age: 0.45, rings: false }), [genre.id, tape]);
  const tagH = Math.round(size * 1.9);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {hero ? <HookSlam text={heroText} genre={genre} locale={locale} at={first} hold={heroHold} style={hookStyle} /> : null}
      {f >= tagAt ? (
        <div style={{ position: 'absolute', left: band.left, top: band.top, display: 'flex', alignItems: 'center', opacity: inP, transform: `translateY(${(1 - inP) * -30}px) rotate(${(1 - inP) * -4}deg)` }}>
          <BrassClock size={clock} time={stamp.time || undefined} f={f} fps={fps} accent={genre.accent} uid={uid} />
          <div
            style={{
              position: 'relative',
              marginLeft: -Math.round(clock * 0.12),
              height: tagH,
              minWidth: Math.round(size * 3),
              padding: tape ? `0 ${Math.round(size * 0.6)}px` : `0 ${Math.round(size * 0.6)}px 0 ${Math.round(size * 0.9)}px`,
              display: 'flex',
              alignItems: 'center',
              background: tape ? '#efe9d6' : '#eadfc4',
              clipPath: tape ? undefined : 'polygon(0 22%, 9% 0, 100% 0, 100% 100%, 9% 100%, 0 78%)',
              transform: tape ? 'rotate(0.6deg)' : 'rotate(-1.6deg)',
              boxShadow: '0 12px 26px rgba(0,0,0,0.5)',
              zIndex: -1,
            }}
          >
            {tex ? <Img src={tex} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.85 }} /> : null}
            {tape ? (
              // Sprocket holes along the tape's top edge.
              <div style={{ position: 'absolute', left: 10, right: 10, top: 7, height: 9, backgroundImage: 'radial-gradient(circle, rgba(40,30,20,0.55) 3px, transparent 3.6px)', backgroundSize: '18px 9px' }} />
            ) : (
              // The tag's punched hole with a brass eyelet.
              <div style={{ position: 'absolute', left: Math.round(size * 0.32), top: '50%', width: Math.round(size * 0.3), height: Math.round(size * 0.3), marginTop: -Math.round(size * 0.15), borderRadius: '50%', background: 'rgba(20,14,8,0.85)', boxShadow: `0 0 0 ${Math.max(3, Math.round(size * 0.06))}px #b78a35` }} />
            )}
            <div style={{ position: 'relative', fontFamily: DFONT[font], fontWeight: tape ? 600 : 400, fontSize: size, lineHeight: 1, letterSpacing: '0.04em', color: ink, whiteSpace: 'pre', marginTop: tape ? 6 : 0 }}>
              {shown}
              {typing ? <span style={{ display: 'inline-block', width: Math.round(size * 0.45), height: Math.round(size * 0.8), marginLeft: 3, background: ink, opacity: 0.8, verticalAlign: '-6%' }} /> : null}
            </div>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Between stamped beats: the brass clock alone keeps ticking in its corner (no date — nothing is claimed). */
export const DialPlate: React.FC<{ genre: Genre; uid: string }> = ({ genre, uid }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const band = safeBand(genre, 34);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', left: band.left, top: band.top, opacity: 0.92 }}>
        <BrassClock size={120} f={f} fps={fps} accent={genre.accent} uid={uid} />
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================ COLD OPEN */

/** Bars of a 2.35:1 frame (a little deeper than the genre's own letterbox). */
export const COLD_BAR = Math.round(H * 0.122);
export const COLD_GRADE = 'contrast(1.16) saturate(0.55) brightness(0.97)';

export const ColdOpenLayer: React.FC<{ beat: number; durFrames: number }> = ({ beat }) => {
  const f = useCurrentFrame();
  const bar = beat === 0 ? interpolate(f, [0, 14], [0, COLD_BAR], { ...clamp, easing: easeOut }) : COLD_BAR;
  const flash = beat > 0 ? interpolate(f, [0, 1, 4], [0.55, 0.35, 0], clamp) : 0;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* A cold cast over the "later" footage, and a heavier falloff. */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(40,70,90,0.22) 0%, rgba(24,44,58,0.16) 100%)', mixBlendMode: 'multiply' }} />
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.42) 100%)' }} />
      {flash > 0 ? <AbsoluteFill style={{ background: '#fff', opacity: flash, mixBlendMode: 'screen' }} /> : null}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: bar, background: '#000' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: bar, background: '#000' }} />
    </AbsoluteFill>
  );
};

/** The hard cut back to the title: a few frames of tape-rewind tearing. */
export const TapeTear: React.FC = () => {
  const f = useCurrentFrame();
  const tear = interpolate(f, [0, 10], [1, 0], clamp);
  if (tear <= 0) return null;
  const r = seededRng(`rw${f}`);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 5 }, (_, k) => {
        const y = r() * H;
        const h = 6 + r() * 34;
        return (
          <div
            key={k}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: y,
              height: h,
              background: `linear-gradient(90deg, rgba(255,255,255,${0.05 + r() * 0.2}) 0%, rgba(255,255,255,${0.25 * tear}) ${(r() * 100).toFixed(0)}%, rgba(0,0,0,0.2) 100%)`,
              transform: `translateX(${(r() - 0.5) * 120 * tear}px)`,
              opacity: tear,
              mixBlendMode: 'screen',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * The rewind caption, on the scene that rewinds and on the word that says
 * it: a tape-counter readout ("◀◀ JAN 1959") that scrubs in with a short
 * rewind streak, then holds.
 */
export const RewindCaption: React.FC<{ genre: Genre; text: string; at: number; durFrames: number; locale: string }> = ({ genre, text, at, durFrames, locale }) => {
  const f = useCurrentFrame();
  const since = f - at;
  if (since < 0) return null;
  const band = safeBand(genre, 40);
  const T = up(text, locale);
  const size = fitLine(T, 'plexMono', { maxW: 980, cap: 58, min: 28, trackEm: 0.14 });
  const n = Math.max(0, Math.min([...T].length, Math.floor(since / 1.2)));
  const inP = interpolate(since, [0, 6], [0, 1], { ...clamp, easing: easeOut });
  const out = interpolate(f, [durFrames - 10, durFrames - 2], [1, 0], clamp);
  const streak = interpolate(since, [0, 8], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: out }}>
      {streak > 0 ? <AbsoluteFill style={{ background: `repeating-linear-gradient(0deg, rgba(255,255,255,${0.08 * streak}) 0 2px, transparent 2px 9px)`, transform: `translateY(${since * 14}px)` }} /> : null}
      <div
        style={{
          position: 'absolute',
          left: band.left,
          bottom: H - band.bottom,
          display: 'flex',
          alignItems: 'center',
          gap: Math.round(size * 0.45),
          padding: `${Math.round(size * 0.3)}px ${Math.round(size * 0.55)}px`,
          borderRadius: Math.round(size * 0.35),
          background: 'linear-gradient(180deg, rgba(20,20,22,0.78), rgba(6,6,8,0.78))',
          boxShadow: '0 14px 34px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
          opacity: inP,
          transform: `translateX(${(1 - inP) * 40}px)`,
        }}
      >
        <div style={{ fontFamily: DFONT.plexMono, fontWeight: 600, fontSize: Math.round(size * 0.9), color: genre.accent, letterSpacing: '-0.08em', textShadow: `0 0 18px ${genre.accent}88` }}>◀◀</div>
        <div style={{ fontFamily: DFONT.plexMono, fontWeight: 600, fontSize: size, letterSpacing: '0.14em', color: '#f4f1ea', whiteSpace: 'pre' }}>{[...T].slice(0, n).join('')}</div>
      </div>
    </AbsoluteFill>
  );
};

/* ================================================================ EVIDENCE */

export interface BoardItem {
  beat: number;
  scene: number;
  /** Scene-local frame it is pinned on. */
  at: number;
  src: string;
  /** Plays in its print while its own beat is on screen. */
  clip?: ReturnType<typeof clipOf>;
  aspect: number;
  label: string;
  /** Scene-local frame the label is said (a montage word, the slam word): it is written then, never before. */
  labelAt?: number;
  note?: string;
  /** The note's words light up between these scene-local frames. */
  noteFrom?: number;
  noteTo?: number;
  hook?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  ph: number;
  tilt: number;
}

const PRINT_W = 440;
const PAD = 18;
const STRIP = 96;

/** Is this beat drawn on the board (it has a picture to pin)? */
export function boardBeat(s: Scene): boolean {
  if (s.type === 'montage') return !!(s.images?.length || s.clips?.some(Boolean));
  if (s.type === 'photo' || s.type === 'words') return !!(s.image || s.video);
  if (s.type === 'slam') return !!(s.image || s.video) && !s.layers;
  return false;
}

/** Every print of the opening, laid out once on one big board (snake grid, seeded jitter). */
export function boardItems(op: Opening, scenes: Scene[], frames: number[], fps: number, locale: string): BoardItem[] {
  const out: Omit<BoardItem, 'x' | 'y' | 'w' | 'h' | 'ph' | 'tilt'>[] = [];
  const stampTxt = (k: number) => op.stamps[k]?.text ?? '';
  op.span.beats.forEach((i, k) => {
    const s = scenes[i];
    if (!s || !boardBeat(s)) return;
    const dur = frames[i] ?? 120;
    const sz = (o: { imgW?: number; imgH?: number; videoW?: number; videoH?: number }) => {
      const w = o.videoW ?? o.imgW;
      const h = o.videoH ?? o.imgH;
      return w && h ? Math.min(1.5, Math.max(0.75, w / h)) : 1.4;
    };
    if (s.type === 'montage') {
      const m = s as MontageScene;
      const cuts = montageCuts(m, dur, fps);
      const words = montageWords(m, dur, fps);
      const n = Math.min(6, cuts.length);
      for (let j = 0; j < n; j++) {
        const from = cuts[j];
        const to = j + 1 < cuts.length ? cuts[j + 1] : dur;
        const saidW = words.filter((w) => w.f >= from && w.f < to);
        const said = saidW.map((w) => cleanWord(w.word));
        const c = m.clips?.[j];
        const src = m.images?.[j] ?? c?.image ?? '';
        if (!src) continue;
        out.push({ beat: k, scene: i, at: from + 2, src, aspect: c ? sz(c) : 1.4, label: up(said.join(' '), locale), labelAt: saidW[0]?.f, hook: j === n - 1 && words.length > 0 });
      }
      return;
    }
    const src = (s as { image?: string }).image ?? '';
    if (!src) return;
    let label = '';
    let note: string | undefined;
    let noteFrom: number | undefined;
    let noteTo: number | undefined;
    if (s.type === 'photo') label = String(s.name ?? s.caption ?? stampTxt(k) ?? '');
    if (s.type === 'slam') label = up(String(s.word ?? ''), locale);
    if (s.type === 'words') {
      note = textWords(s.text).join(' ');
      const fr = wordFrames(s, dur, fps);
      noteFrom = fr[0] ?? 6;
      noteTo = fr[fr.length - 1] ?? noteFrom + 30;
      label = stampTxt(k);
    }
    const labelAt = s.type === 'slam' ? slamFrame(s, fps) : undefined;
    out.push({ beat: k, scene: i, at: 3, src, clip: clipOf(s), aspect: sz(s), label, labelAt, note, noteFrom, noteTo, hook: s.type === 'slam' });
  });
  // A snake through a 4-wide grid: each new print lands next to the last one, the string never crosses the board.
  const r = seededRng(`ev${op.span.beats.join(',')}`);
  return out.map((it, n) => {
    const row = Math.floor(n / 4);
    const col = row % 2 ? 3 - (n % 4) : n % 4;
    const ph = Math.round(PRINT_W / it.aspect);
    return {
      ...it,
      x: col * 860 + (r() - 0.5) * 50,
      y: row * 600 + (r() - 0.5) * 50 + (col % 2 ? 30 : -20),
      w: PRINT_W + 2 * PAD,
      h: PAD + ph + STRIP,
      ph,
      tilt: (n % 2 ? 1 : -1) * (1.2 + r() * 3),
    };
  });
}

const pinOf = (it: BoardItem): [number, number] => {
  const a = (it.tilt * Math.PI) / 180;
  const dy = -it.h / 2 + 16;
  return [it.x - dy * Math.sin(a), it.y + dy * Math.cos(a)];
};

export const EvidenceBoard: React.FC<{ items: BoardItem[]; beat: number; genre: Genre; durFrames: number; locale: string }> = ({ items, beat, genre, durFrames }) => {
  const f = useCurrentFrame();
  const L = useMemo(() => boardLook(genre), [genre]);
  const tex = useMemo(() => surfaceTexture(`board${genre.id}`, L.surface, L.tone), [genre.id, L.surface, L.tone]);
  const band = safeBand(genre, 20);
  const midY = (band.top + band.bottom) / 2;
  const mine = items.filter((it) => it.beat === beat);
  const before = items.filter((it) => it.beat < beat);
  const visible = [...before, ...mine.filter((it) => f >= it.at - 1)];
  // Camera: on the newest print (arriving from the last one), then a slow pull back to the pile.
  const cur = [...mine].reverse().find((it) => f >= it.at - 6) ?? before[before.length - 1] ?? mine[0];
  const prev = cur ? items[items.indexOf(cur) - 1] : undefined;
  const travel = cur ? interpolate(f, [cur.at - 6, cur.at + 6], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 1;
  const zFocus = cur ? Math.min(1.5, ((band.bottom - band.top) * 0.72) / cur.h) : 1;
  const lastAt = mine.length ? mine[mine.length - 1].at : 0;
  const pull = interpolate(f, [Math.max(lastAt + 18, durFrames * 0.6), durFrames], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const zPull = visible.length > 1 ? zFocus * 0.72 : zFocus * 0.92;
  const z = zFocus + (zPull - zFocus) * pull;
  const from = prev ?? cur;
  // A print with a note card beside it is framed together with its note.
  const fx = (it: BoardItem) => it.x + (it.note ? 210 : 0);
  const cx0 = from ? fx(from) : 0;
  const cy0 = from ? from.y : 0;
  let cx = cur ? cx0 + (fx(cur) - cx0) * travel : 0;
  let cy = cur ? cy0 + (cur.y - cy0) * travel : 0;
  if (pull > 0 && visible.length > 1) {
    // Pull back towards the middle of the last few prints.
    const last = visible.slice(-3);
    const mx = last.reduce((a, it) => a + it.x, 0) / last.length;
    const my = last.reduce((a, it) => a + it.y, 0) / last.length;
    cx += (mx - cx) * pull * 0.6;
    cy += (my - cy) * pull * 0.6;
  }
  cx += Math.sin(f / 47) * 6;
  cy += Math.cos(f / 59) * 4;
  const span = 4200;
  const noteOf = (it: BoardItem) => {
    if (!it.note) return null;
    // Measured with room to spare: the hand face runs wider than its model, and a line must never be cut.
    const fit = fitWrap(it.note, 'hand', { maxW: 330, maxH: 300, lineH: 1.08, cap: 50, min: 28, maxLines: 5, balance: true });
    const h = Math.round(fit.lines.length * fit.size * 1.08 + 80);
    return { fit, w: 470, h, x: it.x + it.w / 2 + 110, y: it.y + 80 };
  };
  return (
    <AbsoluteFill style={{ background: L.tone, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, transformOrigin: '0 0', transform: `translate(${W / 2}px, ${midY}px) scale(${z}) translate(${-cx}px, ${-cy}px)` }}>
        <div
          style={{
            position: 'absolute',
            left: -span,
            top: -span,
            width: span * 3,
            height: span * 3,
            backgroundColor: L.tone,
            backgroundImage: tex ? `url(${tex})` : undefined,
            backgroundSize: '1600px 1000px',
          }}
        />
        {visible.map((it) => {
          const own = it.beat === beat;
          const t = own ? f - it.at : 99;
          const p = interpolate(t, [0, 6, 10], [0, 1.03, 1], clamp);
          const lift = (1 - Math.min(1, p)) * 70;
          const sh = 8 + (1 - Math.min(1, p)) * 40;
          const labP = own ? interpolate(f - Math.max(it.at + 8, it.labelAt ?? 0), [0, 12], [0, 1], clamp) : 1;
          const dim = own ? 1 : 0.8;
          const note = noteOf(it);
          const noteP = note && own ? interpolate(f, [(it.noteFrom ?? 6) - 4, (it.noteFrom ?? 6) + 4], [0, 1], clamp) : note ? 1 : 0;
          const reveal = note && own ? interpolate(f, [it.noteFrom ?? 6, Math.max((it.noteFrom ?? 6) + 6, it.noteTo ?? 30)], [0, 1], clamp) : 1;
          return (
            <React.Fragment key={`${it.scene}-${it.at}`}>
              <div
                style={{
                  position: 'absolute',
                  left: it.x - it.w / 2,
                  top: it.y - it.h / 2 - lift,
                  width: it.w,
                  height: it.h,
                  transform: `rotate(${it.tilt}deg) scale(${1 + (1 - Math.min(1, p)) * 0.18})`,
                  background: L.print,
                  boxShadow: `0 ${sh * 0.6}px ${sh}px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.4)`,
                  opacity: Math.min(1, p * 3),
                  filter: dim < 1 ? `brightness(${dim})` : undefined,
                }}
              >
                <div style={{ position: 'absolute', left: PAD, top: PAD, width: PRINT_W, height: it.ph, overflow: 'hidden', background: '#222' }}>
                  <Media
                    src={it.src}
                    clip={own ? it.clip : undefined}
                    durFrames={durFrames}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 35%', filter: 'url(#duo) contrast(1.05)' }}
                  />
                  <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 30px rgba(0,0,0,0.35)' }} />
                </div>
                {it.label ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: 12,
                      right: 12,
                      top: PAD + it.ph + 2,
                      bottom: 4,
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      fontFamily: DFONT.hand,
                      fontWeight: 700,
                      fontSize: fitWrap(it.label, 'hand', { maxW: it.w - 30, maxH: STRIP - 14, lineH: 0.98, cap: 60, min: 24, maxLines: 2, balance: true }).size,
                      lineHeight: 0.98,
                      color: it.hook ? L.string : L.ink,
                      textAlign: 'center',
                      clipPath: `inset(0 ${(1 - labP) * 100}% 0 0)`,
                    }}
                  >
                    {it.label}
                  </div>
                ) : null}
              </div>
              {note && noteP > 0 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: note.x - note.w / 2,
                    top: note.y - note.h / 2,
                    width: note.w,
                    height: note.h,
                    background: L.note,
                    transform: `rotate(${2 + (it.tilt > 0 ? -3 : 3)}deg) scale(${interpolate(noteP, [0, 1], [1.12, 1])})`,
                    opacity: noteP,
                    boxShadow: '0 10px 18px rgba(0,0,0,0.45)',
                    padding: '42px 30px 22px',
                    boxSizing: 'border-box',
                    fontFamily: DFONT.hand,
                    fontWeight: 600,
                    fontSize: note.fit.size,
                    lineHeight: 1.04,
                    color: L.noteInk,
                    filter: dim < 1 ? `brightness(${dim})` : undefined,
                  }}
                >
                  <div style={{ width: 'max-content', maxWidth: 'none', clipPath: `inset(0 -40px ${(1 - reveal) * 100}% 0)` }}>
                    {note.fit.lines.map((l, k) => (
                      <div key={k} style={{ whiteSpace: 'nowrap' }}>
                        {l}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
        <svg style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }} width={1} height={1}>
          {visible.map((it, n) => {
            if (!n) return null;
            const a = visible[n - 1];
            const own = it.beat === beat;
            const at = it.at + 8;
            const p = own ? interpolate(f, [at, at + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.quad) }) : 1;
            if (p <= 0) return null;
            const P = pinOf(a);
            const Q = pinOf(it);
            const len = Math.hypot(Q[0] - P[0], Q[1] - P[1]);
            const d = `M${P[0].toFixed(1)} ${P[1].toFixed(1)} Q${((P[0] + Q[0]) / 2).toFixed(1)} ${((P[1] + Q[1]) / 2 + Math.min(90, len * 0.08)).toFixed(1)} ${Q[0].toFixed(1)} ${Q[1].toFixed(1)}`;
            return (
              <g key={n}>
                <path d={d} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth={5} transform="translate(3 7)" {...drawn(p)} />
                <path d={d} fill="none" stroke={L.string} strokeWidth={4} strokeLinecap="round" {...drawn(p)} />
              </g>
            );
          })}
          {visible.map((it, n) => {
            const own = it.beat === beat;
            const t = own ? f - it.at : 99;
            if (t < 8) return null;
            const pop = interpolate(t, [8, 11, 14], [1.5, 0.9, 1], clamp);
            const [x, y] = pinOf(it);
            return (
              <g key={`p${n}`} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${pop})`}>
                <ellipse cx={5} cy={9} rx={13} ry={8} fill="rgba(0,0,0,0.45)" />
                <circle r={13} fill={L.pins[n % L.pins.length]} />
                <circle cx={-4} cy={-4} r={3.6} fill="rgba(255,255,255,0.75)" />
              </g>
            );
          })}
          {visible.map((it, n) => {
            if (!it.hook || it.beat !== beat) return null;
            const la = Math.max(it.at + 14, (it.labelAt ?? 0) + 4);
            const p = interpolate(f, [la, la + 16], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
            if (p <= 0) return null;
            const d = handLoop(`ev${n}`, it.x, it.y + 6, it.w * 0.68, it.h * 0.64);
            return <path key={`l${n}`} d={d} fill="none" stroke={L.string} strokeWidth={8} strokeLinecap="round" {...drawn(p)} />;
          })}
        </svg>
      </div>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse 62% 70% at 50% 46%, ${L.light} 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,${L.falloff}) 100%)` }} />
    </AbsoluteFill>
  );
};

/* ================================================================ MAP DIVE */

/** How long the dive covers the first beat (frames). */
export function diveFrames(durFrames: number, fps: number): number {
  return Math.max(Math.round(1.6 * fps), Math.min(Math.round(3.2 * fps), Math.round(durFrames * 0.55), durFrames - 10));
}

export const MapDive: React.FC<{ map: NonNullable<Opening['map']>; genre: Genre; locale: string; until: number }> = ({ map, genre, locale, until }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scene = useMemo<MapScene>(() => ({ type: 'map', region: map.region, points: [map.point], focus: 0, dur: until / fps, say: '' }), [map, until, fps]);
  const edgeY = genre.letterbox ? Math.round(H * LETTERBOX) : 0;
  const plan = useMemo(() => mapPlan(scene, until, fps, edgeY), [scene, until, fps, edgeY]);
  if (f >= until) return null;
  // Where the place sits on screen at the end of the map's own move: the plunge zooms into it.
  const ox = (map.point.x * W - plan.cam1.cx) * plan.cam1.z + W / 2;
  const oy = (map.point.y * H - plan.cam1.cy) * plan.cam1.z + H / 2;
  const plunge = interpolate(f, [until - 12, until], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const flash = interpolate(f, [until - 4, until - 1], [0, 0.85], clamp);
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      <AbsoluteFill style={{ transformOrigin: `${ox}px ${oy}px`, transform: `scale(${1 + plunge * 3.4})`, filter: plunge > 0.02 ? `blur(${plunge * 10}px)` : undefined }}>
        <MapScn scene={scene} genre={genre} durFrames={until} speed={1} index={9000} locale={locale} />
      </AbsoluteFill>
      {flash > 0 ? <AbsoluteFill style={{ background: '#fff', opacity: flash }} /> : null}
    </AbsoluteFill>
  );
};

/* ================================================================ QUOTE */

/** A black card with the quote alone, words lighting up as they are said; then a held beat of black. */
export const QuoteOpen: React.FC<{ scene: Scene; text: string; genre: Genre; durFrames: number; locale: string; index: number }> = ({ scene, text, genre, durFrames, locale, index }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const look = useLook();
  const qs = useMemo<QuoteScene>(() => ({ type: 'quote', quote: text, who: '', say: scene.say, wordTimes: scene.wordTimes, dur: scene.dur }), [scene, text]);
  // On black: a light variant's dark ink would vanish, so the card always reads light-on-dark.
  const dark = useMemo<Genre>(
    () => ({ ...genre, bg: '#000000', pattern: 'none', leak: 0, light: false, ink: genre.light ? '#f2efe8' : genre.ink, titleInk: genre.light ? '#f2efe8' : genre.titleInk, labelBg: genre.light ? genre.accent : genre.labelBg }),
    [genre],
  );
  const lookBlack = useMemo(() => ({ ...look, ground: undefined, backdrop: undefined, surface: 'dark' as const }), [look]);
  // After the last spoken word the card goes to black and holds: the beat of silence before the hit.
  const spoken = (scene.wordTimes ?? []).filter((w) => norm(w.word));
  const lastF = spoken.length ? Math.round(spoken[spoken.length - 1].t * fps) : Math.round(durFrames * 0.7);
  const black = interpolate(f, [lastF + 12, lastF + 22], [0, 1], clamp);
  return (
    <LookContext.Provider value={lookBlack}>
      <AbsoluteFill style={{ background: '#000' }}>
        <Quote scene={qs} genre={dark} durFrames={durFrames} speed={0.6} locale={locale} index={index} />
        {black > 0 ? <AbsoluteFill style={{ background: '#000', opacity: black }} /> : null}
      </AbsoluteFill>
    </LookContext.Provider>
  );
};

/** The hit after the quote's silence: one white frame on the cut. */
export const HitFlash: React.FC = () => {
  const f = useCurrentFrame();
  const o = interpolate(f, [0, 1, 4], [0.7, 0.45, 0], clamp);
  return o > 0 ? <AbsoluteFill style={{ background: '#fff', opacity: o, mixBlendMode: 'screen', pointerEvents: 'none' }} /> : null;
};
