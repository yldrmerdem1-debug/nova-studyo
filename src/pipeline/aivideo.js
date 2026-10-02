// Stok görüntülü videoya ARAYA GİREN AI klipler.
//
// Kolaj modundan farkı: orada videonun TAMAMI üretilir (10 dk ≈ $66).
// Burada sadece gerçek görüntüsü OLMAYAN birkaç sahne üretilir —
// tarihi canlandırma, soyut kavram, imkânsız kamera açısı, gelecek senaryosu.
// 10 dakikalık bir videoda 5 klip ≈ $1,70. Referans videodaki "hibrit" mantığı.
//
// Sağlayıcı katmanı Kolaj ile ortak (Kie AI / fal.ai / Higgsfield):
//   metin → keyframe (textToImage) → klip (imageToVideo)

import fs from "node:fs";
import path from "node:path";
import { getSettings } from "../config.js";
import { downloadFile, mapLimit, ffprobeDuration } from "../util.js";
import { imageProvider, videoProvider, providerReady, withCancel, videoUretimiHazir } from "./collage.js";

const PRICE_KEYFRAME = 0.04;
const PRICE_ANIM = 0.30;
const PRICE_PER_CLIP = PRICE_KEYFRAME + PRICE_ANIM;

export function aiClipCost(n, hareketli = true) {
  const birim = hareketli ? PRICE_PER_CLIP : PRICE_KEYFRAME;
  return +(n * birim * 1.15).toFixed(2); // %15 yeniden üretim payı
}

/** Sahne tarifini sinematik yönergeyle zenginleştir. */
function cinematicPrompt(raw, full = false) {
  const p = (raw || "").trim().replace(/\s+/g, " ").slice(0, full ? 7000 : 420);
  // YAZI YASAĞI HER DURUMDA EKLENİR.
  //
  // Eskiden istem "camera/shot/cinematic/aerial/close-up" kelimelerinden birini
  // içeriyorsa olduğu gibi dönülüyordu — yasak cümlesi de birlikte düşüyordu.
  // aiistem.js artık tam sahne tarifleri yazdırıyor ve bunlar çoğu zaman
  // "shot"/"camera" içeriyor; kural düşseydi tam da düzeltmeye çalıştığımız
  // yazılı kareler geri gelirdi ("SECURE LOGIN PORTAL" yazan monitör, puan 1).
  const yasak = " No text, no captions, no letters, no signage, no watermark, no logos.";
  if (/camera|shot|cinematic|aerial|close-up/i.test(p)) return p + yasak;
  return `Cinematic documentary footage: ${p}. Natural lighting, shallow depth of field, ` +
    `slow deliberate camera movement, film grain.` + yasak;
}

const ANIM = "Subtle cinematic motion: slow camera push-in, natural ambient movement. " +
  "No morphing, no face distortion, no text.";

/**
 * type="ai" işaretli beat'ler için klip üretir.
 * Bütçe dolunca kalanlar normal stok aramasına düşer — akış durmaz.
 * @returns { [beatId]: { file, type:"video", provider:"ai" } }
 */
