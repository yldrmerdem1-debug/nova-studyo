// SES SEVİYESİ — YouTube hedefi -14 LUFS.
//
// Bitmiş iki video ölçüldüğünde -15,4 ve -16,0 LUFS çıkıyordu. YouTube kısık
// sesi YÜKSELTMEZ, yalnızca yükseği kısar; yani bu fark doğrudan izleyiciye
// gidiyor, video başkalarınınkinden sessiz çalıyordu.
//
// İki ayrı sebep vardı, ikisi de gerçek dosya ölçülerek bulundu (ebur128):
//   A) anlatım mono olarak amix'e giriyordu   -> -15,0 LUFS
//   B) loudnorm tek geçişliydi (hedefi ıskalar) -> kalan 0,3 dB
// Açık stereo dönüşümü + iki geçiş = tam -14,0 LUFS (sapma 0,00).
//
// Bu test o iki korumanın da yerinde durduğunu kilitler — ağ/render gerektirmez.
import fs from "node:fs";
import { olcumAyristir, olcumFiltresi, uygulamaFiltresi, tepeDuzeltmeFiltresi, HEDEF } from "../src/pipeline/loudness.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

// ---- 1. Hedef YouTube standardı ----
kontrol("hedef -14 LUFS", HEDEF.I === -14);
kontrol("tepe tavani -1.5 dBTP", HEDEF.TP === -1.5);

// ---- 2. Ölçüm ayrıştırma ----
{
  const gercek = `
[Parsed_loudnorm_4 @ 000001]
{
	"input_i" : "-23.02",
	"input_tp" : "-8.28",
	"input_lra" : "5.30",
	"input_thresh" : "-34.25",
	"output_i" : "-14.99",
	"target_offset" : "0.99"
}

kontrol("kodlanmis tepe duzeltmesi oversampled ve makeup gainsiz",
  tepeDuzeltmeFiltresi().includes("aresample=192000") &&
  tepeDuzeltmeFiltresi().includes("alimiter=limit=0.6") &&
  tepeDuzeltmeFiltresi().includes("level=false") &&
  tepeDuzeltmeFiltresi().endsWith("aresample=48000"));
`;
  const m = olcumAyristir(gercek);
  kontrol("gercek ffmpeg ciktisi ayristiriliyor", m && m.I === -23.02 && m.TP === -8.28, JSON.stringify(m));
  kontrol("esik ve kaydirma okunuyor", m && m.esik === -34.25 && m.kaydirma === 0.99);

  // JSON stderr'in SONUNDA; oncesinde baska sus parantezler olabilir.
  const kirli = `[graph] {not json at all}\nuyari: {a:1}\n` + gercek;
  kontrol("onceki suslu parantezler atlaniyor", olcumAyristir(kirli)?.I === -23.02);

  kontrol("bos girdi null donuyor", olcumAyristir("") === null);
  kontrol("bozuk girdi null donuyor", olcumAyristir("hic json yok") === null);
  // Tamamen sessiz girdide ffmpeg -inf basar; ikinci gecis bununla bozulur.
  kontrol("sessiz girdi (-inf) null donuyor",
    olcumAyristir(`{"input_i":"-inf","input_tp":"-inf","input_lra":"0","input_thresh":"-inf","target_offset":"0"}`) === null);
}

// ---- 3. Filtre metinleri ----
{
  kontrol("birinci gecis json istiyor", /print_format=json/.test(olcumFiltresi()));
  const u = uygulamaFiltresi({ I: -23.02, TP: -8.28, LRA: 5.3, esik: -34.25, kaydirma: 0.99 });
  for (const alan of ["measured_I=-23.02", "measured_TP=-8.28", "measured_LRA=5.3",
                      "measured_thresh=-34.25", "offset=0.99"]) {
    kontrol(`ikinci gecise ${alan} veriliyor`, u.includes(alan), u);
  }
  kontrol("ikinci gecis TEK kazanc uyguluyor (linear)", /linear=true/.test(u));
  kontrol("ikinci gecis hedefi koruyor", u.includes(`I=${HEDEF.I}`) && u.includes(`TP=${HEDEF.TP}`));
}

// ---- 4. filter_complex sozdizimi ----
// Yasanmis hata: `${zincir}[mix]loudnorm=...` -> "Trailing garbage after a
// filter". Iki filtre ZINCIRI arasinda `;` sart.
{
  const l = fs.readFileSync(new URL("../src/pipeline/loudness.js", import.meta.url), "utf8");
  const zincirler = l.match(/\$\{zincir\}\[mix\][^`]*/g) || [];
  kontrol("her zincir birlesimi var", zincirler.length === 3, String(zincirler.length));
  kontrol("zincirler ';' ile ayriliyor",
    zincirler.every((z) => z.startsWith("${zincir}[mix];[mix]")), zincirler.join(" | "));
  kontrol("olcum gecisi dosyaya YAZMIYOR", /"-f", "null", "-"/.test(l));
  kontrol("olcum alinamazsa tek gecise dusuluyor", /if \(!olcum\)/.test(l));
}

// ---- 5. render.js: anlatım açıkça stereoya çevriliyor ----
{
  const r = fs.readFileSync(new URL("../src/pipeline/render.js", import.meta.url), "utf8");
  kontrol("iki gecisli normalizeEt kullaniliyor", /normalizeEt\(st\.ffmpegPath/.test(r));
  kontrol("render.js'de artik ciplak loudnorm cagrisi yok",
    !/-af", "loudnorm|,loudnorm=I=-14/.test(r));
  kontrol("anlatim ACIKCA stereoya cevriliyor",
    /\[0:a\]aformat=sample_rates=48000:channel_layouts=stereo,asplit=2\[ses\]\[yan\]/.test(r));
  kontrol("sidechain anahtari ayrilan koldan besleniyor", /\[mus\]\[yan\]sidechaincompress/.test(r));
  kontrol("miks ayrilan diger koldan besleniyor", /\[ses\]\[duck\]amix/.test(r));
  // asplit olmadan ayni etiket iki yerde kullanilirsa ffmpeg calismaz.
  kontrol("ayni cikis etiketi iki kez kullanilmiyor",
    !/\[mus\]\[ses\]sidechaincompress/.test(r));
  kontrol("muziksiz yol da stereo", /girdiler = \["-i", narration\][\s\S]{0,120}channel_layouts=stereo/.test(r));
}

console.log(hata === 0 ? "\nSES SEVIYE TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
