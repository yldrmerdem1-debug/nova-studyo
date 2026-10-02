// AI KURTARMA: ÜRETİLEN GÖRSEL DOĞRU SAHNEYE, EKSİKSİZ OTURMALI.
//
// ÖLÇÜLEN KUSUR (20260814-a46ab2): denetim 34 görseli alakasız buldu, yedek
// turları 23'ünü değiştirdi, kalanı olduğu gibi videoya girdi ve görsel
// isabeti %54 çıktı. Kusur dağılımı ölçüldü: arşivin BOŞ kaldığı sahne
// sıfırdı — yani AI yalnızca indirmeden önce devreye giriyor, denetimin
// indirdikten SONRA yakaladığı başarısızlıklara hiç ulaşmıyordu.
//
// Kurtarma eklenirken ikinci bir tuzak çıktı: generateAiClips yalnızca
// {file, type, provider} döndürüyor, oysa medya kaydının geri kalanı
// `beatId` alanına bakıyor. render.js tam ekran arka planı seçerken
// `b.media?.beatId` okuyor; eksik olsaydı sessizce null'a düşerdi.
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const idx = fs.readFileSync(new URL("../src/pipeline/index.js", import.meta.url), "utf8");
const blok = idx.match(/SON KURTARMA[\s\S]*?KÜÇÜK AMA DOĞRU/)?.[0] || "";
kontrol("AI kurtarma bloğu bulundu", blok.length > 400);

// ---------------------------------------------------------------------------
// 1) NE ZAMAN DEVREYE GİRİYOR
// ---------------------------------------------------------------------------
kontrol("denetimin zayıf bulduğu sahneler seçiliyor",
  /Number\.isFinite\(m\.gorsel\) && m\.gorsel < GORSEL_ESIGI/.test(blok));
// AI'NIN KENDİ ÜRÜNÜ DE DENETLENİR — AMA YALNIZCA BİR KEZ YENİDEN DENENİR.
//
// Eskiden AI görselleri kurtarmadan tamamen dışlanıyordu (`m.provider !== "ai"`)
// ve zayıf çıkan AI kareleri olduğu gibi videoya giriyordu. Ölçüldü
// (20260815-07e514): 13 AI görselin 4'ü eşiğin altındaydı, hiçbiri yeniden
// denenmedi. Şimdi bir kez daha deneniyor; ikinci turdan sonrası aynı yere
// üst üste para harcamak olurdu.
kontrol("AI görseli de zayıfsa yeniden deneniyor",
  /m\.provider !== "ai" \|\| \(m\.aiTur \|\| 0\) < AI_EN_COK_TUR/.test(blok),
  "zayıf AI karesi sessizce videoya giriyordu");
kontrol("tur sayısı iki ile sınırlı", /AI_EN_COK_TUR = 2/.test(blok),
  "üçüncü deneme aynı sahneye üst üste para harcamak olur");
kontrol("üretilen kayda tur işareti yazılıyor", /aiTur: tur/.test(blok));
kontrol("kabul edilmeyen deneme de turu yükseltiyor", /eski\.aiTur = tur/.test(blok),
  "yoksa aynı sahne sonraki turda yine seçilir ve bütçe boşa gider");
kontrol("arşiv zincirinin SONUNDA çalışıyor",
  idx.indexOf("yeni arama açıları isteniyor") < idx.indexOf("SON KURTARMA"),
  "yedek turlar ve yeni açı denenmeden AI'ya gitmek para israfı olur");

// ---------------------------------------------------------------------------
// 2) BÜTÇE
// ---------------------------------------------------------------------------
kontrol("bütçe kullanıcının girdiği sayıyla sınırlı",
  /kalanButce = Math\.max\(0, job\.aiButce - uretilmis\)/.test(blok),
  "her görsel para — bir tane bile fazla üretilmemeli");
kontrol("daha önce üretilenler bütçeden düşülüyor",
  /provider === "ai"\)\.length/.test(blok));
kontrol("bütçe kadar sahne alınıyor", /\.slice\(0, kalanButce\)/.test(blok));
kontrol("hiç denenmemiş sahne önce geliyor",
  /\(a\.provider === "ai"\) - \(b\.provider === "ai"\)/.test(blok),
  "bir kez AI'ya verilip tutturamamış sahneyi tekrar denemek daha düşük ihtimalli");
kontrol("sonra en kötü puanlıdan başlanıyor",
  /\(a\.gorsel \?\? 9\) - \(b\.gorsel \?\? 9\)/.test(blok),
  "bütçe yetmezse en çok rahatsız edenler düzelsin");
kontrol("bütçe dolduysa kullanıcıya söyleniyor",
  /AI bütçesi doldu/.test(blok),
  "sessizce zayıf bırakmak kullanıcıyı yanıltır");

