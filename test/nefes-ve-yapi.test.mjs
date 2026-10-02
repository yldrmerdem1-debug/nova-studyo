// TEMPO, EKRANDAKİ RAKAM VE BÖLÜM BAŞLIĞI.
//
// Üçü de bitmiş bir videonun izlenmesinden çıktı (20260814-a46ab2) ve üçü de
// ÖLÇÜLDÜ:
//
//  1) TEMPO — 1856 kelime / 12 dk = 155 kelime/dakika ve 35 segmentin 35'i
//     arasında AYNI 0,12 sn boşluk. Metinde tek duraklama işareti yok
//     ('...' 0, '<break>' 0). "Haber bülteni gibi aralıksız" şikâyeti buradan.
//
//  2) EKRANDA RAKAM — çarpıcı rakam geçen 19 segmentin yalnızca 6'sında grafik
//     vardı (%32). "413.000 metreküp", "495 ton", "+99 dB" okunurken ekranda
//     stok video dönüyordu. Sebep istemdeki TEK sınırın ÜST sınır olmasıydı:
//     "en fazla yarısında grafik olsun" — alt sınır yoktu.
//
//  3) BÖLÜM BAŞLIĞI — beş bölümün beşi de "Bölüm 1..5" kaldı. Video
//     İNGİLİZCEYDİ. Kartın işi izleyiciyi bir sonraki aşamaya odaklamak;
//     numara bunu yapmaz. Aynı adlar YouTube chapter damgalarına da yazılıyor.
import fs from "node:fs";
import assert from "node:assert";
import { nefesPayi } from "../src/pipeline/render.js";
import { anlamliBolumBasligi, bolumBasligiTuret, bolumBasliklariniBildir } from "../src/pipeline/script.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------------------------------------------------------------------------
// 1) NEFES PAYI YAPISAL
// ---------------------------------------------------------------------------
{
  const olagan = nefesPayi({ text: "Sıradan bir cümle." });
  const bolum = nefesPayi({ lastOfSection: true, text: "Bölüm bitti." });
  const rakam = nefesPayi({ emphasis: { type: "stat" }, text: "413.000 metreküp." });
  const kiyas = nefesPayi({ emphasis: { type: "compare" }, text: "İkisi kıyaslanıyor." });
  const soru = nefesPayi({ text: "Peki ya sonra?" });

  kontrol("olağan segment kısa", olagan === 0.12, String(olagan));
  kontrol("bölüm sonu en uzun", bolum > rakam && bolum > soru, String(bolum));
  kontrol("rakamdan sonra nefes var", rakam > olagan, String(rakam));
  kontrol("karşılaştırma da rakam sayılıyor", kiyas === rakam);
  kontrol("soru sonrası nefes var", soru > olagan, String(soru));
  kontrol("dört farklı değer üretiliyor",
    new Set([olagan, bolum, rakam, soru]).size === 4);

  // Bölüm sonu her şeyi ezmeli: kart geliyor.
  kontrol("bölüm sonu rakamı da eziyor",
    nefesPayi({ lastOfSection: true, emphasis: { type: "stat" } }) === bolum,
    "kart gelecekse en uzun boşluk odur");

  // SÜREYİ BOZMAMALI. 12 dakikalık gerçek bir işin şekli: 35 segment,
  // 5 bölüm sonu, ~8 rakamlı. Ek yük birkaç saniyeyi geçmemeli.
  let ek = 0;
  for (let i = 0; i < 35; i++) {
    const bolumSonu = (i + 1) % 7 === 0;
    const rakamli = !bolumSonu && i % 4 === 0;
    ek += nefesPayi({ lastOfSection: bolumSonu, emphasis: rakamli ? { type: "stat" } : null }) - 0.12;
  }
  kontrol("12 dk'lık işe eklenen toplam süre makul", ek > 1 && ek < 8, ek.toFixed(2) + " sn");

  // Bozulmaya karşı
  kontrol("boş segment çökertmiyor", nefesPayi(null) === 0.12 && nefesPayi({}) === 0.12);
  kontrol("metin yoksa çökertmiyor", nefesPayi({ emphasis: null }) === 0.12);
}

// ---------------------------------------------------------------------------
// 2) METNE DOKUNULMUYOR — bu bilinçli bir karar
// ---------------------------------------------------------------------------
// Metne "..." ya da <break> eklemek üç yeni sorun doğururdu: Edge tarafında
// etiket XML kaçışına takılıp SESLİ OKUNUR (bu hata bir kez yapıldı), altyazı
// metni sesle ayrışır, süre tahmini bozulur. Boşluk MONTAJDA veriliyor.
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  const v = fs.readFileSync(new URL("../src/pipeline/voice.js", import.meta.url), "utf8");
  kontrol("nefes montajda veriliyor", /dur: t\.duration \+ nefesPayi\(/.test(r));
  kontrol("sabit GAP artık tek başına kullanılmıyor",
    !/dur: t\.duration \+ GAP,/.test(r.replace(/isCollage[\s\S]*?\} else/, "")),
    "bölümlü akışta sabit boşluk kalmamalı");
  kontrol("seslendirme metnine break etiketi eklenmiyor",
    !/<break/.test(v), "Edge XML kaçışında etiketi sesli okur");
  kontrol("XML kaçışı hâlâ yerinde", /xmlKacir/.test(v));
}

