// ANLATILAN ŞEY EKRANDA GÖRÜNÜYOR MU?
//
// Kullanıcının şikâyeti: "vanga anlatılıyor ama bir tane Vanga resmi yok; ne
// anlatılıyorsa onunla ilgili resim koyulmalı." Ölçülen üretim videosunda
// (20260809-bc5629) tespit edilenler:
//
//   - Kadının gerçek fotoğrafı hiç havuza girmiyordu. Sebebi: Wikimedia
//     Commons'ta yok, Wikipedia'da var ama TELİFLİ olduğu için `pageimages`
//     onu gizliyor ve boyutu (220x314) eski süzgeci geçmiyordu.
//   - Aynı bahçe pompasının 4 varyantı ilk 21 adayın 7'sini kaplıyordu.
//   - Adı anılan yerler (Strumica, Zemun, Petriç) stok fotoğraf sitesinden
//     geliyordu; pixabay'de o yerler yoktur.
//   - Wikimedia adaylarının en-boy oranı yanlış kaydediliyordu.
//
// Bu paket o dört kusurun her birini kodu ÇALIŞTIRARAK sınar.
import fs from "node:fs";
import assert from "node:assert";
import {
  ozelAdIcerir, ayniCekimiKatla, ailekimligi, boyutYeterli, kucukAmaDogru,
  wikiAramaTerimleri, STOK_SAGLAYICI,
} from "../src/pipeline/media.js";
import { gorselDuzeltmesiUygula } from "../src/pipeline/gorseldenetim.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------------------------------------------------------------- ÖZEL AD
kontrol("özel ad: yer adı yakalanır", ozelAdIcerir("Zemun Belgrade old photograph"));
kontrol("özel ad: kişi adı yakalanır", ozelAdIcerir("Baba Vanga portrait photograph"));
kontrol("özel ad: tek başına yer adı", ozelAdIcerir("Strumica old town photograph"));
kontrol("özel ad: jenerik sorguda yok", !ozelAdIcerir("vintage typewriter manuscript pages"));
kontrol("özel ad: millet sıfatı tek başına sayılmaz",
  !ozelAdIcerir("old Bulgarian identity document"),
  "'Bulgarian' bir sıfat; jenerik eski belge stok sitesinden gelebilir");
kontrol("özel ad: 'Old'/'Saint' gibi yaygın kelimeler sayılmaz",
  !ozelAdIcerir("Old wooden door"));

// ------------------------------------------------------- AYNI ÇEKİMİ KATLA
// Gerçek veri: aynı pompanın (2)(3)(4)(5) varyantları + Openverse'ün
// Wikimedia kopyaları + 3840px ölçek öneki.
const havuz = [
  { url: "https://x/Vanga's-Grave-Rupite.JPG", score: 168 },
  { url: "https://y/3840px-Pump_of_Baba_Vanga-_Novo_Selo_%282%29.jpg", score: 123 },
  { url: "https://y/3840px-Pump_of_Baba_Vanga-_Novo_Selo_%283%29.jpg", score: 121 },
  { url: "https://y/Pump_of_Baba_Vanga-_Novo_Selo_%285%29.jpg", score: 100 },
  { url: "https://z/Vanga's-Grave-Rupite.JPG?utm_source=commons", score: 114 },
  { url: "https://w/Baba_Vanga_Border_Pass.jpg", score: 103 },
];
const katli = ayniCekimiKatla(havuz);
kontrol("katlama: aynı dosyanın ikinci kopyası atılır",
  katli.filter((c) => /Grave-Rupite/.test(c.url)).length === 1);
kontrol("katlama: pompanın 3 varyantı tek adaya iner",
  katli.filter((c) => /Pump_of_Baba_Vanga/.test(c.url)).length === 1,
  `kalan: ${katli.filter((c) => /Pump/.test(c.url)).length}`);
kontrol("katlama: farklı dosya elenmez",
  katli.some((c) => /Border_Pass/.test(c.url)));
kontrol("katlama: sıra korunur (en yüksek puanlı önde)",
  katli[0].score === 168);
kontrol("katlama: vesikalık sırası yükselir",
  katli.findIndex((c) => /Border_Pass/.test(c.url)) < havuz.findIndex((c) => /Border_Pass/.test(c.url)));
kontrol("aile kimliği: ölçek öneki ve varyant numarası yok sayılır",
  ailekimligi("https://a/3840px-Pump_of_X_%282%29.jpg") === ailekimligi("https://b/Pump_of_X.jpg"));
kontrol("aile kimliği: farklı dosyalar ayrı kalır",
  ailekimligi("https://a/Baba_Vanga_bust.jpg") !== ailekimligi("https://a/Baba_Vanga_Border_Pass.jpg"));

// -------------------------------------------------------------- BOYUT/ORAN
kontrol("boyut: normal dikey belge geçer (478x685)", boyutYeterli(478, 685));
kontrol("boyut: şerit elenir (478x3669)", !boyutYeterli(478, 3669),
  "1:7,7 oranı tam ekranda kadrajın %80'ini kırpar");
