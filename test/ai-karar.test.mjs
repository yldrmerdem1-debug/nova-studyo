// "Gerektiğinde AI" karar katmanı testi — hangi kesme neden AI'ya terfi ediyor.
import { stockGaps, promoteGapsToAi, flattenBeats } from "../src/pipeline/media.js";

function senaryo() {
  const mk = (q, tip) => ({ query: q, type: tip, kind: "generic", prompt: "" });
  return {
    title: "Test",
    sections: [{
      title: "Bölüm 1",
      segments: [
        { text: "Piramitler dört bin yıldır ayakta.", visuals: [mk("egyptian pyramids", "video"), mk("desert sand", "image")] },
        { text: "İnşaatı nasıl yaptıkları hâlâ tartışmalı.", visuals: [mk("ancient construction ramp theory", "video")] },
        { text: "Firavun mezar odasında bulundu.", visuals: [mk("pharaoh burial chamber interior", "video")] },
        { text: "Bugün milyonlarca turist geliyor.", visuals: [mk("tourists giza", "image")] },
      ],
    }],
  };
}

// Aday havuzu: bazı sorgular zengin, bazıları boş, biri yanlış tür
const candidates = {
  "egyptian pyramids||video": [{ url: "u1", type: "video", score: 103 }, { url: "u2", type: "video", score: 88 }],
  "desert sand||image": [{ url: "u3", type: "image", score: 91 }],
  "ancient construction ramp theory||video": [],                       // hiç sonuç yok
  "pharaoh burial chamber interior||video": [{ url: "u4", type: "image", score: 70 }], // yanlış tür, orta puan
  "tourists giza||image": [{ url: "u5", type: "image", score: 44 }],    // zayıf eşleşme
};

// Yanlış tür AMA yüksek puan: video istendi, mükemmel fotoğraf geldi → AI'ya gerek yok
const candidatesIyiFoto = {
  ...candidates,
  "pharaoh burial chamber interior||video": [{ url: "u4", type: "image", score: 96 }],
};

let hata = 0;
const esit = (ad, a, b) => {
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) { hata++; console.log(`HATA ${ad}\n  beklenen: ${JSON.stringify(b)}\n  gelen   : ${JSON.stringify(a)}`); }
  else console.log(`OK   ${ad}`);
};

// --- 1. boşluk tespiti sırası ---
const bosluk = stockGaps(senaryo(), candidates);
esit("boşluklar kötüden iyiye sıralı",
  bosluk.map((x) => [x.beat.visual.query, x.sebep]),
  [
    ["ancient construction ramp theory", "arşivde sonuç yok"],
    ["tourists giza", "zayıf eşleşme (44)"],
    ["pharaoh burial chamber interior", "video bulunamadı"],
  ]);
esit("güçlü eşleşmeler boşluk sayılmıyor",
  bosluk.some((x) => ["egyptian pyramids", "desert sand"].includes(x.beat.visual.query)), false);
esit("yanlış tür ama iyi görsel → AI'ya gitmiyor",
  stockGaps(senaryo(), candidatesIyiFoto).some((x) => x.beat.visual.query === "pharaoh burial chamber interior"),
  false);

// --- 2. bütçe sınırı ---
const s2 = senaryo();
const loglar = [];
const n = promoteGapsToAi(s2, candidates, 2, (m) => loglar.push(m));
esit("bütçe 2 → 2 terfi", n, 2);
const terfi = flattenBeats(s2).filter((b) => b.visual.aiFill);
esit("terfi edenler en kötü ikisi", terfi.map((b) => b.visual.query),
  ["ancient construction ramp theory", "tourists giza"]);