// ---------------------------------------------------------------------------
// 3) EKRANDA RAKAM — alt sınır geldi
// ---------------------------------------------------------------------------
{
  const s = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  kontrol("rakam geçen her segmentte grafik zorunlu",
    /ZORUNLU: metinde çarpıcı bir SAYI geçen HER segmentte type="stat" olsun/.test(s));
  kontrol("çarpıcı sayının ne olduğu tanımlı",
    /Çarpıcı sayı = büyük miktar, oran, tarih aralığı, ölçüm ya da para tutarı/.test(s));
  // Yorumları at: kusurun tarihi yorumda GEÇMELİ, kuralın kendisi geçmemeli.
  // (Ayrıca kolaj kipinde beat başına ayrı bir "en fazla yarısı" kuralı var —
  //  o farklı bir alan, ona dokunulmadı.)
  const kodsuz = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  kontrol("eski ÜST sınır kalktı",
    !/en fazla yarısında grafik olsun/.test(kodsuz),
    "üst sınır modeli 'az kullan' diye yönlendiriyordu — ölçüldü: %32");
  kontrol("kusurun tarihi yorumda korunuyor",
    /en fazla yarısında grafik olsun"du/.test(s),
    "neden kaldırıldığı yazılmazsa bir sonraki tahminle geri gelir");
  kontrol("uydurma yasağı duruyor",
    /GERÇEKTEN geçen bir sayı\/ifade/.test(s) && /UYDURMA/.test(s),
    "alt sınır koyarken model sayı uydurmaya başlamamalı");
  kontrol("aynı sayının tekrarı engelleniyor",
    /Aynı sayıyı iki segmentte tekrar ekrana basma/.test(s));
}

// ---------------------------------------------------------------------------
// 4) BÖLÜM BAŞLIĞI
// ---------------------------------------------------------------------------
{
  kontrol("Türkçe yer tutucu tanınıyor", !anlamliBolumBasligi("Bölüm 1"));
  kontrol("İngilizce yer tutucu tanınıyor",
    !anlamliBolumBasligi("Part 2") && !anlamliBolumBasligi("Chapter 3") &&
    !anlamliBolumBasligi("Section 4"));
  kontrol("boşluklu/küçük harfli yer tutucu da tanınıyor",
    !anlamliBolumBasligi("  bolum 5  ") && !anlamliBolumBasligi("kısım 2"));
  kontrol("gerçek başlık geçiyor",
    anlamliBolumBasligi("Gazın Anatomisi") && anlamliBolumBasligi("The Man Who Never Gave His DNA"));
  kontrol("sayı İÇEREN gerçek başlık elenmiyor",
    anlamliBolumBasligi("From $3 Billion to $200"),
    "yalnızca 'Bölüm N' kalıbı yer tutucudur, içinde sayı geçen başlık değil");
  kontrol("boş başlık anlamsız", !anlamliBolumBasligi("") && !anlamliBolumBasligi(null));

  // Türetme: numara yerine bölümün kendi içeriğinden
  const t = bolumBasligiTuret({ goal: "Gazın kimyasal bileşimini anlat. Sonra ölçek." }, 0, { language: "tr" });
  kontrol("başlık bölümün amacından türetiliyor", /Gazın kimyasal/.test(t), t);
  kontrol("türetilen başlık kısa", t.split(/\s+/).length <= 5, t);
  kontrol("covers alanından da türetiliyor",
    /Hindenburg/.test(bolumBasligiTuret({ covers: ["Hindenburg 1937 kazası"] }, 1, {})));
  kontrol("hiçbir şey yoksa VİDEONUN DİLİNDE numaraya düşüyor",
    bolumBasligiTuret({}, 2, { language: "en" }) === "Part 3" &&
    bolumBasligiTuret({}, 2, { language: "tr" }) === "Bölüm 3",
    "İngilizce videoda 'Bölüm 3' yazıyordu — asıl kusur buydu");

  // Raporlama
  const satir = [];
  const oran = bolumBasliklariniBildir({ sections: [
    { title: "Bölüm 1" }, { title: "Gazın Anatomisi" }, { title: "Part 3" },
  ] }, (m) => satir.push(m));
  kontrol("yer tutucu oranı doğru", Math.abs(oran - 1 / 3) < 0.01, String(oran));
  kontrol("kullanıcı uyarılıyor", satir.some((m) => /DİKKAT.*yer tutucu/.test(m)));
  const temiz = [];
  bolumBasliklariniBildir({ sections: [{ title: "Gazın Anatomisi" }] }, (m) => temiz.push(m));
  kontrol("iyi başlıkta gereksiz uyarı yok", temiz.length === 0);
  kontrol("bölüm yoksa çökertmiyor", bolumBasliklariniBildir({}) === null);

  const s = fs.readFileSync(new URL("../src/pipeline/script.js", import.meta.url), "utf8");
  kontrol("istem de numara yasaklıyor",
    /"Bölüm 1", "Part 2", "Giriş" gibi/.test(s) && /numara ya da genel etiket YAZMA/.test(s));
  kontrol("rapor senaryo bitince çağrılıyor", /bolumBasliklariniBildir\(script, logFn\)/.test(s));
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
