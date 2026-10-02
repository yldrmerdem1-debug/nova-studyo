import type { FontKey, MotifId } from '../types';

/*
 * The faces each motif sets (mono/technical first, display second) — kept
 * free of React and of fonts.ts so fonts.ts can ask which faces to fetch
 * without an import cycle.
 */
export const MOTIF_FACES: Record<MotifId, [FontKey, FontKey]> = {
  cipher: ['jetbrains', 'spacegrotesk'],
  telegraph: ['courier', 'oldstandard'],
  ticker: ['plexMono', 'oswald'],
  telemetry: ['jetbrains', 'spacegrotesk'],
  electric: ['courier', 'playfair'],
  'case-file': ['courier', 'oswald'],
  expedition: ['plexMono', 'bebas'],
  siege: ['crimson', 'cinzel'],
};
/** Motifs that type in the worn typewriter face (looks/fonts.ts ELITE). */
export const TYPED_MOTIFS = new Set<MotifId>(['telegraph', 'case-file']);

const FONT_KEYS = new Set<string>(['anton', 'inter', 'oswald', 'plexMono', 'cinzel', 'crimson', 'bebas', 'courier', 'exo', 'playfair', 'lora', 'oldstandard', 'fraktur', 'dmserif', 'spacegrotesk', 'archivo', 'jetbrains']);
export const isFontKey = (k: unknown): k is FontKey => FONT_KEYS.has(k as string);

type TopicLike = { motif?: string; headline?: string; body?: string } | null | undefined;

/** Faces a script's topic needs (fonts.ts adds them to what it fetches). */
export function topicFontKeys(script: { topic?: TopicLike } | null | undefined): FontKey[] {
  const t = script?.topic;
  if (!t || typeof t !== 'object') return [];
  const out = new Set<FontKey>(MOTIF_FACES[t.motif as MotifId] ?? []);
  if (isFontKey(t.headline)) out.add(t.headline);
  if (isFontKey(t.body)) out.add(t.body);
  // Brush name tags, the UI cards' interface face, credits and readouts.
  for (const k of ['oswald', 'inter', 'plexMono'] as FontKey[]) out.add(k);
  if (t.motif === 'electric') out.add('playfair');
  return [...out];
}

/** Does the topic need the worn typewriter face? */
export const topicWantsTyped = (script: { topic?: TopicLike } | null | undefined) => !!script?.topic && TYPED_MOTIFS.has(script.topic.motif as MotifId);
