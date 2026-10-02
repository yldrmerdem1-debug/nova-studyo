// GEÇİŞ NİYETİ + VURGU ZAMANLAMASI.
//
// 1) Geçiş türü sabit KARMA ile seçiliyordu — içerikten bağımsız, keyfî.
//    Artık kurgu planı niyeti söylüyor (kes/eritme/karart/parlat/kaydir),
//    kod süre-nötrlüğü ve ritmi garanti ediyor.
// 2) Sarı vurgu ekranda çok kısa duruyordu: söz SÖYLENİRKEN giriyor, vurguSec
//    ise sözü SON kelimelerden seçiyor. Ölçüldü (6,5 sn sahne): 2,60 sn —
//    kelime bulunamazsa 1,95 sn. Artık erken giriyor ve taban süre garantili.
import fs from "node:fs";
import { planTransitions } from "../src/pipeline/transitions.js";
import { GECISLER, GECIS_HARITASI } from "../src/pipeline/kurgu.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------- 1. Niyet sözlüğü ----------
kontrol("bes gecis niyeti tanimli", GECISLER.length === 5, GECISLER.join(","));
kontrol("her niyetin ffmpeg karsiligi var", GECISLER.every((g) => GECIS_HARITASI[g]));
kontrol("'kes' gercekten sert kesme", GECIS_HARITASI.kes.sure === 0 && GECIS_HARITASI.kes.tip === "");
kontrol("'parlat' KISA tutuluyor (flas darbe olmali)", GECIS_HARITASI.parlat.sure <= 0.35,
  String(GECIS_HARITASI.parlat.sure));
kontrol("'karart' en uzun gecis", GECIS_HARITASI.karart.sure >= GECIS_HARITASI.eritme.sure);

// ---------- 2. Plan niyeti gerçekten uyguluyor ----------
{
  const beats = Array.from({ length: 6 }, (_, i) => ({
    id: "s0b" + i, segIndex: i, sectionIndex: 0, firstOfSection: false,
    dur: 6, emphasis: null, media: { type: "image", file: `x${i}.jpg` },
  }));
  const kurgu = new Map([
    [1, { gecis: "eritme" }], [2, { gecis: "karart" }],
    [3, { gecis: "parlat" }], [4, { gecis: "kes" }], [5, { gecis: "kaydir" }],
  ]);
  const p = planTransitions(beats, { theme: "belgesel", intensity: "sinematik", kurgu });

  kontrol("eritme -> fade", p[0].tip === "fade" && p[0].sure > 0.3, JSON.stringify(p[0]));
  kontrol("karart -> fadeblack", p[1].tip === "fadeblack", JSON.stringify(p[1]));
  kontrol("parlat -> fadewhite ve KISA", p[2].tip === "fadewhite" && p[2].sure <= 0.32, JSON.stringify(p[2]));
  kontrol("kes -> sert kesme", p[3].sure === 0 && p[3].tip === "", JSON.stringify(p[3]));
  kontrol("kaydir -> kayma", /smooth|slide/.test(p[4].tip), JSON.stringify(p[4]));
}

// ---------- 3. Plan YOKSA kural tabanlı yol aynen sürüyor ----------
{
  const beats = Array.from({ length: 4 }, (_, i) => ({
    id: "s0b" + i, segIndex: i, sectionIndex: 0, firstOfSection: false,
    dur: 6, emphasis: null, media: { type: "image", file: `x${i}.jpg` },
  }));
  const p = planTransitions(beats, { theme: "belgesel", intensity: "sinematik" });
  kontrol("plansiz da gecis uretiliyor", p.length === 3 && p.every((x) => x.sure >= 0));
  kontrol("belgeselde katalogdan geliyor", p.some((x) => x.tip === "fade"));
}

