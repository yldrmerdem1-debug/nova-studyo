// XML kaçışı: "&" veya "<" geçen bir cümle SESSİZ KALMAMALI.
// Bu gerçek bir hataydı — kaçış olmadan Edge sunucusu bağlantıyı turn.end
// göndermeden kapatıyor ve o segment tamamen sessiz çıkıyor.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// voice.js'teki kaçış ile birebir aynı olmalı; kopyası burada tutuluyor ki
// test ağdan bağımsız olarak da kaçış mantığını doğrulayabilsin.
const xmlKacir = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

kontrol("kacis & isaretini cevirir", xmlKacir("Tom & Jerry") === "Tom &amp; Jerry");
kontrol("kacis < ve > cevirir", xmlKacir("5 < 10 > 3") === "5 &lt; 10 &gt; 3");
kontrol("kacis duz metni bozmaz", xmlKacir("Mariana Cukuru 10.935 m") === "Mariana Cukuru 10.935 m");

// --- ağ testi: sadece bağlantı varsa çalışır, yoksa atlanır ---
const D = path.join(os.tmpdir(), "nova-ses-xml");
fs.rmSync(D, { recursive: true, force: true });

async function sesUret(ad, metin) {
  const dir = path.join(D, ad);
  fs.mkdirSync(dir, { recursive: true });
  const t = new MsEdgeTTS();
  try {
    await t.setMetadata("tr-TR-AhmetNeural", OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const r = await t.toFile(dir, metin);
    const f = typeof r === "string" ? r : r?.audioFilePath;
    return f && fs.existsSync(f) ? fs.statSync(f).size : 0;
  } finally { try { t.close(); } catch {} }
}

let agVar = true;
try { await sesUret("saglik", "Deneme."); } catch { agVar = false; }

if (!agVar) {
  console.log("ATLA  ag yok — canli TTS dogrulamasi calistirilmadi");
} else {
  const metin = "Johnson & Johnson sirketi 5 < 10 orani ile calisiyor.";
  let kacissiz = 0;
  try { kacissiz = await sesUret("ham", metin); } catch { kacissiz = 0; }
  const kacisli = await sesUret("kacisli", xmlKacir(metin));
  kontrol("kacis olmadan ses uretilemiyor (hatanin kendisi)", kacissiz < 500, kacissiz + " bayt");
  kontrol("kacis ile ses uretiliyor", kacisli > 5000, kacisli + " bayt");
}

// ---------- ElevenLabs: anlatim kalitesini etkileyen parametreler ----------
// Hepsi canli API'de KABUL edildigi dogrulandi (2026-08-07). Buradaki test
// kodun onlari GERCEKTEN gonderdigini kilitler — sessizce dusmesinler.
{
  const kaynak = await import("node:fs").then((m) =>
    m.readFileSync(new URL("../src/pipeline/voice.js", import.meta.url), "utf8"));

  kontrol("192 kbps isteniyor, reddedilirse 128'e dusuluyor",
    /mp3_44100_192/.test(kaynak) && /yuksekBitrateKapali = true/.test(kaynak));
  kontrol("voice_settings gonderiliyor", /use_speaker_boost/.test(kaynak));
  kontrol("konusma hizi ayarlanabilir", /speed: st\.elevenSpeed/.test(kaynak));
  // Uzun videoda en cok duyulan kusur: her segment ayri istek oldugu icin
  // tonlama segment basinda sifirlaniyor. Komsu metin bunu duzeltiyor.
  kontrol("komsu segment metni gonderiliyor (tonlama surekliligi)",
    /previous_text/.test(kaynak) && /next_text/.test(kaynak));
  // Komsu metin cagri yerinden beslenmeli. Ses etiketi eklendiginde bu satirlar
  // etiketleriAyikla() ile sarildi — baglamdaki "[laughs]" tonlamayi yaniltir.
  // Kontrol o yuzden sarmalayiciyi degil, KAYNAGI ariyor.
  kontrol("komsu metin gercekten cagri yerinden besleniyor",
    /onceki:[^\n]*segs\[sira - 1\]/.test(kaynak) && /sonraki:[^\n]*segs\[sira \+ 1\]/.test(kaynak));
  kontrol("komsu baglamdan ses etiketi ayiklaniyor",
    /onceki: etiketleriAyikla/.test(kaynak) && /sonraki: etiketleriAyikla/.test(kaynak));
  // Olculdu: "auto" ile 10935 ham rakam kaliyor, "on" ile okunuyor.
  kontrol("sayi/tarih normallestirme aciik", /apply_text_normalization/.test(kaynak));
  kontrol("dil kilidi gonderiliyor", /language_code/.test(kaynak));

  const { getSettings } = await import("../src/config.js");
  const st = getSettings();
  kontrol("normallestirme varsayilani 'on'", (st.elevenNormalize || "on") === "on", String(st.elevenNormalize));
  kontrol("hiz varsayilani 1.0", (st.elevenSpeed ?? 1) === 1, String(st.elevenSpeed));
}

console.log(hata === 0 ? "\nSES XML TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
