// SHORTS DOSYASI YÜKLENEBİLİR BOYUTTA OLMALI.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası yangını Short 1): 55,8 sn'lik Short
// 580 MB çıktı — 83 Mbps. Aynı gün Fransa Short'ları 8,6 Mbps'ti. İki dosyanın
// x264 ayarı birebir aynıydı (crf 19, preset medium); fark içerikte: tanık
// videosundaki yangın + film greni. CRF tek başına tavan koymuyor, gürültülü
// görüntüde bitrate sınırsız büyüyor. Yükleme dakikalar sürdü, elle küçültüldü.
//
// DÜZELTME: her Short kodlaması SHORT_VBV taşıyor (-maxrate 16M -bufsize 32M).
// Normal bir Short (~9 Mbps) eskisi gibi kodlanıyor, yalnızca tepeler kırpılıyor.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getSettings } from "../src/config.js";
import { SHORT_VBV } from "../src/pipeline/docu-shorts-pictures.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------------------------------------------------------------------------
// 1) TAVAN DEĞERİ
// ---------------------------------------------------------------------------
const tavan = SHORT_VBV[SHORT_VBV.indexOf("-maxrate") + 1];
const tampon = SHORT_VBV[SHORT_VBV.indexOf("-bufsize") + 1];
const mbps = (v) => parseFloat(v) * (/k$/i.test(v) ? 0.001 : 1);
kontrol("SHORT_VBV -maxrate veriyor", /^\d+(\.\d+)?M$/.test(tavan || ""), String(tavan));
kontrol("SHORT_VBV -bufsize veriyor", /^\d+(\.\d+)?M$/.test(tampon || ""), String(tampon));
kontrol("tavan 1080x1920/30 için makul (8-20 Mbps)", mbps(tavan) >= 8 && mbps(tavan) <= 20, String(tavan));
kontrol("tampon tavanın en az iki katı", mbps(tampon) >= 2 * mbps(tavan), `${tampon} / ${tavan}`);

// ---------------------------------------------------------------------------
// 2) HİÇBİR SHORT KODLAMASI TAVANSIZ KALMAMALI
// ---------------------------------------------------------------------------
// Kusurlu dosyayı son kodlama (prependCoverFrame) yazdı; ama ondan önceki
// teaser render'ı da tavansızdı. Shorts modüllerindeki her libx264 satırı
// tavanı taşımalı — yeni bir kodlama eklenirse bu kontrol onu yakalar.
{
  const kok = fileURLToPath(new URL("../src/pipeline/", import.meta.url));
  const dosyalar = fs.readdirSync(kok).filter((f) => /^docu-shorts.*\.js$/.test(f));
  kontrol("Shorts modülleri bulundu", dosyalar.length >= 2, dosyalar.join(", "));
  const tavansiz = [];
  let sayi = 0;
  for (const f of dosyalar) {
    const satirlar = fs.readFileSync(path.join(kok, f), "utf8").split(/\r?\n/);
    satirlar.forEach((l, i) => {
      if (!/"libx264"/.test(l)) return;
      sayi++;
      const pencere = satirlar.slice(Math.max(0, i - 2), i + 3).join("\n");
      if (!/SHORT_VBV/.test(pencere)) tavansiz.push(`${f}:${i + 1}`);
    });
  }
  kontrol("Shorts'ta libx264 kodlaması var (kontrol boş geçmiyor)", sayi >= 4, String(sayi));
  kontrol("Shorts'ta tavansız libx264 kodlaması kalmadı", tavansiz.length === 0, tavansiz.join(", "));
}

// ---------------------------------------------------------------------------
// 3) GERÇEK ÖLÇÜM: gürültülü dikey görüntü, Short'un kodlama ayarlarıyla
// ---------------------------------------------------------------------------
// Kartal'daki yangın + gren yerine en kötü durum: her karede değişen gürültü.
// Tavansız kodlama tavanı rahatça aşmalı (test anlamlı), tavanlı kodlama
// tavanın altında kalmalı.
const st = getSettings();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shorts-bitrate-"));
const kodla = (cikti, ek) => {
  execFileSync(st.ffmpegPath, ["-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "testsrc2=size=1080x1920:rate=30:duration=3,noise=alls=40:allf=t+u",
    "-c:v", "libx264", "-threads", "4", "-preset", "medium", "-crf", "19", ...ek, "-r", "30", "-an", "-movflags", "+faststart", cikti],
  { stdio: "pipe", timeout: 300000 });
  return (fs.statSync(cikti).size * 8) / 3 / 1e6;
};
try {
  const serbest = kodla(path.join(DIR, "serbest.mp4"), []);
  const tavanli = kodla(path.join(DIR, "tavanli.mp4"), SHORT_VBV);
  console.log(`     (gürültülü 3 sn: tavansız ${serbest.toFixed(1)} Mbps, tavanlı ${tavanli.toFixed(1)} Mbps)`);
  kontrol("tavansız kodlama tavanı aşıyor (test gerçek durumu deniyor)", serbest > mbps(tavan) * 1.5, `${serbest.toFixed(1)} Mbps`);
  // VBV sözü: T saniyede en çok tavan×T + tampon bit (tampon başta dolu). 3 sn'de tampon payı büyük görünür;
  // 55 sn'lik bir Short'ta sınır 16 + 32/55 ≈ 16,6 Mbps.
  const sinir = mbps(tavan) + mbps(tampon) / 3;
  kontrol("tavanlı kodlama VBV sınırının altında", tavanli <= sinir * 1.05, `${tavanli.toFixed(1)} Mbps > ${sinir.toFixed(1)}`);
  kontrol("tavan gürültüyü en az 5 kat kısıyor", serbest / tavanli >= 5, `${(serbest / tavanli).toFixed(1)}x`);
} finally {
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
