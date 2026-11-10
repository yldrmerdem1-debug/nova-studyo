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
import { commonsKey, commonsMetadata } from "./provenance.js";

export const CATALOG_VERSION = 3;
const MIN_H = 900;
/*
 * GIMLI GLIDER (28 Oct 2026): every photo of the event itself is a small 1980s scan — the jet nose-down at Gimli
 * (728x505, 1983), the FAA's (612x501), C-GAUN in March 1983 (1008x664), in January 1985 (1024x641). The 900-px rule
 * dropped them all, the writer only knew a 1984 Toronto photo and put it on four scenes. A photo dated before this
 * year is an archive scan: it counts from OLD_MIN px (the engine frames a small scan, it does not blow it up).
 */
export const OLD_BEFORE = 2000;
export const OLD_MIN = 480;
/**
 * HASTINGS (Ekim 2026): the catalog held 64000x1464 Tapestry panoramas and 16000-px strips — thumbed to 2560 px
 * they are a 600-px sliver in a 16:9 frame. A picture longer than this (either way) is not a documentary still.
 */
export const ASPECT_MAX = 3.2;
/** A numbered series of one work: "Bayeux Tapestry Scene 23", "Stothard Plate 8", "folio 12r", "panel 4". */
export const SERIES = /\b(scene|plate|folio|panel|sheet|leaf)\s*0*\d+/i;

