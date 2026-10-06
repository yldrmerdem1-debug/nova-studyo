// COMMONS KATALOĞU — senaristin seçebileceği GERÇEK arşiv dosyaları.
//
// Yom Kippur videosu (Ekim 2026, kullanıcı: "mükemmel olmuş") böyle yapıldı: önce konunun Wikimedia
// Commons arşivi tarandı (kişiler, yerler, operasyonlar), yüksek çözünürlüklü ve lisansı uygun dosyalar
// listelendi, her sahneye o listeden TAM dosya seçildi — 53 gerçek fotoğraf, 0 AI. Seçici (ücretli görme
// modeli) sahne sahne arama yapınca bulamadığı kareyi AI'a bırakıyor ya da düşük çözünürlüklü bir
// taramayı seçiyordu; senarist ise dosya adını uyduramaz, bilmediğini yazamaz.
//
// Bu modül o taramayı yapar (ücretsiz Commons API, model yok): araştırmadaki özel isimlerden sorgular,
// her sorgu için lisansı kontrol edilmiş, en az ~900 px yüksekliğinde görseller; bölüm bölüm en ilgili
// olanlar senariste verilir, senarist `commons: "File:..."` alanına yalnızca bu listeden yazar
// (docu-archive.js commonsFile dosyayı aramasız alır).
import fs from "node:fs";
import path from "node:path";
import { fetchJson } from "../util.js";
import { commonsMetadata } from "./provenance.js";

export const CATALOG_VERSION = 1;
const MIN_H = 900;

const clean = (s, max = 140) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Cümle başı ve sıradan büyük harfli sözcükler özel isim sayılmaz.
const STOP = new Set(("The A An And But Or Of In On At To For From With By As It Its This That These Those He She They We You I " +
  "His Her Their Our When While After Before Then There Here What Who Why How Which Where During Since Until Into Over Under " +
  "Bu Şu O Ve Ama Ile İle Bir Da De Ne Neden Nasıl Sonra Önce Ancak Fakat Çünkü Eğer Her Hiç Daha En Çok Gibi Kadar " +
  "January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday " +
  "Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık").split(/\s+/));

/**
 * Konunun Commons sorguları: konu + araştırmada en az iki kez geçen özel isim öbekleri (1-4 büyük harfli
 * sözcük: "Golan Heights", "Bar Lev Line", "Anwar Sadat"), sıklığa göre. En çok `max` sorgu.
 */
