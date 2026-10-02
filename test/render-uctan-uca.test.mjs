// renderAll'ı sentetik senaryo/medya/ses ile uçtan uca çalıştırır.
// Amaç: geçiş entegrasyonundan sonra kurgu bozulmuş mu, ses senkronu tutuyor mu.
import fs from "node:fs";
import path from "node:path";
import ff from "ffmpeg-static";
import ffp from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { renderAll } from "../src/pipeline/render.js";
import { saveSettings } from "../src/config.js";

const exec = promisify(execFile);
const DIR = path.join(process.env.TEMP, "nova-render-test");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(DIR, "src"), { recursive: true });

saveSettings({ renderQuality: "hizli", concurrency: 4, cinemaGrade: true });

const SEC = 3, SEG = 3;                       // 3 bölüm × 3 segment = 9 segment
const RENK = ["#8B1A1A", "#1A5C8B", "#2E7D32", "#6A1B9A", "#B8860B", "#00695C", "#5D4037", "#37474F", "#AD1457"];

// --- kaynak görseller ---
for (let i = 0; i < 9; i++) {
  await exec(ff, ["-f", "lavfi", "-i", `color=c=${RENK[i]}:s=1920x1080`,
    "-vf", `drawtext=text='${i}':fontsize=400:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
    "-frames:v", "1", "-y", path.join(DIR, "src", `g${i}.jpg`)]);
}
// bir tane de video kaynağı (video yolu da sınansın)
await exec(ff, ["-f", "lavfi", "-i", "testsrc=size=1920x1080:rate=30", "-t", "6",
  "-c:v", "libx264", "-preset", "ultrafast", "-an", "-y", path.join(DIR, "src", "v.mp4")]);

// --- senaryo ---
const script = { title: "Geçiş Testi Videosu", sections: [] };
for (let s = 0; s < SEC; s++) {
  const segments = [];
  for (let g = 0; g < SEG; g++) {
    const i = s * SEG + g;
    segments.push({
      text: `Bu ${i}. segmentin metnidir ve birkaç saniye sürer.`,
      emphasis: i === 4 ? { type: "number", value: "42", label: "test" } : null,
      visuals: [
        { query: `sorgu ${i} a`, type: "image", kind: "generic" },
        { query: `sorgu ${i} b`, type: "video", kind: "generic" },
      ],
    });
  }
  script.sections.push({ title: `Bölüm ${s + 1}`, segments });
}

// --- ses (sinüs tonu, her segment farklı frekans → senkron gözle/kulakla izlenebilir) ---
const tts = [];
for (let i = 0; i < SEC * SEG; i++) {
  const d = 4.0 + (i % 3) * 1.3;
  const f = path.join(DIR, `a${i}.wav`);
  await exec(ff, ["-f", "lavfi", "-i", `sine=frequency=${300 + i * 90}:duration=${d}`,
    "-ar", "48000", "-ac", "1", "-y", f]);
  tts.push({ segId: `s${i}`, duration: d, words: [], audio: f });
}

// --- medya eşlemesi: her segmentin 2 beat'i ---
const media = {};
for (let i = 0; i < SEC * SEG; i++) {
  media[`s${i}b0`] = { file: path.join(DIR, "src", `g${i}.jpg`), type: "image", provider: "test" };
  media[`s${i}b1`] = i % 3 === 0
    ? { file: path.join(DIR, "src", "v.mp4"), type: "video", provider: "test", duration: 6 }
    : { file: path.join(DIR, "src", `g${(i + 4) % 9}.jpg`), type: "image", provider: "test" };
}

async function sure(f) {
  const { stdout } = await exec(ffp.path, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]);
  return parseFloat(stdout.trim());
}

const killer = { cancelled: false, add() {}, remove() {}, delete() {} };
const kayit = [];
const senaryolar = [
  ["sinematik", "vox"],
  ["sade", "belgesel"],
  ["yok", "vox"],
];

for (const [gecis, tema] of senaryolar) {
  const jobDir = path.join(DIR, `job-${gecis}`);
  fs.mkdirSync(jobDir, { recursive: true });
  const job = {
    id: `test-${gecis}`, theme: tema, language: "tr", subtitleMode: "none",
    visualStyle: "vox", transitions: gecis, mediaKind: "mixed",
  };
  const t0 = Date.now();
  const loglar = [];
  const r = await renderAll(job, script, media, tts, jobDir, (m) => loglar.push(m), () => {}, killer);
  const gercek = await sure(path.join(jobDir, "output.mp4"));
  const sesSure = tts.reduce((a, t) => a + t.duration, 0);
  const hedef = r.durationSec;
  kayit.push({
    gecis, tema,
    hedefSn: +hedef.toFixed(3),
    videoSn: +gercek.toFixed(3),
    sapmaSn: +Math.abs(gercek - hedef).toFixed(3),
    konusmaSn: +sesSure.toFixed(1),
    sureSn: Math.round((Date.now() - t0) / 1000),
    planLog: loglar.find((l) => l.startsWith("Geçiş")) || "-",
  });
  console.log(`${gecis.padEnd(10)} bitti (${Math.round((Date.now() - t0) / 1000)}sn)`);
}

console.log("\n--- SONUC ---");
console.table(kayit);
const hepsiTamam = kayit.every((k) => k.sapmaSn < 0.05);
console.log(hepsiTamam ? "GECTI: tum modlarda sure notr" : "BASARISIZ: sure kaymasi var");
console.log("ciktilar:", DIR);
process.exit(hepsiTamam ? 0 : 1);
