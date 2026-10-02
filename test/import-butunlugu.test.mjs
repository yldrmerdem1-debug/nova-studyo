// BAŞKA MODÜLÜN İŞLEVİNİ IMPORT ETMEDEN ÇAĞIRMA.
//
// ÖLÇÜLEN KUSUR (20260817-b05a7a): AI kurtarma bloğu `generateAiClips` çağırıyor
// ama index.js onu HİÇ import etmemişti. Günlükte tek satır kaldı:
//
//     AI kurtarma atlandı: generateAiClips is not defined
//
// Kullanıcı AI bütçesi 20 verdi; arşivin kurtaramadığı 8 sahnenin hiçbirine
// dokunulmadı ve iş yine "başarılı" bitti. Blok try/catch içinde olduğu için
// hata sessizce yutuldu.
//
// NEDEN DİĞER TESTLER KAÇIRDI: ai-kurtarma.test.mjs bloğu KAYNAK METNİ olarak
// tarıyor. Metin doğruydu — eksik olan import'tu. Kaynağı okuyan hiçbir test
// bunu göremez; sorun yazılanda değil, YAZILMAYANDA.
//
// ÖLÇÜT BİLEREK DAR TUTULDU. Genel bir "tanımsız değişken" tarayıcısı denendi
// ve 32 yanlış alarm verdi (async ok işlevleri, yıkılmış parametreler, nesne
// kısayol metotları, dinamik import). Regex ile JavaScript ayrıştırmak yanlış
// araç. Burada yalnızca ŞU sorulur: bu dosya, boru hattının BAŞKA bir
// modülünün dışa açtığı bir adı, onu import etmeden çağırıyor mu? Yanlış alarm
// üretmez ve ölçülen hatayı tam olarak yakalar.
import fs from "node:fs";
import assert from "node:assert";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const DIZIN = new URL("../src/pipeline/", import.meta.url);
const dosyalar = fs.readdirSync(DIZIN).filter((f) => f.endsWith(".js") && !f.startsWith("_"));
kontrol("boru hattı dosyaları bulundu", dosyalar.length >= 20, String(dosyalar.length));

