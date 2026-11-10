import { spawn } from "node:child_process";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Kodun bulunduğu yer. Paketlenmiş uygulamada bu app.asar'ın içidir → SALT OKUNUR.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Yazılabilir veri kökü. Electron paketli modda NOVA_HOME'u kullanıcı klasörüne ayarlar;
// geliştirme/tarayıcı modunda proje klasörü kullanılır.
export const HOME = process.env.NOVA_HOME || ROOT;

export const DATA_DIR = path.join(HOME, "data");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");
export const MUSIC_DIR = path.join(HOME, "music");
export const ASSETS_DIR = path.join(HOME, "assets");
export const PREVIEW_DIR = path.join(DATA_DIR, "previews");

for (const d of [DATA_DIR, JOBS_DIR, MUSIC_DIR, ASSETS_DIR, PREVIEW_DIR]) {
  fs.mkdirSync(d, { recursive: true });
}

export function newId() {
  const t = new Date();
  const stamp = t.toISOString().slice(0, 10).replaceAll("-", "");
  return `${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

export function slugify(s, max = 60) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
  return s
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (ch) => map[ch] || ch)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max) || "video";
}

export function writeJson(file, obj) {
  // Ölçüldü (2026-09-27): render sürerken bilgisayar kapanınca job.json 2445
  // baytlık SIFIR dosyası olarak kaldı — rename diske geçmiş, veri geçmemişti,
  // iş kütüphaneden kayboldu. Yeniden adlandırmadan önce veriyi diske zorla.
  const tmp = file + ".tmp";
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, JSON.stringify(obj, null, 2), null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  // Windows: hedefi silme izni vermeden açık tutan bir okuyucu (virüs tarayıcı, dizin oluşturucu, dışarıdan bir
  // betik) varken rename EPERM/EACCES/EBUSY verir. 25 Ekim 2026'da tek bir düşen rename işi 48 dk dondurdu
  // (20261024-373aaf): kısa aralıklarla yeniden dene, olmazsa üstüne kopyala; ancak o da olmazsa hata ver.
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (e) {
      if (!RENAME_BUSY.has(e?.code)) throw e;
      if (i < RENAME_WAITS.length) { sleepSync(RENAME_WAITS[i]); continue; }
      fs.copyFileSync(tmp, file);
      try { fs.unlinkSync(tmp); } catch {}
      return;
    }
  }
}

const RENAME_BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);
/** ~1,6 sn toplam: bir tarayıcının dosyayı bırakması için yeter, ana süreci hissedilir biçimde bekletmez. */
export const RENAME_WAITS = [25, 50, 100, 200, 400, 800];
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

// ---------- process helpers ----------

export class ProcKiller {
  constructor() {
    this.procs = new Set();
    this.cancelled = false;
    this.controllers = new Set(); // ağ isteklerini de iptal edebilmek için
  }
  add(p) { this.procs.add(p); p.on("close", () => this.procs.delete(p)); }
  /** İptalde durdurulacak bir AbortController üret (sağlayıcı fetch'leri için). */
  signal() {
    const c = new AbortController();
    if (this.cancelled) c.abort();
    else this.controllers.add(c);
    return c.signal;
  }
  cancel() {
    this.cancelled = true;
    for (const p of this.procs) {
      // Windows'ta ffmpeg kendi alt süreçlerini doğurabilir; ağacı komple kes.
      if (process.platform === "win32" && p.pid) {
        // 'error' dinleyicisi şart: asenkron bir taskkill hatası (ENOENT) yoksa uncaughtException'a düşer.
      try { spawn("taskkill", ["/pid", String(p.pid), "/T", "/F"], { windowsHide: true }).on("error", () => {}); } catch {}
      }
      try { p.kill("SIGKILL"); } catch {}
    }
    for (const c of this.controllers) { try { c.abort(); } catch {} }
    this.controllers.clear();
  }
  /** Öldürülen süreçlerin dosya tutamaklarını bırakmasını bekle (Windows'ta rmSync EBUSY verir). */
  async settled(timeoutMs = 4000) {
    const deadline = Date.now() + timeoutMs;
    while (this.procs.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 120));
  }
}

/**
 * ALT ÖNCELİKTE ÇALIŞTIR — bilgisayar render sırasında donmasın.
 *
 * Kullanıcı bildirdi: "render ederken pc kendinden geçiyor". Sebep basit —
 * render 10 paralel ffmpeg açıyor (çekirdek − 2) ve hepsi NORMAL öncelikte.
 * Windows zamanlayıcısı için kullanıcının tarayıcısıyla bu 10 süreç eşit
 * haklı, dolayısıyla fare bile takılıyor.
 *
 * Paralelliği düşürmek yanlış çözüm olurdu: makine boştayken de render
 * yavaşlar. Doğrusu ÖNCELİĞİ düşürmek — boştayken tüm çekirdekler yine
 * kullanılır, kullanıcı bir şey yapınca işletim sistemi ona yol verir.
 *
 * BELOW_NORMAL seçildi, LOW/IDLE değil: IDLE'da arka planda bir güncelleyici
 * çalışsa render neredeyse duruyor.
 *
 * Hata yutuluyor: bazı sistemlerde öncelik değiştirmek izin gerektiriyor ve
 * bu yüzden işin düşmesi saçma olur.
 */
function dusukOncelik(p) {
  try {
    if (p?.pid) os.setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch { /* izin yoksa normal öncelikte devam */ }
}

export function run(cmd, args, { cwd, onLine, killer, timeoutMs = 30 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    if (killer?.cancelled) return reject(new Error("cancelled"));
    const p = spawn(cmd, args, { cwd, windowsHide: true });
    dusukOncelik(p);
    killer?.add(p);
    let err = "";
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {}; reject(new Error(`${cmd} zaman aşımı`)); }, timeoutMs);
    // Dinleyiciden hata kaçarsa ana süreci düşürür (25 Ekim 2026 donması): onLine korunuyor.
    const line = (s) => { try { onLine?.(s); } catch (e) { console.warn("onLine hatası:", e?.message || e); } };
    p.stdout.on("data", (d) => line(d.toString()));
    p.stderr.on("data", (d) => { const s = d.toString(); err += s; if (err.length > 40000) err = err.slice(-20000); line(s); });
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (killer?.cancelled) return reject(new Error("cancelled"));
      if (code === 0) resolve();
      else reject(new Error(`${cmd} çıkış kodu ${code}: ...${err.slice(-1200)}`));
    });
  });
}

/**
 * Dosyanın süresi (sn); ölçülemezse 0.
 *
 * Zamanlayıcısı yoktu (25 Ekim 2026, ana süreç donmaları denetimi): takılan bir ffprobe (yarım inmiş dosya, kilitli
 * ya da ağdaki dosya) sözü hiç çözmüyor, onu bekleyen adım sonsuza dek duruyordu. Artık timeoutMs sonunda süreç
 * öldürülür ve 0 döner — her çağıranın zaten "ölçülemedi" diye ele aldığı sonuç. spawnFn: testler sahte süreç verir.
 */
export async function ffprobeDuration(ffprobe, file, { timeoutMs = 60000, spawnFn = spawn } = {}) {
  return new Promise((resolve) => {
    const p = spawnFn(ffprobe, ["-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file], { windowsHide: true });
    let out = "";
    const timer = setTimeout(() => { try { p.kill("SIGKILL"); } catch {}; resolve(0); }, timeoutMs);
    const bitti = (v) => { clearTimeout(timer); resolve(v); };
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => bitti(parseFloat(out.trim()) || 0));
    p.on("error", () => bitti(0));
  });
}

// ---------- network helpers ----------

// Wikimedia's file server answers 429 to every request from a User-Agent without a URL/contact (measured Oct 2026:
// the old "NovaStudio/1.0 (kisisel video araci; iletisim: local)" got 429 on 100% of upload.wikimedia.org requests).
export const UA = "NovaStudio/1.16 (personal documentary video tool; +https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)";

/**
 * GEÇİCİ HATADA YENİDEN DENE.
 *
 * Ölçüldü: Wikimedia ard arda ~13 sorgudan sonra istekleri reddetmeye başlıyor.
 * Bir iş 100'den fazla arşiv sorgusu yapıyor; tek denemede pes edilince en
 * değerli kaynak işin ortasında sessizce kayboluyor ve video stok fotoğrafla
 * doluyordu. Hız sınırı GEÇİCİ — kısa bir bekleyişle isteği kabul ediyor.
 *
 * Yalnızca geçici olanlar yeniden denenir:
 *   429 (hız sınırı) · 5xx (sunucu) · ağ hatası / zaman aşımı
 * Kalıcı hatalar (400 hatalı sorgu, 401/403 geçersiz anahtar, 404) tekrar
 * denenmez — beklemek boşuna, sonuç değişmeyecek.
 */
const GECICI_HTTP = (k) => k === 408 || (k >= 500 && k < 600);
const uyku = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * SİTE BAŞINA PAYLAŞILAN SOĞUMA.
 *
 * İlk denemem yalnızca başarısız isteği tekrarlamaktı ve ÖLÇÜLDÜĞÜNDE İŞE
 * YARAMADI — hatta kötüleştirdi (30 sorguda 13 başarılı iken 10'a düştü, süre
 * 3 katına çıktı). Sebep: istekler aynı anda gidiyor, hepsi 429 yiyor, hepsi
 * aynı süre bekleyip YİNE aynı anda vuruyor. Sürüyü tekrarlatmak sunucuyu
 * daha çok zorluyor.
 *
 * Doğrusu: bir istek 429 alınca o siteye giden HERKES yavaşlar. Soğuma süresi
 * ortak bir haritada tutulur, yeni istekler başlamadan önce ona bakar. Böylece
 * hız sınırı bir kez öğrenilir, otuz kez değil.
 */
const siteSogumasi = new Map();   // host -> ne zamana kadar beklenecek (ms)

function hostOf(u) {
  try { return new URL(u).host; } catch { return "?"; }
}

async function sogumayiBekle(host) {
  const bitis = siteSogumasi.get(host) || 0;
  const kalan = bitis - Date.now();
  if (kalan > 0) await uyku(Math.min(kalan, 10000));
}

function sogumaKur(host, saniye) {
  const ms = Number.isFinite(saniye) && saniye > 0 ? Math.min(saniye * 1000, 10000) : 1500;
  // Zaten daha uzun bir soğuma varsa kısaltma.
  siteSogumasi.set(host, Math.max(siteSogumasi.get(host) || 0, Date.now() + ms));
}

/**
 * Tek deneme. Sonuç üç şekilde döner:
 *   {veri}          başarılı
 *   {kalici:hata}   tekrar denemenin anlamı yok (400/401/403/404)
 *   {gecici:hata}   tekrar denenebilir (429/5xx/ağ hatası)
 *
 * Bu ayrım AYRI bir fonksiyonda: aynı try/catch içinde yapıldığında kalıcı
 * hata için attığım `throw` kendi catch bloğuma düşüyor ve oradan yeniden
 * deneme yoluna giriyordu — 404 üç kez sorulup 2 saniye boşuna bekleniyordu
 * (test yakaladı).
 */
async function tekDeneme(url, headers, timeoutMs, host) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal });
    if (res.ok) return { veri: await res.json() };
    if (res.status === 429) {
      // Soğumayı KUR — o siteye giden diğer istekler de bundan faydalansın.
      sogumaKur(host, Number(res.headers.get("retry-after")));
      return { gecici: new Error("HTTP 429") };
    }
    const hata = new Error(`HTTP ${res.status}`);
    return GECICI_HTTP(res.status) ? { gecici: hata } : { kalici: hata };
  } catch (e) {
    return { gecici: e };   // ağ hatası / zaman aşımı — geçicidir
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson(url, { headers = {}, timeoutMs = 12000, deneme = 3 } = {}) {
  const host = hostOf(url);
  let sonHata;
  for (let i = 0; i < Math.max(1, deneme); i++) {
    await sogumayiBekle(host);
    const r = await tekDeneme(url, headers, timeoutMs, host);
    if (r.veri !== undefined) return r.veri;
    if (r.kalici) throw r.kalici;
    sonHata = r.gecici;
    if (i === deneme - 1) break;
    // 429'da bekleme soğumadan gelir (döngü başında); diğerlerinde artan bekleme.
    if (!/429/.test(sonHata?.message || "")) {
      await uyku(400 * Math.pow(3, i) + Math.floor(Math.random() * 250));
    }
  }
  throw sonHata || new Error("fetchJson başarısız");
}

/**
 * İçeriğin gerçekten ffmpeg'in çözebileceği bir raster görsel olup olmadığını
 * sihirli baytlardan anla. SVG/HTML hata sayfası .jpg adıyla inebiliyor ve
 * render sırasında "no decoder found for: svg" ile patlıyor.
 */
export function isRasterImage(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;                    // JPEG
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return true;                 // PNG
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return true; // WebP
  if (buf.toString("ascii", 0, 3) === "GIF") return true;                                     // GIF
  if ((buf[0] === 0x49 && buf[1] === 0x49) || (buf[0] === 0x4d && buf[1] === 0x4d)) return true; // TIFF
  return false;
}

/**
 * Dosya indirme de hız sınırına takılır (Ekim 2026, Hürmüz: upload.wikimedia.org orijinal dosyada
 * art arda 429 verdi, tek denemede fotoğraf kayboldu). Sorgulardaki gibi: 429 o siteye ortak
 * soğuma kurar, 5xx/ağ hatası artan beklemeyle tekrar denenir; 404/403 hemen düşer.
 */
export async function downloadFile(url, dest, { headers = {}, timeoutMs = 60000, maxBytes = 300 * 1024 * 1024, expect, deneme = 4 } = {}) {
  const host = hostOf(url);
  for (let i = 0; ; i++) {
    await sogumayiBekle(host);
    try {
      return await downloadOnce(url, dest, { headers, timeoutMs, maxBytes, expect, host });
    } catch (e) {
      const gecici = e.gecici || e.name === "AbortError" || e.name === "TypeError";
      if (!gecici || i >= deneme - 1) throw e;
      if (!/429/.test(e.message)) await uyku(800 * Math.pow(2, i) + Math.floor(Math.random() * 300));
    }
  }
}

async function downloadOnce(url, dest, { headers, timeoutMs, maxBytes, expect, host }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal, redirect: "follow" });
    if (res.status === 429) {
      // Retry-After yoksa 5 sn: 1,5 sn'lik varsayılan Wikimedia'nın dosya sunucusunda yetmedi.
      sogumaKur(host, Number(res.headers.get("retry-after")) || 5);
      throw Object.assign(new Error("HTTP 429"), { gecici: true });
    }
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { gecici: GECICI_HTTP(res.status) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error("dosya çok büyük");
    if (buf.length < 1000) throw new Error("dosya çok küçük/bozuk");
    if (expect === "image" && !isRasterImage(buf)) {
      throw new Error("raster görsel değil (SVG/HTML olabilir)");
    }
    fs.writeFileSync(dest, buf);
    return buf.length;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Uzak videodan SADECE gereken kısa parçayı çeker (HTTP range ile).
 * Tüm dosyayı indirmek yerine ffmpeg'e seek ettirir — 4K/uzun arşiv videoları
 * için indirmeyi saniyelere düşürür ve belleği şişirmez.
 */
export async function fetchVideoClip(ffmpeg, url, dest, { seconds = 10, sourceDuration = 0, timeoutMs = 75000, killer } = {}) {
  // Jenerik/siyah açılışı atla: süresi biliniyorsa %12'sinden başla
  const start = sourceDuration > 25 ? Math.min(sourceDuration * 0.12, 30) : 0;
  const attempt = async (ss) => {
    const args = [];
    if (ss > 0) args.push("-ss", ss.toFixed(1));
    if (/^https?:\/\//i.test(url)) args.push('-user_agent', 'NovaStudio/1.0');
    args.push(
      "-i", url,
      "-t", String(seconds),
      "-an", "-sn",
      "-vf", "scale='min(1920,iw)':-2",
      // Sabit ve düşük tavan: bu indirme paralel çağrılıyor ve kodlamalar
      // sınırsız iş parçacığı açınca bellek tükeniyor (bkz. config.js
      // encThreads). Burada config.js'ten encThreads alınamıyor — config.js
      // zaten util.js'ten ithal ediyor, dairesel olurdu. ultrafast zaten
      // hafif olduğu için 2 iş parçacığı hız kaybettirmiyor.
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-threads", "2",
      "-y", dest
    );
    await run(ffmpeg, args, { timeoutMs, killer });
  };
  try {
    await attempt(start);
  } catch (e) {
    if (start === 0) throw e;
    await attempt(0); // seek başarısızsa baştan dene
  }
  return fs.statSync(dest).size;
}

/** Boş disk alanı (MB). Render öncesi kontrol için — disk dolarsa ffmpeg anlaşılmaz hata verir. */
export function freeDiskMb(dir = DATA_DIR) {
  try {
    const s = fs.statfsSync(dir);
    return Math.floor((s.bavail * s.bsize) / 1048576);
  } catch {
    return Infinity; // ölçemiyorsak engelleme
  }
}

export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { results[idx] = { ok: true, value: await fn(items[idx], idx) }; }
      catch (e) { results[idx] = { ok: false, error: e }; }
    }
  });
  await Promise.all(workers);
  return results;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
