import { safeSourceUrl, permissionUsable } from "./provenance.js";
import path from "node:path";
// GÖRSEL KÜNYESİ — videoda kullanılan eserlerin atıf listesi.
//
// NEDEN VAR:
// Wikimedia Commons ve Openverse'ten gelen görsellerin çoğu CC-BY / CC-BY-SA
// lisanslı: kullanmak serbest, ticari kullanım dahil — AMA eser sahibinin adı
// ve lisans yazılmak ZORUNDA. Uygulama bu bilgiyi hiç kaydetmiyordu, dolayısıyla
// yayınlanan her video atıfsız CC-BY görsel taşıyor olabiliyordu. Kendi kanalın
// için telif şikâyeti riski; aracı başkasına satarsan doğrudan sorumluluk.
//
// Künye EKRANA basılmaz — YouTube açıklamasına girer. Ekrana kart koymak
// izlenme süresini düşürür ve atıf için açıklama zaten yeterli sayılıyor.

// LİSANS SINIFLAMASI.
//
// Sağlayıcılar aynı lisansı farklı yazıyor: Wikimedia "CC BY 2.0" derken
// Openverse yalnızca "BY 2.0" döndürüyor (kod alanı "by"). Önce "CC" arayan
// bir desen Openverse'ün CC-BY eserlerini kaçırıyor ve onları atıfsız toplu
// satıra düşürüyordu — yani kapatmaya çalıştığım açığın ta kendisi.
// Bu yüzden ÖNCE kamu malı elenir, kalanda çıplak "BY" de atıf sayılır.

/** Atıf GEREKTİRMEYEN: kamu malı ve eşdeğerleri. */
const KAMU_MALI = /\bCC0\b|\bPDM\b|public\s*domain|kamu\s*mal/i;
// Dışa açık: docu-shorts-pictures.js'nin Shorts künyesi aynı kuralları kullanabilsin (kendi kopyaları vardı).
/** Atıf ZORUNLU olan lisanslar — künyede tek tek anılırlar. */
export const ATIF_ISTER = /\bBY\b|\bGFDL\b|\bFAL\b/i;
/** Atıf gerektirmeyen, künyede TEK SATIRDA toplanan kaynaklar. */
export const TOPLU = new Set(["pexels", "pixabay", "unsplash"]);

export const SAGLAYICI_ADI = {
  wikimedia: "Wikimedia Commons",
  // media.js'nin Wikipedia makale görseli de bir Commons dosyası (Kartal Yuvası: "CC BY 4.0 (wikipedia)" ayrı grup açıyordu).
  wikipedia: "Wikimedia Commons",
  openverse: "Openverse",
  pexels: "Pexels",
  pixabay: "Pixabay",
  unsplash: "Unsplash",
  archive: "Archive.org",
  youtube: "YouTube",
  ai: "yapay zekâ ile üretildi",
  yerel: "kendi arşivi",
};

/** Sağlayıcının açıklamada görünen adı ("wikipedia" → "Wikimedia Commons"). */
export const saglayiciAdi = (provider) => SAGLAYICI_ADI[provider] || provider || "";

