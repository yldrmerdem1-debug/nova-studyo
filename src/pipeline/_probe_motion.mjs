// KATMAN MOTORU — bir sahneyi çok katmanlı hareketli kompozit olarak üretir.
//
// Neden gerekli: eski hatta "bir sahne = bir görüntü" idi (tek kaynak + üstüne
// drawtext/drawbox). Referans videolardaki editorial motion collage dilinde ise
// bir sahnede 4-6 ayrı öğe var ve her biri KENDİ zamanında, kendi yörüngesinde
// hareket ediyor. Kodda hiç `overlay=` kullanımı yoktu; bu modül onu getiriyor.
//
// ffmpeg ile neyin mümkün olduğu ölçülerek doğrulandı:
//   · alfa kanalında zaman bağımlı opaklık  → fade=t=in:alpha=1
//   · konum animasyonu                      → overlay=x='<t ifadesi>':eval=frame
//   · ölçek animasyonu                      → scale=w='<t ifadesi>':eval=frame
//   · yumuşatma eğrileri                    → pow()/clip() ifade fonksiyonları
//
// Katman modeli sade tutuldu: konum + opaklık + ölçek. Döndürme ve maske yok —
// bu üçü referans dildeki hareketin büyük kısmını zaten karşılıyor.

import fs from "node:fs";
import path from "node:path";
import { run } from "../util.js";
import { ftext, displayFont, boldFont } from "./graphics.js";

/** 3 haneye yuvarla — ffmpeg ifadelerinde uzun ondalık okunaksız. */
const s3 = (n) => (Math.round(n * 1000) / 1000).toString();

/**
 * Yumuşatılmış ilerleme (ease-out cubic): t0'da 0, t0+d'de 1, sonrası 1.
 * Öğeler sabit hızla değil, yavaşlayarak yerine oturur — "settle" hissi bu.
 */
const easeOut = (t0, d) => `(1-pow(1-clip((t-${s3(t0)})/${s3(Math.max(0.001, d))},0,1),3))`;

/** Geri sayan ilerleme: çıkışta kullanılır (t0'da 0, artarak 1). */
const easeIn = (t0, d) => `pow(clip((t-${s3(t0)})/${s3(Math.max(0.001, d))},0,1),2)`;

/**
 * Giriş yönleri. dx/dy kanvas oranı cinsinden başlangıç kayması,
 * o0 başlangıç ölçeği (1 = ölçek animasyonu yok).
 */
export const GIRISLER = {
  yok: { dx: 0, dy: 0, o0: 1 },
  soldan: { dx: -0.34, dy: 0, o0: 1 },
  sagdan: { dx: 0.34, dy: 0, o0: 1 },
  asagidan: { dx: 0, dy: 0.18, o0: 1 },
  yukaridan: { dx: 0, dy: -0.18, o0: 1 },
  buyu: { dx: 0, dy: 0, o0: 0.72 },
  kucul: { dx: 0, dy: 0, o0: 1.28 },
  otur: { dx: 0, dy: 0.06, o0: 0.92 },   // hafif — referans videodaki "yerine otur"
};

export const CIKISLAR = {
  yok: { dx: 0, dy: 0 },
  sola: { dx: -0.3, dy: 0 },
  saga: { dx: 0.3, dy: 0 },
  yukari: { dx: 0, dy: -0.2 },
};

/**
 * Tek bir görsel katmanın filtre zincirini ve overlay ifadesini üretir.
 *
 * @param L      katman tanımı
 * @param K      kanvas
 * @param idx    ffmpeg girdi indeksi
 */
