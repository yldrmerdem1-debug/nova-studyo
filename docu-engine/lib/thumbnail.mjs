// YouTube thumbnail stills (1280x720) from the `thumbnail` composition
// (src/thumbnail). Nova's packaging step (src/pipeline/docu-package.js) plans
// them; this only draws: one browser, one still at a time (concurrency 1).
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, linkSync, copyFileSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBundle } from './produce.mjs';

const ENGINE_FONTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts');

export const THUMB_COMPOSITION = 'thumbnail';

// Remotion's openBrowser() gives Chrome a fixed 25 s to print its DevTools line. Under Nova's thermal guard
// (8 of 12 threads, BelowNormal) while frames are being drawn, chrome-headless-shell can need longer: the
// submarine job's preview gate (20261024-373aaf, 25 Oct 2026) died on "Timed out after 25000 ms while trying to
// connect to the browser!" with nothing logged by Chrome. The launcher's one call into HeadlessBrowser.create is a
// static method, so the wait is raised there; the launch itself is then retried once (not the whole gate).
export const BROWSER_CONNECT_MS = 90_000;
const CONNECT_FLOOR = Symbol.for('nova.browserConnectMs');

/** Raises Chrome's connect wait in Remotion's launcher to at least `ms` (once per process; a Remotion without the hook is left alone). */
export function raiseBrowserConnectTimeout(renderer, ms = BROWSER_CONNECT_MS) {
  const HB = renderer?.RenderInternals?.HeadlessBrowser;
  if (typeof HB?.create !== 'function') return false;
  if (HB[CONNECT_FLOOR] === undefined) {
    const create = HB.create;
    // no timeout (0 or unset) = no limit in the launcher; kept as is
    HB.create = function (o = {}) {
      return create.call(this, { ...o, timeout: o.timeout ? Math.max(o.timeout, HB[CONNECT_FLOOR]) : o.timeout });
    };
  }
  HB[CONNECT_FLOOR] = Math.max(HB[CONNECT_FLOOR] ?? 0, ms);
  return true;
}

/**
 * The one browser a call draws with: connect wait raised, one quiet retry of the launch. A launch that
 * timed out leaves its Chrome behind (Remotion never got its handle), so the retry waits a moment first.
 * @param {object} renderer   the @remotion/renderer module
 */
export async function openCoverBrowser(renderer, { chromiumOptions, log = () => {}, cancelled = () => false, retryWaitMs = 5_000 } = {}) {
  raiseBrowserConnectTimeout(renderer);
  for (let attempt = 1; ; attempt++) {
    if (attempt > 1 && cancelled()) throw Object.assign(new Error('iptal edildi'), { cancelled: true });
    try {
      return await renderer.openBrowser('chrome', { chromiumOptions, logLevel: 'error' });
    } catch (e) {
      if (attempt >= 2) throw e;
      log(`kapak tarayıcısı açılamadı (${String(e?.message ?? e).slice(0, 160)}); bir kez daha deneniyor`);
      await new Promise((r) => setTimeout(r, retryWaitMs));
    }
  }
}

/**
 * @param {object} o
 * @param {{props?: object, out: string, composition?: string, frame?: number}[]} o.items   one still per item (props: {thumb, brand, script});
 *   `composition: 'video'` + `frame` draws a frame of the edit itself (the pipeline's design gate and preview)
 * @param {object} [o.props]   props shared by every item without its own (the preview: one script, a frame per scene —
 *   the script is sent and the composition chosen once, not 160 times)
 * @param {Record<string,string>} o.assets           public path -> source file (the pictures the specs name)
 * @param {string} o.workDir                         scratch folder (the site is built here and removed)
 * @param {string} [o.bundleDir]                     a prebuilt bundle; default: the engine's (rebuilt if src/ changed)
 * @param {(m:string)=>void} [o.log]
 * @param {number} [o.jpegQuality]
 * @returns {Promise<{files:string[], failed:{out:string,error:string}[]}>}
 */
export async function renderThumbnails({ items, props: shared = null, assets = {}, workDir, bundleDir, log = () => {}, jpegQuality = 92, cancelled = () => false }) {
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
  const renderer = await import('@remotion/renderer');
  const { selectComposition, renderStill, ensureBrowser } = renderer;
  await ensureBrowser({ onBrowserDownload: () => {
    log('render tarayıcısı indiriliyor (ilk seferde bir kez, ~100 MB)');
    return { version: null, onProgress: () => {} };
  } });
  const chromiumOptions = { gl: process.env.DOCU_GL === 'software' ? null : 'angle' };
  const browser = await openCoverBrowser(renderer, { chromiumOptions, log, cancelled });
  const files = [];
  const failed = [];
  const chosen = new Map(); // composition id -> selected composition, for items on the shared props
  try {
    for (const it of items) {
      if (cancelled()) throw Object.assign(new Error('iptal edildi'), { cancelled: true });
      try {
        mkdirSync(dirname(it.out), { recursive: true });
        const inputProps = it.props ?? shared;
        const id = it.composition ?? THUMB_COMPOSITION;
        const composition = (!it.props && chosen.get(id)) || (await selectComposition({ serveUrl: site, id, inputProps, puppeteerInstance: browser, logLevel: 'error', chromiumOptions }));
        if (!it.props) chosen.set(id, composition);
        const tmp = join(dirname(it.out), `.${basename(it.out)}.tmp.jpg`);
        await renderStill({
          composition, serveUrl: site, output: tmp, inputProps, imageFormat: 'jpeg', jpegQuality, frame: it.frame ?? 0,
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
