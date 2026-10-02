// MÜZİK KISMA — TİTREME (POMPALAMA) OLMADAN NEFES KABARMASI.
//
// KULLANICI ŞİKÂYETİ: "arkada bazen titreme sesi var".
// Kurgudaki adı POMPALAMA: yan zincirli sıkıştırıcı hecelerin arasındaki
// mikro boşlukları takip edip müziği sürekli indirip kaldırıyor; kulak bunu
// dalgalanma olarak duyuyor.
//
// BU TEST BİR ÖLÇÜM HATASINDAN DOĞDU. İlk denemede yalnızca TEK eksen
// ölçüldü — "uzun boşlukta müzik ne kadar geri geliyor" — ve en sert ayar
// (ratio 10) "en iyi" ilan edildi. Oysa şikâyetin sebebi tam da oydu: sert
// sıkıştırma boşlukta en büyük kabarmayı verir ÇÜNKÜ konuşma sırasında en
// çok bastırır, yani en çok pompalar.
//
// İKİ EKSEN BİRBİRİNE ZIT ve ikisi birden ölçülmeden karar verilemez:
//   1) POMPALAMA — sürekli konuşma boyunca müzik seviyesi SABİT kalmalı
//   2) NEFES KABARMASI — bölüm sonu boşluğunda müzik geri GELMELİ
//
// Sentetik konuşmayla ölçüldü (0,25 sn hece + 0,12 sn boşluk):
//
//   ayar                        pompalama   salınım   nefes kabarması
//   0.02/10/120/500 (eski)       0,88 dB     3,4 dB       +5,9 dB
//   0.02/6/150/900  (seçilen)    0,53 dB     2,3 dB       +5,6 dB
//   0.02/4/200/1200              0,39 dB     1,8 dB       +4,4 dB
//   0.03/3/200/1000              0,35 dB     1,6 dB       +2,4 dB
//
// Seçilen ayar titremeyi %40 azaltırken kabarmayı koruyor. Daha yumuşak
// ayarlar titremeyi biraz daha düşürüyor ama kabarmayı öldürüyor — o kabarma
// bölüm geçişini kasıtlı hissettiren şey.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert";
import { DUCK } from "../src/pipeline/render.js";
import { getSettings } from "../src/config.js";
import { run } from "../src/util.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const ESKI = "threshold=0.02:ratio=10:attack=120:release=500";

// --- kaynak biçimi kontrolü (ağ/ffmpeg olmadan da çalışır) ---
kontrol("ducking ayarı tek yerde tanımlı", typeof DUCK === "string" && DUCK.length > 10);
kontrol("eski sert ayar kullanılmıyor", DUCK !== ESKI,
  "ratio 10 titremenin kaynağıydı");
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("render zinciri sabiti kullanıyor", /sidechaincompress=\$\{DUCK\}/.test(r));
  kontrol("kodda çıplak sidechain parametresi kalmadı",
    !/sidechaincompress=threshold=/.test(r.replace(/^\s*\/\/.*$/gm, "")),
    "ayar iki yere yazılırsa biri sessizce eskide kalır");
  kontrol("ölçüm tablosu kaynakta duruyor", /pompalama\s+salınım\s+nefes kabarması/.test(r),
    "neden bu değerler seçildi yazılmazsa bir sonraki tahminle değişir");
}
const oran = DUCK.match(/ratio=([\d.]+)/);
kontrol("ratio ölçülü", oran && parseFloat(oran[1]) <= 6, oran?.[1]);
const rel = DUCK.match(/release=(\d+)/);
kontrol("release uzun (heceleri takip etmesin)", rel && parseInt(rel[1]) >= 700, rel?.[1]);

// ---------------------------------------------------------------------------
// GERÇEK ÖLÇÜM — ffmpeg varsa
// ---------------------------------------------------------------------------
const st = getSettings();
const D = path.join(os.tmpdir(), "nova-pompalama-test");
fs.rmSync(D, { recursive: true, force: true });
fs.mkdirSync(D, { recursive: true });

