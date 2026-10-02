// EKRAN YAZISI KELİME ORTASINDAN KESİLMEMELİ.
//
// ÖLÇÜLEN KUSUR (20260811-c2e50d, bitmiş videonun 20. saniyesi): vurgu etiketi
// ekranda şöyle duruyordu:
//     736,900
//     COCHLEAR IMPLANTS WORLDWIDE, E
// Tam 30 karakter — ftext'in `.slice(0, max)`'i son kelimeyi ortadan kesmiş ve
// ekranda anlamsız bir "E" bırakmıştı. Kullanıcı bunu "yazıların bazıları
// yanlış yerde beliriyor" diye bildirdi.
import assert from "node:assert";
import { ftext } from "../src/pipeline/graphics.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// Kusurun kendisi
{
  const ham = "COCHLEAR IMPLANTS WORLDWIDE, ESTIMATE";
  const c = ftext(ham, 30);
  kontrol("gerçek kusur tekrarlanmıyor", c !== "COCHLEAR IMPLANTS WORLDWIDE, E", c);
  kontrol("son kelime tam", !/\s\S{1,2}$/.test(c) || c.split(" ").pop().length > 2, c);
  kontrol("sınır aşılmıyor", c.length <= 30, `${c.length} karakter`);
  console.log(`     "${ham}" (30) -> "${c}"`);
}
// Kırpma gerekmiyorsa metin AYNEN kalmalı
{
  kontrol("kısa metin değişmiyor", ftext("Kısa etiket", 30) === "Kısa etiket");
  kontrol("tam sınırdaki metin kırpılmıyor", ftext("12345678901234567890", 20) === "12345678901234567890");
}
// Tek uzun kelime: %60 alt sınırı metnin çoğunu atmayı önlemeli
{
  const c = ftext("Antidisestablishmentarianism", 20);
  kontrol("tek uzun kelime tamamen silinmiyor", c.length >= 12, `"${c}"`);
}
// Sondaki noktalama sarkmamalı
{
  kontrol("kesme sonrası virgül sarkmıyor", !/[,;:\-–—]$/.test(ftext("ALPHA BETA GAMMA, DELTA", 18)),
    ftext("ALPHA BETA GAMMA, DELTA", 18));
}
// Eski davranışın korunması gereken yanları
{
  kontrol("tehlikeli karakterler temizleniyor", !/['"{}%\\]/.test(ftext(`a'b"c{d}e%f\\g`, 60)));
  kontrol("iki nokta kaçırılıyor (ffmpeg drawtext)", ftext("saat 10:30", 60).includes("\\:"));
  kontrol("boşluklar tekilleşiyor", ftext("a    b\n\nc", 60) === "a b c");
  kontrol("boş girdi çökertmiyor", ftext("", 30) === "" && ftext(null, 30) === "");
}
// Türkçe
{
  const c = ftext("BULGARİSTAN BİLİMLER AKADEMİSİ BİNASI", 24);
  kontrol("Türkçe metinde de kelime bütün kalıyor", !c.endsWith("B") && c.length <= 24, `"${c}"`);
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
