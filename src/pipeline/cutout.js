// KESİK GÖRSEL — stok fotoğrafı editorial kolaj öğesine çevirir.
//
// Referans videoya dikkatli bakınca kişi fotoğraflarının SERBEST KESİK değil,
// sekizgen/daire çerçeve içinde beyaz sticker kenarlı ve yumuşak gölgeli olduğu
// görülüyor. Bu, mükemmel arka plan kaldırma gerektirmiyor — geometrik maske
// yeterli. Dolayısıyla:
//
//   · Varsayılan yol TAMAMEN YERELDİR: ffmpeg maskesi, ücretsiz, ağ yok, anahtar
//     yok, saniyenin altında. Her stok fotoğrafa uygulanabilir.
//   · Gerçekten serbest kesik gereken öğeler (bir nesnenin arka planı silinmiş
//     hâli) için isteğe bağlı AI arka plan kaldırma var; anahtar yoksa sessizce
//     geometrik maskeye düşer, akış kırılmaz.
//
// Çıktı her zaman alfa kanallı PNG'dir — motion.js katman olarak bindirir.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { run, downloadFile, ffprobeDuration } from "../util.js";
import { getSettings } from "../config.js";

/**
 * KESİK GERÇEKTEN BİR ŞEY GÖSTERİYOR MU?
 *
 * Gerçek videoda iki artefakt görüldü ve ikisi de bu ölçüyle yakalanıyor:
 *   · BOMBOŞ KREM KARE — kaynak videodan kare alınamayınca yalnızca sticker
 *     katmanı çiziliyor, içi boş kalıyor. (Ölçüldü: parlaklık yayılımı 0.)
 *   · SİMSİYAH KARE — karanlık su fotoğrafı köşede hiçbir şey anlatmıyor.
 *
 * Ölçüm merkez %55'te yapılır (kenardaki sticker/gölge sayılmasın).
 * Sağlam kesiklerde yayılım 197-198 ölçüldü; bozuklarda 0.
 */
async function kesikIcerikVar(dest, ffmpegPath) {
  const rapor = path.join(os.tmpdir(), `nova-kesik-${process.pid}-${Math.abs(hashKod(dest))}.txt`);
  try {
    await run(ffmpegPath, [
      "-v", "error", "-i", dest,
      // metadata=print dosya yolu ":" içeremez (filtre ayracı) — tmp'ye göreli
      // yazmak yerine cwd'yi tmp yapıp düz ad veriyoruz.
      "-vf", "crop=iw*0.55:ih*0.55,format=gray,signalstats,metadata=print:file=" + path.basename(rapor),
      "-f", "null", "-",
    ], { cwd: os.tmpdir(), timeoutMs: 30000 });
    const s = fs.readFileSync(rapor, "utf8");
    const al = (k) => {
      const m = s.match(new RegExp("lavfi\\.signalstats\\." + k + "=([\\d.]+)"));
      return m ? +m[1] : NaN;
    };
    const yayilim = al("YMAX") - al("YMIN");
    const ort = al("YAVG");
    if (!Number.isFinite(yayilim) || !Number.isFinite(ort)) return true;  // ölçemedik → geçir
    if (yayilim < 25) return false;        // tek renk: boş sticker ya da düz zemin
    if (ort < 18 || ort > 245) return false; // simsiyah ya da patlamış beyaz
    return true;
  } catch {
    return true;                            // ölçüm patlarsa kesiği elemeyelim
  } finally {
    try { fs.rmSync(rapor, { force: true }); } catch {}
  }
}

function hashKod(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return h; }

/** Maske şekilleri. Formüller ffmpeg geq alfa ifadesine gömülür. */
export const SEKILLER = ["daire", "sekizgen", "yuvarlak", "kare"];

function sekilIfadesi(sekil, S, r) {
  const c = S / 2;
  switch (sekil) {
    case "daire":
      return `lte(hypot(X-${c},Y-${c}),${r})`;
    case "sekizgen":
      return `lt(abs(X-${c}),${r})*lt(abs(Y-${c}),${r})*lte(abs(X-${c})+abs(Y-${c}),${Math.round(r * 1.35)})`;
    case "yuvarlak": {
      const k = Math.round(r * 0.32);            // köşe yarıçapı
      return `lte(hypot(max(abs(X-${c})-${r - k},0),max(abs(Y-${c})-${r - k},0)),${k})` +
        `*lt(abs(X-${c}),${r})*lt(abs(Y-${c}),${r})`;
    }
    default:
      return `lt(abs(X-${c}),${r})*lt(abs(Y-${c}),${r})`;
  }
}

