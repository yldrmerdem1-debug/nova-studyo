// RENDER ÖNCESİ DÖNEM DENETİMİ (Sinematik Belgesel, docuEraAudit)
//
// Tarihî hikâyede (dönem ~1995'ten önce) stok sitelerinden gelen kareler hâlâ bugünü
// gösterebiliyor: 1929 hikâyesinde boyacının arkasında bugünün şehir otobüsü, parlak
// yeni külçe altın, 1989'da konan Charging Bull heykeli, modern kıyafetli insanlar.
// Render sonrası denetim (docu-qa.js) bunların bir kısmını PAHALI render'dan sonra
// yakalıyordu ve düzeltmesi sınırlıydı; seçici kuralları sıkılaşmadan önce yapılmış
// seçimler de işlerin önbelleğinde duruyordu.
//
// Akış (arşivden sonra, render'dan önce):
//   1. Denetlenecek görseller: stok sağlayıcıdan (Pexels, Pixabay, Mixkit, Unsplash,
//      Openverse) gelen her sahne/montaj karesi, her AI görseli (motorun önceki hazırlığından
//      ya da render'ından kalmışsa — AI da modern şey çizebilir), Wikimedia/Wikipedia
//      (karışık: bugünün fotoğrafları da var). Kurum arşivleri (Archive.org kamu malı, LoC,
//      NASA, Met) düşük riskli: yalnızca bütçede yer kalırsa.
//   2. Klipten 3 kare (baş/orta/son), durağan görselden 1 kare; etiketli (sahne numarası
//      karenin üstüne basılı) 3x3 kontak sayfaları; Claude Sonnet 5.5'e istek başına 8 sayfa,
//      dönem ve her sahnenin anlatımıyla. Yalnızca AÇIK kanıt işaretlenir.
//   3. Karar önbelleği (görsel kimliği + dönem): aynı görsel iki kez ödenmez.
//   4. Uygulama (apply): işaretli arşiv/stok seçiminin adresi docu-era-fixes.json'daki ret
//      listesine yazılır ve sahnenin arşiv kaydı silinir (docu-qa invalidateArchivePicks):
//      arşiv adımı onu güncel kurallarla, reddedilen adres aday listesinden düşülmüş olarak
//      yeniden seçer; yine de aynı adres gelirse sahne AI görseline düşer
//      (applyEraRejections). İşaretli AI görselinin dosyası silinir ve sahneye bir kez
//      `aiFix` notu yazılır (motor istemin sonuna ekler: produce.mjs).
// Kredi/anahtar yoksa ya da görme çağrısı düşerse denetim temiz biçimde durur; iş sürer.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { callVisionJSON } from "../llm.js";
import { readJson, writeJson, run } from "../util.js";
import { hikayeDonemi, donemYili, dHashFromGray, ayniFotograf, sanayiOncesiSatirlari, SANAYI_ONCESI_SINIRI } from "./docu-archive.js";
import { invalidateArchivePicks } from "./docu-qa.js";
import { photoKey } from "./media.js";

export const ERA_AUDIT_VERSION = "docu-era-1";
export const ERA_MODEL = "claude-sonnet-5-5";
/** Bu yıldan (dahil) sonraki hikâyede denetim yapılmaz: stok görüntüsü zaten dönemin. */
export const ERA_AUDIT_BEFORE = 1995;
const CACHE_FILE = "docu-era-audit.json";
export const ERA_FIXES_FILE = "docu-era-fixes.json";

/** Bugünün görüntüsünü veren stok siteleri: en yüksek risk. */
export const STOCK_PROVIDERS = new Set(["pexels", "pixabay", "mixkit", "unsplash", "openverse"]);
/** Karışık: tarihî tarama da var, bugünün fotoğrafı da. */
const MIXED_PROVIDERS = new Set(["wikimedia", "wikipedia", "europeana"]);

/** Kare 288x162: 3x3 sayfa ~880x500 px ≈ 590 görüntü tokeni (kare başına ~65). */
const TILE_W = 288, TILE_H = 162, COLS = 3, ROWS = 3, PER_SHEET = COLS * ROWS;
/** İstek başına 12 sayfa (108 kare): istem ve düşünme yükü az istekte. */
const SHEETS_PER_CALL = 12;
/** Video başına tavan: 24 sayfa (2 istek) ≈ 14 bin görüntü tokeni + metin + yakından onay → Sonnet 5.5 ile ≤ ~0,08 $. */
export const MAX_TILES = 216;
/** Fiyatı ayarlarda olmayan model için tahmin (yalnızca günlük satırı). */
const FALLBACK_RATE = { input: 2, output: 10 }; // Sonnet 5.5 liste fiyatı

const stripTags = (t) => String(t || "").replace(/\[[^\]]*\]\s*/g, "").replace(/\s+/g, " ").trim();
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const noCredit = (e) => /credit balance is too low|insufficient credit|billing|kota\/kredi/i.test(String(e?.message || e));
const isAiFile = (f) => /(^|\/)img-[0-9a-f]{8,}[\w.-]*\.(jpe?g|png|webp)$/i.test(String(f || ""));

