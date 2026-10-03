// MÜZİK KÜNYESİ VE YER TUTUCU YATAKLAR.
//
// İKİ AYRI KUSUR, İKİSİ DE ÖLÇÜLDÜ.
//
// 1) KÜNYE HİÇ YOKTU. Görsel künyesi vardı (kunyeUret), müzik künyesi yoktu.
//    YouTube Audio Library parçalarının bir bölümü atıf istiyor ve o bilgi
//    hiçbir yere yazılmıyordu — görsel tarafında kapatılan açığın aynısı.
//
// 2) KURULUM YATAKLARI MÜZİK DEĞİL. music/ ile gelen dört dosya (yatak-derin,
//    yatak-gerilim, yatak-ilham, yatak-notr) üretilmiş sub-bas drone'lar.
//    Dördü de tam 4:00.02, 160 kb/s, aynı boyut. Ölçüldü:
//
//      dosya              spektral merkez   LRA
//      yatak-derin.mp3          87 Hz       2,4
//      yatak-notr.mp3           81 Hz       1,6
//      (gerçek parça)         1042 Hz       6,3
//
//    81-87 Hz'de enerjinin tamamına yakını sub-bas'ta; telefon ve laptop
//    hoparlörü orayı kesiyor, yani izleyicinin çoğu için SESSİZLİK. Gerçek
//    işte (20260817-b05a7a) beş bölümün ikisi bu drone'lara düştü — videonun
//    %40'ı pratikte müziksizdi. Kullanıcının "sesler yetersiz" şikâyeti buydu.
import fs from "node:fs";
import assert from "node:assert";
import { muzikAdiCoz, muzikKunyesi } from "../src/pipeline/kunye.js";
import { parcaSec, yerTutucuMu } from "../src/pipeline/muzik.js";
import { renderSeoMarkdown } from "../src/pipeline/seo.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---------------------------------------------------------------------------
// 1) YER TUTUCU TANIMA
// ---------------------------------------------------------------------------
kontrol("çıplak rol adı yer tutucu sayılıyor",
  yerTutucuMu("yatak-notr.mp3") && yerTutucuMu("yatak-derin.mp3") &&
  yerTutucuMu("yatak-gerilim.mp3") && yerTutucuMu("yatak-ilham.mp3"));
kontrol("gerçek parça yer tutucu sayılmıyor",
  !yerTutucuMu("yatak-notr-gemini--the-soundlings.mp3"));
kontrol("windows yolu doğru işleniyor",
  yerTutucuMu(String.raw`C:\m\yatak-notr.mp3`),
  "path ayırıcısı yanlış işlenirse yer tutucu yakalanmaz");
kontrol("unix yolu doğru işleniyor", yerTutucuMu("/m/yatak-derin.mp3"));
kontrol("boş girdi çökertmiyor", !yerTutucuMu("") && !yerTutucuMu(null));

// ---------------------------------------------------------------------------
// 2) GERÇEK PARÇA VARKEN YER TUTUCU SEÇİLMİYOR
// ---------------------------------------------------------------------------
{
  const havuz = ["yatak-derin.mp3", "yatak-derin-a-dream--twin-musicom.mp3",
                 "yatak-notr.mp3", "yatak-notr-gemini--the-soundlings.mp3"];
  const derinler = [0, 1, 2, 3, 4, 5].map((t) => parcaSec("derin", havuz, t, 0));
  const notrlar = [0, 1, 2, 3, 4, 5].map((t) => parcaSec("notr", havuz, t, 0));
  kontrol("derin rolünde drone hiç seçilmiyor",
    derinler.every((d) => !yerTutucuMu(d)), derinler.join(" "));
  kontrol("notr rolünde drone hiç seçilmiyor",
    notrlar.every((d) => !yerTutucuMu(d)), notrlar.join(" "));
  // Ama TAMAMEN silinmiyorlar: klasör boşken video kuru kalmasın.
  kontrol("başka seçenek yoksa yine de kullanılıyor",
    parcaSec("derin", ["yatak-derin.mp3"], 0, 0) === "yatak-derin.mp3",
    "music/ boşken video tamamen sessiz kalmamalı");
  kontrol("yedek dalda da gerçek parça önceliyor",
    !yerTutucuMu(parcaSec("olmayanrol", havuz, 0, 0)));
}