/** Şekli beat kimliğinden türet — aynı sahne her koşuda aynı çerçeveyi alsın. */
export function sekilSec(anahtar, rol) {
  // Kahraman daha "portre" duruyor: sekizgen/yuvarlak. Küçük öğeler daire.
  const havuz = rol === "hero" ? ["sekizgen", "yuvarlak", "daire"] : ["daire", "yuvarlak"];
  let h = 0;
  for (let i = 0; i < String(anahtar).length; i++) h = (h * 31 + String(anahtar).charCodeAt(i)) | 0;
  return havuz[Math.abs(h) % havuz.length];
}

/**
 * Fotoğrafı maskeli kesiğe çevirir: şekil + beyaz sticker kenar + yumuşak gölge.
 *
 * Tek ffmpeg çağrısı. Kanvas: S+2*pay kare, kenarlarda gölge için pay bırakılır.
 *
 * @param src     kaynak fotoğraf
 * @param dest    çıktı .png (alfa kanallı)
 * @param sekil   SEKILLER'den biri
 * @param boyut   kesiğin kenar uzunluğu (px)
 * @param kenar   beyaz sticker kalınlığı (px, 0 = kenarsız)
 */
export async function maskeliKesik(src, dest, { sekil = "daire", boyut = 720, kenar = 14, killer, tur = "image" } = {}) {
  const st = getSettings();
  const S = Math.round(boyut / 2) * 2;
  const pay = Math.round(S * 0.10);              // gölge payı
  const T = S + pay * 2;                          // toplam kanvas
  const rDis = S / 2 - 2;                         // sticker dış yarıçapı
  const rIc = Math.max(4, rDis - kenar);          // fotoğrafın yarıçapı
  const golgeKay = Math.round(S * 0.022);
  const golgeBlur = Math.max(2, Math.round(S * 0.018));

  const pass = "r='r(X,Y)':g='g(X,Y)':b='b(X,Y)'";
  const zemin = `color=black@0:s=${T}x${T},format=rgba`;

  // 0 = fotoğraf, 1 = sticker(beyaz), 2 = gölge(siyah), 3 = şeffaf zemin
  const filtre = [
    // fotoğraf: kareye kırp, iç şekle maskele
    `[0:v]scale=${S}:${S}:force_original_aspect_ratio=increase,crop=${S}:${S},format=rgba,` +
    `geq=${pass}:a='if(${sekilIfadesi(sekil, S, rIc)},255,0)'[foto]`,
    // sticker: dış şekil, kırık beyaz (kağıt hissi)
    `[1:v]format=rgba,geq=${pass}:a='if(${sekilIfadesi(sekil, S, rDis)},255,0)'[stk]`,
    // gölge: dış şekil, bulanık
    `[2:v]format=rgba,geq=${pass}:a='if(${sekilIfadesi(sekil, S, rDis)},150,0)',gblur=sigma=${golgeBlur}[glg]`,
    // sırayla bindir: gölge → sticker → fotoğraf
    `[3:v][glg]overlay=x=${pay + golgeKay}:y=${pay + golgeKay}[a]`,
    `[a][stk]overlay=x=${pay}:y=${pay}[b]`,
    `[b][foto]overlay=x=${pay}:y=${pay},format=rgba[v]`,
  ].join(";");

  // VİDEO KAYNAĞINDA İLK KARE ALINMAZ. Arşiv klipleri sık sık siyah kareyle ya
  // da bir geçişle başlıyor; kesik o kareden üretilince köşede boş siyah damga
  // kalıyordu.
  //
  // AMA KÖR ARAMA YAPILMAZ. Sabit "-ss 1.0" kısa klipte kaydırmayı dosyanın
  // sonuna taşıyor, fotoğraf katmanı HİÇ KARE ALMIYOR ve ekrana yalnızca krem
  // sticker çıkıyor — gerçek videoda bomboş kareler bu yüzden oluştu (0,8 sn'lik
  // klip ile birebir üretildi). Kaydırma süreye göre seçilir: klibin dörtte biri,
  // en fazla 1 sn.
  let girdi = ["-i", src];
  if (tur === "video") {
    let sure = 0;
    try { sure = await ffprobeDuration(st.ffprobePath, src); } catch {}
    const kaydir = sure > 0.6 ? Math.min(1.0, sure * 0.25) : 0;
    girdi = kaydir > 0.05 ? ["-ss", kaydir.toFixed(2), "-i", src] : ["-i", src];
  }
  await run(st.ffmpegPath, [
    ...girdi,
    "-f", "lavfi", "-i", `color=c=0xF4EBDC:s=${S}x${S}`,
    "-f", "lavfi", "-i", `color=c=black:s=${S}x${S}`,
    "-f", "lavfi", "-i", zemin,
    "-filter_complex", filtre, "-map", "[v]", "-frames:v", "1", "-y", dest,
  ], { killer });
  return dest;
}

