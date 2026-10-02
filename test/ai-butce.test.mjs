// AI GÖRSEL BÜTÇESİ — TEK AYAR, ELLE YAZILIR.
//
// Önce iki ayrı ayar vardı: aiClips (senaryonun planladığı AI sahne) ve
// aiFill (arşiv çuvallayınca acil yedek). Arayüzde iki ayrı yerde, iki ayrı
// fiyatla soruluyordu.
//
// Kod ise ikisini tek havuz sanıyordu ve İKİ yerde birbirini yiyordu:
//   kalan = aiFill - isaretli   -> 8 - 12 = 0, kurtarma hiç çalışmıyordu
//   butce = Math.max(12, 8)     -> 12, kullanıcının gördüğü 20 değildi
//
// Kullanıcı bunu ekranda fark etti ("hala iki tane ai görsel ekleme var") ve
// haklıydı: pratikte ikisi de aynı soruyu soruyor — "en fazla kaç AI görsel".
// Tek alana indirildi (aiButce) ve sabit seçenekler yerine sayı kutusu kondu.
import fs from "node:fs";
import assert from "node:assert";
import {plannedAiAllowance} from "../public/production-modes.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const ix = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
const sc = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
const md = fs.readFileSync(new URL("../src/pipeline/media.js", import.meta.url), "utf8");
const ap = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const cs = fs.readFileSync(new URL("../public/style.css", import.meta.url), "utf8");

// ------------------------------------------------------------- SUNUCU
kontrol("tek bütçe alanı tanımlı ve sınırlı (0-30)",
  ix.includes("aiButce: Math.max(0, Math.min(30"));
kontrol("eski istemci/kayıtlar için geriye uyum var",
  ix.includes("body.aiButce ?? Math.max(parseInt(body.aiClips)"),
  "eski işler ve eski arayüz çalışmaya devam etmeli");

// --------------------------------------------------------- PAY DAĞITIMI
kontrol("senaryonun planlayacağı pay tek bütçeden geliyor",
  plannedAiAllowance({mediaKind:"ai",aiSupport:"manual",aiButce:12})===8);
kontrol("bütçenin tamamı senaryoya verilmiyor (kurtarmaya pay kalıyor)",
  plannedAiAllowance({mediaKind:"ai",aiSupport:"manual",aiButce:12})<12,
  "hepsi plana giderse arşiv çuvalladığında kurtaracak bütçe kalmaz");
kontrol("kurtarma payı = toplam eksi zaten işaretlenenler",
  md.includes("const kalan = Math.max(0, aiToplamButce - isaretli);"),
  "planlı + kurtarma toplamı kullanıcının yazdığı sayıyı aşmamalı");
kontrol("üretim tavanı da aynı tek bütçe",
  md.includes("const aiButce = aiToplamButce;") &&
  !md.includes("(job.aiClips || 0) + (job.aiFill || 0)"),
  "toplama yapılırsa kullanıcı iki katını öder");
kontrol("bütçe tamamen plana gittiyse kullanıcıya söyleniyor",
  md.includes("AI bütçesinin tamamı"));

// Çakışma güvencesi: boşluk taraması zaten AI işaretlileri atlıyor.
kontrol("boşluk taraması planlı AI sahneleri atlıyor (çift üretim yok)",
  md.includes('if (b.visual?.type === "ai") continue;'));

// -------------------------------------------------------------- ARAYÜZ
kontrol("arayüzde TEK bölüm kaldı",
  ap.includes("AI DESTEĞİ") &&
  !ap.includes('sec("1) PLANLI AI SAHNE"') && !ap.includes('sec("2) ARŞİV ÇUVALLARSA'),
  "aynı soru iki yerde sorulmamalı");
kontrol("sayı ELLE yazılabiliyor",
  ap.includes('<input type="number" id="fAiButce"') && ap.includes('max="30"'));
kontrol("hazır düğmeler de var (tek tıkla seçim)", ap.includes("data-aihaz"));
kontrol("yazarken maliyet anında güncelleniyor",
  ap.includes('aiKutu.addEventListener("input"'));
kontrol("hazır düğme kutuya da yazıyor (ikisi ayrışmasın)",
  ap.includes('aiKutu.value = b.dataset.aihaz'));
kontrol("kutunun stili var (biçimsiz görünmesin)",
  cs.includes(".ai-sayi input[type=\"number\"]") && cs.includes(".aihaz.sel"));

// Açıklama metni tek bütçe modelini anlatmalı, eski ikili modeli değil.
kontrol("açıklama tek bütçeyi anlatıyor",
  ap.includes("Tek bütçe: bir kısmını senaryo planlar") &&
  !ap.includes("ayrı bir bütçedir, ikisi toplanır"));

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
