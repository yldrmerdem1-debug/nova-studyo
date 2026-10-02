import { fileAvailable, validMedia } from "./checkpoints.js";
import { animationCount } from '../../public/production-modes.js';
// KOLAJ MODU — editoryal karışık-teknik kolaj üretim hattı.
//
// Stok görsel aramak yerine her beat için YAZISIZ kavram grafiği üretir,
// sonra onu sade bir hareketle animasyona çevirir.
//
//   beat → keyframe (Seedream t2i / i2i)  → animasyon (image-to-video) → montaj
//
// Stil kilidi: ilk keyframe "çapa" olur, kalanlar image-to-image ile çapayı
// referans alarak üretilir — böylece 14 karenin hepsi aynı dergi sayfasından
// çıkmış gibi durur.

import fs from "node:fs";
import path from "node:path";
import { getSettings, encThreads } from "../config.js";
import { downloadFile, mapLimit, run, ffprobeDuration, sleep } from "../util.js";
import { openAIImagesProvider } from "./openai-images.js";

// ---------------------------------------------------------------- stil sabitleri

export const RED = "#E02417";
export const RED_FF = "0xE02417"; // ffmpeg drawbox: 0xRRGGBB

/** Her keyframe promptunun sonuna aynen eklenir — stilin tek kaynağı burası. */
export const STYLE_SUFFIX =
  "Editorial mixed-media collage style: illustrated paper cutouts with white sticker " +
  "borders and soft drop shadows on textured aged-cream paper, halftone dot accents, " +
  "washi tape strips, one or two flat geometric shapes in red (#E02417), strictly " +
  "limited palette of cream, charcoal ink and red, generous margins, flat graphic " +
  "lighting, print-media texture. NOT photorealistic, no 3D rendering, no gradients, " +
  "no color photograph. NO TEXT, no letters, no numbers, no words anywhere in the image.";

/** Her animasyon isteğine aynen eklenir — sade hareket, morphing yok. */
export const ANIM_PROMPT =
  "Subtle motion graphics: elements settle into place, slow 2D push-in, gentle paper " +
  "parallax. Flat paper cutouts. No people, no morphing, no face animation, no 3D rotation, " +
  "no text warping.";

/**
 * FOTOGERÇEKÇİ TAM AI — kolajdan farklı görsel dil.
 *
 * Kolaj stili bilerek insansızdı ("no people, no face animation"): kâğıt kesme
 * estetiğinde yüz canlandırmak morphing üretiyordu. Fotogerçekçi modda ise
 * hareket eden insan tam da beklenen şey; fren tamamen kaldırılmıyor ama
 * bozulmanın kendisine (morphing/warping) çevriliyor.
 */
export const CINEMA_SUFFIX =
  "Photorealistic cinematic documentary still, shot on ARRI Alexa with 35mm anamorphic " +
  "lens, shallow depth of field, natural motivated lighting, subtle film grain, " +
  "high dynamic range, filmic color grade. Consistent physical world and " +
  "lighting across the sequence. NO TEXT, no letters, no numbers, no watermark, no logos.";

export const CINEMA_ANIM =
  "Natural cinematic motion: subjects move and gesture believably, slow deliberate " +
  "camera movement (dolly-in or gentle handheld drift), ambient environmental motion. " +
  "Keep facial features and clothing consistent. No morphing, no warping, no melting " +
  "faces, no text.";

/** Tam-AI görsel dilleri. Anahtar job.aiStyle'dan gelir. */
export const AI_STYLES = {
  kolaj: { ad: "Kâğıt kolaj", suffix: STYLE_SUFFIX, anim: ANIM_PROMPT },
  sinematik: { ad: "Fotogerçekçi sinematik", suffix: CINEMA_SUFFIX, anim: CINEMA_ANIM },
};

export function styleOf(job) {
  if (job?.visualStyle === 'kolaj') return AI_STYLES.kolaj;
  return (Object.hasOwn(AI_STYLES,job?.aiStyle) ? AI_STYLES[job.aiStyle] : null) || (job?.mediaKind === "fullai" ? AI_STYLES.sinematik : AI_STYLES.kolaj);
}

