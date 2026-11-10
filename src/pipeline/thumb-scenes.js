// KAPAK SAHNELERİ (1.16.16, 15 Ekim 2026).
//
// Kanal verisi: tarih kanalında ana sayfa %1,3, arama %1,8, önerilenler %2,9 tıklandı — YouTube testi açmadan kesti;
// önerilenlerden gelen izleyici ise 4:29 izledi (içerik tutuyor, tıklanma tutmuyor). Bu ay 100-10 bin aboneli
// kanalların patlayan videolarının kapağı hikâyenin SAHNESİNİ gösteriyordu (mühürlü sığınak kapısı ve önünde bir adam,
// bayraklı savaş haritası, ünlünün yüzü) — çoğu yapay zekâyla çizilmiş, yazısız bir sahne + düz söyleyen 2-4 kelime.
// Videonun kendi karelerinden seçilen kapaklarımız şık ama şifreliydi.
//
// Paket planı (Opus) her video için 2 sahne tarifi yazar. OpenAI görsel kredisi varsa sahneler hemen çizilir;
// yoksa tarifler <iş>/kapak-kutusu/LISTE.txt'ye yazılır: ChatGPT'de üretilip 01.png / 02.png olarak oraya konur ve
// "Kapakları yenile" (POST /api/jobs/:id/package) kapakları bu sahnelerle yeniden çizer. Yazıyı Nova basar.
import fs from "node:fs";
import path from "node:path";

export const KUTU = "kapak-kutusu";
const EXT = /\.(png|jpe?g|webp)$/i;

/** Kapak sahnesi tarifinin sabit eki: yatay, yazısız, kapak için kurulmuş. */
export const SCENE_SUFFIX = "Photorealistic cinematic still for a YouTube thumbnail, 16:9 landscape, one clear focal subject large in the frame with empty space on one side for big words, dramatic light, high contrast, no text, no letters, no logos, no watermark.";

/** 01.png, 02.jpg … kutudaki sahne görselleri (sıralı). */
export function sceneFiles(jobDir) {
  const dir = path.join(jobDir, KUTU);
  try {
    return fs.readdirSync(dir).filter((f) => /^\d{2}\./.test(f) && EXT.test(f)).sort().map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

/** Kutudaki tarifler (prompts.json). */
export function scenePrompts(jobDir) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(jobDir, KUTU, "prompts.json"), "utf8"));
    return Array.isArray(j?.prompts) ? j.prompts : [];
  } catch {
    return [];
  }
}

/**
 * Kutudaki sahneleri kapak adayı yapar: motorun okuyabilmesi için yayın klasörüne (public/thumb-scenes) kopyalar.
 * `sizeOf(file)` → {w, h}. Aday türü "scene": kapak için çizilmiş sahne (videoda geçmez).
 */
export function sceneCandidates({ jobDir, publicDir, sizeOf: measure }) {
  // Tam GPT kapakları zaten yazılı: aday (yazı basılacak resim) olmazlar, doğrudan kapak olurlar.
  if (isFullInbox(jobDir)) return [];
  const files = sceneFiles(jobDir);
  if (!files.length) return [];
  const prompts = scenePrompts(jobDir);
  const outDir = path.join(publicDir, "thumb-scenes");
  fs.mkdirSync(outDir, { recursive: true });
  const out = [];
  files.forEach((file, i) => {
    const rel = `thumb-scenes/scene-${path.basename(file)}`;
    const abs = path.join(publicDir, rel);
    try {
      fs.copyFileSync(file, abs);
    } catch {
      return;
    }
    const size = measure(abs);
    if (!size?.w || !size?.h) return;
    out.push({ rel, abs, kind: "scene", provider: "ai-scene", source: "thumbnail scene", scene: 0, ctx: String(prompts[i] || "thumbnail scene").slice(0, 260), w: size.w, h: size.h, prescore: 9 - i * 0.1 });
  });
  return out;
}

