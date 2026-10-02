// PARALEL KODLAMA BELLEĞİ TÜKETMEMELİ.
//
// ÖLÇÜLEN KUSUR (20260811-130aa9): render "25 kesme (10 paralel)" diyerek
// başladı ve 25 kesmenin HEPSİ düştü:
//   x264 [error]: malloc of size 11619264 failed
//   Generic error in an external library      (ffmpeg AVERROR_EXTERNAL)
// Hepsi yedek karta düştü, ardından final kodlama da aynı yerde çöktü —
// yani ortada video yok, ama araştırma/senaryo/seslendirme parası harcanmış.
//
// SEBEP: `concurrency` = çekirdek − 2 = 10 paralel ffmpeg. ffmpeg kendi başına
// bırakılınca x264'e çekirdek sayısı kadar (12) iş parçacığı açıyor.
// 10 × 12 = 120 kodlayıcı iş parçacığı, her biri 1080p kare/lookahead tamponu
// ayırıyor. config.js'teki eski yorum "ffmpeg tek klipte tek çekirdek kullanıyor"
// diyordu; bu YANLIŞTI ve kusurun kaynağıydı.
//
// GERÇEK ÖLÇÜM (12 çekirdek, 10 paralel, tek fotoğraf + zoompan + libx264):
//   -threads yok  ->  9,7 sn'de 10/10 DÜŞTÜ, onunda da malloc hatası
//   -threads 1    -> 26,4 sn'de 0/10 düştü
// (9,7 sn hızlı değil — o sürede çöküyor.)
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { fileURLToPath } from "node:url";
import { getSettings, videoEnc, encThreads } from "../src/config.js";
import { run } from "../src/util.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const st = getSettings();

// ---------------------------------------------------------------------------
// 1) KODLAYICI ARGÜMANLARI
// ---------------------------------------------------------------------------
{
  const a = videoEnc(st);
  const i = a.indexOf("-threads");
  kontrol("videoEnc iş parçacığı sınırı veriyor", i >= 0,
    "sınırsız bırakılırsa 10 paralel kodlama 120 iş parçacığı açıyor");
  kontrol("iş parçacığı sayısı pozitif tam sayı", i >= 0 && /^[1-9]\d*$/.test(a[i + 1]), a[i + 1]);
  kontrol("sınır libx264'ten sonra geliyor", a.indexOf("libx264") < i);
}
{
  // Toplam iş parçacığı çekirdek sayısını aşmamalı — kusurun tam ölçüsü bu.
  const cekirdek = os.cpus().length;
  const t = +encThreads(st);
  const paralel = Math.max(1, st.concurrency || 1);
  kontrol("toplam iş parçacığı çekirdek sayısını aşmıyor", t * paralel <= cekirdek,
    `${paralel} paralel × ${t} iş parçacığı = ${t * paralel} > ${cekirdek} çekirdek`);
  kontrol("en az 1 iş parçacığı veriliyor", t >= 1, String(t));
  kontrol("tek paralellikte tüm çekirdekler kullanılabiliyor",
    +encThreads({ concurrency: 1 }) === cekirdek, encThreads({ concurrency: 1 }));
  kontrol("saçma concurrency değeri çökertmiyor",
    +encThreads({ concurrency: 0 }) >= 1 && +encThreads({}) >= 1);
}
{
  const src = fs.readFileSync(new URL("../src/config.js", import.meta.url), "utf8");
  kontrol("yanlış 'tek çekirdek kullanıyor' gerekçesi düzeltilmiş",
    !/ffmpeg tek klipte tek çekirdek kullanıyor, paralellik burada kazandırıyor\.\s*\n\s*concurrency/.test(src),
    "bu varsayım kusurun kaynağıydı; kaldırılmadan yorum yanıltıyor");
}

