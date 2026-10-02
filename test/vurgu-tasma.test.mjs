// VURGU YAZISI KADRAJ DIŞINA TAŞMAMALI.
//
// Ölçüldü (1920×1080, x=%5,5, sabit 132 punto): 26 karaktere kadar temiz,
// 28 karakterde sağ kenardan taşıyor. Punto artık uzunluğa göre küçülüyor.
// Bu test gerçekten RENDER edip sağ kenar sütununda mürekkep arar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ff from "ffmpeg-static";
import { renderScene } from "../src/pipeline/motion.js";
import { makeCanvas } from "../src/pipeline/canvas.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const D = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vt-"));
const st = { ffmpegPath: ff, preset: "veryfast", crf: 24, fps: 30 };
const K = { cancelled: false, add() {}, remove() {}, delete() {} };

const denemeler = [
  ["kisa", "9,000 m"],
  ["orta", "52 years later"],
  ["uzun", "the deepest place on Earth"],
  ["tavan", "abcdefghijklmnopqrstuvwxyz78"],   // ftext tavani = 28 karakter
];

for (const oran of ["16:9", "9:16"]) {
  const kanvas = makeCanvas(oran);
  for (const [ad, vurgu] of denemeler) {
    const out = path.join(D, `${oran.replace(":", "x")}-${ad}.mp4`);
    await renderScene({
      st, kanvas,
      arkaplan: { tur: "renk", renk: "0x101418" },
      katmanlar: [{
        tur: "yazi", kelimeler: [], x: 0.055, y: 0.735, vurgu, vurguT0: 0.3, bitis: 2.0,
        renk: "0xF4F7FA", vurguRenk: "0xFFD23F", konturRenk: "0x0A0C10",
      }],
      frames: 60, outFile: out, killer: K,
    });
    const png = out.replace(".mp4", ".png");
    execFileSync(ff, ["-v", "error", "-ss", "1.0", "-i", out, "-frames:v", "1", "-y", png]);

    // Sag kenarin son %2'sinde murekkep var mi? (yaziyla ayni sari ton)
    const rapor = `_vt-${oran.replace(":", "x")}-${ad}.txt`;
    execFileSync(ff, ["-v", "error", "-i", png,
      "-vf", "crop=iw*0.02:ih:iw*0.98:0,format=gray,signalstats,metadata=print:file=" + rapor,
      "-f", "null", "-"]);
    const s = fs.readFileSync(rapor, "utf8");
    const ymax = +(s.match(/YMAX=([\d.]+)/) || [])[1];
    fs.rmSync(rapor, { force: true });
    kontrol(`${oran} "${vurgu.slice(0, 26)}" kadraj icinde`, ymax < 60, `sag kenar YMAX=${ymax}`);
  }
}

fs.rmSync(D, { recursive: true, force: true });
console.log(hata === 0 ? "\nVURGU TASMA TESTLERI GECTI" : "\n" + hata + " TASMA");
process.exit(hata ? 1 : 0);
