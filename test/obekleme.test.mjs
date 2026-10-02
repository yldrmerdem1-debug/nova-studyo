// Öbekleme kuralları: ekranda görünen her parça okunabilir bir birim olmalı.
// Gerçek videoda "değil sadece Ve" gibi yarım kalmış parçalar görüldü.
import { obekle } from "../src/pipeline/motion.js";

let hata = 0;
const kontrol = (ad, kosul, detay = "") => {
  if (kosul) console.log("OK   " + ad);
  else { hata++; console.log("HATA " + ad + (detay ? "  -> " + detay : "")); }
};

const katla = (s) => String(s || "").toLocaleLowerCase("tr").replace(/[.,;:!?…"“”‘’()]/g, "");

const BAGLAC = new Set([
  "ve", "ile", "ama", "fakat", "çünkü", "ancak", "yani", "ya", "veya", "ki",
  "de", "da", "ise", "hem", "gibi", "için", "kadar", "göre", "diye",
  "bir", "bu", "şu", "her", "en", "daha", "çok", "sadece",
]);

const CUMLELER = [
  "Adı Mariana Çukuru, hilal biçiminde uzanan bir yarık ve derinliği on bir kilometre",
  "Geri kalan on kilometre mutlak karanlıktır, değil sadece soğuk ve acımasız",
  "Ve Piccard orada bir pisi balığı gördüğünü söyledi ama kimse doğrulayamadı",
  "Ölçümler yaklaşık on bir kilometre diyor; kesin rakam hâlâ tartışmalı",
  "Dipte basınç bin seksen altı bara ulaşır, deniz seviyesinin yaklaşık bin yetmiş katı",
  "Her santimetrekareye bir ton yük biner ve su bile bu ağırlıkta sıkışır",
  "Yetmiş altı yıl sonra Challenger İkinci sonarla döndü ve on bin dokuz yüz metreyi buldu",
  "Deniz feneri bekçileri aylarca tek başına yaşardı ama kimse onları hatırlamadı",
];

const kelimele = (c) => c.split(/\s+/).map((s, i) => ({ s, t0: +(i * 0.4).toFixed(2) }));

// ==================== 1. Öbek bağlaçla BİTMEZ ====================
{
  let kotu = 0;
  const ornek = [];
  for (const c of CUMLELER) {
    for (const [mk, mkar] of [[6, 67], [4, 34]]) {   // yatay ve dikey bütçe
      const obekler = obekle(kelimele(c), mk, mkar);
      for (const ob of obekler) {
        const son = katla(ob.at(-1).s);
        if (BAGLAC.has(son) && ob.length > 1) {
          kotu++; ornek.push('"' + ob.map((w) => w.s).join(" ") + '"');
        }
      }
    }
  }
  kontrol("obek baglac/edat ile bitmiyor", kotu === 0, ornek.slice(0, 4).join(" "));
}

// ==================== 2. Kapasite aşılmıyor ====================
{
  let asan = 0;
  const ornek = [];
  for (const c of CUMLELER) {
    for (const [mk, mkar] of [[6, 67], [4, 34]]) {
      for (const ob of obekle(kelimele(c), mk, mkar)) {
        const metin = ob.map((w) => w.s).join(" ");
        if (ob.length > mk || metin.length > mkar) {
          asan++; ornek.push(`${ob.length}kel/${metin.length}kar > ${mk}/${mkar}`);
        }
      }
    }
  }
  kontrol("kelime ve karakter butcesi asilmiyor", asan === 0, ornek.slice(0, 3).join(", "));
}

// ==================== 3. Hiç kelime kaybolmuyor / sıra bozulmuyor ====================
{
  let bozuk = 0;
  for (const c of CUMLELER) {
    const kl = kelimele(c);
    for (const [mk, mkar] of [[6, 67], [4, 34], [3, 20]]) {
      const duz = obekle(kl, mk, mkar).flat();
      if (duz.length !== kl.length) { bozuk++; continue; }
      if (duz.some((w, i) => w.s !== kl[i].s)) bozuk++;
    }
  }
  kontrol("kelimeler eksiksiz ve sirasi bozulmadan bolunuyor", bozuk === 0, bozuk + " bozuk");
}

// ==================== 4. Noktalama duraklarında kesiliyor ====================
{
  const c = "Adı Mariana Çukuru, hilal biçiminde uzanan bir yarık ve derinliği çok fazla";
  const obekler = obekle(kelimele(c), 6, 67);
  // "Çukuru," ile biten bir öbek olmalı
  const noktalamaSonu = obekler.filter((o) => /[.,;:]$/.test(o.at(-1).s)).length;
  kontrol("noktalama durakları kesme noktası olarak kullaniliyor", noktalamaSonu >= 1,
    obekler.map((o) => '"' + o.map((w) => w.s).join(" ") + '"').join(" | "));
}

// ==================== 5. Uç durumlar ====================
{
  kontrol("bos liste bos doner", obekle([], 6, 67).length === 0);
  kontrol("tek kelime tek obek", obekle(kelimele("Yalnızlık"), 6, 67).length === 1);
  const dev = obekle([{ s: "A".repeat(120), t0: 0 }, { s: "son", t0: 1 }], 6, 67);
  kontrol("butceyi tek basina asan kelime patlatmiyor", dev.length >= 1 && dev.flat().length === 2);
  const hepBaglac = obekle(kelimele("ve ama ile de da ki ve ama ile de"), 4, 30);
  kontrol("hepsi baglac olsa bile bolunuyor", hepBaglac.flat().length === 10, JSON.stringify(hepBaglac.map(o=>o.length)));
}

// ==================== 6. Örnek çıktı (gözle kontrol) ====================
console.log("\n--- ornek obekleme (yatay 6 kelime / 67 karakter) ---");
for (const c of CUMLELER.slice(0, 4)) {
  console.log("  " + c);
  for (const ob of obekle(kelimele(c), 6, 67)) console.log("    | " + ob.map((w) => w.s).join(" "));
}

console.log(hata === 0 ? "\nTUM OBEKLEME KURALLARI GECTI" : "\n" + hata + " KURAL IHLALI");
process.exit(hata ? 1 : 0);
