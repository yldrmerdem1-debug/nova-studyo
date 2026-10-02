import { continueRender, delayRender, staticFile } from 'remotion';
import { FONT_FILES } from './fontManifest';

/*
 * Fonts come from the engine's own public/fonts (vendored by
 * scripts/vendor-fonts.mjs, copied into every job's public dir), never from
 * Google Fonts at render time: one network hiccup used to fail a whole render
 * on "Fetching Inter font ... not cleared after 58000ms".
 *
 * Same faces, same unicode-range split per subset as @remotion/google-fonts
 * registered, under the same family names, so every CSS stack is unchanged.
 * A local file can still be missing (an old job dir, a site without fonts):
 * then the face is skipped after a short wait and the CSS stack's system
 * fallback draws the text. A font never blocks or fails a render.
 */

const LOAD_TIMEOUT_MS = 8000;
const started = new Set<string>();

function loadFace(family: string, style: string, weight: string, file: string, unicodeRange: string): void {
  const key = `${family}|${style}|${weight}|${file}`;
  if (started.has(key)) return;
  started.add(key);
  // Longer than our own timeout: the handle is always cleared by us, never by Remotion's timer.
  const handle = delayRender(`Loading local font ${family} ${style} ${weight} (${file})`, {
    timeoutInMilliseconds: LOAD_TIMEOUT_MS * 3,
    retries: 0,
  });
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    continueRender(handle);
  };
  const timer = setTimeout(() => {
    console.warn(`[fonts] ${family} ${style} ${weight}: ${file} not loaded after ${LOAD_TIMEOUT_MS}ms, using the fallback stack`);
    finish();
  }, LOAD_TIMEOUT_MS);
  try {
    const face = new FontFace(family, `url("${staticFile(`fonts/${file}`)}") format("woff2")`, {
      style,
      weight,
      unicodeRange,
    });
    face
      .load()
      .then((f) => {
        if (!done) document.fonts.add(f);
      })
      .catch((e: unknown) => {
        console.warn(`[fonts] ${family} ${style} ${weight}: ${file} failed (${String((e as Error)?.message ?? e)}), using the fallback stack`);
      })
      .finally(() => {
        clearTimeout(timer);
        finish();
      });
  } catch (e) {
    console.warn(`[fonts] ${family}: ${String((e as Error)?.message ?? e)}`);
    clearTimeout(timer);
    finish();
  }
}

/**
 * Registers a vendored family's weights/subsets (unknown ones are skipped, never
 * fetched). Returns the bare family name, like @remotion/google-fonts' loadFont.
 */
export function loadLocalFont(
  family: string,
  style: 'normal' | 'italic',
  o: { weights: readonly string[]; subsets: readonly string[] },
): { fontFamily: string } {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return { fontFamily: family };
  const byWeight = FONT_FILES[family]?.[style];
  for (const w of o.weights) {
    for (const s of o.subsets) {
      const entry = byWeight?.[w]?.[s];
      if (!entry) {
        console.warn(`[fonts] ${family} ${style} ${w} ${s} is not vendored (scripts/vendor-fonts.mjs)`);
        continue;
      }
      loadFace(family, style, w, entry[0], entry[1]);
    }
  }
  return { fontFamily: family };
}
