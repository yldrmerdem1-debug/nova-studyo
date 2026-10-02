// KONUNUN KİŞİSİ EKRANDA GÖRÜNÜYOR MU — garanti, umut değil.
//
// Boru hattındaki her karar YERELDİR: her sahne kendi sorgusunun en iyi
// adayını alır. Hiçbir yerde "bu video bir kişiyi anlatıyor, o kişi
// gösterilmeli" kuralı yoktu. İki üretimde ölçüldü:
//   20260809-dee3fd : yüz 4 sahnede çıktı (şans eseri)
//   20260809-95b7d7 : hiç çıkmadı — OYSA havuzda 3/3 puanla duruyordu
// İkincisinde fotoğraf "Vanga grave Rupite" havuzunda 2. sıradaydı; o sorguyu
// tek sahne kullanıyordu ve 1. sıradaki mezar alındı.
import assert from "node:assert";
import { konuKisisiniGoster } from "../src/pipeline/media.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const job = { topic: "Baba Vanga: Bulgar kahinin hayatı ve kehanetlerinin gerçek hikâyesi" };
const script = { sections: [{ segments: [
  { text: "x", visuals: [{ query: "Vanga grave Rupite", type: "image", kind: "place" }] },
  { text: "y", visuals: [{ query: "Petrich Bulgaria town", type: "image", kind: "place" }] },
] }] };

/** Havuz kur: mezar (doğru ama kişi değil) + kişinin madde kapağı. */
const havuzKur = () => ({
  "Vanga grave Rupite||image": [
    { id: "wm-0-11", provider: "wikimedia", url: "https://x/Vanga's-Grave-Rupite.JPG",
      metin: "Vanga Grave Rupite", eser: "Vanga's Grave Rupite", onGorsel: 3, onKalite: 3, score: 240 },
    { id: "wikipedia-5-70861", provider: "wikipedia", url: "https://upload.wikimedia.org/wikipedia/en/f/fc/Baba_Vanga.jpg",
      metin: "Baba Vanga Bulgarian mystic", eser: "Baba Vanga", onGorsel: 3, onKalite: 2, score: 232 },
  ],
  "Petrich Bulgaria town||image": [
    { id: "px-0-42", provider: "pixabay", url: "https://y/town.jpg", metin: "old town", eser: "", onGorsel: 1, onKalite: 3, score: 100 },
  ],
});

// -------------------------------------------------- ÖLÇÜLEN VAKA: KAÇIRMA
let cand = havuzKur();
let picks = { "s0b0": "wm-0-11", "s1b0": "px-0-42" };
let n = konuKisisiniGoster(job, script, cand, picks);
kontrol("kişi yoksa takas yapılır", n === 1, `takas: ${n}`);
kontrol("kişinin fotoğrafı seçime girdi",
  Object.values(picks).includes("wikipedia-5-70861"), JSON.stringify(picks));
// KİŞİNİN ADI GEÇMEYEN SAHNEYE KOYMAZ. Yüzü "Petriç kasabası" anlatılırken
// göstermek, kaçırmak kadar yanlış olur.
kontrol("adı geçmeyen sahneye dokunulmadı", picks["s1b0"] === "px-0-42", JSON.stringify(picks));

// Adı geçen BİRDEN ÇOK sahne varsa, seçimi en ZAYIF olan takas edilir —
// güçlü bir sahne feda edilmesin.
const script2 = { sections: [{ segments: [
  { text: "x", visuals: [{ query: "Vanga grave Rupite", type: "image", kind: "place" }] },
  { text: "y", visuals: [{ query: "Baba Vanga house Petrich", type: "image", kind: "place" }] },
] }] };
const cand2 = havuzKur();
cand2["Baba Vanga house Petrich||image"] = [
  { id: "zayif-1", provider: "pixabay", url: "https://y/ev.jpg", metin: "house", eser: "", onGorsel: 1, onKalite: 2, score: 90 },
];
const picks2 = { "s0b0": "wm-0-11", "s1b0": "zayif-1" };
konuKisisiniGoster(job, script2, cand2, picks2);
kontrol("adı geçen sahnelerden EN ZAYIFI takas edilir",
  picks2["s1b0"] === "wikipedia-5-70861" && picks2["s0b0"] === "wm-0-11",
  JSON.stringify(picks2));