// ---------------------------------------------------------------------------
// 3) ÜRETİLEN GÖRSEL SAHNEYE DOĞRU OTURUYOR MU
// ---------------------------------------------------------------------------
kontrol("beatId taşınıyor", /\bbeatId,/.test(blok),
  "render.js tam ekran arka planı b.media?.beatId ile seçiyor — eksikse bozulur");
kontrol("provider ai olarak işaretleniyor", /provider: "ai"/.test(blok),
  "işaretlenmezse sonraki turda arşivle değiştirilebilir");
kontrol("sorgu alanı korunuyor", /sorgu: eski\?\.sorgu/.test(blok));
kontrol("denetim puanları yazılıyor",
  /gorsel: p\.puan, kalite: p\.kalite, gorunen: p\.gorunen/.test(blok));
kontrol("üretilen görsel de denetimden geçiyor",
  /gorselleriDenetle\(aiYeni, sorgular/.test(blok),
  "AI da kötü çıkabilir; körlemesine kabul edilmemeli");
kontrol("yalnızca GERÇEKTEN daha iyiyse geçiyor",
  /p\.puan > \(eski\?\.gorsel \?\? -1\)/.test(blok),
  "yoksa para harcanıp görüntü de bozulur");

// ---------------------------------------------------------------------------
// 4) BOZULMAYA KARŞI
// ---------------------------------------------------------------------------
kontrol("üretim patlarsa iş düşmüyor", /AI kurtarma atlandı/.test(blok));
kontrol("iptal edilmişse çalışmıyor", /if \(!isCancelled\(\) && aiAllowance\(job\) > 0\)/.test(blok));
kontrol("sonuç kullanıcıya raporlanıyor", /AI kurtarma \(tur \$\{tur\}\): \$\{duzelen\}/.test(blok));

// ---------------------------------------------------------------------------
// 6) İSTEM NEREDEN KURULUYOR — ölçülen asıl kusur
// ---------------------------------------------------------------------------
// "<arama sorgusu>. Context: <cümle>" biçimi görsel modeline sorguyu KONU
// diye gösteriyordu; ürettiği kareler sembol oluyordu (SECURE LOGIN PORTAL
// yazılı monitör, UNSOLVED damgalı klasör, mezuniyet töreni). Ölçüm: AI %8
// tam isabet / %69 alakalı — pexels %55/%91 iken.
kontrol("istem modele yazdırılıyor", /sahneIstemleri\(/.test(blok),
  "arama sorgusundan istem kurmak ölçülerek elendi");
kontrol("eski sorgu+Context biçimi kalmadı",
  !/\$\{sorgu\}\. Context: \$\{baglam\}/.test(blok),
  "bu biçim sembolik klişe üretiyordu");
kontrol("anlatılan cümle isteme besleniyor", /cumle: cumleler\[m\.beatId\]/.test(blok));
kontrol("ikinci turda önceki başarısızlık bildiriliyor",
  /kacin: m\.provider === "ai" \? m\.gorunen/.test(blok),
  "aynı fikri tekrar yazmasın diye");
kontrol("istemi boş kalan sahne üretime gitmiyor",
  /filter\(\(x\) => x\.visual\.prompt\)/.test(blok),
  "boş istem para yakar, karşılığında çöp kare gelir");

// ---------------------------------------------------------------------------
// 5) MEDYA KAYDI ŞEKLİ — gerçek işten doğrulama
// ---------------------------------------------------------------------------
// Gerçek bir işin media.json'ındaki AI kaydı hangi alanları taşıyor?
// Kurtarma kaydı da en az onları taşımalı, yoksa sonraki adımlar körleşir.
{
  const yol = "C:/Users/erdem/Videos/Nova Studyo/data/jobs/20260814-a46ab2/media.json";
  let ornek = null;
  try {
    const m = JSON.parse(fs.readFileSync(yol, "utf8"));
    ornek = Object.values(m).find((x) => x?.provider === "ai");
  } catch { /* iş silinmişse bu kontrol atlanır */ }
  if (ornek) {
    const gerekli = ["beatId", "file", "type", "provider", "gorsel", "kalite"];
    const eksik = gerekli.filter((k) => !(k in ornek));
    kontrol("gerçek AI kaydında beklenen alanlar var", eksik.length === 0, eksik.join(","));
    // Kurtarma kodu bu alanların HEPSİNİ yazıyor mu?
    const yaziyor = gerekli.filter((k) => k === "file" || k === "type"
      ? /\.\.\.kayit/.test(blok)             // file/type generateAiClips'ten geliyor
      : new RegExp(`\\b${k}\\b`).test(blok));
    kontrol("kurtarma kaydı aynı alanları yazıyor", yaziyor.length === gerekli.length,
      gerekli.filter((k) => !yaziyor.includes(k)).join(","));
  } else {
    console.log("     (gerçek iş bulunamadı — şekil karşılaştırması atlandı)");
  }
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