/** Tarifleri kutuya yazar (LISTE.txt kullanıcı için, prompts.json Nova için). Kutuda görsel varsa dokunmaz. */
export function writeSceneInbox(jobDir, prompts, { title = "" } = {}) {
  const list = (Array.isArray(prompts) ? prompts : []).map((p) => String(p || "").trim()).filter(Boolean).slice(0, 2);
  if (!list.length) return null;
  const dir = path.join(jobDir, KUTU);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prompts.json"), JSON.stringify({ title, prompts: list }, null, 2), "utf8");
  const lines = [
    `KAPAK SAHNELERİ — ${title}`.trim(),
    "",
    "Her tarifi ChatGPT'de ayrı bir mesajla üret (yatay 16:9, YAZISIZ). Görseli bu klasöre numarasıyla kaydet:",
    "01.png = 1. tarif, 02.png = 2. tarif. Sonra Nova'da işin kartından \"Kapakları yenile\".",
    "",
    ...list.map((p, i) => `${String(i + 1).padStart(2, "0")}: ${p} ${SCENE_SUFFIX}`),
    "",
  ];
  fs.writeFileSync(path.join(dir, "LISTE.txt"), lines.join("\n"), "utf8");
  return path.join(dir, "LISTE.txt");
}

/* ================================================================ TAM GPT KAPAĞI (1.16.18, 20 Ekim 2026)
 *
 * Hürmüz videosu (haber kanalı): Nova'nın birleştirdiği kapak ("NO NAMES, NO PROOF?" + helikopter) %1,8 tıklandı.
 * Kanal sahibinin isteğiyle ChatGPT'de yazısı İÇİNDE tam kapak yaptırıldı — sahne (boğazın kuşbakışı, kıyıda İran
 * bayrağı, yanan iki tanker, suda mayınlar) + solda dev beyaz yoğun harfler, kalın siyah kontur, anahtar kelime sarı
 * ("2 TANKERS HIT / WHO MINED HORMUZ?") — ve üçü YouTube A/B testine kondu. ChatGPT yazıyı temiz basıyor; Nova'nın
 * fotoğraf + yazı birleştirmesinden açık ara güçlü. Artık paket her kapak için bu tarifi yazar: OpenAI kredisi varsa
 * hemen çizilir, yoksa kapak-kutusu/LISTE.txt (ChatGPT'de üret → 01.png 02.png 03.png → "Kapakları yenile").
 * Kutudaki görseller kapağın KENDİSİDİR (yazı üstüne yazı basılmaz): 1280x720'ye getirilip thumb_a/b/c olur.
 */