// YAZAR ALANI ÇOĞU ZAMAN AD DEĞİL (Kartal Yuvası, 24 Ekim 2026). Commons'un "Artist" alanından açıklamaya girenler:
// "Unknown Unknown", "The original uploader was Florian S. at German Wikipedia .", tartışma sayfası imzası
// "Mario Becker - Project-B-WW 15:56, 16. Sep. 2007 (CEST)" ve türev eserde dosya adı
// "File:View of … Trail.jpg: Jonovision82 derivative work: Georgfotoart" — 48 karakterde kesilince iki gerçek ad da
// düştü, CC BY-SA eserde atıf eksik kaldı. Açıklamaya adın kendisi girer; ad yoksa lisans verenin istediği atıf
// satırı ("Bundesarchiv, Bild 183-R14128A / CC-BY-SA 3.0").
export function yazarAdi(m, { tr = true } = {}) {
  const ad = String(m?.sahip || "")
    .replace(/^https?:\/\/commons\.wikimedia\.org\/wiki\/User:/, "")
    // Some Commons authors write a whole reuse note in the author field ("This image is a work by X. When reusing…").
    .replace(/^This (?:image|photo|file) is a work by ([^.]+)\..*$/is, "$1")
    .replace(/^(?:The\s+)?original uploader was (.+?) at .+$/is, "$1")
    .replace(/^(?:File|Image):[^:]+:\s*(.+?)\s+derivative work:\s*(.+)$/is, "$1 / $2")
    // Yalnızca DOSYA adı (uzantısıyla) atılır: "Image: John Smith" gibi bir yazar satırı adı kaybetmesin.
    .replace(/^(?:File|Image):[^:]*?\.(?:jpe?g|png|tiff?|webp|gif|svg)(?::\s*|$)/i, "")
    .replace(/\s+\d{1,2}:\d{2},\s*\d{1,2}\.?\s+\p{L}+\.?\s+\d{4}(?:\s*\([A-Z]{2,5}\))?\s*$/u, "")
    // İmzadan SONRA: Wikipedia imzası "Ad (talk) 12:00, 1 January 2008 (UTC)" — saat kesilince "(talk)" sonda kalıyordu.
    .replace(/\s*\((?:talk|Diskussion)\)$/i, "")
    .trim();
  if (ad && !/^(?:unknown(?:\s+author)?[\s,;]*)+$/i.test(ad)) return ad;
  return String(m?.attribution || "").trim() || (tr ? "eser sahibi belirtilmemiş" : "author unspecified");
}

/** Dosya adı eser adı olarak: Openverse Commons dosyasını "File:X.jpg" diye veriyor. */
const eserAdi = (t) => String(t || "").replace(/^(?:File|Image):/i, "").trim();
const UZANTI = /\.(?:jpe?g|png|tiff?|webp|gif|svg)$/i;

/** Uzun adı kelimede kes ("…"): gruplu künye YouTube'un 5.000 karakterine sığsın diye. */
export function cut(s, max = 48) {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max - 2).replace(/\s+\S*$/, "") + "…" : t;
}

// AYNI ESER İKİ KEZ (Kartal Yuvası): bir Commons dosyası hem Wikimedia'dan ("Kehlsteinhaus zepředu.jpg", CC BY 2.5)
// hem Openverse'ten ("File:Kehlsteinhaus zepředu.jpg", BY 2.5) geldi; sayfa adresleri farklı olduğu için ikisi de
// basıldı. Adı, lisansı ve yazarı aynı olan kayıt tek eserdir — basılacak atıf zaten harfi harfine aynı. Yazar
// anahtardan çıkmaz: Openverse'ün Flickr kaynaklı "IMG_1234" gibi ortak adlarında iki fotoğrafçının atfı birleşirdi.
// Katlama her alfabenin harfini tutar: yalnızca a-z0-9 kalınca Kiril/Yunan/Arap adlı iki ayrı eser (aynı yazar ve
// lisans) boş adla aynı anahtara düşüyor, ikincinin zorunlu atfı sessizce siliniyordu.
// Ad yalnızca Commons'ta tektir (iki dosya aynı adı taşıyamaz; "wiki/File:…" ile "index.php?curid=…" aynı dosya).
// Başka yerde anahtar eserin sayfasını (yoksa dosyasını) da taşır: bir Flickr kullanıcısının iki "IMG_1234.jpg"si
// (aynı ad, lisans, yazar; ayrı sayfalar) tek eser sayılıyor, ikincinin Source bağlantısı düşüyordu.
const katla = (s) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const COMMONS = /^https?:\/\/(?:commons|upload|thumb)\.wikimedia\.org\//i;
const eserYeri = (m) => { const u = m.sayfa || m.sourceUrl || m.url || ""; return COMMONS.test(u) ? "commons" : u || m.file || ""; };
function eserAnahtari(m) {
  const ad = katla(eserAdi(m.eser).replace(UZANTI, ""));
  return ad ? ["eser", ad, katla(String(m.lisans || "").replace(/^CC\b/i, "")), katla(yazarAdi(m)), eserYeri(m)].join("|") : "";
}
function ilkKez(seen, m) {
  // Adsız ve sayfasız kayıtta (editor.js'nin elle konan dosyası) dosya kimliktir: iki ayrı dosya tek kayda düşmesin.
  const keys = [m.sayfa || m.sourceUrl || [m.provider, m.sahip, m.eser || m.file, m.lisans].join("|"), eserAnahtari(m)].filter(Boolean);
  if (keys.some((k) => seen.has(k))) return false;
  for (const k of keys) seen.add(k);
  return true;
}