// MEZAR KİŞİ DEĞİLDİR — ilk sürüm tam burada çalışmamıştı: dosya adı
// "Vanga's-Grave" olduğu için kişi sanılıp "zaten var" deniyordu.
cand = havuzKur();
picks = { "s0b0": "wm-0-11", "s1b0": "px-0-42" };
konuKisisiniGoster(job, script, cand, picks);
kontrol("adı taşıyan MEZAR, kişinin kendisi sayılmaz",
  Object.values(picks).includes("wikipedia-5-70861"));

// -------------------------------------------------- ZATEN VARSA DOKUNMA
cand = havuzKur();
picks = { "s0b0": "wikipedia-5-70861", "s1b0": "px-0-42" };
kontrol("kişi zaten videodaysa takas YAPILMAZ",
  konuKisisiniGoster(job, script, cand, picks) === 0 && picks["s1b0"] === "px-0-42");

// Aynı dosya başka havuzda farklı id alıyor (id'de liste sırası var) —
// kimlik DOSYADAN türemeli, yoksa "zaten var" kaçırılır ve iki kez konur.
cand = havuzKur();
cand["Petrich Bulgaria town||image"].push({
  id: "wikipedia-0-70861", provider: "wikipedia",
  url: "https://upload.wikimedia.org/wikipedia/en/f/fc/Baba_Vanga.jpg?utm_source=x",
  metin: "Baba Vanga", eser: "Baba Vanga", onGorsel: 3, onKalite: 2, score: 210 });
picks = { "s0b0": "wm-0-11", "s1b0": "wikipedia-0-70861" };
kontrol("aynı dosya farklı id ile seçiliyse tekrar konmaz",
  konuKisisiniGoster(job, script, cand, picks) === 0,
  "kimlik dosyadan türemezse kişi videoya İKİ KEZ girer");

// -------------------------------------------------- KONU KİŞİ DEĞİLSE
cand = havuzKur();
picks = { "s0b0": "wm-0-11", "s1b0": "px-0-42" };
kontrol("kişi adayı yoksa hiçbir şey yapılmaz",
  konuKisisiniGoster({ topic: "Volkanlar nasıl oluşur" },
    { sections: [{ segments: [{ text: "x", visuals: [{ query: "volcano eruption", type: "image", kind: "place" }] }] }] },
    { "volcano eruption||image": [{ id: "a", provider: "pixabay", url: "https://z/v.jpg", metin: "lava", eser: "" }] },
    { "s0b0": "a" }) === 0);
kontrol("konu boşsa çökmez", konuKisisiniGoster({}, script, cand, picks) === 0);

// Denetimden SIFIR alan görsel, kişi olsa bile konmaz.
cand = havuzKur();
cand["Vanga grave Rupite||image"][1].onGorsel = 0;
picks = { "s0b0": "wm-0-11", "s1b0": "px-0-42" };
kontrol("görsel denetiminden 0 alan aday kişi olsa bile konmaz",
  konuKisisiniGoster(job, script, cand, picks) === 0);

// Yalnızca WIKIPEDIA madde kapağı kişi sayılır: stok sitesinden gelen,
// başlığında adı geçen bir görsel kişi garantisi için kullanılamaz.
cand = havuzKur();
cand["Vanga grave Rupite||image"][1].provider = "pixabay";
picks = { "s0b0": "wm-0-11", "s1b0": "px-0-42" };
kontrol("stok sağlayıcıdan gelen aday kişi sayılmaz",
  konuKisisiniGoster(job, script, cand, picks) === 0,
  "madde kapağı olmayan görselin kişiyi gösterdiği garanti değil");

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