esit("tür DEĞİŞMEDİ (stok yedeği açık kalsın)", terfi.map((b) => b.visual.type), ["video", "image"]);
// İSTEM ANLATILAN CÜMLEDEN KURULUYOR — arama sorgusundan değil.
//
// Eskiden burada `"<sorgu>. Context: <cümle>"` biçimi aranıyordu. O biçim
// ölçülerek elendi: arama sorgusu başta durunca görsel modeli onu KONU sanıp
// sembol üretiyordu (AI %8 tam isabet — sistemdeki en kötü kaynak).
// Kontrol artık biçimi değil NİYETİ kilitliyor: cümle sorgudan ÖNCE gelmeli.
{
  const p = terfi[0].visual.prompt;
  esit("cümle isteme giriyor", p.includes("İnşaatı nasıl"), true);
  esit("cümle arama sorgusundan ÖNCE geliyor",
    p.indexOf("İnşaatı nasıl") < p.indexOf("ancient construction ramp theory"), true);
  esit("yazı/logo yasağı istemde", /no text/i.test(p) && /no logos/i.test(p), true);
  // Anlatılan cümle saklanıyor mu — modele yazdırılacak asıl malzeme bu.
  esit("anlatılan cümle beat'te saklanıyor", terfi[0].visual.aiCumle.includes("İnşaatı nasıl"), true);
}

// --- 3. bütçe 0 ---
const s3 = senaryo();
esit("bütçe 0 → hiç terfi", promoteGapsToAi(s3, candidates, 0, () => {}), 0);

// --- 4. arşiv her şeyi karşılıyorsa ---
const zengin = Object.fromEntries(Object.keys(candidates).map((k) => [k,
  [{ url: "x", type: k.split("||")[1], score: 95 }]]));
const s4 = senaryo();
const log4 = [];
esit("arşiv yeterse harcama yok", promoteGapsToAi(s4, zengin, 5, (m) => log4.push(m)), 0);
esit("kullanıcıya bildiriliyor", log4[0].includes("AI'ya gerek kalmadı"), true);

// --- 5. bütçe boşluktan fazlaysa taşmıyor ---
const s5 = senaryo();
esit("bütçe 10, boşluk 3 → 3", promoteGapsToAi(s5, candidates, 10, () => {}), 3);

// ---------- Çapaya bağlı kare: STİL kilidi, İÇERİK kilidi degil ----------
// Olculdu (gercek uretim, 2 kare): duz `${concept}. ${suffix}` promptuyla
// "uzayda skafandersiz astronot" istendi, capadaki KAFA KESITININ varyanti geldi.
// Sebep: capa image-to-image girdisi olarak veriliyor ve model bunu DUZENLEME
// isi sayiyor. 87 sahnelik bir iste her sahne ilk sahneye benzerdi.
{
  const { keyframePrompt, keyframeI2IPrompt, AI_STYLES } = await import("../src/pipeline/collage.js");
  const konu = "an astronaut floating in the vacuum of space";
  const p = keyframeI2IPrompt(konu, AI_STYLES.sinematik);

  esit("i2i promptu konuyu tasiyor", p.includes(konu), true);
  esit("referansin SADECE stil oldugu soyleniyor", /STYLE REFERENCE ONLY/i.test(p), true);
  esit("konuyu/kompozisyonu kopyalama uyarisi var", /Do NOT copy its subject/i.test(p), true);
  esit("yeni goruntu istendigi acikca yaziyor", /COMPLETELY NEW image/i.test(p), true);
  esit("stil eki korunuyor", p.includes("Photorealistic cinematic"), true);
  // Duz prompt ile i2i promptu AYNI OLMAMALI — ayni olursa duzeltme geri alinmis demektir.
  esit("i2i promptu duz prompttan farkli", keyframePrompt(konu, AI_STYLES.sinematik) !== p, true);

  const kaynak = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/collage.js", import.meta.url), "utf8"));
  esit("uretim hatti i2i promptunu kullaniyor",
    /prov\.imageToImage\(keyframeI2IPrompt\(/.test(kaynak), true);
}

console.log(hata === 0 ? "\nTUM TESTLER GECTI" : `\n${hata} TEST BASARISIZ`);
process.exit(hata ? 1 : 0);
