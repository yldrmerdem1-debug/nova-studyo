import fs from "node:fs";
import path from "node:path";
import { run } from "../util.js";
import { THEME_ACCENT as ACCENT } from "../config.js";

function archiveCoverRank(media) {
  if (media?.provider !== 'archive' || media.permissionVerified !== true ||
      media.editorial?.sourceRole !== 'evidence' ||
      !/^https?:\/\//i.test(media.sourceUrl || media.sayfa || '')) return 0;
  const context = `${media.sourceId || ''} ${media.editorial.reason || ''}`;
  return /\bportrait\b|\bflown crew\b|\bphotograph of (?:the )?(?:actual )?crew\b/i.test(context) ? 2 : 1;
}

export function rankThumbnailCandidates(candidates, job = {}) {
  return candidates.slice().sort((a, b) =>
    ((b.b.media.gorsel ?? -1) - (a.b.media.gorsel ?? -1)) ||
    ((b.b.media.kalite ?? -1) - (a.b.media.kalite ?? -1)) ||
    (job.mediaKind === 'director' ? archiveCoverRank(b.b.media) - archiveCoverRank(a.b.media) : 0) ||
    (a.i - b.i));
}

function findDisplayFont() {
  for (const f of [
    "C:/Windows/Fonts/seguibl.ttf",   // Segoe UI Black
    "C:/Windows/Fonts/ariblk.ttf",    // Arial Black
    "C:/Windows/Fonts/impact.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
  ]) if (fs.existsSync(f)) return f.replace(":", "\\:");
  return null;
}
function findBoldFont() {
  for (const f of ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/segoeuib.ttf"]) {
    if (fs.existsSync(f)) return f.replace(":", "\\:");
  }
  return null;
}

/**
 * Kapak metnini temizle.
 *
 * İki gerçek kusur düzeltildi:
 *  1) U+FFFD (bozuk kodlama işareti) ve kontrol karakterleri kapağa basılıyordu —
 *     gerçek kapaklarda "BEK<?>İLERİN" gibi çıktı görüldü.
 *  2) slice(max) kelimenin ORTASINDAN kesiyordu ("BİLİNMEYEN HİKÂ"). Artık son
 *     tam kelimeden kesiliyor.
 */
const clean = (t, max) => {
  const temiz = String(t || "")
    .replace(/[\uFFFD\u0000-\u001F\u007F-\u009F]/g, "")   // bozuk kodlama + kontrol
    .replace(/['\\%{}":;]/g, "")                            // drawtext'i bozan karakterler
    .replace(/\s+/g, " ")
    .trim();
  if (temiz.length <= max) return temiz;
  const kirpik = temiz.slice(0, max);
  const bosluk = kirpik.lastIndexOf(" ");
  // Kelime sınırı çok geride kaldıysa (tek uzun kelime) mecburen sert kes
  return bosluk > max * 0.55 ? kirpik.slice(0, bosluk) : kirpik;
};

/**
 * PUNTOYU KADRAJA SIĞDIR — kapağın en görünür hatası buydu.
 *
 * Punto SABİTTİ (A'da 118/138, C'de 64) ve genişlik hiç ölçülmüyordu. Ölçüldü
 * (20260809-c03c63): "BULGAR KÂHİNİN GERÇEK" sağdan taştı ve ekranda
 * "BULGAR KÂHİNİN GE" göründü; C varyantında da "GERÇEK"te kesildi.
 *
 * drawtext gerçek genişliği ancak render sırasında bilir, ama ağır/siyah
 * yazı tiplerinde büyük harf ortalama genişliği punto başına yaklaşık 0,60'tır
 * (Segoe UI Black, Arial Black). Güvenli tarafta kalmak için 0,63 alınıyor:
 * biraz küçük yazı, kesik yazıdan iyidir.
 */
const KARAKTER_ORANI = 0.63;

export function sigdiranPunto(satirlar, kutuGenislik, tabanPunto, enAz = 34) {
  const enUzun = Math.max(1, ...satirlar.map((s) => String(s).length));
  const sigan = Math.floor(kutuGenislik / (KARAKTER_ORANI * enUzun));
  return Math.max(enAz, Math.min(tabanPunto, sigan));
}

/** Metni en fazla 2 satıra böl (kelime sınırından). */
function twoLines(text, maxPerLine = 14) {
  const words = text.split(" ");
  if (text.length <= maxPerLine || words.length === 1) return [text];
  let l1 = "", l2 = "";
  for (const w of words) {
    if ((l1 + " " + w).trim().length <= maxPerLine || !l1) l1 = (l1 + " " + w).trim();
    else l2 = (l2 + " " + w).trim();
  }
  if (!l2) { // tek uzun satır kaldıysa ortadan böl
    const mid = Math.ceil(words.length / 2);
    l1 = words.slice(0, mid).join(" ");
    l2 = words.slice(mid).join(" ");
  }
  return [l1, l2];
}

/**
 * 3 kapak varyantı üretir: thumb_a (sinematik), thumb_b (renk panel), thumb_c (çerçeve).
 * thumbnail.jpg = varsayılan (A). Dönen dizi: üretilen dosya adları.
 */
export async function makeThumbnails({ job, title, imageFile, imageFiles, jobDir, st, killer, logFn }) {
  // Üç varyant ÜÇ FARKLI görsel kullanır; tek görsel verilirse hepsi ona düşer.
  const G = (imageFiles && imageFiles.length ? imageFiles : [imageFile]).filter(Boolean);
  const gorsel = (i) => G[i % Math.max(1, G.length)] || imageFile;
  const disp = findDisplayFont();
  const bold = findBoldFont();
  const accent = ACCENT[job.theme] || ACCENT.belgesel;
  const loc = job.language === "tr" ? "tr" : "en";
  const raw = clean(job.thumbnailText || title || job.topic, 34).toLocaleUpperCase(loc);
  // Kicker kaynağı job.topic DEĞİL: kullanıcının yazdığı ham konu ("Dünyanın en
  // derin noktası: Mariana Çukuru") ana başlıkla neredeyse birebir aynı çıkıyor
  // ve kapakta aynı şey iki kez yazıyordu. Üretilen başlık farklı bir cümle.
  const kickerHam = job.meta?.title && job.meta.title !== job.topic ? job.meta.title : (title || job.topic);
  // YARIM CÜMLE BASMAKTANSA HİÇ BASMA.
  //
  // ÖLÇÜLEN KUSUR (20260817-b05a7a): kicker `clean(..., 26)` ile kırpılıyordu.
  // Başlık "The Trojan War: What Really Happened Behind the Legend?" olduğu
  // için kapakta üst satırda "THE TROJAN WAR WHAT" yazıyordu — cümlenin
  // ortasından kopmuş, soru işareti olmayan bir parça. Masaüstü önizlemesinde
  // yarım kalmış bir cümle, mobilde okunmayan soluk bir şerit.
  //
  // Kırpma yerine ELEME: 26 karaktere anlamlı biçimde sığmıyorsa kicker
  // tamamen düşer. Kod zaten boş kicker durumunu doğru ele alıyor (aşağıda
  // drawtext hiç basılmıyor), yalnızca o dala düşürmek gerekiyordu.
  const kickerTam = String(kickerHam || "").trim();
  // İlk cümle/ilk yan cümle: iki nokta, tire ya da soru işaretine kadar olan
  // kısım genelde tek başına anlamlı bir öbektir ("The Trojan War").
  const kickerParca = kickerTam.split(/[:—–?|]/)[0].trim();
  let kicker = kickerParca.length >= 3 && kickerParca.length <= 26
    ? clean(kickerParca, 26).toLocaleUpperCase(loc)
    : "";
  // TEKRARI KES. Yukarıdaki önlem yetmedi: `thumbnailText` boş geldiğinde raw
  // da başlığa düşüyor ve kicker ile ana yazı AYNI cümle oluyor. Ölçüldü
  // (20260809-c03c63): kapakta küçük sarı satırda "BABA VANGA BULGAR KÂHİNİN",
  // hemen altında dev harflerle aynı şey yazıyordu. Örtüşüyorsa kicker düşer.
  const ilkKelime = (s) => String(s).split(" ")[0] || "";
  if (kicker && (raw.startsWith(kicker.slice(0, 12)) || kicker.startsWith(raw.slice(0, 12)) ||
      ilkKelime(kicker) === ilkKelime(raw))) {
    kicker = "";
  }
  const made = [];

  const grad = `color=c=black:s=1280x720`;
  const gradFilter = `format=rgba,geq=r='0':g='0':b='0':a='min(255,255*pow(Y/H,2.1)*1.05)'`;

  // ---- A) SİNEMATİK: görsel + alt gradyan + büyük başlık ----
  if (imageFile && disp) {
    // Kapak mobilde 168 piksel genişlikte görünüyor. 88 punto başlık orada
    // 11 piksele iniyor ve okunmuyor — YouTube kapaklarında ana başlık kapak
    // yüksekliğinin en az %15'i olmalı (720 × 0,15 ≈ 108). 130'a çıkarıldı.
    const lines = twoLines(raw, 13);
    // Sol kenar 56, sağda 40 pay bırakılıyor → kullanılabilir genişlik 1184.
    const boy = sigdiranPunto(lines, 1280 - 56 - 40, lines.length === 2 ? 118 : 138);
    const satirAral = Math.round(boy * 1.12);
    const y0 = lines.length === 2 ? 720 - 62 - satirAral * 2 : 720 - 72 - satirAral;
    const texts = lines
      .map((ln, i) => `drawtext=fontfile='${disp}':text='${ln}':fontcolor=white:borderw=4:bordercolor=black@0.9:fontsize=${boy}:x=56:y=${y0 + i * satirAral}`)
      .join(",");
    const out = path.join(jobDir, "thumb_a.jpg");
    await run(st.ffmpegPath, [
      "-i", gorsel(0), "-f", "lavfi", "-i", grad,
      "-filter_complex",
      `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.07:saturation=1.22[b];` +
      `[1:v]${gradFilter}[g];[b][g]overlay,` +
      // Kicker düştüyse boş drawtext basma — hem gereksiz hem de bazı ffmpeg
      // sürümlerinde boş text kadraja görünmez bir kutu bırakıyor.
      (bold && kicker ? `drawtext=fontfile='${bold}':text='${kicker}':fontcolor=${accent}:fontsize=30:x=56:y=${y0 - 78},` : "") +
      texts,
      "-frames:v", "1", "-q:v", "2", "-y", out,
    ], { killer });
    made.push("thumb_a.jpg");
  }

  // ---- B) RENK PANELİ: sol blok + kelime kelime dev yazı, sağda görsel ----
  if (G.length && disp) {
    const words = raw.split(" ").slice(0, 4);
    // Sol panel 470 piksel, yazı x=44'ten başlıyor → kullanılabilir 406.
    // Eskiden punto yalnızca kelime UZUNLUĞUNA göre kabaca seçiliyordu ve
    // uzun kelimelerde panelden taşıyordu.
    const size = sigdiranPunto(words, 470 - 44 - 20, 92, 30);
    const startY = 360 - (words.length * (size + 14)) / 2;
    const texts = words
      .map((w, i) => `drawtext=fontfile='${disp}':text='${w}':fontcolor=white:fontsize=${size}:x=44:y=${Math.round(startY + i * (size + 14))}`)
      .join(",");
    const out = path.join(jobDir, "thumb_b.jpg");
    await run(st.ffmpegPath, [
      "-i", gorsel(1),
      "-filter_complex",
      `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.06:saturation=1.2,` +
      `drawbox=x=0:y=0:w=470:h=720:color=0x0B0F16@0.93:t=fill,` +
      `drawbox=x=470:y=0:w=14:h=720:color=${accent}@1:t=fill,` +
      `drawbox=x=44:y=624:w=140:h=10:color=${accent}@1:t=fill,` +
      texts,
      "-frames:v", "1", "-q:v", "2", "-y", out,
    ], { killer });
    made.push("thumb_b.jpg");
  }

  // ---- C) ÇERÇEVE: tam görsel + kalın renk çerçeve + alt bant başlık ----
  if (disp) {
    const lines = twoLines(raw, 20);
    // Ortalanmış yazı: iki yanda 40'ar pay → kullanılabilir 1200.
    const cBoy = sigdiranPunto(lines, 1280 - 80, 64, 30);
    const cAral = Math.round(cBoy * 1.16);
    const bandH = lines.length === 2 ? Math.round(cAral * 2 + 42) : Math.round(cAral + 46);
    const texts = lines
      .map((ln, i) => `drawtext=fontfile='${disp}':text='${ln}':fontcolor=white:fontsize=${cBoy}:x=(w-text_w)/2:y=${720 - bandH + 26 + i * cAral}`)
      .join(",");
    const out = path.join(jobDir, "thumb_c.jpg");
    const src = G.length
      ? ["-i", gorsel(2)]
      : ["-f", "lavfi", "-i", "color=c=0x10151d:s=1280x720"];
    await run(st.ffmpegPath, [
      ...src,
      "-vf",
      `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,eq=contrast=1.06:saturation=1.15,` +
      `drawbox=x=0:y=${720 - bandH}:w=1280:h=${bandH}:color=0x0B0F16@0.88:t=fill,` +
      `drawbox=x=0:y=${720 - bandH}:w=1280:h=8:color=${accent}@1:t=fill,` +
      `drawbox=x=0:y=0:w=1280:h=720:color=${accent}@1:t=10,` +
      texts,
      "-frames:v", "1", "-q:v", "2", "-y", out,
    ], { killer });
    made.push("thumb_c.jpg");
  }

  // Shorts are selected from a portrait grid. Keep the standard landscape
  // variants for cross-promotion, but publish a dedicated 9:16 default.
  if (job.ratio === '9:16' && G.length && disp) {
    const lines=twoLines(raw,11);
    const size=sigdiranPunto(lines,1080-160,lines.length===2?164:188,64);
    const gap=Math.round(size*1.12),top=lines.length===2?1180:1280;
    const texts=lines.map((line,index)=>`drawtext=fontfile='${disp}':text='${line}':fontcolor=white:borderw=5:bordercolor=black@0.9:fontsize=${size}:x=(w-text_w)/2:y=${top+index*gap}`).join(',');
    const out=path.join(jobDir,'thumb_portrait.jpg');
    await run(st.ffmpegPath,[
      '-i',gorsel(0),'-f','lavfi','-i','color=c=black:s=1080x1920',
      '-filter_complex',
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,eq=contrast=1.06:saturation=1.1[b];`+
      `[1:v]${gradFilter}[g];[b][g]overlay,`+
      texts,
      '-frames:v','1','-q:v','2','-y',out,
    ],{killer});
    made.push('thumb_portrait.jpg');
  }

  // varsayılan kapak = A (yoksa C)
  const def = made.includes('thumb_portrait.jpg') ? 'thumb_portrait.jpg' : made.includes("thumb_a.jpg") ? "thumb_a.jpg" : made[0];
  if (def) fs.copyFileSync(path.join(jobDir, def), path.join(jobDir, "thumbnail.jpg"));
  logFn?.(`Kapak tasarımları hazır: ${made.length} varyant`);
  return made;
}
