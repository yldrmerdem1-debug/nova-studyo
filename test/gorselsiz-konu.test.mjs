// ARŞİVDE KARŞILIĞI OLMAYAN KONULAR.
//
// Tetikleyen gerçek vaka: Baba Vanga. 1996'da öldü, fotoğrafları hâlâ telifli;
// serbest lisanslı yüzü YOK. Ölçüldü (canlı arama):
//
//   sorgu                                  aday  kurum  en iyi kurum alakası
//   Bulgarian mystic blind woman 1970s      31     17        0,183   <- umutsuz
//   Baba Vanga portrait photograph          21     17        0,203   <- umutsuz
//   Baba Vanga house Rupite                 21     17        0,457   <- çalışıyor
//   Rupite Bulgaria village                 32     17        0,463   <- çalışıyor
//   volcanic eruption lava                  24     16        1,000
//   Leidenfrost portrait                    27     25        1,000
//
// Sayıca bol görünüyor ama umutsuz sorgularda gelenlerin hepsi alakasız stok
// (gözü bağlı modeller, sisli kadın). Eski kapı "aday sayısı azsa" diye
// baktığı için hiç devreye girmiyordu — ölçüt NİCELİK değil ALAKA olmalı.
//
// Oysa Vanga'nın DÜNYASI serbest lisansla arşivde duruyor:
//   Vanga's-House-Rupite.JPG · Vanga's-Grave-Rupite.JPG · Rupite Temple.JPG
//   Gr Petrich kushtata na baba Vanga v grada.jpg · Petrich-village...jpg (kamu malı)
//
// Üç katmanlı çözüm bu testte kilitleniyor:
//   1) senaryo her görsel için 2 VEKİL sorgu yazar (başka açı)
//   2) o da tutmazsa modele YENİ AÇI sorulur (havuz değişir, sıra değil)
//   3) yine de bulunamazsa sahne düz zemin değil TİPOGRAFİ olur
import fs from "node:fs";
import { metinPerdesi, splitTwo, ftext } from "../src/pipeline/graphics.js";
import { europeanaLisans } from "../src/pipeline/media.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};
const oku = (f) => fs.readFileSync(new URL("../src/pipeline/" + f, import.meta.url), "utf8");
const md = oku("media.js"), sc = oku("script.js"), ix = oku("index.js"), rn = oku("render.js");

