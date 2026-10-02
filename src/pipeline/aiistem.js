// AI GÖRSEL İSTEMİ — arama sorgusundan değil, ANLATILAN CÜMLEDEN sahne yaz.
//
// ÖLÇÜLEN KUSUR (20260815-07e514, 104 görsel):
// AI, sistemdeki EN KÖTÜ kaynaktı — %8 tam isabet, %69 alakalı. Karşılaştırma:
//
//   pexels    %91 alakalı / %55 tam isabet
//   openverse %83 / %50
//   pixabay   %80 / %33
//   AI        %69 / %8     <-- en zor sahneleri en kötü araç yapıyordu
//
// Sebep istemin kuruluşuydu (media.js): "<arama sorgusu>. Context: <cümlenin
// ilk 160 harfi>". Arama sorgusu ARŞİVDE TARAMAK için yazılmış kısa bir anahtar
// kelime öbeği ("skyscraper business district"); görsel modeli onu KONU sanıp
// cümleyi arka plan bilgisi sayıyor. Çıkan kareler ölçüldü:
//
//   istenen: gizlilik ihlali anlatılıyor  -> gelen: "SECURE LOGIN PORTAL"
//                                            yazılı monitör            (puan 1)
//   istenen: çözülmemiş cinayet dosyası   -> gelen: "UNSOLVED" damgalı
//                                            klasör yığını             (puan 1)
//   istenen: üniversite araştırması       -> gelen: mezuniyet töreninde
//                                            cap-gown giymiş öğrenci   (puan 0)
//
// Üçü de aynı hata: SEMBOL üretiyor, SAHNE üretmiyor. Üstelik ikisinde kareye
// yazı basılmış — görsel modelleri harfleri bozuk çiziyor ve denetim zaten
// "ekran görüntüsü / ürün fotoğrafı en fazla 1" diyor.
//
// ÇÖZÜM: istemi, görselin sonradan YARGILANACAĞI ölçüte göre yaz. Denetim
// "o an söylenen cümleyi gösteriyor mu" diye soruyor; o hâlde üretim istemi de
// o cümleden kurulmalı, sorgu yalnızca ipucu olmalı. Aynı ölçüt, iki uçta.
import { callJSON } from "../llm.js";

const SEMA = {
  type: "object",
  properties: {
    sahneler: {
      type: "array",
      items: {
        type: "object",
        properties: {
          no: { type: "integer", description: "Sahnenin sıra numarası (1'den başlar)" },
          sahne: { type: "string", description: "İngilizce, 25-45 kelimelik fiziksel sahne tarifi" },
        },
        required: ["no", "sahne"],
      },
    },
  },
  required: ["sahneler"],
};

const SISTEM = `You are a documentary photo director. For each scene you are given
the SENTENCE that is spoken in the voiceover at that moment, and the archive search
query that failed to find a photograph for it.

Write ONE photographic scene that a viewer would accept as an honest illustration of
that spoken sentence.

THE SENTENCE IS THE BRIEF. The search query is only a hint about the subject — it was
written to scan a stock archive, not to describe a picture. Never let the query become
the subject of your scene.

WRITE WHAT A CAMERA WOULD SEE. Physical subject, setting, era, action, light. No ideas,
no symbols, no metaphors.

HARD RULES — every one of these comes from a rejected image:
- NO text, letters, signage, labels, screens with words, logos or brand marks anywhere
  in the frame. (A generated monitor reading "SECURE LOGIN PORTAL" was rejected; image
  models render letters as garbage and the review penalises screenshots.)
- NO symbolic stand-ins. A folder stamped "UNSOLVED" is not a cold case. A lightbulb is
  not innovation. A handshake is not a contract. Show the real thing or the real place.
- NO stock-photo clichés: posed business people, generic smiling models, isolated
  product shots on white, exhibition vitrines.
- NO scene that merely shares a WORD with the sentence. A graduation ceremony is not
  university research.
- If the sentence names a company, product or institution you cannot depict truthfully,
  describe the ORDINARY REAL-WORLD OBJECT OR PLACE it stands for. "Illumina NovaSeq X"
  becomes a modern gene-sequencing instrument on a laboratory bench, not a logo.
- People may appear, but describe them by what they are doing, not by emotion.

If an AVOID line is given, the previous attempt produced exactly that and it was
rejected. Describe a clearly DIFFERENT and more literal scene — do not vary the
wording of the same idea.

25-45 words each, English, present tense, one sentence or two.`;

/** İstemi sinematik yönergeye sarmadan önceki uzunluk sınırı (aivideo.js 420'de kesiyor). */
const EN_COK_HARF = 400;