/** Kapak yazısı satırlara: " / " varsa oradan, yoksa iki dengeli satır (tek kelime tek satır). */
export function thumbLines(text) {
  const t = String(text || "").replace(/["“”]/g, "").trim();
  if (!t) return [];
  if (t.includes("/")) return t.split("/").map((x) => x.trim()).filter(Boolean).slice(0, 3);
  const ws = t.split(/\s+/);
  if (ws.length <= 2) return [ws.join(" ")];
  let best = 1, diff = Infinity;
  for (let k = 1; k < ws.length; k++) {
    const d = Math.abs(ws.slice(0, k).join(" ").length - ws.slice(k).join(" ").length);
    if (d < diff) { diff = d; best = k; }
  }
  return [ws.slice(0, best).join(" "), ws.slice(best).join(" ")];
}

/**
 * Hürmüz'de tutan tarif: sahne + sol tarafta dev yazı (anahtar kelime sarı) + isteğe bağlı küçük kırmızı etiket.
 * `scene` modelin sahne tarifi (yazısız), `text` kapağın 2-4 kelimesi, `key` sarıya boyanacak kelime, `tag` etiket.
 */
export function fullThumbPrompt({ scene, text, key = "", tag = "" }) {
  const lines = thumbLines(text);
  const keyWord = String(key || "").replace(/["“”?!.,]/g, "").trim();
  return [
    "Create a YouTube thumbnail image, 16:9 landscape (1536x1024), photorealistic, cinematic, very high contrast, readable at a tiny size.",
    "",
    `Scene: ${String(scene || "").trim()} The main subject is big and sits on the right half of the frame. No people's faces of real persons, no injuries, no gore.`,
    "",
    `Text on the left side, huge bold white condensed sans-serif letters with a thick black outline and a subtle shadow, ${lines.length > 1 ? `${lines.length} lines` : "one line"}:`,
    ...lines.map((l) => `"${l}"`),
    keyWord ? `(the word ${keyWord.toUpperCase()} in bright yellow)` : null,
    "",
    tag ? `Small red label above the text: "${String(tag).toUpperCase()}".` : null,
    "No other text, no logos, no watermark. One clear focal point.",
  ].filter((x) => x !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

/** Kutu tam kapak kutusu mu (prompts.json full:true)? */
export function isFullInbox(jobDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(jobDir, KUTU, "prompts.json"), "utf8"))?.full === true;
  } catch {
    return false;
  }
}

/** Tam kapak görselleri (kutu full ise 01..03), değilse boş. */
export function fullThumbFiles(jobDir) {
  return isFullInbox(jobDir) ? sceneFiles(jobDir).slice(0, 3) : [];
}

/** Tam kapak tariflerini kutuya yazar (her kapak ayrı ChatGPT mesajı). */
export function writeFullInbox(jobDir, prompts, { title = "" } = {}) {
  const list = (Array.isArray(prompts) ? prompts : []).map((p) => String(p || "").trim()).filter(Boolean).slice(0, 3);
  if (!list.length) return null;
  const dir = path.join(jobDir, KUTU);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "prompts.json"), JSON.stringify({ title, full: true, prompts: list }, null, 2), "utf8");
  const lines = [
    `KAPAKLAR (ChatGPT) — ${title}`.trim(),
    "",
    "Her tarifi ChatGPT'de AYRI bir mesajla gönder (aynı sohbette olabilir). Gelen kapağı bu klasöre numarasıyla kaydet:",
    "01.png = 1. kapak, 02.png = 2. kapak, 03.png = 3. kapak. Sonra Nova'da işin kartından \"🖼 Kapakları yenile\".",
    "Kapaklar YouTube'da Test ve karşılaştır'a üçü birden yüklenir.",
    "",
    ...list.flatMap((p, i) => [`===== ${String(i + 1).padStart(2, "0")} =====`, p, ""]),
  ];
  fs.writeFileSync(path.join(dir, "LISTE.txt"), lines.join("\n"), "utf8");
  return path.join(dir, "LISTE.txt");
}

/** OpenAI kredisi varsa tam kapakları hemen çizer (01.jpg…). Kredi yoksa 0 (tarifler kutuda kalır). */
export async function autoFullThumbs({ jobDir, prompts, settings = {}, textToImage, logFn = () => {} }) {
  if (!textToImage || !settings.openaiKey || settings.docuThumbScenes === false) return 0;
  if (sceneFiles(jobDir).length) return 0;
  const dir = path.join(jobDir, KUTU);
  fs.mkdirSync(dir, { recursive: true });
  let made = 0;
  for (const [i, p] of prompts.slice(0, 3).entries()) {
    try {
      const url = await textToImage(p, { ...settings, kanvasW: 1920, kanvasH: 1080 });
      const m = /^data:[^;]+;base64,(.+)$/.exec(url || "");
      if (!m) throw new Error("görsel boş döndü");
      fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(2, "0")}.jpg`), Buffer.from(m[1], "base64"));
      made++;
    } catch (e) {
      logFn(`GPT kapağı çizilemedi (${String(e?.message || e).slice(0, 120)}) — tarifler kapak-kutusu/LISTE.txt'de, ChatGPT'den üretilebilir`);
      break;
    }
  }
  return made;
}

/**
 * OpenAI görsel kredisi varsa sahneleri hemen çizer (kutuya 01.jpg, 02.jpg). Kredi/anahtar yoksa ya da çağrı düşerse
 * sessizce 0 döner (tarifler kutuda kalır). `textToImage(prompt, settings)` → data URL.
 */
export async function autoScenes({ jobDir, prompts, settings = {}, textToImage, logFn = () => {} }) {
  if (!textToImage || !settings.openaiKey || settings.docuThumbScenes === false) return 0;
  if (sceneFiles(jobDir).length) return 0;
  const dir = path.join(jobDir, KUTU);
  fs.mkdirSync(dir, { recursive: true });
  let made = 0;
  for (const [i, p] of prompts.slice(0, 2).entries()) {
    try {
      const url = await textToImage(`${p} ${SCENE_SUFFIX}`, { ...settings, kanvasW: 1920, kanvasH: 1080 });
      const m = /^data:[^;]+;base64,(.+)$/.exec(url || "");
      if (!m) throw new Error("görsel boş döndü");
      fs.writeFileSync(path.join(dir, `${String(i + 1).padStart(2, "0")}.jpg`), Buffer.from(m[1], "base64"));
      made++;
    } catch (e) {
      logFn(`Kapak sahnesi çizilemedi (${String(e?.message || e).slice(0, 120)}) — tarif kapak-kutusu/LISTE.txt'de, ChatGPT'den üretilebilir`);
      break;
    }
  }
  return made;
}
