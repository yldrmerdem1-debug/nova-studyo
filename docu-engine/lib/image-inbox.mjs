/*
 * CHATGPT IMAGE INBOX — AI stills made outside the API, by hand in ChatGPT (the user's subscription,
 * no API credit). Oct 2026: the OpenAI API balance ran out mid-video (402) and nine stills were made
 * in ChatGPT and dropped in by hand; Nova now does the bookkeeping itself.
 *
 *   <job>/gorsel-kutusu/LISTE.txt      numbered prompts + a ready-to-paste ChatGPT message
 *   <job>/gorsel-kutusu/needed.json    { items: [{ n, file, prompt }] } — the engine's own record
 *   <job>/gorsel-kutusu/01.png …       what the user drops in (png / jpg / jpeg / webp)
 *
 * When an image is needed and the provider is "manual" (or the API answered "no balance"), the
 * engine records it and stops after the image stage with one clear message. On "continue", each
 * dropped file is converted to the still's real name and used; the rest stay on the list.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const EXT = ['png', 'jpg', 'jpeg', 'webp'];
export const pad = (n) => String(n).padStart(2, '0');

export function loadNeeds(dir) {
  try {
    const j = JSON.parse(readFileSync(join(dir, 'needed.json'), 'utf8'));
    return Array.isArray(j.items) ? j : { items: [] };
  } catch {
    return { items: [] };
  }
}

/** Record a still the engine needs (idempotent per file); returns its number. */
export function addNeed(dir, { file, prompt }) {
  mkdirSync(dir, { recursive: true });
  const needs = loadNeeds(dir);
  let item = needs.items.find((x) => x.file === file);
  if (!item) {
    item = { n: needs.items.reduce((m, x) => Math.max(m, x.n), 0) + 1, file, prompt };
    needs.items.push(item);
    writeFileSync(join(dir, 'needed.json'), JSON.stringify(needs, null, 2));
  }
  return item.n;
}

/** The dropped file for a needed still, or null. */
export function inboxFileFor(dir, file) {
  const item = loadNeeds(dir).items.find((x) => x.file === file);
  if (!item) return null;
  for (const e of EXT) {
    const f = join(dir, `${pad(item.n)}.${e}`);
    if (existsSync(f)) return f;
  }
  return null;
}

/**
 * LISTE.txt for the person at the keyboard: numbered prompts, and the request to paste into ChatGPT,
 * ONE still per message. Batches of 4 worked until October 2026 (ChatGPT made 5 of 8 asked at once). On
 * 28 Oct 2026 (Houthi–Saudi news, 24 stills) every 4-item message came back as ONE 1536x1024 picture holding
 * a 2x2 grid, landscape too, and each quarter is only 768x512. Asked one at a time, all 24 came back as
 * single pictures in about a minute each.
 */
export function writeList(dir, { batch = 1 } = {}) {
  const items = loadNeeds(dir).items.filter((x) => !inboxFileFor(dir, x.file));
  const lines = [
    `CHATGPT GÖRSEL KUTUSU — ${items.length} görsel bekleniyor`,
    `ChatGPT'de üret, bu klasöre NUMARASIYLA kaydet (01.png, 02.png …), Nova'da "Kaldığı yerden devam et".`,
    `Hepsi yatay 3:2 (1536x1024), tek kare (kolaj değil), yazısız.`,
    '',
    ...items.map((x) => `${pad(x.n)}) ${x.prompt}`),
    '',
  ];
  for (let i = 0; i < items.length; i += batch) {
    const part = items.slice(i, i + batch);
    lines.push(`--- ChatGPT mesajı ${i / batch + 1} (yapıştır) ---`);
    lines.push(part.length === 1
      ? `Create ONE single image (not several, not a collage, grid or split frame): landscape 3:2 (1536x1024), photorealistic, one continuous photograph of one scene. No text, no logos.`
      : `Create ${part.length} SEPARATE images, one image per item, each landscape 3:2 (1536x1024), photorealistic. Each must be ONE single continuous photograph of one scene — never a collage, grid, split frame or several pictures. No text, no logos.`);
    for (const x of part) lines.push(part.length === 1 ? x.prompt : `${pad(x.n)}) ${x.prompt}`);
    lines.push('');
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'LISTE.txt'), lines.join('\n'));
  return items.length;
}
