// HER MODEL ÇAĞRISI TAVANINI AÇIKÇA VERMELİ.
//
// Ölçülen kusur (20260811-3ca6c1, 3 dakikalık İngilizce iş): senaryo aşamasında
// %10'da "Yanıt token sınırına takıldı" ile TÜM İŞ öldü — araştırma parası
// harcanmış, ortada video yok.
//
// Sebep: Opus 5'te DÜŞÜNME de max_tokens bütçesinden yiyor. Araştırma ve
// bölüm-yazma çağrıları bu yüzden 32.000'e çıkarılmıştı, ama script.js'teki
// üç çağrı (bölüm yazma, ana hat, onarım) maxTokens'ı HİÇ vermeyip
// callJSON'un 16.000 varsayılanına düşüyordu. Serbest metin kesilse eldekiyle
// devam edilebiliyor; JSON kesilince kullanılamıyor, o yüzden iş ölüyor.
//
// Bu paket kaynak kodu tarayıp her callJSON/callText çağrısının kendi tavanını
// verdiğini doğruluyor. Varsayılana güvenmek sessiz bir tuzak.
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

/** Kaynakta `fn({...})` çağrılarını bulup içinde maxTokens var mı bak. */
function tavansizCagrilar(kaynak, fnAdi) {
  const satirlar = kaynak.split(/\r?\n/);
  const eksik = [];
  let acilis = -1, derinlik = 0, tavan = false;
  const kalip = new RegExp(`${fnAdi}\\(\\{`);
  satirlar.forEach((l, i) => {
    if (acilis < 0) {
      if (!kalip.test(l)) return;
      acilis = i + 1; derinlik = 0; tavan = false;
    }
    for (const ch of l) { if (ch === "{") derinlik++; else if (ch === "}") derinlik--; }
    if (/maxTokens\s*:/.test(l)) tavan = true;
    if (derinlik <= 0) { if (!tavan) eksik.push(acilis); acilis = -1; }
  });
  return eksik;
}

const DOSYALAR = [
  "../src/pipeline/script.js",
  "../src/pipeline/media.js",
  "../src/pipeline/seo.js",
  "../src/pipeline/kurgu.js",
  "../src/pipeline/gorseldenetim.js",
];

for (const yol of DOSYALAR) {
  let kaynak;
  try { kaynak = fs.readFileSync(new URL(yol, import.meta.url), "utf8"); }
  catch { continue; } // dosya yoksa atla — paket başka dosyalar için de geçerli
  const ad = yol.split("/").pop();
  for (const fn of ["callJSON", "callText", "callVisionJSON"]) {
    if (!kaynak.includes(fn + "({")) continue;
    const eksik = tavansizCagrilar(kaynak, fn);
    kontrol(`${ad}: her ${fn} çağrısı maxTokens veriyor`, eksik.length === 0,
      eksik.length ? `tavansız satırlar: ${eksik.join(", ")}` : "");
  }
}

// Senaryo hattındaki üç kritik çağrı yeterince yüksek olmalı. 16.000
// düşünmeyle birlikte yetmiyor; ölçülen kusur tam buradan çıktı.
{
  const s = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  const tavanlar = [...s.matchAll(/maxTokens:\s*(\d+)/g)].map((m) => +m[1]);
  const buyukler = tavanlar.filter((t) => t >= 32000).length;
  kontrol("senaryo hattında en az 4 çağrı 32.000+ tavanda", buyukler >= 4,
    `bulunan tavanlar: ${tavanlar.join(", ")}`);
  kontrol("bölüm yazma çağrısı artık varsayılana düşmüyor",
    /schema,\s*\n\s*\/\/[\s\S]{0,600}?maxTokens: 32000/.test(s) || /schema,[\s\S]{0,600}?maxTokens: 32000/.test(s));
}

// Tavana çarpan JSON isteği sessizce yarım veri döndürmemeli.
{
  const llm = fs.readFileSync(new URL("../src/llm.js", import.meta.url), "utf8");
  kontrol("max_tokens durumu ayrıca ele alınıyor", llm.includes('stop_reason === "max_tokens"'));
  kontrol("kesilmiş yanıt yalnızca kesilebilir çağrılarda kullanılıyor",
    llm.includes("kesikOlur"),
    "JSON yarım kesilirse ayrıştırılamaz; serbest metinde eldekiyle devam edilebilir");
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