export function keyframePrompt(concept, stil = AI_STYLES.kolaj) {
  const c = (concept || "").trim().replace(/\s+/g, " ").slice(0, 320);
  return `${c}. ${stil.suffix}`;
}

/**
 * ÇAPAYA BAĞLI KARE — stil kilidi, İÇERİK kilidi DEĞİL.
 *
 * Çapa görseli image-to-image girdisi olarak veriliyor ve kullanılan modeller
 * (nano-banana, seedream) bunu bir DÜZENLEME işi sayıyor: verilen kareyi
 * değiştirip döndürüyorlar. Düz `${concept}. ${suffix}` promptuyla ölçüldü —
 * "uzayda skafandersiz astronot" istendi, çapadaki kafa kesitinin bir varyantı
 * geldi. 87 sahnelik bir işte her sahne ilk sahneye benzerdi.
 *
 * Bu yüzden referansın rolü prompt'ta AÇIKÇA söyleniyor: paleti, ışığı, dokuyu
 * al; konuyu ve kompozisyonu ALMA.
 */
export function keyframeI2IPrompt(concept, stil = AI_STYLES.kolaj) {
  const c = (concept || "").trim().replace(/\s+/g, " ").slice(0, 320);
  return `Create a COMPLETELY NEW image. Subject: ${c}. ${stil.suffix}\n\n` +
    `The attached image is a STYLE REFERENCE ONLY. Copy its color palette, lighting ` +
    `character, texture and rendering technique so the two images look like they belong ` +
    `to the same film. Do NOT copy its subject, objects, composition or framing — ` +
    `the new image must depict: ${c}`;
}

// ---------------------------------------------------------------- maliyet

const PRICE = { keyframe: 0.04, clip: 0.30 };

export function estimateCost(beatCount, { animate = true, mode } = {}) {
  const margin = 1.15; // ~%15 yeniden üretim payı
  const keyframes = beatCount * PRICE.keyframe * margin;
  const clips = animationCount(beatCount,mode || (animate?'acik':'kapali')) * PRICE.clip * margin;
  return {
    beats: beatCount,
    keyframes: +keyframes.toFixed(2),
    clips: +clips.toFixed(2),
    total: +(keyframes + clips).toFixed(2),
    perKeyframe: PRICE.keyframe,
    perClip: PRICE.clip,
  };
}

// ---------------------------------------------------------------- sağlayıcı katmanı
//
// Her sağlayıcı üç işi yapar: text→image, image→image (stil kilidi), image→video.
// Yeni sağlayıcı eklemek = buraya üç fonksiyonlu bir nesne eklemek.

const firstImageUrl = (d) => d?.images?.[0]?.url || d?.image?.url || d?.output?.[0]?.url || d?.url;
const firstVideoUrl = (d) => d?.video?.url || d?.videos?.[0]?.url || d?.output?.url || d?.url;

// ---- fal.ai: senkron, tek POST ----

