// GÖRSEL, ANLATILDIĞI ANDA EKRANDA MI?
//
// Kullanıcının isteği: "evini söylüyorsa evi çıksın, çocukluğunu söylüyorsa
// çocukluğu çıksın." Bu iki ayrı şey demek:
//   1. KESME cümle sınırına oturmalı (yoksa görsel cümlenin ortasında değişir)
//   2. Sahnedeki GÖRSEL, o sahnede söylenen cümleye ait olmalı
//
// Ölçülen başlangıç durumu (20260809-bc5629 ve -dee3fd): süreler ritim
// eğrisiyle bölünüyordu, kesmeler cümle sınırından ortalama 1,39 sn kayıktı;
// radyo görseli radyodan bahsedilmeden bir sahne önce çıkıyordu.
import fs from "node:fs";
import assert from "node:assert";
import {
  cumleleriBol, cumlePencereleri, sahnelereGrupla, sahneHizasi, gorselleriGruplaraDagit,
} from "../src/pipeline/cumlehizasi.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

/** Metinden düzgün aralıklı sahte kelime zamanları üret. */
const kelimele = (metin, sn = 0.4) =>
  metin.split(/\s+/).filter(Boolean).map((t, i) => ({ t, start: i * sn, end: (i + 1) * sn }));

// ------------------------------------------------------------ CÜMLE BÖLME
kontrol("cümle bölme: üç cümle", cumleleriBol("Bir. İki geldi. Üç kaldı.").length === 3);
kontrol("cümle bölme: soru ve ünlem de böler",
  cumleleriBol("Kimdi o? Bilmiyorum! Sonra gitti.").length === 3);
kontrol("cümle bölme: kısaltma cümleyi bitirmez",
  cumleleriBol("Dr. Ahmet geldi. Sonra gitti.").length === 2,
  cumleleriBol("Dr. Ahmet geldi. Sonra gitti.").join(" | "));
kontrol("cümle bölme: baş harf cümleyi bitirmez",
  cumleleriBol("Eser A. Kunike'ye ait. Sonra satıldı.").length === 2);
kontrol("cümle bölme: nokta yoksa tek cümle", cumleleriBol("noktasız bir metin").length === 1);
kontrol("cümle bölme: boş metin boş liste", cumleleriBol("").length === 0);

// -------------------------------------------------------- ZAMAN PENCERESİ
const metin = "Bir iki üç dört. Beş altı yedi. Sekiz dokuz on on bir.";
const kl = kelimele(metin, 0.5);          // 11 kelime, 5,5 sn
const pen = cumlePencereleri(metin, kl, 5.5);
kontrol("pencere: cümle başına bir pencere", pen.length === 3, `${pen.length}`);
kontrol("pencere: ilk pencere sıfırdan başlar", pen[0].bas === 0);
kontrol("pencere: pencereler bitişik (boşluk yok)",
  pen.every((p, i) => i === 0 || Math.abs(p.bas - pen[i - 1].son) < 1e-9));
kontrol("pencere: son pencere segmentin sonuna kadar", Math.abs(pen[2].son - 5.5) < 1e-9);
kontrol("pencere: ilk cümle 4 kelimede biter (~2,0 sn)",
  Math.abs(pen[0].son - 2.0) < 0.6, `${pen[0].son.toFixed(2)}`);
kontrol("pencere: kelime zamanı yoksa boş döner",
  cumlePencereleri(metin, [], 5.5).length === 0,
  "hizalama yapılamıyorsa çağıran eski ritim bölmesine dönmeli");

// ------------------------------------------------------------- GRUPLAMA
const g3 = sahnelereGrupla(pen, 3, 0.5);
kontrol("gruplama: istenen sahne sayısı verilir", g3.length === 3);
kontrol("gruplama: kesmeler DAİMA cümle sınırında",
  g3.slice(0, -1).every((g) => pen.some((p) => Math.abs(p.son - g.son) < 1e-9)),
  g3.map((g) => g.son.toFixed(2)).join(", "));
kontrol("gruplama: toplam süre korunur",
  Math.abs(g3.reduce((a, g) => a + g.dur, 0) - 5.5) < 1e-6);

// Kısa sahne yasağı: 2,2 sn tabanla 3 sahne çıkmaz, 2'ye düşer.
const g2 = sahnelereGrupla(pen, 3, 2.2);
kontrol("gruplama: taban süre altına düşen bölme kabul edilmez",
  g2.every((g) => g.dur >= 2.2 - 1e-9) && g2.length < 3,
  `${g2.length} sahne: ${g2.map((g) => g.dur.toFixed(2)).join(", ")}`);
