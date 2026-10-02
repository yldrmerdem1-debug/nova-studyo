// ALTYAZIDA NOKTALAMA OLMALI — VE ÖBEKLEME CÜMLE SINIRINI GÖRMELİ.
//
// ÖLÇÜLEN KUSUR (20260811-d6e97f, gerçek subs.srt):
//     "May 2012 A woman named Cathy Hutchinson lifts"
//     "time in fifteen years Her arm doesn't move"
//     "chip reading her motor cortex It's beautiful"
// 2012'den sonraki nokta yok, "years"tan sonraki nokta yok — cümleler
// birbirine giriyor ve okunurluk düşüyor.
//
// Sebep: altyazı TTS'in KELİME ZAMANLAMALARINDAN kuruluyor; o kelimeler
// noktalamasız geliyor. Özgün metin zaten elde duruyordu, kullanılmıyordu.
//
// İKİNCİ, GİZLİ KUSUR: subtitles.js'teki öbekleme ZATEN noktalamaya bakıyordu
// (`/[.!?…]$/`, `/[,;:]$/`). Noktalama hiç gelmediği için o dallar hiç
// çalışmadı — altyazı yalnızca 42 karakterde kesildi ve cümle sınırına saygı
// gösteren tasarım sessizce devre dışı kaldı. Tek düzeltme ikisini de açıyor.
import fs from "node:fs";
import assert from "node:assert";
import { buildCaptions, noktalamaGeriYaz, buildSrt } from "../src/pipeline/subtitles.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