async function falRun(model, input, s) {
  if (!s.falKey) throw new Error("fal.ai anahtarı yok — Ayarlar'dan ekleyin veya Dry-run kullanın.");
  const res = await provFetch(s, `https://fal.run/${String(model).replace(/^\/+/, "")}`, {
    method: "POST",
    headers: { Authorization: `Key ${s.falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fal.ai ${model} HTTP ${res.status}: ${text.slice(0, 220)}`);
  try { return JSON.parse(text); } catch { throw new Error(`fal.ai geçersiz yanıt: ${text.slice(0, 160)}`); }
}

const falProvider = {
  name: "fal.ai",
  async textToImage(prompt, s) {
    const d = await falRun(s.falImageModel || "fal-ai/bytedance/seedream/v4/text-to-image", {
      prompt, image_size: { width: s.kanvasW || 1920, height: s.kanvasH || 1080 }, num_images: 1,
    }, s);
    const url = firstImageUrl(d);
    if (!url) throw new Error("fal.ai: görsel URL'si yok");
    return url;
  },
  async imageToImage(prompt, anchorUrl, s) {
    const d = await falRun(s.falImageEditModel || "fal-ai/bytedance/seedream/v4/edit", {
      prompt, image_urls: [anchorUrl], image_size: { width: s.kanvasW || 1920, height: s.kanvasH || 1080 }, num_images: 1,
    }, s);
    const url = firstImageUrl(d);
    if (!url) throw new Error("fal.ai: düzenlenmiş görsel URL'si yok");
    return url;
  },
  async imageToVideo(prompt, imageUrl, seconds, s) {
    const d = await falRun(s.falVideoModel || "fal-ai/bytedance/seedance/v1/pro/image-to-video", {
      prompt, image_url: imageUrl, duration: seconds, resolution: "1080p",
    }, s);
    const url = firstVideoUrl(d);
    if (!url) throw new Error("fal.ai: video URL'si yok");
    return url;
  },
};

// ---- Kie AI: asenkron görev + yoklama (createTask → recordInfo) ----

async function kieCreateTask(model, input, s) {
  if (!s.kieKey) throw new Error("Kie AI anahtarı yok — Ayarlar'dan ekleyin veya Dry-run kullanın.");
  const res = await provFetch(s, "https://api.kie.ai/api/v1/jobs/createTask", {
    method: "POST",
    headers: { Authorization: `Bearer ${s.kieKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kie AI ${model} HTTP ${res.status}: ${text.slice(0, 220)}`);
  let d;
  try { d = JSON.parse(text); } catch { throw new Error(`Kie AI geçersiz yanıt: ${text.slice(0, 160)}`); }
  if (d.code !== 200 || !d.data?.taskId) throw new Error(`Kie AI görev açılamadı: ${d.msg || text.slice(0, 160)}`);
  return d.data.taskId;
}

/** resultJson bazen JSON string, bazen nesne gelir — ikisini de aç. */
function kieResultUrls(rec) {
  let r = rec?.resultJson ?? rec?.response ?? rec;
  if (typeof r === "string") { try { r = JSON.parse(r); } catch { return []; } }
  const urls = r?.resultUrls || r?.resultURLs || r?.urls || r?.output || [];
  if (Array.isArray(urls)) return urls.filter((u) => typeof u === "string");
  return typeof urls === "string" ? [urls] : [];
}

/**
 * Sağlayıcı çağrılarına iptal bilgisini taşır. Yoklama döngüleri 10-15 dk sürebiliyor;
 * iptal edilmezse kullanıcı "İptal" dedikten sonra da ücretli üretim devam eder.
 */
/** Kanvas bilgisini sağlayıcı isteklerine taşır (her sağlayıcı farklı alan istiyor). */
export function withKanvas(s, kanvas) {
  return kanvas ? { ...s, kanvasW: kanvas.w, kanvasH: kanvas.h, kanvasOran: kanvas.ratio } : s;
}

export function withCancel(s, isCancelled, killer) {
  return { ...s, __cancel: isCancelled || (() => false), __signal: killer?.signal?.() };
}
function stopIfCancelled(s) {
  if (s?.__cancel?.()) throw new Error("cancelled");
}
function provFetch(s, url, init = {}) {
  stopIfCancelled(s);
  return fetch(url, { ...init, signal: init.signal || s?.__signal });
}

async function kieAwait(taskId, s, timeoutMs = 10 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(5000);
    stopIfCancelled(s);
    const res = await provFetch(s, `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${s.kieKey}` },
    });
    if (!res.ok) continue;
    const d = await res.json().catch(() => null);
    const rec = d?.data;
    const state = String(rec?.state || rec?.status || "").toLowerCase();
    if (state === "success" || rec?.successFlag === 1) {
      const urls = kieResultUrls(rec);
      if (!urls.length) throw new Error("Kie AI: sonuç URL'si boş");
      return urls[urls.length - 1];
    }
    if (state === "fail" || state === "failed" || state === "error") {
      throw new Error(`Kie AI görev başarısız: ${rec?.failMsg || rec?.failCode || "bilinmeyen"}`);
    }
  }
  throw new Error("Kie AI zaman aşımı");
}

const kieProvider = {
  name: "Kie AI",
  async textToImage(prompt, s) {
    const id = await kieCreateTask(s.kieImageModel || "nano-banana-2", {
      prompt, aspect_ratio: s.kanvasOran || "16:9", resolution: "2K", output_format: "jpg",
    }, s);
    return kieAwait(id, s);
  },
  async imageToImage(prompt, anchorUrl, s) {
    const id = await kieCreateTask(s.kieImageModel || "nano-banana-2", {
      prompt, image_input: [anchorUrl], aspect_ratio: s.kanvasOran || "16:9", resolution: "2K", output_format: "jpg",
    }, s);
    return kieAwait(id, s);
  },
  async imageToVideo(prompt, imageUrl, seconds, s) {
    const id = await kieCreateTask(s.kieVideoModel || "veo3-fast", {
      prompt, image_urls: [imageUrl], aspect_ratio: s.kanvasOran || "16:9", duration: seconds,
    }, s);
    return kieAwait(id, s, 15 * 60 * 1000);
  },
};

// ---- Higgsfield: asenkron görev + yoklama ----

async function hfCreate(body, s) {
  if (!s.higgsKey) throw new Error("Higgsfield anahtarı yok — Ayarlar'dan ekleyin veya Dry-run kullanın.");
  const res = await provFetch(s, "https://api.higgsfield.ai/v1/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${s.higgsKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Higgsfield HTTP ${res.status}: ${text.slice(0, 220)}`);
  let d;
  try { d = JSON.parse(text); } catch { throw new Error(`Higgsfield geçersiz yanıt: ${text.slice(0, 160)}`); }
  const id = d.generation_id || d.id || d.data?.id;
  if (!id) throw new Error(`Higgsfield görev kimliği yok: ${text.slice(0, 160)}`);
  return id;
}

async function hfAwait(id, s, timeoutMs = 12 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(5000);
    stopIfCancelled(s);
    const res = await provFetch(s, `https://api.higgsfield.ai/v1/generations/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${s.higgsKey}` },
    });
    if (!res.ok) continue;
    const d = await res.json().catch(() => null);
    const st = String(d?.status || d?.state || "").toLowerCase();
    if (st === "completed" || st === "success" || st === "succeeded") {
      const url = d?.output?.url || d?.output_url || d?.result?.url ||
        (Array.isArray(d?.output) ? d.output[d.output.length - 1] : null) || d?.url;
      if (!url) throw new Error("Higgsfield: çıktı URL'si yok");
      return typeof url === "string" ? url : url.url;
    }
    if (st === "failed" || st === "error") throw new Error(`Higgsfield başarısız: ${d?.error || d?.message || "bilinmeyen"}`);
  }
  throw new Error("Higgsfield zaman aşımı");
}

