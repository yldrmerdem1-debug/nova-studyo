// KURGU PLANI — sözleşme ve ritim kuralları.
//
// Kritik bulgu (2026-08-07, canlı API): bu hesapta output_config/json_schema
// DESTEKLENMİYOR; istek 400 dönüyor ve llm.js sessizce promptla-JSON yoluna
// düşüyor. O yolda şemadaki enum yalnızca bir açıklama oluyor ve model kendi
// araç adlarını uydurabiliyor ("arsiv", "harita", "animasyon"). Bu yüzden çıktı
// sözleşmesi PROMPT'un içine yazılı olmalı ve dönen değer sertçe normalize
// edilmeli. Bu test o korumaların yerinde durduğunu kilitler — ağ gerektirmez.
import fs from "node:fs";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const kaynak = fs.readFileSync(new URL("../src/pipeline/kurgu.js", import.meta.url), "utf8");
const { ARACLAR } = await import("../src/pipeline/kurgu.js");

// ---- 1. Araç listesi ----
kontrol("bes kurgu araci tanimli", ARACLAR.length === 5, ARACLAR.join(","));
for (const a of ["temiz", "kose", "tamekran", "grafik", "bolum"]) {
  kontrol(`"${a}" araci var`, ARACLAR.includes(a));
}

// ---- 2. Sözleşme prompt'ta yazılı (şemaya güvenilmiyor) ----
kontrol("cikti bicimi prompt'ta acikca yaziyor", /ÇIKTI BİÇİMİ/.test(kaynak));
kontrol("izin verilen arac degerleri prompt'ta listeli",
  /temiz · kose · tamekran · grafik · bolum/.test(kaynak));
kontrol("vurgunun metinden KOPYALANACAGI soyleniyor", /AYNEN kopyalanmış/.test(kaynak));

// ---- 3. Dönen değer sertçe normalize ediliyor ----
kontrol("taninmayan arac 'temiz'e cekiliyor",
  /ARACLAR\.includes\(s\?\.arac\) \? s\.arac : "temiz"/.test(kaynak));
kontrol("ciplak dizi de kabul ediliyor", /Array\.isArray\(cikti\) \? cikti/.test(kaynak));
kontrol("vurgu KELIMEDEN kirpiliyor (karakterden degil)",
  /split\(\/\\s\+\/\)\.filter\(Boolean\)\.slice\(0, 3\)/.test(kaynak));
kontrol("eksik plan kural yoluna dusuyor", /plan\.size < Math\.ceil\(sahneler\.length \* 0\.6\)/.test(kaynak));

// ---- 4. Ritim kuralları KODLA denetleniyor (prompt yeterli degil) ----
kontrol("ardisik ayni arac duzeltiliyor",
  /p\.arac !== "temiz" && p\.arac === oncekiArac/.test(kaynak));
kontrol("tamekran sayisi sinirli", /tamEkranSayisi >= 3/.test(kaynak));

// ---- 5. render.js entegrasyonu ----
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  // Tek çağrı: beats listesinin TAMAMI bir kerede gönderilir. Sahne başına
  // çağrı yapılsaydı 30 bağımsız karar çıkardı — tutarlılık oradan geliyor.
  kontrol("plan video basina TEK cagri ile aliniyor",
    /kurgu = await kurguPlani\(\s*\n?\s*beats\.map\(/.test(r));
  kontrol("plan gecis planindan ONCE aliniyor",
    r.indexOf("kurgu = await kurguPlani") < r.indexOf("const plan = planTransitions"));
  kontrol("plan alinamazsa kural yolu suruyor", /let kurgu = new Map\(\)/.test(r));
  kontrol("model vurgusu sahne metninde GECIYORSA kullaniliyor",
    /sahneMetni\.toLocaleLowerCase\("tr"\)\.includes/.test(r));
  kontrol("model 'temiz' dediyse kose ogesi konmuyor", /modelTemiz\)\s*\n?\s*\? \{ src: \[\], idler: \[\] \}/.test(r));
  kontrol("model 'grafik' dedi ve sayi varsa stat uretiliyor",
    /k\?\.arac === "grafik" && k\.vurgu && \/\\d\/\.test\(k\.vurgu\)/.test(r));
  kontrol("demo modda plan istenmiyor", /job\.kurguPlani !== false && !job\.demo/.test(r));
}

console.log(hata === 0 ? "\nKURGU PLANI TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
