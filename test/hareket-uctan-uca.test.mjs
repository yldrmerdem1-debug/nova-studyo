// HAREKET MODU uçtan uca: renderAll gerçek senaryo/medya/ses ile çalışır,
// kesikler üretilir, yönetmen planlar, katman motoru render eder, geçişler
// uygulanır. Ses senkronu ve süre nötrlüğü korunmalı.
import fs from "node:fs";
import path from "node:path";
import ff from "ffmpeg-static";
import ffp from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderAll } from "../src/pipeline/render.js";

const exec = promisify(execFile);
const DIR = path.join(process.env.TEMP, "nova-hareket-test");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(DIR, "src"), { recursive: true });

// NOT: saveSettings() ÇAĞIRMA — kullanıcının data/settings.json dosyasını
// kalıcı olarak değiştiriyordu (concurrency ve renderQuality testten sonra
// kayıtlı kalıp yeni varsayılanları gölgeledi). Test kendi st nesnesini kullanır.

const SEG = 6;
const METIN = [
  "Deniz feneri bekçileri aylarca tek başına yaşardı",
  "Görevleri basitti ama bedeli gerçekten çok ağırdı",
  "Her gece aynı ışığı yakmak zorundaydılar sabaha kadar",
  "Kimse onların isimlerini bugün artık hatırlamıyor maalesef",
  "Bugün o kuleler bomboş duruyor kıyı boyunca",
  "Geriye sadece dalgaların sesi ve yalnızlık kaldı",
];
const RENK = ["#8B1A1A", "#1A5C8B", "#2E7D32", "#6A1B9A", "#B8860B", "#00695C",
  "#5D4037", "#37474F", "#AD1457", "#455A64", "#4E342E", "#00838F",
  "#283593", "#33691E", "#BF360C", "#4A148C", "#01579B", "#3E2723"];

// 3 görsel/segment = 18 kaynak
for (let i = 0; i < SEG * 3; i++) {
  await exec(ff, ["-f", "lavfi", "-i", `color=c=${RENK[i % RENK.length]}:s=1400x1400`,
    "-vf", `drawtext=text='${i}':fontsize=420:fontcolor=white@0.55:x=(w-text_w)/2:y=(h-text_h)/2`,
    "-frames:v", "1", "-y", path.join(DIR, "src", `g${i}.jpg`)]);
}

const script = { title: "Hareket Modu Testi", sections: [] };
for (let s = 0; s < 2; s++) {
  const segments = [];
  for (let g = 0; g < 3; g++) {
    const i = s * 3 + g;
    segments.push({
      text: METIN[i],
      emphasis: i === 2 ? { type: "keyword", value: "SABAHA" } : null,
      visuals: [0, 1, 2].map((b) => ({ query: `q${i}-${b}`, type: "image", kind: "generic" })),
    });
  }
  script.sections.push({ title: `Bölüm ${s + 1}`, segments });
}

// Ses + kelime zamanları (TTS'in ürettiği biçim: {t,start,end})
const tts = [];
for (let i = 0; i < SEG; i++) {
  const kelime = METIN[i].split(/\s+/);
  const words = kelime.map((t, j) => ({ t, start: +(0.28 + j * 0.42).toFixed(2), end: +(0.28 + j * 0.42 + 0.36).toFixed(2) }));
  const d = +(words[words.length - 1].end + 0.5).toFixed(2);
  const f = path.join(DIR, `a${i}.wav`);
  await exec(ff, ["-f", "lavfi", "-i", `sine=frequency=${280 + i * 70}:duration=${d}`, "-ar", "48000", "-ac", "1", "-y", f]);
  tts.push({ segId: `s${i}`, duration: d, words, audio: f });
}

const media = {};
for (let i = 0; i < SEG; i++) {
  for (let b = 0; b < 3; b++) {
    media[`s${i}b${b}`] = { file: path.join(DIR, "src", `g${i * 3 + b}.jpg`), type: "image", provider: "test" };
  }
}

async function sure(f) {
  const { stdout } = await exec(ffp.path, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]);
  return parseFloat(stdout.trim());
}

const killer = { cancelled: false, add() {}, remove() {}, delete() {} };
const kayit = [];
for (const oran of ["9:16", "16:9"]) {
  const jobDir = path.join(DIR, `job-${oran.replace(":", "x")}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const job = {
    id: `hrk-${oran}`, theme: "belgesel", language: "tr", subtitleMode: "none",
    visualStyle: "hareket", transitions: "sinematik", mediaKind: "mixed", ratio: oran,
  };
  const loglar = [];
  const t0 = Date.now();
  const r = await renderAll(job, script, media, tts, jobDir, (m) => loglar.push(m), () => {}, killer);
  const cikti = path.join(jobDir, "output.mp4");
  const gercek = await sure(cikti);
  const { stdout: akis } = await exec(ffp.path, ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration", "-of", "csv=p=0", cikti]);
  const satir = akis.trim().split("\n");
  const v = satir.find((l) => l.startsWith("video"))?.split(",") || [];
  const a = satir.find((l) => l.startsWith("audio"))?.split(",") || [];

  kayit.push({
    oran,
    boyut: v[1] + "x" + v[2],
    hedefSn: +r.durationSec.toFixed(2),
    videoSn: +gercek.toFixed(2),
    sapmaSn: +Math.abs(gercek - r.durationSec).toFixed(3),
    avFarkSn: +Math.abs(parseFloat(v[3]) - parseFloat(a[a.length - 1])).toFixed(3),
    sureSn: Math.round((Date.now() - t0) / 1000),
  });
  const plan = loglar.find((l) => l.startsWith("Sahne planı")) || "-";
  const kesik = loglar.find((l) => l.includes("kesik hazırlanıyor")) || "-";
  console.log(`${oran}  ${kesik}`);
  console.log(`${oran}  ${plan}`);

  // kontak sayfası
  const kontak = path.join(DIR, `kontak-${oran.replace(":", "x")}.png`);
  await exec(ff, ["-i", cikti, "-vf", `fps=1.1,scale=${oran === "9:16" ? 150 : 260}:-1,tile=8x2:padding=4:color=0x1a1d24`, "-frames:v", "1", "-y", kontak]);
  console.log(`${oran}  kontak: ${kontak}`);
}

console.log("\n--- SONUC ---");
console.table(kayit);
const gecti = kayit.every((k) => k.sapmaSn < 0.05 && k.avFarkSn < 0.08);
console.log(gecti ? "GECTI: hareket modu iki oranda da uctan uca calisiyor" : "BASARISIZ");
process.exit(gecti ? 0 : 1);