export function catalogQueries({ topic = "", title = "", research = "", max = 14 } = {}) {
  const counts = new Map();
  const text = String(research || "");
  for (const m of text.matchAll(/\b(?:[A-ZÇĞİÖŞÜ][\p{L}'’-]+|[A-Z]{2,})(?:\s+(?:of|the|de|al|el|bin|von|van)?\s*(?:[A-ZÇĞİÖŞÜ][\p{L}'’-]+|\d{4}))*/gu)) {
    const words = m[0].split(/\s+/).filter(Boolean);
    // "On the Golan Heights" → "Golan Heights": baştaki büyük harfli sıradan sözcük ve küçük harfli bağlaç atılır.
    while (words.length && (STOP.has(words[0]) || /^[a-zçğıöşü]/.test(words[0]))) words.shift();
    if (!words.length) continue;
    const phrase = words.slice(0, 4).join(" ").replace(/[’']s$/, "");
    if (phrase.length < 4 || (words.length === 1 && STOP.has(phrase))) continue;
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  const ranked = [...counts.entries()]
    .filter(([p, n]) => n >= 2 && !/^\d+$/.test(p))
    // Çok sözcüklü isimler (yer, operasyon, tam ad) tek sözcükten önce: daha isabetli arama.
    .sort((a, b) => b[1] * (1 + 0.6 * (b[0].split(" ").length - 1)) - a[1] * (1 + 0.6 * (a[0].split(" ").length - 1)));
  const out = [];
  const seen = new Set();
  const push = (q) => {
    const k = clean(q, 80).toLowerCase();
    if (!k || seen.has(k)) return;
    // "Golan" zaten "Golan Heights" içindeyse ikinci kez sorulmaz.
    if ([...seen].some((s) => s.includes(k) || k.includes(s))) return;
    seen.add(k);
    out.push(clean(q, 80));
  };
  push(topic);
  if (title && title !== topic) push(title);
  for (const [p] of ranked) {
    if (out.length >= max) break;
    push(p);
  }
  return out.slice(0, max);
}

/** Bir Commons arama sonucu sayfasını katalog girdisine çevirir; kullanılamazsa null. */
export function catalogEntry(page, q, { minHeight = MIN_H } = {}) {
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  if (!/^image\/(jpeg|png|webp|tiff)/i.test(ii.mime || "")) return null;
  if ((ii.height || 0) < minHeight || (ii.width || 0) < minHeight) return null;
  const meta = commonsMetadata(ii, page.title);
  if (!meta.permissionVerified) return null;
  const em = ii.extmetadata || {};
  const date = clean(em.DateTimeOriginal?.value, 40).match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[1] || "";
  return {
    file: String(page.title).replace(/^Image:/i, "File:"),
    w: ii.width,
    h: ii.height,
    date,
    desc: clean(em.ImageDescription?.value, 160),
    license: meta.lisans,
    q,
  };
}

/**
 * Konunun katalogu: her sorgu için Commons araması (en çok 20 sonuç), kullanılabilir olanlar, tekrarsız.
 * Ağ hatası işi durdurmaz: o sorgu boş kalır.
 */
export async function buildCommonsCatalog({ queries, fetchJsonFn = fetchJson, perQuery = 20, max = 160, minHeight = MIN_H, logFn = () => {}, isCancelled = () => false } = {}) {
  const out = [];
  const seen = new Set();
  for (const q of queries || []) {
    if (isCancelled()) throw new Error("cancelled");
    if (out.length >= max) break;
    const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
      `&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=${perQuery}` +
      "&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json&origin=*";
    let data = null;
    try {
      data = await fetchJsonFn(url, { timeoutMs: 20000, deneme: 3 });
    } catch (e) {
      logFn(`Commons katalogu: "${q}" aranamadı (${String(e?.message || e).slice(0, 60)})`);
      continue;
    }
    const pages = Object.values(data?.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    for (const p of pages) {
      const e = catalogEntry(p, q, { minHeight });
      if (!e) continue;
      const k = e.file.toLowerCase().replace(/_/g, " ");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      if (out.length >= max) break;
    }
  }
  return out;
}

const toks = (s) => new Set(String(s ?? "").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

/** Bölümün konusuna (başlık, hedef, olgular) en yakın girdiler; eşleşme yoksa sorgu sırası korunur. */
export function catalogForChapter(catalog, ch = {}, { limit = 40 } = {}) {
  const want = toks([ch.title, ch.goal, ...(ch.covers || [])].join(" "));
  const scored = (catalog || []).map((e, i) => {
    const have = toks(`${e.file} ${e.desc} ${e.q}`);
    let n = 0;
    for (const w of have) if (want.has(w)) n++;
    return { e, n, i };
  });
  return scored.sort((a, b) => b.n - a.n || a.i - b.i).slice(0, limit).map((x) => x.e);
}

/** Senarist için satırlar: dosya adı, boyut, yıl, kısa açıklama. */
export function catalogLines(entries) {
  return (entries || []).map((e) => `- ${e.file} (${e.w}x${e.h}${e.date ? `, ${e.date}` : ""})${e.desc ? ` — ${e.desc}` : ""}`).join("\n");
}

/** Bölüm isteminin katalog bölümü; katalog boşsa boş. */
export function catalogPromptBlock(catalog, ch, opts) {
  const list = catalogForChapter(catalog, ch, opts);
  if (!list.length) return "";
  return [
    "COMMONS KATALOĞU — bu konunun Wikimedia Commons'ta GERÇEKTEN var olan, lisansı uygun, yüksek çözünürlüklü dosyaları:",
    catalogLines(list),
    "Bir archive sahnesini TAM gösteren dosya buradaysa commons alanına dosya adını AYNEN yaz (\"File:...\"); search yine dolu kalsın. Listede yoksa commons yazma, uydurma. Aynı dosyayı iki sahneye yazma (yalnızca videonun açılış karesine son sahnede dönmek serbest). Kişi adı kartı (name) taşıyan sahnede o kişinin portresini seç.",
    // Ekim 2026: elle yapılan Irkutsk videosunda güneşli turist fotoğrafları karanlık hikâyenin tonunu öldürdü; kanal sahibi Nova'nın eski atmosferik kurgusunu tercih etti.
    "Katalog KANIT içindir: hikâyenin kişileri, belgeleri, olayın kendisi, olayın geçtiği yerin tanıklığı. Atmosfer/ruh satırları (gerilim, bekleyiş, karanlık) katalogdan doldurulmaz: onlara hikâyenin tonunda imagePrompt yaz (motor üretir, hareket verir). Karanlık bir hikâyede parlak kartpostal/turist manzarası ASLA.",
  ].join("\n");
}

/** İşin klasöründe saklanan katalog (aynı sorgularla yeniden taranmaz). */
export async function commonsCatalogFor({ dir = null, queries, logFn = () => {}, ...rest }) {
  const key = JSON.stringify({ v: CATALOG_VERSION, queries });
  const file = dir ? path.join(dir, "commons-catalog.json") : null;
  if (file && fs.existsSync(file)) {
    try {
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      if (saved?.key === key && Array.isArray(saved.entries)) return saved.entries;
    } catch {}
  }
  const entries = await buildCommonsCatalog({ queries, logFn, ...rest });
  if (file && entries.length) fs.writeFileSync(file, JSON.stringify({ key, entries }, null, 1));
  return entries;
}