const higgsProvider = {
  name: "Higgsfield",
  // Higgsfield'da belgelenmiş image-to-image yok — stil kilidi promptla sağlanır (daha zayıf)
  weakStyleLock: true,
  async textToImage(prompt, s) {
    const id = await hfCreate({
      task: "text-to-image",
      model: s.higgsImageModel || "flux",
      prompt, width: s.kanvasW || 1920, height: s.kanvasH || 1080,
    }, s);
    return hfAwait(id, s);
  },
  async imageToImage(prompt, anchorUrl, s) {
    // i2i desteklenmiyor: aynı stil tarifiyle yeniden üret
    return higgsProvider.textToImage(prompt, s);
  },
  async imageToVideo(prompt, imageUrl, seconds, s) {
    const id = await hfCreate({
      task: "image-to-video",
      model: s.higgsVideoModel || undefined,
      image_url: imageUrl, prompt, duration: seconds, motion_intensity: "low",
    }, s);
    return hfAwait(id, s);
  },
};

const IMAGE_PROVIDERS = { fal: falProvider, kie: kieProvider, higgs: higgsProvider, openai: openAIImagesProvider };
const VIDEO_PROVIDERS = { fal: falProvider, kie: kieProvider, higgs: higgsProvider };

const keyOf = { fal: "falKey", kie: "kieKey", higgs: "higgsKey", openai: "openaiKey" };

/** Keyframe ve animasyon ayrı sağlayıcıdan olabilir (örn. görsel Kie, animasyon Higgsfield). */
export function imageProvider(s = getSettings()) {
  return IMAGE_PROVIDERS[s.imageProvider] || IMAGE_PROVIDERS.kie;
}
export function videoProvider(s = getSettings()) {
  return VIDEO_PROVIDERS[s.videoProvider] || VIDEO_PROVIDERS.kie;
}