/** Sahne/kare kimliği → kullanıcıya görünen etiket ("12" ya da montaj karesi "12m3"). */
export const labelOf = (id) => (typeof id === "number" ? String(id + 1) : String(id).replace(/^(\d+)-m(\d+)$/, (_, i, k) => `${+i + 1}m${+k + 1}`));
/** Etiket → iç kimlik (sahne indeksi ya da "i-mk"). */
export function idOfLabel(label) {
  const m = String(label || "").trim().replace(/^#/, "").match(/^(\d+)(?:\s*m\s*(\d+))?/i);
  if (!m) return null;
  return m[2] ? `${+m[1] - 1}-m${+m[2] - 1}` : +m[1] - 1;
}

/** Görüntü istemine eklenen düzeltme notu. */
export function aiFixNote(era, what = "") {
  const yillar = String(era || "").match(/\b1[5-9]\d\d(?:\s*[-–]\s*(?:1[5-9]|20)\d\d)?\b/)?.[0] || String(era || "").trim();
  const neden = String(what || "").replace(/[^\w\s,'()-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 90);
  return `Strictly period-accurate for ${yillar}, no modern objects${neden ? ` (avoid: ${neden})` : ""}.`;
}

/* ================================================================ denetlenecek görseller */

/** Motorun son çizdiği senaryo (hazırlık ya da render): AI görsellerinin dosyaları oradan. */
function engineScenes(propsFile, n) {
  const p = readJson(propsFile, null);
  const scenes = (p?.script || p)?.scenes;
  if (!Array.isArray(scenes)) return null;
  const own = scenes.filter((s) => !(s?.type === "title" && s.chapterCard));
  return own.length === n ? own : null;
}

function riskOf(provider) {
  if (STOCK_PROVIDERS.has(provider)) return 0;
  if (MIXED_PROVIDERS.has(provider)) return 1;
  return 2;
}

/** Klipte örneklenecek anlar (sahnede gösterilen bölüm: baş/orta/son). */
export function clipTimes(start, videoDur, dur, n = 3) {
  const a = Math.max(0, Number(start) || 0);
  const kalan = Math.max(0.6, (Number(videoDur) || a + 6) - a);
  const span = Math.max(0.6, Math.min(kalan, Math.max(Number(dur) || 5, 4)));
  if (n === 1) return [+(a + span / 2).toFixed(2)];
  return [+(a + 0.25).toFixed(2), +(a + span / 2).toFixed(2), +(a + Math.max(0.3, span - 0.35)).toFixed(2)];
}

/**
 * Denetim adayları: [{id, scene, label, kind: "archive"|"ai", provider, risk, url, file,
 * video, times, say, ident}]. `file`/`video` public klasörüne göre.
 */
export function eraItems(script, credits = {}, { publicDir, propsFile } = {}) {
  const items = [];
  const exists = (f) => !!f && !!publicDir && fs.existsSync(path.join(publicDir, f));
  const own = propsFile ? engineScenes(propsFile, script.scenes.length) : null;
  script.scenes.forEach((s, i) => {
    const say = stripTags(s.say);
    // Sahnenin kendi resmi: arşiv/stok seçimi ya da AI görseli.
    const c = credits[`scene-${i}`];
    if (s.archived && c?.url && (exists(s.video) || exists(s.image))) {
      const risk = riskOf(c.provider);
      const video = exists(s.video) ? s.video : null;
      items.push({
        id: i, scene: i, kind: "archive", provider: c.provider, risk, url: c.url, page: c.sayfa || null, file: s.image, video,
        times: video ? clipTimes(s.videoStart, s.videoDur, s.dur, risk === 2 ? 1 : 3) : null, say,
        ident: `a|${c.url}|${video ? `${s.videoStart || 0}` : ""}`,
      });
    } else if (!s.archived && s.imagePrompt && !s.bg && own) {
      const e = own[i];
      if (e && !e.borrowed && !e.archived && isAiFile(e.image) && (e.imagePrompt === s.imagePrompt || (s.aiFix && e.imagePrompt === `${s.imagePrompt}. ${s.aiFix}`)) && exists(e.image)) {
        items.push({ id: i, scene: i, kind: "ai", provider: "ai", risk: 0, url: null, file: e.image, video: null, times: null, say, prompt: s.imagePrompt, ident: `i|${path.basename(e.image)}` });
      }
    }
    // Montaj/kolaj kareleri.
    const prompts = Array.isArray(s.imagePrompts) ? s.imagePrompts : [];
    const shown = own?.[i]?.images?.length === prompts.length ? own[i].images : null;
    prompts.forEach((p, k) => {
      const id = `${i}-m${k}`;
      const pc = credits[`scene-${id}`];
      if (p && typeof p === "object" && p.image && pc?.url && exists(p.image)) {
        // Montaj karesi kısa görünür: tek kare (klibin durağan karesi) yeter.
        items.push({ id, scene: i, kind: "archive", provider: pc.provider, risk: riskOf(pc.provider), url: pc.url, page: pc.sayfa || null, file: p.image, video: null, times: null, say, ident: `a|${pc.url}|${p.video ? `${p.videoStart || 0}` : ""}` });
      } else if (shown && !(p && typeof p === "object" && p.image) && isAiFile(shown[k]) && exists(shown[k])) {
        items.push({ id, scene: i, kind: "ai", provider: "ai", risk: 0, url: null, file: shown[k], video: null, times: null, say, prompt: typeof p === "string" ? p : p?.prompt, ident: `i|${path.basename(shown[k])}` });
      }
    });
  });
  // A countdown's item carries its own era (scene.era): its pictures are judged against it, not the list's.
  return items.map((x) => {
    const own = script.scenes[x.scene]?.era;
    return { ...x, label: labelOf(x.id), tiles: x.times ? x.times.length : 1, ...(own ? { era: String(own) } : {}) };
  });
}

/** Bütçe: önce stok + AI, sonra karışık, en son kurum arşivi; sahne sırası korunur. */
export function selectWithinBudget(items, maxTiles = MAX_TILES) {
  const sirali = [...items].sort((a, b) => a.risk - b.risk || a.scene - b.scene);
  const out = [];
  let n = 0;
  for (const x of sirali) {
    if (n + x.tiles > maxTiles) continue;
    out.push(x);
    n += x.tiles;
  }
  return { chosen: out.sort((a, b) => a.scene - b.scene || String(a.id).localeCompare(String(b.id))), tiles: n, skipped: items.length - out.length };
}

/* ================================================================ kareler ve sayfalar */

const FONT = ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"].find((f) => { try { return fs.existsSync(f); } catch { return false; } });
const fontArg = () => (FONT ? `fontfile='${FONT.replace(/\\/g, "/").replace(/:/g, "\\:")}':` : "");
const fitVf = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=0x202020,setsar=1`;

async function tileOf(ffmpeg, { input, t, out, text, label, w = TILE_W, h = TILE_H }) {
  const TILE_VF = fitVf(w, h);
  const seek = Number.isFinite(t) ? ["-ss", String(Math.max(0, t))] : [];
  const draw = `drawtext=${fontArg()}text='${text}':fontsize=${Math.round(h / 8)}:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=4:x=6:y=6`;
  // Tek piksel biçimi: kaynak 4:4:4 JPEG/PNG iken kare de 4:4:4 çıkıyordu ve görüntü dizisi
  // (sayfa birleştirme) biçim değişiminde kareleri kaydırıyordu — etiket listesiyle sayfa ayrışıyordu.
  const args = (vf) => ["-y", "-hide_banner", "-loglevel", "error", ...seek, "-i", input, "-frames:v", "1", "-vf", `${vf},format=yuvj420p`, "-q:v", "4", "-update", "1", out];
  if (label.ok) {
    try {
      await run(ffmpeg, args(`${TILE_VF},${draw}`), { timeoutMs: 60000 });
      if (fs.existsSync(out) && fs.statSync(out).size > 300) return;
    } catch { label.ok = false; }
  }
  await run(ffmpeg, args(TILE_VF), { timeoutMs: 60000 });
  if (!fs.existsSync(out) || fs.statSync(out).size < 300) throw new Error("kare alınamadı");
}

async function grayHash(ffmpeg, file) {
  const out = `${file}.gray`;
  try {
    await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-i", file, "-frames:v", "1", "-vf", "scale=9:8:flags=area,format=gray", "-f", "rawvideo", out], { timeoutMs: 30000 });
    return dHashFromGray(fs.readFileSync(out));
  } catch { return null; } finally { try { fs.rmSync(out, { force: true }); } catch {} }
}

/** Her adayın kareleri (sıralı t_0001.jpg…) → [{item, frame, n}]. Kare alınamayan aday atlanır. */
async function extractTiles(items, { ffmpeg, publicDir, tmp, isCancelled }) {
  const tiles = [];
  const label = { ok: true };
  let n = 0;
  for (const x of items) {
    if (isCancelled()) throw new Error("cancelled");
    const parts = x.video && x.times ? x.times.map((t, k) => ({ input: path.join(publicDir, x.video), t, frame: "abc"[k] || "" })) : [{ input: path.join(publicDir, x.file), t: null, frame: "" }];
    const got = [];
    const hashes = [];
    for (const p of parts) {
      const out = path.join(tmp, `t_${String(n + got.length + 1).padStart(4, "0")}.jpg`);
      try {
        await tileOf(ffmpeg, { input: p.input, t: p.t, out, text: `${x.label}${p.frame ? ` ${p.frame}` : ""}`, label });
        // Durağan klipte (manzara, saat yakın çekimi) baş/orta/son aynı kare: tekrarı gösterilmez (ücretsiz dHash).
        if (parts.length > 1) {
          const h = await grayHash(ffmpeg, out);
          if (h && hashes.some((o) => ayniFotograf(o, h))) { fs.rmSync(out, { force: true }); continue; }
          if (h) hashes.push(h);
        }
        got.push({ item: x, frame: p.frame, file: out });
      } catch { try { fs.rmSync(out, { force: true }); } catch {} }
    }
    // Bir klipten bazı kareler alınamadıysa numaralar kaymasın diye yeniden adlandır.
    for (const g of got) {
      n++;
      const want = path.join(tmp, `t_${String(n).padStart(4, "0")}.jpg`);
      if (g.file !== want) fs.renameSync(g.file, want);
      tiles.push({ ...g, file: want, n });
    }
  }
  return { tiles, labelled: label.ok };
}

async function contactSheets(tiles, { ffmpeg, tmp }) {
  const sheets = [];
  for (let s = 0; s * PER_SHEET < tiles.length; s++) {
    const part = tiles.slice(s * PER_SHEET, (s + 1) * PER_SHEET);
    const out = path.join(tmp, `sheet_${String(s + 1).padStart(2, "0")}.jpg`);
    await run(ffmpeg, [
      "-y", "-hide_banner", "-loglevel", "error", "-start_number", String(part[0].n), "-i", path.join(tmp, "t_%04d.jpg"),
      "-frames:v", "1", "-vf", `tile=${COLS}x${ROWS}:padding=4:margin=2:color=white`, "-q:v", "4", "-update", "1", out,
    ], { timeoutMs: 2 * 60 * 1000 });
    sheets.push({ file: out, tiles: part });
  }
  return sheets;
}

/* ================================================================ görme çağrısı */

const ERA_SCHEMA = {
  type: "object",
  properties: {
    flags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Karenin etiketi, # ve a/b/c olmadan: \"12\" ya da \"12m3\"" },
          what: { type: "string", description: "Short English phrase naming the post-era thing you SEE (e.g. 'modern city bus behind the man')" },
          confidence: { type: "string", enum: ["high", "medium"] },
        },
        required: ["id", "what", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["flags"],
  additionalProperties: false,
};

const KAYNAK_TR = (x) => (x.kind === "ai" ? "AI görseli" : `${STOCK_PROVIDERS.has(x.provider) ? "stok" : "arşiv"} ${x.video ? "klibi" : "fotoğrafı"} · ${x.provider}`);

export function eraPrompt({ title, era, year, lines, mixed = false }) {
  return [
    `Bir YouTube belgeselinin görsellerini render'dan ÖNCE dönem doğruluğu için denetliyorsun${title ? ` ("${title}")` : ""}.`,
    mixed
      ? `Bu bir GERİ SAYIM videosu: maddeler farklı dönemlerden. Her kareyi satırındaki [dönem …] yılına göre denetle (o maddenin anından SONRA var olan şey). Dönemi yazılmamış kare için: ${era}.`
      : `HİKÂYENİN DÖNEMİ: ${era} (ana yıl ${year}).`,
    `Görseller kontak sayfaları: her sayfada en çok 9 kare (3x3). Her karenin sol üstünde etiketi yazar: "12" = sahne 12, "12m3" = sahne 12'nin 3. montaj karesi; hareketli klipten 3 kare alındıysa etiketin yanında a/b/c (baş/orta/son). Aşağıda her etiketin kaynağı ve o sahnede söylenen anlatım var.`,
    ``,
    `YALNIZCA AÇIK KANIT varsa işaretle: karede, hikâyenin o anından SONRA var olan ve gözle açıkça seçilen insan yapımı bir şey:`,
    `- bugünün taşıtları: modern otobüs, araba, kamyon, motosiklet, jet yolcu uçağı (winglet, bugünkü boyalar), modern tren/tramvay`,
    `- akıllı telefon, dizüstü, düz/LED ekran, LED tabela ya da lamba, modern elektronik, plastik ambalaj`,
    `- modern kıyafet ve görünüm: tişört, kot + spor ayakkabı, şişme mont, beyzbol şapkası, yüz maskesi, bugünkü saç modelleri ve gözlükler`,
    `- okunabilen marka/logo, modern reklam panosu, modern trafik işaretleri ve yol çizgileri`,
    `- cam cepheli gökdelen, bugünün şehir silueti`,
    `- dönem nesnesi olması gereken şeyin bugünkü parlak, dijital renkli ürün fotoğrafı (yeni basılmış külçe altın, bugünün banknotları/bozuk paraları)`,
    `- dönemden SONRA yapılmış bilinen yapı ya da heykel (ör. Wall Street'teki "Charging Bull" boğa heykeli 1989'da kondu)`,
    ...(!mixed && year < SANAYI_ONCESI_SINIRI ? [``, ...sanayiOncesiSatirlari(year)] : []),
    ``,
    `SERBEST (işaretleme): doğa, gökyüzü, deniz, buz, yağmur, ateş, uzay ve gezegen görüntüleri; el/kâğıt/mum/saat yakın çekimleri; eski taş binalar; ${year < SANAYI_ONCESI_SINIRI ? "tablolar, gravürler, minyatürler, mozaikler ve müze eserleri (bu hikâyede FOTOĞRAF dönem fotoğrafı değildir);" : "siyah-beyaz ya da sepya dönem fotoğrafları;"} tablolar, gravürler; dönem kostümlü canlandırmalar; renkli olması TEK BAŞINA sorun değildir. Görüntüdeki şeyin modern olduğundan emin değilsen İŞARETLEME.`,
    `Anlatım açıkça bugünü ya da dönemden sonraki bir yılı anlatıyorsa (ör. "bugün", "1985'te enkaz bulundu", "2023") o sahnedeki modern görüntü doğrudur: işaretleme.`,
    `confidence: high = modern şey açıkça görünüyor; medium = büyük olasılıkla modern ama tam seçilemiyor. Sorunsuz kareleri listeleme. Hiç sorun yoksa boş liste döndür.`,
    ``,
    `KARELER:`,
    ...lines,
  ].join("\n");
}

function itemLine(x) {
  const say = x.say.length > 110 ? `${x.say.slice(0, 107)}…` : x.say;
  return `${x.label}${x.video && x.times?.length > 1 ? " (a/b/c)" : ""} [${KAYNAK_TR(x)}]${x.era ? ` [dönem ${x.era}]` : ""}${say ? ` — "${say}"` : ""}`;
}

/* ================================================================ yakından onay */

const CONFIRM_PER_CALL = 10;
const CONFIRM_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "Görselin etiketi (\"12\" ya da \"12m3\")" },
          modern: { type: "boolean", description: "Karede dönemden sonra var olan, AÇIKÇA görülen insan yapımı bir şey var mı?" },
          what: { type: "string", description: "Short English phrase: the post-era thing you clearly see, or why it is fine" },
        },
        required: ["id", "modern", "what"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

export function confirmPrompt({ era, year, lines }) {
  return [
    `Bir tarih belgeselinin görselleri ilk taramada (küçük karelerde) dönem dışı şüphesiyle işaretlendi. Şimdi her birini BÜYÜK boyutta görüyorsun. HİKÂYENİN DÖNEMİ: ${era} (ana yıl ${year}).`,
    `Her görsel için karar ver: modern=true YALNIZCA karede o dönemden SONRA var olan ve gözle AÇIKÇA seçilen insan yapımı bir şey varsa (bugünün taşıtı, elektronik/ekran, modern kıyafet ya da saç, marka/logo, cam gökdelen, bugünün parlak ürün fotoğrafı, dönemden sonra yapılmış bilinen yapı/heykel).`,
    `Bulanık ya da belirsiz bir şekli modern saymak YANLIŞTIR: daktilo, telgraf, eski telefon, gaz lambası, ahşap masa, sandalye sırtı, pencere gibi dönem nesneleri sık karıştırılır. ${year < SANAYI_ONCESI_SINIRI ? "Tablo, gravür, mozaik ve doğa görüntüleri modern değildir." : "Siyah-beyaz dönem fotoğrafı, tablo, gravür ve doğa görüntüleri modern değildir."} Anlatım açıkça bugünü anlatıyorsa modern=false.`,
    ...sanayiOncesiSatirlari(year),
    `Her görsel için bir kayıt döndür.`,
    ``,
    `GÖRSELLER:`,
    ...lines,
  ].join("\n");
}

/** Onay için büyük görüntü: durağan görsel 640x360; klipte baş/orta/son 384x216 yan yana (~300 token). */
async function closeUp(ffmpeg, x, { publicDir, tmp }) {
  const label = { ok: true };
  const out = path.join(tmp, `c_${String(x.label).replace(/\W/g, "_")}.jpg`);
  if (!(x.video && x.times?.length > 1)) {
    await tileOf(ffmpeg, { input: path.join(publicDir, x.file), t: null, out, text: x.label, label, w: 640, h: 360 });
    return out;
  }
  const parts = [];
  for (const [k, t] of x.times.entries()) {
    const f = path.join(tmp, `c_${String(x.label).replace(/\W/g, "_")}_${k}.jpg`);
    try { await tileOf(ffmpeg, { input: path.join(publicDir, x.video), t, out: f, text: `${x.label} ${"abc"[k]}`, label, w: 384, h: 216 }); parts.push(f); } catch {}
  }
  if (!parts.length) throw new Error("kare alınamadı");
  if (parts.length === 1) return parts[0];
  await run(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", ...parts.flatMap((f) => ["-i", f]), "-filter_complex", `hstack=inputs=${parts.length}`, "-frames:v", "1", "-q:v", "4", "-update", "1", out], { timeoutMs: 60000 });
  return out;
}

/* ================================================================ önbellek ve maliyet */

export const eraKey = (era, ident) => sha(`${ERA_AUDIT_VERSION}|${era}|${ident}`);

const tokensOf = (u) => ({ input: Number(u?.inputTokens) || 0, output: Number(u?.outputTokens) || 0 });

/* ================================================================ ana işlev */

/**
 * Render öncesi dönem denetimi.
 * @param script    motora gidecek senaryo (arşivden SONRA: archived, image, video alanlarıyla)
 * @param credits   arşiv künyeleri ({"scene-i" | "scene-i-mk": {provider, url, …}})
 * @param dir       iş klasörü (karar önbelleği ve düzeltme dosyası burada)
 * @param publicDir motorun public klasörü (görsel/klip dosyaları)
 * @param propsFile motorun son senaryosu (AI görsellerinin dosyaları); varsayılan <workDir>/<id>.props.json
 * @param keyScript arşiv önbellek anahtarlarının türetildiği senaryo (docu.js: yönetmenden geçmiş senaryo)
 * @param apply     false: yalnızca işaretle (ret listesi/önbellek silme/AI dosyası silme yok)
 * @param debugDir  verilirse kontak sayfaları ve kareler oraya kopyalanır (inceleme için)
 * @returns {{flagged:[{scene, id, label, kind, provider, reason, url, file, confidence}], doubts, audited, cached, calls, skipped, applied, era, summary}}
 */
export async function auditEra({ script, credits = {}, dir, settings = {}, usage, logFn = () => {}, llm = callVisionJSON, ffmpeg, publicDir, propsFile, keyScript, docKey = null, apply = true, debugDir = null, isCancelled = () => false, model, maxTiles = MAX_TILES, lowRisk = true } = {}) {
  const ff = ffmpeg || settings.ffmpegPath || "ffmpeg";
  const era = hikayeDonemi(script);
  // A countdown: the audit runs when ANY item is old enough, each picture judged against its item's era.
  const itemYears = (script.scenes || []).map((s) => (s?.era ? donemYili(String(s.era)) : null)).filter((y) => Number.isFinite(y));
  const mixed = itemYears.length > 0;
  const year = mixed ? Math.min(...itemYears) : donemYili(era);
  const empty = (skipped, extra = {}) => ({ flagged: [], doubts: [], audited: 0, cached: 0, calls: 0, skipped, applied: null, era, summary: "", ...extra });
  if (!year || year >= ERA_AUDIT_BEFORE) return empty("era");
  const pf = propsFile || (publicDir && script.id != null ? path.join(path.dirname(publicDir), `${script.id}.props.json`) : null);
  const all = eraItems(script, credits, { publicDir, propsFile: pf });
  if (!all.length) return empty("nothing");

  const cacheFile = dir ? path.join(dir, CACHE_FILE) : null;
  const cache = (cacheFile && readJson(cacheFile, null)) || { version: ERA_AUDIT_VERSION, items: {} };
  if (cache.version !== ERA_AUDIT_VERSION) { cache.version = ERA_AUDIT_VERSION; cache.items = {}; }
  const saveCache = () => { if (cacheFile) writeJson(cacheFile, cache); };
  for (const x of all) x.key = eraKey(era, x.ident);

  const verdicts = new Map();
  const fresh = [];
  for (const x of all) {
    const v = cache.items[x.key];
    if (v) verdicts.set(x, v);
    else fresh.push(x);
  }
  const { chosen, skipped: overBudget } = selectWithinBudget(lowRisk ? fresh : fresh.filter((x) => x.risk < 2), maxTiles);
  let tileCount = 0;
  const cachedCount = all.length - fresh.length;
  let calls = 0;
  let stopped = null;
  const localUsage = usage || {};
  const t0 = tokensOf(localUsage);
  const canCall = llm !== callVisionJSON || settings.anthropicKey;
  const pending = [];
  const record = (x, v) => {
    cache.items[x.key] = { ...v, at: new Date().toISOString(), label: x.label, kind: x.kind, provider: x.provider, ...(x.url ? { url: x.url } : { file: x.file }) };
    verdicts.set(x, cache.items[x.key]);
  };

  if (chosen.length && !canCall) stopped = "no-key";
  else if (chosen.length) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-era-"));
    try {
      const { tiles, labelled } = await extractTiles(chosen, { ffmpeg: ff, publicDir, tmp, isCancelled });
      tileCount = tiles.length;
      if (!labelled) logFn("Dönem denetimi: karelere etiket basılamadı (yazı tipi yok); sıra numarasıyla sürülüyor");
      const sheets = await contactSheets(tiles, { ffmpeg: ff, tmp });
      if (debugDir) {
        fs.mkdirSync(debugDir, { recursive: true });
        for (const sh of sheets) fs.copyFileSync(sh.file, path.join(debugDir, path.basename(sh.file)));
      }
      const byLabel = new Map(chosen.map((x) => [x.label, x]));
      for (let k = 0; k < sheets.length; k += SHEETS_PER_CALL) {
        if (isCancelled()) throw new Error("cancelled");
        const part = sheets.slice(k, k + SHEETS_PER_CALL);
        const inPart = [...new Set(part.flatMap((sh) => sh.tiles.map((t) => t.item)))];
        let res;
        try {
          res = await llm({
            system: "Sen titiz bir tarih belgeseli görsel editörüsün. Yalnızca istenen JSON'u döndür.",
            user: eraPrompt({ title: script.title, era, year, lines: inPart.map(itemLine), mixed }),
            schema: ERA_SCHEMA,
            images: part.map((sh) => ({ etiket: `Kontak sayfası ${path.basename(sh.file, ".jpg").replace("sheet_", "")}: ${sh.tiles.map((t) => `${t.item.label}${t.frame}`).join(", ")}`, data: fs.readFileSync(sh.file).toString("base64"), mediaType: "image/jpeg" })),
            model: model || settings.docuEraModel || ERA_MODEL,
            maxTokens: 3000,
            usage: localUsage,
            logFn,
            isCancelled,
          });
        } catch (e) {
          if (e?.message === "cancelled" || isCancelled()) throw e;
          stopped = noCredit(e) ? "no-credit" : "error";
          logFn(`Dönem denetimi durdu (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 140)}) — denetlenmeyen görseller olduğu gibi kalıyor`);
          break;
        }
        calls++;
        const flags = new Map();
        for (const f of res?.flags || []) {
          const id = idOfLabel(f?.id);
          const x = id === null ? null : byLabel.get(labelOf(id));
          if (!x || !inPart.includes(x)) continue;
          const prev = flags.get(x);
          if (!prev || (f.confidence === "high" && prev.confidence !== "high")) flags.set(x, { what: String(f.what || "").slice(0, 160), confidence: f.confidence === "high" ? "high" : "medium" });
        }
        for (const x of inPart) {
          const f = flags.get(x);
          // "high" her zaman; "medium" yalnızca stok seçiminde (yeniden seçim ucuz, stok zaten bugünün
          // görüntüsü — 1929'da Eames koltuğu, LED spotlu düğün salonu "medium" geliyordu). AI'da medium
          // yeniden ücretli üretim demek: dokunulmaz, şüpheli olarak raporlanır.
          const act = f && (f.confidence === "high" || (x.kind === "archive" && STOCK_PROVIDERS.has(x.provider)));
          if (act) pending.push({ x, f });
          else record(x, { v: "ok", ...(f ? { doubt: f.what } : {}) });
        }
        saveCache();
      }
      // YAKINDAN ONAY: küçük karede şüpheli bulunanlar büyük boyutta bir kez daha gösterilir.
      // Ölçüldü (1929): 288 px'lik karede sandalye sırtı "modern monitör", daktilo silindiri
      // "modern cihaz" sanılmıştı; büyük karede ikisi de dönem nesnesi.
      for (let k = 0; k < pending.length && !stopped; k += CONFIRM_PER_CALL) {
        if (isCancelled()) throw new Error("cancelled");
        const part = [];
        for (const p of pending.slice(k, k + CONFIRM_PER_CALL)) {
          try { part.push({ ...p, file: await closeUp(ff, p.x, { publicDir, tmp }) }); } catch { part.push({ ...p, file: null }); }
        }
        const shown = part.filter((p) => p.file);
        // Yakın görüntü çıkarılamayan aday tek taramadaki kararla kalır.
        for (const p of part) if (!p.file) record(p.x, { v: "flag", what: p.f.what, conf: p.f.confidence });
        if (!shown.length) { saveCache(); continue; }
        if (debugDir) for (const p of shown) fs.copyFileSync(p.file, path.join(debugDir, `confirm-${p.x.label}.jpg`));
        let res;
        try {
          res = await llm({
            system: "Sen titiz bir tarih belgeseli görsel editörüsün. Yalnızca istenen JSON'u döndür.",
            user: confirmPrompt({ era, year, lines: shown.map((p) => `${itemLine(p.x)} — ilk taramadaki şüphe: ${p.f.what}`) }),
            schema: CONFIRM_SCHEMA,
            images: shown.map((p) => ({ etiket: `Görsel ${p.x.label}${p.x.video ? " (klibin baş/orta/son kareleri yan yana)" : ""}:`, data: fs.readFileSync(p.file).toString("base64"), mediaType: "image/jpeg" })),
            model: model || settings.docuEraModel || ERA_MODEL,
            maxTokens: 2000,
            usage: localUsage,
            logFn,
            isCancelled,
          });
        } catch (e) {
          if (e?.message === "cancelled" || isCancelled()) throw e;
          stopped = noCredit(e) ? "no-credit" : "error";
          logFn(`Dönem denetimi yakından onayı durdu (${noCredit(e) ? "Anthropic kredisi yok" : String(e?.message || e).slice(0, 140)}) — onaylanmayan şüphelere dokunulmuyor`);
          break;
        }
        calls++;
        const by = new Map();
        for (const it of res?.items || []) { const id = idOfLabel(it?.id); if (id !== null) by.set(labelOf(id), it); }
        for (const p of shown) {
          const c = by.get(p.x.label);
          if (c?.modern === true) record(p.x, { v: "flag", what: String(c.what || p.f.what).slice(0, 160), conf: p.f.confidence });
          else record(p.x, { v: "ok", doubt: `${p.f.what} (yakından bakınca: ${String(c?.what || "dönem dışı değil").slice(0, 120)})` });
        }
        saveCache();
      }
    } finally {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
  }

  const flagged = [];
  const doubts = [];
  for (const x of all) {
    const v = verdicts.get(x);
    if (v?.v === "flag") flagged.push({ scene: x.scene, id: x.id, label: x.label, kind: x.kind, provider: x.provider, reason: v.what, url: x.url, page: x.page || null, file: x.file, video: x.video, confidence: v.conf || "high" });
    else if (v?.doubt) doubts.push({ scene: x.scene, id: x.id, label: x.label, kind: x.kind, provider: x.provider, reason: v.doubt, url: x.url, file: x.file });
  }
  const applied = apply && dir && flagged.length ? applyEraFlags({ dir, flagged, keyScript: keyScript || script, publicDir, era, docKey, logFn }) : null;

  const t1 = tokensOf(localUsage);
  const tok = { input: t1.input - t0.input, output: t1.output - t0.output };
  const rate = settings.modelRates?.[model || settings.docuEraModel || ERA_MODEL] || FALLBACK_RATE;
  const usd = (tok.input * (rate.input ?? FALLBACK_RATE.input) + tok.output * (rate.output ?? FALLBACK_RATE.output)) / 1e6;
  const ai = flagged.filter((f) => f.kind === "ai").length;
  const ar = flagged.length - ai;
  const durum = stopped ? ` (denetim yarım kaldı: ${{ "no-key": "Anthropic anahtarı yok", "no-credit": "Anthropic kredisi yok", error: "hata" }[stopped]})` : "";
  const summary = `Dönem denetimi (${era}): ${all.length} görsel (${cachedCount} kayıttan${overBudget ? `, ${overBudget} bütçe dışı` : ""}), ` +
    (flagged.length ? `${flagged.length} dönem dışı — ${ar} arşiv/stok seçimi yeniden seçilecek, ${ai} AI görseli yeniden üretilecek` : "dönem dışı görsel yok") +
    `${doubts.length ? `; ${doubts.length} şüpheli (dokunulmadı)` : ""} · ${calls} istek, ${tileCount} kare, ~$${usd.toFixed(3)}${durum}.`;
  logFn(summary);
  for (const f of flagged) logFn(`  Dönem dışı: sahne ${f.label} [${f.kind === "ai" ? "AI" : f.provider}] — ${f.reason}`);
  return { flagged, doubts, audited: chosen.length, cached: cachedCount, calls, tiles: tileCount, skipped: stopped, applied, era, usd: +usd.toFixed(4), tokens: tok, summary };
}

/* ================================================================ uygulama */

/** Dönem düzeltme dosyası (docu-qa-fixes.json biçiminde): {docKey, era, scenes:{id:{rejected:[url]}}, aiFix:{id:note}}. */
export function readEraFixes(dir) {
  return readJson(path.join(dir, ERA_FIXES_FILE), null);
}
/** Arşiv adımına verilecek ret listesi: aynı dönem için reddedilen bütün adresler. */
/** Aynı sahne/kare bu kadar kez dönem dışı bulunursa arşivde bir daha aranmaz: AI görseli (aiFix notuyla). */
export const ERA_AI_AFTER = 2;
/**
 * Sahnenin kaç kez dönem dışı bulunduğu. Yeni kayıtlarda sayaç (n); sayaçsız eski kayıtta
 * yaklaşık: her ret adres + sayfa olarak iki satır yazılıyordu.
 */
export function eraRejectionCount(e) {
  if (Number.isFinite(e?.n)) return e.n;
  return Math.ceil(((e?.rejected || []).filter(Boolean).length) / 2);
}
const zorlaAi = (e) => !!e && (e.toAi === true || eraRejectionCount(e) >= ERA_AI_AFTER);
/** Arşiv adımının hiç aramayacağı sahne/kareler (sahne indeksi ya da "i-mk"): aynı dönem için. */
export function eraAiOnly(fixes, era) {
  if (!fixes || (era && fixes.era && fixes.era !== era)) return [];
  return Object.entries(fixes.scenes || {}).filter(([, e]) => zorlaAi(e)).map(([k]) => (/^\d+$/.test(k) ? +k : k));
}

export function eraRejectedUrls(fixes, era) {
  if (!fixes || (era && fixes.era && fixes.era !== era)) return [];
  return [...new Set(Object.values(fixes.scenes || {}).flatMap((f) => f.rejected || []).filter(Boolean))];
}

/**
 * İşaretli görselleri düzeltmeye sokar: arşiv/stok → ret listesi + arşiv kaydı silinir;
 * AI → dosya silinir + aiFix notu (bir kez). Yerinde değil: dosyalara yazar.
 * @returns {{invalidated, rejected, aiRegen, aiRepeat, ids}}
 */
export function applyEraFlags({ dir, flagged, keyScript, publicDir, era, docKey = null, logFn = () => {} }) {
  const file = path.join(dir, ERA_FIXES_FILE);
  const prev = readJson(file, null);
  const fixes = prev && (!docKey || !prev.docKey || prev.docKey === docKey) ? prev : { scenes: {}, aiFix: {} };
  fixes.docKey = docKey || fixes.docKey || null;
  fixes.era = era;
  fixes.scenes ||= {};
  fixes.aiFix ||= {};
  const ids = [];
  let rejected = 0, aiRegen = 0, aiRepeat = 0;
  const toAiIds = [];
  for (const f of flagged) {
    if (f.kind === "archive" && f.url) {
      const e = (fixes.scenes[f.id] ||= { rejected: [] });
      const n0 = eraRejectionCount(e);
      // İmzalı/geçici adresler (pixabay.com/get/…) yeniden aramada değişir: sayfa adresi de reddedilir.
      if (!e.rejected.includes(f.url)) { e.rejected.push(f.url); rejected++; }
      if (f.page && !e.rejected.includes(f.page)) e.rejected.push(f.page);
      e.what = f.reason;
      e.n = n0 + 1;
      ids.push(f.id);
      // Aynı sahne İKİNCİ kez dönem dışı: stok/arşiv o sahne için dönem görüntüsü vermiyor
      // (1929: "banket salonu", "bozuk paralar", "kasa" her turda yeni bir modern stok karesi
      // getirdi). Bir daha aranmaz; dönemine sadık notla AI görseli üretilir.
      if (e.n >= ERA_AI_AFTER && !e.toAi) {
        e.toAi = true;
        fixes.aiFix[f.id] ||= aiFixNote(era, f.reason);
        toAiIds.push(f.id);
        logFn(`Sahne ${f.label || labelOf(f.id)}: ${e.n}. kez dönem dışı bulundu — arşivde yeniden aranmayacak, dönemine sadık notla AI görseli üretilecek`);
      }
    } else if (f.kind === "ai") {
      // AI bir kez yeniden üretilir: ikinci kez işaretlenen not taşıyan görsel olduğu gibi kalır.
      if (fixes.aiFix[f.id]) { aiRepeat++; logFn(`Sahne ${f.label}: AI görseli düzeltme notuyla da dönem dışı bulundu — olduğu gibi bırakıldı (inceleme önerilir)`); continue; }
      fixes.aiFix[f.id] = aiFixNote(era, f.reason);
      const base = String(f.file).replace(/\.lift\.jpg$/, ".jpg");
      for (const g of [base, base.replace(/\.jpg$/, ".lift.jpg")]) {
        try { if (g && publicDir) fs.rmSync(path.join(publicDir, g), { force: true }); } catch {}
      }
      aiRegen++;
    }
  }
  fixes.at = new Date().toISOString();
  fixes.rounds = (fixes.rounds || 0) + 1;
  writeJson(file, fixes);
  const invalidated = ids.length ? invalidateArchivePicks(dir, keyScript, ids) : 0;
  if (ids.length) logFn(`Dönem denetimi: ${ids.length} arşiv/stok seçimi reddedildi (${invalidated} önbellek kaydı silindi) — güncel kurallarla yeniden seçilecek`);
  if (aiRegen) logFn(`Dönem denetimi: ${aiRegen} AI görseli silindi — "dönemine sadık" notuyla bir kez yeniden üretilecek`);
  return { invalidated, rejected, aiRegen, aiRepeat, ids, toAi: toAiIds };
}

/** Künye reddedilen bir adresle (kaynak ya da sayfa; adres biçimi farkı photoKey ile) eşleşiyor mu? */
const isRejected = (f, c) => {
  const r = new Set((f?.rejected || []).filter(Boolean).map((u) => photoKey(u)));
  return [c?.url, c?.sayfa].some((u) => u && r.has(photoKey(u)));
};

/**
 * Motora giden senaryoya uygular (yerinde): reddedilen adres yeniden seçildiyse sahne/kare
 * AI görseline düşer; AI sahnesine/karesine aiFix notu yazılır.
 * @returns {{toAi, aiFix}}
 */
export function applyEraRejections(docu, credits, fixes, logFn = () => {}) {
  if (!fixes) return { toAi: 0, aiFix: 0 };
  const numeric = {};
  let toAi = 0;
  // İkinci kez dönem dışı bulunan sahne/kare: kaynağı ne olursa olsun AI; notu yoksa (eski kayıt) şimdi yazılır.
  const notlar = { ...(fixes.aiFix || {}) };
  const zorla = (k, f) => {
    if (!zorlaAi(f)) return false;
    notlar[k] ||= aiFixNote(fixes.era, f.what);
    return true;
  };
  for (const [k, f] of Object.entries(fixes.scenes || {})) {
    const m = String(k).match(/^(\d+)-m(\d+)$/);
    if (!m) { if (/^\d+$/.test(k)) numeric[k] = f; continue; }
    const s = docu.scenes[+m[1]];
    const p = s?.imagePrompts?.[+m[2]];
    const c = credits?.[`scene-${k}`];
    const z = zorla(k, f);
    if (!p || typeof p !== "object" || !p.image || (!z && (!c || !isRejected(f, c)))) continue;
    for (const x of ["image", "imgW", "imgH", "video", "videoStart", "videoDur", "videoW", "videoH"]) delete p[x];
    delete credits[`scene-${k}`];
    toAi++;
    logFn(z ? `Sahne ${labelOf(k)}: ${eraRejectionCount(f)} kez dönem dışı — kare dönemine sadık notla AI görseli` : `Sahne ${labelOf(k)}: dönem denetiminin reddettiği kaynak yeniden seçildi — kare AI görseline çevrildi`);
  }
  for (const [k, f] of Object.entries(numeric)) {
    const i = +k;
    const s = docu.scenes[i];
    const c = credits?.[`scene-${i}`];
    const z = zorla(k, f);
    if (!s?.archived || (!z && (!c || !isRejected(f, c)))) continue;
    for (const x of ["image", "imgW", "imgH", "video", "videoStart", "videoDur", "videoW", "videoH", "archived", "focus", "name", "role"]) delete s[x];
    delete credits[`scene-${i}`];
    toAi++;
    logFn(z ? `Sahne ${i + 1}: ${eraRejectionCount(f)} kez dönem dışı — dönemine sadık notla AI görseli` : `Sahne ${i + 1}: dönem denetiminin reddettiği kaynak yeniden seçildi — sahne AI görseline çevrildi`);
  }
  let aiFix = 0;
  for (const [k, note] of Object.entries(notlar)) {
    if (!note) continue;
    const m = String(k).match(/^(\d+)-m(\d+)$/);
    if (m) {
      const s = docu.scenes[+m[1]];
      const p = s?.imagePrompts?.[+m[2]];
      if (typeof p === "string") { s.imagePrompts[+m[2]] = { prompt: p, aiFix: note }; aiFix++; }
      else if (p && typeof p === "object" && !p.image && p.prompt) { p.aiFix = note; aiFix++; }
      continue;
    }
    const s = docu.scenes[+k];
    if (s && !s.archived && s.imagePrompt) { s.aiFix = note; aiFix++; }
  }
  return { toAi, aiFix };
}