/**
 * TASARIM AKSANI — düz renkli geometrik şekil (fotoğraf değil).
 *
 * Köşedeki küçük öğe önceden başka bir fotoğrafın minik hâliydi; ekranda anlam
 * taşımıyor, gürültü gibi duruyordu. Referans dilde oradaki öğe zaten bir
 * TASARIM öğesidir — düz kırmızı kare/daire. Burada tema vurgu rengiyle
 * üretilir: içerikten bağımsız, her sahnede tutarlı, ücretsiz.
 *
 * @param renk  0xRRGGBB (tema vurgu rengi)
 */
export async function sekilAksani(dest, { renk = "0xE02417", sekil = "kare", boyut = 220, killer } = {}) {
  const st = getSettings();
  const S = Math.round(boyut / 2) * 2;
  const pay = Math.round(S * 0.12);
  const T = S + pay * 2;
  const r = S / 2 - 2;
  const golge = Math.max(2, Math.round(S * 0.02));

  const filtre = [
    `[0:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(${sekilIfadesi(sekil, S, r)},255,0)'[sek]`,
    `[1:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(${sekilIfadesi(sekil, S, r)},120,0)',gblur=sigma=${golge}[glg]`,
    `[2:v][glg]overlay=x=${pay + Math.round(S * 0.03)}:y=${pay + Math.round(S * 0.03)}[a]`,
    `[a][sek]overlay=x=${pay}:y=${pay},format=rgba[v]`,
  ].join(";");

  await run(st.ffmpegPath, [
    "-f", "lavfi", "-i", `color=c=${renk}:s=${S}x${S}`,
    "-f", "lavfi", "-i", `color=c=black:s=${S}x${S}`,
    "-f", "lavfi", "-i", `color=black@0:s=${T}x${T},format=rgba`,
    "-filter_complex", filtre, "-map", "[v]", "-frames:v", "1", "-y", dest,
  ], { killer });
  return dest;
}

/**
 * KARARTMA PERDESİ — alt banda inen yumuşak gradyan, tek PNG.
 *
 * Önceden 9 adet üst üste `drawbox` ile yapılıyordu; adım sayısı arttırılsa bile
 * gözle görülür bant izi kalıyordu ve her karede 9 filtre çalışıyordu. `geq` ile
 * gerçek gradyan hesaplamak ise kare başına piksel-piksel ifade demek (ölçüldü:
 * 7-20 kat yavaş). Doğru çözüm: gradyanı BİR KEZ PNG'ye pişirip overlay etmek.
 *
 * İş başına tek dosya; kanvas boyutuna göre üretilir.
 */
export async function perdeGradyani(dest, kanvas, { killer, koyuluk = 0.62 } = {}) {
  const st = getSettings();
  const B = Math.round(kanvas.h * 0.46);          // gradyanın yüksekliği
  const bas = kanvas.h - B;
  const enUst = Math.round(255 * koyuluk);
  // Üstte tamamen şeffaf, aşağı indikçe hızlanan bir eğriyle koyulaşır (pow 1.5
  // doğrusal rampadan daha doğal duruyor — yazının altı koyu, ortası yumuşak).
  const alfa = `if(lt(Y,${bas}),0,${enUst}*pow((Y-${bas})/${B},1.5))`;
  await run(st.ffmpegPath, [
    "-f", "lavfi", "-i", `color=c=black:s=${kanvas.w}x${kanvas.h}`,
    "-vf", `format=rgba,geq=r=0:g=0:b=0:a='${alfa}'`,
    "-frames:v", "1", "-y", dest,
  ], { killer });
  return dest;
}

/**
 * AI ile arka plan kaldırma (isteğe bağlı, fal.ai).
 * Anahtar yoksa veya istek patlarsa null döner — çağıran maskeye düşer.
 */