const clean = (s, max = 140) => String(s ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Cümle başı ve sıradan büyük harfli sözcükler özel isim sayılmaz.
const STOP = new Set(("The A An And But Or Of In On At To For From With By As It Its This That These Those He She They We You I " +
  "His Her Their Our When While After Before Then There Here What Who Why How Which Where During Since Until Into Over Under " +
  "Bu Şu O Ve Ama Ile İle Bir Da De Ne Neden Nasıl Sonra Önce Ancak Fakat Çünkü Eğer Her Hiç Daha En Çok Gibi Kadar " +
  "January February March April May June July August September October November December Monday Tuesday Wednesday Thursday Friday Saturday Sunday " +
  "Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık " +
  // Macar Devrimi (Ekim 2026): araştırma dosyası Türkçe yazılınca sorgular "DOĞRULANMAMIŞ", "Bölüm", "Sovyet", "Macar",
  // "Radyo", "Eki 1956" oldu — Commons'ta hiçbiri bir şey bulmaz. Araştırma dilinin sıradan sözcükleri sorgu değildir.
  "Oca Şub Mar Nis Haz Tem Ağu Eyl Eki Kas Ara Bölüm Kaynak Kaynaklar Not Notlar Doğrulama Özet Sonuç Giriş Ek Tablo " +
  "Sovyet Macar Türk Alman Fransız İngiliz Rus Amerikan Polonya Radyo Hükümet Devrim Savaş Ordu Parti Başbakan " +
  "Significant Important Note Notes Source Sources Summary Overview Wikipedia Wikimedia Commons Britannica Reuters " +
  // Denizaltı (24 Ekim 2026): Türkçe araştırma tablosunun sözcükleri sorgu oldu ("Fransa", "Resmî", "Aynı", "Başka",
  // "Olgu", "Durum", "Basın"); Commons'ta Çek banknotları ve Colmar sokakları getirdiler.
  "Aynı Başka Olgu Olgular Durum Basın Resmî Resmi Teyit Tutarsızlık Fransa İngiltere Almanya Rusya Amerika İtalya İspanya " +
  "Polis Yangın Bina Savcılık Tarih Ekip Siyasi Sosyal Bunu Hiçbir Hasar Almanca İngilizce Türkçe").split(/\s+/));
/** A Turkish suffix after an apostrophe ("Nagy'ın", "Budapeşte'de") is not part of the name. */
const nameWord = (w) => String(w).replace(/['’][a-zçğıöşü]+$/i, "");
/** An all-caps research flag ("DOĞRULANMAMIŞ") is not a name; short acronyms (NATO, USGS, DVIDS) are kept. */
const flagWord = (w) => w.length > 5 && w === w.toLocaleUpperCase("tr") && /[A-ZÇĞİÖŞÜ]{6,}/.test(w);

/** Metindeki özel isim öbekleri (1-4 büyük harfli sözcük: "Golan Heights", "Bar Lev Line") → kaç kez geçtiği. */
function namePhrases(text) {
  const counts = new Map();
  for (const m of String(text || "").matchAll(/\b(?:[A-ZÇĞİÖŞÜ][\p{L}'’-]+|[A-Z]{2,})(?:\s+(?:of|the|de|al|el|bin|von|van)?\s*(?:[A-ZÇĞİÖŞÜ][\p{L}'’-]+|\d{4}))*/gu)) {
    const words = m[0].split(/\s+/).filter(Boolean).map(nameWord).filter((w) => w && !flagWord(w));
    // "On the Golan Heights" → "Golan Heights": baştaki büyük harfli sıradan sözcük ve küçük harfli bağlaç atılır.
    while (words.length && (STOP.has(words[0]) || /^[a-zçğıöşü]/.test(words[0]))) words.shift();
    while (words.length > 1 && STOP.has(words[words.length - 1])) words.pop();
    if (!words.length) continue;
    const phrase = words.slice(0, 4).join(" ").replace(/[’']s$/, "");
    if (phrase.length < 4 || (words.length === 1 && STOP.has(phrase))) continue;
    counts.set(phrase, (counts.get(phrase) || 0) + 1);
  }
  return counts;
}
/**
 * Araştırmanın kaynak gösterimi isim sayılmaz: tablonun "Kaynak" sütunu, markdown bağlantısı, "Bellona: https://…"
 * etiketi, çıplak adres. Denizaltı (24 Ekim 2026): 14 sorgunun beşi kaynak adıydı ("National Interest", "Telegraph",
 * "Hansard", "Bellona", "Wikinews") — olgu tablosunun kaynak sütunundan sayılmışlardı. Etiket adresin hemen önündeki
 * en çok dört sözcüktür, parantezi geçmez: "HMS Vanguard returned to Faslane (Hansard: https://…)" satırının ismi kalır.
 * Çıkarılan kaynak gösterimleri `kaynak` dizisine yazılır (kaynak adları sonra sorulur).
 */
const KAYNAK_SUTUNU = /^\s*(kaynak|kaynaklar|source|sources)\s*$/i;
function kaynaksiz(t, kaynak = []) {
  let tablo = false;
  let sutun = -1;
  const ayir = (m) => { kaynak.push(m); return " "; };
  const satirlar = String(t || "").split("\n").map((l) => {
    if (!/^\s*\|/.test(l)) { tablo = false; return l; }
    const h = l.split("|");
    if (!tablo) { tablo = true; sutun = h.findIndex((c) => KAYNAK_SUTUNU.test(c)); return l; }
    if (sutun > 0 && h.length > sutun) h[sutun] = ayir(h[sutun]);
    return h.join("|");
  });
  return satirlar.join("\n")
    .replace(/\[[^\]\n]*\]\(\s*https?:\/\/[^)\s]*\)/g, ayir)
    .replace(/(?:[^\s|;:()[\]]+[ \t]+){0,3}[^\s|;:()[\]]+:\s*https?:\/\/\S+/g, ayir)
    .replace(/https?:\/\/\S+/g, " ");
}
/** Bundan uzun konu/başlık bir cümledir, Commons sorgusu değil (aramada 0 dosya). */
const SORGU_SOZCUK = 5;

/**
 * Konunun Commons sorguları: araştırmada en az iki kez geçen özel isim öbekleri (1-4 büyük harfli sözcük:
 * "Golan Heights", "Bar Lev Line", "Anwar Sadat"), sıklığa göre; konunun/başlığın andığı isimler önce. Kısa konu
 * ("Yom Kippur War") kendisi de ilk sorgudur. En çok `max` sorgu.
 *
 * DENİZALTI (24 Ekim 2026, 20261024-373aaf): konu ve başlık cümleleri (80 karakter) ilk iki sorguydu ve tekrar
 * anahtarıydı — içlerindeki her isim ("HMS Vanguard", "Triomphant") "zaten soruldu" diye atıldı, cümlelerin kendisi
 * Commons'ta 0 dosya buldu. Katalogun 130 dosyasının yalnızca 13'ü konuydu, senarist 1 dosyayı adıyla seçti, 56 AI görseli.
 */
export function catalogQueries({ topic = "", title = "", research = "", max = 14 } = {}) {
  const kisa = (q) => q && clean(q).split(/\s+/).length <= SORGU_SOZCUK && !/[:?!]/.test(q);
  // Araştırmanın başlığa yazdığı konu cümlesi isim sayılmaz ("Is AI a Bubble? The Money, Debt and Profits…" iki kez
  // geçince "Profits Behind the Boom", "Is AI", "Money" konu ismi oluyordu).
  const kaynak = [];
  let govde = kaynaksiz(research, kaynak);
  for (const t of [topic, title]) if (t && !kisa(t)) govde = govde.split(t).join(" ");
  const counts = namePhrases(govde);
  // Araştırmanın küçük harfle de sık yazdığı tek sözcük isim değil, cümle başıdır ("Fire broke out… the fire spread"):
  // konu cümlesi artık tekrar anahtarı olmadığından başlığın "Fire"ı, "Accident"ı ilk sorgulara ve kategori taramasına
  // çıkıyordu. Seyrek küçük harf ("a feat of endurance") gemi adı "Endurance"ı silmez: büyük harflinin en az yarısı kadar.
  const kucuk = new Map();
  for (const w of govde.split(/\s+/)) {
    const k = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "");
    if (/^[a-zçğıöşü]/.test(k)) kucuk.set(k, (kucuk.get(k) || 0) + 1);
  }
  const ranked = [...counts.entries()]
    .filter(([p, n]) => n >= 2 && !/^\d+$/.test(p) && (p.includes(" ") || (kucuk.get(p.toLowerCase()) || 0) * 2 < n))
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
  if (kisa(topic)) push(topic);
  if (title && title !== topic && kisa(title)) push(title);
  // Konunun ve başlığın öznesi (araştırmanın da tekrar ettiği isim) önce: kategori taraması ilk sorgulardan yapılır.
  const konu = [...namePhrases(`${topic}. ${title}`).keys()].map((p) => ` ${p.toLowerCase()} `);
  const ozne = ([p]) => konu.some((t) => t.includes(` ${p.toLowerCase()} `));
  const ozneler = ranked.filter(ozne);
  // Konunun AYNEN andığı tam ad, araştırma onu da kullanıyorsa (kısasının en az üçte biri kadar) kısasının yerine:
  // "Vanguard" değil "HMS Vanguard" (tek başına "vanguard" aramada 18. yy gemi maketi ve Bratislava grafitisi getirdi).
  const tamAd = ([p, n]) => ozneler.find(([q, m]) => q !== p && m * 3 >= n && konu.includes(` ${q.toLowerCase()} `) && ` ${q.toLowerCase()} `.includes(` ${p.toLowerCase()} `))?.[0] || p;
  // Araştırmanın kaynak gösterdiği ad metinde de geçiyorsa ("The Telegraph reported…") atılmaz, öbür isimlerden sonra
  // sorulur: denizaltıda "Telegraph" ve "National Interest" öznelerden hemen sonra, kategori taramasının 3. ve 4. sorgusuydu.
  const kaynakAdi = new Set(namePhrases(kaynak.join("\n").replace(/https?:\/\/\S+/g, " ")).keys());
  const kaynakMi = ([p]) => kaynakAdi.has(p);
  for (const r of [...ozneler, ...ranked.filter((x) => !ozne(x) && !kaynakMi(x)), ...ranked.filter((x) => !ozne(x) && kaynakMi(x))]) {
    if (out.length >= max) break;
    push(ozne(r) ? tamAd(r) : r[0]);
  }
  return out.slice(0, max);
}

/** Bir Commons arama sonucu sayfasını katalog girdisine çevirir; kullanılamazsa null. */
export function catalogEntry(page, q, { minHeight = MIN_H } = {}) {
  const ii = page?.imageinfo?.[0];
  if (!ii) return null;
  if (!/^image\/(jpeg|png|webp|tiff)/i.test(ii.mime || "")) return null;
  const em0 = ii.extmetadata || {};
  const year = Number(clean(em0.DateTimeOriginal?.value, 40).match(/\b(1[0-9]{3}|20[0-9]{2})\b/)?.[1] || 0);
  const floor = year && year < OLD_BEFORE ? Math.min(minHeight, OLD_MIN) : minHeight;
  if ((ii.height || 0) < floor || (ii.width || 0) < floor) return null;
  const long = Math.max(ii.width, ii.height) / Math.max(1, Math.min(ii.width, ii.height));
  if (long > ASPECT_MAX) return null;
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
export async function buildCommonsCatalog({ queries, fetchJsonFn = fetchJson, perQuery = 20, max = 160, minHeight = MIN_H, seriesPerQuery = 50, seriesExtra = 60, categoryQueries = 4, perCategory = 60, categoryExtra = 80, logFn = () => {}, isCancelled = () => false } = {}) {
  const out = [];
  const seen = new Set();
  const search = async (q, limit) => {
    const url = "https://commons.wikimedia.org/w/api.php?action=query&generator=search" +
      `&gsrsearch=${encodeURIComponent(`${q} filetype:bitmap`)}&gsrnamespace=6&gsrlimit=${limit}` +
      "&prop=imageinfo&iiprop=url|size|mime|extmetadata&format=json&origin=*";
    try {
      const data = await fetchJsonFn(url, { timeoutMs: 20000, deneme: 3 });
      return Object.values(data?.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    } catch (e) {
      logFn(`Commons katalogu: "${q}" aranamadı (${String(e?.message || e).slice(0, 60)})`);
      return [];
    }
  };
  const add = (pages, q, cap) => {
    const added = [];
    for (const p of pages) {
      if (out.length >= cap) break;
      const e = catalogEntry(p, q, { minHeight });
      if (!e) continue;
      const k = commonsKey(e.file);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
      added.push(e);
    }
    return added;
  };
  const series = new Set();
  for (const q of queries || []) {
    if (isCancelled()) throw new Error("cancelled");
    if (out.length >= max) break;
    const pages = await search(q, perQuery);
    add(pages, q, max);
    // A numbered series of one work in the results (the Bayeux Tapestry's 58 scenes): the 20 first hits held
    // 15 of them, so every Tapestry scene but six fell to a picker that kept offering the same pictures.
    // The series is searched on its own, deeper — every numbered piece the writer can name exactly.
    const hits = pages.map((p) => String(p.title || "")).filter((t) => SERIES.test(t));
    const word = hits.length >= 3 ? hits.map((t) => t.match(SERIES)[1].toLowerCase()).sort((a, b) => hits.filter((t) => t.toLowerCase().includes(b)).length - hits.filter((t) => t.toLowerCase().includes(a)).length)[0] : null;
    if (word && !series.has(`${q}|${word}`)) {
      series.add(`${q}|${word}`);
      const more = add(await search(`${q} ${word}`, seriesPerQuery), q, max + seriesExtra);
      if (more.length) logFn(`Commons katalogu: "${q}" numaralı bir dizi (${word}) — ${more.length} parça daha eklendi`);
    }
  }
  /*
   * THE TOPIC'S OWN COMMONS CATEGORY (Macar Devrimi, Ekim 2026): "Hungarian Revolution of 1956" holds 1,000+ Fortepan
   * photographs of the very streets and days; keyword search returned memorials and modern Budapest, 39 scenes fell
   * to AI. The first queries' best-matching categories are searched with deepcategory (their subcategories too).
   */
  const cats = new Set();
  for (const q of (queries || []).slice(0, categoryQueries)) {
    if (isCancelled()) throw new Error("cancelled");
    let found = [];
    try {
      const url = "https://commons.wikimedia.org/w/api.php?action=query&list=search&srnamespace=14&srlimit=3" +
        `&srsearch=${encodeURIComponent(q)}&format=json&origin=*`;
      const data = await fetchJsonFn(url, { timeoutMs: 20000, deneme: 3 });
      found = (data?.query?.search || []).map((r) => String(r.title || "").replace(/^Category:/i, "")).filter(Boolean);
    } catch (e) {
      logFn(`Commons katalogu: "${q}" kategorisi aranamadı (${String(e?.message || e).slice(0, 60)})`);
    }
    // Only a category that shares the query's words (a "1956 births" category is not the revolution).
    const want = new Set(String(q).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
    const cat = found.find((c) => { const have = c.toLowerCase().split(/[^\p{L}\p{N}]+/u); return want.size > 0 && have.filter((w) => want.has(w)).length >= Math.min(2, want.size); });
    if (!cat || cats.has(cat)) continue;
    cats.add(cat);
    const more = add(await search(`deepcategory:"${cat}"`, perCategory), `Category:${cat}`, max + seriesExtra + categoryExtra);
    if (more.length) logFn(`Commons katalogu: "${cat}" kategorisinden ${more.length} dosya eklendi`);
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
    "COMMONS KATALOĞU — bu konunun Wikimedia Commons'ta GERÇEKTEN var olan, lisansı uygun dosyaları (2000 öncesi küçük taramalar olayın kendi fotoğraflarıdır: olayın anına yaz, kancaya/tam ekran başlığa değil):",
    catalogLines(list),
    "Bir archive sahnesini TAM gösteren dosya buradaysa commons alanına dosya adını AYNEN yaz (\"File:...\"); search yine dolu kalsın. Bir eserin NUMARALI parçaları listedeyse (\"Bayeux Tapestry Scene 23\", \"Plate 8\"), eseri anlatan her sahneye anlattığı anın kendi numaralı parçasını yaz — aynı eserin birkaç genel karesi bütün sahnelere dağıtılmaz. Listede yoksa commons yazma, uydurma. Aynı dosyayı iki sahneye yazma (yalnızca videonun açılış karesine son sahnede dönmek serbest). Kişi adı kartı (name) taşıyan sahnede o kişinin portresini seç.",
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
