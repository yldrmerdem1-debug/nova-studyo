import { commonsAuthor, commonsMetadata, permissionUsable, selectedProvenance } from "./provenance.js";
import { aiAllowance } from '../../public/production-modes.js';
export { permissionUsable } from "./provenance.js";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fetchJson, downloadFile, fetchVideoClip, mapLimit, ffprobeDuration, ASSETS_DIR } from "../util.js";
import { getSettings, getJobSettings } from "../config.js";
import { generateAiClips } from "./aivideo.js";
import {approvedCandidateOrder} from './director-picks.js';
import { sahneIstemleri, kuralliIstem } from "./aiistem.js";
import { shouldSearchVideo, preferRelevantVideo } from './video-policy.js';

// ---------- kaynaklar ----------

/**
 * HTML etiketlerini at, tek satıra indir. Wikimedia'nın extmetadata alanları
 * ("Artist" gibi) HTML gelir: <a href="...">Jane Doe</a>.
 */
/**
 * KULLANILABİLİR BOYUT — genişliğe değil UZUN KENARA bakılır.
 *
 * Eskiden `width >= 640` idi ve bu, dikey/arşiv görsellerini kesiyordu. Gerçek
 * vaka: Baba Vanga'nın serbest lisanslı TEK fotoğrafı (sınır geçiş belgesi,
 * "Baba Vanga Border Pass.jpg", CC BY-SA 4.0) 478×685 — genişliği 640'ın
 * altında olduğu için havuza hiç girmedi. Videoda kişi anlatılıp kişi hiç
 * gösterilemedi; doğrudan bu dosya aratıldığında bile 0 sonuç dönüyordu.
 *
 * Belge taramaları, vesikalık fotoğraflar ve gravürler neredeyse hep dikeydir.
 * Ken Burns zaten kırpıp ölçeklediği için 685 piksellik uzun kenar tam ekranda
 * yeterli. Kısa kenar için ayrı bir taban var ki afiş/şerit gibi ince
 * parçalar geçmesin.
 */
const EN_AZ_UZUN_KENAR = 640;
const EN_AZ_KISA_KENAR = 380;

// EN-BOY SINIRI. 1:3'ten uzun bir şerit (panorama, afiş kenarı, sütun taraması)
// 16:9 ekrana konduğunda ya kenarlarının %80'i kırpılır ya da kuş kadar kalır.
// İkisi de kötü; havuza hiç girmesin.
const EN_COK_ORAN = 3;

export function boyutYeterli(w, h) {
  const en = Number(w) || 0, boy = Number(h) || 0;
  if (!en || !boy) return en >= EN_AZ_UZUN_KENAR || boy >= EN_AZ_UZUN_KENAR;
  if (Math.max(en, boy) / Math.min(en, boy) > EN_COK_ORAN) return false;
  return Math.max(en, boy) >= EN_AZ_UZUN_KENAR && Math.min(en, boy) >= EN_AZ_KISA_KENAR;
}

/**
 * KÜÇÜK AMA KESİN DOĞRU GÖRSEL — ayrı, daha gevşek bir taban.
 *
 * NEDEN VAR. Boyut eşiği "büyük olan iyidir" varsayımıyla çalışıyor, ama
 * belgeselde asıl soru bu değil: EKRANDA DOĞRU ŞEY Mİ VAR? Ölçüldü
 * (2026-08-09): Baba Vanga'nın yüzünün Wikimedia Commons'ta serbest lisanslı
 * hiçbir fotoğrafı yok — yalnızca büstü, evi ve adını taşıyan bir bahçe
 * pompası var. Wikipedia maddesinin kapak görseli ise onun gerçek
 * fotoğrafı; ama 220x314. Eski eşik onu eliyordu ve video, kadını anlatıp
 * kadını hiç göstermiyordu.
 *
 * 220 piksel tam ekran için azdır — ama render bunları bulanık büyütülmüş
 * kendi kopyasının üstünde ÇERÇEVELİ olarak gösteriyor (bkz. render.js),
 * yani pikselli görünmüyor. Yanlış ama büyük bir fotoğraftansa küçük ama
 * doğru olan yeğdir.
 *
 * Yalnızca maddeye bağlanmış kaynaklar için geçerli — stok sitesinin küçük
 * görseli bu kapıdan giremez.
 */
const KESIN_EN_AZ_KENAR = 200;
export function kucukAmaDogru(w, h) {
  const en = Number(w) || 0, boy = Number(h) || 0;
  if (!en || !boy) return true; // boyut bildirilmemiş: indirince görülür
  if (Math.max(en, boy) / Math.min(en, boy) > EN_COK_ORAN) return false;
  return Math.min(en, boy) >= KESIN_EN_AZ_KENAR;
}

/**
 * FOTOĞRAF KİMLİĞİ — aynı dosyanın bütün adres biçimleri tek anahtara iner.
 *
 * NEDEN. Tekrar kontrolü tam adresle yapılıyordu ve aynı fotoğraf havuza 2-3
 * FARKLI adresle giriyordu. Ölçüldü: Commons imageinfo adresleri artık
 * "?utm_source=commons.wikimedia.org&utm_campaign=imageinfo..." ile bitiyor;
 * Wikipedia aynı dosyayı soru işaretsiz veriyor; Openverse de soru işaretsiz;
 * Commons araması 2560px'lik "thumb" sürümünü veriyor. Dördü aynı fotoğraf ama
 * dört ayrı adres — belgeselde aynı kare iki sahnede çıkabiliyordu.
 *
 *   Wikimedia  → çözülmüş dosya adı ("NNNpx-" öneki ve /thumb/ yolu atılır)
 *   NASA       → nasa_id (~orig / ~large / ~thumb aynı görsel)
 *   Flickr     → fotoğraf numarası (_b, _o, _z boyut ekleri aynı görsel)
 *   diğerleri  → host + yol; yalnızca izleme/boyut parametreleri atılır
 *     (bazı arşivler görseli ?id= ile tanıtıyor, o parametre kimliktir)
 */
const BOYUT_PARAM = /^(utm_\w+|w|h|width|height|size|q|quality|fm|format|fit|crop|auto|cs|dpr|ixid|ixlib|rb|dl|download|resize|scale|s|profile_id)$/i;
/**
 * One Flickr photo under its other addresses. Gimli Glider (28 Ekim 2026): scene 0 took the Commons file
 * "C-GAUN 604 … Toronto, July 14 1984. (5530418110) (cropped).jpg" by name; scene 3's search picked the same photo from
 * Flickr (live.staticflickr.com/5052/5530418110_….jpg) — a different address, so the opening showed it twice in 15 s.
 * A Commons import keeps the Flickr id in its title; the static and photo-page URLs carry it too.
 */
export function photoTwinKey(...texts) {
  for (const t of texts) {
    const s = String(t || "");
    const m = s.match(/staticflickr\.com\/\d+\/(\d{8,12})_/) || s.match(/flickr\.com\/photos\/[^/]+\/(\d{8,12})(?:\/|$)/) || s.match(/\((\d{8,12})\)(?:\s*\((?:cropped|crop|edited|edit)[^)]*\))?(?:\.[a-z]{3,4})?\s*$/i);
    if (m) return `flickr:${m[1]}`;
  }
  return null;
}
export function photoKey(url) {
  const ham = String(url || "").trim();
  let u;
  try { u = new URL(ham); } catch { return ham; }
  if (!/^https?:$/.test(u.protocol)) return ham;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const coz = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
  const parca = u.pathname.split("/").filter(Boolean);
  // Commons imageinfo'nun küçük resmi artık thumb.wikimedia.org'dan da geliyor (Kartal Yuvası, 24 Ekim 2026: adıyla
  // alınan "Kehlsteinhaus zepředu.jpg" bu adresle kaydedildi, aramadaki upload adresli kopyası tanınmadı, iki sahnede çıktı).
  if (host === "upload.wikimedia.org" || host === "thumb.wikimedia.org") {
    const t = parca.indexOf("thumb");
    // /wikipedia/commons/thumb/a/ab/Dosya.jpg/2560px-Dosya.jpg → "Dosya.jpg"
    let ad = t >= 0 && parca[t + 3] ? parca[t + 3] : parca.at(-1) || "";
    ad = coz(ad).replace(/^\d{14}!/, "")                        // arşiv sürümü öneki
      .replace(/^(?:lossy-|lossless-)?(?:page\d+-)?\d+px-/, ""); // ölçek öneki
    return `wikimedia:${ad.replace(/ /g, "_").toLowerCase()}`;
  }
  if (host === "commons.wikimedia.org" || /\.wikipedia\.org$/.test(host)) {
    const m = coz(u.pathname).match(/\/(?:wiki\/)?(?:File:|Dosya:|Special:FilePath\/)([^/]+)$/i);
    if (m) return `wikimedia:${m[1].replace(/ /g, "_").toLowerCase()}`;
  }
  if (host === "images-assets.nasa.gov" && parca[0] === "image" && parca[1]) return `nasa:${coz(parca[1])}`;
  if (/(^|\.)staticflickr\.com$/.test(host)) {
    const id = (parca.at(-1) || "").match(/^(\d+)_/);
    if (id) return `flickr:${id[1]}`;
  }
  const kalan = [...u.searchParams.entries()].filter(([k]) => !BOYUT_PARAM.test(k)).sort(([a], [b]) => a.localeCompare(b));
  const sorgu = kalan.length ? "?" + kalan.map(([k, v]) => `${k}=${v}`).join("&") : "";
  return `${host}${coz(u.pathname)}${sorgu}`;
}

/** Stok siteleri: her sayfada tek fotoğraf var, sayfa adresi fotoğrafın kalıcı kimliğidir. */
const TEK_FOTO_SAYFA = /(^|\.)(pixabay|pexels|unsplash)\.com$/i;
export const tekFotoSayfasi = (c) => {
  try { return !!c?.sayfa && TEK_FOTO_SAYFA.test(new URL(c.sayfa).hostname); } catch { return false; }
};
/**
 * Bir kaynağın reddedilirken kaydedilecek kalıcı adresleri: dosya adresi ve, tek fotoğraflık stok sayfasında, sayfası.
 * Pixabay dosya adresi imzalıdır (pixabay.com/get/<jeton>_1280.jpg) ve her aramada değişir (18 Ekim 2026, Hürmüz
 * mayınları: "gemi adı açıklanmadı" sahnesindeki EUROCHAMPION adlı tanker ön izlemede ve render sonrası iki kez
 * reddedildi, iki ret de başka jetona yazıldığı için üçüncü jetonla yeniden seçildi ve ikinci bir render gerekti).
 * Müze/arşiv sayfası birden çok görünüş taşıyabildiği için orada yalnızca dosya adresi.
 */
export function stablePhotoRefs(c) {
  return [c?.url, tekFotoSayfasi(c) ? c.sayfa : null].filter(Boolean);
}

function duzMetin(s, max = 90) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

async function searchWikimedia(query) {
  // extmetadata: LİSANS ve ESER SAHİBİ buradan gelir. Bunlar kaydedilmeden
  // videoya giren CC-BY görselin künyesi yazılamıyordu — atıf zorunlu olduğu
  // için yayınlanan video telif şikâyetine açık kalıyordu.
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=14` +
    `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=2560&format=json&origin=*`;
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {});
  return pages
    // Sayfa başlığı ("File:Lighthouse keeper 1910.jpg") tek relevans sinyalimiz —
    // imageinfo'ya geçerken kayboluyordu.
    .map((p) => (p.imageinfo?.[0] ? { ...p.imageinfo[0], _baslik: p.title } : null))
    .filter((ii) => ii && /image\/(jpeg|png|webp|tiff)/.test(ii.mime || "") && boyutYeterli(ii.width, ii.height))
    // thumburl yoksa orijinali kullanırız; orijinal SVG ise ffmpeg çözemez → ele
    .filter((ii) => ii.thumburl || !/\.svgz?$/i.test(ii.url || ""))
    .map((ii) => {
      const em = ii.extmetadata || {};
      // BOYUT ÇİFTİ AYNI KAYNAKTAN OKUNMALI.
      //
      // Buradaki eski kod genişliği ORİJİNALDEN, yüksekliği ise 2560'a
      // büyütülmüş KÜÇÜK RESİMDEN alıyordu. 478x685'lik bir belge taraması
      // 478x3669 olarak kaydediliyordu (2560/478*685 = 3669) — yani 1:7,7'lik
      // imkânsız bir şerit. Bu, en-boy oranına bakan her kararı bozuyordu.
      // Ölçüldü: Baba Vanga'nın sınır geçiş belgesi tam bu yüzden "kullanılamaz
      // şerit" gibi görünüyordu, oysa normal bir dikey belge.
      //
      // Ayrıca: orijinal 2560'tan darsa MediaWiki'nin "thumb"ı bir BÜYÜTMEDİR,
      // yani orijinalden daha bulanıktır. O durumda orijinal indirilir.
      const buyutme = (ii.width || 0) > 0 && (ii.width || 0) < 2560;
      // İzleme sorgusu ("?utm_source=commons...") atılır: Wikipedia ve Openverse
      // aynı dosyayı sorgusuz veriyor, adres farkı yüzünden tekrar kaçıyordu.
      const kaynak = String(buyutme ? ii.url : (ii.thumburl || ii.url)).split("?")[0];
      // SEÇİM EKRANI İÇİN KÜÇÜK SÜRÜM. `kaynak` render kalitesi için büyük
      // (ölçüldü: 579 KB); seçim ekranında 60 aday yan yana dizildiğinde bu
      // 35 MB indirme demek. MediaWiki küçük resim adresleri "NNNpx-" öneki
      // taşıyor, onu 480'e çekmek tek satır. Önek yoksa büyük sürüm kalır.
      const kucukResim = /\/thumb\//.test(kaynak)
        ? kaynak.replace(/\/\d+px-/, "/480px-")
        : kaynak;
      return {
        provider: "wikimedia",
        type: "image",
        metin: ii._baslik || "",
        url: kaynak,
        thumb: kucukResim,
        width: ii.width || 0,
        height: ii.height || 0,
        ...commonsMetadata(ii, ii._baslik || ""),
        lisans: duzMetin(em.LicenseShortName?.value || em.License?.value, 120),
        sahip: duzMetin(commonsAuthor(em), 2000),
        eser: duzMetin(String(ii._baslik || "").replace(/^File:/, "").replace(/\.\w+$/, ""), 70),
        sayfa: ii.descriptionurl || "",
      };
    });
}

async function searchWikimediaVideos(query) {
  const url =
    `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
    `&gsrsearch=${encodeURIComponent(query + " filetype:video")}&gsrnamespace=6&gsrlimit=8` +
    `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=640&format=json&origin=*`;
  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {});
  return pages
    .map((p) => p.imageinfo?.[0] ? {...p.imageinfo[0], _baslik:p.title} : null)
    .filter((ii) => ii && /video\/(webm|ogg|mp4)/.test(ii.mime || "") && (ii.width || 0) >= 480)
    .map((ii) => ({
      ...commonsMetadata(ii, ii._baslik || ""),
      provider: "wikimedia",
      type: "video",
      url: ii.url,
      thumb: ii.thumburl || "",
      width: ii.width || 0,
      height: ii.height || 0,
    }));
}

// Mixkit: sinematik stok video (Envato; ücretsiz ticari kullanım, atıf gerekmez) — anahtarsız.
// Arama sayfası sorguyu bir etiket sayfasına bağlar; listedeki her klibin 720p MP4'ü ve
// küçük resmi sabit adreste durur (1080p adresi 403 veriyor).
/** Aramanın taşıyıcı kelimeleri: dolgu ve "footage/newsreel" gibi biçim sözcükleri atılır, isimler önce. */
const VIDEO_DOLGU = new Set(["the", "and", "with", "from", "into", "over", "under", "through", "near", "footage", "newsreel", "film", "video", "clip", "stock", "shot", "scene", "cinematic", "slow", "motion", "close", "wide", "view", "night", "day"]);
function tasiyiciKelimeler(query) {
  const ws = String(query).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !VIDEO_DOLGU.has(w) && !/^\d+s?$/.test(w));
  // Fiil/sıfat biçimleri (-ing, -ed, -ly) sona: etiket sayfaları çoğunlukla isim.
  return [...new Set(ws)].sort((a, b) => (/(ing|ed|ly)$/.test(a) ? 1 : 0) - (/(ing|ed|ly)$/.test(b) ? 1 : 0));
}

