// SHORTS HAREKETİ — durağan resimli bir Shorts'un cümlelerini gerçek harekete çevirir (Replicate,
// replicate-video.js). Shorts ilk saniyede tutulur ya da kaydırılır: açılış cümleleri HER ZAMAN
// canlanır, sonra uygun olanlar sırayla tavana kadar (shortsMotionMax).
//
// Uygun: AI ile üretilmiş resim (kimseyi temsil etmez) ve planın hareket tarifi yazdığı kişisiz
// arşiv resmi (deniz, şehir, gravür). ASLA: gerçek bir kişinin fotoğrafı ya da belge — model yüzü
// bozar, belgeyi sahteler; belgeselin güvenilirliği gider.
import path from "node:path";
import { imageToVideo, motionPrompt } from "./replicate-video.js";
import { verticalCrop } from "./docu-shorts-pictures.js";

/** Bir segment canlanabilir mi (gerçek kişi ve belge asla). */
export function motionOk(seg) {
  if (!seg || seg.kind !== "still") return false;
  if (seg.person || seg.document) return false;
  return !!seg.generated || !!seg.motion;
}

/**
 * Canlanacak segmentlerin sırası: önce açılış (ilk `opening` segment), sonra kalanlar sırayla;
 * en fazla `max`. Aynı resim iki kez canlanmaz (tekrar eden resim tek klip).
 */
export function pickMotion(segments, { opening = 3, max = 10 } = {}) {
  const order = segments.map((s, i) => i).filter((i) => motionOk(segments[i]));
  const first = order.filter((i) => i < opening);
  const rest = order.filter((i) => i >= opening);
  const out = [];
  const seen = new Set();
  for (const i of [...first, ...rest]) {
    if (out.length >= max) break;
    if (seen.has(segments[i].abs)) continue;
    seen.add(segments[i].abs);
    out.push(i);
  }
  return out.sort((a, b) => a - b);
}

/**
 * Seçilen segmentleri klibe çevirir; dönen yeni segment listesi (klip olanlar kind: "clip").
 * Klibin hareketi oturmuş kısmı kullanılır (ilk ~0,8 sn neredeyse durağandır); segment klipten
 * uzunsa render son kareyi tutar. Bir klip üretilemezse o segment durağan kalır — bakiye bitti
 * hatası ise yukarı fırlatılır (kullanıcı bilsin).
 */
export async function animateSegments(segments, { opening = 3, settings = {}, dir, ffmpeg = "ffmpeg", logFn = () => {} } = {}) {
  if (settings.shortsMotion === false || !settings.replicateKey) return segments;
  const max = Number.isFinite(+settings.shortsMotionMax) ? +settings.shortsMotionMax : 10;
  const picks = pickMotion(segments, { opening, max });
  if (!picks.length) return segments;
  logFn(`Shorts hareketi: ${picks.length} cümle canlanıyor (${settings.replicateVideoModel || "Kling 2.5"})...`);
  const out = segments.slice();
  const made = new Map();
  // Aynı anda en çok 2 istek: Replicate kuyruğu paralel çalışır; düşük bakiyeli hesabın dakikada ~6 isteği var.
  const queue = picks.slice();
  const work = async () => {
    while (queue.length) {
      const i = queue.shift();
      const s = segments[i];
      try {
        if (!made.has(s.abs)) {
          const crop = s.srcW && s.srcH ? verticalCrop(s.srcW, s.srcH, s.box) : null;
          const prompt = motionPrompt({ motion: s.motion, picture: s.picturePrompt, say: s.say, opening: i < opening });
          made.set(s.abs, await imageToVideo({ abs: s.abs, crop, prompt, duration: s.dur > 4.4 ? 10 : 5, dir, settings, ffmpeg, logFn, cachedOnly: !!out.quota }));
        }
        const c = made.get(s.abs);
        if (!c?.file || !c.dur) continue;
        const settle = Math.min(0.9, Math.max(0, c.dur - s.dur - 0.1));
        out[i] = { ...s, kind: "clip", abs: c.file, srcW: c.w, srcH: c.h, box: { x: 0, y: 0, w: 1, h: 1 }, clipStart: settle, clipDur: c.dur, animated: true };
      } catch (e) {
        // An empty balance stops new clips, not the Short: the clips already made (or cached) stay, the rest are stills.
        if (e?.quota) {
          if (!out.quota) logFn(`Shorts hareketi: Replicate bakiyesi bitti — kalan cümleler durağan (replicate.com/account/billing)`);
          out.quota = true;
          continue;
        }
        logFn(`Shorts hareketi: cümle ${i + 1} durağan kaldı (${String(e?.message || e).slice(0, 120)})`);
      }
    }
  };
  await Promise.all([work(), work()]);
  const n = out.filter((s) => s.animated).length;
  logFn(`Shorts hareketi: ${n}/${segments.length} cümle hareketli`);
  return out;
}

export const motionDir = (dir) => path.join(dir, "motion");
