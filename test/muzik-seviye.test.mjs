// DIŞARIDAN ATILAN YATAK PARÇASI KARIŞIMI BOZMAMALI.
//
// Ölçülen gerçek: kurulumla gelen dört yatak -28,8 ile -30,5 LUFS arasında.
// YouTube Audio Library / Pixabay parçaları tipik olarak -14 ile -18 LUFS,
// yani 12-16 dB gürültülü. Kullanıcı music/ klasörüne böyle bir dosya atarsa
// müzik anlatımın üstüne çıkıyor.
//
// Bu paket iki yatak üretiyor — biri 17 dB gürültülü — ve zincirden geçirip
// çıktının iki bölümündeki gücü GERÇEKTEN ölçüyor. Düzeltme öncesi fark
// duruyor mu, sonrası kapanıyor mu: ikisi de ölçülüyor.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { getSettings } from "../src/config.js";
import { run } from "../src/util.js";
import { muzikZinciri } from "../src/pipeline/muzik.js";
import {
  kazancHesapla, guctuOl, kazanclariHesapla,
  HEDEF_LUFS, EN_AZ_KAZANC, EN_COK_KAZANC,
} from "../src/pipeline/muzikseviye.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const st = getSettings();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seviye-"));

// ---------------------------------------------------------------------------
// 1) KAZANÇ HESABI
// ---------------------------------------------------------------------------
kontrol("hedefteki parçaya dokunulmuyor", kazancHesapla(HEDEF_LUFS) === 0);
// KONTROLLER HEDEFE GÖRELİ — sabit sayı yazılmıyor.
//
// HEDEF_LUFS bir kez -30'dan -24'e taşındı (ölçüldü: müzik duraklamalarda
// anlatımın 19-34 dB altında kalıyor, telefonda hiç duyulmuyordu) ve buradaki
// sabit sayılar o taşımada kırıldı. Kontrolün niyeti hedefin DEĞERİ değil,
// kazancın hedefe göre doğru hesaplanması.
const beklenen = (lufs) =>
  Math.round(Math.min(EN_COK_KAZANC, Math.max(EN_AZ_KAZANC, HEDEF_LUFS - lufs)) * 10) / 10;
kontrol("gürültülü parça kısılıyor",
  kazancHesapla(HEDEF_LUFS + 8) === beklenen(HEDEF_LUFS + 8) && kazancHesapla(HEDEF_LUFS + 8) < 0);
kontrol("kısık parça yükseltiliyor",
  kazancHesapla(HEDEF_LUFS - 6) === beklenen(HEDEF_LUFS - 6) && kazancHesapla(HEDEF_LUFS - 6) > 0);
kontrol("aşırı kısık parça tavanla sınırlanıyor", kazancHesapla(-60) === EN_COK_KAZANC);
kontrol("aşırı gürültülü parça tabanla sınırlanıyor",
  kazancHesapla(HEDEF_LUFS + Math.abs(EN_AZ_KAZANC) + 5) === EN_AZ_KAZANC);
kontrol("ölçüm yoksa kazanç uygulanmıyor", kazancHesapla(null) === 0 && kazancHesapla(NaN) === 0);
kontrol("neredeyse sessiz dosya yükseltilmiyor", kazancHesapla(-85) === 0,
  "bozuk/sessiz dosyayı 12 dB yükseltmek gürültüyü öne çıkarırdı");

// ---------------------------------------------------------------------------
// 2) GERÇEK ÖLÇÜM
// ---------------------------------------------------------------------------
const SES = 440;
const BLOK = 20;
// Gerçek dünyadaki iki uç: A = indirilmiş kütüphane parçası (-16 LUFS),
// B = kurulumla gelen yatak (-30 LUFS). Ölçülen fark 14 dB.
//
// Seviyeler SABİT dB ile değil, önce taban ölçülüp ona göre üretiliyor:
// ffmpeg sürümleri arasında sine filtresinin gücü değişebiliyor ve testin
// varsayımı sessizce kayarsa ölçüm anlamsızlaşır.
const HEDEF_A = -16, HEDEF_B = -30;
const taban = path.join(DIR, "taban.wav");
await run(st.ffmpegPath, ["-y", "-f", "lavfi",
  "-i", `sine=frequency=${SES}:duration=8:sample_rate=48000`,
  "-c:a", "pcm_s16le", taban], { timeoutMs: 120000 });
