// Ekran üstü grafik dili (Vox tarzı): açılış kartı, bölüm kartı,
// dev istatistik, anahtar kelime vurgusu, karşılaştırma barları.
// Hepsi FFmpeg drawtext/drawbox filtreleri üretir — t (saniye) ile animasyonlu.

import fs from "node:fs";

const FONTS = {
  display: ["C:/Windows/Fonts/seguibl.ttf", "C:/Windows/Fonts/ariblk.ttf", "C:/Windows/Fonts/impact.ttf", "C:/Windows/Fonts/arialbd.ttf"],
  bold: ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/segoeuib.ttf"],
};
const pick = (list) => {
  for (const f of list) if (fs.existsSync(f)) return f.replace(":", "\\:");
  return null;
};
export const displayFont = () => pick(FONTS.display);
export const boldFont = () => pick(FONTS.bold);

/** drawtext text= değerinde ':' ve tehlikeli karakterleri temizle/kaçır. */
export function ftext(t, max = 60) {
  const temiz = (t || "")
    .replace(/[\\'"%{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let s = temiz.slice(0, max);
  // KELİME ORTASINDAN KESME.
  //
  // Ölçüldü (20260811-c2e50d): vurgu etiketi ekranda
  // "COCHLEAR IMPLANTS WORLDWIDE, E" olarak çıktı — tam 30 karakter, yani
  // son kelime yarıda kalmış ve ekranda anlamsız bir "E" duruyordu.
  // Kullanıcı bunu "yazıların bazıları yanlış yerde beliriyor" diye bildirdi.
  //
  // Kırpma gerekiyorsa son TAM kelimede bitir. %60 alt sınırı, tek uzun
  // kelimede metnin yarısından fazlasını atmayı önlüyor.
  if (temiz.length > max) {
    const bosluk = s.lastIndexOf(" ");
    if (bosluk >= max * 0.6) s = s.slice(0, bosluk);
    s = s.replace(/[\s,;:.\-–—]+$/, "");
  }
  return s.replace(/:/g, "\\:");
}

const up = (t, loc) => (t || "").toLocaleUpperCase(loc === "tr" ? "tr" : "en");

/** Yumuşak giriş → bekle → çıkış saydamlık eğrisi. */
function fade(t0, inDur, hold, outDur) {
  const a = t0, b = t0 + inDur, c = t0 + inDur + hold, d = c + outDur;
  return `if(lt(t,${a}),0,if(lt(t,${b}),(t-${a})/${inDur.toFixed(2)},if(lt(t,${c}),1,max(0,(${d.toFixed(2)}-t)/${outDur.toFixed(2)}))))`;
}
/** 0→1 arası yumuşayan ilerleme (animasyon sürücüsü). */
function prog(t0, dur) {
  return `min(1,max(0,(t-${t0})/${dur.toFixed(2)}))`;
}

/**
 * Metni en fazla N satıra böl (açgözlü sarma).
 *
 * splitTwo iki satırla sınırlı ve uzun başlıklar bu yüzden kırpılıyordu.
 * Ölçüldü (20260814-a46ab2): 68 karakterlik başlık açılış kartında
 * "WHAT HAPPENS IF EVERY HUMAN ON EARTH FARTS AT THE" diye çıktı — soru
 * yarıda kesilmiş. İzleyicinin gördüğü İLK şey eksik bir cümleydi.
 */
export function satirlaraBol(text, maxPerLine = 24, maxSatir = 3) {
  const kelimeler = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!kelimeler.length) return [];
  const satirlar = [];
  let cur = "";
  for (const k of kelimeler) {
    const aday = cur ? `${cur} ${k}` : k;
    if (aday.length <= maxPerLine || !cur) { cur = aday; continue; }
    satirlar.push(cur); cur = k;
    // Son satıra geldiysek kalan her şeyi oraya yığ — kırpmaktan iyidir.
    if (satirlar.length === maxSatir - 1) {
      const kalan = kelimeler.slice(kelimeler.indexOf(k) + 1);
      cur = [k, ...kalan].join(" ");
      break;
    }
  }
  if (cur) satirlar.push(cur);
  return satirlar.slice(0, maxSatir);
}

/** Metni en fazla 2 satıra böl. */
/**
 * Ekrandaki rakamı binlik ayraçla yaz.
 *
 * ÖLÇÜLEN KUSUR: karşılaştırma barlarında değer ham basılıyordu — "10000"
 * beş haneli okunması güç bir dizi ve aynı videodaki "1,186" ile biçim
 * tutarsız. Sayı değilse (yıl aralığı, "12 kat" gibi) olduğu gibi bırakılır.
 */
export function sayiBicimle(deger, loc = "tr") {
  const s = String(deger ?? "").trim();
  if (!s) return "";
  // Yalnızca DÜZ bir sayıysa biçimle; içinde harf/işaret varsa dokunma.
  if (!/^-?\d+(\.\d+)?$/.test(s)) return s;
  const n = Number(s);
  if (!Number.isFinite(n) || Math.abs(n) < 1000) return s;
  // Yıl gibi görünen 4 haneli sayıya ayraç konmaz (1184 -> 1184, 1.184 değil).
  if (Number.isInteger(n) && Math.abs(n) >= 1000 && Math.abs(n) <= 2999) return s;
  return n.toLocaleString(loc === "tr" ? "tr-TR" : "en-US");
}

export function splitTwo(text, maxPerLine = 24) {
  const words = text.split(" ");
  if (text.length <= maxPerLine || words.length === 1) return [text];
  let l1 = "", i = 0;
  while (i < words.length && (l1 + " " + words[i]).trim().length <= maxPerLine) {
    l1 = (l1 + " " + words[i]).trim(); i++;
  }
  if (!l1) { l1 = words[0]; i = 1; }
  const l2 = words.slice(i).join(" ");
  return l2 ? [l1, l2] : [l1];
}

/**
 * Kanvas verilmezse yatay 1080p varsayılır. Konumlar ve yazı boyutları K.k ile
 * ölçeklenir; dikeyde (1080×1920) kısa kenar aynı olduğu için fiziksel boyut
 * korunur, telefonda orantısal olarak daha büyük görünür — istenen de bu.
 */
const VARSAYILAN_K = { w: 1920, h: 1080, k: 1 };

// ---------------------------------------------------------------- açılış kartı

export function introOverlay(title, accent, loc, K = VARSAYILAN_K) {
  const disp = displayFont();
  if (!disp || !title) return "";
  // BAŞLIK KIRPILMASIN.
  //
  // Ölçüldü (20260814-a46ab2): 68 karakterlik başlık 52'de kesilip iki satıra
  // sığdırılıyordu ve ekranda "WHAT HAPPENS IF EVERY HUMAN ON EARTH FARTS AT
  // THE" diye çıktı — soru yarıda kaldı. Açılış kartı videonun kancası;
  // yarım bir soru kancayı öldürüyor.
  //
  // Artık üç satıra kadar izin var ve yazı satır sayısına göre küçülüyor, yani
  // uzun başlık kırpılmak yerine sığdırılıyor. Tavan 96 karakter: ondan uzun
  // başlık zaten YouTube'da da kesiliyor ve kartta okunmaz hâle gelir.
  const perLine = K.w < K.h ? 18 : 26;
  const lines = satirlaraBol(ftext(title, 96), perLine, 3).map((l) => up(l, loc));
  // Üç satırda punto düşer ki alt bant ve altyazıyla çakışmasın.
  const boy = Math.round((lines.length >= 3 ? 54 : 68) * K.k);
  const satirAralik = Math.round((lines.length >= 3 ? 66 : 84) * K.k);
  const y0 = Math.round(K.h * (lines.length >= 3 ? 0.545 : lines.length === 2 ? 0.593 : 0.648));
  const a = fade(0.5, 0.6, 3.3, 0.7);
  const p = prog(0.6, 0.45);
  return "," + [
    `drawbox=x='(iw-${Math.round(190 * K.k)}*${p})/2':y=${y0 - Math.round(52 * K.k)}:w='${Math.round(190 * K.k)}*${p}':h=${Math.round(10 * K.k)}:color=${accent}@0.95:t=fill:enable='between(t,0.6,4.9)'`,
    ...lines.map((ln, i) =>
      `drawtext=fontfile='${disp}':text='${ln}':fontcolor=white:fontsize=${boy}:borderw=3:bordercolor=black@0.8` +
      `:x=(w-text_w)/2:y='${y0 + i * satirAralik}+18*(1-${prog(0.5, 0.5)})':alpha='${a}'`),
  ].join(",");
}

// ---------------------------------------------------------------- bölüm kartı

export function chapterOverlay(n, title, accent, loc, K = VARSAYILAN_K) {
  const disp = displayFont();
  if (!disp || !title) return "";
  const clean = title.replace(/^\s*(bölüm|chapter|part)\s*\d+\s*[:\-–·.]\s*/i, "");
  const a = fade(0.25, 0.45, 2.4, 0.6);
  const p = prog(0.3, 0.35);
  const X = Math.round(K.w * 0.033), Y = Math.round(K.h * 0.072);
  return "," + [
    `drawbox=x=${X}:y=${Y}:w=${Math.round(10 * K.k)}:h='${Math.round(96 * K.k)}*${p}':color=${accent}@0.95:t=fill:enable='between(t,0.3,3.6)'`,
    `drawtext=fontfile='${disp}':text='${up(`${loc === "tr" ? "BÖLÜM" : "CHAPTER"} ${n}`, loc)}':fontcolor=${accent}:fontsize=${Math.round(30 * K.k)}:x='${X + Math.round(28 * K.k)}+14*(1-${p})':y=${Y + Math.round(6 * K.k)}:alpha='${a}'`,
    `drawtext=fontfile='${disp}':text='${up(ftext(clean, K.w < K.h ? 24 : 38), loc)}':fontcolor=white:fontsize=${Math.round(48 * K.k)}:borderw=2:bordercolor=black@0.7:x='${X + Math.round(28 * K.k)}+14*(1-${p})':y=${Y + Math.round(44 * K.k)}:alpha='${a}'`,
  ].join(",");
}

// ------------------------------------------------------------- vurgu grafikleri

/**
 * Segmentin ekran üstü grafiği. Vox dili: sol alt blok, renk vurgusu, kayarak gelen dev rakam.
 * @param emphasis {type:'none'|'stat'|'keyword'|'compare', value, label, items[]}
 * @param dur      klibin süresi (sn) — grafik buna sığdırılır
 */
export function emphasisOverlay(emphasis, dur, accent, loc, K = VARSAYILAN_K) {
  const e = emphasis;
  if (!e || !e.type || e.type === "none") return "";
  const disp = displayFont();
  const bold = boldFont();
  if (!disp) return "";

  // Aynı sıra hatası burada da vardı: `max(1.2, ...)` tabanı yükselttiği için
  // altındaki `< 1.2` kontrolü hiç çalışmıyordu ve kısa sahnede grafik, klip
  // bitene kadar ekranda asılı kalıyordu.
  const t0 = 0.45;
  const yer = dur - t0 - 1.0;
  if (yer < 1.2) return "";
  const hold = Math.min(3.4, yer);
  const a = fade(t0, 0.4, hold, 0.55);
  const aLate = fade(t0 + 0.18, 0.4, hold - 0.18, 0.55);
  const p = prog(t0, 0.42);
  const parts = [];

  // Sol kenar boşluğu ve blok konumu kanvasa oranlanır; dikeyde 110px sabit
  // marj çok dar, 620px y ise ekranın ortasına düşüyordu.
  const X = Math.round(K.w * 0.057);
  const S = (n) => Math.round(n * K.k);
  const dar = K.w < K.h;

  if (e.type === "stat" && e.value) {
    const val = up(ftext(e.value, 16), loc);
    const size = S(val.length > 10 ? 96 : val.length > 6 ? 124 : 152);
    const y = Math.round(K.h * 0.574);
    parts.push(
      `drawbox=x=${X}:y=${y - S(34)}:w='${S(210)}*${p}':h=${S(12)}:color=${accent}@1:t=fill:enable='between(t,${t0},${(t0 + 0.42 + hold + 0.55).toFixed(2)})'`,
      `drawtext=fontfile='${disp}':text='${val}':fontcolor=white:fontsize=${size}:borderw=4:bordercolor=black@0.65:x=${X}:y='${y}+26*(1-${p})':alpha='${a}'`
    );
    // ALT ETİKET İKİ SATIRA SIĞAR — TEK SATIRDA KIRPILMAZ.
    //
    // ÖLÇÜLEN KUSUR (20260817-b05a7a): etiket `ftext(e.label, 30)` ile tek
    // satıra kırpılıyordu ve 15 rakam grafiğinin 6'sı yarım cümleyle ekranda
    // kalıyordu — hep de anlamı taşıyan son kelime düşüyordu:
    //   "settlement layers under Hisarlik" -> "SETTLEMENT LAYERS UNDER"  (neyin?)
    //   "lower city south of the citadel"  -> "LOWER CITY SOUTH OF THE"  (neyin?)
    //   "years of excavation at Troy"      -> "YEARS OF EXCAVATION AT"   (nerede?)
    //
    // Dikey yer var: 152px'lik rakamda etiket y=790, alt sınırı 832; ASS
    // altyazının üst kenarı ~946. İkinci satır rahat sığıyor.
    // İki satıra düşüldüğünde punto küçülür ki blok aynı yeri kaplasın.
    const labSatir = splitTwo(ftext(e.label, 56), 26).map((l) => up(l, loc)).filter(Boolean);
    if (labSatir.length && bold) {
      const labBoy = S(labSatir.length > 1 ? 34 : 42);
      labSatir.forEach((ln, i) => {
        parts.push(`drawtext=fontfile='${bold}':text='${ln}':fontcolor=0xE6EDF5:fontsize=${labBoy}:borderw=2:bordercolor=black@0.6:x=${X + 4}:y=${y + size + S(18) + i * (labBoy + S(6))}:alpha='${aLate}'`);
      });
    }
  }

  if (e.type === "keyword" && e.value) {
    const lines = splitTwo(ftext(e.value, 44), dar ? 14 : 20).map((l) => up(l, loc));
    const size = S(lines.some((l) => l.length > 14) ? 92 : 112);
    const y = Math.round(K.h * (lines.length === 2 ? 0.519 : 0.593));
    lines.forEach((ln, i) => {
      parts.push(`drawtext=fontfile='${disp}':text='${ln}':fontcolor=white:fontsize=${size}:borderw=4:bordercolor=black@0.7:x=${X}:y='${y + i * (size + S(10))}+24*(1-${p})':alpha='${a}'`);
    });
    parts.push(`drawbox=x=${X}:y=${y + lines.length * (size + S(10)) + S(6)}:w='${S(260)}*${p}':h=${S(12)}:color=${accent}@1:t=fill:enable='between(t,${t0},${(t0 + 0.42 + hold + 0.55).toFixed(2)})'`);
  }

  if (e.type === "compare" && Array.isArray(e.items) && e.items.length >= 2) {
    const items = e.items.slice(0, 4).filter((it) => it && isFinite(+it.value));
    if (!items.length) return "";
    // BARLAR SIFIRDAN DEĞİL, EN KÜÇÜK DEĞERİN ALTINDAN BAŞLAR.
    //
    // ÖLÇÜLEN KUSUR (20260817-b05a7a): bar uzunluğu `değer/max` idi. Yıl
    // karşılaştırmasında Eratosthenes=1184 ve Herodotus=1250 -> 663px ve 700px,
    // fark %5,3. Videodan alınan karede iki bar gözle ayırt edilemiyor: grafik
    // hiçbir şey anlatmıyor, yalnızca ekranı kaplıyor.
    //
    // Değerler birbirine yakınsa taban yükseltilir, böylece FARK görünür olur.
    // Taban kaydırıldığında bar artık "mutlak büyüklük" değil "aradaki fark"
    // anlatır — bu yüzden yalnızca fark küçükken uygulanır.
    const degerler = items.map((it) => Math.abs(+it.value));
    const enBuyuk = Math.max(...degerler) || 1;
    const enKucuk = Math.min(...degerler);
    const yakin = (enBuyuk - enKucuk) < enBuyuk * 0.15;
    const taban = yakin ? enKucuk - (enBuyuk - enKucuk) * 0.35 : 0;
    const yayilim = Math.max(1e-6, enBuyuk - taban);
    const max = enBuyuk;
    // Dikey kanvasta 700px bar taşardı; genişliğin oranına bağlandı.
    const barMaxW = Math.round(Math.min(700, K.w * 0.46)), barH = Math.round(46 * K.k),
      gap = Math.round(28 * K.k), x0 = Math.round(K.w * 0.058);
    const total = items.length * barH + (items.length - 1) * gap;
    const yTop = K.h - Math.round(168 * K.k) - total;
    parts.push(`drawbox=x=${x0 - 28}:y=${yTop - 32}:w=${barMaxW + 200}:h=${total + 66}:color=0x0B0F16@0.7:t=fill:enable='between(t,${t0},${(t0 + 0.42 + hold + 0.55).toFixed(2)})'`);
    items.forEach((it, i) => {
      const y = yTop + i * (barH + gap);
      const w = Math.max(60, Math.round(((Math.abs(+it.value) - taban) / yayilim) * barMaxW));
      const pi = prog(t0 + 0.12 * i, 0.55);
      const ai = fade(t0 + 0.12 * i, 0.35, hold - 0.12 * i, 0.5);
      const col = i === 0 ? accent : "0x7C8899";
      parts.push(
        `drawbox=x=${x0}:y=${y}:w='${w}*${pi}':h=${barH}:color=${col}@0.96:t=fill:enable='between(t,${(t0 + 0.12 * i).toFixed(2)},${(t0 + 0.42 + hold + 0.55).toFixed(2)})'`,
        `drawtext=fontfile='${bold || disp}':text='${up(ftext(it.label, 22), loc)}':fontcolor=white:fontsize=34:x=${x0 + 14}:y=${y + 6}:alpha='${ai}'`,
        // RAKAM BİNLİK AYRAÇLI. "10000" beş haneli ham rakam olarak okunması
        // güç ve aynı videodaki "1,186" ile biçim tutarsızlığı yaratıyordu.
        `drawtext=fontfile='${disp}':text='${ftext(sayiBicimle(it.value, loc), 14)}':fontcolor=white:fontsize=38:x='${x0 + 22}+${w}*${pi}':y=${y + 3}:alpha='${ai}'`
      );
    });
  }

  return parts.length ? "," + parts.join(",") : "";
}

/**
 * KOLAJ modu ekran yazısı: kalın sıkışık BÜYÜK HARF, kömür kutu içinde,
 * yerine oturarak gelir. Keyframe'de yazı yoktur — tüm yazı burada yakılır.
 */
export function collageOverlay(text, dur, loc, K = VARSAYILAN_K) {
  const disp = displayFont();
  const t = ftext(text, 28);
  if (!disp || !t) return "";
  const label = up(t, loc);
  const t0 = 0.28;
  const hold = Math.max(0.9, Math.min(2.6, dur - t0 - 0.5));
  const a = fade(t0, 0.16, hold, 0.3);            // sert giriş — kolaj hissi
  const p = prog(t0, 0.18);
  const ham = label.length > 16 ? 82 : label.length > 10 ? 104 : 124;
  // Kutu kanvas genişliğini aşmasın — dikeyde ham boyut taşıyordu
  const size = Math.min(Math.round(ham * K.k), Math.floor((K.w * 0.82 - 72) / (label.length * 0.62)));
  const boxH = Math.round(size * 1.34);
  const boxW = Math.round(label.length * size * 0.62 + 72);
  const x = Math.round(K.w * 0.0625), y = Math.round(K.h * 0.109);
  return "," + [
    `drawbox=x=${x}:y='${y}+10*(1-${p})':w='${boxW}*${p}':h=${boxH}:color=0x2A2A2E@0.94:t=fill:enable='between(t,${t0},${(t0 + 0.16 + hold + 0.3).toFixed(2)})'`,
    `drawbox=x=${x}:y='${y + boxH}+10*(1-${p})':w='${boxW}*${p}':h=12:color=${RED_FF}@1:t=fill:enable='between(t,${t0},${(t0 + 0.16 + hold + 0.3).toFixed(2)})'`,
    `drawtext=fontfile='${disp}':text='${label}':fontcolor=0xF4EBDC:fontsize=${size}:x=${x + 34}:y='${y + Math.round(boxH * 0.16)}+10*(1-${p})':alpha='${a}'`,
  ].join(",");
}

const RED_FF = "0xE02417"; // #E02417

/**
 * ALT BANT ETİKETİ — "Jacques Piccard · Denizaltı mühendisi".
 *
 * Belgeselin en eski ve en işe yarar aracı: ekranda bir kişi/yer görünürken
 * kim/nerede olduğunu söyler. Nova'da hiç yoktu; izleyici "bu adam kim" diye
 * sorup cevapsız kalıyordu. Anlatıcı ismi söylerken girer, birkaç saniye durur.
 *
 * Kadrajın SOL ALTINDA, altyazının ÜSTÜNDE durur — ikisi çakışmasın diye
 * altyazı bandından yukarıda konumlanır.
 *
 * @param ad    büyük satır (kişi/yer adı)
 * @param rol   küçük ikinci satır (unvan/açıklama) — boş olabilir
 */
export function altBant(ad, rol, dur, accent, loc, K = VARSAYILAN_K) {
  const disp = displayFont();
  const bold = boldFont();
  const isim = ftext(String(ad || "").trim(), 34);
  if (!disp || !isim) return "";

  // SIRA ÖNEMLİ: önce sahnede GERÇEKTEN ne kadar yer olduğuna bak, sonra taban
  // uygula. Ters sırada (`max(1.4, ...)` sonra `< 1.4` kontrolü) koruma hiç
  // ateşlenmiyor — taban zaten değeri yükseltiyor, kontrol hep yanlış çıkıyor.
  const t0 = 0.55;
  const yer = dur - t0 - 1.0;          // giriş/çıkış payı düşülmüş boş süre
  if (yer < 1.4) return "";            // kısa sahnede bant görünmeden kesilir
  const hold = Math.min(3.2, yer);
  const a = fade(t0, 0.32, hold, 0.4);
  const p = prog(t0, 0.36);
  const S = (n) => Math.round(n * K.k);

  const altRol = ftext(String(rol || "").trim(), 40);
  const isimBoy = S(K.w < K.h ? 44 : 40);
  const rolBoy = S(K.w < K.h ? 26 : 24);
  const x = Math.round(K.w * 0.057);
  // Altyazı bandının üstünde kal: altyazı ~%88'de, etiket %72-80 arası.
  const yTaban = Math.round(K.h * (K.w < K.h ? 0.70 : 0.745));
  const cizgiKalin = Math.max(3, S(5));
  const cizgiBoy = Math.round(isimBoy * 2.6);

  const parts = [
    // Sol dikey aksan çizgisi — yukarıdan aşağı açılır
    `drawbox=x=${x}:y=${yTaban}:w=${cizgiKalin}:h='${cizgiBoy}*${p}'` +
      `:color=${accent}@0.95:t=fill:enable='between(t,${t0},${(t0 + 0.32 + hold + 0.4).toFixed(2)})'`,
    // İsim — çizginin sağında, hafif yukarıdan kayarak
    `drawtext=fontfile='${bold || disp}':text='${isim}':fontcolor=0xF4F7FA:fontsize=${isimBoy}` +
      `:borderw=${Math.max(2, S(3))}:bordercolor=0x0A0C10@0.85` +
      `:x=${x + cizgiKalin + S(18)}:y='${yTaban + S(4)}+${S(10)}*(1-${p})':alpha='${a}'`,
  ];
  if (altRol) {
    parts.push(
      `drawtext=fontfile='${disp}':text='${altRol}':fontcolor=0xB9C4D2:fontsize=${rolBoy}` +
        `:borderw=${Math.max(1, S(2))}:bordercolor=0x0A0C10@0.8` +
        `:x=${x + cizgiKalin + S(18)}:y='${yTaban + isimBoy + S(14)}+${S(10)}*(1-${p})':alpha='${a}'`
    );
  }
  return "," + parts.join(",");
}

/** Vurgulu beat'lerde sert yakınlaşma (punch-in) — Ken Burns yerine kullanılır. */
/**
 * METİN PERDESİ — sahnenin hiç görseli yoksa.
 *
 * Eskiden bu sahneler düz koyu zemine düşüyordu: ekranda yalnızca altyazı olan,
 * ölü bir kare. Baba Vanga gibi arşivde karşılığı olmayan konularda birden çok
 * sahne birden böyle kalıyordu.
 *
 * Belgeselin bu duruma çözümü boş ekran değil, TİPOGRAFİ: sahnenin kilit
 * ifadesi ekranı kaplar. Boş kareden iyi olmasının ötesinde, doğru yerde
 * kullanıldığında görsel bulmaktan daha güçlü durur.
 *
 * @param metin  ekranı kaplayacak kilit ifade (sahnenin vurgusu)
 * @param ustBilgi küçük üst etiket (bölüm adı ya da konu) — boş olabilir
 * @param dur    sahnenin süresi (sn)
 */
export function metinPerdesi(metin, ustBilgi, dur, accent, loc, K = VARSAYILAN_K) {
  const disp = displayFont();
  const temiz = String(metin || "").trim();
  if (!disp || !temiz) return "";

  // Ekranın %86'sı kullanılabilir; punto satır uzunluğuna göre küçülür ki
  // uzun ifade kadraj dışına taşmasın (vurgu yazısında yaşanmış bir hataydı).
  const satirlar = splitTwo(ftext(temiz, 64), K.w < K.h ? 16 : 26);
  const enUzun = Math.max(...satirlar.map((s) => s.length), 1);
  const kullanilir = K.w * 0.86;
  const boy = Math.max(Math.round(38 * K.k),
    Math.min(Math.round(112 * K.k), Math.floor(kullanilir / (enUzun * 0.54))));
  const satirYuk = Math.round(boy * 1.22);
  const toplamYuk = satirYuk * satirlar.length;
  const y0 = Math.round(K.h / 2 - toplamYuk / 2);

  // Sahne kısaysa bekleme süresi de kısalır; negatif olursa filtre bozulur.
  const bekle = Math.max(0.8, Math.min(dur - 1.3, 4.2));
  const a = fade(0.35, 0.55, bekle, 0.65);
  const p = prog(0.35, 0.9);

  const parcalar = [
    // Aksan çizgisi yazının üstünde açılır — kare "kurulmuş" hissi versin.
    `drawbox=x='${Math.round(K.w / 2)}-${Math.round(90 * K.k)}*${p}':y=${y0 - Math.round(46 * K.k)}` +
    `:w='${Math.round(180 * K.k)}*${p}':h=${Math.round(6 * K.k)}:color=${accent}@0.95:t=fill`,
  ];
  if (ustBilgi) {
    parcalar.push(
      `drawtext=fontfile='${disp}':text='${up(ftext(ustBilgi, 34), loc)}':fontcolor=${accent}` +
      `:fontsize=${Math.round(26 * K.k)}:x=(w-tw)/2:y=${y0 - Math.round(96 * K.k)}:alpha='${a}'`);
  }
  satirlar.forEach((s, i) => {
    parcalar.push(
      `drawtext=fontfile='${disp}':text='${up(s, loc)}':fontcolor=white:fontsize=${boy}` +
      `:borderw=${Math.max(2, Math.round(3 * K.k))}:bordercolor=black@0.55` +
      // Aşağıdan hafifçe yükselerek gelir.
      `:x=(w-tw)/2:y='${y0 + i * satirYuk}+${Math.round(22 * K.k)}*(1-${p})':alpha='${a}'`);
  });
  return "," + parcalar.join(",");
}

export function punchZoom(N, fps, kanvas) {
  const s = kanvas ? kanvas.zp(fps) : `:s=1920x1080:fps=${fps}`;
  // VURUŞ BİTİNCE HAREKET BİTMEZ.
  //
  // ÖLÇÜLEN KUSUR (20260817-b05a7a): ifade `min(1, on/(N*0.35))` idi. Vuruş
  // planın ilk %35'inde tamamlanıyor, o noktadan sonra ifade TAMAMEN SABİT
  // kalıyor ve kalan %65 birebir kopya kare oluyor. İzole ölçüldü:
  //   N=471 (15,7sn) -> donma 5,47. saniyede başlıyor
  //   N=600 (20,0sn) -> 7,00. saniyede
  //   N=270 ( 9,0sn) -> 3,13. saniyede
  // Bitmiş videoda 108 donma olayı / 124,3 saniye ölçüldü; bu dal başlıca
  // kaynaklardan biriydi.
  //
  // Vuruş korunuyor (ilk %35'te 1.10 -> 1.26), üstüne plan boyu süren yavaş
  // bir sürüklenme ekleniyor. Sürüklenme SÜREYE göre değil orana göre: vuruşun
  // kendisi zaten hızlı, buradaki iş yalnızca kareyi canlı tutmak.
  const K = Math.max(1, Math.round(N * 0.35));
  const N1 = Math.max(1, N - 1);
  return `zoompan=z='1.10+0.16*min(1,on/${K})+0.07*on/${N1}':` +
    `x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2':d=${N}${s}`;
}
