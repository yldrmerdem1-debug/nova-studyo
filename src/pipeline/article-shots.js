// GERÇEK HABER GÖRÜNTÜSÜ (1.16.16) — tutmuş videoların kanıtı gerçek bir makalenin ekran görüntüsü, başlığı sarı
// fosforlu kalemle çizilmiş (Dollar Shave Club, Wendover, CaspianReport kare kare); bizim manşet sahnemiz motorun
// çizdiği bir taklit sayfaydı (El Niño'da sahte gazete). Araştırma dosyası zaten gerçek, tarihli kaynaklar taşıyor
// (Kızıldeniz kabloları: 53 adres; "AL JAZEERA · Iran threatens Gulf data centres · 13 October 2026" manşetinin
// makalesi aljazeera.com/news/2026/10/13/iran-threatens-gulf-data-centres-…). Manşet sahnesi o adresle eşleşirse sayfa
// görünmez bir Electron penceresinde açılır, çerez/abonelik katmanları kaldırılır, sayfanın kendi başlığı manşetle
// gerçekten örtüşüyorsa (hata/ödeme duvarı sayfası değil) sarıyla işaretlenir ve çekilir; sahne o görüntünün tam ekran
// fotoğrafı olur, altında kaynak ve tarih. Eşleşmeyen, açılmayan ya da başlığı tutmayan sayfada çizilmiş manşet kalır.
// Görüntüler işin klasöründe saklanır: yeniden çalıştırma sayfayı yeniden açmaz.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const STOP = new Set("the a an of to in on for and or but with by at from as is are was were be been it its this that these those how why what who when where new after over into than more most just about says said will can could".split(" "));
const fold = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const contentWords = (s) => [...new Set(fold(s).replace(/[^a-z0-9]+/g, " ").split(" ").filter((w) => w.length > 2 && !STOP.has(w)))];

/** Numbers the narration says, as written ("1,746", "4.5", "202"); years and single digits are left out (too common to point at one sentence). */
export function sayNumbers(say) {
  const out = [];
  for (const m of String(say || "").matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    const v = m[0];
    if (/^(1[5-9]|20)\d\d$/.test(v) || v.replace(/\D/g, "").length < 2) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 4);
}

/** Every http(s) address in the research file, in order, without trailing punctuation. */
export function researchUrls(text) {
  const out = [];
  for (const m of String(text || "").matchAll(/https?:\/\/[^\s)\]>"'<]+/g)) {
    const u = m[0].replace(/[.,;:!?]+$/, "");
    if (!out.includes(u)) out.push(u);
  }
  return out;
}

/** "www.aljazeera.com" → "aljazeera"; "edition.cnn.com" → "cnn"; "globes.co.il" → "globes". */
function hostLabel(u) {
  try {
    const parts = new URL(u).hostname.replace(/^www\./, "").split(".");
    if (parts.length < 2) return parts[0] || "";
    return parts.length > 2 && /^(co|com|org|net|gov|ac|or|ne)$/.test(parts.at(-2)) ? parts.at(-3) : parts.at(-2);
  } catch {
    return "";
  }
}

/**
 * The research address that is this headline's article, or null. The outlet must match the paper's name, the
 * address must carry at least one headline word, and a year in the address must be the scene's year.
 */
export function matchArticle(scene, urls) {
  const paper = fold(scene?.paper).replace(/^the\s+/, "").replace(/[^a-z0-9]/g, "");
  const words = contentWords(scene?.headline);
  if (!words.length) return null;
  const year = (/\b(1[89]\d\d|20\d\d)\b/.exec(String(scene?.date || "")) || [])[1];
  let best = null;
  for (const u of urls) {
    if (/wikipedia\.org|wikimedia\.org|youtube\.com|x\.com|twitter\.com|facebook\.com|\.pdf($|\?)/i.test(u)) continue;
    const label = hostLabel(u);
    const outlet = !!paper && label.length >= 3 && (paper.includes(label) || label.includes(paper));
    let slug = "";
    try { slug = fold(decodeURIComponent(new URL(u).pathname)); } catch { continue; }
    const hit = words.filter((w) => slug.includes(w)).length;
    if (!hit) continue;
    const uy = (/(?:^|\/)(19\d\d|20\d\d)(?:\/|-)/.exec(slug) || [])[1];
    if (year && uy && uy !== year) continue;
    // The outlet the narration names must be the page on screen ("Globes reported…" never shows Fortune's article).
    if (!outlet) continue;
    const score = hit * 2 + (year && uy === year ? 1 : 0);
    if (!best || score > best.score) best = { url: u, score };
  }
  return best ? best.url : null;
}