// KAYNAK KLİPLER (source-clips.js applySourcePicks: provider youtube/social, lisans "YouTube — kısa alıntı …").
// Kartal Yuvası ve Fransa (24 Ekim 2026): lisansları atıf kalıbına uymadığı için "kamu malı" sayılıp "The other
// archive images are public domain" cümlesine düştüler; kanalları hiç yazılmadı. Klip lisanslı eser değil, kaynak
// belirtilerek kısa alıntı: adı ve kanalıyla anılır, hiçbir zaman kamu malı sayılmaz.
export const klipMi = (m) => ["youtube", "social"].includes(m?.provider);
/** "Billy Cosgrave on YouTube"; sosyal medya kanalı zaten "@x on TikTok" biçiminde gelir. */
export function klipSahibi(m, { tr = true } = {}) {
  const kim = String(m?.kanal || m?.sahip || "").trim();
  if (m?.provider !== "youtube" || /youtube/i.test(kim)) return kim || (tr ? "sosyal medya" : "social media");
  return kim ? (tr ? `YouTube: ${kim}` : `${kim} on YouTube`) : "YouTube";
}

/** Kütüphanelerin Türkçe lisans notları (media.js Mixkit, audio-library.mjs) İngilizce açıklamada. */
const LISANS_EN = [
  [/ticari kullanım, atıf gerekmez/gi, "free for commercial use, no attribution required"],
  [/atıf gerekmez/gi, "no attribution required"],
  [/YouTube Ses Kitaplığı/gi, "YouTube Audio Library"],
];
const lisansYaz = (s, tr) => (tr ? s : LISANS_EN.reduce((t, [re, en]) => t.replace(re, en), String(s || "")));

// LİSANSI OLMAYAN KAYIT: media.js'nin kendi klasör klibi ("yerel", lisans boş) ve editor.js'nin elle konan dosyası
// (localOverride, lisans "Kullanıcı sağladı — yayın hakkını doğrulayın"). İngilizce açıklamaya
// '"Untitled work" — author unspecified, Permission not verified (kendi arşivi)' ve '… Kullanıcı sağladı — yayın
// hakkını doğrulayın (local)' basılıyordu; gruplu künyede de "public domain" cümlesine düşüyordu. Atıf değil, yayıncıya not.
const lisanssiz = (m) => !String(m?.lisans || "").trim() || !!m?.localOverride;
/** Lisanssız kaydın yayıncı notu; izni doğrulanamayan dış kayıt zaten "Permission not verified" alır. */
const lisanssizUyari = (m, tr) => {
  const ad = m.eser || path.win32.basename(String(m.file || ""));
  return tr ? `Lisans kaydı yok: ${ad}. Yayın hakkını doğrulayın; künyeye girmedi.` : `No licence recorded: ${ad}. Confirm the publishing rights; it is left out of the credits.`;
};

// CC BY (her sürüm), BY-SA, GFDL ve FAL değişikliğin belirtilmesini ister; Nova her resmi kırpar, boyutlandırır ve
// renklendirir. Düzenleme kaydı olmayan atıf zorunlu eser (eski iş, başka yoldan gelen künye) selectedProvenance'ın
// (provenance.js) genel notunu alır — gruplu künyenin "All images cropped…" cümlesinin karşılığı.
const GENEL_MODS = "Video düzeninde yeniden boyutlandırma/kadraj; seçilen kurguya göre hareket ve renk düzenlemesi uygulanabilir.";

/**
 * media.json'dan atıf listesi üret.
 *
 * İzin uyarıları (warnings) YAYINCININDIR: metne girmez, seo.md onları kopyala-yapıştır bloğunun dışına,
 * "Yayın öncesi kontrol" altına basar. Kartal Yuvası ve Fransa açıklamaları 5 ve 4 "Permission not verified: …"
 * satırıyla izleyiciye gitti (24 Ekim 2026).
 *
 * @param media  beatId -> { provider, lisans, sahip, eser, sayfa, file }
 * @returns { metin, zorunlu, toplam, warnings }  metin = açıklamaya yapıştırılacak blok
 */