function gorselKatman(L, K, idx) {
  const g = GIRISLER[L.giris] || GIRISLER.otur;
  const c = CIKISLAR[L.cikis] || CIKISLAR.yok;
  const bas = L.bas ?? 0;
  const sure = L.sure ?? 2;
  const gS = L.girisSure ?? 0.55;
  const cS = L.cikisSure ?? 0.4;
  const son = bas + sure;

  // Hedef genişlik KISA KENARA oranlanır, genişliğe değil. Genişliğe bağlanınca
  // aynı sahne tanımı 9:16'da doğru, 16:9'da kadraja sığmıyordu; kısa kenar
  // referansı sayesinde tek tanım iki oranda da aynı görünüyor.
  // `tamEn: true` diyen katman (arka plan şeridi gibi) genişliğe oranlanır.
  const taban = L.tamEn ? K.w : Math.min(K.w, K.h);
  const hedefW = Math.max(2, Math.round((L.en ?? 0.4) * taban / 2) * 2);
  const eG = easeOut(bas, gS);          // giriş ilerlemesi
  const eC = easeIn(son, cS);           // çıkış ilerlemesi

  // --- ölçek ---
  const olcekli = g.o0 !== 1;
  const wIfade = olcekli
    ? `${hedefW}*(${s3(g.o0)}+${s3(1 - g.o0)}*${eG})`
    : String(hedefW);
  const olcekF = olcekli
    ? `scale=w='${wIfade}':h=-2:eval=frame`
    : `scale=${hedefW}:-2`;

  // --- opaklık ---
  // fade alpha=1 girdi akışında alfa ister; format=rgba onu garanti eder.
  const fadeF = `format=rgba,fade=t=in:st=${s3(bas)}:d=${s3(gS * 0.8)}:alpha=1` +
    `,fade=t=out:st=${s3(son)}:d=${s3(cS)}:alpha=1`;

  // --- konum ---
  // Merkez hedefi piksel cinsinden; overlay'de w/h katmanın anlık ölçüsü olduğu
  // için ölçek animasyonuyla birlikte doğru merkezlenir.
  const cx = Math.round((L.x ?? 0.5) * K.w);
  const cy = Math.round((L.y ?? 0.5) * K.h);
  const dxPx = Math.round(g.dx * K.w), dyPx = Math.round(g.dy * K.h);
  const cxPx = Math.round(c.dx * K.w), cyPx = Math.round(c.dy * K.h);

  const xIf = `${cx}-w/2` +
    (dxPx ? `+${dxPx}*(1-${eG})` : "") +
    (cxPx ? `+${cxPx}*${eC}` : "");
  const yIf = `${cy}-h/2` +
    (dyPx ? `+${dyPx}*(1-${eG})` : "") +
    (cyPx ? `+${cyPx}*${eC}` : "");

  return {
    // katmanın kendi hazırlığı → [kN]
    hazirla: `[${idx}:v]${fadeF},${olcekF},setsar=1[k${idx}]`,
    // zincire eklenecek overlay gövdesi (etiketler çağıran tarafından konur)
    govde: `overlay=x='${xIf}':y='${yIf}':eval=frame` +
      `:enable='between(t,${s3(bas)},${s3(son + cS)})'`,
    etiket: `k${idx}`,
  };
}

/**
 * KİNETİK TİPOGRAFİ — kelimeler sırayla belirir.
 *
 * Kelime genişliğini TAHMİN ETMEK yerine, her adımda o ana kadarki metnin
 * TAMAMI tek bir drawtext olarak çizilir ve konumu ffmpeg'e bırakılır. Böylece
 * hizalama birebir doğru olur; sola dayalı olduğu için önceki kelimeler
 * yerinden oynamaz, izleyici kelimelerin tek tek eklendiğini görür.
 *
 * Vurgu kelimesi ayrı satırda, büyük ve renkli çıkar (referans videodaki
 * "he play with is / MIND" düzeni).
 */
