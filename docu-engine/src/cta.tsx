import React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { FONT } from './fonts';
import { safeBand } from './devices/common';
import type { Genre, Scene } from './types';

/*
 * THE VIEWER CALL, SHOWN — the one line that asks for a like/subscribe (or a comment) gets an animated button that
 * lands EXACTLY on the spoken word and leaves quickly (owner, Oct 2026: "tam istediği anda çıkmalı, uzun sürmesin").
 * Timing comes from the narration's measured word times, never an estimate: the like button is pressed on "like",
 * the subscribe button turns to SUBBED a beat after "subscribe" (only when that word is said), the comment bubble
 * pops on "comments". Gone CTA_HOLD_SEC after the last of them and always before the scene ends. Solid pills on a
 * dark plate (readable over any picture), no hairlines, the look's accent for the pressed state.
 */
export const CTA_HOLD_SEC = 2.4;
/** The Hype pill is up this long before "Hype" ("…tap Hype"): the viewer sees the button, then a cursor presses it. */
export const HYPE_LEAD_SEC = 0.6;
type Words = { word: string; t: number }[];
const clean = (w: string) => w.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü']/g, '');

/** Seconds (scene-local) of the asked words: like / subscribe / comment / hype. */
export function ctaMoments(scene: Pick<Scene, 'wordTimes'> & { cta?: string }): { like?: number; subscribe?: number; comment?: number; hype?: number } {
  const words: Words = (scene.wordTimes ?? []).filter((w) => !/^\[.*\]$/.test(w.word));
  const at = (re: RegExp) => words.find((w) => re.test(clean(w.word)))?.t;
  // The trio after the hook (Oct 2026, owner: "like abone yorum 3'lü"): one line says like, subscribe AND comments —
  // the three buttons pop one after another on their words.
  if (scene.cta === 'like') return { like: at(/^(like[sd]?|beğen\p{L}*)$/u), subscribe: at(/^(subscrib\p{L}*|abone)$/u), comment: at(/^(comments?|yorum\p{L}*)$/u) };
  if (scene.cta === 'comment') return { comment: at(/^(comments?|yorum\p{L}*)$/u) };
  // YouTube's Hype (owner, 22 Oct 2026: "hype da istenebilir… arada söylemeli ve animasyonu da gözükmeli"): one line in
  // the middle of the video says "Hype"; the button is pressed on that word.
  if (scene.cta === 'hype') return { hype: at(/^(hype[ds]?|hype'?la\p{L}*)$/u) };
  return {};
}

const THUMB = 'M7 11v8a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1h3a4 4 0 0 0 4 -4v-1a2 2 0 0 1 4 0v5h3a2 2 0 0 1 2 2l-1 5a2 3 0 0 1 -2 2h-7a3 3 0 0 1 -3 -3';
const BELL = ['M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6', 'M9 17v1a3 3 0 0 0 6 0v-1'];
const BUBBLE = 'M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1';
const CHECK = 'M5 12l5 5l10 -10';
const CURSOR = 'M4 2l0 17l4.5 -4.2l3 6.8l3 -1.3l-3 -6.7l6.3 -0.3z';
const FLAME = 'M12 12c2 -2.96 0 -7 -1 -8c0 3.038 -1.773 4.741 -3 6c-1.226 1.26 -2 3.24 -2 5a6 6 0 1 0 12 0c0 -1.532 -1.056 -3.94 -2 -5c-1.786 3 -2.791 3 -4 2z';
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const Icon: React.FC<{ d: string | string[]; size: number; color: string; fill?: string; style?: React.CSSProperties }> = ({ d, size, color, fill = 'none', style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={style}>
    {(Array.isArray(d) ? d : [d]).map((p, i) => (
      <path key={i} d={p} fill={i === 0 ? fill : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    ))}
  </svg>
);

const Pill: React.FC<{ bg: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ bg, children, style }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 30px 16px 22px', borderRadius: 999, background: bg, boxShadow: '0 14px 40px rgba(0,0,0,0.38)', ...style }}>{children}</div>
);

export const CtaOverlay: React.FC<{ scene: Scene & { cta?: string }; genre: Genre; durFrames: number; locale?: string }> = ({ scene, genre, durFrames, locale }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const m = ctaMoments(scene);
  const times = [m.like, m.subscribe, m.comment, m.hype].filter((x): x is number => Number.isFinite(x));
  if (!times.length) return null;
  const fr = (s: number) => Math.round(s * fps);
  const appear = times.map((t) => (t === m.hype ? Math.max(0, t - HYPE_LEAD_SEC) : t));
  const start = fr(Math.min(...appear)) - 3;
  const end = Math.min(durFrames - 4, fr(Math.max(...times)) + fr(CTA_HOLD_SEC));
  if (f < start || f > end + 8 || end <= start) return null;
  const tr = String(locale ?? 'en').toLowerCase().startsWith('tr');
  const font = FONT[genre.body];
  const accent = genre.accent;
  const plate = 'rgba(14,14,16,0.88)';
  const out = interpolate(f, [end, end + 8], [1, 0], clamp);
  const band = safeBand(genre, 40);
  const pop = (at: number) => spring({ frame: f - (at - 3), fps, config: { damping: 13, stiffness: 190, mass: 0.7 } });
  const label: React.CSSProperties = { fontFamily: font, fontWeight: 800, fontSize: 34, letterSpacing: '0.06em', color: '#ffffff', textTransform: 'uppercase', whiteSpace: 'nowrap' };

  const items: React.ReactNode[] = [];
  if (m.like !== undefined) {
    const at = fr(m.like);
    const p = pop(at);
    const press = interpolate(f - at, [-2, 1, 5, 9], [1, 0.8, 1.16, 1], { ...clamp, easing: Easing.out(Easing.quad) });
    const pressed = f >= at;
    const burst = interpolate(f - at, [0, 12], [0, 1], clamp);
    items.push(
      <Pill key="like" bg={plate} style={{ transform: `translateY(${(1 - p) * 60}px) scale(${0.85 + 0.15 * p})`, opacity: p }}>
        <div style={{ position: 'relative', width: 60, height: 60 }}>
          {pressed && burst < 1
            ? Array.from({ length: 6 }, (_, i) => {
                const a = (i / 6) * Math.PI * 2;
                const r = 20 + 26 * burst;
                return <div key={i} style={{ position: 'absolute', left: 30 + Math.cos(a) * r - 4, top: 30 + Math.sin(a) * r - 4, width: 8, height: 8, borderRadius: 8, background: accent, opacity: 1 - burst }} />;
              })
            : null}
          <Icon d={THUMB} size={60} color={pressed ? accent : '#ffffff'} fill={pressed ? accent : 'none'} style={{ transform: `scale(${press})` }} />
        </div>
        <span style={label}>{tr ? 'Beğen' : 'Like'}</span>
      </Pill>,
    );
  }
  if (m.subscribe !== undefined) {
    const at = fr(m.subscribe);
    const p = pop(at);
    const done = f >= at + Math.round(0.4 * fps);
    const swing = done ? 18 * Math.sin((f - at) / 2.2) * Math.exp(-(f - at - 12) / 14) : 0;
    items.push(
      <Pill key="sub" bg={done ? '#2a2a2e' : accent} style={{ transform: `translateY(${(1 - p) * 60}px) scale(${0.85 + 0.15 * p})`, opacity: p }}>
        <Icon d={done ? CHECK : BELL} size={46} color="#ffffff" style={{ transform: `rotate(${swing}deg)`, transformOrigin: '50% 10%' }} />
        <span style={label}>{done ? (tr ? 'Abone olundu' : 'Subscribed') : tr ? 'Abone ol' : 'Subscribe'}</span>
        {done ? <Icon d={BELL} size={40} color={accent} style={{ transform: `rotate(${swing}deg)`, transformOrigin: '50% 10%' }} /> : null}
      </Pill>,
    );
  }
  if (m.comment !== undefined) {
    const at = fr(m.comment);
    const p = pop(at);
    const dot = (k: number) => 0.35 + 0.65 * Math.max(0, Math.sin((f - at) / 3 - k * 0.9));
    items.push(
      <Pill key="comment" bg={plate} style={{ transform: `translateY(${(1 - p) * 60}px) scale(${0.85 + 0.15 * p})`, opacity: p }}>
        <div style={{ position: 'relative', width: 60, height: 60 }}>
          <Icon d={BUBBLE} size={60} color={accent} fill={accent} />
          <div style={{ position: 'absolute', left: 14, top: 24, display: 'flex', gap: 6 }}>
            {[0, 1, 2].map((k) => <div key={k} style={{ width: 8, height: 8, borderRadius: 8, background: '#ffffff', opacity: dot(k) }} />)}
          </div>
        </div>
        <span style={label}>{tr ? 'Yorum yap' : 'Comment'}</span>
      </Pill>,
    );
  }
  if (m.hype !== undefined) {
    // Up a beat before the word ("tap…"), a cursor glides in and presses it on "Hype": the pill turns to a warm gradient,
    // a white flame, sparks fly, HYPED, and a +1 floats up.
    const at = fr(m.hype);
    const lead = fr(HYPE_LEAD_SEC);
    const p = pop(at - lead);
    const pressed = f >= at;
    const press = interpolate(f - at, [-2, 1, 5, 9], [1, 0.8, 1.18, 1], { ...clamp, easing: Easing.out(Easing.quad) });
    const burst = interpolate(f - at, [0, 14], [0, 1], clamp);
    const flicker = 1 + 0.06 * Math.sin(f / 2.3);
    const plus = interpolate(f - at, [2, 30], [0, 1], clamp);
    const glide = interpolate(f, [at - lead + 2, at - 2], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
    const click = interpolate(f - at, [-2, 0, 4], [1, 0.82, 1], clamp);
    const cursorOut = interpolate(f - at, [10, 18], [1, 0], clamp);
    items.push(
      <Pill key="hype" bg={pressed ? `linear-gradient(90deg, ${accent}, #ff4d6d)` : plate} style={{ position: 'relative', transform: `translateY(${(1 - p) * 60}px) scale(${(0.85 + 0.15 * p) * press})`, opacity: p }}>
        <div style={{ position: 'relative', width: 60, height: 60 }}>
          {pressed && burst < 1
            ? Array.from({ length: 8 }, (_, i) => {
                const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
                const r = 18 + 34 * burst;
                return <div key={i} style={{ position: 'absolute', left: 30 + Math.cos(a) * r - 5, top: 30 + Math.sin(a) * r - 5, width: 10, height: 10, borderRadius: 10, background: '#ffd166', opacity: 1 - burst }} />;
              })
            : null}
          <Icon d={FLAME} size={60} color={pressed ? '#ffffff' : '#ff8a3d'} fill={pressed ? '#ffffff' : 'none'} style={{ transform: `scale(${flicker})`, transformOrigin: '50% 80%' }} />
        </div>
        <span style={label}>{pressed ? (tr ? "Hype'landı" : 'Hyped!') : 'Hype'}</span>
        {pressed && plus < 1 ? (
          <span style={{ ...label, position: 'absolute', right: 6, top: -30 - 60 * plus, fontSize: 46, color: '#ffffff', textShadow: '0 4px 14px rgba(0,0,0,0.55)', opacity: 1 - plus * plus }}>+1</span>
        ) : null}
        {cursorOut > 0 ? (
          <svg width={54} height={54} viewBox="0 0 24 24" style={{ position: 'absolute', left: 150 + (1 - glide) * 170, top: 40 + (1 - glide) * 110, opacity: Math.min(glide * 3, 1) * cursorOut, transform: `scale(${click})`, transformOrigin: '20% 10%', filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))' }}>
            <path d={CURSOR} fill="#ffffff" stroke="#111114" strokeWidth={1.4} strokeLinejoin="round" />
          </svg>
        ) : null}
      </Pill>,
    );
  }
  return (
    <div style={{ position: 'absolute', left: band.left + 24, top: band.bottom - 150, display: 'flex', gap: 18, alignItems: 'center', opacity: out, pointerEvents: 'none' }}>
      {items}
    </div>
  );
};