export function kunyeUret(media, { dil = "tr", compact = false, mandatoryOnly = false, grouped = false } = {}) {
  const tr = dil !== 'en';
  const records = Object.values(media || {}).filter(m => m?.file);
  if (grouped) return kunyeGrouped(records, { tr });
  const seen = new Set(), lines = [], warnings = [];
  let aiShown = false;
  let mandatory = 0, unrecorded = 0;
  for (const m of records) {
    if (m.provider === 'ai') {
      if (!aiShown) lines.push(m.all
        ? (tr ? '• Tüm görseller yapay zekâ ile üretilmiştir.' : '• All visuals were generated with AI.')
        : (tr ? '• Bazı sahneler yapay zekâ ile üretilmiştir.' : '• Some scenes were generated with AI.'));
      aiShown = true;
      continue;
    }
    if (!ilkKez(seen, m)) continue;
    const license = m.lisans || (tr ? 'Kullanım izni doğrulanamadı' : 'Permission not verified');
    const author = yazarAdi(m, { tr });
    const provider = SAGLAYICI_ADI[m.provider] || m.provider || '';
    const source = safeSourceUrl(m.sayfa || m.sourceUrl), licenseUrl = safeSourceUrl(m.lisansUrl), authorUrl = safeSourceUrl(m.sahipUrl);
    const publicDomain = KAMU_MALI.test(license);
    const required = ATIF_ISTER.test(license) && !publicDomain;
    const usable = permissionUsable(m);
    if (!usable) warnings.push(tr ? 'Kullanım izni doğrulanamadı: ' + (m.eser || provider) + '. Yayından önce kaynak kaydını tamamlayın.' : 'Permission not verified: ' + (m.eser || provider) + '. Complete provenance before publishing.');
    if (klipMi(m)) {
      // Every mode prints it: crediting the channel is the condition the clip is used on.
      // Not a licensed work whatever its licence text says ("by" in it): never counted as a required credit, as in kunyeGrouped.
      lines.push('• "' + (eserAdi(m.eser) || (tr ? 'Başlıksız klip' : 'Untitled clip')) + '" — ' + klipSahibi(m, { tr }) + (tr ? ', yorum ve bağlam için kısa alıntı' : ', short clip used for commentary and context'));
      if (source) lines.push('  ' + (tr ? 'Kaynak: ' : 'Source: ') + source);
      continue;
    }
    // English only: the Turkish description calls them out in its own words (kunye.test).
    if (!tr && lisanssiz(m)) { if (usable) warnings.push(lisanssizUyari(m, tr)); continue; }
    if (required) mandatory++;
    if (mandatoryOnly && !required && usable) continue;
    if (compact && publicDomain) {
      lines.push('• ' + author + ', ' + license + (source ? ': ' + source : ': ' + (m.eser || provider)));
      continue;
    }
    lines.push('• "' + (eserAdi(m.eser) || (tr ? 'Başlıksız eser' : 'Untitled work')) + '" — ' + author + ', ' + lisansYaz(license, tr) + ' (' + provider + ')');
    if (source) lines.push('  ' + (tr ? 'Kaynak: ' : 'Source: ') + source);
    if (licenseUrl) lines.push('  ' + (tr ? 'Lisans: ' : 'License: ') + licenseUrl);
    if (authorUrl) lines.push('  ' + (tr ? 'Eser sahibi: ' : 'Creator: ') + authorUrl);
    if (m.attribution && m.attribution !== author) lines.push('  ' + m.attribution);
    const mods = m.modifications || (required ? GENEL_MODS : '');
    if (mods) lines.push('  ' + (tr ? 'Düzenleme: ' : 'Changes: ') + (tr ? mods : MODS_EN[mods] ?? mods));
    if (!m.modifications) unrecorded++;
  }
  // A note to the publisher, not a credit: the viewer's description never asks anyone to "document edits".
  if (unrecorded) warnings.push(tr ? `Düzenleme kaydı bulunamadı (${unrecorded} eser); yayın öncesi kadraj/renk değişikliklerini belirtin.` : `Changes not recorded (${unrecorded} works); document crop/color edits before publication.`);
  if (!lines.length) return {metin:'',zorunlu:0,toplam:records.length,warnings};
  return {metin:(tr?'Görsel kaynakları:':'Image credits:') + '\n' + lines.join('\n'),zorunlu:mandatory,toplam:records.length,warnings};
}