export function kinetikYazi(L, K) {
  const disp = displayFont(), bold = boldFont() || displayFont();
  if (!disp) return [];
  const kelimeler = (L.kelimeler || []).filter((k) => k && k.s);
  if (!kelimeler.length) return [];

  const parts = [];
  const S = (n) => Math.round(n * K.k);
  const x = Math.round((L.x ?? 0.08) * K.w);
  const yUst = Math.round((L.y ?? 0.62) * K.h);
  // Dikeyde satır başına daha az karakter sığdığı için gövde yazısı biraz büyük
  const boyUst = S(L.boy || (K.dikey ? 54 : 46));
  const bitis = L.bitis ?? (kelimeler[kelimeler.length - 1].t0 + 1.6);
  // Kolaj paleti açık zeminli — varsayılan yazı rengi KOYU olmalı, yoksa
  // krem üstüne krem yazıp görünmez oluyor. Koyu zeminde çağıran renk geçer.
  const govdeRenk = L.renk || "0x2A2A2E";
  // Okunabilirlik: zemin ne olursa olsun ince bir kontur metni ayırır.
  const kontur = L.kontur === false ? "" : `:borderw=${Math.max(1, S(2))}:bordercolor=${L.konturRenk || "0xF4EBDC"}@0.75`;

  // --- ÖBEKLEME ---
  // Belgesel cümleleri 15-20 kelime; tamamını biriktirince ekran 5-7 satır minik
  // yazıyla doluyor ve tipografi etkisini tamamen kaybediyor (ölçüldü: gerçek
  // videoda okunmaz duvar çıktı). Referans dilde ekranda AYNI ANDA 3-6 kelime var.
  //
  // Bu yüzden cümle öbeklere bölünür: her öbek kelime kelime kurulur, sonraki
  // öbek başlayınca ekranı tamamen devralır. Konuşmayla senkron korunur.
  const maxKelime = K.dikey ? 4 : 6;
  const kullanilir = K.w * 0.86 - x;
  const maxKarakter = Math.max(14, Math.floor(kullanilir / (boyUst * 0.5)));

  // Vurgu kelimesi gövdede TEKRAR ETMEZ — referans dilde büyük yazı gövdenin
  // DEVAMIdır ("he play with is" → "MIND"), kopyası değil. Aynı kelimeyi iki kez
  // basmak vuruşu zayıflatıyor.
  const sade = (s) => String(s || "").toLocaleLowerCase("tr").replace(/[.,!?;:"“”'’]/g, "");
  const govdeKelime = L.vurgu
    ? kelimeler.filter((k) => sade(k.s) !== sade(L.vurgu))
    : kelimeler;

  const obekler = [];
  let aktif = [];
  for (const k of govdeKelime) {
    const deneme = [...aktif, k].map((w) => w.s).join(" ");
    if (aktif.length && (aktif.length >= maxKelime || deneme.length > maxKarakter)) {
      obekler.push(aktif); aktif = [k];
    } else aktif.push(k);
  }
  if (aktif.length) obekler.push(aktif);

  obekler.forEach((obek, oi) => {
    // Öbek, sonraki öbeğin ilk kelimesine kadar ekranda kalır
    const obekSonu = oi < obekler.length - 1 ? obekler[oi + 1][0].t0 : bitis;
    let metin = "";
    obek.forEach((k, i) => {
      metin = metin ? `${metin} ${k.s}` : k.s;
      const t0 = k.t0;
      const t1 = i < obek.length - 1 ? obek[i + 1].t0 : obekSonu;
      if (t1 <= t0) return;
      parts.push(
        `drawtext=fontfile='${disp}':text='${ftext(metin, 90)}'` +
        `:fontcolor=${govdeRenk}:fontsize=${boyUst}${kontur}` +
        `:x=${x}:y=${yUst}:alpha='min(1,(t-${s3(t0)})/0.1)'` +
        `:enable='between(t,${s3(t0)},${s3(t1)})'`
      );
    });
  });
  // --- vurgu kelimesi: gövdenin ALTINDA ayrı satır ---
  if (L.vurgu) {
    const vt0 = L.vurguT0 ?? kelimeler[kelimeler.length - 1].t0 + 0.18;
    const boyVurgu = S(L.vurguBoy || 132);
    const e = easeOut(vt0, 0.34);
    // Gövde öbeklendiği için ekranda HER ZAMAN tek satır — vurgu tam altına oturur.
    const yVurgu = yUst + Math.round(boyUst * 1.22) + Math.round(boyUst * 0.15);
    parts.push(
      `drawtext=fontfile='${bold}':text='${ftext(L.vurgu, 28)}'` +
      `:fontcolor=${L.vurguRenk || "0xE02417"}:fontsize=${boyVurgu}${kontur}` +
      `:x=${x}:y='${yVurgu}+${S(22)}*(1-${e})'` +
      `:alpha='min(1,(t-${s3(vt0)})/0.16)'` +
      `:enable='between(t,${s3(vt0)},${s3(bitis)})'`
    );
  }
  return parts;
}

/**
 * Yazı bloğunun kaplayacağı yükseklik (normalize) — yönetmen çakışma hesabında
 * kullanır. motion.js ile AYNI satır kırma mantığını kullanmak zorunda, yoksa
 * yönetmenin "boş" sandığı yere yazı taşar.
 */
export function yaziYuksekligi(kelimeler, K, { boy, vurgu } = {}) {
  const boyUst = Math.round((boy || (K.dikey ? 54 : 46)) * K.k);
  // Gövde öbeklere bölündüğü için EKRANDA HER ZAMAN TEK SATIR duruyor; cümle
  // uzunluğuna göre yükseklik hesaplamak (eski hâli) yönetmenin boş yere yer
  // ayırmasına ve öğeleri küçültmesine yol açıyordu.
  const satirYuk = Math.round(boyUst * 1.22);
  const vurguYuk = vurgu ? Math.round(132 * K.k * 1.15) + Math.round(boyUst * 0.15) : 0;
  return (satirYuk + vurguYuk) / K.h;
}

/**
 * Sahneyi render eder.
 *
 * @param arkaplan  { tur:"gorsel"|"renk", src|renk }
 * @param katmanlar görsel ve yazı katmanları
 * @param frames    üretilecek kare sayısı (kesim noktaları tam kareye otursun)
 */
export async function renderScene({ st, kanvas: K, arkaplan, katmanlar = [], frames, outFile, killer, crf = st.crf }) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  const fps = st.fps;
  const N = Math.max(2, frames);
  const gorseller = katmanlar.filter((L) => L.tur === "gorsel" && L.src);
  const yazilar = katmanlar.filter((L) => L.tur === "yazi");

  // --- girdiler ---
  const inputs = [];
  const bgTur = arkaplan?.tur;
  if (bgTur === "video" && arkaplan.src) {
    inputs.push("-stream_loop", "-1", "-i", arkaplan.src);
  } else if (bgTur === "gorsel" && arkaplan.src) {
    inputs.push("-loop", "1", "-i", arkaplan.src);
  } else {
    inputs.push("-f", "lavfi", "-i", `${K.renk(arkaplan?.renk || "0xE8DCC8")}:r=${fps}`);
  }
  for (const L of gorseller) inputs.push("-loop", "1", "-i", L.src);

  // --- filtre grafiği ---
  const zincir = [];
  // Arka plan hazırlığı
  let bgF;
  if (bgTur === "video") {
    bgF = `${K.fit},fps=${fps}`;
  } else if (bgTur === "gorsel") {
    // Ken Burns: sabit arka plan cansız duruyor
    bgF = `${K.genis},zoompan=z='1.0+0.06*on/${N - 1}':x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${N}${K.zp(fps)}`;
  } else {
    bgF = `scale=${K.w}:${K.h}`;
  }
  // Sinematik derecelendirme + karartma: üstteki yazı ve öğeler okunur kalsın.
  // Tam ekran fotoğrafta yazı doğrudan görüntünün üstüne düşüyor; bant olmadan
  // açık gökyüzünde beyaz yazı kayboluyor.
  const grade = arkaplan?.grade === false ? "" : `,eq=contrast=1.04:saturation=1.08`;
  let perde = "";
  if (arkaplan?.perde) {
    // Basamaklı karartma (3 kalın kutu) gözle görülür bant izi bırakıyordu.
    // Aynı toplam koyulukta ADIM SAYISI artırılınca geçiş yumuşuyor; drawbox
    // ucuz olduğu için geq ile gerçek gradyan hesaplamaya (kare başına
    // piksel-piksel ifade) gerek yok.
    const b = Math.round(K.h * 0.46);
    const adim = 9, alfa = 0.095;
    const kutular = [];
    for (let i = 0; i < adim; i++) {
      const yuk = Math.round((b * (adim - i)) / adim);
      kutular.push(`drawbox=x=0:y=${K.h - yuk}:w=${K.w}:h=${yuk}:color=black@${alfa}:t=fill`);
    }
    perde = "," + kutular.join(",");
  }
  zincir.push(`[0:v]${bgF}${grade}${perde},setsar=1,format=rgba[bg]`);

  // Overlay zinciri: [onceki][kN]overlay=...[oN]
  let onceki = "bg";
  gorseller.forEach((L, i) => {
    const idx = i + 1;
    const { hazirla, govde, etiket } = gorselKatman(L, K, idx);
    zincir.push(hazirla);
    zincir.push(`[${onceki}][${etiket}]${govde}[o${idx}]`);
    onceki = `o${idx}`;
  });

  // --- yazı katmanları (kompozitin üstüne yakılır) ---
  const dt = [];
  for (const L of yazilar) dt.push(...kinetikYazi(L, K));
  const kuyruk = dt.length ? `${dt.join(",")},format=yuv420p` : "format=yuv420p";
  zincir.push(`[${onceki}]${kuyruk}[v]`);

  await run(st.ffmpegPath, [
    ...inputs,
    "-filter_complex", zincir.join(";"),
    "-map", "[v]", "-frames:v", String(N), "-r", String(fps),
    "-c:v", "libx264", "-preset", st.preset, "-crf", String(crf), "-an", "-y", outFile,
  ], { killer });
  return outFile;
}