export async function generateAiClips(beats, cap, mediaDir, logFn, isCancelled, killer, { onResult = () => {}, settings = getSettings() } = {}) {
  const s = withCancel(settings, isCancelled, killer);
  cap = Math.max(0, Math.min(30, parseInt(cap) || 0));
  if (!cap) return {};
  if (s.dryRun) { logFn('Dry-run: ücretli AI sahne üretimi atlandı; arşiv adayları kullanılacak.'); return {}; }
  if (!providerReady(s,{animate:false})) {
    logFn("AI sahne atlandı: görsel üretim sağlayıcısı ayarlı değil (Ayarlar → Kolaj modu bölümü).");
    return {};
  }

  // İki kaynak: senaryo modelinin bilerek "ai" işaretlediği sahneler ve
  // arşivin yetmediği için sonradan terfi ettirilenler (media.js/promoteGapsToAi).
  const wanted = beats.filter(
    (b) => (b.visual?.type === "ai" || b.visual?.aiFill) && (b.visual.prompt || "").trim()
  );
  if (!wanted.length) return {};

  const todo = wanted.slice(0, cap);
  if (wanted.length > cap) {
    logFn(`AI sahne: ${wanted.length} istendi, bütçe ${cap} — kalanı stok görüntüyle doldurulacak.`);
  }
  fs.mkdirSync(mediaDir, { recursive: true });

  const imgP = imageProvider(s), vidP = videoProvider(s);
  // HAREKETLİ Mİ, DURAĞAN MI?
  //
  // Varsayılan DURAĞAN GÖRSEL. Sebepleri ölçüldü:
  //  1) Sağlayıcıda kullanılabilir video modeli yok — ayarlı "veo3-fast" adı
  //     Kie tarafından reddediliyor ("model name is not supported"), sora-2
  //     ise duraklatılmış. Yani animasyon adımı sessizce patlıyor ve sahne
  //     stok görüntüye düşüyordu.
  //  2) Fiyat: durağan kare $0,04, animasyonlu klip $0,34 — sekiz katı.
  //  3) İhtiyaç: eksik olan "hareket" değil, arşivde OLMAYAN görüntü. Durağan
  //     kare zaten Ken Burns ile hareketleniyor (render.js zoompan).
  // Animasyon isteyen `aiHareket: true` ile açar.
  // Animasyon istendiyse önce sağlayıcı gerçekten verebiliyor mu diye BİR KEZ
  // yoklanır; veremiyorsa her klipte tek tek denenip düşülmez.
  const hareketli = s.aiHareket === true && (await videoUretimiHazir(logFn,s));
  logFn(`${todo.length} AI ${hareketli ? "sahne" : "görsel"} üretiliyor ` +
    `(${imgP.name}${hareketli ? " → " + vidP.name : ""}, ~$${aiClipCost(todo.length, hareketli)})...`);

  const out = {};
  const save = (r) => { const m = { beatId: r.beatId, file: r.file, type: r.tur, provider: "ai", ...(r.duration ? { duration: r.duration } : {}) }; onResult(m); return r; };
  let done = 0;
  const results = await mapLimit(todo, 2, async (b) => {
    if (isCancelled()) throw new Error("cancelled");
    const prompt = cinematicPrompt(b.visual.prompt,b.visual.fullPrompt===true);
    const imgUrl = await imgP.textToImage(prompt, s);

    if (!hareketli || b.visual.animate === false) {
      const dest = path.join(mediaDir, `${b.id}.jpg`);
      await downloadFile(imgUrl, dest, { timeoutMs: 120000, expect: "image" });
      done++;
      logFn(`AI görsel ${done}/${todo.length}: "${(b.visual.prompt || "").slice(0, 55)}..."`);
      return save({ beatId: b.id, file: dest, tur: "image" });
    }

    // Animasyon (beat süresinden uzun üret, montajda kırpılır). Video adımı
    // patlarsa TÜM sahneyi çöpe atma — elde zaten geçerli bir kare var.
    const want = Math.min(10, Math.max(4, Math.ceil((b.duration || 5) * 1.2)));
    try {
      const motion = b.visual.motion ? String(b.visual.motion).slice(0,1000)+'. Preserve anatomy, identity, clothing and scene geometry. No morphing, no text.' : ANIM;
      const vidUrl = await vidP.imageToVideo(motion, imgUrl, want, s);
      const dest = path.join(mediaDir, `${b.id}.mp4`);
      await downloadFile(vidUrl, dest, { timeoutMs: 240000 });
      const dur = await ffprobeDuration(s.ffprobePath, dest);
      if (dur < 1) throw new Error("klip bozuk");
      done++;
      logFn(`AI sahne ${done}/${todo.length}: "${(b.visual.prompt || "").slice(0, 55)}..."`);
      return save({ beatId: b.id, file: dest, tur: "video", duration: dur });
    } catch (e) {
      if(isCancelled() || s.__signal?.aborted)throw new Error('cancelled');
      const dest = path.join(mediaDir, `${b.id}.jpg`);
      await downloadFile(imgUrl, dest, { timeoutMs: 120000, expect: "image" });
      done++;
      logFn(`AI sahne animasyonu başarısız, durağan kare kullanılıyor: ${String(e.message).slice(0, 80)}`);
      return save({ beatId: b.id, file: dest, tur: "image" });
    }
  });

  for (const r of results) {
    if (r.ok) {
      out[r.value.beatId] = r.value.tur === "video"
        ? { file: r.value.file, type: "video", provider: "ai", duration: r.value.duration }
        : { file: r.value.file, type: "image", provider: "ai" };
    } else {
      logFn(`AI görsel üretilemedi (stok görüntüye düşülüyor): ${String(r.error?.message).slice(0, 130)}`);
    }
  }
  return out;
}
