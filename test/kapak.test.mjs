// KAPAK YAZISI KADRAJA SIĞIYOR MU — PİKSEL DÜZEYİNDE.
//
// Ölçülen kusur (20260809-c03c63): punto SABİTTİ ve genişlik hiç ölçülmüyordu.
// Üç kapağın ikisinde yazı sağdan taştı ve ekranda kesik göründü:
//   thumb_a: "BULGAR KÂHİNİN GE"   (GERÇEK HİKÂYESİ gitti)
//   thumb_c: "... KÂHİNİN GERÇEK"  (HİKÂYESİ gitti)
// Ayrıca thumb_a'da başlık İKİ KEZ yazılıydı: küçük sarı satırda bir,
// hemen altında dev harflerle bir daha.
//
// YouTube'da tıklanmayı en çok kapak belirlediği için bu doğrudan izlenme
// kaybı. Bu paket, yazının kadraja sığdığını GERÇEK RENDER üzerinde ölçüyor:
// düz siyah zemine beyaz yazı basılıp sağ kenar şeridinin parlaklığına
// bakılıyor. Taşma olsaydı orada beyaz piksel olurdu.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert";
import { makeThumbnails, sigdiranPunto } from "../src/pipeline/thumbnails.js";
import { getSettings } from "../src/config.js";
import { run } from "../src/util.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ------------------------------------------------------- SIĞDIRMA MANTIĞI
kontrol("sığdırma: kısa metin taban puntoyu korur",
  sigdiranPunto(["KISA"], 1184, 138) === 138);
kontrol("sığdırma: uzun metin küçülür",
  sigdiranPunto(["BULGAR KÂHİNİN GERÇEK HİKÂYESİ"], 1184, 138) < 138);
kontrol("sığdırma: hesaplanan punto gerçekten sığar", (() => {
  const s = "BULGAR KÂHİNİN GERÇEK HİKÂYESİ";
  const p = sigdiranPunto([s], 1184, 138);
  return s.length * 0.63 * p <= 1184 + 1;
})());
kontrol("sığdırma: en uzun SATIR belirleyici (ikisi de sığar)", (() => {
  const l = ["KISA", "ÇOK DAHA UZUN BİR SATIR BURADA"];
  const p = sigdiranPunto(l, 1184, 138);
  return Math.max(...l.map((x) => x.length)) * 0.63 * p <= 1184 + 1;
})());
kontrol("sığdırma: okunmaz kadar küçülmez (taban var)",
  sigdiranPunto(["Ç".repeat(200)], 1184, 138, 34) === 34);
kontrol("sığdırma: dar panelde de çalışır (B varyantı)",
  sigdiranPunto(["HİKÂYESİ"], 470 - 44 - 20, 92, 30) <= 92);

// ------------------------------------------------------- GERÇEK RENDER
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-kapak-"));
const st = getSettings();
const zemin = path.join(DIR, "zemin.jpg");
// Düz SİYAH zemin: beyaz yazı dışında parlak piksel olmayacak.
await run(st.ffmpegPath, ["-y", "-f", "lavfi", "-i", "color=c=black:s=1920x1080",
  "-frames:v", "1", zemin], { timeoutMs: 60000 });

const UZUN = "Baba Vanga Bulgar Kâhinin Gerçek Hikâyesi ve Devletin Rolü";
const job = { theme: "belgesel", language: "tr", topic: UZUN, thumbnailText: UZUN };
const made = await makeThumbnails({
  job, title: UZUN, imageFile: zemin, imageFiles: [zemin, zemin, zemin],
  jobDir: DIR, st, killer: { cancelled: false, add() {}, remove() {}, delete() {} },
  logFn: () => {},
});
kontrol("üç varyant da üretildi", made.length === 3, made.join(", "));

/** Verilen dikey şeridin ortalama parlaklığı (0-255). Yazı taşarsa yükselir. */
async function seritParlakligi(dosya, x, genislik = 14) {
  let y = null;
  await run(st.ffmpegPath, ["-i", dosya, "-vf",
    `crop=${genislik}:720:${x}:0,signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
    "-f", "null", "-"], { timeoutMs: 60000, onLine: (s) => {
      const m = String(s).match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
      if (m) y = parseFloat(m[1]);
    } });
  return y;
}

// Siyah zeminde beyaz yazı: taşma olsaydı sağ şerit belirgin parlar.
// Eşik 40: JPEG gürültüsü ve gradyan payı bırakıyor, gerçek harf çok üstünde.
// C varyantı kadrajın çevresine BİLEREK 10 piksellik vurgu çerçevesi çiziyor;
// en dış şeritten ölçmek onu yazı sanıyor. Ölçüm çerçevenin İÇİNDEN alınıyor.
const CERCEVE = 12;
for (const dosya of made) {
  const p = path.join(DIR, dosya);
  const sag = await seritParlakligi(p, 1280 - CERCEVE - 14);
  kontrol(`${dosya}: yazı sağ kenardan TAŞMIYOR`, sag !== null && sag < 40,
    `sağ şerit parlaklığı ${sag}`);
}
// Sol kenar da taşmamalı (B varyantında panel solda başlıyor).
const solA = await seritParlakligi(path.join(DIR, "thumb_a.jpg"), 0, 40);
kontrol("thumb_a: yazı sol kenara yapışmıyor", solA !== null && solA < 40,
  `sol şerit parlaklığı ${solA}`);

// ------------------------------------------------- BAŞLIK TEKRARI KESİLDİ
const tm = fs.readFileSync(new URL("../src/pipeline/thumbnails.js", import.meta.url), "utf8");
kontrol("kicker ana yazıyla örtüşünce düşürülüyor",
  tm.includes("kicker = \"\";") && tm.includes("ilkKelime(kicker) === ilkKelime(raw)"),
  "aksi halde kapakta aynı cümle iki kez yazıyor");
kontrol("kicker boşsa boş drawtext basılmıyor",
  tm.includes("bold && kicker ?"));

// ------------------------------------------ KAPAK GÖRSELİ ALAKAYA GÖRE
const rd = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
kontrol("kapak havuzu açılışı DIŞLAMIYOR",
  !/i >= Math\.floor\(beats\.length \* 0\.2\)/.test(rd),
  "konunun kişisinin portresi genelde açılışta duruyor");
kontrol("kapak görseli denetim puanına göre seçiliyor",
  rd.includes("rankThumbnailCandidates(havuz, job)") &&
  tm.includes("(b.b.media.gorsel ?? -1) - (a.b.media.gorsel ?? -1)"));
kontrol("denetim yoksa eski eşit aralıklı tarama korunuyor",
  rd.includes("// Denetim puanı hiç yoksa (denetim kapalı) eski eşit aralıklı tarama."));

// SEO tarafı: kapak metni gelmezse başlıktan türetiliyor mu?
const so = fs.readFileSync(new URL("../src/pipeline/seo.js", import.meta.url), "utf8");
kontrol("kapak metni modelden gelmezse başlıktan türetiliyor",
  so.includes("Kapak metni modelden gelmedi"));
kontrol("kapak metni en fazla 4 kelimeye indiriliyor",
  (so.match(/slice\(0, 4\)\.join\(" "\)/g) || []).length >= 2,
  "uzun başlığı kapağa basmak kesilmeye yol açıyordu");

try { fs.rmSync(DIR, { recursive: true, force: true }); } catch {}
console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
