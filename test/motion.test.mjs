// Katman motoru testi: çok katmanlı kompozit + kinetik tipografi, iki oranda.
// Şeffaf PNG kesikler yerel olarak üretilir (anahtar/ağ gerekmez).
import fs from "node:fs";
import path from "node:path";
import ff from "ffmpeg-static";
import ffp from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { makeCanvas } from "../src/pipeline/canvas.js";
import { renderScene } from "../src/pipeline/motion.js";

const exec = promisify(execFile);
const DIR = path.join(process.env.TEMP, "nova-motion-test");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const st = { ffmpegPath: ff, preset: "veryfast", crf: 20, fps: 30 };
const KILLER = { cancelled: false, add() {}, remove() {}, delete() {} };

async function sure(f) {
  const { stdout } = await exec(ffp.path, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]);
  return parseFloat(stdout.trim());
}

/**
 * Şeffaf arka planlı renkli daire/kare — kesik görsel yerine geçer.
 * geq'te r/g/b AYNEN geçirilir; sadece alfa hesaplanır. (lum= yazmak RGB
 * düzlemlerini eziyor ve her şey turuncu çıkıyordu.)
 */
async function kesik(ad, renk, sekil = "daire", boyut = 400) {
  const f = path.join(DIR, `${ad}.png`);
  const r = boyut / 2;
  const alfa = sekil === "daire"
    ? `if(lte(hypot(X-${r},Y-${r}),${r - 4}),255,0)`
    : `if(lt(abs(X-${r}),${r - 20})*lt(abs(Y-${r}),${r - 20}),255,0)`;
  await exec(ff, ["-f", "lavfi", "-i", `color=c=${renk}:s=${boyut}x${boyut}`,
    "-vf", `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alfa}'`,
    "-frames:v", "1", "-y", f]);
  return f;
}

const p1 = await kesik("p1", "0x2A2A2E", "daire", 420);
const p2 = await kesik("p2", "0xE02417", "kare", 300);
const p3 = await kesik("p3", "0x8A8F98", "daire", 260);

// Konuşma: "beyin sahada da / KAZANIR" — kelime zamanları TTS'ten gelir gibi
const kelimeler = [
  { s: "beyin", t0: 0.35 }, { s: "sahada", t0: 0.95 }, { s: "da", t0: 1.5 },
];

const sonuc = [];
for (const oran of ["9:16", "16:9"]) {
  const K = makeCanvas(oran);
  const SANIYE = 4.0;
  const N = Math.round(SANIYE * st.fps);
  const out = path.join(DIR, `sahne-${oran.replace(":", "x")}.mp4`);

  await renderScene({
    st, kanvas: K,
    arkaplan: { tur: "renk", renk: "0xE8DCC8" },
    katmanlar: [
      { tur: "gorsel", src: p1, x: 0.5, y: 0.34, en: 0.52, bas: 0.15, sure: 3.4, giris: "buyu" },
      { tur: "gorsel", src: p2, x: 0.78, y: 0.18, en: 0.20, bas: 0.55, sure: 3.0, giris: "sagdan" },
      { tur: "gorsel", src: p3, x: 0.20, y: 0.50, en: 0.16, bas: 0.85, sure: 2.7, giris: "soldan", cikis: "sola" },
      {
        tur: "yazi", kelimeler, x: 0.08, y: 0.62, boy: 46,
        vurgu: "KAZANIR", vurguT0: 1.95, vurguBoy: 132, vurguRenk: "0xE02417",
        bitis: SANIYE - 0.1,
      },
    ],
    frames: N, outFile: out, killer: KILLER,
  });

  const d = await sure(out);
  const kareler = path.join(DIR, `serit-${oran.replace(":", "x")}.png`);
  await exec(ff, ["-i", out, "-vf", `fps=3,scale=${K.dikey ? 150 : 260}:-1,tile=6x2:padding=4:color=white`, "-frames:v", "1", "-y", kareler]);
  sonuc.push({ oran, boyut: K.size, sureSn: +d.toFixed(2), hedefSn: +(N / st.fps).toFixed(2), serit: kareler });
  console.log(`OK   ${oran}  ${K.size}  ${d.toFixed(2)}sn`);
}

const gecti = sonuc.every((r) => Math.abs(r.sureSn - r.hedefSn) < 0.05);
console.log(gecti ? "\nGECTI: iki oranda da katmanli sahne uretildi" : "\nBASARISIZ");
for (const r of sonuc) console.log("  serit:", r.serit);
process.exit(gecti ? 0 : 1);
