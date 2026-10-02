// ALAKASIZ GÖRSEL YERİNE TİPOGRAFİ — KAPI GERÇEKTEN AÇILMALI.
//
// ÖLÇÜLEN KUSUR (20260811-5ef0d8): bitmiş videoda görsel isabeti %45 çıktı
// (38 karenin 21'i zayıf/alakasız). Buna karşılık TEK BİR SAHNE bile
// tipografiye düşmedi — log'da tek satır yok.
//
// Sebep: kapı üç koşula bağlıydı ve ikincisi "sorguda özel ad OLMASIN"du.
// Oysa sorgu onarımı adımı 19/19 sorguya BİLEREK özel ad koyuyor
// ("Noland Arbaugh Neuralink electrodes", "Alexander Huth semantic decoder
// fMRI"). Yani iki iyi özellik birbirini iptal ediyordu: sorgular
// iyileştikçe tipografi güvenliği kapanıyordu.
//
// Mantık da hatalıydı: birinci koşul zaten "denetim BU GÖRSELE kötü dedi"
// diyor; SORGUDAKİ özel ad, gelen GÖRSEL hakkında hiçbir şey söylemez.
// Nitekim "Neuralink N1 implant coin size" sorgusuna NASA'dan uzay fotoğrafı
// geldi ve tam bu koşul yüzünden ekranda kaldı.
import fs from "node:fs";
import assert from "node:assert";
import { somutCapaVar } from "../src/pipeline/cumlehizasi.js";
import { ozelAdIcerir } from "../src/pipeline/media.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

const src = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
const kapi = src.match(/const sahneMedyasi = [\s\S]*?\n  \};/)?.[0] || "";
kontrol("sahneMedyasi bulundu", kapi.length > 200);

// ---------------------------------------------------------------------------
// 1) KALDIRILAN KOŞUL GERİ GELMEMELİ
// ---------------------------------------------------------------------------
kontrol("sorgudaki özel ad artık kapıyı kapatmıyor",
  !/ozelAdIcerir\([^)]*\)\)\s*return m;/.test(kapi),
  "bu koşul yüzünden 5ef0d8'de kapı hiç açılmadı");
kontrol("render.js artık ozelAdIcerir'i hiç kullanmıyor",
  !/ozelAdIcerir/.test(src),
  "kullanılmayan ithal bırakmak sonraki okuyucuyu yanıltır");

// ---------------------------------------------------------------------------
// 2) KALAN KOŞULLAR YERİNDE
// ---------------------------------------------------------------------------
kontrol("denetim puanı koşulu duruyor",
  /!Number\.isFinite\(m\.gorsel\) \|\| m\.gorsel > 1/.test(kapi),
  "denetim iyi dediyse fotoğraf yazıya çevrilmemeli");
kontrol("denetim hiç çalışmadıysa fotoğraf korunuyor",
  /!Number\.isFinite\(m\.gorsel\)/.test(kapi),
  "puan yoksa tahmin yürütmek yanlış — kredi bittiğinde her sahne yazıya dönerdi");
kontrol("somut çapa koşulu duruyor", /somutCapaVar\(metin\)/.test(kapi));
kontrol("tavan hâlâ var (video yazıya boğulmasın)",
  /TIPOGRAFI_TAVANI = 0\.\d+/.test(src));

// ---------------------------------------------------------------------------
// 3) GERÇEK CÜMLELERLE DAVRANIŞ
// ---------------------------------------------------------------------------
// Kapının kalan iki koşulunu gerçek verilerle canlandır: denetim kötü demiş
// (gorsel<=1) + cümlede somut çapa yok  ->  tipografi adayı.
const kapiAcilir = (gorsel, metin) => Number.isFinite(gorsel) && gorsel <= 1 && !somutCapaVar(metin);

{
  // 5ef0d8'den GERÇEK cümleler. Soyut olanlar tipografiye düşmeliydi.
  const soyut = [
    "So forget mind control. The real danger is duller and much closer.",
    "Boosting existing code, not uploading kung fu.",
    "And everyone never happens.",
  ];
  const somut = [
    "In 2004 a paralyzed man named Matthew Nagle played Pong with ninety-six electrodes.",
    "Colorado and California followed in 2024.",
  ];
  const acilan = soyut.filter((t) => kapiAcilir(1, t)).length;
  kontrol("soyut cümlelerde kapı açılıyor", acilan >= 2, `${acilan}/${soyut.length}`);
  const kapali = somut.filter((t) => !kapiAcilir(1, t)).length;
  kontrol("somut cümlelerde kapı kapalı kalıyor", kapali === somut.length,
    `${kapali}/${somut.length} — isim/yıl geçen cümlede fotoğraf aranmaya devam etmeli`);
}
{
  // ASIL KUSURUN CANLANDIRMASI: özel ad taşıyan sorgu + soyut cümle + kötü puan.
  const sorgu = "Neuralink N1 implant coin size";
  const metin = "So forget mind control. The real danger is duller and much closer.";
  kontrol("sorgu özel ad taşısa da kapı açılıyor",
    ozelAdIcerir(sorgu) && kapiAcilir(1, metin),
    "eski kod tam burada erken çıkıp NASA uzay fotoğrafını ekranda bırakıyordu");
}
{
  kontrol("denetim iyi dediyse (2-3) kapı açılmıyor",
    !kapiAcilir(2, "And everyone never happens.") && !kapiAcilir(3, "Boosting existing code."));
  kontrol("denetim çalışmadıysa (undefined) kapı açılmıyor",
    !kapiAcilir(undefined, "And everyone never happens."));
}

console.log(hata ? `\n${hata} kontrol BAŞARISIZ` : "\nTüm kontroller geçti");
assert.equal(hata, 0);