// ---------------------------------------------------------------------------
// 3) DOSYA ADINDAN PARÇA VE SANATÇI
// ---------------------------------------------------------------------------
// ID3 etiketi yok (ffprobe: title/artist/album üçü de boş), o yüzden ad
// biçimi: yatak-<rol>-<parça>--<sanatçı>.mp3. Çift tire BİLEREK ayırıcı —
// tek tire hem başlıkta hem sanatçı adında geçiyor.
{
  const a = muzikAdiCoz("yatak-derin-a-dream-within-a-dream--twin-musicom.mp3");
  kontrol("parça adı çözülüyor", a.parca === "A Dream Within A Dream", a.parca);
  kontrol("sanatçı çözülüyor", a.sanatci === "Twin Musicom", a.sanatci);
  const b = muzikAdiCoz(String.raw`C:\m\yatak-notr-gemini--the-soundlings.mp3`);
  kontrol("windows yolundan da çözülüyor", b.sanatci === "The Soundlings", b.sanatci);
  const c = muzikAdiCoz("yatak-ilham-ayiricisiz-ad.mp3");
  kontrol("ayırıcı yoksa sanatçı UYDURULMUYOR", c.sanatci === "",
    "yanlış atıf, eksik atıftan kötüdür");
  kontrol("ayırıcı yoksa parça adı yine yazılıyor", c.parca === "Ayiricisiz Ad", c.parca);
  const d = muzikAdiCoz("yatak-notr.mp3");
  kontrol("yer tutucudan ad çıkmıyor", d.parca === "" && d.sanatci === "");
}

// ---------------------------------------------------------------------------
// 4) KÜNYE BLOĞU
// ---------------------------------------------------------------------------
{
  const k = muzikKunyesi([
    "yatak-derin-a-dream--twin-musicom.mp3",
    "yatak-notr.mp3",                              // yer tutucu
    "yatak-notr-gemini--the-soundlings.mp3",
    "yatak-notr-gemini--the-soundlings.mp3",       // tekrar
  ], { dil: "en" });
  kontrol("başlık var", /^Music:/.test(k.metin));
  kontrol("sanatçılar yazılı",
    k.metin.includes("Twin Musicom") && k.metin.includes("The Soundlings"));
  kontrol("yer tutucu künyeye girmiyor", !/Notr/.test(k.metin),
    "üretilmiş drone'u eser gibi anmak izleyiciyi yanıltır");
  kontrol("tekrar tek satır", (k.metin.match(/The Soundlings/g) || []).length === 1);
  kontrol("satır sayısı doğru", k.sayi === 2, String(k.sayi));
  kontrol("dosya adından platform kaynağı uydurulmuyor", !/YouTube Audio Library/.test(k.metin) && !/not verified/.test(k.metin) && /not verified/.test((k.uyarilar || []).join(" ")));
  kontrol("Türkçe başlık", /^Müzik:/.test(muzikKunyesi(["yatak-notr-x--y.mp3"], {}).metin));
  kontrol("sadece yer tutucu varsa blok hiç yazılmıyor",
    muzikKunyesi(["yatak-notr.mp3", "yatak-derin.mp3"], {}).metin === "");
  kontrol("boş liste çökertmiyor",
    muzikKunyesi([], {}).metin === "" && muzikKunyesi(null, {}).metin === "");
}

// ---------------------------------------------------------------------------
// 5) AÇIKLAMAYA GERÇEKTEN GİRİYOR MU
// ---------------------------------------------------------------------------
{
  const job = { language: "en", topic: "T" };
  const script = { title: "X", sections: [] };
  const seo = { description: "Body.", tags: [], thumbnailText: "" };
  const st = [{ title: "Bir", start: 0 }];
  const media = { b1: { file: "x.jpg", provider: "wikimedia", lisans: "CC BY 4.0", sahip: "S", eser: "E" } };
  const md = renderSeoMarkdown(job, script, seo, st, 700, media,
    ["yatak-derin-a-dream--twin-musicom.mp3", "yatak-notr.mp3"]);
  kontrol("müzik künyesi açıklamada", md.includes("Music:") && md.includes("Twin Musicom"));
  kontrol("görsel künyesi bozulmadı", md.includes("Image credits"));
  kontrol("yer tutucu açıklamaya sızmıyor", !/•\s*"Notr"/.test(md));
  const yok = renderSeoMarkdown(job, script, seo, st, 700, media, null);
  kontrol("müzik listesi yoksa blok eklenmiyor", !yok.includes("Music:"));
  kontrol("müzik yokken görsel künyesi hâlâ var", yok.includes("Image credits"));
}

// ---------------------------------------------------------------------------
// 6) BORU HATTI BAĞLANTISI
// ---------------------------------------------------------------------------
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  const i = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
  kontrol("render kullanılan parçaları topluyor", /kullanilanMuzik = \[\.\.\.new Set/.test(r));
  kontrol("render bunları dışarı veriyor", /muzikler: kullanilanMuzik/.test(r));
  kontrol("müzik yoksa boş dizi dönüyor", /let kullanilanMuzik = \[\]/.test(r),
    "tanımsız kalırsa SEO adımı çöker");
  kontrol("index render sonucunu alıyor", (i.match(/=> renderAll\(/g) || []).length === 2);
  kontrol("index SEO'ya geçiriyor",
    (i.match(/durationSec, media, muzikler\)/g) || []).length === 2);
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