// ---------- 4. Vurgu SERT KESME kuralı — YALNIZCA BEAT SINIRINDA ----------
//
// Kural eskiden sınır TÜRÜNE bakmıyordu ve ölçülen sonucu ağırdı
// (20260817-b05a7a): vurgusu olan 29 segment sınırının hepsi sert kesmeye
// çevrildi, geçiş planı "sert×29" çıktı. Daha kötüsü BÖLÜM sınırlarında da
// çalıştı — dört bölüm geçişinin üçü sıradan sert kesme oldu ve temanın
// tanımladığı fadeblack (0,80 sn) videoda SIFIR kez göründü.
//
// Vuruş korunuyor ama kapsamı daraldı: sert kesme yalnızca BEAT sınırında.
// Segment ve bölüm sınırı kurgu dilinde daha büyük olaylardır; izleyici orada
// "yeni bir başlık başlıyor" bilgisini geçişin kendisinden alır.
{
  const yap = (gecis, sinir) => {
    const beats = [
      { id: "a", segIndex: 0, sectionIndex: 0, dur: 6, emphasis: null, media: { type: "image", file: "x" } },
      { id: "b",
        segIndex: sinir === "beat" ? 0 : 1,
        sectionIndex: sinir === "section" ? 1 : 0,
        firstOfSection: sinir === "section",
        dur: 6, emphasis: { type: "stat", value: "2600" }, media: { type: "image", file: "y" } },
    ];
    return planTransitions(beats, { theme: "belgesel", intensity: "sinematik",
      kurgu: new Map([[1, { gecis }]]) })[0];
  };
  kontrol("BEAT sınırında vurgulu sahneye ERITME ile girilmiyor (sert kesme)",
    yap("eritme", "beat").sure === 0, JSON.stringify(yap("eritme", "beat")));
  kontrol("BEAT sınırında vurgulu sahneye PARLAT ile girilebiliyor",
    yap("parlat", "beat").sure > 0, JSON.stringify(yap("parlat", "beat")));
  // Yeni davranış: büyük sınırlarda katalog geçişi korunuyor.
  kontrol("SEGMENT sınırında vurgu geçişi yemiyor",
    yap("eritme", "segment").sure > 0, JSON.stringify(yap("eritme", "segment")));
  kontrol("BÖLÜM sınırında vurgu geçişi yemiyor",
    yap("eritme", "section").sure > 0, JSON.stringify(yap("eritme", "section")));
  // Kaynakta da niyet yazılı olsun ki bir sonraki düzenlemede kaybolmasın.
  {
    const t = fs.readFileSync(new URL("../src/pipeline/transitions.js", import.meta.url), "utf8");
    kontrol("sert kesme kuralı sınır türüne bakıyor",
      /const beatSiniri = sinirTuru\(a, b\) === "beat"/.test(t));
    kontrol("kural yalnızca beat sınırında uygulanıyor",
      /if \(beatSiniri && b\.emphasis/.test(t));
  }
}

// ---------- 5. Ritim: efekt dagilimi koddan denetleniyor ----------
{
  const k = fs.readFileSync(new URL("../src/pipeline/kurgu.js", import.meta.url), "utf8");
  kontrol("ardisik ayni efekt duzeltiliyor", /p\.gecis === oncekiGecis/.test(k));
  kontrol("parlat sayisi sinirli", /parlatSayisi >= 2/.test(k));
  kontrol("efekt orani tavanli", /efektSayisi >= Math\.ceil\(adet \/ 3\)/.test(k));
  kontrol("taninmayan gecis 'kes'e cekiliyor", /GECISLER\.includes\(s\?\.gecis\) \? s\.gecis : "kes"/.test(k));
  kontrol("sert kesme VARSAYILAN diye prompt'ta yaziyor", /SERT KESME VARSAYILANDIR/.test(k));
}

// ---------- 6. Vurgu ekranda yeterince duruyor ----------
{
  const m = fs.readFileSync(new URL("../src/pipeline/motion.js", import.meta.url), "utf8");
  kontrol("vurgu soz soylenmeden ONCE giriyor", /const ONCEDEN = 0\.35/.test(m));
  kontrol("taban gorunur sure garantili", /const enAzGorunur = Math\.min\(bitis \* 0\.62, 2\.2/.test(m));
  kontrol("taban soz uzunluguyla olcekleniyor", /0\.3 \* Math\.max\(0, sozKelime - 1\)/.test(m));
  kontrol("acilis yumusatildi", /\/0\.26,/.test(m));

  // Hesap: 6,5 sn sahne, son kelime 3,9 sn'de -> eskiden 2,60 sn goruntu
  const ONCEDEN = 0.35;
  const hesapla = (bitis, sozAn, kelime) => {
    const enAz = Math.min(bitis * 0.62, 2.2 + 0.3 * Math.max(0, kelime - 1));
    const vt0 = Math.max(0, Math.min(sozAn - ONCEDEN, bitis - enAz));
    return bitis - vt0;
  };
  kontrol("6,5sn sahnede vurgu >= 2,2 sn duruyor", hesapla(6.5, 3.9, 1) >= 2.2, hesapla(6.5, 3.9, 1).toFixed(2));
  kontrol("sahne sonunda soylenen soz bile yeterince duruyor",
    hesapla(6.5, 6.4, 1) >= 2.2, hesapla(6.5, 6.4, 1).toFixed(2));
  // Taban bir ALT SINIR, hedef değil: söz yeterince erken söylenmişse iki
  // durum da aynı anda girer ve fark oluşmaz (doğru davranış). Kelime sayısı
  // etkisi ancak taban devreye girdiğinde, yani söz sahnenin SONUNDA
  // söylendiğinde görülür — asıl korunmak istenen durum da budur.
  kontrol("soz gec soylendiginde uc kelime daha uzun duruyor",
    hesapla(6.5, 6.4, 3) > hesapla(6.5, 6.4, 1),
    `${hesapla(6.5, 6.4, 3).toFixed(2)} vs ${hesapla(6.5, 6.4, 1).toFixed(2)}`);
  kontrol("soz erken soylendiginde taban devreye girmiyor",
    Math.abs(hesapla(9, 6.5, 3) - hesapla(9, 6.5, 1)) < 0.01);
  kontrol("kisa sahnede vurgu sahneyi yutmuyor", hesapla(3.0, 2.8, 1) <= 3.0 * 0.62 + 0.01);
}

// ---------- 7. render.js sirasi: kurgu plani gecis planindan ONCE ----------
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("kurgu plani gecis planindan ONCE aliniyor",
    r.indexOf("kurgu = await kurguPlani") < r.indexOf("const plan = planTransitions"));
  kontrol("gecis planina kurgu geciliyor", /planTransitions\(beats, \{[\s\S]{0,200}kurgu,/.test(r));
}

console.log(hata === 0 ? "\nGECIS NIYET TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