async function searchMixkitVideos(query) {
  const slugOf = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  const sayfa = async (slug) => {
    if (!slug) return "";
    const r = await fetch(`https://mixkit.co/free-stock-video/discover/${slug}/`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    return r.ok ? r.text() : "";
  };
  // Mixkit modern stok: tarihi/özel isimli arama (yıl ya da büyük harfli ad) onun işi değil —
  // "1929 Wall Street" için "tuğla duvar" getiriyordu. Onları arşiv kaynakları karşılar.
  if (/\b(1[5-9]\d\d|20[0-2]\d)\b/.test(query) || /(^|\s)[A-Z][a-z]+/.test(String(query).replace(/^\S+/, ""))) return [];
  const kelimeler = tasiyiciKelimeler(query);
  // Mixkit tam cümleyi etiket sayfasına bağlayamıyor ("airplane flying through storm
  // clouds" → 0): önce tam sorgu, sonuç yoksa en taşıyıcı iki kelimenin sayfaları.
  let html = await sayfa(slugOf(query));
  if (!/href="\/free-stock-video\/[a-z0-9-]+-\d+\/"/.test(html)) {
    const ws = tasiyiciKelimeler(query).slice(0, 2);
    html = (await Promise.all(ws.map((w) => sayfa(w).catch(() => "")))).join("\n");
  }
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(/href="\/free-stock-video\/([a-z0-9-]+)-(\d+)\/"/g)) {
    const [, isim, id] = m;
    if (seen.has(id) || out.length >= 8) continue;
    seen.add(id);
    // Başlığı sorgunun hiçbir taşıyıcı kelimesini içermeyen klip alakasız (iki yönlü parça eşleşme: plane ~ airplane).
    const baslikKelimeleri = isim.split("-").filter((w) => w.length >= 3);
    if (kelimeler.length && !kelimeler.some((k) => baslikKelimeleri.some((b) => b.includes(k) || k.includes(b)))) continue;
    out.push({
      provider: "mixkit",
      lisans: "Mixkit Stock Video Free License (ticari kullanım, atıf gerekmez)",
      lisansUrl: "https://mixkit.co/license/#videoFree",
      sahip: "Mixkit", eser: isim.replace(/-/g, " "), sayfa: `https://mixkit.co/free-stock-video/${isim}-${id}/`,
      type: "video",
      url: `https://assets.mixkit.co/videos/${id}/${id}-720.mp4`,
      thumb: `https://assets.mixkit.co/videos/${id}/${id}-thumb-720-0.jpg`,
      width: 1280, height: 720,
    });
  }
  return out;
}

// Archive.org: telifsiz arşiv görüntüleri (haber filmleri, belgesel çekimleri) — anahtarsız.
// Kamu malı film koleksiyonları (Prelinger, FedFlix = ABD Ulusal Arşivi kopyaları, haber
// filmleri) önce gelir; uzun belgeselde havuz kurumasın diye 8 sonuç istenir.
async function searchArchiveVideos(query) {
  const ara = (qq) => fetchJson(
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(`(${qq}) AND mediatype:(movies) AND collection:(prelinger OR fedflix OR universal_newsreels OR UniversalNewsreels OR nasa)`)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=collection&sort%5B%5D=downloads+desc&rows=8&page=1&output=json`,
    { timeoutMs: 15000 }
  );
  // YALNIZCA güvenilir kamu malı koleksiyonlar: açık arama YouTube kopyaları (telifli) ve
  // propaganda filmleri getiriyordu. Archive.org her kelimeyi zorunlu tutar: sonuç yoksa
  // taşıyıcı ilk üç, sonra ilk iki kelimeyle yeniden sorulur ("1929 Wall Street crash
  // newsreel" → "1929 wall street").
  let search = await ara(query);
  const yil = (String(query).match(/\b(1[89]\d\d|20[0-2]\d)\b/) || [])[1];
  const ws = tasiyiciKelimeler(query);
  for (const n of [3, 2]) {
    if (search?.response?.docs?.length || ws.length < 2) break;
    search = await ara([yil, ...ws.slice(0, n)].filter(Boolean).join(" "));
  }
  const KAMU = /prelinger|fedflix|newsandpublicaffairs|universal_newsreels|ephemera|feature_films|nasa/i;
  if (search?.response?.docs) {
    search.response.docs.sort((a, b) => (KAMU.test(String(b.collection)) ? 1 : 0) - (KAMU.test(String(a.collection)) ? 1 : 0));
  }
  const docs = search?.response?.docs || [];
  const out = [];
  await mapLimit(docs, 2, async (d) => {
    const meta = await fetchJson(`https://archive.org/metadata/${d.identifier}`, { timeoutMs: 15000 });
    const rights = Array.isArray(meta?.metadata?.licenseurl) ? meta.metadata.licenseurl[0] : meta?.metadata?.licenseurl || "";
    const files = (meta?.files || [])
      .filter((f) => /\.mp4$/i.test(f.name || "") && (parseInt(f.size) || 0) > 1e6 && (parseInt(f.size) || 0) < 250e6)
      .sort((a, b) => (parseInt(a.size) || 0) - (parseInt(b.size) || 0));
    const f = files[0];
    if (!f) return;
    // Lisans alanı boş kamu malı koleksiyonlar: Prelinger (kamu malı ilan edilmiş), FedFlix
    // (ABD federal hükümet eseri = kamu malı), Universal Newsreels (kamuya bağışlanmış).
    // Başka koleksiyonda lisans yoksa kamu malı SAYILMAZ (izin filtresi eler).
    const koleksiyon = [].concat(meta?.metadata?.collection || d.collection || []).join(",");
    const kamuKoleksiyonu = !rights && /prelinger|fedflix|universal_newsreels/i.test(koleksiyon);
    out.push({
      provider: "archive",
      lisans: kamuKoleksiyonu ? `Public domain (Internet Archive: ${koleksiyon.split(",")[0]})` : europeanaLisans(rights),
      lisansUrl: kamuKoleksiyonu ? "https://creativecommons.org/publicdomain/mark/1.0/" : rights,
      sahip:duzMetin(meta.metadata?.creator,2000), eser:d.title || "", sayfa:`https://archive.org/details/${d.identifier}`,
      type: "video",
      url: `https://archive.org/download/${d.identifier}/${encodeURIComponent(f.name)}`,
      thumb: `https://archive.org/services/img/${d.identifier}`,
      width: parseInt(f.width) || 640,
      height: parseInt(f.height) || 480,
      duration: parseFloat(f.length) || undefined,
    });
  });
  return out;
}

// Kullanıcının kendi klipleri: assets/ klasöründeki videolar.
// Dosya adı arama sorgusuyla eşleşirse (kelime bazlı) aday havuzuna girer.
function searchLocalAssets(query, wantType) {
  if (wantType !== "video") return [];
  let files = [];
  try {
    files = fs.readdirSync(ASSETS_DIR).filter((f) => /\.(mp4|mov|mkv|webm|m4v)$/i.test(f));
  } catch { return []; }
  if (!files.length) return [];
  const words = query.toLowerCase().split(/[^a-zçğıöşü0-9]+/i).filter((w) => w.length > 2);
  return files
    .map((f) => {
      const name = f.toLowerCase();
      const hits = words.filter((w) => name.includes(w)).length;
      return { f, hits };
    })
    .filter((x) => x.hits > 0 || files.length <= 12) // az dosya varsa hepsi havuzda
    .map(({ f, hits }) => ({
      provider: "yerel",
      type: "video",
      url: "file://" + path.join(ASSETS_DIR, f),
      localPath: path.join(ASSETS_DIR, f),
      thumb: "",
      width: 1920,
      height: 1080,
      matchBonus: hits * 40,
    }));
}

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ""; } };

async function searchOpenverse(query) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=16&mature=false`;
  const data = await fetchJson(url);
  return (data?.results || [])
    .filter((r) => r.url && boyutYeterli(r.width, r.height))
    // SVG ffmpeg tarafından çözülemiyor — baştan ele
    .filter((r) => !/\.svgz?(\?|$)/i.test(r.url) && !/svg/i.test(r.filetype || ""))
    // rawpixel'in Openverse'e verdiği adres önizleme: CC0 eserin üstüne soluk "rawpixel" filigranı basılı
    // (Kara Ölüm Shorts'unda bakteri mikrografı). Görüntü modeli soluk filigranı kaçırıyor — kaynakta elenir.
    .filter((r) => !/(^|\.)rawpixel\.com$/i.test(hostOf(r.url)) && !/rawpixel/i.test(r.source || r.provider || ""))
    .map((r) => ({
      provider: "openverse",
      type: "image",
      metin: [r.title, (r.tags || []).map((x) => x.name || x).join(" ")].filter(Boolean).join(" "),
      url: r.url,
      // KÜÇÜK RESİM OLARAK DOĞRUDAN DOSYA KULLANILIYOR.
      //
      // Openverse'ün kendi `thumbnail` alanı bir API ucu
      // (api.openverse.org/v1/images/{id}/thumb) ve kaynak siteye vekillik
      // ediyor. Ölçüldü: WIKIMEDIA barındırmalı görsellerde bu uç HTTP 424
      // dönüyor — üç örnekten ikisi. Openverse'ün en büyük kaynağı Wikimedia
      // olduğu için seçim ekranında görsellerin çoğu BOŞ çıkıyordu
      // (kullanıcının "seçilen görseller gösterilmiyor" şikâyeti).
      // Doğrudan dosya adresi üç örnekte de 200 döndü.
      thumb: r.url,
      width: r.width || 0,
      height: r.height || 0,
      // Openverse yalnızca CC/kamu malı eser topluyor; çoğu ATIF İSTİYOR.
      lisans: duzMetin([r.license, r.license_version].filter(Boolean).join(" ").toUpperCase(), 40),
      sahip: duzMetin(r.creator, 2000),
      lisansUrl: r.license_url || "", sahipUrl:r.creator_url || "",
      eser: duzMetin(r.title, 70),
      sayfa: r.foreign_landing_url || r.url || "",
    }));
}

// NASA görsel arşivi — bilim/uzay/yer bilimleri konularında rakipsiz.
//
// ANAHTAR GEREKTİRMİYOR: images-api.nasa.gov herkese açık. (api.nasa.gov
// anahtarı APOD/Mars gibi BAŞKA uçlar için; görsel aramada kullanılmıyor.)
//
// LİSANS: NASA içeriği kural olarak kamu malı (ABD devlet eseri). İstisnalar
// var — ortak kurum/telifli katkılar. Bu yüzden künyede kaynak sayfası da
// tutuluyor ki gerektiğinde doğrulanabilsin.
/**
 * NASA KAYDININ LİSANSI.
 *
 * NEDEN AYRI. images-api.nasa.gov kayıtlarında `rights`/`license` alanı HİÇ
 * yok (ölçüldü: yalnızca center, date_created, description, keywords,
 * media_type, nasa_id, title). Eski kod bu yüzden her NASA adayına "izin
 * doğrulanamadı" yazıyordu ve lisans süzgeci hepsini eliyordu — bilim
 * belgeselinin en iyi kaynağı sessizce yok oluyordu.
 *
 * NASA'nın medya kullanım kuralı: NASA'nın kendi çektiği/ürettiği görsel
 * telifsizdir (ABD kamu eseri). İstisna ÜÇÜNCÜ TARAF katkısıdır (ESA ortak
 * yapımları, ajans fotoğrafları, şirket görselleri) — kaydın künye/katkı
 * metninde adı geçer. Bu yüzden: merkez (center) belliyse ve künyede telif
 * işareti ya da NASA dışı bir hak sahibi yoksa kamu malı sayılır; biri varsa
 * eski gibi "doğrulanamadı" kalır ve süzgeç eler.
 */
const NASA_TELIF = /©|\(c\)\s*\d{4}|\bcopyright\b|all rights reserved/i;
const NASA_UCUNCU_TARAF = /\b(ESA|European Space Agency|Roscosmos|JAXA|CNES|DLR|ISRO|CSA|Canadian Space Agency|Getty|AP Photo|Associated Press|Reuters|AFP|SpaceX|Boeing|Lockheed|Northrop|Blue Origin|Sierra (?:Nevada|Space)|Axiom|Bigelow|Airbus|Thales|Max Planck)\b/i;
export function nasaLisans(d = {}) {
  const tum = [d.title, d.description, d.description_508, d.secondary_creator, d.photographer].filter(Boolean).join(" \n ");
  // Künye cümleleri: "Image Credit: NASA/ESA/...", "Photo courtesy of ...".
  const kunyeler = [...tum.matchAll(/\b(?:credits?|courtesy(?:\s+of)?)\b\s*:?\s*([^\n]{0,160})/gi)].map((m) => m[1]);
  const kredi = [d.secondary_creator, d.photographer, ...kunyeler].filter(Boolean).join(" | ");
  const ucuncuTaraf = NASA_UCUNCU_TARAF.test(kredi)
    // "courtesy of X": X NASA değilse görsel başkasınındır.
    || [...tum.matchAll(/\bcourtesy(?:\s+of)?\s*:?\s*(?:the\s+)?([^\s,;]+)/gi)].some((m) => !/^(NASA|JPL|U\.?S\.?)/i.test(m[1]));
  if (!d.center || NASA_TELIF.test(tum) || ucuncuTaraf) {
    return { lisans: "NASA — kullanım izni doğrulanamadı" };
  }
  return {
    // "Public domain" ile BAŞLAMALI: izin süzgeci (provenance.js) başa bakıyor.
    lisans: "Public domain (NASA media usage guidelines)",
    lisansUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
    restrictions: "NASA insignia/logos: no endorsement",
  };
}

async function searchNasa(query) {
  const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`;
  const data = await fetchJson(url);
  const items = data?.collection?.items || [];
  return items.slice(0, 16).map((it, i) => {
    const d = it.data?.[0] || {};
    const linkler = (it.links || []).filter((l) => l.href && /\.(jpe?g|png)$/i.test(l.href));
    // En büyük sürüm "canonical"; ama bazı orijinaller devasa olabiliyor,
    // 25 MB üstündeyse eldeki EN BÜYÜK öteki sürüme (alternate) düşülür —
    // eskiden doğrudan 640 px'lik önizlemeye düşülüyordu, tam ekranda bulanıktı.
    const sigar = (l) => !(l.size > 25e6);
    const buyuk = linkler.find((l) => l.rel === "canonical" && sigar(l))
      || linkler.filter((l) => l.rel === "alternate" && sigar(l)).sort((a, b) => (b.width || 0) - (a.width || 0))[0];
    const kucuk = linkler.find((l) => l.rel === "preview") || linkler[0];
    const sec = buyuk || kucuk;
    if (!sec) return null;
    const izin = nasaLisans(d);
    const kisi = duzMetin(d.photographer || d.secondary_creator, 60);
    return {
      provider: "nasa",
      type: "image",
      sira: i,
      metin: duzMetin([d.title, (d.keywords || []).join(" "), d.description].filter(Boolean).join(" "), 400),
      url: sec.href,
      thumb: (kucuk || sec).href,
      width: sec.width || 0,
      height: sec.height || 0,
      ...izin,
      lisans: duzMetin(izin.lisans, 200),
      sahip: duzMetin(d.center ? `NASA ${d.center}${kisi && !/^NASA\b/i.test(kisi) ? ` / ${kisi}` : ""}` : "NASA", 90),
      eser: duzMetin(d.title, 70),
      sayfa: d.nasa_id ? `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}` : "",
    };
  }).filter(Boolean);
}

