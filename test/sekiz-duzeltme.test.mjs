// VİDEO ÜRETMEDEN ÖLÇÜLEBİLEN SEKİZ KUSUR.
//
// Hepsi bitmiş bir videodan (20260817-b05a7a) ölçülüp düşmanca doğrulamadan
// geçti. Sekizi de model davranışına DEĞİL deterministik koda bağlı olduğu
// için gerçek üretim beklemeden düzeltilip burada kilitlendi.
//
//   1. Video son sözden 0,42 sn sonra bitiyordu — YouTube bitiş ekranı 5 sn ister
//   2. Rakam grafiği alt etiketi 30 karakterde kırpılıyordu (15 grafiğin 6'sı)
//   3. seo.md iki BOŞ bölümle teslim ediliyordu (başlık önerisi, sabit yorum)
//   4. Müzik duraklamalarda anlatımın 19-34 dB altındaydı — telefonda duyulmuyor
//   5. Karşılaştırma barları ayırt edilemiyordu (1184 vs 1250 -> 37px fark)
//   6. Kapak üst yazısı cümle ortasından kesikti ("THE TROJAN WAR WHAT")
//   7. Ses baştan sona tek düzlemdeydi (LRA 2,2 LU, beş bölüm de aynı)
//   8. MP4'te hiç metadata yoktu — dosya "output" adıyla yükleniyor
import fs from "node:fs";
import assert from "node:assert";
import { renderSeoMarkdown } from "../src/pipeline/seo.js";
import { KAPANIS_KUYRUGU } from "../src/pipeline/render.js";
import { HEDEF_LUFS, kazancHesapla } from "../src/pipeline/muzikseviye.js";
import { ASAMA_KAZANC, muzikPlani, muzikZinciri } from "../src/pipeline/muzik.js";
import { splitTwo, sayiBicimle } from "../src/pipeline/graphics.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};
const oku = (f) => fs.readFileSync(new URL(`../src/pipeline/${f}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) KAPANIŞ KUYRUĞU
// ---------------------------------------------------------------------------
kontrol("kapanış kuyruğu YouTube bitiş ekranına yetiyor", KAPANIS_KUYRUGU >= 5,
  `${KAPANIS_KUYRUGU} sn — ölçülen eski değer 0,42 sn idi`);
kontrol("kuyruk abartılmamış", KAPANIS_KUYRUGU <= 12, String(KAPANIS_KUYRUGU));
{
  const r = oku("render.js");
  kontrol("uzun video kuyruğu SON bloğa ekleniyor",
    /flat\[flat\.length - 1\]\.dur \+= shortEditorial\?1\.4:KAPANIS_KUYRUGU/.test(r));
  kontrol("kısa editoryal video uzun bitiş ekranıyla şişirilmiyor",
    /const shortEditorial=VISUAL_STYLES\[job\.visualStyle\]\?\.editorial===true&&flat\.reduce\(\(s,f\)=>s\+f\.dur,0\)<=90/.test(r));
  kontrol("kolaj kipinde eklenmiyor", /if \(flat\.length && !isCollage\)/.test(r),
    "kolajın kendi zaman çizelgesi var");
  // Ses zinciri buna hazır olmalı: her segment kendi süresine apad'leniyor,
  // yani son bloğu uzatmak narration.wav'ı da uzatıyor ve müzik takip ediyor.
  kontrol("ses apad ile süreye dolduruluyor", /"-af", "apad", "-t", f\.dur/.test(r),
    "apad olmasa kuyruk sessiz kalırdı");
}

// ---------------------------------------------------------------------------
// 2) RAKAM GRAFİĞİ ALT ETİKETİ — kırpma yok, iki satır
// ---------------------------------------------------------------------------
{
  // Ölçülen üç gerçek etiket: hepsinde anlamı taşıyan SON kelime düşüyordu.
  for (const [ham, kritik] of [
    ["settlement layers under Hisarlik", "Hisarlik"],
    ["lower city south of the citadel", "citadel"],
    ["years of excavation at Troy", "Troy"],
  ]) {
    const satir = splitTwo(ham, 26);
    kontrol(`"${kritik}" kelimesi kaybolmuyor`, satir.join(" ").includes(kritik),
      JSON.stringify(satir));
    kontrol(`"${ham.slice(0, 18)}..." iki satıra sığıyor`, satir.length <= 2, String(satir.length));
  }
  const g = oku("graphics.js");
  kontrol("stat etiketi artık tek satıra kırpılmıyor",
    !/const lab = up\(ftext\(e\.label, 30\), loc\)/.test(g));
  kontrol("iki satır çiziliyor", /labSatir\.forEach/.test(g));
  kontrol("iki satırda punto küçülüyor", /labSatir\.length > 1 \? 34 : 42/.test(g),
    "aynı puntoda iki satır altyazının üstüne taşardı");
}

// ---------------------------------------------------------------------------
// 3) seo.md BOŞ BÖLÜM BASMIYOR
// ---------------------------------------------------------------------------
{
  const job = { language: "en", topic: "T" };
  const script = { title: "X", sections: [] };
  const st = [{ title: "Bir", start: 0 }];
  const temel = { description: "B.", tags: ["a"], thumbnailText: "X" };

  const bos = renderSeoMarkdown(job, script, temel, st, 700);
  kontrol("başlık önerisi yoksa bölüm hiç basılmıyor", !bos.includes("## Başlık önerileri"));
  kontrol("sabit yorum yoksa bölüm hiç basılmıyor", !bos.includes("## Sabitlenecek yorum"));
  kontrol("açıklama her hâlükârda basılıyor", bos.includes("## Açıklama"));
  kontrol("etiketler her hâlükârda basılıyor", bos.includes("## Etiketler"));

  const dolu = renderSeoMarkdown(job, script,
    { ...temel, titles: ["Bir başlık", "İki başlık"], pinnedComment: "Soru?" }, st, 700);
  kontrol("başlıklar varsa numaralı listeleniyor",
    dolu.includes("1. Bir başlık") && dolu.includes("2. İki başlık"));
  kontrol("sabit yorum varsa alıntı olarak basılıyor", dolu.includes("> Soru?"));

  const s = oku("seo.js");
  kontrol("eksik başlık alanı runSeo'da yakalanıyor", /out\.titles = tek \? \[tek\] : \[\]/.test(s));
  kontrol("eksik alan kullanıcıya bildiriliyor",
    /Başlık önerileri modelden gelmedi/.test(s) && /Sabitlenecek yorum modelden gelmedi/.test(s),
    "sessiz geçmek bu kusurun görünmez kalmasının tek sebebiydi");
  kontrol("alan adı esnek okunuyor", /out\?\.titles \|\| out\?\.baslikOnerileri/.test(s),
    "bu hesapta yapılandırılmış çıktı zorlanmıyor, model alan adını değiştiriyor");
}

// ---------------------------------------------------------------------------
// 4) MÜZİK SEVİYESİ
// ---------------------------------------------------------------------------
kontrol("müzik hedefi yükseltildi", HEDEF_LUFS === -24, String(HEDEF_LUFS));
kontrol("gerçek parçalar +6 dB daha yüksek çıkıyor",
  Math.abs(kazancHesapla(-11.1) - (-12.9)) < 0.05, `${kazancHesapla(-11.1)} dB (eski -18.9)`);
{
  const m = oku("muzikseviye.js");
  kontrol("gerekçe kaynakta yazılı", /duraklamalarda ölçülen müzik tabanı/.test(m));
  kontrol("musicVolume ile birlikte yükseltilmemesi uyarısı var",
    /BİRLİKTE yükseltilmemeli/.test(m), "ikisi çarpışır");
}

// ---------------------------------------------------------------------------
// 5) KARŞILAŞTIRMA BARLARI
// ---------------------------------------------------------------------------
{
  // graphics.js'teki hesabın birebir aynısı — barların gerçekten ayrıştığını
  // sınıyor. (Filtre dizesini çalıştırmadan ölçülebilen tek yer burası.)
  const barlar = (vals) => {
    const d = vals.map(Math.abs);
    const enB = Math.max(...d), enK = Math.min(...d);
    const yakin = (enB - enK) < enB * 0.15;
    const taban = yakin ? enK - (enB - enK) * 0.35 : 0;
    const yay = Math.max(1e-6, enB - taban);
    return d.map((v) => Math.max(60, Math.round(((v - taban) / yay) * 700)));
  };
  const yil = barlar([1184, 1250]);
  kontrol("yakın değerler artık ayırt ediliyor", yil[1] - yil[0] > 200,
    `fark ${yil[1] - yil[0]}px — eski hesapta 37px idi`);
  const uzak = barlar([10, 1000]);
  kontrol("uzak değerlerde taban kaydırılmıyor", uzak[0] <= 65,
    `${uzak.join("/")} — küçük değer küçük kalmalı`);

  kontrol("binlik ayraç uygulanıyor", sayiBicimle("10000", "en") === "10,000");
  kontrol("yıl gibi 4 haneli sayıya dokunulmuyor",
    sayiBicimle("1184", "en") === "1184" && sayiBicimle("1250", "en") === "1250",
    "1.184 yazmak tarihi bozar");
  kontrol("sayı olmayan değer bozulmuyor", sayiBicimle("1180 BC", "en") === "1180 BC");
  kontrol("boş değer çökertmiyor", sayiBicimle("", "en") === "" && sayiBicimle(null, "en") === "");

  const g = oku("graphics.js");
  kontrol("bar tabanı koda girdi", /const taban = yakin \? enKucuk/.test(g));
  kontrol("bar genişliği tabandan hesaplanıyor", /- taban\) \/ yayilim\)/.test(g));
}

// ---------------------------------------------------------------------------
// 6) KAPAK ÜST YAZISI
// ---------------------------------------------------------------------------
{
  const t = oku("thumbnails.js");
  kontrol("kicker kırpma yerine eleniyor",
    /kickerParca\.length >= 3 && kickerParca\.length <= 26/.test(t),
    "yarım cümle basmaktansa hiç basmamak yeğdir");
  kontrol("ilk anlamlı öbek alınıyor", /kickerTam\.split\(\/\[:—–\?\|\]\/\)\[0\]/.test(t));
  kontrol("ölçülen vaka yorumda", /THE TROJAN WAR WHAT/.test(t));
  // Mantığın kendisi: uzun başlık kicker üretmemeli, kısa olan üretmeli.
  const kick = (b) => {
    const parca = String(b || "").split(/[:—–?|]/)[0].trim();
    return parca.length >= 3 && parca.length <= 26 ? parca.toUpperCase() : "";
  };
  kontrol("iki noktalı başlıkta ilk öbek alınıyor",
    kick("The Trojan War: What Really Happened") === "THE TROJAN WAR");
  kontrol("sığmayan başlıkta kicker düşüyor",
    kick("What Happens If Everyone's DNA Gets Sequenced?") === "");
}

// ---------------------------------------------------------------------------
// 7) SES DİNAMİĞİ
// ---------------------------------------------------------------------------
{
  kontrol("dört aşama için kazanç tanımlı", ASAMA_KAZANC.length === 4);
  kontrol("kanca ve doruk yükseliyor", ASAMA_KAZANC[0] > 0 && ASAMA_KAZANC[2] > 0,
    JSON.stringify(ASAMA_KAZANC));
  kontrol("kurulum ve kapanış çekiliyor", ASAMA_KAZANC[1] < 0 && ASAMA_KAZANC[3] < 0);
  const salinim = Math.max(...ASAMA_KAZANC) - Math.min(...ASAMA_KAZANC);
  kontrol("salınım duyulur ama sözü örtmez", salinim >= 3 && salinim <= 6,
    `${salinim} dB — anlatım müziğin ~16 dB üstünde`);

  // Zincirde gerçekten farklı seviyeler çıkıyor mu?
  const dosyalar = ["yatak-gerilim-a.mp3", "yatak-notr-a.mp3", "yatak-notr-b.mp3",
                    "yatak-derin-a.mp3", "yatak-ilham-a.mp3"];
  const plan = muzikPlani({ id: "t", theme: "hikaye" }, [130, 132, 135, 130, 145], dosyalar)
    .map((b) => ({ ...b, kazanc: -12.9 }));
  kontrol("bloklar aşama taşıyor", plan.every((b) => Number.isFinite(b.asama)),
    JSON.stringify(plan.map((b) => b.asama)));
  const z = muzikZinciri(plan, { narration: "n.mp3", musicVolume: 0.16, toplamSure: 672 });
  const sev = [...z.muzikZinciri.matchAll(/volume=(-?[\d.]+)dB/g)].map((m) => m[1]);
  kontrol("zincirde birden çok seviye var", new Set(sev).size >= 2,
    `${new Set(sev).size} farklı seviye: ${sev.join(", ")}`);
}

// ---------------------------------------------------------------------------
// 8) MP4 METADATA
// ---------------------------------------------------------------------------
{
  const r = oku("render.js");
  kontrol("başlık dosyaya gömülüyor", /"-metadata", `title=\$\{baslik\}`/.test(r));
  kontrol("akış dilleri etiketleniyor",
    /"-metadata:s:v:0", `language=\$\{dil\}`/.test(r) &&
    /"-metadata:s:a:0", `language=\$\{dil\}`/.test(r),
    "iki akış da 'und' olarak gidiyordu");
  kontrol("dil videonun dilinden geliyor", /job\?\.language === "en" \? "eng" : "tur"/.test(r));
  kontrol("başlık uzunluğu sınırlı", /\.slice\(0, 180\)/.test(r));
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