/**
 * ARAMA SORGUSUNDAN İSTEM ÜRETME — model çağrısı yapılamadığında son çare.
 *
 * Modelli yola göre belirgin biçimde kötü, ama ESKİ davranıştan iyi: cümle
 * başa alınıyor, sorgu arkada ipucu kalıyor ve yazı/logo yasağı ekleniyor.
 * Böylece çağrı patlasa bile "SECURE LOGIN PORTAL" sınıfı kare üretilmez.
 */
export function kuralliIstem(cumle, sorgu) {
  const c = String(cumle || "").replace(/\s+/g, " ").trim();
  const s = String(sorgu || "").replace(/\s+/g, " ").trim();
  if (!c) return s;
  const govde = `A real photographic scene showing: ${c}` + (s ? ` (subject: ${s})` : "");
  return (govde + ". No text, no signage, no logos, no screens with words.").slice(0, EN_COK_HARF);
}

/**
 * MODEL YANITINI HOŞGÖRÜLÜ OKU.
 *
 * Bu hesapta yapılandırılmış çıktı UYGULANMIYOR: model hem sarmalayıcı adını
 * hem iç alan adlarını değiştirebiliyor, bazen çıplak dizi döndürüyor
 * (gorseldenetim.js'te ölçüldü — 23 görselin 23'ü de kaybolmuştu).
 * Ayrı ve saf tutuluyor ki ağa çıkmadan test edilebilsin.
 *
 * @returns { [id]: istem } — yalnızca GEÇERLİ olanlar; gerisi çağırana kalır
 */
export function yanitiOku(yanit, liste) {
  const kayitlar = Array.isArray(yanit)
    ? yanit
    : (yanit?.sahneler || yanit?.scenes || yanit?.sonuclar || yanit?.results || []);
  const out = {};
  if (!Array.isArray(kayitlar)) return out;
  kayitlar.forEach((k, sira) => {
    const hedef = liste[Number.isFinite(k?.no) ? k.no - 1 : sira];
    const metin = String(k?.sahne || k?.scene || k?.prompt || k?.text || "").replace(/\s+/g, " ").trim();
    // Tek kelimelik ya da boş yanıt kurallı istemden kötüdür — kabul etme.
    if (hedef && metin.length >= 25) out[hedef.id] = metin.slice(0, EN_COK_HARF);
  });
  return out;
}

/**
 * Anlatılan cümlelerden görsel üretim istemleri yazdırır.
 *
 * @param istekler [{ id, cumle, sorgu, kacin? }]
 *        kacin: önceki denemede üretilen görselin denetimdeki "gorunen" tarifi.
 *        Verilirse model AYNI fikri tekrar yazmaz — ikinci tur için.
 * @returns { [id]: istem }  — çağrı patlarsa kurallı isteme düşer, harita hep dolu
 */
export async function sahneIstemleri(istekler, { usage, logFn = () => {} } = {}) {
  const liste = (istekler || []).filter((x) => x?.id && (x.cumle || x.sorgu));
  const cikti = {};
  for (const x of liste) cikti[x.id] = kuralliIstem(x.cumle, x.sorgu);
  if (!liste.length) return cikti;

  const satirlar = liste.map((x, i) =>
    `SCENE ${i + 1}\n` +
    `  SENTENCE: "${String(x.cumle || "").replace(/\s+/g, " ").slice(0, 240)}"\n` +
    `  FAILED QUERY: "${String(x.sorgu || "").slice(0, 90)}"` +
    (x.kacin ? `\n  AVOID (previous attempt, rejected): "${String(x.kacin).slice(0, 90)}"` : "")
  ).join("\n\n");

  try {
    const yanit = await callJSON({
      system: SISTEM,
      user: `${satirlar}\n\nWrite one scene for each of the ${liste.length} entries above.\n` +
        `Return exactly this shape:\n` +
        `{"sahneler":[{"no":<index>,"sahne":"<scene description>"}, ...]}\n` +
        `There must be one record for all ${liste.length} scenes.`,
      schema: SEMA,
      // Sahne başına ~60 token + pay. Şema uygulanmayan hesapta model bazen
      // gerekçe de yazıyor; tavan dar tutulursa yanıt ortadan kesilir ve
      // TÜM sahneler kurallı isteme düşer.
      maxTokens: Math.max(4000, liste.length * 160),
      usage, logFn,
    });
    const yazilanlar = yanitiOku(yanit, liste);
    Object.assign(cikti, yazilanlar);
    const yazilan = Object.keys(yazilanlar).length;
    if (yazilan < liste.length) {
      logFn(`AI sahne tarifi: ${liste.length} istendi, ${yazilan} yazıldı — ` +
        `kalanı arama sorgusundan kuruldu.`);
    }
  } catch (e) {
    logFn(`AI sahne tarifi yazılamadı (${String(e.message).slice(0, 90)}) — ` +
      `istemler arama sorgusundan kuruldu.`);
  }
  return cikti;
}