// WIKIPEDIA MADDE GÖRSELİ — "anlatılan şeyin kendisi" için en doğrudan kaynak.
//
// NEDEN VAR. Diğer bütün kaynaklar KELİME arıyor: "Zemun Belgrade old
// photograph" yazınca dosya adında/etiketinde bu kelimeler geçen ne varsa
// geliyor, gerçekten Zemun olup olmadığına kimse bakmıyor. Wikipedia farklı
// çalışıyor: önce sorguyu bir MADDEYE bağlıyor, sonra o maddenin editörlerce
// seçilmiş görselini veriyor. Yani "Vezüv" dediğinde Vezüv'ün krateri,
// "Wardenclyffe" dediğinde Tesla'nın kulesi, "Petriç" dediğinde Petriç geliyor.
//
// Ölçüldü (2026-08-09): 9 konunun 9'unda madde görseli vardı ve hepsi doğru
// konuydu. Bu, kullanıcının asıl şikâyetinin tam karşılığı: "ne anlatılıyorsa
// ekranda o olsun."
//
// Dosya konumu yalnızca Commons metadata çözümlemesine yön verir:
//   upload.wikimedia.org/wikipedia/commons/...  -> gerçek lisans/yazar metadata ile doğrulanır
//   upload.wikimedia.org/wikipedia/en/...       -> yerel yükleme, çoğu ADİL KULLANIM (telifli)
// Baba Vanga bunun tipik örneği: Commons'ta yüzünün fotoğrafı YOK (yalnızca
// büstü, evi ve adını taşıyan bir bahçe pompası var), ama en.wikipedia'da
// telifli bir vesikalığı duruyor. İkisi ayrı işaretleniyor ki hangisinin
// izin kaydı doğrulanmayan görseller otomatik üretime alınmasın.
const WIKI_DIL = { tr: "tr", en: "en" };

/** Resolve a Commons file instead of inferring license/author from its host. */
export async function resolveCommonsImage(url, fetcher = fetchJson) {
  let parsed; try { parsed = new URL(url); } catch { return null; }
  if (parsed.hostname !== 'upload.wikimedia.org' || !parsed.pathname.startsWith('/wikipedia/commons/')) return null;
  const pieces = parsed.pathname.split('/');
  const filename = decodeURIComponent(pieces.includes('thumb') ? pieces[pieces.length-2] : pieces.at(-1));
  const api = 'https://commons.wikimedia.org/w/api.php?action=query&titles=' + encodeURIComponent('File:' + filename) + '&prop=imageinfo&iiprop=url|extmetadata&format=json&origin=*';
  try {
    const data = await fetcher(api);
    const page = Object.values(data?.query?.pages || {}).find(p => p.imageinfo?.[0]);
    if (!page) return null;
    const info = commonsMetadata(page.imageinfo[0], page.title);
    return info.permissionVerified ? info : null;
  } catch { return null; }
}

// SORGUDAN ARANACAK MADDE ADLARINI ÇIKAR.
//
// Wikipedia'nın tam metin araması bu iş için KULLANILAMAZ: sorgudaki bütün
// kelimeleri metnin herhangi bir yerinde arıyor. Ölçüldü — "Baba Vanga
// portrait photograph" araması "2020'lerde jenerik sonrası sahnesi olan
// filmler listesi" maddesini döndürdü. Doğrusu, sorgudaki ÖZEL ADI ayıklayıp
// başlık araması yapmak.
//
// Kademeli denenir, ilk sonuç veren kazanır:
//   "Nikola Tesla Wardenclyffe tower" -> "Nikola Tesla Wardenclyffe" (yok)
//                                     -> "Nikola Tesla" (var)
//   "Rupite Bulgaria landscape"       -> "Rupite Bulgaria" (yok)
//                                     -> "Rupite" (var)   <- ilk kelime daha özgül
//                                     -> "Bulgaria"       <- son çare, çok genel
const OZEL_AD_DESENI = /\b[A-Z][a-z']{2,}(?:\s+[A-Z][a-z']{2,})*/g;

export function wikiAramaTerimleri(query) {
  const gruplar = String(query || "").match(OZEL_AD_DESENI) || [];
  const t = [];
  if (gruplar.length > 1) t.push(gruplar.join(" "));
  for (const g of gruplar) {
    t.push(g);
    const w = g.split(/\s+/);
    // Kişi/kurum adları çoğu zaman İKİ kelimedir ve peşine bir yapı adı
    // yapışır: "Nikola Tesla Wardenclyffe" -> "Nikola Tesla" maddesi.
    if (w.length > 2) t.push(w.slice(0, 2).join(" "));
    // İlk kelime SON kelimeden önce denenir: "Rupite Bulgaria"da özgül olan
    // "Rupite"; "Bulgaria" ülkenin genel maddesine düşürür.
    if (w.length > 1) { t.push(w[0]); t.push(w[w.length - 1]); }
  }
  return [...new Set(t)].slice(0, 4); // en çok 4 deneme: Wikipedia'yı yormayalım
}

async function searchWikipedia(query, dil = "en") {
  const host = `https://${WIKI_DIL[dil] || "en"}.wikipedia.org`;
  // 1) Sorguyu maddeye bağla — başlık araması, tam metin DEĞİL.
  let basliklar = [];
  for (const terim of wikiAramaTerimleri(query)) {
    const j = await fetchJson(
      `${host}/w/api.php?action=opensearch&search=${encodeURIComponent(terim)}` +
      `&limit=3&namespace=0&format=json&origin=*`);
    basliklar = (j?.[1] || []).filter(Boolean);
    if (basliklar.length) break;
  }
  if (!basliklar.length) return [];

  // 2) Her maddenin KAPAK görselini al — editörlerce seçilmiş tek görsel.
  //    Madde gövdesindeki bütün görseller alınmıyor: onlar bayrak, konum
  //    haritası, kaynak ikonu gibi çöple dolu.
  //
  //    NEDEN REST ÖZET UCU, `prop=pageimages` DEĞİL. pageimages, TELİFLİ
  //    (adil kullanım) görselleri kasten atlıyor. Ölçüldü: "Baba Vanga"
  //    maddesi için pageimages bomboş dönüyor, oysa maddenin kapağında
  //    kadının gerçek fotoğrafı var (220x314, en.wikipedia yerel dosyası).
  //    Videonun eksiği tam olarak o fotoğraftı. REST özet ucu onu veriyor.
  const sayfalar = (await Promise.all(basliklar.slice(0, 3).map(async (t) => {
    try {
      const j = await fetchJson(`${host}/api/rest_v1/page/summary/${encodeURIComponent(String(t).replace(/ /g, "_"))}`);
      return j?.originalimage?.source ? { title: j.title || t, extract: j.extract, original: j.originalimage, thumbnail: j.thumbnail } : null;
    } catch { return null; }
  }))).filter(Boolean);

  const out = [];
  for (const p of sayfalar) {
    const org = p.original;
    if (!org?.source) continue;
    const temiz = String(org.source).split("?")[0];
    // Maddeye bağlı görsel için gevşek taban: 220x314'lük gerçek bir portre,
    // 3000 pikselik yanlış bir manzaradan iyidir. Şerit oranı yine elenir.
    if (!kucukAmaDogru(org.width, org.height)) continue;
    const permission = await resolveCommonsImage(temiz);
    if (!permission) { lisansElenen++; continue; }
    out.push({
      provider: "wikipedia",
      type: "image",
      sira: basliklar.indexOf(p.title),
      // Alaka ölçümü madde BAŞLIĞI + giriş paragrafı üzerinden yapılır.
      // Sağlayıcı etiketi değil, ansiklopedi metni — çok daha güvenilir.
      metin: duzMetin([p.title, p.extract].filter(Boolean).join(" "), 400),
      url: temiz,
      thumb: String(p.thumbnail?.source || temiz).split("?")[0],
      width: org.width || 0,
      height: org.height || 0,
      // Tam ekran için küçük kalan görsel: render bunu bulanık büyütülmüş
      // kendi kopyasının üstünde çerçeveli gösterir, pikselli görünmesin diye.
      kucuk: Math.min(org.width || 0, org.height || 0) < EN_AZ_KISA_KENAR,
      ...permission,
      wikiSerbest: true,
      articleUrl: `${host}/wiki/${encodeURIComponent(String(p.title).replace(/ /g, "_"))}`,
    });
  }
  return out.sort((a, b) => a.sira - b.sira);
}