/** TTS'in verdiği şekle benzet: noktalamasız kelimeler + zamanlar. */
function kelimele(metin, basla = 0, hiz = 0.3) {
  return metin.split(/\s+/).filter(Boolean).map((w, i) => ({
    t: w.replace(/[^\p{L}\p{N}']/gu, ""),
    start: basla + i * hiz,
    end: basla + (i + 1) * hiz,
  }));
}

const METIN = "May 2012. A woman named Cathy Hutchinson lifts a cup of coffee to her lips for the first time in fifteen years. Her arm doesn't move.";

// ---------------------------------------------------------------------------
// 1) GERİ YAZMA
// ---------------------------------------------------------------------------
{
  const w = kelimele(METIN);
  const geri = noktalamaGeriYaz(w, METIN);
  const birlesik = geri.map((x) => x.t).join(" ");
  kontrol("kelime sayısı değişmiyor", geri.length === w.length, `${geri.length} vs ${w.length}`);
  kontrol("cümle sonu noktası geri geldi", /2012\./.test(birlesik), birlesik.slice(0, 60));
  kontrol("ikinci cümlenin noktası da geldi", /years\./.test(birlesik));
  kontrol("zamanlar korunuyor",
    geri.every((x, i) => x.start === w[i].start && x.end === w[i].end));
  kontrol("kesme işareti bozulmuyor", /doesn't/.test(birlesik), birlesik.slice(-40));
}
{
  // Metin verilmezse hiçbir şey bozulmamalı (eski davranış).
  const w = kelimele(METIN);
  kontrol("metin yoksa kelimeler olduğu gibi dönüyor",
    noktalamaGeriYaz(w, "").map((x) => x.t).join(" ") === w.map((x) => x.t).join(" "));
  kontrol("boş kelime listesi çökertmiyor", noktalamaGeriYaz([], METIN).length === 0);
}
{
  // TTS kelimeyi ATLASA bile hizalama kaymamalı — metin asla bozulmamalı.
  const w = kelimele(METIN).filter((_, i) => i !== 5);
  const geri = noktalamaGeriYaz(w, METIN);
  kontrol("TTS kelime atlarsa hizalama toparlıyor", /years\./.test(geri.map((x) => x.t).join(" ")),
    "ileri bakış olmasaydı bu noktadan sonrası kayardı");
  kontrol("atlama olsa da kelime sayısı korunuyor", geri.length === w.length);
}
{
  // Türkçe: hem noktalama hem büyük İ/ı doğru eşleşmeli.
  const tr = "Petriç'te doğdu. Kör bir kadındı, herkes ona inandı.";
  const geri = noktalamaGeriYaz(kelimele(tr), tr);
  const b = geri.map((x) => x.t).join(" ");
  kontrol("Türkçe noktalama geri geliyor", /doğdu\./.test(b) && /kadındı,/.test(b), b);
}

// ---------------------------------------------------------------------------
// 2) ÖBEKLEME ARTIK CÜMLE SINIRINI GÖRÜYOR
// ---------------------------------------------------------------------------
{
  const seg = { offset: 0, duration: 12, words: kelimele(METIN), text: METIN };
  const capsYok = buildCaptions([{ ...seg, text: "" }], "classic");
  const caps = buildCaptions([seg], "classic");

  const noktaIle = caps.filter((c) => /[.!?]$/.test(c.text.trim())).length;
  const noktaYok = capsYok.filter((c) => /[.!?]$/.test(c.text.trim())).length;
  console.log(`     noktalamasız ${capsYok.length} öbek (${noktaYok}'i noktayla bitiyor) → ` +
    `noktalamalı ${caps.length} öbek (${noktaIle}'i noktayla bitiyor)`);
  kontrol("öbekler artık cümle sonunda bitiyor", noktaIle >= 2, `${noktaIle} öbek`);
  kontrol("noktalamasız hâlde bu hiç olmuyordu", noktaYok === 0, `${noktaYok}`);
  kontrol("altyazı metni noktalama taşıyor", caps.some((c) => /2012\./.test(c.text)));
}
{
  // SRT çıktısında da görünmeli — kullanıcının şikâyet ettiği dosya bu.
  // buildSrt TIMELINE alıyor (caption değil); kendisi buildCaptions çağırıyor.
  const seg = { offset: 0, duration: 12, words: kelimele(METIN), text: METIN };
  const srt = buildSrt([seg]);
  kontrol("SRT dosyasında noktalama var", /2012\./.test(srt) && /years\./.test(srt));
  kontrol("gerçek kusurdaki 'years Her' birleşmesi kalmadı", !/years Her/.test(srt),
    srt.split(/\r?\n/).filter((l) => /years/.test(l)).join(" | "));
}
{
  // Gerçek Apollo 13 SRT'sinde 00:03:19,1000 oluştu; YouTube bu zamanı
  // reddedebilir. Milisaniye yuvarlaması saniye/dakika devrini taşımalı.
  const seg = {offset:0,duration:61,words:[
    {t:'Minute',start:59.9996,end:60.9996},
  ],text:'Minute'};
  const srt=buildSrt([seg]);
  kontrol('SRT milisaniye taşmasını saniye ve dakikaya aktarıyor',
    /00:01:00,000 --> 00:01:01,120/.test(srt),srt.split('\n')[1]);
  kontrol('SRT hiçbir zaman dört haneli milisaniye yazmıyor',
    !/,1000\b/.test(srt),srt.split('\n')[1]);
}

// ---------------------------------------------------------------------------
// 2b) SATIR TAVANI AŞILMAMALI
// ---------------------------------------------------------------------------
// Ölçülen kusur (20260812-b499f0): 73 satırın 12'si 45 karakterden uzundu,
// en uzunu 48. Sebep, kelimeyi EKLEDİKTEN sonra sınıra bakmaktı; son kelime
// dizildikten sonra kontrol doğru olsa da satır çoktan taşmış oluyordu.
// Uzun satır küçük ekranda iki satıra sarıp görüntüyü kapatıyor.
{
  const uzunMetin =
    "She reached out with a robotic arm she was moving by thought alone, and the room went quiet. " +
    "In 1924 a German psychiatrist named Hans Berger recorded the first human EEG, proof that " +
    "thinking leaks measurable electricity into the world around us.";
  const caps = buildCaptions([{ offset: 0, duration: 20, words: kelimele(uzunMetin), text: uzunMetin }], "classic");
  const uzunlar = caps.filter((c) => c.text.length > 42);
  const enUzun = Math.max(...caps.map((c) => c.text.length));
  console.log(`     ${caps.length} satır, en uzunu ${enUzun} karakter`);
  kontrol("hiçbir satır 42 karakteri aşmıyor", uzunlar.length === 0,
    uzunlar.map((c) => `${c.text.length}: ${c.text}`).join(" | ").slice(0, 140));
  kontrol("satırlar boş kalmıyor", caps.every((c) => c.text.trim().length > 0));
  kontrol("tüm kelimeler korunuyor",
    caps.map((c) => c.text).join(" ").split(/\s+/).length === uzunMetin.split(/\s+/).length,
    "bölme sırasında kelime düşmemeli");
}

// ---------------------------------------------------------------------------
// 3) BAĞLANTI
// ---------------------------------------------------------------------------
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("render özgün metni altyazıya veriyor",
    /timeline = flat\.map\(\(f\) => \(\{[^}]*text: f\.text/.test(r),
    "text geçilmezse geri yazma yapacak bir şey bulamaz");
  const s = fs.readFileSync(new URL("../src/pipeline/subtitles.js", import.meta.url), "utf8");
  kontrol("buildCaptions geri yazmayı çağırıyor", /noktalamaGeriYaz\(ham\.words, ham\.text\)/.test(s));
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