/** Yorumları ve dizeleri temizle — içlerindeki örnek kod yanlış alarm üretir. */
const temizle = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ")
  .replace(/`(?:\\.|[^`\\])*`/g, " ")
  .replace(/"(?:\\.|[^"\\])*"/g, " ")
  .replace(/'(?:\\.|[^'\\])*'/g, " ");

const kaynak = {}, temiz = {};
for (const f of dosyalar) {
  kaynak[f] = fs.readFileSync(new URL(f, DIZIN), "utf8");
  temiz[f] = temizle(kaynak[f]);
}

// --- 1) Her modülün DIŞA AÇTIĞI adlar ---
const disaAcilan = {};   // dosya -> Set(ad)
const sahibi = new Map(); // ad -> dosya
for (const f of dosyalar) {
  const s = new Set();
  for (const m of kaynak[f].matchAll(/export\s+(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/g)) s.add(m[1]);
  for (const m of kaynak[f].matchAll(/export\s+(?:const|let|var|class)\s+([a-zA-Z_$][\w$]*)/g)) s.add(m[1]);
  disaAcilan[f] = s;
  for (const ad of s) if (!sahibi.has(ad)) sahibi.set(ad, f);
}
kontrol("dışa açılan adlar toplandı", sahibi.size > 60, String(sahibi.size));

// --- 2) Her modülün İÇERİ ALDIĞI adlar ---
//
// İKİ AYRI KALIP, BİLEREK AYRI. Tek bir `import\s+([\s\S]*?)\s+from` kalıbı
// denendi ve YANLIŞ sonuç verdi: `import fs from "node:fs"` satırındaki
// "import" ile ÜÇ SATIR AŞAĞIDAKİ bir süslü parantez eşleşiyor, araya giren
// her şey "ad" sanılıyordu (`getSettings } from "../config.js";` gibi 42
// hayalet hata). Süslü parantezli kalıpta "import" ile "{" arasında yalnızca
// boşluk olmasına izin veriliyor; böylece parantezsiz import'a atlayamıyor.
const SUSLU = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
const VARSAYILAN = /import\s+([a-zA-Z_$][\w$]*)\s*,?\s*(?:\{[^}]*\})?\s*from\s*["']([^"']+)["']/g;

const iceriAlinan = {};
for (const f of dosyalar) {
  const s = new Set();
  for (const m of kaynak[f].matchAll(SUSLU))
    for (const p of m[1].split(",")) {
      const ad = p.trim().split(/\s+as\s+/).pop().trim();
      if (ad) s.add(ad);
    }
  for (const m of kaynak[f].matchAll(VARSAYILAN)) s.add(m[1]);
  iceriAlinan[f] = s;
}

// --- 3) Her modülün KENDİ tanımladığı adlar (import edilmese de erişilebilir) ---
const kendi = {};
for (const f of dosyalar) {
  const s = new Set();
  for (const m of kaynak[f].matchAll(/(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z_$][\w$]*)/g)) s.add(m[1]);
  for (const m of kaynak[f].matchAll(/(?:^|\s)(?:export\s+)?(?:const|let|var|class)\s+([a-zA-Z_$][\w$]*)/g)) s.add(m[1]);
  kendi[f] = s;
}

// --- 4) ASIL KONTROL ---
// Bu dosya, BAŞKA bir modülün dışa açtığı bir adı, ne import etmiş ne de
// kendisi tanımlamış olduğu hâlde çağırıyor mu?
let bulunan = 0;
for (const f of dosyalar) {
  for (const m of temiz[f].matchAll(/(^|[^.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const ad = m[2];
    const nereden = sahibi.get(ad);
    if (!nereden || nereden === f) continue;          // yabancı bir ad değil
    if (iceriAlinan[f].has(ad) || kendi[f].has(ad)) continue;  // erişilebilir
    console.log(`HATA ${f}: "${ad}" çağrılıyor ama import edilmemiş ` +
      `(${nereden} dosyasında tanımlı) — çalışma anında "is not defined" verir`);
    bulunan++; hata++;
  }
}
kontrol("import edilmeden çağrılan modül işlevi yok", bulunan === 0, bulunan + " adet");

// --- 5) Import edilen ad GERÇEKTEN dışa açılmış mı ---
let hayalet = 0;
for (const f of dosyalar) {
  for (const m of kaynak[f].matchAll(new RegExp(SUSLU.source, "g"))) {
    if (!m[2].startsWith("./")) continue;      // yalnızca boru hattı içi
    const hedef = m[2].replace(/^\.\//, "");
    if (!disaAcilan[hedef]) continue;
    for (const p of m[1].split(",")) {
      const ad = p.trim().split(/\s+as\s+/)[0].trim();
      if (!ad) continue;
      if (!disaAcilan[hedef].has(ad)) {
        console.log(`HATA ${f}: "${ad}" ${hedef} dosyasından import ediliyor ama orada dışa açılmamış`);
        hayalet++; hata++;
      }
    }
  }
}
kontrol("import edilen adların hepsi gerçekten dışa açık", hayalet === 0, hayalet + " adet");

// --- 6) ÖLÇÜLEN VAKA — bir daha kaçmasın ---
{
  const idx = kaynak["index.js"];
  kontrol("generateAiClips index.js'e import edilmiş",
    /import \{ generateAiClips \} from "\.\/aivideo\.js"/.test(idx),
    "AI kurtarma her işte 'is not defined' ile sessizce atlanıyordu");
  kontrol("çağrı hâlâ yerinde", /await generateAiClips\(istek/.test(idx));
  // Hata try/catch içinde yutuluyor; mesaj yazılmasaydı kusur HİÇ bulunamazdı.
  kontrol("yutulan hata kullanıcıya yazılıyor",
    /AI kurtarma atlandı: \$\{String\(e\.message\)/.test(idx));
}

// --- 7) MODÜLLER GERÇEKTEN YÜKLENİYOR MU ---
// Statik tarama çözümlenemeyen import yolunu ya da döngüsel bağımlılığı
// yakalayamaz; yükleme yakalar.
for (const f of ["index.js", "render.js", "media.js", "script.js",
                 "gorseldenetim.js", "aiistem.js", "kamera.js", "aivideo.js"]) {
  try {
    await import(new URL(f, DIZIN).href);
    kontrol(f + " yükleniyor", true);
  } catch (e) {
    kontrol(f + " yükleniyor", false, String(e.message).slice(0, 90));
  }
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