// ---------------------------------------------------------------------------
// 1b) HİÇBİR YERDE TAVANSIZ libx264 KALMAMALI
// ---------------------------------------------------------------------------
// videoEnc()'i düzeltmek YETMEDİ: transitions.js kodlayıcı argümanlarını ELLE
// kuruyordu ve videoEnc'i hiç çağırmıyordu. Kesme aşaması 26/26 geçtikten
// sonra iş "Geçişler: 6/26" satırında ENOMEM (çıkış kodu -12) ile öldü.
// Aynı elle-kurma dört ayrı dosyada daha vardı. Bu kontrol o sınıfı kapatıyor.
{
  // fileURLToPath ŞART: klasör adında boşluk var ("Yeni klasör") ve
  // url.pathname onu %20 olarak veriyor — readdirSync o yolu bulamıyor.
  const kok = fileURLToPath(new URL("../src/", import.meta.url));
  const dosyalar = [];
  const gez = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) gez(p);
      else if (e.name.endsWith(".js")) dosyalar.push(p);
    }
  };
  gez(kok);

  const tavansiz = [];
  for (const f of dosyalar) {
    const satirlar = fs.readFileSync(f, "utf8").split(/\r?\n/);
    satirlar.forEach((l, i) => {
      if (!/"libx264"/.test(l)) return;
      // Aynı argüman dizisinin etrafındaki birkaç satırda tavan aranıyor:
      // diziler çok satıra bölünebiliyor.
      const pencere = satirlar.slice(Math.max(0, i - 2), i + 5).join("\n");
      if (!/"-threads"/.test(pencere) && !/encThreads/.test(pencere)) {
        tavansiz.push(`${path.basename(f)}:${i + 1}`);
      }
    });
  }
  kontrol("kaynakta tavansız libx264 çağrısı kalmadı", tavansiz.length === 0,
    tavansiz.join(", "));
}

// ---------------------------------------------------------------------------
// 2) GERÇEK PARALEL KODLAMA
// ---------------------------------------------------------------------------
// Ayarların kâğıt üstünde doğru olması yetmez: bu makinede o ayarlarla
// gerçekten paralel kodlama yapılabildiği görülmeli.
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kodlayici-"));
const foto = path.join(DIR, "kaynak.jpg");
await run(st.ffmpegPath, ["-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:duration=1:rate=1",
  "-frames:v", "1", "-q:v", "2", foto], { timeoutMs: 120000 });

// DEPO AYARINA GÜVENME. data/settings.json'da concurrency 4 yazıyor ama
// kullanıcının kurulu uygulamasında bu alan HİÇ YOK, yani varsayılan
// (çekirdek − 2 = 10) geçerli. Kusur tam o değerde çıktı. Test yerel ayara
// bakarsa 4 paralel koşup yeşil yanar ve gerçek koşulu hiç denemez.
const VARSAYILAN_PARALEL = Math.max(2, os.cpus().length - 2);
const PARALEL = Math.max(VARSAYILAN_PARALEL, st.concurrency || 2);
const ayar = { ...st, concurrency: PARALEL };
console.log(`     (${PARALEL} paralel × ${encThreads(ayar)} iş parçacığı, ${os.cpus().length} çekirdek)`);
const sonuc = await Promise.all(Array.from({ length: PARALEL }, async (_, i) => {
  const cikti = path.join(DIR, `p${i}.mp4`);
  try {
    // Gerçek kesme render'ının şekli: tek fotoğraf + zoompan + videoEnc.
    await run(st.ffmpegPath, ["-y", "-loop", "1", "-i", foto,
      "-vf", "zoompan=z='min(zoom+0.0015,1.3)':d=120:s=1920x1080:fps=30,format=yuv420p",
      "-frames:v", "120", "-r", "30", ...videoEnc(ayar), "-an", cikti], { timeoutMs: 300000 });
    return fs.existsSync(cikti) && fs.statSync(cikti).size > 1000;
  } catch { return false; }
}));
const basarili = sonuc.filter(Boolean).length;
kontrol(`${PARALEL} paralel kodlamanın hepsi tamamlanıyor`, basarili === PARALEL,
  `${basarili}/${PARALEL} — bellek tükendiyse x264 "malloc failed" veriyor`);

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