kontrol("gruplama: cümleden çok sahne istenirse cümle sayısına iner",
  sahnelereGrupla(pen, 9, 0.3).length <= 3);
kontrol("gruplama: tek sahne istenirse tamamı tek grup",
  sahnelereGrupla(pen, 1, 0.3).length === 1);

// ------------------------------------------------------------- TAM AKIŞ
const h = sahneHizasi(metin, kl, 3, 5.5, 0.5);
kontrol("akış: nesne döner (gruplar + pencereler + görsel sırası)",
  !!h && Array.isArray(h.gruplar) && Array.isArray(h.pencereler) && Array.isArray(h.gorselSirasi));
kontrol("akış: süre toplamı segment süresine EŞİT",
  Math.abs(h.gruplar.reduce((a, g) => a + g.dur, 0) - 5.5) < 0.01,
  "aksi halde her segmentte hata birikir ve ses görüntüden kayar");
kontrol("akış: tek cümlelik segmentte hizalama yapılmaz",
  sahneHizasi("Tek bir cümle var burada.", kelimele("Tek bir cümle var burada."), 2, 2.0) === null);
kontrol("akış: kelime zamanı yoksa null (eski yola dönülür)",
  sahneHizasi(metin, null, 3, 5.5) === null);
kontrol("akış: süre sıfırsa null", sahneHizasi(metin, kl, 3, 0) === null);

// Gerçek 1 dakikalık pilotun açılışı: ilk soru 2,832 sn'de bitiyor. Açılış
// kartının 3,2 sn tercih edilen süresi bu anlamlı sınırı reddedip iki cümleyi
// ve dört geçerli görseli tek 11,941 sn plana düşürmemeli. 2,2 sn mutlak görsel
// tabanı korunurken, kesme yine ölçülen cümle sonunda kalabilir.
const pilotMetin = "Why do human tracks survive for decades on the Moon? " +
  "Apollo 11 landed in July 1969, and orbital images taken long afterward still show the astronauts' trails across the Sea of Tranquility.";
const pilotKelimeler = pilotMetin.split(/\s+/).map((t, i) => {
  const end = i < 10 ? (i + 1) * 0.2832 : 3.387 + (i - 9) * 0.36;
  return { t, start: Math.max(0, end - 0.24), end };
});
const pilotHiza = sahneHizasi(pilotMetin, pilotKelimeler, 2, 11.941125, 3.2,
  ["human tracks bootprints Moon", "Apollo 11 orbital images astronauts trails Sea of Tranquility"]);
kontrol("pilot: kısa ama güvenli soru, uzun açılışı tek görsele düşürmez",
  pilotHiza?.gruplar.length === 2,
  pilotHiza?.gruplar.map((g) => g.dur.toFixed(3)).join(", ") || "hiza yok");
kontrol("pilot: kesme ölçülen ilk cümle sonunda kalır",
  Math.abs((pilotHiza?.gruplar[0]?.son ?? 0) - 2.832) < 0.01);
kontrol("pilot: iki doğru sorgu kendi cümlesine atanır",
  pilotHiza?.gorselSirasi.join(",") === "0,1",
  pilotHiza?.gorselSirasi.join(",") || "hiza yok");
const cokKisaMetin = "Too short? The second sentence is deliberately long enough to occupy the remainder of this opening segment.";
const cokKisaKelimeler = cokKisaMetin.split(/\s+/).map((t, i) => ({
  t, start: i < 2 ? i * 0.9 : 2.2 + (i - 2) * 0.4,
  end: i < 2 ? (i + 1) * 0.9 : 2.2 + (i - 1) * 0.4,
}));
const cokKisaHiza = sahneHizasi(cokKisaMetin, cokKisaKelimeler, 2, 8, 3.2);
kontrol("pilot: 2,2 sn mutlak tabanın altındaki cümle ayrı sahne açmaz",
  cokKisaHiza?.gruplar.length === 1,
  cokKisaHiza?.gruplar.map((g) => g.dur.toFixed(3)).join(", ") || "hiza yok");

// --------------------------------------------- GÖRSELİ CÜMLESİNE EŞLEME
// Gerçek vaka (20260809-dee3fd S0): sıraya göre eşlemede Nostradamus'tan
// bahseden cümleye Petriç kasabası fotoğrafı düşüyordu.
const s0 = "Gerçek adı Vangeliya Gushterova. Dünya onu Balkanların Nostradamusu diye tanıdı. " +
  "2026 dalgası 3I ATLAS kuyruklu yıldızıyla ilgiliydi. Sonra o iddia çürütüldü.";