// ---------- 1. Yeni kaynaklar ----------
kontrol("NASA arama bagli", /async function searchNasa\(/.test(md));
// Çağrılar artık kor() ile sarmalanıyor: kaynak çökerse boş dönüyor AMA
// sayılıyor. Eskiden sessizce yutuluyordu — Wikimedia bir işin ortasında hız
// sınırına takılsa (ölçüldü: ard arda ~13 sorgudan sonra istekler reddediliyor)
// video sebebi görünmeden stok fotoğrafa düşüyordu.
kontrol("NASA anahtarsiz cagriliyor (her zaman)",
  md.includes('kor("nasa", searchNasa(query))'));
kontrol("kaynak cokmesi SESSIZ degil, sayiliyor",
  md.includes("saglayiciHata[ad] = (saglayiciHata[ad] || 0) + 1"));
kontrol("cokme kullaniciya UYARI olarak bildiriliyor",
  md.includes("sorguda yanıt vermedi"));
kontrol("sayac her iste sifirlaniyor",
  md.includes("for (const k of Object.keys(saglayiciHata)) delete saglayiciHata[k];"));
kontrol("Europeana arama bagli", /async function searchEuropeana\(/.test(md));
kontrol("Europeana yalnizca anahtar varsa",
  md.includes('if (st.europeanaKey) tasks.push(kor("europeana", searchEuropeana(query, st.europeanaKey)));'));
// Ölçüldü: süzgeçsiz 20 sonucun 17'si kullanılamaz (12 InC-EDU, 4 InC, 1 BY-NC-SA).
kontrol("Europeana'da reusability=open ZORUNLU (parametre degil)",
  /reusability=open/.test(md) && !/reusability=\$\{/.test(md));
// Kümenin TAM METNİ değil ÜYELİĞİ sınanır: yeni bir kurum kaynağı eklendiğinde
// (ör. wikipedia) testin kırılmasının bir anlamı yok.
const guvenilirKume = (md.match(/GUVENILIR_SAGLAYICI = new Set\(\[([^\]]*)\]\)/) || [])[1] || "";
kontrol("kurum kaynaklari guvenilir sayiliyor",
  ["wikimedia", "openverse", "nasa", "europeana"].every((p) => guvenilirKume.includes(`"${p}"`)),
  guvenilirKume);

// Hak URI'si künyenin anladığı etikete çevriliyor (kunye.js regexleri).
kontrol("CC0 tanınıyor", europeanaLisans("http://creativecommons.org/publicdomain/zero/1.0/") === "CC0");
kontrol("PDM tanınıyor", europeanaLisans("http://creativecommons.org/publicdomain/mark/1.0/") === "PDM");
kontrol("CC BY 4.0 tanınıyor",
  europeanaLisans("http://creativecommons.org/licenses/by/4.0/") === "CC BY 4.0");
kontrol("BY-SA surumuyle tanınıyor",
  europeanaLisans("http://creativecommons.org/licenses/by-sa/3.0/") === "CC BY-SA 3.0");
// NC/ND süzgeci bunları görüp elemeli — boş string dönerse göremez.
kontrol("NC etiketi KAYBOLMUYOR (suzgec gorebilsin)",
  /NC/.test(europeanaLisans("http://creativecommons.org/licenses/by-nc-sa/4.0/")));
kontrol("taninmayan hak beyani da tasiniyor",
  europeanaLisans("http://rightsstatements.org/vocab/InC-EDU/1.0/").length > 3);

// ---------- 2. Vekil sorgular ----------
kontrol("semada vekil alani var", /vekil: \{\s*\n\s*type: "array"/.test(sc));
kontrol("vekil zorunlu alan", /required: \["query", "type", "kind", "prompt", "vekil"\]/.test(sc));
kontrol("promptta BASKA ACI vurgulaniyor", /BAŞKA BİR AÇISI olmalı/.test(sc));
kontrol("promptta Vanga ornegi var", /Rupite Bulgaria village/.test(sc));
kontrol("vekil temizleniyor (asil sorguyla ayni olan atiliyor)",
  /toLowerCase\(\) !== String\(v\.query \|\| ""\)\.toLowerCase\(\)/.test(sc));

// KAPI: nicelik değil alaka. Ölçülen boşluk 0,203 - 0,457.
kontrol("vekil esigi olculen bosluga konmus", /const VEKIL_ESIGI = 0\.30/.test(md));
kontrol("kapi ALAKAYA bakiyor (aday sayisina degil)",
  /enIyiKurumAlaka\(liste, agirlik\) < VEKIL_ESIGI/.test(md));
kontrol("kapi yalnizca KURUM kaynaklarina bakiyor",
  /GUVENILIR_SAGLAYICI\.has\(c\.provider\) && !c\.vekil/.test(md));
kontrol("havuz buyuyunce nadirlik yeniden hesaplaniyor",
  /agirlik = nadirlikAgirligi\(v\.query, liste\);\s*\n\s*\}/.test(md));

// ---------- 3. Yeni açı (son çare) ----------
kontrol("yeniGorselAcilari tanimli", /export async function yeniGorselAcilari/.test(sc));
kontrol("TEK cagri ile soruluyor", /sorunlular\.slice\(0, 24\)/.test(sc));
kontrol("modele NE GELDIGI de veriliyor", /gelen görsel şuydu \(YANLIŞ\)/.test(sc));
kontrol("promptta esanlamli tekrar YASAK", /Aynı şeyi eşanlamlıyla tekrar SORMA/.test(sc));
kontrol("donen id dogrulaniyor", /if \(!gecerli\.has\(k\?\.id\)\) continue;/.test(sc));
kontrol("acilardanIndir yeni sorguyu BASTAN aratiyor",
  /const bulunan = await searchQuery\(q, b\.visual\.type/.test(md));
kontrol("kaydedilen sorgu YENI aci oluyor", /sorgu: q, anaSorgu: b\.visual\.query, vekil: true/.test(md));
kontrol("boru hattina bagli", /const yeni = await acilardanIndir\(job, script, acilar/.test(ix));
kontrol("yeni aci ancak GERCEKTEN iyiyse geciyor",
  /p\.puan >= ARKA_GORSEL_ESIGI && p\.kalite >= ARKA_KALITE_ESIGI/.test(ix));

// LİSANS SIZINTISI: yedek yoldan gelen görsel künyeden düşüyordu.
kontrol("yedek indirme lisansi TASIYOR",
  /lisans: c\.lisans \|\| "", sahip: c\.sahip \|\| "",/.test(md));
kontrol("yeni aci indirme de lisansi tasiyor",
  (md.match(/lisans: c\.lisans \|\| ""/g) || []).length >= 2);

// ---------- 4. Tipografi yedeği ----------
{
  const K = { w: 1920, h: 1080, k: 1 };
  const p = metinPerdesi("5079", "Vanga", 6.5, "0xE8B33A", "tr", K);
  kontrol("perde uretiliyor", p.length > 50);
  kontrol("perde filtre zinciri olarak baslar", p.startsWith(","));
  kontrol("aksan cizgisi var", /drawbox=/.test(p));
  kontrol("ust etiket var", /VANGA/.test(p));

  // Kadraja SIĞMA değişmezi. Asıl kural "punto küçülsün" değil, "taşmasın":
  // metin iki satıra bölündüğü için orta uzunlukta zaten 112 punto sığıyor,
  // küçültmek gereksiz olurdu. Sınanan şey her uzunlukta genişliğin
  // kullanılabilir alanı aşmaması.
  // Genişlik, kodun KENDİ geometrisiyle ölçülür: metin önce 64 karaktere
  // kırpılıyor ve satırlar eşit bölünmüyor, o yüzden "toplam uzunluk / satır"
  // gibi kaba bir tahmin yanıltıyor (ilk denememde sahte taşma raporladı).
  const sigiyorMu = (metin) => {
    const f = metinPerdesi(metin, "", 6.5, "0xE8B33A", "tr", K);
    const punto = Math.max(...[...f.matchAll(/fontsize=(\d+)/g)].map((m) => +m[1]));
    const satirlar = splitTwo(ftext(metin, 64), 26);
    const enUzun = Math.max(...satirlar.map((s) => s.length));
    return { punto, satirlar: satirlar.length, genislik: enUzun * punto * 0.54 };
  };
  for (const [ad, metin] of [
    ["kisa   ", "5079"],
    ["orta   ", "Bulgaristan'ın kör kadını"],
    ["uzun   ", "Bulgaristanın kör kadını efsanesi ve kehanetleri hakkinda"],
    ["cok uzun", "Rupite koyunde yasayan kor kadinin butun kehanetleri ve birakip gittigi miras uzerine"],
  ]) {
    const r = sigiyorMu(metin);
    kontrol(`${ad} metin kadraja sigiyor`, r.genislik <= K.w * 0.9,
      `punto ${r.punto} · ${r.satirlar} satir · ~${Math.round(r.genislik)}px / ${Math.round(K.w * 0.9)}px`);
    kontrol(`${ad} punto tabanin altina inmiyor`, r.punto >= 38, String(r.punto));
  }

  // Kısa sahnede bekleme negatife düşerse ffmpeg filtresi bozulur.
  const kisa = metinPerdesi("TEST", "", 1.6, "0xE8B33A", "tr", K);
  kontrol("kisa sahnede de gecerli filtre", kisa.length > 20 && !/-\d+\.\d\d\)\)\)/.test(kisa));

  kontrol("metinsiz cagri bos donuyor", metinPerdesi("", "x", 6, "0xE8B33A", "tr", K) === "");
}
kontrol("gorselsiz sahne tipografiye dusuyor",
  /\} else if \(!b\.media\?\.file\) \{/.test(rn) && /bindirme = metinPerdesi\(/.test(rn));
kontrol("tipografi grafik/kart sahnesini EZMIYOR",
  rn.indexOf("if (b.bindirmeVar) {") < rn.indexOf("} else if (!b.media?.file) {"));
kontrol("kac sahnenin gorselsiz kaldigi bildiriliyor",
  /sahnede arşiv görseli bulunamadı — düz zemin yerine tipografi/.test(rn));


// ---------- 5. SORGU ÖZEL AD TAŞIMALI ----------
// Ölçüldü (Baba Vanga videosu, 2026-08-09): 27 görsel sorgusunun 9'u jenerik
// metafordu ("vintage typewriter manuscript pages", "archive index cards
// drawer", "dust storm rural field"). Boru hattı bunları sadakatle buldu ve
// 27 sahnenin 12'si stok fotoğrafla doldu — izleyici anlatılan şeyi görmedi.
// Sorun aramada değil, sorgunun kendisindeydi.
{
  kontrol("promptta 'anlatilan seyi goster' kurali var",
    sc.includes("SORGULAR ANLATILAN ŞEYİN ADINI TAŞIMALI"));
  kontrol("ozel ad orani sart kosuluyor",
    sc.includes("EN AZ dörtte üçü özel ad"));
  for (const [yanlis, dogru] of [
    ["vintage typewriter manuscript pages", "Bulgarian Academy of Sciences building"],
    ["archive index cards drawer", "Suggestology Institute Sofia"],
    ["blind woman hands braille", "Zemun school for the blind 1920s"],
  ]) {
    kontrol(`olculen hata ornek olarak veriliyor: "${yanlis.slice(0, 28)}"`,
      sc.includes(yanlis) && sc.includes(dogru));
  }
  kontrol("jenerik kacisa izin verilmiyor", sc.includes("jenerik resmine kaçma"));
}

console.log(hata === 0 ? "\nGORSELSIZ KONU TESTLERI GECTI (2)" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