kontrol("boyut: aşırı panorama elenir", !boyutYeterli(9000, 900));
kontrol("boyut: makul panorama geçer (2,7:1)", boyutYeterli(9168, 3392));
kontrol("boyut: küçük görsel normal süzgeci GEÇMEZ", !boyutYeterli(220, 314));
kontrol("küçük-ama-doğru: 220x314 geçer", kucukAmaDogru(220, 314),
  "Wikipedia madde kapağı — kadının tek gerçek fotoğrafı");
kontrol("küçük-ama-doğru: 120x160 çok küçük", !kucukAmaDogru(120, 160));
kontrol("küçük-ama-doğru: şerit yine elenir", !kucukAmaDogru(200, 2000));

// ------------------------------------------------------- WIKIPEDIA TERİMİ
const t1 = wikiAramaTerimleri("Nikola Tesla Wardenclyffe tower");
kontrol("wiki terimi: tam özel ad önce denenir", t1[0] === "Nikola Tesla Wardenclyffe");
kontrol("wiki terimi: kişi adına düşer", t1.includes("Nikola Tesla"));
const t2 = wikiAramaTerimleri("Rupite Bulgaria landscape");
kontrol("wiki terimi: ilk kelime son kelimeden ÖNCE denenir",
  t2.indexOf("Rupite") < t2.indexOf("Bulgaria"),
  `sıra: ${t2.join(" > ")} — 'Bulgaria' ülkenin genel maddesine düşürür`);
kontrol("wiki terimi: özel ad yoksa boş", wikiAramaTerimleri("vintage typewriter pages").length === 0);
kontrol("wiki terimi: en çok 4 deneme", wikiAramaTerimleri("Ann Bell Carl Doe Eve Fay Gil Hal").length <= 4);

// --------------------------------------------------- GÖRSEL PUANI DÜZELTME
// Gerçek regresyon: sıralama tamamen görsele devredilince, modelin hepsine 0
// verdiği bir turda "temiz kadrajlı alakasız stok" birinci oldu.
const hepsiSifir = [
  { ad: "arşiv", score: 168, onGorsel: 0, onKalite: 1 },
  { ad: "stok", score: 139, onGorsel: 0, onKalite: 3 },
];
gorselDuzeltmesiUygula(hepsiSifir);
kontrol("düzeltme: hepsi 0 iken kaliteli stok metin birincisini GEÇEMEZ",
  hepsiSifir[0].ad === "arşiv",
  `birinci: ${hepsiSifir[0].ad} — kadraj alakayı ezmemeli`);

const dogruAltta = [
  { ad: "mezar", score: 168, onGorsel: 0, onKalite: 3 },
  { ad: "ev", score: 126, onGorsel: 0, onKalite: 2 },
  { ad: "yüzü", score: 124, onGorsel: 3, onKalite: 1 },
];
const degisti = gorselDuzeltmesiUygula(dogruAltta);
kontrol("düzeltme: gerçekten doğru olan görsel başa çıkar",
  dogruAltta[0].ad === "yüzü" && degisti === true,
  `sıra: ${dogruAltta.map((c) => c.ad).join(" > ")}`);

const denetlenmemis = [
  { ad: "bakılmadı", score: 150 },
  { ad: "alakasız", score: 140, onGorsel: 0, onKalite: 3 },
];
gorselDuzeltmesiUygula(denetlenmemis);
kontrol("düzeltme: indirilemeyen aday cezalandırılmaz, yerinde kalır",
  denetlenmemis[0].ad === "bakılmadı" && denetlenmemis[0].gorselDuzeltme === undefined);

const hicbiriBakilmadi = [{ ad: "a", score: 10 }, { ad: "b", score: 5 }];
kontrol("düzeltme: hiç puan yoksa sıraya dokunulmaz",
  gorselDuzeltmesiUygula(hicbiriBakilmadi) === false && hicbiriBakilmadi[0].ad === "a");

// Kalite yalnızca ince ayar: 5 puanlık fark alakanın 30 puanını çeviremez.
const kaliteEzmesin = [
  { ad: "alakasız-güzel", score: 100, onGorsel: 0, onKalite: 3 },
  { ad: "alakalı-vasat", score: 100, onGorsel: 2, onKalite: 1 },
];
gorselDuzeltmesiUygula(kaliteEzmesin);
kontrol("düzeltme: kadraj (±5) alakayı (±60) ezemez",
  kaliteEzmesin[0].ad === "alakalı-vasat");

// ------------------------------------------------------------ STOK KÜMESİ
kontrol("stok kümesi: üç stok sitesi de tanınır",
  ["pixabay", "pexels", "unsplash"].every((p) => STOK_SAGLAYICI.has(p)));
kontrol("stok kümesi: arşiv kaynakları stok sayılmaz",
  !["wikipedia", "wikimedia", "nasa", "europeana", "openverse"].some((p) => STOK_SAGLAYICI.has(p)));