export function providerReady(s = getSettings(), {animate = true} = {}) {
  const has = (p) => !!s[keyOf[p]];
  return has(s.imageProvider || "kie") && (!animate || has(s.videoProvider || "kie"));
}

// ---------------------------------------------------------------- dry-run üretici

/**
 * Anahtarsız test için yerel yer tutucu keyframe: krem kağıt + kömür + tek kırmızı.
 * Gerçek üretimin yerini tutmaz ama tüm montaj hattını uçtan uca test ettirir.
 */
async function dryKeyframe(concept, dest, index, killer, kanvas, st = getSettings()) {
  const KW = kanvas?.w || 1920, KH = kanvas?.h || 1080;
  // Şekil koordinatları 1920×1080 için çizilmişti; oranla taşınır ki dikeyde
  // kanvas dışına düşmesin.
  const px = (v) => Math.round((v / 1920) * KW);
  const py = (v) => Math.round((v / 1080) * KH);
  const shapes = [
    `drawbox=x=${px(760)}:y=${py(300)}:w=${px(400)}:h=${py(400)}:color=0x2A2A2E@0.92:t=fill`,
    `drawbox=x=${px(700)}:y=${py(360)}:w=${px(520)}:h=${py(280)}:color=0x2A2A2E@0.9:t=fill`,
    `drawbox=x=${px(820)}:y=${py(250)}:w=${px(280)}:h=${py(520)}:color=0x2A2A2E@0.9:t=fill`,
    `drawbox=x=${px(660)}:y=${py(380)}:w=${px(600)}:h=${py(240)}:color=0x2A2A2E@0.88:t=fill`,
  ];
  const accents = [
    `drawbox=x=${px(1180)}:y=${py(250)}:w=${px(120)}:h=${py(120)}:color=${RED_FF}@1:t=fill`,
    `drawbox=x=${px(620)}:y=${py(700)}:w=${px(220)}:h=${py(26)}:color=${RED_FF}@1:t=fill`,
    `drawbox=x=${px(1140)}:y=${py(680)}:w=${px(90)}:h=${py(90)}:color=${RED_FF}@1:t=fill`,
  ];
  const vf = [
    `drawbox=x=0:y=0:w=${KW}:h=${KH}:color=0xE8DCC8@1:t=fill`,
    `drawbox=x=${px(560)}:y=${py(180)}:w=${px(800)}:h=${py(720)}:color=0xF4EBDC@1:t=fill`,
    shapes[index % shapes.length],
    accents[index % accents.length],
    `noise=alls=9:allf=t+u`,
  ].join(",");
  await run(st.ffmpegPath, [
    "-f", "lavfi", "-i", `color=c=0xE8DCC8:s=${KW}x${KH}`,
    "-vf", vf, "-frames:v", "1", "-q:v", "2", "-y", dest,
  ], { killer });
  return dest;
}

async function dryClip(keyframeFile, dest, seconds, index, killer, kanvas, st = getSettings()) {
  const N = Math.max(2, Math.round(seconds * st.fps));
  const K = kanvas || { w: 1920, h: 1080, yakin: "scale=2112:1188,crop=1920:1080", zp: (f) => `:s=1920x1080:fps=${f}` };
  // sade 2D push-in — spec: yavaşlatma yok, morphing yok
  const zoom = `zoompan=z='1.02+0.06*on/${Math.max(1, N - 1)}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${N}${K.zp(st.fps)}`;
  await run(st.ffmpegPath, [
    "-i", keyframeFile, "-vf", `${K.yakin},${zoom},setsar=1,format=yuv420p`,
    "-frames:v", String(N), "-r", String(st.fps),
    // Tavan: bu da paralel çağrılıyor (bkz. config.js encThreads — sınırsız
    // bırakılan kodlamalar 10 paralelde belleği tüketip işi öldürüyordu).
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-threads", encThreads(st), "-an", "-y", dest,
  ], { killer });
  return dest;
}

// ---------------------------------------------------------------- keyframe üretimi

/**
 * Tüm beat'ler için keyframe üretir. İlk kare çapa, kalanlar image-to-image ile
 * çapaya bağlanır → stil kilidi.
 * @returns [{ beatId, file, url }]
 */
