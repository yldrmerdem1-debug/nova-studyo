// Geçiş planı + kare düzeni kenar durum testi (ffmpeg çalıştırmaz, saf matematik).
import { planTransitions, frameLayout, planOzet } from "../src/pipeline/transitions.js";

let tohum = 12345;
const rnd = () => (tohum = (tohum * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function sahteBeats(n, { kisaOran = 0, vurguOran = 0, kartOran = 0, hepsiTekBolum = false } = {}) {
  const b = [];
  let seg = 0, sec = 0;
  for (let i = 0; i < n; i++) {
    if (i % 3 === 0) seg++;
    const yeniBolum = !hepsiTekBolum && i > 0 && i % 12 === 0;
    if (yeniBolum) sec++;
    b.push({
      id: `s${seg}b${i % 3}`,
      segIndex: seg, sectionIndex: sec, firstOfSection: yeniBolum,
      dur: rnd() < kisaOran ? 0.5 + rnd() * 0.9 : 2.2 + rnd() * 4,
      emphasis: rnd() < vurguOran ? { type: "number" } : null,
      media: { type: rnd() < kartOran ? "card" : "image" },
    });
  }
  return b;
}

const senaryolar = [
  ["normal 60", sahteBeats(60), { theme: "vox", intensity: "sinematik" }, 30],
  ["belgesel 130", sahteBeats(130), { theme: "belgesel", intensity: "sinematik" }, 30],
  ["kısa kesmeli", sahteBeats(80, { kisaOran: 0.45 }), { theme: "haber", intensity: "sinematik" }, 30],
  ["vurgu yoğun", sahteBeats(70, { vurguOran: 0.4 }), { theme: "top5", intensity: "sinematik" }, 30],
  ["kart yoğun", sahteBeats(50, { kartOran: 0.35 }), { theme: "analiz", intensity: "sade" }, 30],
  ["hepsi çok kısa", sahteBeats(40, { kisaOran: 1 }), { theme: "hikaye", intensity: "sinematik" }, 30],
  ["geçiş kapalı", sahteBeats(50), { theme: "vox", intensity: "yok" }, 30],
  ["üretilmiş klip", sahteBeats(45), { theme: "vox", intensity: "sinematik", uretilmis: true }, 30],
  ["tek kesme", sahteBeats(1), { theme: "vox" }, 30],
  ["iki kesme", sahteBeats(2), { theme: "vox" }, 30],
  ["tek bölüm", sahteBeats(30, { hepsiTekBolum: true }), { theme: "egitim" }, 30],
  ["60 fps", sahteBeats(50), { theme: "vox", intensity: "sinematik" }, 60],
  ["24 fps", sahteBeats(50), { theme: "hikaye", intensity: "sinematik" }, 24],
  ["200 kesme", sahteBeats(200), { theme: "vox", intensity: "sinematik" }, 30],
];

let hata = 0;
for (const [ad, beats, opts, fps] of senaryolar) {
  const plan = planTransitions(beats, opts);
  const L = frameLayout(beats, plan, fps);
  const n = beats.length;

  const kusur = [];
  // 1) SÜRE NÖTR — parçaların toplamı slot toplamına TAM eşit olmalı
  const parcaTop = L.parca.reduce((a, b) => a + b, 0);
  if (parcaTop !== L.toplamKare) kusur.push(`sure ${parcaTop}!=${L.toplamKare}`);

  // 2) Her parça en az 1 kare
  if (L.parca.some((p) => p < 1)) kusur.push("bos parca");

  // 3) xfade girdi kısıtı: geçiş, iki kaynağından da uzun olamaz
  for (let i = 1; i < n; i++) {
    const g = L.g[i - 1];
    if (!g) continue;
    if (g > L.L[i - 1]) kusur.push(`xfade A yetmez @${i}`);
    if (g > L.parca[i]) kusur.push(`xfade B yetmez @${i}`);
  }

  // 4) Kesme render uzunluğu = parça + çıkan geçiş
  for (let i = 0; i < n; i++) {
    if (L.L[i] !== L.parca[i] + (i < n - 1 ? L.g[i] : 0)) kusur.push(`L tutarsiz @${i}`);
  }

  // 5) Vurgu kesmesine giren geçiş SIFIR olmalı — AMA YALNIZCA BEAT SINIRINDA.
  //
  // Kural eskiden sınır türüne bakmıyordu. Ölçüldü (20260817-b05a7a): vurgusu
  // olan 29 SEGMENT sınırının hepsi sert kesmeye çevrildi ve dört BÖLÜM
  // geçişinin üçü sıradan sert kesme oldu — temanın fadeblack'i videoda sıfır
  // kez göründü. Vuruş beat sınırında korunuyor, büyük sınırlarda katalog
  // geçişi kazanıyor (bkz. transitions.js sinirTuru).
  for (let i = 1; i < n; i++) {
    const beatSiniri = !beats[i].firstOfSection
      && beats[i].sectionIndex === beats[i - 1].sectionIndex
      && beats[i].segIndex === beats[i - 1].segIndex;
    if (beatSiniri && beats[i].emphasis?.type && L.g[i - 1] !== 0) kusur.push(`vurguya gecis @${i}`);
  }

  // 6) Geçiş kapalıysa hiç geçiş olmamalı
  if (opts.intensity === "yok" && L.g.some((x) => x > 0)) kusur.push("kapaliyken gecis var");

  const ok = kusur.length === 0;
  if (!ok) hata++;
  console.log(`${ok ? "OK  " : "HATA"} ${ad.padEnd(15)} ${String(fps).padStart(2)}fps  ${String(n).padStart(3)} kesme  ${planOzet(plan).slice(0, 46)}`);
  if (!ok) console.log(`      kusur: ${[...new Set(kusur)].join(", ")}`);
}

console.log(hata === 0 ? "\nTUM SENARYOLAR GECTI" : `\n${hata} SENARYO BASARISIZ`);
process.exit(hata ? 1 : 0);