// ------------------------------------------------- AYNI FOTOĞRAF TEKRARI
// Ölçülen regresyon (20260809-dee3fd): Baba Vanga'nın tek fotoğrafı DÖRT
// sahnede birden çıktı, üçü arka arkaya. Sebep: adayId içinde adayın LİSTE
// SIRASI var; aynı dosya başka sorgudan gelince "wikipedia-4-70861" yerine
// "wikipedia-0-70861" oluyor ve tekrar koruması iki ayrı görsel sanıyor.
const md = fs.readFileSync(new URL("../src/pipeline/media.js", import.meta.url), "utf8");
const ap = fs.readFileSync(new URL("../src/pipeline/arkaplan.js", import.meta.url), "utf8");
// Üç indirme yolu var: normal seçim, yedek tur, yeni açı. Üçü de kaynak
// kimliğini yazmalı; biri unutulursa o yoldan gelen görsel tekrar korumasına
// görünmez olur.
const kaynakSayisi = (md.match(/kaynakId: ailekimligi\(c\.url\)/g) || []).length;
kontrol("kaynak kimligi UC indirme yolunun hepsinde yaziliyor",
  kaynakSayisi === 3, `bulunan: ${kaynakSayisi}/3 (secim + yedek + yeni aci)`);
kontrol("tekrar korumasi kaynak kimligini ONCE kullaniyor",
  /m\?\.kaynakId \|\| m\?\.adayId/.test(ap));
kontrol("ayni dosya farkli sirayla ayni kimligi verir",
  ailekimligi("https://upload.wikimedia.org/wikipedia/en/f/fc/Baba_Vanga.jpg") ===
  ailekimligi("https://upload.wikimedia.org/wikipedia/en/f/fc/Baba_Vanga.jpg?utm_source=x"));

// Kucuk gorsel isareti YEDEK yoldan da tasinmali; tasinmazsa perdelenmiyor
// ve ham 220 piksel tam ekrana geriliyor (olculdu: model "bulanik" dedi).
const kucukSayisi = (md.match(/kucuk: !!c\.kucuk/g) || []).length;
kontrol("kucuk isareti yedek indirmede de tasiniyor",
  kucukSayisi === 3, `bulunan: ${kucukSayisi}/3`);

// ------------------------------- SEÇİM EKRANINDA GÖRSEL GÖRÜNÜYOR MU
// Kullanıcının şikâyeti: "stüdyoda seçilen görseller gösterilmiyor."
// Ölçüldü: Openverse'ün `thumbnail` alanı bir API ucu
// (api.openverse.org/v1/images/{id}/thumb) ve kaynak siteye vekillik ediyor;
// WIKIMEDIA barındırmalı görsellerde HTTP 424 dönüyor (3 örnekten 2'si).
// Openverse'ün en büyük kaynağı Wikimedia olduğu için seçim ekranındaki
// görsellerin çoğu boş çıkıyordu. Doğrudan dosya adresi 3/3 çalıştı.
kontrol("openverse küçük resmi API ucu DEĞİL, doğrudan dosya",
  md.includes("thumb: r.url,") && !md.includes("thumb: r.thumbnail || r.url"),
  "API ucu Wikimedia kaynaklı görsellerde 424 dönüyor");

// Seçim ekranında 60 aday yan yana diziliyor; wikimedia'nın tam boy sürümü
// 579 KB ölçüldü — o ekran 35 MB indirme demek. Küçük sürüm türetiliyor.
kontrol("wikimedia seçim ekranı için küçük sürüm türetiyor",
  md.includes('kaynak.replace(/\\/\\d+px-/, "/480px-")'));
kontrol("küçük sürüm yalnızca thumb'a gidiyor, indirilen dosya büyük kalıyor",
  md.includes("url: kaynak,") && md.includes("thumb: kucukResim,"),
  "render kalitesi düşmemeli");

// ------------------------- BOZUK MEDYANIN SEBEBİ KAYDA GEÇSİN
// Ölçülen vaka (20260810-210a05): 63 kesmenin 4'ü "medyası kullanılamadı"
// deyip düz karta düştü. Sebep hiçbir yerde yazmıyordu — ffmpeg hatası
// yutuluyordu. Üstelik medya klasörü render sonrası siliniyor, yani sonradan
// da bakılamıyor. Sebep yazılmazsa bu sınıf hata hiç teşhis edilemez.
const rd2 = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
kontrol("bozuk medyada ffmpeg hatasının SEBEBİ kayda geçiyor",
  rd2.includes("sebep: ") && rd2.includes("String(e.message).replace"));
kontrol("hangi sağlayıcı ve hangi dosya olduğu yazılıyor",
  rd2.includes("b.media?.provider") && rd2.includes("path.basename(b.media.file)"));
kontrol("tek bozuk medya videoyu hâlâ düşürmüyor",
  rd2.includes("await renderBeatClip({ ...args, media: null, punch: false });"),
  "kart yedeği korunmalı");

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
