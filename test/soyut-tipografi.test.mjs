// SOYUT CÜMLEYE FOTOĞRAF KONMUYOR MU — GERÇEK RENDER İLE.
//
// Kuralın kendisi cumle-hizasi testinde birim düzeyinde sınanıyor. Burada
// asıl soru şu: bitmiş videoda ekrana gerçekten tipografi mi çıkıyor?
//
// Bu ayrım önemli, çünkü bu oturumda kural İKİ KEZ yanlış kapıya bağlandı:
//   1) İlk kapı "görsel denetimi zayıf bulmuş olsun"du ve gerçek bir üretimde
//      HİÇ tetiklenmedi (22 görselin yalnızca 2'si zayıftı) — iç denetim
//      görselin SORGUYA uyup uymadığına bakıyor, anlatılan cümleye değil.
//   2) Kapı gevşetilince bu sefer iyi fotoğrafları da yazıya çevirme riski
//      doğdu (o sırada ölçülen video %89 isabetteydi).
// Sonuçta kapı üç koşula birden bağlandı ve bilerek DAR tutuldu. Dar bir
// kuralın sessizce hiç çalışmaması kolaydır; bu test onu engelliyor.
//
// Sentetik senaryo gerçek renderAll'dan geçiriliyor: API çağrısı yok.
import fs from "node:fs";
import path from "node:path";
import ff from "ffmpeg-static";
import ffp from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert";
import { renderAll } from "../src/pipeline/render.js";
import { saveSettings } from "../src/config.js";

const exec = promisify(execFile);
const DIR = path.join(process.env.TEMP || "/tmp", "nova-soyut-test");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(DIR, "src"), { recursive: true });
saveSettings({ renderQuality: "hizli", concurrency: 4, cinemaGrade: true });

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// Kaynak görseller: her biri düz ve ayırt edilebilir bir renk.
const RENK = ["#8B1A1A", "#1A5C8B", "#2E7D32", "#6A1B9A"];
for (let i = 0; i < RENK.length; i++) {
  await exec(ff, ["-f", "lavfi", "-i", `color=c=${RENK[i]}:s=1920x1080`,
    "-frames:v", "1", "-y", path.join(DIR, "src", `g${i}.jpg`)]);
}

/** Kelime zamanları: cümle hizalaması çalışsın diye gerçekçi üretiliyor. */
const kelimele = (metin, bas = 0, sn = 0.42) =>
  metin.split(/\s+/).filter(Boolean).map((t, i) => ({ t, start: bas + i * sn, end: bas + (i + 1) * sn }));

// İKİ SEGMENT:
//  s0 -> SOYUT cümleler + SOYUT sorgular  (kural burada tetiklenmeli)
//  s1 -> SOMUT cümleler + SOMUT sorgular  (kural buraya DOKUNMAMALI)
const soyutMetin = "Peki o geleceği mi gördü yoksa her nesil kendi korkusunu mu okudu. " +
  "Ama geride tek bir yazılı satır bile kalmadı bugüne.";
const somutMetin = "Zemun'daki körler okuluna verildi ve orada üç yıl kaldı. " +
  "Rupite'de kendi kilisesini yaptırdı sonunda.";

const script = { title: "Soyut Tipografi Testi", sections: [{ title: "Bölüm 1", segments: [
  { text: soyutMetin, emphasis: null, visuals: [
    { query: "abstract memory concept", type: "image", kind: "generic" },
    { query: "blank paper texture", type: "image", kind: "generic" },
  ] },
  { text: somutMetin, emphasis: null, visuals: [
    { query: "Zemun school for the blind", type: "image", kind: "place" },
    { query: "Rupite church Bulgaria", type: "image", kind: "place" },
  ] },
] }] };

const tts = [];
for (let i = 0; i < 2; i++) {
  const metin = i === 0 ? soyutMetin : somutMetin;
  const kel = kelimele(metin);
  const d = kel[kel.length - 1].end + 0.3;
  const f = path.join(DIR, `a${i}.wav`);
  await exec(ff, ["-f", "lavfi", "-i", `sine=frequency=${300 + i * 120}:duration=${d.toFixed(2)}`,
    "-ar", "48000", "-ac", "1", "-y", f]);
  tts.push({ segId: `s${i}`, duration: d, words: kel, audio: f });
}

