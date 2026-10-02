import { getInputProps } from 'remotion';
import { loadLocalFont } from '../localFonts';
import { scriptTextStyles } from './variants';
import { topicWantsTyped } from '../topic/fontkeys';

/*
 * Faces the text styles need beyond the engine's FontKey set (fonts.ts
 * loads those, variant faces included): the worn typewriter (typewriter,
 * cutout) and the italic cuts of the editorial serifs (serif). Loaded (public/fonts) only
 * when the script's variant palette or a scene asks for the style — or with
 * no script at all (Studio), when everything loads.
 */

const SUBSETS = ['latin', 'latin-ext'] as const;
const eliteFamily = 'Special Elite';

function wanted(): Set<string> | null {
  try {
    if (typeof window === 'undefined') return new Set();
    const s = (getInputProps() as { script?: { genre?: string; look?: { variant?: string }; scenes?: { textStyle?: string }[] } })?.script;
    if (!s || !Array.isArray(s.scenes)) return null;
    return scriptTextStyles(s);
  } catch {
    return null;
  }
}

const W = wanted();
const want = (t: string) => !W || W.has(t as never);

/** A topic motif that types (telegraph forms, case files) needs the typewriter face too. */
const TYPED = (() => {
  try {
    if (typeof window === 'undefined') return false;
    return topicWantsTyped((getInputProps() as { script?: never })?.script);
  } catch {
    return false;
  }
})();

if (want('typewriter') || want('cutout') || TYPED) loadLocalFont(eliteFamily, 'normal', { weights: ['400'], subsets: [...SUBSETS] });
if (want('serif')) {
  loadLocalFont('DM Serif Display', 'italic', { weights: ['400'], subsets: [...SUBSETS] });
  loadLocalFont('Playfair Display', 'italic', { weights: ['500', '700'], subsets: [...SUBSETS] });
}

/** The worn typewriter face. */
export const ELITE = `${eliteFamily}, 'Courier New', monospace`;