const k0 = kelimele(s0, 0.4);
const h0 = sahneHizasi(s0, k0, 3, k0.length * 0.4, 0.5,
  ["Petrich Bulgaria town", "Nostradamus engraving portrait", "3I ATLAS comet trajectory"]);
const cumleOf = (b) => h0.pencereler
  .filter((p) => p.bas < h0.gruplar[b].son - 0.01 && p.son > h0.gruplar[b].bas + 0.01)
  .map((p) => p.metin).join(" ");
const nostraSahne = h0.gorselSirasi.indexOf(1);
kontrol("eşleme: Nostradamus görseli Nostradamus cümlesine gitti",
  /Nostradamus/.test(cumleOf(nostraSahne)),
  `sahne ${nostraSahne} cümlesi: ${cumleOf(nostraSahne).slice(0, 60)}`);
const kuyrukSahne = h0.gorselSirasi.indexOf(2);
kontrol("eşleme: kuyruklu yıldız görseli ATLAS cümlesine gitti",
  /ATLAS/.test(cumleOf(kuyrukSahne)),
  `sahne ${kuyrukSahne} cümlesi: ${cumleOf(kuyrukSahne).slice(0, 60)}`);
kontrol("eşleme: her görsel bir kez kullanılır",
  new Set(h0.gorselSirasi).size === h0.gorselSirasi.length);

// TÜRKÇE HARF KATLAMASI — ölçülen regresyon.
// Sorguda "Petrich", anlatımda "Petriç". Katlama olmadan eşleşmiyor ve
// görseller TERS takas ediliyordu (S7 vakası).
const s7 = "Meme kanserinden öldüğünde cenazesine kalabalık geldi. " +
  "Petriç'teki evi 2008'de müze oldu. Bugün ziyaretçi akını sürüyor.";
const k7 = kelimele(s7, 0.5);
const h7 = sahneHizasi(s7, k7, 3, k7.length * 0.5, 0.5,
  ["Vanga grave Rupite", "Baba Vanga house museum Petrich", "museum visitors queue"]);
const muzeSahne = h7.gorselSirasi.indexOf(1);
kontrol("eşleme: Türkçe 'Petriç' ile İngilizce 'Petrich' eşleşir",
  /Petriç/.test(cumleOf2(h7, muzeSahne)),
  `sahne ${muzeSahne} cümlesi: ${cumleOf2(h7, muzeSahne).slice(0, 60)}`);
function cumleOf2(hh, b) {
  return hh.pencereler
    .filter((p) => p.bas < hh.gruplar[b].son - 0.01 && p.son > hh.gruplar[b].bas + 0.01)
    .map((p) => p.metin).join(" ");
}

// CÜMLE BAŞI SAHTE ÖZEL AD — ölçülen regresyon.
// "Meme kanserinden..." cümlesinde "Meme" büyük harfli diye özel ad sayılıp
// gürültü üretiyordu. Ama "Petriç'teki" de cümle başı — o GERÇEK özel ad ve
// kesme işareti bunun işareti.
const sirasiz = gorselleriGruplaraDagit(
  [{ bas: 0, son: 2 }, { bas: 2, son: 4 }],
  [{ metin: "Meme kanserinden öldü.", bas: 0, son: 2 },
   { metin: "Petriç'teki evi müze oldu.", bas: 2, son: 4 }],
  ["generic archive photo", "Petrich house museum"]);
kontrol("eşleme: kesmeli cümle başı özel ad olarak korunur",
  sirasiz[1] === 1, `atama: ${sirasiz.join(",")}`);

// SİNYAL YOKSA KARIŞTIRMA — sıra en iyi tahmindir.
const sinyalsiz = gorselleriGruplaraDagit(
  [{ bas: 0, son: 2 }, { bas: 2, son: 4 }],
  [{ metin: "burada hiç özel ad yok.", bas: 0, son: 2 },
   { metin: "burada da yok kesinlikle.", bas: 2, son: 4 }],
  ["abstract texture", "soft gradient"]);
kontrol("eşleme: ortak işaret yoksa özgün sıra korunur",
  sinyalsiz.join(",") === "0,1", sinyalsiz.join(","));