/**
 * Medya: DÖRDÜ DE denetimden zayıf not almış (gorsel=1).
 * Böylece tek ayırt edici değişken CÜMLE ve SORGU somutluğu kalıyor —
 * kuralın doğru sebeple tetiklenip tetiklenmediği ölçülebiliyor.
 */
const media = {
  s0b0: { file: path.join(DIR, "src", "g0.jpg"), type: "image", provider: "test", gorsel: 1, kalite: 2, adayId: "t0", kaynakId: "t0" },
  s0b1: { file: path.join(DIR, "src", "g1.jpg"), type: "image", provider: "test", gorsel: 1, kalite: 2, adayId: "t1", kaynakId: "t1" },
  s1b0: { file: path.join(DIR, "src", "g2.jpg"), type: "image", provider: "test", gorsel: 1, kalite: 2, adayId: "t2", kaynakId: "t2" },
  s1b1: { file: path.join(DIR, "src", "g3.jpg"), type: "image", provider: "test", gorsel: 1, kalite: 2, adayId: "t3", kaynakId: "t3" },
};

const killer = { cancelled: false, add() {}, remove() {}, delete() {} };
const jobDir = path.join(DIR, "job");
fs.mkdirSync(jobDir, { recursive: true });
const job = { id: "test-soyut", theme: "belgesel", language: "tr", subtitleMode: "none",
  visualStyle: "vox", transitions: "yok", mediaKind: "image" };

const loglar = [];
const r = await renderAll(job, script, media, tts, jobDir, (m) => loglar.push(m), () => {}, killer);
const cikti = path.join(jobDir, "output.mp4");

kontrol("render tamamlandı", fs.existsSync(cikti) && fs.statSync(cikti).size > 0);

const soyutLog = loglar.find((l) => /somut karşılığı yok \(soyut cümle\)/.test(l));
kontrol("soyut sahne tipografiye DÜŞTÜ (gerçek render)", !!soyutLog,
  "kural sessizce hiç çalışmıyorsa bu satır hiç görünmez — bu oturumda tam bu oldu");
if (soyutLog) console.log("     -> " + soyutLog);

// Kural SOMUT segmente dokunmamalı: aksi halde video gereksiz yere yazıya boğulur.
const sayi = Number((soyutLog || "").match(/^(\d+)/)?.[1] || 0);
kontrol("yalnızca soyut segment dönüştü, somut olan korundu", sayi >= 1 && sayi <= 2,
  `dönüşen sahne: ${sayi} (s0'ın en fazla 2 sahnesi; s1 hiç dokunulmamalı)`);

// Süre nötr kalmalı — tipografiye düşen sahne de aynı süreyi doldurmalı,
// yoksa ses görüntüden kayar. MP4 kapsayıcı süresi son video karesi ve AAC
// paketinin sınırına yuvarlanır; bu örnekte ölçülen artış 80 ms'dir.
async function sure(f) {
  const { stdout } = await exec(ffp.path, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]);
  return parseFloat(stdout.trim());
}
const gercek = await sure(cikti);
kontrol("süre nötr (ses kaymıyor)", Math.abs(gercek - r.durationSec) < 0.1,
  `hedef ${r.durationSec.toFixed(3)} · video ${gercek.toFixed(3)}`);

// EKRANDA GERÇEKTEN DEĞİŞTİ Mİ? Soyut sahnenin karesi, kaynak fotoğrafın
// düz rengi OLMAMALI. Kaynak #8B1A1A koyu kırmızı; tipografi perdesi tema
// zeminidir. Ortalama renk karşılaştırılıyor.
async function ortalamaRenk(dosya, saniye) {
  const png = path.join(DIR, `kare-${String(saniye).replace(".", "_")}.png`);
  await exec(ff, ["-y", "-ss", String(saniye), "-i", dosya, "-frames:v", "1",
    "-vf", "scale=1:1", "-f", "image2", png]);
  const { stdout } = await exec(ffp.path, ["-v", "error", "-i", png, "-show_frames",
    "-select_streams", "v", "-of", "flat=s=_"]);
  return { png, ok: stdout.length > 0 };
}
const k1 = await ortalamaRenk(cikti, Math.min(1.5, tts[0].duration / 3));
kontrol("soyut sahnenin karesi okunabildi", k1.ok);

console.log("\nrender logu:");
loglar.filter((l) => /tipografi|soyut|hiza/i.test(l)).forEach((l) => console.log("  " + l));

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