export async function generateKeyframes(beats, dir, { dryRun, logFn, isCancelled, killer, stil = AI_STYLES.kolaj, kanvas, cached = [], onResult = () => {}, settings = getSettings() }) {
  const saved = new Map(cached.filter(k => fileAvailable(k.file)).map(k => [k.beatId,k]));
  if(beats.every(b => saved.has(b.id))) return beats.map(b => saved.get(b.id));
  const s = withKanvas(withCancel(settings, isCancelled, killer), kanvas);
  fs.mkdirSync(dir, { recursive: true });
  const out = [];

  if (dryRun) {
    logFn(`Dry-run: ${beats.length} yer tutucu keyframe üretiliyor (ücretsiz, yerel)...`);
    for (let i = 0; i < beats.length; i++) {
      if (isCancelled()) throw new Error("cancelled");
      if(saved.has(beats[i].id)) { out.push(saved.get(beats[i].id)); continue; }
      const file = path.join(dir, `${beats[i].id}.jpg`);
      await dryKeyframe(beats[i].concept, file, i, killer, kanvas, s);
      const k={ beatId: beats[i].id, file, url: null }; onResult(k); out.push(k);
    }
    return out;
  }

  const prov = imageProvider(s);

  // 1) Çapa kare
  logFn(`Çapa keyframe üretiliyor (${prov.name})...`);
  if (prov.weakStyleLock) {
    logFn(`Not: ${prov.name} image-to-image desteklemiyor — stil kilidi sadece promptla sağlanacak, kareler arası tutarlılık daha zayıf olabilir.`);
  }
  const existingAnchor = saved.get(beats[0].id);
  if(existingAnchor && !existingAnchor.url) throw new Error("Çapa görseli var ancak sağlayıcı bağlantısı eksik. Kaynak korundu; eksik sahnelere yerel görsel seçin.");
  const anchorUrl = existingAnchor?.url || await prov.textToImage(keyframePrompt(beats[0].concept, stil), s);
  const anchorFile = existingAnchor?.file || path.join(dir, `${beats[0].id}.jpg`);
  if(!existingAnchor) { await downloadFile(anchorUrl, anchorFile, { timeoutMs: 90000 }); onResult({beatId:beats[0].id,file:anchorFile,url:anchorUrl}); }
  out.push(existingAnchor || { beatId: beats[0].id, file: anchorFile, url: anchorUrl });
  logFn(`Çapa hazır — kalan ${beats.length - 1} kare bu stile kilitlenerek üretilecek.`);

  // 2) Kalanlar: çapayı referans alan image-to-image
  const rest = beats.slice(1);
  let done = 0;
  const results = await mapLimit(rest, 3, async (b) => {
    if(saved.has(b.id)) return saved.get(b.id);
    if (isCancelled()) throw new Error("cancelled");
    const url = await prov.imageToImage(keyframeI2IPrompt(b.concept, stil), anchorUrl, s);
    const file = path.join(dir, `${b.id}.jpg`);
    await downloadFile(url, file, { timeoutMs: 90000 });
    done++;
    if (done % 3 === 0 || done === rest.length) logFn(`Keyframe: ${done + 1}/${beats.length}`);
    const result={ beatId: b.id, file, url }; onResult(result); return result;
  });

  for (const r of results) {
    if (!r.ok) throw r.error;
    out.push(r.value);
  }
  // beat sırasına göre diz
  const order = new Map(beats.map((b, i) => [b.id, i]));
  out.sort((a, b) => order.get(a.beatId) - order.get(b.beatId));
  return out;
}

// ---------------------------------------------------------------- animasyon

/**
 * Her keyframe'i image-to-video ile canlandırır.
 * Spec: gereken süreden UZUN üret, montajda kırp — asla yavaşlatma.
 * @returns { [beatId]: { file, type:"video", provider } }
 */