/**
 * THE LAST FIT (Hastings, Oct 2026): 43 attribution-required pictures made a 20,197-character description even with
 * only the required ones — YouTube stops at 5,000 and the copy-paste block was unusable. Every required credit stays
 * (title, author, licence, where it came from); the licence and source are written once per group, the changes once
 * for all, very long file names are cut at a word. Public-domain and stock sources share one line.
 */
function kunyeGrouped(records, { tr }) {
  const seen = new Set(), groups = new Map(), clips = [], warnings = [];
  let mandatory = 0, pd = 0, ai = false, ai_all = false;
  const name = (t) => eserAdi(t || (tr ? 'Başlıksız eser' : 'Untitled work')).replace(UZANTI, '').replace(/ - geograph\.org\.uk - \d+/, '');
  // Two crops of one portrait cut to the same text (Fransa: "Lecornu … (cropped)" and "(cropped 2)" both printed
  // "Portrait officiel de Sébastien Lecornu -…"): those keep their whole name.
  const list = (v) => { const k = v.map((e) => cut(e.name)); return v.map((e, i) => `"${k.indexOf(k[i]) !== k.lastIndexOf(k[i]) ? e.name : k[i]}" (${e.who})`).join('; '); };
  for (const m of records) {
    if (m.provider === 'ai') { ai = true; ai_all = ai_all || !!m.all; continue; }
    if (!ilkKez(seen, m)) continue;
    const license = m.lisans || '';
    const publicDomain = KAMU_MALI.test(license);
    const required = ATIF_ISTER.test(license) && !publicDomain;
    const usable = permissionUsable(m);
    if (!usable) warnings.push(tr ? 'Kullanım izni doğrulanamadı: ' + (m.eser || m.provider) : 'Permission not verified: ' + (m.eser || m.provider));
    if (klipMi(m)) { clips.push({ name: name(m.eser), who: klipSahibi(m, { tr }) }); continue; }
    // No licence is not public domain: never in that sentence, in either language.
    if (lisanssiz(m)) { if (usable) warnings.push(lisanssizUyari(m, tr)); continue; }
    if (!required) { pd++; continue; }
    mandatory++;
    const lic = /^BY\b/i.test(license) ? 'CC ' + license : license;
    const g = `${lic} (${SAGLAYICI_ADI[m.provider] || m.provider || ''})`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ name: name(m.eser), who: cut(yazarAdi(m, { tr }), 50) });
  }
  const lines = [...groups.entries()].map(([g, v]) => `• ${g}: ${list(v)}`);
  if (clips.length) lines.push((tr ? '• Yorum ve bağlam için kullanılan kısa klipler: ' : '• Short clips used for commentary and context: ') + list(clips));
  if (pd) lines.push(tr ? '• Diğer arşiv görselleri kamu malıdır; stok görüntüler Pexels / Pixabay lisanslıdır.' : '• The other archive images are public domain; stock footage is under the Pexels / Pixabay licences.');
  if (ai) lines.push(ai_all ? (tr ? '• Tüm görseller yapay zekâ ile üretilmiştir.' : '• All visuals were generated with AI.') : (tr ? '• Bazı sahneler yapay zekâ ile üretilmiştir.' : '• Some scenes were generated with AI.'));
  if (mandatory) lines.push(tr ? 'Tüm görseller video için kırpıldı ve boyutlandı; kamera hareketi, renk tonu, film greni ve yazı eklendi.' : 'All images cropped and resized for video, with camera motion, colour toning, grain and text overlays added.');
  if (!lines.length) return { metin: '', zorunlu: 0, toplam: records.length, warnings };
  return { metin: (tr ? 'Görsel kaynakları:' : 'Image credits:') + '\n' + lines.join('\n'), zorunlu: mandatory, toplam: records.length, warnings };
}

/** inbox-commons.js'nin kutuya koyduğu fotoğrafın düzenleme notu; elle konan Commons fotoğrafı da aynı işlemden geçer. */
const KUTU_MODS = "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama, film greni ve üst yazı eklendi.";