/*
 * Runs inside the page: strip consent/paywall overlays and fixed bars, find the article's own headline, check it is
 * this story, mark it yellow and scroll it near the top. Returns { ok, title, y } (y = headline top in the viewport).
 */
const PREP = (words, nums = []) => `(() => {
  const words = ${JSON.stringify(words)};
  const kill = '[id*="cookie" i],[class*="cookie" i],[id*="consent" i],[class*="consent" i],[class*="gdpr" i],[id*="onetrust" i],[class*="onetrust" i],[id*="didomi" i],[class*="paywall" i],[class*="newsletter" i],[class*="subscribe-wall" i],[aria-modal="true"],[role="dialog"],[role="alertdialog"],iframe[src*="consent" i]';
  document.querySelectorAll(kill).forEach((e) => { if (e !== document.body && !e.querySelector('h1')) e.remove(); });
  const vw = innerWidth, vh = innerHeight;
  // Fixed and sticky bars (consent banners, sticky headers, ad rails) cover the story: removed.
  document.querySelectorAll('body *').forEach((e) => {
    const cs = getComputedStyle(e);
    if ((cs.position === 'fixed' || cs.position === 'sticky') && !e.querySelector('h1')) {
      const r = e.getBoundingClientRect();
      if (r.width * r.height > vw * vh * 0.015) e.remove();
    }
  });
  for (const el of [document.documentElement, document.body]) el.style.setProperty('overflow', 'auto', 'important');
  const fold = (s) => (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const h = [...document.querySelectorAll('h1')].find((x) => x.offsetHeight > 0 && x.textContent.trim().length > 10);
  if (!h) return { ok: false, why: 'başlık yok' };
  const t = fold(h.textContent);
  const hit = words.filter((w) => t.includes(w)).length;
  if (hit < Math.min(2, words.length)) return { ok: false, why: 'başlık tutmuyor: ' + h.textContent.trim().slice(0, 80) };
  // The highlighter is a stylesheet on the element, not new markup: a page that re-renders its headline keeps it.
  h.setAttribute('data-nova-mark', '1');
  if (!document.getElementById('nova-mark')) {
    const st = document.createElement('style');
    st.id = 'nova-mark';
    st.textContent = 'h1[data-nova-mark], h1[data-nova-mark] * { background: linear-gradient(transparent 6%, #ffe14d 6%, #ffe14d 94%, transparent 94%) !important; color: #111 !important; -webkit-box-decoration-break: clone; box-decoration-break: clone; } h1[data-nova-mark] { display: inline !important; } ::highlight(nova) { background-color: #ffe14d; color: #111; } ::-webkit-scrollbar { display: none !important; }';
    document.head.appendChild(st);
  }
  // A number the narration says, found in the article's own text: that sentence is the evidence and is marked
  // instead (Kelevin "1,746 people died", Statrys' Reuters line). Range highlight: the page's markup is untouched.
  const nums = ${JSON.stringify(nums)};
  let sentence = null;
  if (nums.length && window.CSS && CSS.highlights && typeof Highlight === 'function') {
    // The headline's own article or main: another <article> on the page is a related-story card (Al Jazeera).
    const root = h.closest('article') || h.closest('main') || document.querySelector('main') || document.body;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const digit = (c) => c >= '0' && c <= '9';
    for (let n = tw.nextNode(); n && !sentence; n = tw.nextNode()) {
      const txt = n.nodeValue || '';
      const p = n.parentElement;
      if (txt.length < 40 || !p || p.closest('h1,nav,header,footer,aside,figcaption,script,style,noscript') || !p.offsetHeight) continue;
      for (const num of nums) {
        const i = txt.indexOf(num);
        if (i < 0 || digit(txt.charAt(i - 1)) || digit(txt.charAt(i + num.length))) continue;
        const dot = txt.lastIndexOf('. ', i);
        const a = dot < 0 ? 0 : dot + 2;
        const end = txt.indexOf('. ', i + num.length);
        const r = document.createRange();
        r.setStart(n, a);
        r.setEnd(n, end < 0 ? txt.length : end + 1);
        sentence = r;
        break;
      }
    }
  }
  if (sentence) {
    CSS.highlights.set('nova', new Highlight(sentence));
    window.scrollTo(0, Math.max(0, sentence.getBoundingClientRect().top + scrollY - Math.round(vh * 0.42)));
    return { ok: true, title: h.textContent.trim().slice(0, 200), y: sentence.getBoundingClientRect().top, quote: sentence.toString().trim().slice(0, 240) };
  }
  window.scrollTo(0, Math.max(0, h.getBoundingClientRect().top + scrollY - Math.round(vh * 0.2)));
  return { ok: true, title: h.textContent.trim().slice(0, 200), y: h.getBoundingClientRect().top };
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens `url` in a hidden Electron window (no stored cookies, muted, no pop-ups), prepares and captures it.
 * null outside Electron (tests, CLI) or when the page does not load or is not this story.
 */
export async function electronCapture(url, { words, nums = [], width = 1600, height = 900, timeoutMs = 30_000, settleMs = 2500, logFn = () => {} } = {}) {
  if (!process.versions.electron) return null;
  let BrowserWindow;
  try {
    ({ BrowserWindow } = (await import("electron")).default ?? (await import("electron")));
  } catch {
    return null;
  }
  if (!BrowserWindow) return null;
  const win = new BrowserWindow({ show: false, width, height, paintWhenInitiallyHidden: true, webPreferences: { partition: "nova-article", sandbox: true, javascript: true, backgroundThrottling: false } });
  try {
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const ua = win.webContents.getUserAgent().replace(/\s*(Electron|nova-studio|Nova Studyo)\/\S+/gi, "");
    await Promise.race([win.loadURL(url, { userAgent: ua }), sleep(timeoutMs).then(() => { throw new Error("zaman aşımı"); })]);
    await sleep(settleMs);
    let r = await win.webContents.executeJavaScript(PREP(words, nums), true);
    if (!r?.ok) {
      logFn(`Haber görüntüsü atlandı (${url.slice(0, 90)}): ${r?.why || "sayfa hazırlanamadı"}`);
      return null;
    }
    // Consent banners and lazy headers arrive late: cleaned and scrolled once more right before the shot.
    await sleep(1500);
    const again = await win.webContents.executeJavaScript(PREP(words, nums), true);
    if (again?.ok) r = again;
    await sleep(600);
    const img = await win.webContents.capturePage();
    if (img.isEmpty()) return null;
    const { width: w, height: h } = img.getSize();
    return { png: img.toPNG(), w, h, title: r.title, y: Math.max(0, Math.min(1, r.y / height)), ...(r.quote ? { quote: r.quote } : {}) };
  } catch (e) {
    logFn(`Haber görüntüsü atlandı (${url.slice(0, 90)}): ${String(e?.message || e).slice(0, 120)}`);
    return null;
  } finally {
    try { win.destroy(); } catch {}
  }
}

/**
 * Turns matched headline scenes into full-bleed photos of the real article. `capture(url, {words})` is injectable
 * (tests); default electronCapture. Returns the number of scenes turned. Mutates `script.scenes` and `credits`.
 */
export async function realArticleShots(script, { research = "", publicDir, jobId, dir, credits = {}, capture = electronCapture, logFn = () => {}, max = 4 } = {}) {
  const urls = researchUrls(research);
  if (!urls.length || !script?.scenes?.length) return 0;
  const cacheFile = path.join(dir, "article-shots.json");
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch {}
  const outDir = path.join(publicDir, "build", jobId);
  let turned = 0;
  for (let i = 0; i < script.scenes.length && turned < max; i++) {
    const s = script.scenes[i];
    if (s.type !== "headline") continue;
    const url = matchArticle(s, urls);
    if (!url) continue;
    const name = `article-${crypto.createHash("sha1").update(url).digest("hex").slice(0, 12)}.png`;
    const abs = path.join(outDir, name);
    let shot = cache[url] && fs.existsSync(abs) ? cache[url] : null;
    if (!shot && cache[url]?.failed) continue;
    if (!shot) {
      const got = await capture(url, { words: contentWords(s.headline), nums: sayNumbers(s.say), logFn });
      if (!got) { cache[url] = { failed: true }; continue; }
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(abs, got.png);
      shot = { w: got.w, h: got.h, y: got.y, title: got.title, ...(got.quote ? { quote: got.quote } : {}) };
      cache[url] = shot;
    }
    const { paper, headline, sub, translation, caption, date, source, search, imagePrompt, archived, imgW, imgH, focus, fit, ...base } = s;
    script.scenes[i] = {
      ...base,
      type: "photo",
      image: `build/${jobId}/${name}`,
      imgW: shot.w,
      imgH: shot.h,
      natural: true,
      fullBleed: true,
      fit: "cover",
      camera: "push-in",
      focus: [0.42, Math.min(0.6, Math.max(0.15, shot.y + 0.06))],
      caption: [String(paper || hostLabel(url)).toUpperCase(), date].filter(Boolean).join(" · "),
      article: { url, title: shot.title, ...(shot.quote ? { quote: shot.quote } : {}) },
    };
    delete credits[`scene-${i}`];
    turned++;
    logFn(`Gerçek haber görüntüsü: sahne ${i + 1} → ${url.slice(0, 100)}`);
  }
  try { fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 1)); } catch {}
  return turned;
}