/**
 * VİDEO ÜRETİMİ ŞU AN KULLANILABİLİR Mİ? Bir kez yoklanır, sonuç önbelleklenir.
 *
 * Neden gerekli: sağlayıcıda video modeli olmayınca animasyon HER KLİPTE tek tek
 * deneniyor, tek tek patlıyor ve durağan kareye düşülüyordu. 87 sahnelik bir işte
 * bu 87 boşa istek demek — hem dakikalar hem gereksiz gürültü. Ölçüldü
 * (2026-08-07): "veo3-fast" tanınmıyor, sora-2 duraklatılmış.
 *
 * Yoklama ucuz: eksik girdiyle görev açılır, sunucu modeli tanıyor mu bakılır.
 *   422 → model yok · "temporarily paused" → kapalı · başka hata → çalışır.
 */
const videoHazirCache = new Map();
export async function videoUretimiHazir(logFn = () => {}, s = getSettings()) {
  const model = s.kieVideoModel || "sora-2-image-to-video";
  if ((s.videoProvider || s.imageProvider) !== "kie" || !s.kieKey) return true;
  const cacheKey=JSON.stringify([s.videoProvider || s.imageProvider,model]);
  if(videoHazirCache.has(cacheKey)) return videoHazirCache.get(cacheKey);
  let ready=true;
  try {
    const r = await fetch("https://api.kie.ai/api/v1/jobs/createTask", {
      method: "POST",
      headers: { Authorization: `Bearer ${s.kieKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: {} }),
    });
    const d = await r.json();
    const msg = String(d?.msg || "");
    if (d?.code === 422) { logFn(`Video modeli "${model}" sağlayıcıda tanınmıyor — animasyon atlanacak.`); ready = false; }
    else if (/paused|maintenance/i.test(msg)) { logFn(`Video üretimi sağlayıcıda geçici olarak kapalı — animasyon atlanacak.`); ready = false; }
  } catch {
    return true;   // geçici bağlantı hatasını kalıcı yetenek bilgisi olarak saklama
  }
  videoHazirCache.set(cacheKey,ready);
  return ready;
}

export async function animateKeyframes(beats, keyframes, dir, { dryRun, animate, mode, logFn, isCancelled, killer, stil = AI_STYLES.kolaj, kanvas, cached = {}, onResult = () => {}, settings = getSettings() }) {
  if(beats.every(b => validMedia(cached[b.id]))) return Object.fromEntries(beats.map(b => [b.id,cached[b.id]]));
  if (mode === 'hibrit') {
    const count=animationCount(beats.length,mode);
    const selected=new Set(Array.from({length:count},(_,i)=>Math.floor(i*beats.length/count)));
    const options={dryRun,logFn,isCancelled,killer,stil,kanvas,cached,onResult,settings};
    logFn(`Hibrit: ${count}/${beats.length} sahne animasyon, kalanlar durağan kare.`);
    const still=await animateKeyframes(beats.filter((_,i)=>!selected.has(i)),keyframes,dir,{...options,animate:false});
    const moving=await animateKeyframes(beats.filter((_,i)=>selected.has(i)),keyframes,dir,{...options,animate:true});
    return Object.fromEntries(beats.map(b=>[b.id,moving[b.id]||still[b.id]]));
  }
  if (mode === 'kapali') animate=false;
  const s = withCancel(settings, isCancelled, killer);
  fs.mkdirSync(dir, { recursive: true });
  const kfByBeat = new Map(keyframes.map((k) => [k.beatId, k]));
  const media = {};
  const save = (id,m) => { media[id]=m; onResult({beatId:id,...m}); return m; };

  // Animasyon istendi ama sağlayıcı veremiyorsa: 87 boşa istek atma, baştan
  // durağan kareye geç ve NEDENİNİ söyle.
  if (animate && !dryRun && !(await videoUretimiHazir(logFn,s))) {
    for (const b of beats) {
      if(validMedia(cached[b.id])) { save(b.id,cached[b.id]); continue; }
      const kf = kfByBeat.get(b.id);
      if (kf) save(b.id, validMedia(cached[b.id]) ? cached[b.id] : { file: kf.file, type: "image", provider: "kolaj" });
    }
    logFn(`${beats.length} sahne durağan kare olarak kullanılacak (klip ücreti alınmadı).`);
    return media;
  }

  if (!animate) {
    // "Kapalı" mod: animasyon yok, keyframe'ler montajda sade push-in ile kullanılır
    for (const b of beats) {
      if(validMedia(cached[b.id])) { save(b.id,cached[b.id]); continue; }
      const kf = kfByBeat.get(b.id);
      if (kf) save(b.id, validMedia(cached[b.id]) ? cached[b.id] : { file: kf.file, type: "image", provider: "kolaj" });
    }
    logFn(`Kapalı mod: ${beats.length} keyframe hareketsiz kullanılacak (montajda sade push-in eklenir).`);
    return media;
  }

  if (dryRun) {
    logFn(`Dry-run: ${beats.length} klip yerel push-in ile üretiliyor (ücretsiz)...`);
    for (const b of beats) {
      if (isCancelled()) throw new Error("cancelled");
      if(validMedia(cached[b.id])) { media[b.id]=cached[b.id]; continue; }
      const kf = kfByBeat.get(b.id);
      if (!kf) continue;
      const file = path.join(dir, `${b.id}.mp4`);
      await dryClip(kf.file, file, b.duration * 1.15 + 0.5, beats.indexOf(b), killer, kanvas, s);
      save(b.id,{ file, type: "video", provider: "kolaj-dry" });
    }
    return media;
  }

  const prov = videoProvider(s);
  logFn(`${beats.length} klip canlandırılıyor (${prov.name})... bu adım dakikalar sürer.`);
  let done = 0;
  const results = await mapLimit(beats, 2, async (b) => {
    if(validMedia(cached[b.id])) return {beatId:b.id,...cached[b.id],cached:true};
    if (isCancelled()) throw new Error("cancelled");
    const kf = kfByBeat.get(b.id);
    if (!kf?.url) throw new Error(`keyframe URL'si yok (${b.id}) — animasyon için gerekli`);
    // gereken süreden uzun üret (kırpılacak)
    const want = Math.min(10, Math.max(3, Math.ceil(b.duration * 1.15 + 0.5)));
    const url = await prov.imageToVideo(stil.anim, kf.url, want, s);
    const file = path.join(dir, `${b.id}.mp4`);
    await downloadFile(url, file, { timeoutMs: 240000 });
    const dur = await ffprobeDuration(s.ffprobePath, file);
    if (dur < 1) throw new Error(`klip bozuk (${b.id})`);
    done++;
    logFn(`Animasyon: ${done}/${beats.length}`);
    save(b.id,{file,type:"video",provider:"kolaj",duration:dur});
    return { beatId: b.id, file, duration: dur };
  });

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const b = beats[i];
    if (r.ok) media[b.id] = r.value.cached ? cached[b.id] : { file: r.value.file, type: "video", provider: "kolaj", duration: r.value.duration };
    else {
      // animasyon başarısızsa keyframe'e düş — akış durmasın
      const kf = kfByBeat.get(b.id);
      logFn(`Klip üretilemedi (${b.id}), keyframe kullanılacak: ${String(r.error?.message).slice(0, 100)}`);
      if (kf) save(b.id, validMedia(cached[b.id]) ? cached[b.id] : { file: kf.file, type: "image", provider: "kolaj" });
    }
  }
  return media;
}

// ---------------------------------------------------------------- kabul kriterleri

/** Render öncesi otomatik doğrulanabilen kontroller (spec §6). */
export function acceptanceReport(beats, media) {
  const list = beats.map((b) => media[b.id]).filter(Boolean);
  const missing = beats.filter((b) => !media[b.id]).length;
  const animated = list.filter((m) => m.type === "video").length;
  return [
    { ok: missing === 0, label: `Her beat'in görseli var (${beats.length - missing}/${beats.length})` },
    { ok: beats.every((b) => (b.concept || "").length > 8), label: "Her beat'te somut kavram tarifi var" },
    { ok: beats.every((b) => !/\b(text|word|letter|number)\b/i.test(b.concept || "")), label: "Keyframe promptlarında yazı istenmemiş (yazı montajda yakılır)" },
    { ok: animated > 0 || list.length > 0, label: `Klip/kare hazır (${animated} animasyonlu)` },
    { ok: beats.every((b) => b.duration >= 1.2 && b.duration <= 9), label: "Beat süreleri 1,2-9 sn aralığında" },
  ];
}
