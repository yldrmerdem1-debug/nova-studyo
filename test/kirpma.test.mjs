// Ölü hava kırpma: sesi kısaltırken KELİME ZAMANLARI da doğru kaymalı.
// Kayarsa altyazı ve kinetik yazı konuşmadan kopar — sessiz ve ölçülmesi zor bir hata.
import fs from "node:fs";
import path from "node:path";
import ff from "ffmpeg-static";
import ffp from "ffprobe-static";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { kirpDuraklamalar } from "../src/pipeline/voice.js";

const exec = promisify(execFile);
const D = path.join(process.env.TEMP, "nova-kirpma-test");
fs.rmSync(D, { recursive: true, force: true });
fs.mkdirSync(D, { recursive: true });

let hata = 0;
const kontrol = (ad, kosul, detay = "") => {
  if (kosul) console.log("OK   " + ad);
  else { hata++; console.log("HATA " + ad + (detay ? "  -> " + detay : "")); }
};

/**
 * Sentetik konuşma: ton (ses) ve sessizlik blokları.
 * Yapı: 0,3 sessiz | 1,0 ses | 1,4 sessiz | 1,0 ses | 1,4 sessiz | 1,0 ses | 0,8 sessiz
 * Toplam 6,9 sn — bunun 3,9'u sessizlik (%56).
 */
const BLOK = [
  { ses: false, d: 0.3 }, { ses: true, d: 1.0 },
  { ses: false, d: 1.4 }, { ses: true, d: 1.0 },
  { ses: false, d: 1.4 }, { ses: true, d: 1.0 },
  { ses: false, d: 0.8 },
];
const parcalar = [];
let t = 0;
const sesAnlari = [];
for (const [i, b] of BLOK.entries()) {
  const f = path.join(D, `b${i}.wav`);
  await exec(ff, ["-f", "lavfi", "-i",
    b.ses ? `sine=frequency=220:duration=${b.d}:sample_rate=48000` : `anullsrc=r=48000:cl=mono:d=${b.d}`,
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", "-y", f]);
  parcalar.push(f);
  if (b.ses) sesAnlari.push({ bas: t, son: t + b.d });
  t += b.d;
}
const TOPLAM = t;
const liste = path.join(D, "l.txt");
fs.writeFileSync(liste, parcalar.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
const kaynak = path.join(D, "kaynak.wav");
await exec(ff, ["-f", "concat", "-safe", "0", "-i", liste, "-c", "copy", "-y", kaynak]);

// Her ses bloğunun ortasına bir "kelime" koy
const kelimeler = sesAnlari.map((s, i) => ({
  t: `kelime${i}`, start: +(s.bas + 0.1).toFixed(3), end: +(s.son - 0.1).toFixed(3),
}));

const sure = async (f) => {
  const { stdout } = await exec(ffp.path, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]);
  return parseFloat(stdout.trim());
};

const hedef = path.join(D, "kirpik.wav");
const r = await kirpDuraklamalar(kaynak, hedef, kelimeler, {
  ffmpegPath: ff, ffprobePath: ffp.path, maxDur: 0.5,
});

kontrol("kirpma calisti", !!r);
if (!r) { console.log("\n1 KURAL IHLALI"); process.exit(1); }

const yeniSure = await sure(hedef);
console.log(`\n  kaynak ${TOPLAM.toFixed(2)}sn -> kirpik ${yeniSure.toFixed(2)}sn (${r.sayi} duraklama, ${r.kazanc.toFixed(2)}sn)`);

// 1) Süre gerçekten kısaldı
kontrol("sure kisaldi", yeniSure < TOPLAM - 1, `${TOPLAM.toFixed(2)} -> ${yeniSure.toFixed(2)}`);

// 2) Bildirilen süre gerçek dosyayla uyuşuyor
kontrol("bildirilen sure dosyayla uyusuyor", Math.abs(r.duration - yeniSure) < 0.05,
  `${r.duration.toFixed(2)} vs ${yeniSure.toFixed(2)}`);

// 3) Kelime zamanları KIRPIK dosyada hâlâ ses üstünde mi?
//    Kırpık dosyada ses bloklarını yeniden tespit et, her kelime bir bloğun içinde olmalı.
const { stderr } = await exec(ff, ["-i", hedef, "-af", "silencedetect=noise=-45dB:d=0.2", "-f", "null", "-"])
  .catch((e) => ({ stderr: e.stderr || "" }));
const sessiz = [];
let bas = null;
for (const m of String(stderr).matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
  if (m[1] === "start") bas = parseFloat(m[2]);
  else if (bas !== null) { sessiz.push({ bas, son: parseFloat(m[2]) }); bas = null; }
}
const sessizlikte = r.words.filter((w) => {
  const orta = (w.start + w.end) / 2;
  return sessiz.some((s) => orta > s.bas + 0.05 && orta < s.son - 0.05);
});
kontrol("kelimeler sessizlige dusmedi", sessizlikte.length === 0,
  sessizlikte.map((w) => `${w.t}@${w.start}`).join(", "));

// 4) Kelime zamanları yeni süreyi aşmıyor
kontrol("kelime zamanlari sureyi asmiyor",
  r.words.every((w) => w.end <= yeniSure + 0.15),
  r.words.map((w) => w.end).join(","));

// 5) Sıra ve sayı korunuyor
kontrol("kelime sayisi korundu", r.words.length === kelimeler.length);
kontrol("kelime sirasi artan", r.words.every((w, i) => i === 0 || w.start >= r.words[i - 1].start));

// 6) Sessizlik olmayan seste kırpma YAPMAZ (null döner)
{
  const dolu = path.join(D, "dolu.wav");
  await exec(ff, ["-f", "lavfi", "-i", "sine=frequency=220:duration=3:sample_rate=48000",
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", "-y", dolu]);
  const r2 = await kirpDuraklamalar(dolu, path.join(D, "dolu-k.wav"), [{ t: "a", start: 0.5, end: 1 }], {
    ffmpegPath: ff, ffprobePath: ffp.path, maxDur: 0.5,
  });
  kontrol("bosluksuz seste kirpma yapmiyor", r2 === null, r2 ? "kirpti" : "");
}

console.log("\n  kelime zamanlari:");
for (const [i, w] of r.words.entries()) {
  console.log(`    ${w.t}: ${kelimeler[i].start} -> ${w.start}`);
}

console.log(hata === 0 ? "\nTUM KIRPMA KURALLARI GECTI" : "\n" + hata + " KURAL IHLALI");
process.exit(hata ? 1 : 0);