export async function arkaPlanKaldir(src, dest, { killer, logFn } = {}) {
  const st = getSettings();
  if (!st.falKey) return null;
  try {
    // fal.ai dosya URL'si ister; yerel dosyayı base64 data URI olarak gönder
    const b64 = fs.readFileSync(src).toString("base64");
    const tur = /\.png$/i.test(src) ? "image/png" : "image/jpeg";
    const res = await fetch(`https://fal.run/${st.falRembgModel || "fal-ai/imageutils/rembg"}`, {
      method: "POST",
      headers: { Authorization: `Key ${st.falKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: `data:${tur};base64,${b64}` }),
      signal: killer?.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const url = d?.image?.url || d?.images?.[0]?.url;
    if (!url) throw new Error("URL yok");
    await downloadFile(url, dest, { timeoutMs: 60000 });
    return dest;
  } catch (e) {
    logFn?.(`Arka plan kaldırma atlandı (maskeye düşülüyor): ${String(e.message).slice(0, 90)}`);
    return null;
  }
}

/**
 * Bir sahnenin kesiklerini hazırlar.
 *
 * @param girdiler [{ id, src, rol }]
 * @param dir      çıktı klasörü
 * @returns { [id]: png yolu }  — üretilemeyen atlanır (sahne o öğesiz kurulur)
 */
export async function kesikleriHazirla(girdiler, dir, { kanvas, mapLimit, killer, logFn, aiKesik = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const st = getSettings();
  const kisa = Math.min(kanvas?.w || 1920, kanvas?.h || 1080);
  const out = {};

  const sonuc = await mapLimit(girdiler, st.concurrency || 4, async (g) => {
    if (killer?.cancelled) throw new Error("cancelled");
    if (!g.src || !fs.existsSync(g.src)) return null;
    const dest = path.join(dir, `${g.id}.png`);
    // Kahraman büyük görünecek — daha yüksek çözünürlük hazırla
    const boyut = Math.round(kisa * (g.rol === "hero" ? 0.9 : 0.45));

    if (aiKesik && g.rol === "hero") {
      const temiz = path.join(dir, `${g.id}-ham.png`);
      const ok = await arkaPlanKaldir(g.src, temiz, { killer, logFn });
      if (ok) {
        // Arka planı silinmiş görselde çerçeve istemiyoruz — sadece ölçekle
        await run(st.ffmpegPath, [
          "-i", temiz, "-vf", `scale=${boyut}:-1:force_original_aspect_ratio=decrease,format=rgba`,
          "-frames:v", "1", "-y", dest,
        ], { killer });
        try { fs.rmSync(temiz, { force: true }); } catch {}
        return { id: g.id, file: dest };
      }
    }

    await maskeliKesik(g.src, dest, {
      sekil: sekilSec(g.id, g.rol),
      boyut,
      kenar: Math.max(6, Math.round(boyut * 0.022)),
      killer,
      tur: g.tur || "image",   // video ise baştan değil, klibin içinden kare alınır
    });
    // İÇERİK DENETİMİ: bomboş ya da simsiyah kesik ekrana KONMAZ. Köşede hiçbir
    // şey anlatmayan bir damga, boş yuvadan daha kötü — izleyicinin gözü ona
    // takılıyor ve karşılığında bir şey bulamıyor.
    if (!(await kesikIcerikVar(dest, st.ffmpegPath))) {
      try { fs.rmSync(dest, { force: true }); } catch {}
      return { id: g.id, file: null, bos: true };
    }
    return { id: g.id, file: dest };
  });

  // HANGİ kesiğin düştüğü söylenir. Eskiden yalnızca sayı yazılıyordu ve kaynağı
  // olmayan girdi (null dönen) hiç sayılmıyordu; sahne sessizce öğesiz kuruluyor,
  // log'a bakan da nedenini bulamıyordu.
  const patlayan = [], kaynaksiz = [], bos = [];
  sonuc.forEach((r, i) => {
    if (!r.ok) { patlayan.push(`${girdiler[i]?.id}: ${String(r.error?.message || "").slice(0, 40)}`); return; }
    if (r.value?.bos) { bos.push(r.value.id); return; }
    if (r.value?.file) out[r.value.id] = r.value.file;
    else kaynaksiz.push(girdiler[i]?.id);
  });
  if (patlayan.length) logFn?.(`${patlayan.length} kesik üretilemedi (${patlayan.slice(0, 3).join("; ")}) — o öğeler sahneye konmayacak.`);
  if (kaynaksiz.length) logFn?.(`${kaynaksiz.length} kesiğin kaynak dosyası yok (${kaynaksiz.slice(0, 4).join(", ")}).`);
  if (bos.length) logFn?.(`${bos.length} kesik boş/karanlık çıktı, ekrana konmayacak (${bos.slice(0, 4).join(", ")}).`);
  return out;
}
