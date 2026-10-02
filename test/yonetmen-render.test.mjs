// Yönetmen + katman motoru birlikte: ardışık sahneler gerçekten render edilir.
// Amaç, kompozisyonun ekranda nasıl durduğunu GÖRMEK — kural testi geçse de
// sahne çirkin olabilir.
import fs from "node:fs";
import path from "node:path";
import ff from "ffmpeg-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { makeCanvas } from "../src/pipeline/canvas.js";
import { renderScene } from "../src/pipeline/motion.js";
import { planScene, vurguSec } from "../src/pipeline/director.js";

const exec = promisify(execFile);
const DIR = path.join(process.env.TEMP, "nova-yonetmen-test");
fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });

const st = { ffmpegPath: ff, preset: "veryfast", crf: 20, fps: 30 };
const KILLER = { cancelled: false, add() {}, remove() {}, delete() {} };

/** Şeffaf kesik yer tutucusu — r/g/b aynen geçer, sadece alfa hesaplanır. */
async function kesik(ad, renk, sekil, boyut = 520) {
  const f = path.join(DIR, `${ad}.png`);
  const r = boyut / 2;
  const alfa = sekil === "daire"
    ? `if(lte(hypot(X-${r},Y-${r}),${r - 6}),255,0)`
    : sekil === "sekizgen"
      ? `if(lte(abs(X-${r})+abs(Y-${r}),${r * 1.32}),255,0)*if(lt(abs(X-${r}),${r - 6}),1,0)*if(lt(abs(Y-${r}),${r - 6}),1,0)*255/255`
      : `if(lt(abs(X-${r}),${r - 10})*lt(abs(Y-${r}),${r - 10}),255,0)`;
  await exec(ff, ["-f", "lavfi", "-i", `color=c=${renk}:s=${boyut}x${boyut}`,
    "-vf", `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alfa}'`,
    "-frames:v", "1", "-y", f]);
  return f;
}

const A = {
  hero1: await kesik("hero1", "0x2A2A2E", "sekizgen"),
  hero2: await kesik("hero2", "0x3C4048", "daire"),
  d1: await kesik("d1", "0x8A8F98", "daire", 300),
  d2: await kesik("d2", "0xB9BEC6", "kare", 300),
  aksan: await kesik("aksan", "0xE02417", "kare", 220),
};

// Üç ardışık sahne — farklı şablon almalılar
const SAHNELER = [
  { metin: "Deniz feneri bekçileri aylarca tek başına yaşardı", medya: { hero: A.hero1, destek: [A.d1, A.d2], aksan: A.aksan } },
  { metin: "Görevleri basitti ama bedeli ağırdı diyorlar", medya: { hero: A.hero2, destek: [A.d2], aksan: A.aksan } },
  { metin: "Bugün o kuleler bomboş duruyor kıyıda", medya: { hero: A.hero1, destek: [A.d1, A.d2] } },
];

const sonuc = [];
for (const oran of ["9:16", "16:9"]) {
  const K = makeCanvas(oran);
  const parcalar = [];
  let onceki = null;
  const sablonlar = [];

  for (const [i, S] of SAHNELER.entries()) {
    const kelimeler = S.metin.split(/\s+/).map((t, j) => ({ t, start: +(0.3 + j * 0.42).toFixed(2), end: +(0.3 + j * 0.42 + 0.34).toFixed(2) }));
    const sure = +(kelimeler[kelimeler.length - 1].start + 1.7).toFixed(2);
    const N = Math.round(sure * st.fps);
    const vurgu = vurguSec(S.metin, null);

    const plan = planScene({
      kanvas: K, sure, kelimeler, medya: S.medya, vurgu,
      anahtar: `sahne${i}`, oncekiSablon: onceki,
      arkaplan: { tur: "renk", renk: "0xE8DCC8" },
    });
    onceki = plan.sablon;
    sablonlar.push(plan.sablon);

    const out = path.join(DIR, `${oran.replace(":", "x")}-s${i}.mp4`);
    await renderScene({ st, kanvas: K, arkaplan: plan.arkaplan, katmanlar: plan.katmanlar, frames: N, outFile: out, killer: KILLER });
    parcalar.push(out);
    console.log(`  ${oran} sahne${i}  sablon=${plan.sablon.padEnd(12)} vurgu=${vurgu}  ${sure}sn  ${plan.katmanlar.length} katman`);
  }

  // birleştir + kontak sayfası
  const liste = path.join(DIR, `l-${oran.replace(":", "x")}.txt`);
  fs.writeFileSync(liste, parcalar.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
  const tam = path.join(DIR, `tam-${oran.replace(":", "x")}.mp4`);
  await exec(ff, ["-f", "concat", "-safe", "0", "-i", liste, "-c", "copy", "-y", tam]);

  const kontak = path.join(DIR, `kontak-${oran.replace(":", "x")}.png`);
  await exec(ff, ["-i", tam, "-vf", `fps=1.6,scale=${K.dikey ? 160 : 280}:-1,tile=8x2:padding=4:color=0x1a1d24`, "-frames:v", "1", "-y", kontak]);

  const benzersiz = new Set(sablonlar).size;
  sonuc.push({ oran, sablonlar: sablonlar.join(","), benzersiz, kontak });
  console.log(`OK   ${oran}  ${benzersiz}/${sablonlar.length} farkli sablon`);
}

const gecti = sonuc.every((r) => r.benzersiz === SAHNELER.length);
console.log(gecti ? "\nGECTI: ardisik sahneler farkli kompozisyon aldi" : "\nUYARI: sablon cesitliligi yetersiz");
for (const r of sonuc) console.log("  kontak:", r.kontak);
process.exit(gecti ? 0 : 1);
