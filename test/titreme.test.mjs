// TİTREME: STOK VİDEONUN KARE HIZI + BÖLÜM ETİKETİNİN DİLİ.
//
// Kullanıcı bitmiş videoda gördü: "yazıların bazıları yanlış yerde beliriyor
// ve titreme efekti var".
//
// KUSUR 1 — TİTREME. Gerçek dosyada (20260811-d6e97f) ölçüldü: çekim içi
// karelerin %13,9'u BİREBİR aynıydı — 31 küme, toplam 18,7 saniye. Hareket
// duruyor, sonra sıçrıyor.
//
// Sebep: Pexels/Pixabay klipleri sık sık 24 veya 25 fps. Düz `fps=30` filtresi
// araya KARE KOPYALIYOR; kopya kare bir öncekinin aynısı oluyor.
//     kaynak 24 fps -> %20,1 donuk kare
//     kaynak 25 fps -> %16,8 donuk kare
//     kaynak 30/60  -> %0,0
//
// YANLIŞ TEŞHİS KAYDI: önce Ken Burns zoompan'ından şüphelenildi ("zoompan
// x/y'yi tam sayıya yuvarlıyor"). Kaynağı önceden büyütmek sentetik yavaş
// zoom'da iyi görünmüştü, ama GERÇEK Ken Burns parametreleriyle ölçünce üç
// varyantta da donuk oran zaten %0,0 çıktı — yani orası kusurun kaynağı
// değildi ve değişiklik geri alındı. Bu paket doğru sebebi kilitliyor.
//
// KUSUR 2 — BÖLÜM ETİKETİ. İngilizce videoda kartta "BÖLÜM 2" yazıyordu;
// metin sabit Türkçeydi, oysa `loc` zaten elde duruyordu.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { spawn } from "node:child_process";
import { getSettings } from "../src/config.js";
import { canvasOf } from "../src/pipeline/canvas.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const st = getSettings();
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-titre-"));
const K = canvasOf({ ratio: "16:9" });
const HEDEF = 30;

function ffmpeg(args, topla = false) {
  return new Promise((res) => {
    const p = spawn(st.ffmpegPath, args);
    const b = [];
    if (topla) p.stdout.on("data", (d) => b.push(d));
    p.on("close", (kod) => res(topla ? Buffer.concat(b) : kod));
  });
}

/**
 * Donuk kare oranı. MUTLAK eşik — gerçek videoda kullanılan ölçütün aynısı,
 * dolayısıyla varyantlar arasında karşılaştırılabilir.
 *
 * (Önce ortalamaya göreli bir eşik denenmişti; ortalaması düşen varyantta eşik
 * de düştüğü için sayılar karşılaştırılamaz hâle geliyordu.)
 */
async function donukOran(vf, girdi) {
  const W = 480, H = 270, boy = W * H;
  const veri = await ffmpeg(["-v", "error", "-i", girdi,
    "-vf", `${vf},scale=${W}:${H},format=gray`, "-r", String(HEDEF), "-f", "rawvideo", "-"], true);
  if (!veri || veri.length < boy * 2) return null;
  const kare = Math.floor(veri.length / boy);
  let d = 0, n = 0;
  for (let i = 1; i < kare; i++) {
    let s = 0;
    const a = i * boy, b = (i - 1) * boy;
    for (let j = 0; j < boy; j++) s += Math.abs(veri[a + j] - veri[b + j]);
    if (s / boy < 0.02) d++;
    n++;
  }
  return d / n;
}

