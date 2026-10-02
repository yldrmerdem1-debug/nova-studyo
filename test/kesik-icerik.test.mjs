// KESIK ICERIK DENETIMI — gercek videoda gorulen iki artefaktin testi:
//   BOMBOS KREM KARE: sabit -ss 1.0 kisa klipte kare bulamiyordu, ekrana
//     yalnizca sticker cikiyordu. Kaydirma artik sureye gore seciliyor.
//   SIMSIYAH KARE: karanlik fotograf kosede hicbir sey anlatmiyor, eleniyor.
// Olculdu: saglam kesikte parlaklik yayilimi ~197, bozukta 0.
//   kisa video  -> ARTIK BOS DEGIL (kaydirma sureye gore secildi) => KALMALI
//   kara foto   -> icerik denetimi eler                            => ELENMELI
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import ff from "ffmpeg-static";
import { kesikleriHazirla } from "../src/pipeline/cutout.js";
import { makeCanvas } from "../src/pipeline/canvas.js";
import { mapLimit } from "../src/util.js";

const D = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kd-"));
const mk = (ad, sn) => {
  const f = path.join(D, ad);
  execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", `testsrc=size=640x360:rate=25:duration=${sn}`, "-y", f]);
  return f;
};
const kara = path.join(D, "kara.jpg");
execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "color=c=0x060608:s=800x600", "-frames:v", "1", "-y", kara]);
const foto = path.join(D, "foto.jpg");
execFileSync(ff, ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=800x600", "-frames:v", "1", "-y", foto]);

const girdiler = [
  { id: "kisa-video", src: mk("kisa.mp4", 0.8), tur: "video", rol: "destek", bek: "KALMALI" },
  { id: "uzun-video", src: mk("uzun.mp4", 4.0), tur: "video", rol: "destek", bek: "KALMALI" },
  { id: "kara-foto", src: kara, tur: "image", rol: "destek", bek: "ELENMELI" },
  { id: "iyi-foto", src: foto, tur: "image", rol: "destek", bek: "KALMALI" },
];

const out = await kesikleriHazirla(girdiler, path.join(D, "kesik"), {
  kanvas: makeCanvas("16:9"), mapLimit, logFn: (m) => console.log("  " + m),
});

// Kalanlarin GERCEKTEN icerigi var mi? Merkez parlaklik yayilimi olculur.
function yayilim(f) {
  const t = "_yy.txt";
  execFileSync(ff, ["-v", "error", "-i", f,
    "-vf", "crop=iw*0.55:ih*0.55,format=gray,signalstats,metadata=print:file=" + t, "-f", "null", "-"]);
  const s = fs.readFileSync(t, "utf8");
  const g = (k) => { const m = s.match(new RegExp("lavfi\\.signalstats\\." + k + "=([\\d.]+)")); return m ? +m[1] : NaN; };
  fs.rmSync(t, { force: true });
  return g("YMAX") - g("YMIN");
}

let hata = 0;
console.log("\n=== SONUC ===");
for (const g of girdiler) {
  const v = out[g.id];
  const dogru = (g.bek === "ELENMELI") === !v;
  const yy = v ? yayilim(v) : 0;
  if (!dogru || (v && yy < 25)) hata++;
  console.log(`  ${dogru && (!v || yy >= 25) ? "OK  " : "HATA"} ${g.id.padEnd(12)} ${(v ? "kaldi" : "elendi").padEnd(7)} yayilim=${yy}  (beklenen: ${g.bek})`);
}
fs.rmSync(D, { recursive: true, force: true });
console.log(hata === 0 ? "\nDUZELTME CALISIYOR" : `\n${hata} HATA`);
process.exit(hata ? 1 : 0);