kontrol("eşleme: tek görselde atama yapılmaz",
  gorselleriGruplaraDagit([{ bas: 0, son: 2 }], [{ metin: "x.", bas: 0, son: 2 }], ["tek"]).join(",") === "0");

// ------------------------------ SOYUT CÜMLEYE FOTOĞRAF KOYMA
// Ölçüldü (5 üretim, kare kare): "söyleneni gösteriyor" oranı %55-61 arasında
// takılı kaldı; kalan kaybın büyük kısmı SEÇİM hatası değil, cümlenin soyut
// olmasıydı — "Peki o geleceği mi gördü?" için arşivde bir karşılık yok.
const { somutCapaVar } = await import("../src/pipeline/cumlehizasi.js");
const capasiz = [
  "Peki o geleceği mi gördü yoksa her nesil kendi korkusunu mu okudu?",
  "Ölümünden otuz yıl sonra adı hâlâ manşetlerde.",
  "Ama geride tek bir yazılı satır bırakmadı.",
  "Yani ona ait tek bir cümle bile kendi elinden çıkmadı.",
  "Ailenin tedavi parası yoktu.",
];
const capali = [
  ["1942 yılında evlendi.", "yıl"],
  ["Zemun'daki körler okuluna verildi.", "yer adı (kesmeli)"],
  ["Rupite'de kendi kilisesini yaptırdı.", "yer adı"],
  ["Cenazesine on beş bin kişi geldi.", "yazıyla nicelik"],
  ["Sonra Dimitar Gushterov ortaya çıktı.", "kişi adı"],
];
capasiz.forEach((c) => kontrol(`çapasız görülüyor: "${c.slice(0, 34)}..."`, !somutCapaVar(c)));
capali.forEach(([c, ad]) => kontrol(`çapa bulunuyor (${ad})`, somutCapaVar(c), c));
kontrol("süre çapa SAYILMAZ (aranacak şey göstermez)",
  !somutCapaVar("Otuz yıl sonra herkes unuttu."),
  "'otuz yıl' bir nicelik gibi görünür ama gösterilecek bir şey değildir");
kontrol("boş metin çökmez", somutCapaVar("") === false && somutCapaVar(null) === false);

// Kural render'da İKİ koşula bağlı ve TAVANLI olmalı — yoksa video yazıya boğulur.
const rd = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
kontrol("render: yalnizca denetim ZAYIF bulduysa devreye girer",
  rd.includes("!Number.isFinite(m.gorsel) || m.gorsel > 1"),
  "denetimin iyi bulduğu görsel asla yazıya çevrilmemeli");
// "SORGU somutsa görsel korunur" koşulu KALDIRILDI — ölçümle.
//
// Eskiden burada `if (ozelAdIcerir(sorgu)) return m;` vardı. Gerekçesi
// "sorgu somutsa gösterilecek bir şey vardır"dı; kulağa doğru geliyordu ama
// gerçek videoda (20260811-5ef0d8) şu oldu: görsel isabeti %45'e düştüğü
// hâlde TEK BİR SAHNE bile tipografiye dönmedi. Sebep, sorgu onarımı
// adımının 19/19 sorguya bilerek özel ad koymasıydı — iki iyi özellik
// birbirini iptal ediyordu.
//
// Mantık da hatalıydı: bir üstteki koşul zaten "denetim BU GÖRSELE kötü dedi"
// diyor. SORGUDAKİ özel ad, gelen GÖRSEL hakkında hiçbir şey söylemez;
// "Neuralink N1 implant coin size" sorgusuna NASA'dan uzay fotoğrafı geldi
// ve tam bu koşul yüzünden ekranda kaldı.
kontrol("render: sorgudaki özel ad artık kapıyı kapatmıyor",
  !rd.includes("if (ozelAdIcerir(f.visuals[vIdx]?.query"),
  "bu koşul geri gelirse tipografi güvenliği yine sessizce devre dışı kalır");
kontrol("render: capa varsa gorsel korunur",
  rd.includes("if (somutCapaVar(metin)) return m;"));
kontrol("render: tavan uygulaniyor (video yaziya bogulmasin)",
  rd.includes("TIPOGRAFI_TAVANI = 0.25") && rd.includes("beats.length * TIPOGRAFI_TAVANI"));
kontrol("render: en dusuk alakali sahneler once donusuyor",
  rd.includes("(a.media.gorsel ?? 9) - (b.media.gorsel ?? 9)"));
kontrol("render: kullaniciya bildiriliyor",
  rd.includes("somut karşılığı yok (soyut cümle)"));

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
