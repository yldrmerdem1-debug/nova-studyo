// YouTube thumbnail stills (1280x720) from the `thumbnail` composition
// (src/thumbnail). Nova's packaging step (src/pipeline/docu-package.js) plans
// them; this only draws: one browser, one still at a time (concurrency 1).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, linkSync, copyFileSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBundle } from './produce.mjs';

const ENGINE_FONTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');

export const THUMB_COMPOSITION = 'thumbnail';

/**
 * @param {object} o
 * @param {{props: object, out: string, composition?: string, frame?: number}[]} o.items   one still per item (props: {thumb, brand, script});
 *   `composition: 'video'` + `frame` draws a frame of the edit itself (the pipeline's design gate)
 * @param {Record<string,string>} o.assets           public path -> source file (the pictures the specs name)
 * @param {string} o.workDir                         scratch folder (the site is built here and removed)
 * @param {string} [o.bundleDir]                     a prebuilt bundle; default: the engine's (rebuilt if src/ changed)
 * @param {(m:string)=>void} [o.log]
 * @param {number} [o.jpegQuality]
 * @returns {Promise<{files:string[], failed:{out:string,error:string}[]}>}
 */
export async function renderThumbnails({ items, assets = {}, workDir, bundleDir, log = () => {}, jpegQuality = 92, cancelled = () => false }) {
  const bundle = bundleDir ?? (await ensureBundle(log));
  const site = join(workDir, 'thumb-site');
  rmSync(site, { recursive: true, force: true });
  mkdirSync(join(site, 'public'), { recursive: true });
  for (const f of readdirSync(bundle)) {
    if (f === 'public' || f.startsWith('.')) continue;
    cpSync(join(bundle, f), join(site, f), { recursive: true });
  }
  // The engine's vendored fonts (src/localFonts.ts): type never comes from the network.
  if (existsSync(ENGINE_FONTS)) {
    mkdirSync(join(site, 'public', 'fonts'), { recursive: true });
    for (const f of readdirSync(ENGINE_FONTS).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f))) {
      const src = join(ENGINE_FONTS, f);
      const dest = join(site, 'public', 'fonts', f);
      try {
        linkSync(src, dest);
      } catch {
        copyFileSync(src, dest);
      }
    }
  }
  // Only the few pictures the stills use: hard links where possible (same volume), else copies.
  for (const [rel, src] of Object.entries(assets)) {
    const dest = join(site, 'public', rel);
    mkdirSync(dirname(dest), { recursive: true });
    try {
      linkSync(src, dest);
    } catch {
      copyFileSync(src, dest);
    }
  }
  const { openBrowser, selectComposition, renderStill, ensureBrowser } = await import('@remotion/renderer');
  await ensureBrowser({ onBrowserDownload: () => {
    log('render tarayıcısı indiriliyor (ilk seferde bir kez, ~100 MB)');
    return { version: null, onProgress: () => {} };
  } });
  const chromiumOptions = { gl: process.env.DOCU_GL === 'software' ? null : 'angle' };
  const browser = await openBrowser('chrome', { chromiumOptions, logLevel: 'error' });
  const files = [];
  const failed = [];
  try {
    for (const it of items) {
      if (cancelled()) throw Object.assign(new Error('iptal edildi'), { cancelled: true });
      try {
        mkdirSync(dirname(it.out), { recursive: true });
        const composition = await selectComposition({ serveUrl: site, id: it.composition ?? THUMB_COMPOSITION, inputProps: it.props, puppeteerInstance: browser, logLevel: 'error', chromiumOptions });
        const tmp = join(dirname(it.out), `.${basename(it.out)}.tmp.jpg`);
        await renderStill({
          composition, serveUrl: site, output: tmp, inputProps: it.props, imageFormat: 'jpeg', jpegQuality, frame: it.frame ?? 0,
          puppeteerInstance: browser, overwrite: true, logLevel: 'error', chromiumOptions, timeoutInMilliseconds: 90_000,
        });
        if (!existsSync(tmp) || statSync(tmp).size < 1000) throw new Error('boş kare');
        rmSync(it.out, { force: true });
        // rename, not copy: a reader never sees a half-written jpg
        renameSync(tmp, it.out);
        files.push(it.out);
        log(`kapak çizildi: ${basename(it.out)}`);
      } catch (e) {
        if (e?.cancelled) throw e;
        failed.push({ out: it.out, error: String(e?.message ?? e).slice(0, 300) });
        log(`kapak çizilemedi (${basename(it.out)}): ${String(e?.message ?? e).slice(0, 200)}`);
      }
    }
  } finally {
    try {
      await browser.close({ silent: true });
    } catch {}
    try {
      rmSync(site, { recursive: true, force: true });
    } catch {}
  }
  return { files, failed };
}