/**
 * GÖRSEL KUTUSUNA ELLE KONAN FOTOĞRAFLAR (Kartal Yuvası, 24 Ekim 2026): CC BY / CC BY-SA iki Commons fotoğrafı
 * (Michael Lucan, Wolfgang Manousek) kutuya kondu ve atıfları gorsel-kutusu/KUNYE.txt'ye yazıldı; Nova o dosyayı hiç
 * okumuyordu, atıflar açıklamaya elle eklendi. Satır biçimi:
 *   01 Michael Lucan / Wikimedia Commons, CC BY-SA 3.0 de — https://commons.wikimedia.org/wiki/File:….JPG
 * needed.json'daki aynı numaranın dosyasıyla künye kaydına çevrilir; "AI görseli" satırları atlanır.
 *
 * @param metin   KUNYE.txt içeriği
 * @param needed  gorsel-kutusu/needed.json ({ items: [{ n, file }] } ya da dizi)
 * @returns { "inbox-01": { provider, eser, sahip, lisans, lisansUrl, sayfa, file, modifications } }
 */
export function kutuKunyesi(metin, needed) {
  const items = Array.isArray(needed) ? needed : needed?.items || [];
  const files = new Map(items.filter((x) => x?.n && x.file).map((x) => [Number(x.n), x.file]));
  const out = {};
  for (const line of String(metin || "").split(/\r?\n/)) {
    const m = line.trim().match(/^(\d{1,3})\s+(.+?)\s+\/\s+([^,]+),\s*(.+?)\s+[—–-]\s+(https?:\/\/\S+)$/);
    if (!m || !files.has(Number(m[1]))) continue;
    const [, n, sahip, site, lisans, sayfa] = m;
    const cc = lisans.match(/^(?:CC[ -])?(BY(?:-(?:SA|ND|NC(?:-SA|-ND)?))?)[ -](\d\.\d)(?:[ -]([a-z]{2}))?$/i);
    let eser = (sayfa.match(/File:([^?#]+)/) || [])[1] || "";
    try { eser = decodeURIComponent(eser); } catch {}
    out[`inbox-${n.padStart(2, "0")}`] = {
      provider: /wikimedia|commons/i.test(site) ? "wikimedia" : site.trim(), eser: eser.replace(/_/g, " "), sahip: sahip.trim(), lisans: lisans.trim(),
      lisansUrl: cc ? `https://creativecommons.org/licenses/${cc[1].toLowerCase()}/${cc[2]}/${cc[3] ? cc[3].toLowerCase() + "/" : ""}` : "",
      sayfa, file: files.get(Number(n)), modifications: KUTU_MODS,
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// MÜZİK KÜNYESİ
// ---------------------------------------------------------------------------
//
// NEDEN VAR: görsel künyesi vardı, MÜZİK künyesi hiç yoktu. YouTube Audio
// Library parçalarının bir bölümü atıf istiyor (sanatçı adı + parça adı) ve
// bu bilgi hiçbir yere yazılmıyordu — yani yayınlanan videolar atıf isteyen
// müziği atıfsız taşıyor olabilirdi. Görsel tarafında kapatılan açığın aynısı.
//
// KAYNAK DOSYA ADI. Parçalarda ID3 etiketi yok (ffprobe ile bakıldı: title,
// artist, album üçü de boş). O yüzden ad şu biçimde tutuluyor:
//
//     yatak-<rol>-<parça-adı>--<sanatçı>.mp3
//
// Çift tire BİLEREK ayırıcı: tek tire hem başlıkta hem sanatçı adında geçiyor
// ("i-need-you-dyalla" nerede bölünecek belli değil). Ayırıcı yoksa sanatçı
// UYDURULMAZ — yalnızca parça adı yazılır. Yanlış atıf, eksik atıftan kötüdür.

/** The archive's standard modification notes (docu-archive.js DOCU_MODS / DOCU_VIDEO_MODS, inbox-commons.js, provenance.js; Turkish) as an English description prints them. */
const MODS_EN = {
  "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama (duotone), film greni ve üst yazı eklendi.": "Cropped and resized for video; camera motion, colour toning (duotone), film grain and text overlay added.",
  "Video düzeninde bir bölümü kullanıldı (kısaltıldı), ses kaldırıldı; kadraj ve yeniden boyutlandırma, renk tonlama (duotone), film greni ve üst yazı eklendi.": "A section used (trimmed), sound removed; cropped and resized for video, colour toning (duotone), film grain and text overlay added.",
  [KUTU_MODS]: "Cropped and resized for video; camera motion, colour toning, film grain and text overlay added.",
  [GENEL_MODS]: "Resized and cropped for video; motion and colour edits may be applied to fit the cut.",
};

/** audio-library.mjs'nin YouTube Ses Kitaplığı lisansı; atıf isteyen parça (lisansında öyle yazar) listede kalır. */
const KITAPLIK = /YouTube (?:Ses Kitaplığı|Audio Library)/i;
// Creative Commons da atıf ister: kitaplığın CC BY parçası ("… Creative Commons Attribution 4.0") tek satıra düşmez.
const ATIF_GEREKLI = /atıf (?:gerekli|gerekir|zorunlu)|(?<!no )attribution (?:is )?required|requires attribution|creative\s*commons|\bCC[ -]?BY\b/i;

/** "a-dream-within-a-dream" → "A Dream Within A Dream" */
function baslikYap(slug) {
  return String(slug || "")
    .split("-").filter(Boolean)
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(" ");
}

/**
 * Bir yatak dosyasının adından parça ve sanatçı bilgisini çıkar.
 * @returns { parca, sanatci }  sanatci ayırıcı yoksa boş string
 */
export function muzikAdiCoz(dosya) {
  const ad = path.win32.parse(String(dosya || "")).name;
  // Baştaki "yatak-<rol>-" önekini at.
  const govde = ad.replace(/^yatak-(gerilim|notr|derin|ilham)-?/i, "");
  if (!govde) return { parca: "", sanatci: "" };
  const i = govde.indexOf("--");
  if (i < 0) return { parca: baslikYap(govde), sanatci: "" };
  return { parca: baslikYap(govde.slice(0, i)), sanatci: baslikYap(govde.slice(i + 2)) };
}

/**
 * Videoda KULLANILAN yatak parçaları için atıf bloğu üret.
 *
 * @param dosyalar kullanılan dosya adları (yinelenenler ayıklanır)
 * @returns { metin, sayi }
 */
export function muzikKunyesi(dosyalar, { dil = "tr" } = {}) {
  const tr = dil !== 'en', seen = new Set(), lines = [];
  let library = 0;
  const uyarilar = [];
  for (const item of dosyalar || []) {
    if (!item) continue;
    const info = typeof item === 'object' ? item : {file:item};
    const filename = path.win32.basename(String(info.file || info.path || ''));
    if (!filename || seen.has(filename) || /^yatak-(gerilim|notr|derin|ilham)\.[^.]+$/i.test(filename)) continue;
    seen.add(filename);
    const guessed = muzikAdiCoz(filename);
    const title = info.title || guessed.parca, author = info.artist || guessed.sanatci;
    if (!title) continue;
    // YouTube Audio Library tracks need no attribution: summed up in one line, never listed with internal notes.
    // The licence alone also tells (Kartal Yuvası, Fransa, 24 Oct 2026: docu.js's music list dropped `source`, and every
    // track printed "YouTube Ses Kitaplığı — atıf gerekmez" in the English description).
    // A licence that asks for attribution keeps the track listed, `source` or not: docu.js passes it now, so it decides.
    if ((info.source === 'youtube-audio-library' || KITAPLIK.test(info.license || '')) && !ATIF_GEREKLI.test(info.license || '')) { library++; continue; }
    const source = safeSourceUrl(info.sourceUrl), license = safeSourceUrl(info.licenseUrl);
    // An origin we cannot verify is the PUBLISHER's to check (uyarilar), never printed in the viewer's description.
    if (!source && !info.license) uyarilar.push(`"${title}"${author ? ' — ' + author : ''}: ${tr ? 'kaynak/lisans doğrulanamadı; ad bilgisi dosya adından çıkarılmış olabilir' : 'origin/license not verified; names may be derived from filename'}`);
    lines.push('• "' + title + '"' + (author ? ' — ' + author : '') + (source ? '\n  ' + source : '') + (info.license ? '\n  ' + lisansYaz(info.license, tr) : '') + (license ? '\n  ' + license : ''));
  }
  lines.sort();
  const head = tr ? 'Müzik:' : 'Music:';
  if (!lines.length) return {metin: library ? head + ' ' + (tr ? 'YouTube Ses Kitaplığı' : 'YouTube Audio Library') : '', sayi: library ? 1 : 0, uyarilar};
  if (library) lines.push(tr ? '• Diğer parçalar: YouTube Ses Kitaplığı' : '• Other tracks: YouTube Audio Library');
  return {metin: head + '\n' + lines.join('\n'), sayi: lines.length, uyarilar};
}