async function kaynakUret(fps) {
  const f = path.join(DIR, `k${fps}.mp4`);
  await ffmpeg(["-y", "-f", "lavfi", "-i", `testsrc2=size=1280x720:duration=4:rate=${fps}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-threads", "1",
    "-pix_fmt", "yuv420p", "-r", String(fps), f]);
  return f;
}

// ---------------------------------------------------------------------------
// 1) KUSUR GERÇEK Mİ — düz fps=30 kare kopyalıyor mu?
// ---------------------------------------------------------------------------
const k25 = await kaynakUret(25);
const k24 = await kaynakUret(24);
const duz25 = await donukOran(`${K.fit},fps=${HEDEF}`, k25);
const duz24 = await donukOran(`${K.fit},fps=${HEDEF}`, k24);
console.log(`     düz fps=30 ile donuk oran: 25fps kaynak %${(duz25 * 100).toFixed(1)}, 24fps kaynak %${(duz24 * 100).toFixed(1)}`);
kontrol("kusur bu makinede yeniden üretilebiliyor", duz25 > 0.1 && duz24 > 0.1,
  "kusur üretilemiyorsa aşağıdaki iyileşme ölçümü anlamsız olur");

// ---------------------------------------------------------------------------
// 2) DÜZELTME ÇALIŞIYOR MU
// ---------------------------------------------------------------------------
const HARMAN = `mpdecimate=max=1,minterpolate=fps=${HEDEF}:mi_mode=blend`;
const yeni25 = await donukOran(`${K.fit},${HARMAN}`, k25);
const yeni24 = await donukOran(`${K.fit},${HARMAN}`, k24);
console.log(`     harmanlama ile:            25fps %${(yeni25 * 100).toFixed(1)}, 24fps %${(yeni24 * 100).toFixed(1)}`);
kontrol("25 fps kaynakta donuk kare kalmıyor", yeni25 < 0.02, `%${(yeni25 * 100).toFixed(1)}`);
kontrol("24 fps kaynakta donuk kare kalmıyor", yeni24 < 0.02, `%${(yeni24 * 100).toFixed(1)}`);

// Hız KORUNMALI: b-roll'de hızlandırma yürüyen insanı aceleci gösterir.
{
  const cikti = path.join(DIR, "hiz.mp4");
  await ffmpeg(["-y", "-i", k25, "-vf", `${K.fit},${HARMAN}`, "-an",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-threads", "1", cikti]);
  let sure = 0;
  await new Promise((res) => {
    const p = spawn(st.ffmpegPath, ["-i", cikti, "-f", "null", "-"]);
    let e = ""; p.stderr.on("data", (d) => (e += d));
    p.on("close", () => {
      const m = e.match(/time=(\d+):(\d+):([\d.]+)/g);
      if (m) { const l = m[m.length - 1].match(/time=(\d+):(\d+):([\d.]+)/); sure = +l[1] * 3600 + +l[2] * 60 + parseFloat(l[3]); }
      res();
    });
  });
  kontrol("klibin süresi (hızı) korunuyor", Math.abs(sure - 4) < 0.3, `${sure.toFixed(2)} sn (kaynak 4 sn)`);
}

// 30 fps kaynak zaten temiz — düzeltme onu bozmamalı.
{
  const k30 = await kaynakUret(30);
  const o = await donukOran(`${K.fit},${HARMAN}`, k30);
  kontrol("30 fps kaynak bozulmuyor", o < 0.02, `%${(o * 100).toFixed(1)}`);
}

// GÖMÜLÜ KOPYA: dosya 30 fps etiketli ama içeriği 24 fps'ten çevrilmiş.
// Gerçek videoda kalan takılmanın kaynağı buydu.
{
  const ham = path.join(DIR, "gomulu.mp4");
  await ffmpeg(["-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:duration=4:rate=24",
    "-vf", "fps=30", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18",
    "-threads", "1", "-pix_fmt", "yuv420p", "-r", "30", ham]);
  const duz = await donukOran(`${K.fit},minterpolate=fps=${HEDEF}:mi_mode=blend`, ham);
  const yeni = await donukOran(`${K.fit},${HARMAN}`, ham);
  console.log(`     gömülü kopya: yalnız harmanlama %${(duz * 100).toFixed(1)} → mpdecimate ile %${(yeni * 100).toFixed(1)}`);
  kontrol("gömülü kopyalar da temizleniyor", yeni < 0.005, `%${(yeni * 100).toFixed(1)}`);
  kontrol("mpdecimate gerçekten fark yaratıyor", duz > yeni,
    "fark yoksa filtreyi eklemenin bedeli boşa gider");
}

// UÇ DURUM: tamamen durgun çekim SİLİNMEMELİ.
//
// Sınırsız mpdecimate bunu yapıyordu: ölçüldü, 5,00 sn'lik durgun klip
// 0,00 sn'ye düşüp sahne videodan tamamen kayboluyordu. max=1 bunu önlüyor.
{
  const durgun = path.join(DIR, "durgun.mp4");
  await ffmpeg(["-y", "-f", "lavfi", "-i", "color=c=0x3355aa:s=1280x720:d=4:r=30",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "20", "-threads", "1",
    "-pix_fmt", "yuv420p", durgun]);
  const cikti = path.join(DIR, "durgun-out.mp4");
  await ffmpeg(["-y", "-i", durgun, "-vf", `${K.fit},${HARMAN}`, "-an",
    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "24", "-threads", "1", cikti]);
  let sure = 0;
  await new Promise((res) => {
    const p = spawn(st.ffmpegPath, ["-i", cikti, "-f", "null", "-"]);
    let e = ""; p.stderr.on("data", (d) => (e += d));
    p.on("close", () => {
      const m = [...e.matchAll(/time=(\d+):(\d+):([\d.]+)/g)].pop();
      if (m) sure = +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]);
      res();
    });
  });
  kontrol("tamamen durgun çekim silinmiyor", sure > 3.5,
    `${sure.toFixed(2)} sn (kaynak 4,00) — sınırsız mpdecimate burada 0,00 veriyordu`);
}

// ---------------------------------------------------------------------------
// 3) RENDER GERÇEKTEN KULLANIYOR MU
// ---------------------------------------------------------------------------
{
  const src = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("fpsUyarla önce kopyaları atıp sonra harmanlıyor",
    /function fpsUyarla[\s\S]{0,1200}mpdecimate=max=1,minterpolate=fps=\$\{fps\}:mi_mode=blend/.test(src),
    "sıra önemli: mpdecimate önce gelmezse gömülü kopyalar gerçek hareket sanılır");
  kontrol("mpdecimate ardışık atma sınırı var",
    /mpdecimate=max=1/.test(src),
    "sınırsız mpdecimate durgun çekimi tamamen siliyor (5,00 sn → 0,00 sn ölçüldü)");
  const duzKalan = [...src.matchAll(/kanvas\.fit\},fps=\$\{fps\}/g)].length;
  kontrol("video yollarında düz fps= kalmadı", duzKalan === 0,
    `${duzKalan} yerde hâlâ kare kopyalayan fps= var`);
  kontrol("her iki video yolu da uyarlanmış",
    [...src.matchAll(/\$\{fpsUyarla\(fps\)\}/g)].length >= 2);
  // Yanlış teşhisin geri alındığı doğrulansın.
  //
  // Ken Burns filtresi artık kamera.js'te kuruluyor (hareket, sıra numarasına
  // değil karenin İÇERİĞİNE göre seçiliyor). Taşındı ama DEĞİŞTİRİLMEDİ:
  // 2× ön büyütme + lanczos yerinde durmalı. Ölçüm hâlâ geçerli — Ken Burns'ün
  // donuk kare oranı zaten %0,0'dı, titreme tpad ve stok klip fps'inden
  // geliyordu. Buradaki kontrolün amacı o yanlış teşhisin geri gelmemesi.
  const kam = fs.readFileSync(new URL("../src/pipeline/kamera.js", import.meta.url), "utf8");
  kontrol("Ken Burns gereksiz yere değiştirilmemiş",
    /s=\$\{kanvas\.w \* 2\}x\$\{kanvas\.h \* 2\}/.test(kam) &&
    /flags=lanczos/.test(kam),
    "ölçüldü: Ken Burns donuk oranı zaten %0,0 — orayı değiştirmek boş maliyet");
  kontrol("render hareketi kamera modülünden alıyor",
    /kameraFiltresi/.test(src));
}

// ---------------------------------------------------------------------------
// 4) BÖLÜM ETİKETİ DİLİ
// ---------------------------------------------------------------------------
{
  const g = fs.readFileSync(new URL("../src/pipeline/graphics.js", import.meta.url), "utf8");
  kontrol("bölüm etiketi videonun diline göre seçiliyor",
    /loc === "tr" \? "BÖLÜM" : "CHAPTER"/.test(g),
    "İngilizce videoda kartta 'BÖLÜM 2' yazıyordu");
  kontrol("sabit Türkçe 'BÖLÜM ' metni kalmadı", !/text='\$\{up\(`BÖLÜM /.test(g));
}

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