// LIBRARY OF CONGRESS — ABD Kongre Kütüphanesi fotoğraf arşivi.
//
// NEDEN EKLENDİ. 20-30 dakikalık videoda ~180 sahne oluyor ve her sahne AYRI
// bir görsel istiyor. Mevcut kaynaklar 3 dakikalık videoda (27 sahne) bolluk
// veriyordu; uzun formatta havuzun kuruma riski var ve havuz kuruyunca sahne
// ya zayıf yedeğe ya düz tipografiye düşüyor.
//
// LoC anahtarsız, devasa ve belgesel için birebir: tarihî fotoğraf, gravür,
// harita, afiş. Ölçüldü — "skull anatomy" sorgusunda anatomi çizimleri döndü.
//
// ERİŞİM KISITI SÜZGECİ: arşivin bir bölümü kullanım kısıtlı. `access_restricted`
// işaretli kayıtlar alınmıyor.
async function searchLoc(query) {
  // İlk 403'ten sonra (Cloudflare engeli) oturum boyu sorulmaz — bkz. kapaliKaynak.
  if (kaynakKapaliMi("loc")) return [];
  const url =`https://www.loc.gov/photos/?q=${encodeURIComponent(query)}&fo=json&c=14`;
  const data = await fetchJson(url);
  const items = data?.results || [];
  return items
    .filter((r) => r && !r.access_restricted && Array.isArray(r.image_url) && r.image_url.length)
    .map((r, i) => {
      // image_url dizisi küçükten büyüğe sıralı; boyut parça (#h=417&w=640)
      // içinde geliyor. En büyük makul olanı seç.
      const olculu = r.image_url
        .map((u) => {
          const m = String(u).match(/#h=(\d+)&w=(\d+)/);
          return { url: String(u).split("#")[0], h: m ? +m[1] : 0, w: m ? +m[2] : 0 };
        })
        .filter((x) => /\.(jpe?g|png)$/i.test(x.url));
      if (!olculu.length) return null;
      const buyuk = olculu.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
      const kucuk = olculu.reduce((a, b) => (b.w && b.w < a.w ? b : a), buyuk);
      if (!boyutYeterli(buyuk.w, buyuk.h)) return null;
      return {
        provider: "loc",
        type: "image",
        sira: i,
        metin: duzMetin([r.title, (Array.isArray(r.description) ? r.description[0] : r.description),
          (r.subject || []).slice(0, 4).join(" ")].filter(Boolean).join(" "), 400),
        url: buyuk.url,
        thumb: kucuk.url || buyuk.url,
        width: buyuk.w,
        height: buyuk.h,
        // LoC kayıtlarının çoğu kamu malı ama arama sonucunda hak alanı
        // gelmiyor; künyede kaynak adı veriliyor, iddia edilmiyor.
        lisans: duzMetin((r.rights || []).join?.(" ") || r.rights || "Library of Congress — kullanım izni doğrulanamadı", 300),
        sahip: duzMetin((r.contributor || [])[0] || "Library of Congress", 70),
        eser: duzMetin(r.title, 70),
        sayfa: r.id || r.url || "",
      };
    })
    .filter(Boolean);
}

// MET MUSEUM OPEN ACCESS — ~500 bin eser, kamu malı olanlar CC0.
//
// NEDEN EKLENDİ. Nesne, eser, tarihî obje ve portre tarafında çok güçlü;
// belgeselde "dönemin nesnesi" gereken sahneleri besliyor. Anahtarsız.
//
// İKİ AŞAMALI: arama yalnızca nesne NUMARASI döndürüyor, görsel için her
// nesne ayrıca sorulmalı. Bu yüzden ilk N numara alınıp paralel çekiliyor.
// Ölçüldü: nesnelerin bir bölümü kamu malı DEĞİL ya da hiç görseli yok —
// ikisi de eleniyor, yoksa boş url videoya giriyor.
// Ölçüldü: çekilen 10 nesnenin yalnızca 1'i kamu malı VE görselli çıktı.
// Süzgeç sert olduğu için havuza anlamlı katkı vermesi adına daha fazla
// nesne çekiliyor. İstekler paralel, maliyeti yok (anahtarsız API).
const MET_ADET = 24;
async function searchMet(query) {
  const ara = await fetchJson(
    `https://collectionapi.metmuseum.org/public/collection/v1/search` +
    `?hasImages=true&q=${encodeURIComponent(query)}`);
  const idler = (ara?.objectIDs || []).slice(0, MET_ADET);
  if (!idler.length) return [];
  const sonuc = await mapLimit(idler, 5, async (id) =>
    await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`));
  return sonuc
    .filter((r) => r.ok)
    .map((r) => r.value)
    .filter((o) => o && o.isPublicDomain && o.primaryImageSmall)
    .map((o, i) => ({
      provider: "met",
      type: "image",
      sira: i,
      metin: duzMetin([o.title, o.objectName, o.culture, o.period, o.medium,
        (o.tags || []).map((t) => t.term).slice(0, 4).join(" ")].filter(Boolean).join(" "), 400),
      url: o.primaryImage || o.primaryImageSmall,
      thumb: o.primaryImageSmall,
      // Met ölçü vermiyor; boyut süzgecinden geçirilmiyor. Müze taramaları
      // zaten yüksek çözünürlüklü, kötü kadraj kalan görsel denetimine takılır.
      width: 0,
      height: 0,
      lisans: "CC0 (Met Museum Open Access)",
      lisansUrl:"https://creativecommons.org/publicdomain/zero/1.0/",
      sahip: duzMetin(o.artistDisplayName || "The Metropolitan Museum of Art", 70),
      eser: duzMetin(o.title, 70),
      sayfa: o.objectURL || "",
    }));
}

// Europeana — Avrupa müze/kütüphane/arşivleri. Tarihî konularda çok güçlü.
//
// LİSANS TUZAĞI: süzgeçsiz sorguda dönen 20 sonucun 17'si KULLANILAMAZ çıktı
// (12 tanesi "InC-EDU" = yalnızca eğitim amaçlı, 4 tanesi tam telifli, 1'i
// BY-NC-SA). `reusability=open` ile aynı sorguda 20/20 temiz geldi
// (kamu malı, CC0, CC BY). Bu yüzden süzgeç ZORUNLU — parametre değil.
async function searchEuropeana(query, key) {
  const url = `https://api.europeana.eu/record/v2/search.json?wskey=${encodeURIComponent(key)}` +
    `&query=${encodeURIComponent(query)}&rows=16&media=true&type=IMAGE&reusability=open&profile=rich`;
  const data = await fetchJson(url);
  if (!data?.success) return [];
  return (data.items || [])
    .filter((r) => r.edmIsShownBy?.[0])
    .map((r, i) => {
      const baslik = (r.title || [])[0] || (r.dcTitleLangAware?.en || [])[0] || "";
      const aciklama = (r.dcDescription || [])[0] || "";
      const yer = (r.edmPlaceLabel || []).map((x) => x?.def || x).filter((x) => typeof x === "string");
      return {
        provider: "europeana",
        type: "image",
        sira: i,
        metin: duzMetin([baslik, aciklama, yer.join(" "), (r.year || []).join(" ")]
          .filter(Boolean).join(" "), 400),
        url: r.edmIsShownBy[0],
        thumb: r.edmPreview?.[0] || r.edmIsShownBy[0],
        // Arama yanıtında boyut gelmiyor; puanlamada yalnızca küçük bir bonus
        // kaybı demek, eleme değil.
        width: 0,
        height: 0,
        lisans: europeanaLisans(r.rights?.[0]),
        lisansUrl:r.rights?.[0] || "",
        sahip: duzMetin((r.dcCreator || [])[0] || (r.dataProvider || [])[0], 70),
        eser: duzMetin(baslik, 70),
        sayfa: String(r.guid || "").split("?")[0] || "",
      };
    });
}

/** Europeana hak URI'sini künyenin anladığı kısa etikete çevirir. */
export function europeanaLisans(uri) {
  const u = String(uri || "");
  if (/publicdomain\/zero/i.test(u)) return "CC0";
  if (/publicdomain\/mark/i.test(u)) return "PDM";
  const m = u.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  // Tanınmayan hak beyanı: boş bırakmak yerine olduğu gibi taşınır ki
  // NC/ND süzgeci ve künye onu görebilsin.
  return duzMetin(u.replace(/^https?:\/\//, ""), 40);
}

// Unsplash: yüksek estetikli modern fotoğraf — atmosfer/kavram sahnelerinde
// Wikimedia'nın (belgesel/tarihi) tamamlayıcısı.
async function searchUnsplashPhotos(query, key) {
  const data = await fetchJson(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
    { headers: { Authorization: `Client-ID ${key}` } }
  );
  return (data?.results || []).map((r) => ({
    provider: "unsplash",
    type: "image",
    metin: [r.alt_description, r.description, (r.tags || []).map((x) => x.title).join(" ")].filter(Boolean).join(" "),
    url: r.urls?.full || r.urls?.regular,
    thumb: r.urls?.small,
    width: r.width, height: r.height,
    // Unsplash lisansı atıf ZORUNLU kılmıyor ama fotoğrafçı adını istiyor
    // (topluluk kuralı). Kaydediyoruz, künyede toplu satırda anılıyor.
    lisans: "Unsplash License",
    lisansUrl:"https://unsplash.com/license",
    sahip: duzMetin(r.user?.name, 70),
    eser: duzMetin(r.alt_description || r.description, 70),
    sayfa: r.links?.html || "",
  })).filter((x) => x.url);
}

async function searchPexelsPhotos(query, key) {
  const data = await fetchJson(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=12`, {
    headers: { Authorization: key },
  });
  return (data?.photos || []).map((p) => ({
    provider: "pexels",
    type: "image",
    metin: p.alt || "",
    // large2x ~1880px; bildirilen p.width 4000+ olabiliyor ve puanlama yanılıyordu.
    // Gerçekte inen boyutu bildir.
    url: p.src?.large2x || p.src?.original,
    thumb: p.src?.medium,
    width: Math.min(p.width || 1880, 1880), height: Math.min(p.height || 1250, 1250),
    lisans: "Pexels License",
    lisansUrl:"https://www.pexels.com/license/",
    sahip: duzMetin(p.photographer, 70),
    eser: duzMetin(p.alt, 70),
    sayfa: p.url || "",
  }));
}

async function searchPexelsVideos(query, key) {
  const data = await fetchJson(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=8`, {
    headers: { Authorization: key },
  });
  return (data?.videos || []).map((v) => {
    const files = (v.video_files || []).filter((f) => f.file_type === "video/mp4" && (f.height || 0) >= 700);
    files.sort((a, b) => Math.abs((a.height || 0) - 1080) - Math.abs((b.height || 0) - 1080));
    const f = files[0];
    if (!f) return null;
    return {
      provider: "pexels",
      type: "video",
      // Pexels video'da alt metin yok; sayfa URL'sinin slug'ı konu kelimelerini taşıyor
      // (…/video/lighthouse-at-dusk-12345/ → "lighthouse at dusk")
      metin: String(v.url || "").split("/").filter(Boolean).pop()?.replace(/[-_0-9]+/g, " ").trim() || "",
      url: f.link,
      thumb: v.image,
      width: f.width, height: f.height,
      duration: v.duration,
      lisans:"Pexels License", sahip:duzMetin(v.user?.name,2000), sayfa:v.url || "", lisansUrl:"https://www.pexels.com/license/",
    };
  }).filter(Boolean);
}

async function searchPixabayPhotos(query, key) {
  const data = await fetchJson(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&min_width=1000&per_page=16&safesearch=true`
  );
  return (data?.hits || []).map((h) => ({
    provider: "pixabay",
    type: "image",
    metin: h.tags || "",
    // largeImageURL 1280px ile sınırlı; h.imageWidth ORİJİNAL boyutu bildiriyor
    // (4000+) ve çözünürlük puanı şişiyordu.
    url: h.largeImageURL,
    thumb: h.webformatURL,
    width: Math.min(h.imageWidth || 1280, 1280), height: Math.min(h.imageHeight || 853, 853),
    lisans: "Pixabay Content License",
    lisansUrl:"https://pixabay.com/service/license-summary/",
    sahip: duzMetin(h.user, 70),
    eser: duzMetin(h.tags, 70),
    sayfa: h.pageURL || "",
  }));
}

async function searchPixabayVideos(query, key) {
  const data = await fetchJson(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(query)}&per_page=8&safesearch=true`);
  return (data?.hits || []).map((h) => {
    const v = h.videos?.large?.url ? h.videos.large : h.videos?.medium;
    if (!v?.url) return null;
    return {
      provider: "pixabay",
      type: "video",
      metin: h.tags || "",
      url: v.url,
      thumb: h.videos?.tiny?.thumbnail || "",
      width: v.width, height: v.height,
      duration: h.duration,
      lisans:"Pixabay Content License", sahip:duzMetin(h.user,2000), sayfa:h.pageURL || "", lisansUrl:"https://pixabay.com/service/license-summary/",
    };
  }).filter(Boolean);
}

// ---------- arama + sıralama ----------

/** Dosya adı/başlık gürültüsünü at, kelime kümesine çevir. */
function kelimeKumesi(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/^file:|\.(jpe?g|png|webp|tiff?|gif|svg|mp4|webm|ogv)$/gi, " ")
      .split(/[^a-z0-9çğıöşü]+/i)
      .filter((w) => w.length > 2)
  );
}

/**
 * Sorgu ile adayın başlığı/etiketleri arasındaki örtüşme (0..1).
 *
 * Bu olmadan sistem alakayı HİÇ ölçemiyordu: konuyla ilgisiz bir fotoğraf,
 * mükemmel eşleşenle aynı puanı alıyordu. Sağlayıcıların döndürdüğü metin
 * (Pexels alt, Pixabay tags, Unsplash alt_description, Wikimedia başlık,
 * Openverse title+tags) artık toplanıyor ve burada kullanılıyor.
 */
function metinOrtusme(query, metin, agirlik = null) {
  const q = kelimeKumesi(query);
  if (!q.size) return 0;
  const m = kelimeKumesi(metin);
  if (!m.size) return 0;
  let vurus = 0, toplamAgirlik = 0;
  for (const w of q) {
    const a = agirlik?.get(w) ?? 1;
    toplamAgirlik += a;
    if (m.has(w)) { vurus += a; continue; }
    // kök yakalama: "lighthouses" ↔ "lighthouse", "keeper" ↔ "keepers"
    for (const x of m) {
      if (w.length >= 5 && (x.startsWith(w.slice(0, 5)) || w.startsWith(x.slice(0, 5)))) { vurus += a * 0.6; break; }
    }
  }
  return toplamAgirlik ? Math.min(1, vurus / toplamAgirlik) : 0;
}

/**
 * NADİRLİK AĞIRLIĞI (IDF).
 *
 * Düz örtüşmede her kelime eşit sayılıyordu ve ayırt edici olmayan kelimeler
 * yanlış eşleşmeyi kurtarıyordu. Ölçülen vaka: "James Cameron Deepsea Challenger
 * submersible" sorgusuna Rolex'in "Deepsea Sea-Dweller 'James Cameron'" saati
 * %60 örtüşmeyle ilk sıraya geliyordu — çünkü "james", "cameron", "deepsea"
 * havuzda BOL, asıl ayırt edici kelime olan "submersible" ise o başlıkta YOK.
 *
 * Ağırlık havuzun kendisinden hesaplanır (dış veri gerekmez): bir kelime kaç
 * adayda geçiyorsa o kadar az ayırt edicidir.
 */
function nadirlikAgirligi(query, adaylar) {
  const q = kelimeKumesi(query);
  const agirlik = new Map();
  const n = Math.max(1, adaylar.length);
  for (const w of q) {
    let gecen = 0;
    for (const c of adaylar) if (kelimeKumesi(c.metin).has(w)) gecen++;
    // Hiç geçmeyen kelime = havuzda o konu yok; ayırt ediciliği en yüksek sayılır.
    agirlik.set(w, Math.log(1 + n / (1 + gecen)));
  }
  return agirlik;
}

/**
 * Adayı puanla.
 *
 * AĞIRLIK DENGESİ (2026-08-06'da ölçümle değiştirildi):
 * Eskiden site itibarı 100 puana kadar çıkıyor, metin örtüşmesi en fazla 45
 * veriyordu. Sonuç: "iyi sitede TAMAMEN alakasız görsel" her zaman "vasat sitede
 * tam isabet"i yeniyordu. 30 seçimin ~15'i yanlış içerikti — "James Cameron
 * Deepsea Challenger" sorgusuna Rolex kol saati, "HMS Challenger 1875" sorgusuna
 * HMS Warrior geldi. Artık ALAKA baskın sinyal, site itibarı ikincil.
 */
/** Stok fotoğraf siteleri: güzel ama jenerik. Belirli bir yeri/kişiyi bilmezler. */
export const STOK_SAGLAYICI = new Set(["pixabay", "pexels", "unsplash"]);

// Sorgular İngilizce üretiliyor ve özel adlar büyük harfle başlıyor. Ancak
// ilk kelime cümle başı olabileceği için değil, sorgular küçük harfle
// başladığı için ilk kelimeye de bakılır ("Strumica old town photograph").
// Millet/dil sıfatları (Bulgarian, Ottoman) tek başına özel ad SAYILMAZ:
// "old Bulgarian identity document" jenerik bir belgedir, stok sitesi
// makul bir eski belge verebilir. Ama "Strumica", "Zemun", "Vanga" öyle değil.
const SIFAT_SONU = /(ian|ean|ish|ese|an)$/;
const YAYGIN = new Set(["A", "An", "The", "Of", "In", "On", "At", "And", "Old", "New", "Saint", "St"]);

export function ozelAdIcerir(sorgu) {
  const kelimeler = String(sorgu || "").split(/[\s,\-]+/).filter(Boolean);
  return kelimeler.some((k) => {
    if (!/^[A-Z][a-z']{2,}$/.test(k)) return false;
    if (YAYGIN.has(k)) return false;
    return !SIFAT_SONU.test(k);
  });
}

function score(c, wantType, kind, query = "", agirlik = null) {
  let s = 0;
  const factual = kind === "person" || kind === "event" || kind === "place" || kind === "object";
  if (c.provider === "yerel") return 200 + (c.matchBonus || 0); // kendi kliplerin her zaman öncelikli

  // --- ALAKA: baskın sinyal ---
  const ort = metinOrtusme(query, c.metin, agirlik);
  s += ort * 100;
  // Metin VAR ama hiç örtüşmüyorsa bu alakasızlığın KANITIDIR. Ödülün yokluğu
  // yetmiyordu; ceza olmadan yüksek itibarlı siteler alakasız sonucu öne taşıyordu.
  if (c.metin && ort === 0) s -= 45;
  // Sağlayıcının KENDİ sıralaması da bir alaka sinyalidir — atmak israftı.
  s += Math.max(0, 16 - (c.sira || 0) * 1.8);

  // --- SİTE İTİBARI: ikincil (tavan 45) ---
  // Oranlar korunuyor, ölçek düşürüldü: hangi sitenin hangi sahnede daha iyi
  // olduğu hâlâ önemli ama artık alakayı EZEMİYOR.
  const itibar = factual
    ? (c.type === "video"
        ? { pexels: 35, pixabay: 32, wikimedia: 40, archive: 38 }[c.provider] || 18
        // NASA ve Europeana KURUM arşivi: olgusal sahnelerde stok sitelerinden
        // çok daha güvenilir. NASA bilim/yer bilimlerinde, Europeana tarihte.
        // Wikipedia en üstte: sorguyu kelimeye değil MADDEYE bağladığı için
        // olgusal sahnede (kişi/yer/olay/nesne) en isabetli kaynak odur.
        : { wikipedia: 50, wikimedia: 45, nasa: 42, loc: 41, europeana: 38, met: 34, openverse: 27, unsplash: 20, pexels: 18, pixabay: 16 }[c.provider] || 14)
    : (c.type === "video"
        ? { pexels: 45, pixabay: 41, wikimedia: 30, archive: 28 }[c.provider] || 22
        // Atmosfer/kavram sahnelerinde kurum arşivi daha zayıf: estetik değil
        // belgeleyici çekimler. Yine de openverse seviyesinde tutuluyor.
        : { unsplash: 40, pexels: 37, pixabay: 33, nasa: 30, openverse: 28, wikipedia: 26, loc: 24, europeana: 22, wikimedia: 20, met: 20 }[c.provider] || 18);
  s += itibar;

  // ÖZEL AD GEÇEN SORGUYA STOK SİTESİ CEVAP VEREMEZ.
  //
  // Ölçüldü (Baba Vanga videosu, 2026-08-09): videonun 27 sahnesinden 6'sı,
  // adı anılan BELİRLİ bir yeri anlatırken stok fotoğraf sitesinden gelen
  // rastgele bir kareyi gösteriyordu — "Strumica old town" için pixabay,
  // "Zemun Belgrade old photograph" için pixabay, "Petrich Bulgaria town"
  // için pexels, "Baba Vanga house museum Petrich" için pexels.
  //
  // Pixabay'de Zemun körler okulu yoktur, Petriç yoktur, o kadının evi
  // yoktur. Bu siteler sorguyu kabaca karşılayan "eski bir bina" döndürüyor,
  // metin örtüşmesi de bunu onaylıyordu — çünkü kelimeler tutuyor.
  //
  // Aynı işte ÖLÇÜLDÜ Kİ: özel ad geçen her sorguda arşiv adayı zaten vardı
  // (Strumica'da 17 tane). Yani kaynak eksikliği değil, sıralama sorunuydu.
  // Ceza yasak değil: arşiv tükenirse stok yine kullanılabilir.
  if (ozelAdIcerir(query) && STOK_SAGLAYICI.has(c.provider)) s -= 30;

  if (c.type === wantType) s += 25;
  // 1080p yeterli — 4K adayları ödüllendirmek indirmeyi gereksiz ağırlaştırıyor
  const ideal = c.type === "video" ? 1280 : 1920;
  s += (Math.min(c.width || 0, ideal) / ideal) * 15;
  if (c.type === "video" && (c.width || 0) > 2200) s -= 8;
  if (c.type === "video" && (c.duration || 0) >= 8) s += 5;
  return s;
}

/**
 * Örtüşmesi bu eşiğin altında kalan aday tamamen elenir.
 *
 * Havuzda kalması, "kendi sorgusunda aday kalmadı" durumunda geri gelmesine yol
 * açıyordu ve alakasız görsel yine ekrana düşüyordu. Metni OLMAYAN adaylar
 * (bazı Wikimedia videoları) elenmez — onlar hakkında bilgimiz yok, cezalandırmak
 * yerine puanlamaya bırakılır.
 */
const ALAKA_ESIGI = 0.25;

// Ticari kullanıma kapalı (NC) / türev yasak (ND) lisanslı kaç aday elendi.
// gatherCandidates sonunda log'a yazılır — sessiz eleme yapılmasın.
let lisansElenen = 0;

// Kaynak başına başarısız istek sayısı. Sessizce boş dönen bir kaynak, videonun
// tamamını stok fotoğrafa düşürebiliyor; gatherCandidates sonunda uyarılıyor.
const saglayiciHata = {};

/**
 * GEÇİCİ Mİ, KALICI MI? Yalnızca 408/429/5xx ve ağ hataları (bağlantı koptu,
 * zaman aşımı) "sonra yeniden dene" demektir. 4xx bir CEVAPTIR: o kaynak bu
 * sorguya görsel vermeyecek. Ayrım Sinematik Belgesel için hayati — orada
 * geçici hata "karar verilemedi, sonra yeniden ara" sayılıyor; LoC'nin her
 * sorguda döndürdüğü 403 bu yüzden her sahneyi "başarısız" yapıyordu.
 */
export function geciciSaglayiciHatasi(e) {
  const m = String(e?.message || e || "");
  const k = m.match(/\bHTTP (\d{3})\b/);
  if (k) return +k[1] === 408 || +k[1] === 429 || +k[1] >= 500;
  // 200 dönüp JSON yerine HTML veren sayfa: yeniden sormak aynı sayfayı getirir.
  if (e?.name === "SyntaxError") return false;
  return true;
}

/**
 * OTURUM BOYU KAPATILAN KAYNAKLAR.
 *
 * Ölçüldü: www.loc.gov/photos Nova'nın isteğine Cloudflare "Just a moment"
 * sayfasıyla HTTP 403 dönüyor — her sorguda. Her seferinde sormak hem zaman
 * kaybı hem de (eskiden) her sorguyu "kaynak hata verdi" diye işaretliyordu.
 * İlk 403'te kaynak bir süre kapatılır; kullanıcıya bir kez söylenir.
 */
const KAPALI_SURE_MS = 6 * 3600e3;
const kapaliKaynak = new Map(); // ad -> {bitis, neden}
function kaynakKapaliMi(ad) {
  const k = kapaliKaynak.get(ad);
  if (!k) return false;
  if (Date.now() < k.bitis) return true;
  kapaliKaynak.delete(ad);
  return false;
}
/** Şu an kapalı kaynaklar: [{ad, neden}] — çağıran log'a bir kez yazar. */
export function kapaliSaglayicilar() {
  return [...kapaliKaynak.keys()].filter(kaynakKapaliMi).map((ad) => ({ ad, neden: kapaliKaynak.get(ad).neden }));
}
/** Yalnızca testler için: kapatılan kaynakları sıfırla. */
export function _kapaliKaynaklariSifirla() { kapaliKaynak.clear(); }
const OTURUMDA_KAPANAN = { loc: /\bHTTP 403\b/ };

/** Tek sorgu için tüm kaynaklarda ara, sıralı aday listesi döndür. */
export async function searchQuery(query, wantType, kind, sadeceGorsel = false, videoFirsati = false, hataSay = null) {
  const st = getSettings();
  // hataSay ({n}): bu çağrıda kaç sağlayıcının GEÇİCİ hata verdiği. Sinematik Belgesel'in arşiv
  // adımı "hiç sonuç yok" ile "arşivler hata verdi"yi ayırmak için kullanır; kalıcı
  // 4xx cevabı "sonuç yok"tur, yoksa temiz bir "uygun fotoğraf yok" kararı hiç kaydedilmiyor.
  const sessiz = (p) => p.catch((e) => { if (hataSay && geciciSaglayiciHatasi(e)) hataSay.n++; return []; });
  // KAYNAK ÇÖKMESİ SESSİZ KALMASIN. Eskiden her çağrı `.catch(() => [])` ile
  // boş diziye düşüyordu; Wikimedia bir işin ortasında hız sınırı uygularsa
  // (ölçüldü: ard arda ~13 sorgudan sonra istekler reddedilmeye başlıyor)
  // en değerli arşiv kaynağı sessizce kayboluyor ve video stok fotoğrafla
  // doluyordu — kullanıcı sebebini asla göremiyordu. Artık sayılıyor.
  const kor = (ad, p) => p.catch((e) => {
    // Oturum boyu kapanan kaynak (LoC 403): hata değil, "bu kaynak yok" cevabı.
    if (OTURUMDA_KAPANAN[ad]?.test(String(e?.message || ""))) {
      kapaliKaynak.set(ad, { bitis: Date.now() + KAPALI_SURE_MS, neden: String(e.message).slice(0, 60) });
      return [];
    }
    saglayiciHata[ad] = (saglayiciHata[ad] || 0) + 1;
    if (hataSay && geciciSaglayiciHatasi(e)) hataSay.n++;
    return [];
  });
  const tasks = [
    kor("wikimedia", searchWikimedia(query)),
    kor("openverse", searchOpenverse(query)),
    // Wikipedia anahtar istemiyor. Sorguyu bir MADDEYE bağladığı için, adı
    // anılan bir kişi/yer/yapı istendiğinde tek isabetli kaynak çoğu zaman bu.
    kor("wikipedia", searchWikipedia(query)),
    // NASA anahtar istemiyor — her zaman sorulur, bilim konularında en iyi kaynak.
    kor("nasa", searchNasa(query)),
    // Anahtarsız iki büyük arşiv. UZUN VİDEO için eklendi: 20-30 dakikada ~180
    // sahne var ve her biri ayrı görsel istiyor; havuz kurumasın diye derinlik
    // şart. LoC tarihî fotoğrafta, Met nesne/eser tarafında güçlü.
    // (LoC kapalıysa searchLoc istek atmadan boş döner.)
    kor("loc", searchLoc(query)),
    kor("met", searchMet(query)),
  ];
  if (st.europeanaKey) tasks.push(kor("europeana", searchEuropeana(query, st.europeanaKey)));
  if (wantType === "video" || videoFirsati) {
    tasks.push(Promise.resolve(searchLocalAssets(query, wantType)));
    tasks.push(searchWikimediaVideos(query).catch(() => []));
    tasks.push(searchArchiveVideos(query).catch(() => []));
    tasks.push(searchMixkitVideos(query).catch(() => []));
  }
  if (st.unsplashKey) tasks.push(sessiz(searchUnsplashPhotos(query, st.unsplashKey)));
  if (st.pexelsKey) {
    tasks.push(sessiz(searchPexelsPhotos(query, st.pexelsKey)));
    tasks.push(sessiz(searchPexelsVideos(query, st.pexelsKey)));
  }
  if (st.pixabayKey) {
    tasks.push(sessiz(searchPixabayPhotos(query, st.pixabayKey)));
    tasks.push(sessiz(searchPixabayVideos(query, st.pixabayKey)));
  }
  // Her kaynağın KENDİ sıralaması korunur (sira = o kaynaktaki indeks). Sonra
  // hepsi tek havuzda karıştığı için bu bilgi kaybolurdu; alaka sinyali olarak
  // puanlamada kullanılıyor.
  const gruplar = await Promise.all(tasks);
  for (const g of gruplar) g.forEach((c, i) => { if (c) c.sira = i; });
  let all = gruplar.flat();
  // "Sadece görsel" modu: video adaylarını tamamen ele — yedek havuza bile girmesinler
  if (sadeceGorsel) all = all.filter((c) => c.type !== "video");
  // AYNI FOTOĞRAF TEK KEZ. Anahtar tam adres değil photoKey: Commons'un
  // "?utm_..." adresi, 2560px thumb'ı, Wikipedia'nın ve Openverse'ün sorgusuz
  // kopyası aynı dosyadır. Kopyalardan HANGİSİ kalır: izni doğrulanabilen,
  // sonra Wikipedia (madde metni alaka ölçümünü güçlendiriyor), sonra Commons
  // (tam künye), en son büyük olanı. İlk görülenin sırası korunur.
  const tercih = (c) => (permissionUsable(c) ? 1000 : 0) + ({ wikipedia: 300, wikimedia: 200 }[c.provider] || 100)
    + Math.min(99, ((c.width || 0) * (c.height || 0)) / 1e6);
  const seen = new Map(); // photoKey -> uniq içindeki sıra
  let uniq = [];
  for (const c of all) {
    if (!c.url) continue;
    const k = photoKey(c.url);
    const j = seen.get(k);
    if (j === undefined) { seen.set(k, uniq.length); uniq.push(c); continue; }
    if (tercih(c) > tercih(uniq[j])) uniq[j] = c;
  }
  // KULLANILAMAZ LİSANSLAR BAŞTAN ELENİR.
  //
  // CC "NC" (NonCommercial) ticari kullanımı yasaklıyor — para kazanan bir
  // YouTube videosu ticari kullanımdır. "ND" (NoDerivatives) türev eser
  // yasaklıyor; kırpmak, Ken Burns uygulamak, üstüne yazı basmak türev üretir.
  // İkisi de bu hatta girdiği anda ihlal doğuruyordu; künye yazmak ihlali
  // ortadan kaldırmaz, yalnızca belgeler. Ölçüldü (70 aday, 3 sorgu):
  // %11 NC, %1 ND — yani her sekiz adaydan biri yasal olarak kullanılamaz.
  // Kalan %87 zaten fazlasıyla yeterli.
  const kullanilamaz = /\bNC\b|\bND\b|NonCommercial|NoDeriv/i;
  const oncesi = uniq.length;
  uniq = uniq.filter((c) => permissionUsable(c));
  if (uniq.length < oncesi) {
    // Sessiz eleme yapılmaz; kaç aday neden düştüğü görünür olmalı.
    lisansElenen += oncesi - uniq.length;
  }

  // Nadirlik ağırlığı HAVUZUN KENDİSİNDEN hesaplanır — ayırt edici olmayan
  // (bol geçen) kelimeler yanlış eşleşmeyi kurtaramasın.
  const agirlik = nadirlikAgirligi(query, uniq);
  uniq.forEach((c, i) => {
    c.id = `${c.provider}-${i}-${Math.abs(hash(c.url)) % 100000}`;
    c.alaka = metinOrtusme(query, c.metin, agirlik);
    c.score = score(c, wantType, kind, query, agirlik);
  });
  // Metni OLAN ama sorguyla örtüşmeyen adayları TAMAMEN ele — havuzda kalınca
  // "kendi sorgusunda aday bitti" durumunda geri gelip ekrana düşüyorlardı.
  const alakali = uniq.filter((c) => !c.metin || c.alaka >= ALAKA_ESIGI);
  // HAM LİSTEYE DÖNÜLMEZ.
  //
  // Eskiden "4'ten az aday geçtiyse ham listeyi kullan" deniyordu ve gerçek bir
  // videoda 26 sorgunun 8'i (%31) bu yola düştü: Mariana Çukuru belgeselinde
  // kedi, termos ve oturma odası fotoğrafı ekrana geldi. Az sayıda ALAKALI aday
  // dönmek, çok sayıda alakasız aday dönmekten iyidir — beat'in kendi sorgusunda
  // aday biterse autoPick zaten DİĞER sorguların (alakalı) havuzundan seçiyor.
  //
  // Tamamen boş kalırsa sorgu için hiç aday üretmemek de yanlış olur; o durumda
  // en yüksek puanlı 2 aday bırakılır (hiç yoktan iyidir) ama eşiği geçmedikleri
  // işaretlenir ki yedek havuzda geri sıralara düşsünler.
  let havuzListe = alakali;
  if (!havuzListe.length) {
    havuzListe = [...uniq].sort((a, b) => b.score - a.score).slice(0, 2)
      .map((c) => ({ ...c, zayifAlaka: true, score: c.score - 40 }));
  }
  havuzListe.sort((a, b) => b.score - a.score);

  // --- ÇEŞİTLİLİK SIRALAMASI ---
  // Ham puan sıralaması listenin başını tek kaynağa (hatta tek fotoğrafçıya)
  // teslim edebiliyor; ölçüldü: "abandoned lighthouse" sorgusunda ilk 7 aday aynı
  // Openverse albümündendi ve sahneler birbirinin kopyası çıkardı. Açgözlü seçimde
  // zaten kullanılmış kaynak ve tekrar eden etiket imzası cezalandırılır.
  const secili = [];
  const kaynakSayac = new Map();
  const imzaSayac = new Map();
  const havuz = [...havuzListe];
  while (havuz.length && secili.length < 24) {
    let enIyi = 0, enIyiPuan = -Infinity;
    for (let i = 0; i < havuz.length; i++) {
      const c = havuz[i];
      // İlk iki kelime, aynı albüm/serinin kaba imzası
      const imza = [...kelimeKumesi(c.metin)].slice(0, 2).join("|");
      const p = c.score
        - (kaynakSayac.get(c.provider) || 0) * 16
        - (imza ? (imzaSayac.get(imza) || 0) * 11 : 0);
      if (p > enIyiPuan) { enIyiPuan = p; enIyi = i; }
    }
    const c = havuz.splice(enIyi, 1)[0];
    const imza = [...kelimeKumesi(c.metin)].slice(0, 2).join("|");
    kaynakSayac.set(c.provider, (kaynakSayac.get(c.provider) || 0) + 1);
    if (imza) imzaSayac.set(imza, (imzaSayac.get(imza) || 0) + 1);
    secili.push(c);
  }
  return secili;
}

function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

/** Segmentin görsel beat'lerini döndür (eski tek-görsel şemasıyla uyumlu). */
export function beatsOf(seg) {
  if (Array.isArray(seg.visuals) && seg.visuals.length) return seg.visuals;
  if (seg.visual) return [seg.visual];
  return [{ query: "abstract background", type: "video", kind: "generic" }];
}

/** Tüm beat'leri düz listeye aç: {segIndex, beatIndex, id, visual, seg}. */
export function flattenBeats(script) {
  const out = [];
  let si = 0;
  for (const sec of script.sections)
    for (const seg of sec.segments) {
      beatsOf(seg).forEach((visual, bi) => {
        out.push({ segIndex: si, beatIndex: bi, id: `s${si}b${bi}`, visual, seg });
      });
      si++;
    }
  return out;
}

/** İşteki tüm segmentler için adayları topla. */
/**
 * "Sadece görsel" modunda senaryo modelinin video istediği beat'ler de fotoğrafa
 * çevrilir. Tek yerde yapılır ki arama, seçim ve indirme aynı türü görsün.
 */
export function normalizeBeatTypes(job, script) {
  if (!['image','mixed','director'].includes(job?.mediaKind)) return;
  for (const sec of script.sections)
    for (const seg of sec.segments)
      for (const v of beatsOf(seg)) {
        if (job.mediaKind === 'image' || v.type === 'ai') v.type = 'image';
        if (job.mediaKind === 'image') { delete v.aiFill; delete v.aiCumle; delete v.aiSebep; delete v.prompt; }
      }
}

// ---------------------------------------------------------------------------
// SORGU KISALTMA
// ---------------------------------------------------------------------------
//
// Senaryo modeli insan gibi zengin sorgular yazıyor: "HMS Challenger 1875
// expedition", "Trieste bathyscaphe 1960 Piccard". Bunlar bir arşivciye
// anlamlı gelir ama arşiv arama motorları TÜM kelimeleri arıyor ve fazla
// daraltılmış sorgu boşa düşüyor. Ölçüldü (gerçek işin 26 sorgusu):
//
//   "HMS Challenger 1875 expedition"   ->  2 aday, 0 Wikimedia (Dodge Challenger arabası!)
//   "HMS Challenger expedition"        -> 24 aday, 9 Wikimedia (gerçek 1872 gravürleri)
//   "Trieste bathyscaphe 1960 Piccard" ->  6 aday   |  "Trieste bathyscaphe" -> 24 aday
//   "xenophyophore deep sea organism"  ->  2 aday, 0 Wikimedia  |  "xenophyophore" -> 10 aday, 5 Wikimedia
//
// Yani görsel "stokta yok" değildi, BULUNAMIYORDU. Wikimedia'da tam istenen kare
// duruyor: "Bathyscaphe Trieste with USS Lewis over the Marianas Trench, 1960".
//
// 26 sorguda ölçülen toplam kazanç: aday 299 -> 764, güvenilir kaynak 32 -> 191.
// 19 sorgu iyileşti, HİÇBİRİ bozulmadı.

/** Zayıf sayılan aday sayısı — bunun altında kısaltma denenir. */
const ZAYIF_ADAY = 8;
/**
 * Vekil sorgu eşiği: kurum kaynaklarındaki EN İYİ metin alakası bunun altında
 * kalırsa konu arşivde yok demektir, başka açıdan sorulur. Ölçülen iki küme
 * arasındaki boşluğun ortası (umutsuz ≤0,203 · çalışan ≥0,457).
 */
const VEKIL_ESIGI = 0.30;
/** Arşiv/kurum kaynakları: belgesel için asıl değerli olanlar. */
const GUVENILIR_SAGLAYICI = new Set(["wikipedia", "wikimedia", "openverse", "nasa", "europeana", "loc", "met"]);
const YIL_DESENI = /\b(1[5-9]\d{2}|20\d{2})\b/g;

/** Sorgunun giderek gevşeyen varyantları (en dar olandan en genişe). */
export function sorguVaryantlari(query) {
  const varyant = [];
  const yilsiz = String(query).replace(YIL_DESENI, "").replace(/\s+/g, " ").trim();
  if (yilsiz && yilsiz !== query) varyant.push(yilsiz);
  const kelime = yilsiz.split(/\s+/).filter(Boolean);
  // Baş iki kelime genelde ÖZEL ADI taşır ("HMS Challenger", "Trieste bathyscaphe"),
  // son iki kelime ise KONUYU ("deep sea organism"). İkisi de denenir.
  if (kelime.length > 2) varyant.push(kelime.slice(0, 2).join(" "));
  if (kelime.length > 3) varyant.push(kelime.slice(-2).join(" "));
  return [...new Set(varyant)].filter((v) => v.length > 2 && v !== query);
}

/** Bir beat'in sorgusunu ara; sonuç zayıfsa kısaltılmış varyantlarla genişlet. */
async function sorguVeYedekleri(v, sadeceGorsel, videoFirsati = false) {
  const guvenilirSayisi = (l) => l.filter((c) => GUVENILIR_SAGLAYICI.has(c.provider)).length;
  const liste = await searchQuery(v.query, v.type, v.kind, sadeceGorsel, videoFirsati);
  if (liste.length >= ZAYIF_ADAY && guvenilirSayisi(liste) > 0) return liste;

  const url = new Set(liste.map((c) => c.url));
  const ekle = async (q, vekilMi) => {
    const ek = await searchQuery(q, v.type, v.kind, sadeceGorsel, videoFirsati).catch(() => []);
    for (const c of ek) if (!url.has(c.url)) {
      url.add(c.url);
      // Vekilden gelen aday BAŞKA BİR ŞEYİ gösteriyor (kişinin evi, kasabası).
      // Asıl sorguyla metin örtüşmesi düşük çıkacağı için hangi sorgudan
      // geldiği işaretleniyor; alaka o sorguya göre ölçülür.
      if (vekilMi) { c.vekilSorgu = q; c.vekil = true; }
      liste.push(c);
    }
  };

  // 1) Sorguyu KISALT — aynı şeyi daha geniş sor.
  for (const kq of sorguVaryantlari(v.query)) {
    await ekle(kq, false);
    if (liste.length >= 12 && guvenilirSayisi(liste) > 0) break;
  }

  // 2) Hâlâ zayıfsa VEKİL sorgular — aynı şeyi değil, BAŞKA BİR AÇIYI sor.
  //
  // Kısaltma yalnızca sorgu fazla DAR olduğunda işe yarıyor. Konunun kendisi
  // arşivde yoksa hiçbir kısaltma bulamıyor.
  //
  // KAPI NİCELİK DEĞİL ALAKA. Önce "aday sayısı azsa" diye bakılıyordu ve
  // hiç çalışmıyordu: "Bulgarian mystic blind woman 1970s" 31 aday getiriyor,
  // 17'si kurum kaynaklı — sayıca bol görünüyor ama hepsi alakasız (gözü bağlı
  // modeller, sisli kadın fotoğrafları). Ölçülen en iyi kurum alakası:
  //
  //   UMUTSUZ    Bulgarian mystic blind woman 1970s   0,183
  //   UMUTSUZ    Baba Vanga portrait photograph       0,203
  //   ÇALIŞAN    Baba Vanga house Rupite              0,457
  //   ÇALIŞAN    Rupite Bulgaria village              0,463
  //   ÇALIŞAN    volcanic eruption lava               1,000
  //   ÇALIŞAN    Leidenfrost portrait                 1,000
  //
  // İki küme arasında 0,203-0,457 boşluğu var; eşik ortasına konuyor.
  const enIyiKurumAlaka = (l, ag) => l.reduce((m, c) =>
    GUVENILIR_SAGLAYICI.has(c.provider) && !c.vekil
      ? Math.max(m, metinOrtusme(v.query, c.metin, ag)) : m, 0);

  let agirlik = nadirlikAgirligi(v.query, liste);
  if ((v.vekil || []).length && enIyiKurumAlaka(liste, agirlik) < VEKIL_ESIGI) {
    for (const vq of v.vekil) await ekle(vq, true);
    // Havuz büyüdü; nadirlik ağırlıkları yeniden hesaplanmalı.
    agirlik = nadirlikAgirligi(v.query, liste);
  }

  // Varyantlardan gelen adayların alaka/puanı KISA sorguya göre hesaplanmıştı;
  // TAM sorguya göre yeniden hesapla, yoksa sıralama yanıltır.
  for (const c of liste) {
    // Vekil adayının alakası KENDİ sorgusuna göre ölçülür — asıl sorguya göre
    // ölçülseydi sıfıra yakın çıkar ve denetim onu haksız yere elerdi.
    const olcut = c.vekil && c.vekilSorgu ? c.vekilSorgu : v.query;
    c.alaka = metinOrtusme(olcut, c.metin, c.vekil ? null : agirlik);
    c.score = score(c, v.type, v.kind, olcut, c.vekil ? null : agirlik);
    // Vekil bir ödün: asıl konuyu göstermiyor. Eşit puanda asıl sorgunun
    // adayı önde olsun diye küçük bir ceza uygulanır.
    if (c.vekil) c.score -= 12;
  }
  return ayniCekimiKatla(liste.sort((a, b) => b.score - a.score));
}

/**
 * AYNI ÇEKİMİN KOPYALARINI VE VARYANTLARINI KATLA.
 *
 * İki ayrı israf vardı, ikisi de ölçüldü (Baba Vanga videosu, 2026-08-09,
 * "Baba Vanga portrait photograph" sorgusu, 32 aday):
 *
 *   1. AYNI DOSYA, FARKLI SAĞLAYICI. Openverse Wikimedia'yı da tarıyor, yani
 *      tek bir fotoğraf listeye iki kez giriyor ("Vanga's-Grave-Rupite.JPG"
 *      hem 0. hem 9. sırada). Bir de Wikimedia'nın 3840px önekli ölçek
 *      sürümleri var.
 *   2. AYNI ÇEKİMİN VARYANTLARI. Aynı fotoğrafçının aynı nesneyi arka arkaya
 *      çektiği kareler ayrı dosya olarak duruyor: "Pump of Baba Vanga - Novo
 *      Selo (2)(3)(4)(5)". Dördü de bir BAHÇE POMPASI. İlk 21 adayın 7'sini
 *      tek başına bu pompa kaplamıştı.
 *
 * Bu ikisi listenin başını tıkıyor: kadının serbest lisanslı tek fotoğrafı
 * 18. sıraya düşmüştü. Katlayınca 9. sıraya çıkıyor — görsel denetiminin
 * eriştiği aralığa. Sıra korunur, her aileden en yüksek puanlı olan kalır.
 */
export function ailekimligi(url) {
  let b = String(url || "").split("?")[0].split("/").pop() || "";
  try { b = decodeURIComponent(b); } catch {}
  b = b.replace(/^\d+px-/, "")            // Wikimedia ölçek öneki
       .replace(/\.[a-z0-9]{2,4}$/i, "")  // uzantı
       .replace(/[ _-]*[(\[]\s*\d+\s*[)\]]\s*$/, "") // "... (3)"
       .replace(/[ _-]+\d{1,3}$/, "");    // "..._03"
  return b.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function ayniCekimiKatla(liste) {
  const gorulen = new Set();
  return liste.filter((c) => {
    const k = ailekimligi(c.url);
    if (!k) return true; // kimliği çıkarılamayan aday elenmez
    if (gorulen.has(k)) return false;
    gorulen.add(k);
    return true;
  });
}

export async function gatherCandidates(job, script, logFn, isCancelled) {
  normalizeBeatTypes(job, script);
  const queries = new Map(); // key -> {query, type, kind}
  for (const sec of script.sections)
    for (const seg of sec.segments)
      for (const v of beatsOf(seg)) {
        const key = `${v.query}||${v.type}`;
        if (!queries.has(key)) queries.set(key, v);
      }
  const list = [...queries.entries()];
  logFn(`${list.length} farklı sorgu için medya aranıyor...`);
  const results = {};
  let done = 0;
  await mapLimit(list, 4, async ([key, v]) => {
    if (isCancelled()) throw new Error("cancelled");
    results[key] = await sorguVeYedekleri(v, job?.mediaKind === "image", shouldSearchVideo(job,v));
    done++;
    if (done % 5 === 0 || done === list.length) logFn(`Medya arama: ${done}/${list.length} sorgu tamamlandı`);
  });
  const toplam = Object.values(results).reduce((a, l) => a + l.length, 0);
  const videolar = Object.values(results).reduce((a,l)=>a+l.filter(c=>c.type==='video').length,0);
  const arsiv = Object.values(results).reduce((a, l) => a + l.filter((c) => GUVENILIR_SAGLAYICI.has(c.provider)).length, 0);
  logFn(`${toplam} aday bulundu, ${arsiv} tanesi arşiv/kurum kaynaklı (Wikimedia, NASA, Europeana, Openverse).`);
  if(job?.mediaKind!=='image')logFn(`${videolar} hareketli aday bulundu; yalnızca alaka eşiğini geçenler fotoğrafın önüne alınabilir.`);
  if (lisansElenen) logFn(`${lisansElenen} aday kullanım izni doğrulanamadığı veya ticari kullanıma kapalı (NC/ND) olduğu için elendi.`);
  const hatali = Object.entries(saglayiciHata).filter(([, n]) => n > 0);
  if (hatali.length) {
    logFn("UYARI: " + hatali.map(([ad, n]) => `${ad} ${n} sorguda yanıt vermedi`).join(", ") +
      " — o sorgularda bu kaynağın görselleri havuza girmedi.");
  }
  for (const k of kapaliSaglayicilar()) logFn(`UYARI: ${k.ad} erişimi reddetti (${k.neden}); bu oturumda o kaynak atlanıyor.`);
  lisansElenen = 0;
  for (const k of Object.keys(saglayiciHata)) delete saglayiciHata[k];
  return results;
}

export function candidateKey(visual) { return `${visual.query}||${visual.type}`; }

/**
 * Bir sorgu ile bir adayın metni arasındaki alaka (0..1) — DIŞARI AÇIK.
 *
 * render.js kenardaki kesiği seçerken alakayı ölçebilsin diye açıldı. Önceden
 * ölçemiyordu: kesik salt döndürme indeksiyle seçiliyordu (havuz[(i+1)%n]) ve
 * gerçek videoda "Japon robot Kaikō" anlatılırken köşede bir KEDİ, "James
 * Cameron dibe ulaştı" derken tansiyon aleti duruyordu.
 *
 * DİL NOTU: karşılaştırma İNGİLİZCE sorgu ↔ İNGİLİZCE başlık ekseninde yapılır.
 * Türkçe sahne metniyle karşılaştırmak işe yaramaz — ölçüldü: senaryonun 298
 * Türkçe sözcüğü ile 1459 İngilizce başlık sözcüğünün kesişimi yalnızca 15 ve
 * hepsi özel ad. O eksende her şey 0 çıkar.
 *
 * @param havuz Nadirlik (IDF) ağırlığı bu havuzdan hesaplanır. Verilmezse
 *              düz örtüşme kullanılır.
 */
export function alakaPuani(query, metin, havuz = null) {
  const agirlik = havuz && havuz.length ? nadirlikAgirligi(query, havuz) : null;
  return metinOrtusme(query, metin, agirlik);
}

/**
 * Yedek kolun (başka sorguların adayları) geçmesi gereken en düşük alaka.
 * ALAKA_ESIGI'nden gevşek: yedek zaten son çare, ama SIFIR alakalı görsel
 * hiçbir koşulda ekrana çıkmamalı. Ölçüm: yedek havuzun bir beat'e sunduğu
 * ilk adayların 81'de 79'u (%98) tam sıfır örtüşmeli.
 */
const YEDEK_ESIGI = 0.18;

/**
 * Bir sorgu hiç sonuç vermezse, işin TÜM adaylarından oluşan yedek havuza düş.
 * (Spesifik sorgular sık sık boş döner — özellikle video. Yedek havuz olmadan
 * o kesmeler boş kart olarak kalıyor.)
 */
function fallbackPool(candidates) {
  const all = [];
  const seen = new Set();
  for (const list of Object.values(candidates)) {
    for (const c of list) {
      if (seen.has(c.url)) continue;
      seen.add(c.url);
      all.push(c);
    }
  }
  return all;
}

/** İstenen tipe uyanı öne al, sonra kalanlar. */
function preferType(list, wantType) {
  return [...list.filter((c) => c.type === wantType), ...list.filter((c) => c.type !== wantType)];
}

/** Otomatik seçim: her beat'e en iyi, daha önce kullanılmamış adayı ata. */
export function autoPick(script, candidates, job = {}) {
  const used = new Set();
  const picks = {}; // beatId -> candidate id
  const pool = fallbackPool(candidates);
  for (const b of flattenBeats(script)) {
    const own = preferRelevantVideo(candidates[candidateKey(b.visual)] || [],job,b.visual);
    let chosen = own.find((c) => !used.has(c.url));
    if (!chosen) {
      // Kendi sorgusunda kullanılmamış aday kalmadı → yedek havuz. Burada da
      // alaka ölçülmüyordu: havuz keşif sırasına göre düz birleştirildiği için
      // her düşen beat ilk sorgunun görselini kapıyordu. Artık kendi sorgusuna
      // göre puanlanıp sıralanıyor, eşiği geçemeyen aday hiç önerilmiyor.
      const alt = preferRelevantVideo(preferType(pool, b.visual.type),job,b.visual).filter((c) => !used.has(c.url));
      const ag = nadirlikAgirligi(b.visual.query, alt);
      const puanli = alt
        .map((c) => ({ c, a: metinOrtusme(b.visual.query, c.metin, ag) }))
        .filter((x) => x.a >= YEDEK_ESIGI)
        .sort((x, y) => y.a - x.a);
      chosen = puanli[0]?.c || own[0] || null;
    }
    if (chosen) used.add(chosen.url);
    picks[b.id] = chosen ? chosen.id : null;
  }
  return picks;
}

// ---------- "gerektiğinde AI": stok boşluklarını doldur ----------

/** Bu puanın altındaki en iyi aday "zayıf" sayılır (bkz. score()). */
const ZAYIF_ESIK = 62;

/**
 * Stok araması hangi kesmelerde çuvalladı?
 *
 * Fikir: AI'yı körlemesine değil, ARŞİV YETMEDİĞİNDE kullan. Üç sinyal var:
 *   1) sorgu hiç sonuç vermedi          → kesme yedek havuza/karta düşecek
 *   2) en iyi aday puanı eşiğin altında → alakasız stok görsel gelecek
 *   3) sorgu sadece yanlış türde döndü  → video istendi, sadece fotoğraf var
 *
 * @returns kötüden iyiye sıralı [{ beat, puan, sebep }]
 */
export function stockGaps(script, candidates) {
  const out = [];
  for (const b of flattenBeats(script)) {
    if (b.visual?.type === "ai") continue;          // zaten AI'ya işaretli
    const liste = candidates[candidateKey(b.visual)] || [];
    if (!liste.length) { out.push({ beat: b, puan: 0, sebep: "arşivde sonuç yok" }); continue; }
    const enIyi = liste[0]?.score || 0;
    const dogruTur = liste.some((c) => c.type === b.visual.type);
    if (!dogruTur) {
      // Yanlış tür tek başına kusur değil: video istenip GÜZEL bir fotoğraf
      // gelmişse Ken Burns ile gayet iş görür, para harcamaya gerek yok.
      // Hafif ceza uygulanır, karar yine eşiğe bırakılır.
      const puan = enIyi * 0.85;
      if (puan < ZAYIF_ESIK) out.push({ beat: b, puan, sebep: `${b.visual.type} bulunamadı` });
      continue;
    }
    if (enIyi < ZAYIF_ESIK) out.push({ beat: b, puan: enIyi, sebep: `zayıf eşleşme (${Math.round(enIyi)})` });
  }
  return out.sort((a, b) => a.puan - b.puan);
}

/**
 * Zayıf kesmeleri bütçe dahilinde AI'ya terfi ettirir (script'i yerinde değiştirir).
 * Terfi edenler generateAiClips tarafından üretilir; üretim başarısız olursa
 * indirme adımı yine stok adaylarına düşer — akış kırılmaz.
 *
 * @returns terfi eden kesme sayısı
 */
export function promoteGapsToAi(script, candidates, butce, logFn) {
  if (!(butce > 0)) return 0;
  const bosluk = stockGaps(script, candidates).slice(0, butce);
  if (!bosluk.length) { logFn("Arşiv tüm sahneleri karşıladı — AI'ya gerek kalmadı."); return 0; }
  for (const { beat, sebep } of bosluk) {
    // Tür DEĞİŞTİRİLMİYOR — "ai" yapılsaydı candidateKey artık eşleşmez ve AI
    // üretimi patladığında kesme kendi stok adaylarına düşemezdi. Ayrı bayrak
    // hem üretimi tetikliyor hem yedek yolu açık bırakıyor.
    beat.visual.aiFill = true;
    // ANLATILAN CÜMLE SAKLANIYOR — istemi asıl bundan kuracağız.
    //
    // Eskiden burada "<sorgu>. Context: <cümle>" yazılıyordu ve arama terimi
    // konu yerine geçtiği için görsel modeli sembol üretiyordu (ölçüldü: AI
    // %8 tam isabet, sistemdeki en kötü kaynak — bkz. aiistem.js).
    // Artık cümle başa alınıyor; asıl tarifi sahneIstemleriniYaz() modele
    // yazdırıyor, buradaki kurallı istem yalnızca o çağrı patlarsa devrede.
    beat.visual.aiCumle = (beat.seg?.text || "").replace(/\s+/g, " ").slice(0, 240);
    beat.visual.prompt = kuralliIstem(beat.visual.aiCumle, beat.visual.query);
    beat.visual.aiSebep = sebep;
  }
  logFn(`Arşivin yetmediği ${bosluk.length} sahne AI ile üretilecek (${bosluk.slice(0, 3).map((x) => x.sebep).join(", ")}${bosluk.length > 3 ? ", ..." : ""}).`);
  return bosluk.length;
}

/** Seçilen adayları indir; başarısız olursa sıradaki adaya düş. */
export async function downloadPicked(job, script, candidates, picks, mediaDir, logFn, isCancelled, killer, { cached = {}, manualChoices = {}, onResult = () => {} } = {}) {
  fs.mkdirSync(mediaDir, { recursive: true });
  const st = getJobSettings(job);

  // Tek bütçe yalnızca Normal ve AI görselli modlarında etkin.
  // Sadece görsel modunda eski kayıtlardaki bütçe de uygulanmaz.
  const aiToplamButce = aiAllowance(job);
  if (aiToplamButce > 0) {
    // Planlanan sahneler toplam bütçeden düşülür; kalanı arşiv boşluklarına ayrılır.
    const isaretli = flattenBeats(script).filter((b) => b.visual?.type === "ai" || b.visual?.aiFill).length;
    const kalan = Math.max(0, aiToplamButce - isaretli);
    if (kalan > 0) promoteGapsToAi(script, candidates, kalan, logFn);
    else logFn(`AI bütçesinin tamamı (${isaretli}) senaryonun planladığı sahnelere ayrıldı.`);
  }

  const beats = flattenBeats(script);
  const cachedOk = (id) => cached[id] && (cached[id].type === "card" || (cached[id].file && fs.existsSync(cached[id].file)));

  // AI sahneleri önce üret (yavaş ve ücretli — sıralı, bütçeli)
  let aiClips = {};
  // Planlanan ve kurtarılan sahneler aynı toplam sınıra tabidir.
  const aiButce = aiToplamButce;
  if (aiButce > 0) {
    // İSTEMLERİ ÜRETİMDEN ÖNCE MODELE YAZDIR.
    //
    // Yalnızca arşiv yetmediği için terfi edenlere (aiFill) uygulanır:
    // senaryo modelinin bilerek "ai" işaretlediği sahnelerin istemini zaten
    // o yazmıştır, üstüne yazmak bilgi kaybı olur. Ölçülen kusur da tam
    // buradaydı — terfi edenlerin istemi arama sorgusundan kuruluyordu.
    try {
      const yazilacak = beats.filter((b) => !cachedOk(b.id) && b.visual?.aiFill && b.visual?.aiCumle);
      if (yazilacak.length) {
        const istemler = await sahneIstemleri(
          yazilacak.map((b) => ({ id: b.id, cumle: b.visual.aiCumle, sorgu: b.visual.query })),
          { usage: job.usage, logFn });
        for (const b of yazilacak) if (istemler[b.id]) b.visual.prompt = istemler[b.id];
      }
    } catch (e) {
      // İstem yazımı işi durdurmaz: kurallı istem zaten yerinde duruyor.
      logFn(`AI sahne tarifi adımı atlandı: ${String(e.message).slice(0, 110)}`);
    }
    try {
      aiClips = await generateAiClips(beats.filter(b => !cachedOk(b.id)), Math.max(0, aiButce - Object.values(cached).filter(m => m.provider === "ai").length), mediaDir, logFn, isCancelled, killer, { onResult, settings:st });
    } catch (e) {
      if (isCancelled()) throw e;
      logFn(`AI video adımı atlandı: ${String(e.message).slice(0, 160)}`);
    }
  }

  logFn(`${beats.length - Object.keys(aiClips).length} görsel indiriliyor...`);
  let done = 0;
  // Aynı URL birden çok kesmede kullanılabilir — bir kez indir, dosyayı paylaş.
  // (Aksi halde aynı dosyaya paralel istekler kaynak sunucudan blok yiyor.)
  const byUrl = new Map(); // url -> Promise<{file,type,provider,duration}>
  // İŞ BOYUNCA KULLANILAN URL'ler. byUrl önbelleği indirmeyi hızlandırıyor ama
  // aynı görselin iki farklı sahneye düşmesine de izin veriyordu (gerçek videoda
  // iki tam kopya görüldü). Kullanılmamış aday varken kopya seçilmez.
  const kullanilan = new Set();
  const pool = fallbackPool(candidates);
  const results = await mapLimit(beats, 5, async (b) => {
    const produce = async () => {
    if (cachedOk(b.id)) return cached[b.id];
    if (isCancelled()) throw new Error("cancelled");
    // SORGU AI KAYDINA DA YAZILIR. Ölçüldü (20260815-07e514): 13 AI görselin
    // 13'ünde de sorgu alanı boştu; hangi sahne için üretildiği kayboluyordu.
    // Denetim bu alanı okuyor (gorseldenetim.js: sorgular[beatId] || m.sorgu)
    // ve boş kalınca AI görselleri yalnızca cümleye göre puanlanıyordu.
    if (aiClips[b.id]) return {
      beatId: b.id, ...aiClips[b.id],
      sorgu: b.visual?.query || "", anaSorgu: b.visual?.query || "",
    };
    const cands = candidates[candidateKey(b.visual)] || [];
    const pickedId = picks[b.id];
    // Seçilen aday → kendi sorgusunun kalanı → yedek havuz (sorgu boş dönmüşse tek çare)
    const byId = new Map(pool.map((c) => [c.id, c]));
    const picked = byId.get(pickedId);
    // YEDEK KOL — ALAKA SÜZGECİ.
    //
    // Burada eskiden `preferType(pool, ...)` doğrudan ekleniyordu: beat'in kendi
    // sorgusu tükendiğinde İŞİN TÜM ADAYLARINA düşülüyor ve alaka hiç ölçülmüyordu.
    // Ölçüldü (12 gerçek iş, 354 beat): 47 beat'te (%13,3) seçilen aday inmedi ve
    // ekrana bambaşka bir görsel geldi. "Deepsea Challenger submersible 2012"
    // sorgusuna Rus marka bahçe dalgıç POMPASI (KITTORY logolu) tam ekran çıktı;
    // "tectonic plate subduction diagram" şeması yerine İzlanda turist manzarası.
    // Yedek havuzun sunduğu ilk adayların 81'de 79'u (%98) SIFIR örtüşmeliydi.
    //
    // Artık yedek adaylar da beat'in KENDİ sorgusuna göre puanlanıp sıralanıyor,
    // eşiği geçemeyen eleniyor. Hiçbiri geçemezse metin kartına düşülür —
    // alakasız görselden boş kart yeğdir.
    const disaridan = preferType(pool, b.visual.type)
      .filter((c) => c.id !== pickedId && !cands.some((x) => x.id === c.id));
    const yedekAgirlik = nadirlikAgirligi(b.visual.query, disaridan);
    const yedek = disaridan
      .map((c) => ({ c, a: metinOrtusme(b.visual.query, c.metin, yedekAgirlik) }))
      .filter((x) => x.a >= YEDEK_ESIGI)
      .sort((x, y) => y.a - x.a)
      .map((x) => x.c);
    const ordered = approvedCandidateOrder([
      ...(picked ? [picked] : []),
      ...cands.filter((c) => c.id !== pickedId),
      ...yedek,
    ].filter(c => permissionUsable(c) && (job.mediaKind !== 'image' || c.type === 'image')),pickedId,job.mediaKind==='director'?manualChoices[b.id]:null);
    // Kullanılmamış adayları öne al; hepsi kullanılmışsa mecburen paylaş
    const taze = ordered.filter((c) => !kullanilan.has(c.url));
    const sirali = taze.length ? [...taze, ...ordered.filter((c) => kullanilan.has(c.url))] : ordered;
    // KÖKEN: ekrana ÇIKAN adayın kimliği. Eskiden yalnızca {file,type,provider}
    // saklanıyordu; hangi sorgudan geldiği ve ne kadar alakalı olduğu kaybolduğu
    // için render aşamasında alaka ölçmek YAPISAL OLARAK imkânsızdı. Ayrıca
    // seçilen aday inmediğinde ekrandaki görselin ne olduğu hiçbir yerde iz
    // bırakmıyordu (12 işte 47 vaka).
    const kokenAgirlik = nadirlikAgirligi(b.visual.query, [...cands, ...disaridan]);
    const koken = (c) => ({
      // VEKİL ADAY başka bir şeyi gösteriyor (kişinin evi, kasabası). Kaydedilen
      // sorgu da o olmalı: hem denetim doğru soruyu sorabilsin hem seçim
      // ekranında kullanıcı neden bu görselin geldiğini anlasın.
      sorgu: c.vekil && c.vekilSorgu ? c.vekilSorgu : b.visual.query,
      anaSorgu: b.visual.query,
      vekil: !!c.vekil,
      metin: c.metin || "",
      adayId: c.id,
      alaka: +metinOrtusme(c.vekil && c.vekilSorgu ? c.vekilSorgu : b.visual.query,
        c.metin, c.vekil ? null : kokenAgirlik).toFixed(3),
      yedek: !cands.some((x) => x.id === c.id),   // kendi sorgusundan mı, yedekten mi
      // LİSANS/ATIF. Wikimedia ve Openverse'teki eserlerin çoğu CC-BY —
      // kullanmak serbest ama ESER SAHİBİNİN ADI yazılmak zorunda. Bu alanlar
      // kaydedilmiyordu, dolayısıyla künye üretilemiyor ve yayınlanan video
      // telif şikâyetine açık kalıyordu (bkz. kunye.js).
      ...selectedProvenance(c),
      lisans: c.lisans || "",
      sahip: c.sahip || "",
      eser: c.eser || "",
      sayfa: c.sayfa || "",
      // AYNI FOTOĞRAFIN KİMLİĞİ — sıradan bağımsız.
      //
      // adayId içinde adayın LİSTE SIRASI var (`wikipedia-4-70861`). Aynı
      // fotoğraf başka bir sorgudan gelince sıra değişiyor (`wikipedia-0-70861`)
      // ve tekrar koruması onları iki AYRI görsel sanıyor. Ölçüldü: Baba Vanga
      // videosunda kadının tek fotoğrafı DÖRT sahnede birden çıktı, üçü arka
      // arkaya. Bu alan dosyanın kendisinden türer, sorgudan bağımsızdır.
      kaynakId: ailekimligi(c.url),
      // Tam ekran için küçük kalan görsel (ör. Wikipedia madde kapağı,
      // 220x314). Render bunu ham büyütmez; bulanık perdeye oturtur.
      kucuk: !!c.kucuk,
    });
    for (const c of sirali.slice(0, 8)) {
      try {
        // Bu URL daha önce (veya şu an paralelde) indirildiyse aynı dosyayı kullan
        if (byUrl.has(c.url)) {
          const shared = await byUrl.get(c.url);
          if (shared?.file) return { beatId: b.id, ...shared, ...koken(c) };
          continue;
        }
        const ext = c.type === "video" ? ".mp4" : ".jpg";
        const dest = path.join(mediaDir, `${b.id}${ext}`);
        const task = (async () => {
          if (c.type === "video") {
            // Komple indirme yerine gereken parçayı çek — 4K/uzun arşiv videoları
            // aksi halde timeout'a takılıp hiç kullanılamıyor.
            const src = c.localPath || c.url;
            const srcDur = c.localPath ? await ffprobeDuration(st.ffprobePath, src) : (c.duration || 0);
            await fetchVideoClip(st.ffmpegPath, src, dest, { seconds: 10, sourceDuration: srcDur, killer });
            const dur = await ffprobeDuration(st.ffprobePath, dest);
            if (dur < 1.5) throw new Error("parça çok kısa");
            return { file: dest, type: "video", provider: c.provider, duration: dur };
          }
          await downloadFile(c.url, dest, { timeoutMs: 45000, expect: "image" });
          return { file: dest, type: "image", provider: c.provider };
        })();
        byUrl.set(c.url, task);
        let out;
        try {
          out = await task;
        } catch (e) {
          byUrl.delete(c.url); // başarısız indirmeyi önbellekte tutma
          try { fs.rmSync(dest, { force: true }); } catch {}
          throw e;
        }
        done++;
        kullanilan.add(c.url);
        if (done % 10 === 0) logFn(`İndirme: ${done}/${beats.length}`);
        return { beatId: b.id, ...out, ...koken(c) };
      } catch {
        // sıradaki adaya geç
      }
    }
    // Hiçbiri inmedi → metin kartı. Alakasız bir görsel koymaktansa kart yeğdir;
    // render.js kartı boş yuva olarak işler ve sahne yazıyla kurulur.
    return { beatId: b.id, file: null, type: "card", sorgu: b.visual.query, metin: "", alaka: 0, yedek: false };
    };
    const result = await produce();
    onResult(result);
    return result;
  });

  const media = {};
  for (const r of results) {
    if (!r.ok) throw r.error;
    media[r.value.beatId] = r.value;
  }
  const list = Object.values(media);
  const cards = list.filter((m) => m.type === "card").length;
  const vids = list.filter((m) => m.type === "video").length;
  const ai = list.filter((m) => m.provider === "ai").length;
  logFn(
    `Medya hazır: ${beats.length - cards} kesme (${vids} video${ai ? `, bunun ${ai}'i AI üretimi` : ""}, ${list.filter((m) => m.type === "image").length} görsel)` +
    (cards ? `, ${cards} kesme için yedek kart` : "")
  );
  return media;
}

/**
 * BELİRLİ BEAT'LER İÇİN BİR SONRAKİ ADAYI İNDİR.
 *
 * Görsel denetimi (gorseldenetim.js) bir fotoğrafın konuyla ilgisiz olduğunu
 * söylediğinde çağrılır. Elemek tek başına yetmiyor — ölçüldü: gerçek bir işte
 * 23 görselin 14'ü denetimden kaldı; hepsini atmak videoyu çıplak bırakırdı.
 * Doğrusu YERİNE YENİSİNİ bulmak.
 *
 * @param dislanan beatId -> Set(aday id) — daha önce denenip elenenler
 * @returns beatId -> yeni medya kaydı (bulunamayanlar haritada olmaz)
 */
/**
 * YENİ AÇIYLA ARA VE İNDİR — son çare.
 *
 * yedekAdayIndir aynı sorgunun SIRADAKİ adayını deniyor. Sorgunun kendisi
 * umutsuzsa (konu arşivde yok) bu hiç işe yaramıyor: sıradaki aday da aynı
 * alakasız havuzdan geliyor. Burada senaryo modelinin verdiği YENİ sorgular
 * baştan aratılır — havuz değişir, yalnızca sıra değil.
 *
 * @param acilar {beatId: [yeniSorgu, ...]}
 */
export async function acilardanIndir(job, script, acilar, mediaDir, logFn, killer) {
  const st = getJobSettings(job);
  const beats = flattenBeats(script).filter((b) => (acilar[b.id] || []).length);
  if (!beats.length) return {};
  const sadeceGorsel = job?.mediaKind === "image";

  const sonuc = await mapLimit(beats, 3, async (b) => {
    for (const q of acilar[b.id]) {
      const bulunan = await searchQuery(q, b.visual.type, b.visual.kind, sadeceGorsel).catch(() => []);
      if (!bulunan.length) continue;
      const ag = nadirlikAgirligi(q, bulunan);
      const sirali = bulunan
        .map((c) => ({ c, s: score(c, b.visual.type, b.visual.kind, q, ag) }))
        .sort((x, y) => y.s - x.s).map((x) => x.c);

      for (const c of sirali.filter(permissionUsable).slice(0, 3)) {
        try {
          const ext = c.type === "video" ? ".mp4" : ".jpg";
          const dest = path.join(mediaDir, `${b.id}_aci${hash(q) & 0xffff}${ext}`);
          let out;
          if (c.type === "video") {
            const src = c.localPath || c.url;
            const srcDur = c.localPath ? await ffprobeDuration(st.ffprobePath, src) : (c.duration || 0);
            await fetchVideoClip(st.ffmpegPath, src, dest, { seconds: 10, sourceDuration: srcDur, killer });
            const dur = await ffprobeDuration(st.ffprobePath, dest);
            if (dur < 1.5) throw new Error("parça çok kısa");
            out = { file: dest, type: "video", provider: c.provider, duration: dur };
          } else {
            await downloadFile(c.url, dest, { timeoutMs: 45000, expect: "image" });
            out = { file: dest, type: "image", provider: c.provider };
          }
          return {
            beatId: b.id, ...out,
            // Kaydedilen sorgu YENİ açı: denetim doğru soruyu sorsun.
            sorgu: q, anaSorgu: b.visual.query, vekil: true,
            metin: c.metin || "", adayId: c.id,
            alaka: +metinOrtusme(q, c.metin, ag).toFixed(3),
            yedek: true,
            ...selectedProvenance(c),
      lisans: c.lisans || "", sahip: c.sahip || "",
            eser: c.eser || "", sayfa: c.sayfa || "", kucuk: !!c.kucuk,
            kaynakId: ailekimligi(c.url),
          };
        } catch { /* sıradaki adaya geç */ }
      }
    }
    return null;
  });

  const yeni = {};
  for (const r of sonuc) if (r.ok && r.value) yeni[r.value.beatId] = r.value;
  logFn(`${Object.keys(yeni).length}/${beats.length} sahne için yeni açıdan görsel bulundu.`);
  return yeni;
}

export async function yedekAdayIndir(job, script, candidates, beatIds, mediaDir, dislanan, logFn, killer) {
  const st = getJobSettings(job);
  const beats = flattenBeats(script).filter((b) => beatIds.includes(b.id));
  if (!beats.length) return {};
  const pool = fallbackPool(candidates);

  const sonuc = await mapLimit(beats, 4, async (b) => {
    const cands = candidates[candidateKey(b.visual)] || [];
    const atlanan = dislanan[b.id] || new Set();
    const disaridan = preferType(pool, b.visual.type).filter((c) => !cands.some((x) => x.id === c.id));
    const ag = nadirlikAgirligi(b.visual.query, disaridan);
    const yedek = disaridan
      .map((c) => ({ c, a: metinOrtusme(b.visual.query, c.metin, ag) }))
      .filter((x) => x.a >= YEDEK_ESIGI)
      .sort((x, y) => y.a - x.a)
      .map((x) => x.c);
    const sira = [...cands, ...yedek].filter((c) => !atlanan.has(c.id));
    const kokenAg = nadirlikAgirligi(b.visual.query, [...cands, ...disaridan]);

    for (const c of sira.filter(permissionUsable).slice(0, 4)) {
      try {
        const ext = c.type === "video" ? ".mp4" : ".jpg";
        // Yeni dosya adı: eskisinin üstüne yazma, denetim eskisini hâlâ okuyabilsin.
        const dest = path.join(mediaDir, `${b.id}_y${(atlanan.size || 0) + 1}${ext}`);
        let out;
        if (c.type === "video") {
          const src = c.localPath || c.url;
          const srcDur = c.localPath ? await ffprobeDuration(st.ffprobePath, src) : (c.duration || 0);
          await fetchVideoClip(st.ffmpegPath, src, dest, { seconds: 10, sourceDuration: srcDur, killer });
          const dur = await ffprobeDuration(st.ffprobePath, dest);
          if (dur < 1.5) throw new Error("parça çok kısa");
          out = { file: dest, type: "video", provider: c.provider, duration: dur };
        } else {
          await downloadFile(c.url, dest, { timeoutMs: 45000, expect: "image" });
          out = { file: dest, type: "image", provider: c.provider };
        }
        const olcut = c.vekil && c.vekilSorgu ? c.vekilSorgu : b.visual.query;
        return {
          beatId: b.id, ...out,
          sorgu: olcut, anaSorgu: b.visual.query, vekil: !!c.vekil,
          metin: c.metin || "", adayId: c.id,
          alaka: +metinOrtusme(olcut, c.metin, c.vekil ? null : kokenAg).toFixed(3),
          yedek: !cands.some((x) => x.id === c.id),
          // LİSANS ALANLARI BURADA DA ŞART. Taşınmadığı için, denetimden kalıp
          // yedekle değiştirilen her görsel künyeden sessizce düşüyordu —
          // yani atıf isteyen CC-BY eserler videoya girip kaynağı yazılmıyordu.
          ...selectedProvenance(c),
      lisans: c.lisans || "", sahip: c.sahip || "",
          eser: c.eser || "", sayfa: c.sayfa || "", kucuk: !!c.kucuk,
          kaynakId: ailekimligi(c.url),
        };
      } catch { /* sıradaki adaya geç */ }
    }
    return null;
  });

  const yeni = {};
  for (const r of sonuc) if (r.ok && r.value) yeni[r.value.beatId] = r.value;
  logFn(`${Object.keys(yeni).length}/${beats.length} kesme için yedek görsel bulundu.`);
  return yeni;
}

/**
 * KONUNUN KİŞİSİ EKRANDA GÖRÜNSÜN — garanti, umut değil.
 *
 * NEDEN VAR. Boru hattındaki her karar YERELDİR: her sahne kendi sorgusunun
 * en iyi adayını alır. Hiçbir yerde "bu video bir kişiyi anlatıyor, o kişi
 * gösterilmeli" diye bir kural yoktu. Sonuç, iki üretimde ölçüldü:
 *
 *   20260809-dee3fd : kadının yüzü 4 sahnede çıktı   (şans eseri)
 *   20260809-95b7d7 : hiç çıkmadı — OYSA HAVUZDAYDI
 *
 * İkincisinde fotoğraf "Vanga grave Rupite" havuzunda 2. sıradaydı ve görsel
 * denetimi ona 3/3 vermişti; ama o sorguyu tek bir sahne kullanıyordu ve 1.
 * sıradaki mezar fotoğrafı alındı. Kadın bir daha hiç şansa çıkmadı.
 *
 * Bu işlev, konunun adını taşıyan ve GÖRSEL DENETİMİNDEN tam not almış bir
 * aday varsa, onu en uygun sahneye sabitliyor. Ekleme değil TAKAS: sahne
 * sayısı ve diğer seçimler bozulmuyor.
 */
export function konuKisisiniGoster(job, script, candidates, picks, { logFn = () => {} } = {}) {
  const adlar = [...ozelAdKokleriTopic(job?.topic)];
  if (!adlar.length) return 0;
  const adGecer = (m) => {
    const k = ozelAdKokleriTopic(m);
    for (const x of k) for (const y of adlar) if (x.startsWith(y) || y.startsWith(x)) return true;
    return false;
  };

  // KİŞİNİN KENDİSİNİ NASIL AYIRT EDİYORUZ.
  //
  // "Adı geçiyor" yetmez — ilk denemede tam bu yüzden çalışmadı: mezar dosyası
  // da "Vanga's-Grave-Rupite" adını taşıdığı için kişi sanıldı ve garanti
  // "zaten var" deyip çıktı. Mezar kişinin kendisi değildir.
  //
  // Sağlam işaret: WIKIPEDIA MADDE KAPAĞI. "Baba Vanga" maddesinin kapak
  // görseli, tanımı gereği o kişinin resmidir — dosya adına bakmaya gerek yok.
  // Bu yüzden yalnızca provider="wikipedia" ve madde başlığı konunun adıyla
  // örtüşen adaylar kişi sayılır. Denetimden sıfır almışsa yine de alınmaz.
  const kisiMi = (c) =>
    c.provider === "wikipedia" &&
    adGecer(c.eser || "") &&
    // Madde başlığı KİŞİYİ anmalı, kişinin geçtiği bir yeri değil:
    // "Baba Vanga" geçer, "Rupite" ya da "Petrich" geçmez.
    [...ozelAdKokleriTopic(c.eser)].every((k) => adlar.some((a) => k.startsWith(a) || a.startsWith(k))) &&
    c.onGorsel !== 0;

  const adaylar = [];
  for (const [k, liste] of Object.entries(candidates)) {
    const sorgu = k.split("||")[0];
    if (!adGecer(sorgu)) continue;
    for (const c of liste) if (kisiMi(c)) adaylar.push({ c, sorgu });
  }
  if (!adaylar.length) return 0;
  adaylar.sort((a, b) => (b.c.onKalite || 0) - (a.c.onKalite || 0) || (b.c.score || 0) - (a.c.score || 0));

  // ZATEN VAR MI? Kimlik karşılaştırması ADAY NUMARASIYLA yapılamaz: aynı dosya
  // farklı havuzlarda farklı id alıyor (id'de listedeki sıra var). Dosyanın
  // kendi kimliği kullanılır.
  const secilenKaynak = new Set();
  for (const [bid, id] of Object.entries(picks)) {
    if (!id) continue;
    for (const liste of Object.values(candidates)) {
      const c = liste.find((x) => x.id === id);
      if (c) { secilenKaynak.add(ailekimligi(c.url)); break; }
    }
  }
  const enIyi = adaylar.find((a) => !secilenKaynak.has(ailekimligi(a.c.url)));
  if (!enIyi) return 0;   // kişi zaten videoda — yapacak bir şey yok

  // Takas edilecek sahne: adı geçen bir sorgusu olan ve şu anki seçimi daha
  // zayıf olan ilk sahne. Böylece güçlü bir sahne feda edilmiyor.
  const beatler = flattenBeats(script);
  let hedef = null;
  for (const b of beatler) {
    if (!adGecer(b.visual.query)) continue;
    const liste = candidates[candidateKey(b.visual)] || [];
    const mevcut = liste.find((c) => c.id === picks[b.id]);
    if (!hedef || (mevcut?.onGorsel ?? 9) < (hedef.puan ?? 9)) hedef = { b, puan: mevcut?.onGorsel ?? 9 };
  }
  if (!hedef) return 0;

  // Takas edilen adayı, kendi sahnesinin havuzunda da bulunabilir kılmak için
  // seçimin listesine ekle (downloadPicked seçimi id ile arıyor).
  const hedefListe = candidates[candidateKey(hedef.b.visual)] || [];
  if (!hedefListe.some((c) => c.id === enIyi.c.id)) hedefListe.unshift(enIyi.c);
  picks[hedef.b.id] = enIyi.c.id;
  logFn(`Konunun kişisi garanti altına alındı: "${(enIyi.c.eser || enIyi.sorgu).slice(0, 50)}" ` +
    `${hedef.b.id} sahnesine yerleştirildi (görsel denetimi 3/3).`);
  return 1;
}

/** Konu başlığından/metinden özel ad kökleri — Türkçe harfler ASCII'ye iner. */
const TR_ASCII_M = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
function ozelAdKokleriTopic(metin) {
  const out = new Set();
  String(metin || "").split(/[^\wçğıöşüâîûÇĞİÖŞÜ]+/).filter(Boolean).forEach((h) => {
    if (h.length < 4 || !/^[A-ZÇĞİÖŞÜ]/.test(h)) return;
    const kok = h.split("'")[0].toLowerCase().replace(/[çğıöşüâîû]/g, (c) => TR_ASCII_M[c] || c).slice(0, 6);
    // Ülke/millet sıfatları kişi adı değildir.
    if (/^(bulgar|turkiy|turkis|ameri|ingili|rusya)/.test(kok)) return;
    out.add(kok);
  });
  return out;
}

/*
 * SİYAH-BEYAZ KAYNAK (scene.monoSource). Gimli 9ff721 önce/sonra, 29 Ekim 2026: renk notu artık temel, ama motor
 * (looks/resolve.ts sceneGrade) bir arşiv fotoğrafına bölümün soluk notunu (mono/sepia/duotone) ancak kaynağın KENDİSİ
 * renksizse verir — ve hattın hiçbir adımı scene.monoSource yazmıyordu. Burada ölçülür: diskteki dosyanın küçük bir
 * kopyasında (96 px) ffmpeg signalstats SATAVG (ortalama doygunluk), SATHIGH (doygun %10'un eşiği) ve SATMAX. Gerçekten
 * gri bir fotoğraf SATAVG ≈ 0-2; taranmış s/b baskının hafif sıcak kayması < 4; sepya ≈ 20 ve renkli fotoğraf ≫ 4
 * (ikisi de kendi rengiyle kalır). SATHIGH/SATMAX tavanları, gri bir pistte küçük kırmızı uçak gibi "çoğu gri ama
 * renkli" kareyi renkli tutar (ölçüm: gri zemin + küçük kırmızı kutu SATAVG 1,4 ama SATMAX 135). Yanlış "mono" renkli
 * fotoğrafı griye boyar; yanlış "renkli" s/b fotoğrafa zarar vermez — eşikler bu yüzden dar. Ölçülemeyen dosya
 * bayraksız kalır (renkli sayılır). Hiçbir şey indirilmez, ücretli adım yok. Eşikler docu-engine/lib/produce.mjs
 * MONO_SAT_*'ın aynası (motor uygulamanın dışında, içe aktarılamaz; test ikisini karşılaştırır). sharp kurulu değil:
 * ffmpeg ölçer (kodun her yerde kullandığı araç).
 */
export const MONO_SAT_MAX = 4;
export const MONO_SAT_HIGH_MAX = 10;
export const MONO_SAT_PEAK_MAX = 48;
const MONO_PROBE_MS = 15000;

/** signalstats metadata çıktısından { satavg, sathigh?, satmax? } (SATAVG yoksa null). */
export function parseSatStats(text) {
  const t = String(text || "");
  const num = (k) => {
    const m = t.match(new RegExp("lavfi\\.signalstats\\." + k + "=([0-9.]+)"));
    return m ? Number(m[1]) : NaN;
  };
  const satavg = num("SATAVG");
  if (!Number.isFinite(satavg)) return null;
  const out = { satavg };
  const sathigh = num("SATHIGH");
  const satmax = num("SATMAX");
  if (Number.isFinite(sathigh)) out.sathigh = sathigh;
  if (Number.isFinite(satmax)) out.satmax = satmax;
  return out;
}

/** Saf: ölçüm siyah-beyaz bir kaynak mı? (null/bozuk ölçüm → false: renkli sayılır). */
export function isMonochrome(stats) {
  if (!stats || typeof stats !== "object") return false;
  const satavg = Number(stats.satavg);
  if (stats.satavg === null || stats.satavg === undefined || !Number.isFinite(satavg) || satavg < 0) return false;
  if (satavg >= MONO_SAT_MAX) return false;
  const under = (v, max) => v === undefined || v === null || (Number.isFinite(Number(v)) && Number(v) < max);
  return under(stats.sathigh, MONO_SAT_HIGH_MAX) && under(stats.satmax, MONO_SAT_PEAK_MAX);
}

/** Diskteki bir fotoğrafın/klip afişinin (ya da klibin ilk karesinin) doygunluğu, 96 px genişlikte; ölçülemezse null. */
export function measureSaturation(file, { ffmpeg = "ffmpeg" } = {}) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    const r = spawnSync(ffmpeg, ["-nostdin", "-hide_banner", "-i", file, "-frames:v", "1", "-an", "-vf", "scale=96:-2,signalstats,metadata=mode=print", "-f", "null", "-"], { encoding: "utf8", windowsHide: true, timeout: MONO_PROBE_MS, killSignal: "SIGKILL", maxBuffer: 1 << 20 });
    if (r.error || r.status !== 0) return null;
    return parseSatStats(`${r.stderr || ""}${r.stdout || ""}`);
  } catch {
    return null;
  }
}

/**
 * Sahnenin gerçek fotoğrafı/klip afişi siyah-beyazsa scene.monoSource = true; renkliyse ya da ölçülemezse bayrak
 * silinir (önceki bir çalıştırmanın başka resmi için kalan bayrak yeni resme geçmesin). `measure` testler için.
 * Döner: true (mono), false (renkli), null (ölçülemedi).
 */
export function markMonoSource(scene, file, { ffmpeg = "ffmpeg", measure = measureSaturation } = {}) {
  if (!scene || typeof scene !== "object") return null;
  let stats = null;
  try { stats = file ? measure(file, { ffmpeg }) : null; } catch { stats = null; }
  if (stats && isMonochrome(stats)) {
    scene.monoSource = true;
    return true;
  }
  delete scene.monoSource;
  return stats ? false : null;
}
