// Gerçek ffmpeg ile geçiş boru hattı testi: süre nötr mü, geçişler üretiliyor mu.
import fs from "node:fs";
import path from "node:path";
import ff from "ffmpeg-static";
import ffp from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { planTransitions, frameLayout, buildPieces, planOzet } from "../src/pipeline/transitions.js";

const exec = promisify(execFile);
const FFPROBE = ffp.path;
const DIR = path.join(process.env.TEMP, "nova-gecis-test");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

async function sure(f) {
  const { stdout } = await exec(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]);
  return parseFloat(stdout.trim());
}

const st = { ffmpegPath: ff, preset: "ultrafast", crf: 28, fps: 30, concurrency: 4 };
const KILLER = { cancelled: false, add() {}, remove() {}, delete() {} };

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { out[k] = { ok: true, value: await fn(items[k], k) }; }
      catch (e) { out[k] = { ok: false, error: e }; }
    }
  }));
  return out;
}

// 3 bölüm, bir kısa kesme, ve BİTİŞİK iki vurgu (6-7) — bu, 6. kesmenin iki
// yanını da sert kesme yapıp "yeniden kodlamadan geç" kısayolunu tetikler.
// Kısayol parçayı BAŞKA klasörden aldığı için concat listesini de sınar.
const RENK = ["red", "green", "blue", "yellow", "magenta", "cyan", "orange", "purple", "white", "gray"];
const beats = [];
for (let i = 0; i < 10; i++) {
  beats.push({
    id: `b${i}`, segIndex: Math.floor(i / 2), sectionIndex: Math.floor(i / 4),
    firstOfSection: i % 4 === 0 && i > 0,
    dur: i === 5 ? 1.2 : 2.0 + (i % 3) * 0.7,
    emphasis: (i === 6 || i === 7) ? { type: "number" } : null,
    media: { type: "image" },
  });
}

const plan = planTransitions(beats, { theme: "vox", intensity: "sinematik" });
const layout = frameLayout(beats, plan, st.fps);
const hedef = layout.toplamKare / st.fps;
console.log("plan       :", planOzet(plan));
console.log("hedef sure :", hedef.toFixed(3), "sn  (" + layout.toplamKare + " kare)");
console.log("parca kare :", layout.parca.join(","), "-> toplam", layout.parca.reduce((a, b) => a + b, 0));

for (let i = 0; i < beats.length; i++) {
  await exec(ff, [
    "-f", "lavfi", "-i", `color=c=${RENK[i]}:s=640x360:r=30`,
    "-vf", `drawtext=text='${i}':fontsize=180:fontcolor=black:x=(w-text_w)/2:y=(h-text_h)/2,setsar=1,format=yuv420p`,
    "-frames:v", String(layout.L[i]), "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28", "-an", "-y",
    path.join(DIR, `c${i}.mp4`),
  ]);
}
const clipFiles = beats.map((_, i) => path.join(DIR, `c${i}.mp4`));

const parcaDir = path.join(DIR, "parca");
const { listFile } = await buildPieces({ st, clipFiles, plan, layout, outDir: parcaDir, killer: KILLER, mapLimit });
const son = path.join(DIR, "son.mp4");
await exec(ff, ["-f", "concat", "-safe", "0", "-i", path.basename(listFile), "-c", "copy", "-y", son], { cwd: parcaDir });

const gercek = await sure(son);
const sapma = Math.abs(gercek - hedef);
// Parça süreleri concat listesinden okunur — kısayol devreye girdiyse bazı
// parçalar render klasöründeki özgün kesme dosyasının kendisidir.
const listeSatir = fs.readFileSync(listFile, "utf8").trim().split("\n")
  .map((l) => l.replace(/^file '|'$/g, ""));
let parcaToplam = 0;
for (const f of listeSatir) parcaToplam += await sure(f);
const kisayol = listeSatir.filter((f) => !f.includes("/parca/")).length;
console.log("kisayol   :", kisayol, "parca yeniden kodlanmadi (bitisik sert kesme)");

console.log("gercek sure:", gercek.toFixed(3), "sn  | sapma:", sapma.toFixed(3), "sn");
console.log("parca top. :", parcaToplam.toFixed(3), "sn");

// Geçişin ortasındaki kareyi çıkar — iki rengin karışımı görünmeli
const gi = plan.findIndex((p) => p.sure > 0);
let t = 0;
for (let i = 0; i <= gi; i++) t += beats[i].dur;
const kare = path.join(DIR, "gecis.png");
await exec(ff, ["-ss", t.toFixed(3), "-i", son, "-frames:v", "1", "-y", kare]);
const kareBoyut = fs.existsSync(kare) ? fs.statSync(kare).size : 0;
console.log(`gecis ani  : t=${t.toFixed(2)}s  ${plan[gi].tip} ${plan[gi].sure.toFixed(2)}s -> kare ${kareBoyut} bayt`);

const gecti = sapma < 0.035 && Math.abs(parcaToplam - hedef) < 0.035 && kareBoyut > 1000;
console.log(gecti ? "\nGECTI: sure notr, gecisler uretildi" : "\nBASARISIZ");
console.log("cikti:", son, "| kare:", kare);
process.exit(gecti ? 0 : 1);