const tabanLufs = await guctuOl(st.ffmpegPath, taban);
kontrol("taban sinüsün gücü ölçülebiliyor", Number.isFinite(tabanLufs), String(tabanLufs));

const A = path.join(DIR, "gurultulu.wav");
const B = path.join(DIR, "kisik.wav");
for (const [dosya, hedef] of [[A, HEDEF_A], [B, HEDEF_B]]) {
  await run(st.ffmpegPath, ["-y", "-i", taban,
    "-af", `volume=${(hedef - tabanLufs).toFixed(2)}dB`, "-c:a", "pcm_s16le", dosya],
    { timeoutMs: 120000 });
}

const la = await guctuOl(st.ffmpegPath, A);
const lb = await guctuOl(st.ffmpegPath, B);
kontrol("ebur128 ile güç ölçülebiliyor", la !== null && lb !== null, `${la} / ${lb}`);
kontrol("kütüphane parçası hedeflenen -16 LUFS'a üretildi", Math.abs(la - HEDEF_A) < 1, `${la} LUFS`);
kontrol("kurulum yatağı hedeflenen -30 LUFS'a üretildi", Math.abs(lb - HEDEF_B) < 1, `${lb} LUFS`);
kontrol("iki yatak arasında gerçek bir seviye farkı var", la - lb > 12,
  `fark ${(la - lb).toFixed(1)} dB`);

const kazanclar = await kazanclariHesapla(st.ffmpegPath, [A, B]);
// İkisi de HEDEFE göre değerlendirilir: A hedeften gürültülü, B hedeften kısık.
// (B eskiden tam hedefteydi çünkü hedef -30'du; hedef taşınınca sabit beklenti
//  kırıldı. Kontrol artık yönü ve büyüklüğü sınıyor, sabit sayıyı değil.)
kontrol("gürültülü yatağa kısma uygulanıyor",
  kazanclar[A] < 0 && Math.abs(kazanclar[A] - (HEDEF_LUFS - la)) < 1.5, `${kazanclar[A]} dB`);
kontrol("kısık yatağa yükseltme uygulanıyor",
  kazanclar[B] > 0 && Math.abs(kazanclar[B] - (HEDEF_LUFS - lb)) < 1.5, `${kazanclar[B]} dB`);
kontrol("iki yatak arasındaki fark kazançla kapanıyor",
  Math.abs((la + kazanclar[A]) - (lb + kazanclar[B])) < 1.5,
  `${(la + kazanclar[A]).toFixed(1)} vs ${(lb + kazanclar[B]).toFixed(1)} LUFS`);

// Önbellek: ikinci çağrıda yeniden ölçüm yapılmamalı.
{
  let satir = 0;
  await kazanclariHesapla(st.ffmpegPath, [A, B], { logFn: (s) => { if (/ölçüldü/.test(s)) satir++; } });
  kontrol("ölçüm önbelleğe alınıyor (ikinci videoda tekrar ölçmüyor)", satir === 0);
}

// ---------------------------------------------------------------------------
// 3) UÇTAN UCA: karışımda iki bölüm aynı güçte mi?
// ---------------------------------------------------------------------------
const anlatim = path.join(DIR, "narration.wav");
await run(st.ffmpegPath, ["-y", "-f", "lavfi",
  "-i", `anullsrc=r=48000:cl=mono:d=${BLOK * 2}`, "-c:a", "pcm_s16le", anlatim],
  { timeoutMs: 120000 });

