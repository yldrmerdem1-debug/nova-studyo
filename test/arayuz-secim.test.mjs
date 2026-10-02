// ARAYÜZDEKİ SEÇİM İŞE ULAŞIYOR MU?
//
// Kullanıcı şikâyeti: "12 dk seçtim 7 dk çıktı, İngilizce seçtim Türkçe
// anlatım çıktı." İş kaydında gerçekten `durationPreset: "standart"` ve
// `language: "tr"` yazıyordu — yani seçim işe hiç ulaşmamıştı.
//
// Tarayıcıda canlı denendi: yedi süre seçeneğinin yedisi de, dil çipleri de
// doğru çalışıyor. Ama bir GERÇEK hata çıktı: dil İngilizce'ye çevrilince
// ElevenLabs sesi Türkçe'de kalıyordu — şeritte "SES EN · Caglayan Zorlu"
// yazıyor, İngilizce metin İstanbul aksanlı sese okutuluyordu.
//
// Bu paket o düzeltmenin yerinde durduğunu ve seçim zincirinin kırılmadığını
// sınar (tarayıcı gerekmez, kod sözleşmesi kontrol edilir).
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const ap = fs.readFileSync(new URL("../public/app.js", import.meta.url), "utf8");

// ------------------------------------------------- DİL ↔ SES EŞLEŞMESİ
kontrol("dil değişince ElevenLabs sesi de düzeltiliyor",
  ap.includes("function elevenVoiceDiliTut()") && ap.includes("elevenVoiceDiliTut();"),
  "eskiden yalnızca Edge sesi düzeltiliyordu");
kontrol("ses dili sesin KENDİ etiketinden okunuyor",
  ap.includes('(v.labels?.language || "").toLowerCase().startsWith(dil)'),
  "ada göre tahmin edilirse yeni sesler eklendiğinde bozulur");
kontrol("o dilde ses yoksa seçim BOZULMUYOR",
  ap.includes("if (!uygun.length) return;"),
  "kullanıcının seçtiği ses sebepsiz değişmemeli");
kontrol("zaten doğru dildeyse dokunulmuyor",
  ap.includes("if (simdiki && simdikiDil.startsWith(dil)) return;"),
  "her çizimde ses değişirse kullanıcı seçimi kaybolur");
kontrol("liste henüz gelmediyse sessizce geçiliyor",
  ap.includes("if (!Array.isArray(l) || !l.length) return;"));

// İlk yükleme: liste geldiğinde körlemesine ilk ses değil, DİLE uyan ilk ses.
kontrol("ilk seste de dil gözetiliyor",
  ap.includes("const uygun = state.elevenVoices.filter((v) => (v.labels?.language"),
  "liste Türkçe seslerle başlıyor; körlemesine ilki alınırsa İngilizce videoya Türkçe ses gelir");

// ------------------------------------------------- SEÇİM ZİNCİRİ
kontrol("dil çipi forma bağlı", ap.includes('B("#fLang", "language"'));
kontrol("süre çipi forma bağlı", ap.includes('B("#fDur", "durationPreset")'));
kontrol("bağlantılar her yeniden çizimden sonra kuruluyor",
  /bindPanel\(\);/.test(ap) && ap.indexOf("bindPanel();") < ap.indexOf("function bindPanel"),
  "panel yeniden çizilince dinleyiciler kaybolursa ikinci tıklama işlemez");

// Yedi süre seçeneğinin tamamı arayüzde bulunmalı (tarayıcıda da doğrulandı).
const sunucuDur = fs.readFileSync(new URL("../src/config.js", import.meta.url), "utf8");
const presetler = [...sunucuDur.matchAll(/^\s{2}(\w+):\s*\{\s*name:/gm)].map((m) => m[1]);
kontrol("süre listesi sunucudan geliyor (elle yazılmıyor)",
  ap.includes("Object.entries(p.durations)"),
  "elle yazılırsa sunucuya eklenen yeni süre arayüzde görünmez");

// ------------------------------------ SENARYO DOĞRU DİLDE Mİ (son savunma)
// Arayüz doğru çalışsa bile model yanlış dilde yazabilir. Eskiden bu hiç
// kontrol edilmiyordu: yanlış dildeki senaryo medya + seslendirme + render
// parası harcandıktan SONRA fark ediliyordu.
const { senaryoyuDogrula } = await import("../src/pipeline/script.js");
const seg = (x) => ({ text: x, visuals: [], emphasis: {} });
const kur = (l) => ({ title: "x", sections: [{ title: "b", segments: l.map(seg) }] });
const dene = (s, job) => { try { senaryoyuDogrula(s, job); return null; } catch (e) { return e.message; } };
const tr = ["Vangeliya Guşterova bin dokuz yüz on birde Strumica'da doğdu ve orada büyüdü.",
            "Petriç'teki evi bugün müze olarak ziyaretçi ağırlıyor, çok kalabalık."];
const en = ["Vangelia Gushterova was born in Strumica in nineteen eleven and grew up there.",
            "Her house in Petrich is now a museum that welcomes thousands of visitors."];
kontrol("Ingilizce istenip TURKCE gelirse durur",
  /YANLIŞ DİLDE/.test(dene(kur(tr), { language: "en" }) || ""));
kontrol("Turkce istenip INGILIZCE gelirse durur",
  /YANLIŞ DİLDE/.test(dene(kur([en[0].repeat(4), en[1].repeat(4)]), { language: "tr" }) || ""));
kontrol("dogru dilde senaryo GECIYOR (yanlis alarm yok)",
  dene(kur(en), { language: "en" }) === null && dene(kur(tr), { language: "tr" }) === null);
kontrol("hata mesaji harcama yapilmadigini soyluyor",
  /harcama yapılmadı/.test(dene(kur(tr), { language: "en" }) || ""));
kontrol("olcut ORAN, varlik degil (ozel adlar yanlis alarm vermesin)",
  fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8")
    .includes("oran > 0.005"),
  "tek bir Turkce harf Ingilizce metni reddetmemeli");

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