let ffmpegVar = true;
const ses = path.join(D, "ses.wav");
const muz = path.join(D, "muzik.wav");
// ANLATIM: hece benzeri 0,25 sn ses + 0,12 sn boşluk (sürekli konuşma),
// sonra 0,70 sn TAM sessizlik (bölüm sonu nefesi), sonra yine konuşma.
const HECE = 12, SONRA = 5;
try {
  const g = [];
  let n = 0;
  for (let i = 0; i < HECE; i++) {
    g.push("-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.28:d=0.25");
    g.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.12"); n += 2;
  }
  g.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.70"); n++;
  for (let i = 0; i < SONRA; i++) {
    g.push("-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.28:d=0.25");
    g.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=0.12"); n += 2;
  }
  const et = Array.from({ length: n }, (_, i) => `[${i}]`).join("");
  await run(st.ffmpegPath, ["-y", ...g, "-filter_complex",
    `${et}concat=n=${n}:v=0:a=1[a]`, "-map", "[a]", "-ar", "48000", "-ac", "1", ses],
    { timeoutMs: 120000 });
  const toplam = (HECE + SONRA) * 0.37 + 0.70;
  await run(st.ffmpegPath, ["-y", "-f", "lavfi",
    "-i", `sine=frequency=220:duration=${toplam.toFixed(2)}:sample_rate=48000`,
    "-af", "volume=0.30", "-ac", "2", muz], { timeoutMs: 60000 });
} catch { ffmpegVar = false; }

if (!ffmpegVar) {
  console.log("ATLA  ffmpeg yok — pompalama ölçümü çalıştırılmadı");
} else {
  const seviye = async (dosya, bas, sure) => {
    const p = path.join(D, `k${String(bas).replace(".", "_")}_${sure}.wav`);
    await run(st.ffmpegPath, ["-y", "-ss", String(bas), "-t", String(sure), "-i", dosya, p],
      { timeoutMs: 30000 });
    let log = "";
    await run(st.ffmpegPath, ["-hide_banner", "-i", p, "-af", "volumedetect", "-f", "null", "-"],
      { timeoutMs: 30000, onLine: (s) => { log += s; } });
    const m = log.match(/mean_volume:\s*(-?[\d.]+)/);
    return m ? parseFloat(m[1]) : NaN;
  };

  const olc = async (ad, ayar) => {
    const cikti = path.join(D, ad + ".wav");
    await run(st.ffmpegPath, ["-y", "-i", muz, "-i", ses, "-filter_complex",
      `[1:a]aformat=sample_rates=48000:channel_layouts=stereo[yan];` +
      `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[mus];` +
      `[mus][yan]sidechaincompress=${ayar}[duck]`,
      "-map", "[duck]", cikti], { timeoutMs: 120000 });
    const pen = [];
    for (let t = 1.0; t < 3.4; t += 0.2) pen.push(await seviye(cikti, +t.toFixed(2), 0.2));
    const g = pen.filter(Number.isFinite);
    const ort = g.reduce((a, b) => a + b, 0) / g.length;
    const sapma = Math.sqrt(g.reduce((a, b) => a + (b - ort) ** 2, 0) / g.length);
    const konusma = await seviye(cikti, 1.5, 1.2);
    const bosluk = await seviye(cikti, HECE * 0.37 + 0.20, 0.35);
    return { sapma, kabarma: bosluk - konusma };
  };

  const yeni = await olc("yeni", DUCK);
  const eski = await olc("eski", ESKI);
  console.log(`     ölçüm YENİ: pompalama ${yeni.sapma.toFixed(2)} dB, ` +
    `nefes kabarması +${yeni.kabarma.toFixed(1)} dB`);
  console.log(`     ölçüm ESKİ: pompalama ${eski.sapma.toFixed(2)} dB, ` +
    `nefes kabarması +${eski.kabarma.toFixed(1)} dB`);

  kontrol("titreme eski ayardan AZ", yeni.sapma < eski.sapma,
    `yeni ${yeni.sapma.toFixed(2)} / eski ${eski.sapma.toFixed(2)} dB`);
  kontrol("titreme mutlak olarak düşük", yeni.sapma < 0.70,
    yeni.sapma.toFixed(2) + " dB");
  kontrol("nefes kabarması korunuyor", yeni.kabarma > 3.5,
    `+${yeni.kabarma.toFixed(1)} dB — bölüm geçişini kasıtlı hissettiren şey bu`);
  kontrol("kabarma eski ayara yakın kaldı", yeni.kabarma > eski.kabarma - 1.5,
    `yeni +${yeni.kabarma.toFixed(1)} / eski +${eski.kabarma.toFixed(1)} dB`);
}
fs.rmSync(D, { recursive: true, force: true });

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