/** Zinciri kur, çalıştır, iki blok ortasındaki ortalama gücü döndür. */
async function farkOlc(kazancli, dosya) {
  const bloklar = [
    { dosya: A, sure: BLOK, kazanc: kazancli ? kazanclar[A] : 0 },
    { dosya: B, sure: BLOK, kazanc: kazancli ? kazanclar[B] : 0 },
  ];
  const mz = muzikZinciri(bloklar, { narration: anlatim, musicVolume: 1.0, toplamSure: BLOK * 2 });
  const zincir =
    `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2[ses][yan];` +
    `${mz.muzikZinciri};` +
    `[mus][yan]sidechaincompress=threshold=0.02:ratio=10:attack=120:release=500[duck];` +
    `[ses][duck]amix=inputs=2:duration=first:normalize=0`;
  await run(st.ffmpegPath, ["-y", ...mz.girdiler, "-filter_complex", zincir,
    "-c:a", "pcm_s16le", dosya], { timeoutMs: 300000 });

  const guc = async (t) => {
    let db = -99;
    await run(st.ffmpegPath, ["-ss", String(t), "-t", "2", "-i", dosya,
      "-af", "volumedetect", "-f", "null", "-"], { timeoutMs: 120000,
      onLine: (s) => { const m = String(s).match(/mean_volume:\s*(-?[\d.]+) dB/); if (m) db = parseFloat(m[1]); } });
    return db;
  };
  return { a: await guc(9), b: await guc(BLOK + 9) };
}

const duzeltmesiz = await farkOlc(false, path.join(DIR, "ham.wav"));
const duzeltmeli = await farkOlc(true, path.join(DIR, "duzeltilmis.wav"));
const farkOnce = Math.abs(duzeltmesiz.a - duzeltmesiz.b);
const farkSonra = Math.abs(duzeltmeli.a - duzeltmeli.b);

console.log(`     düzeltmesiz: blok1 ${duzeltmesiz.a.toFixed(1)} dB, blok2 ${duzeltmesiz.b.toFixed(1)} dB  (fark ${farkOnce.toFixed(1)})`);
console.log(`     düzeltmeli : blok1 ${duzeltmeli.a.toFixed(1)} dB, blok2 ${duzeltmeli.b.toFixed(1)} dB  (fark ${farkSonra.toFixed(1)})`);

kontrol("düzeltmesiz karışımda seviye farkı gerçekten duyuluyor", farkOnce > 12,
  `${farkOnce.toFixed(1)} dB`);
kontrol("düzeltmeli karışımda iki bölüm aynı güçte", farkSonra < 3,
  `${farkSonra.toFixed(1)} dB`);
kontrol("düzeltme farkı en az 10 dB kapatıyor", farkOnce - farkSonra > 10,
  `${(farkOnce - farkSonra).toFixed(1)} dB kapandı`);

// ---------------------------------------------------------------------------
// 4) BAĞLANTI
// ---------------------------------------------------------------------------
{
  const rd = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("render seviye düzeltmesini çağırıyor", rd.includes("kazanclariHesapla(st.ffmpegPath, yollar"));
  const mz = fs.readFileSync(new URL("../src/pipeline/muzik.js", import.meta.url), "utf8");
  // Kazanç artık aşama kazancıyla toplanıp bir ondalığa yuvarlanıyor
  // (bkz. muzik.js ASAMA_KAZANC) — kontrol biçimi değil, VARLIĞINI arıyor.
  kontrol("kazanç zincire volume=XdB olarak giriyor", /volume=\$\{kz[^}]*\}dB/.test(mz));
  const stageChain=muzikZinciri([{dosya:'a.wav',sure:30,asama:2,kazanc:0}],{narration:'n.wav',musicVolume:.16,toplamSure:30}).muzikZinciri;
  kontrol("aşama kazancı zincire giriyor", stageChain.includes('volume=2.5dB'),
    "video baştan sona tek düzlemde kalıyordu (LRA 2,2 LU, beş bölüm de aynı)");
}
kontrol("kazanç 0 ise filtre hiç eklenmiyor",
  !muzikZinciri([{ dosya: "a.wav", sure: 10, kazanc: 0 }],
    { narration: "n.wav", musicVolume: 0.16, toplamSure: 10 }).muzikZinciri.includes("dB,"));

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
