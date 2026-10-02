import fs from "node:fs";
import path from "node:path";
import { validVoice, fingerprint } from "./checkpoints.js";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { getSettings, getJobSettings, TONE_PROSODY, TONE_ELEVEN, TONE_ETIKET, etiketleriAyikla, VOICES, wordsPerMinute } from "../config.js";
import { ffprobeDuration, mapLimit, readJson, sleep, run } from "../util.js";

// ---------- kelime zamanlaması ----------

function parseEdgeMetadata(file) {
  const items = readJson(file, []);
  const words = [];
  const flat = Array.isArray(items) ? items : [items];
  for (const it of flat) {
    const metas = it?.Metadata || (it?.Type ? [it] : []);
    for (const m of metas) {
      if (m?.Type !== "WordBoundary") continue;
      const d = m.Data || {};
      const start = (d.Offset || 0) / 1e7;
      const dur = (d.Duration || 0) / 1e7;
      // SSML'e kaçırarak gönderdik (xmlKacir); kelime sınırları da kaçırılmış
      // hâlde dönüyor. Ekrana "&amp;" basmamak için geri çöz.
      const t = (d?.text?.Text ?? d?.Text ?? "")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      if (t) words.push({ t, start, end: start + dur });
    }
  }
  return words;
}

/** Zamanlama yoksa: kelime uzunluğuna + noktalamaya göre tahmin dağıt. */
export function estimateWords(text, duration) {
  const raw = text.split(/\s+/).filter(Boolean);
  if (!raw.length) return [];
  const weights = raw.map((w) => {
    let wt = Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, "").length) + 0.8;
    if (/[.!?…]$/.test(w)) wt += 3.2;
    else if (/[,;:]$/.test(w)) wt += 1.6;
    return wt;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let t = 0;
  return raw.map((w, i) => {
    const d = (weights[i] / total) * duration;
    const item = { t: w, start: t, end: t + d };
    t += d;
    return item;
  });
}

// ---------- Edge TTS ----------

/**
 * Metni SSML gövdesine koymadan önce XML'e göre kaçır.
 * msedge-tts metni <speak> içine OLDUĞU GİBİ gömüyor; kaçırmıyor. Bu yüzden
 * "Johnson & Johnson" ya da "5 < 10" geçen bir cümle SSML'i bozuyor ve sunucu
 * bağlantıyı turn.end göndermeden kapatıyor — o segment TAMAMEN sessiz kalıyor.
 * (Ölçüldü: düz metin 22 KB, "&" geçen metin bağlantı hatası.)
 */
function xmlKacir(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function edgeSynthOnce(text, voiceId, prosody, outDir) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voiceId, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
      wordBoundaryEnabled: true,
    });
    const { audioFilePath, metadataFilePath } = await tts.toFile(outDir, xmlKacir(text), prosody);
    return { audioFilePath, metadataFilePath };
  } finally {
    try { tts.close(); } catch {}
  }
}

/** Metnin kabaca kaç saniye sürmesi gerektiği — kesik ses yakalamak için alt sınır. */
function minAcceptableDuration(text, lang) {
  // Metin eksik gelirse ÇÖKME. Ölçüldü (20260809-3d2ca5 ve -d21945): senaryonun
  // bir bölümü metinsiz döndü ve iş, medya için para harcandıktan SONRA tam
  // burada patladı. Eksik metin bir hata olabilir ama çökme sebebi olmamalı.
  const words = String(text || "").split(/\s+/).filter(Boolean).length;
  return Math.max(0.5, (words / wordsPerMinute(lang)) * 60 * 0.45);
}

/**
 * Edge TTS bağlantısı bazen yarıda kopar: dosya oluşur ama içi kesiktir ve
 * hata FIRLATILMAZ. Bu yüzden süreyi doğrulayıp kısaysa yeniden deniyoruz.
 * (48 segmentlik bir işte bu olmadan tek bir kesik segment tüm videoyu düşürüyor.)
 */
async function edgeSynth(text, voiceId, prosody, outDir, lang, ffprobePath) {
  const minDur = minAcceptableDuration(text, lang);
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      if (attempt > 0) {
        // önceki kesik dosyaları temizle
        try { for (const f of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, f), { force: true }); } catch {}
        await sleep(700 * attempt + Math.random() * 400);
      }
      const r = await edgeSynthOnce(text, voiceId, prosody, outDir);
      const dur = await ffprobeDuration(ffprobePath, r.audioFilePath);
      if (dur >= minDur) return { ...r, duration: dur };
      lastErr = new Error(`ses kesik geldi (${dur.toFixed(1)}sn, beklenen ≥${minDur.toFixed(1)}sn)`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Edge TTS 5 denemede başarısız: ${lastErr?.message || "bilinmeyen"}`);
}

// ---------- ölü hava kırpma ----------

/**
 * Uzun duraklamaları kısaltır ve KELİME ZAMANLARINI da kaydırır.
 *
 * Ölçüldü: Edge TTS her cümle sonuna sabit ~1,38 saniye MUTLAK sessizlik koyuyor,
 * üstüne baş sessizliği biniyor. 20 çıktının hepsinde videonun %23-29'u hiçbir
 * sesin olmadığı boşluktu. İzleyici bunu teknik arıza sanıyor; anlatım "hızlı
 * konuş, uzun dur" ritmine düşüyor (konuşma içinde 150 kelime/dk, ham ortalamada 109).
 *
 * Kritik nokta: sadece sesi kırpmak YETMEZ. Kelime zaman damgaları kırpma
 * öncesine göre olduğu için altyazı ve kinetik yazı kayardı. Burada kaldırılan
 * aralıklar ölçülüp her kelime zamanı geri çekiliyor.
 *
 * @returns { file, duration, words } — kırpma yapılamazsa girdiler aynen döner
 */
export async function kirpDuraklamalar(src, dest, words, { ffmpegPath, ffprobePath, maxDur = 0.5, esik = -45 } = {}) {
  // 1) Kaldırılacak aralıkları ÖNCE tespit et (silenceremove bunu bildirmiyor)
  const bulunan = [];
  try {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync(ffmpegPath, [
      "-i", src, "-af", `silencedetect=noise=${esik}dB:d=${maxDur}`, "-f", "null", "-",
    ], { encoding: "utf8" });
    const cikti = (r.stderr || "") + (r.stdout || "");
    let bas = null;
    for (const m of cikti.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
      if (m[1] === "start") bas = parseFloat(m[2]);
      else if (bas !== null) {
        const son = parseFloat(m[2]);
        // Sessizliğin maxDur kadarı KORUNUR (doğal duraklama), fazlası atılır
        if (son - bas > maxDur) bulunan.push({ from: bas + maxDur, to: son });
        bas = null;
      }
    }
  } catch { /* tespit edilemedi → kırpma yapma */ }

  if (!bulunan.length) return null;

  // 2) Sesi kırp
  await run(ffmpegPath, [
    "-i", src, "-af",
    `silenceremove=start_periods=1:start_duration=0.06:start_threshold=${esik}dB:` +
    `stop_periods=-1:stop_duration=${maxDur}:stop_threshold=${esik}dB:detection=rms`,
    "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", "-y", dest,
  ]);
  const yeniSure = await ffprobeDuration(ffprobePath, dest);
  if (!(yeniSure > 0.2)) return null;   // kırpma bozduysa vazgeç

  // 3) Kelime zamanlarını kaydır: t'den ÖNCE kaldırılan toplam süre kadar geri çek
  const kaydir = (t) => {
    if (!Number.isFinite(t)) return t;
    let cikar = 0;
    for (const c of bulunan) {
      if (t >= c.to) cikar += c.to - c.from;
      else if (t > c.from) { cikar += t - c.from; break; }
      else break;
    }
    return +Math.max(0, t - cikar).toFixed(3);
  };
  const yeniWords = (words || []).map((w) => ({
    ...w, start: kaydir(w.start), end: kaydir(w.end),
  }));

  const kazanc = bulunan.reduce((a, c) => a + (c.to - c.from), 0);
  return { file: dest, duration: yeniSure, words: yeniWords, kazanc, sayi: bulunan.length };
}

// ---------- ElevenLabs ----------

// 192 kbps yalnızca Creator ve üstünde açık; ücretsiz/Starter planda API
// 403 "subscription_required" döndürüyor (ölçüldü). Bir kez denenir, reddedilirse
// oturum boyunca 128'e düşülür — her segmentte boş istek atmanın anlamı yok.
let yuksekBitrateKapali = false;

const ELEVEN_ERROR_MESSAGES = {
  payment_issue: "ElevenLabs ödeme sorunu bildirdi: son fatura ödenmemiş veya ödeme tamamlanmamış olabilir. ElevenLabs hesabındaki faturalandırmayı kontrol edin.",
  invalid_api_key: "ElevenLabs API anahtarı geçersiz. Ayarlar bölümündeki anahtarı kontrol edin.",
  missing_permissions: "ElevenLabs API anahtarında metinden sese dönüştürme izni yok. Anahtar izinlerini ElevenLabs hesabından kontrol edin.",
  authorization_error: "ElevenLabs isteği yetkilendirilemedi. Hesap ve API anahtarı izinlerini kontrol edin.",
  quota_exceeded: "ElevenLabs karakter kotası doldu. Hesaptaki kullanım ve kota durumunu kontrol edin.",
  voice_not_found: "Seçilen ElevenLabs sesi bulunamadı veya bu hesap tarafından erişilemiyor. Ses seçimini kontrol edin.",
  max_character_limit_exceeded: "Metin ElevenLabs isteğinin karakter sınırını aşıyor. Metni daha küçük bölümlere ayırın.",
  subscription_required: "ElevenLabs planı istenen özellik veya ses biçimini desteklemiyor. Hesap planını kontrol edin.",
  output_format_not_available: "ElevenLabs planı istenen ses biçimini desteklemiyor. Daha düşük ses kalitesiyle yeniden denenebilir.",
  output_format_not_allowed: "ElevenLabs planı istenen ses biçimine izin vermiyor. Daha düşük ses kalitesiyle yeniden denenebilir.",
  output_format_requires_subscription: "İstenen ElevenLabs ses biçimi daha yüksek bir abonelik planı gerektiriyor. Daha düşük ses kalitesiyle yeniden denenebilir.",
  bitrate_not_allowed: "ElevenLabs planı istenen ses bit hızına izin vermiyor. Daha düşük ses kalitesiyle yeniden denenebilir.",
};

function safeElevenCode(value) {
  const code = String(value || "").trim().toLowerCase();
  return /^[a-z0-9_.-]{1,80}$/.test(code) ? code : "unknown";
}

function bitrateSubscriptionDenial(code, providerMessage, httpStatus) {
  if (Number(httpStatus) !== 403) return false;
  if (["output_format_not_available", "output_format_not_allowed", "output_format_requires_subscription", "bitrate_not_allowed"].includes(code)) return true;
  if (code !== "subscription_required") return false;
  const message = String(providerMessage || "").toLowerCase();
  const mentionsFormat = /mp3_44100_192|192\s*k(?:b|bit)|output[_ -]?format|bitrate|audio quality|high(?:er)? quality/.test(message);
  const mentionsPlan = /subscription|plan|tier|creator|upgrade/.test(message);
  return mentionsFormat && mentionsPlan;
}

/**
 * ElevenLabs hata gövdesini kullanıcıya taşımadan sınıflandırır.
 * Sağlayıcının `detail.message` alanı hesap/fatura ayrıntısı içerebildiği için
 * dönen Error'a veya loga eklenmez; yalnız güvenli durum kodu korunur.
 */
export async function elevenErrorFromResponse(res) {
  let detail = {};
  try {
    const raw = await res.text();
    const parsed = JSON.parse(raw);
    detail = parsed?.detail && typeof parsed.detail === "object" ? parsed.detail : parsed || {};
  } catch { /* okunamayan/JSON olmayan gövde bilinmeyen hata olarak kalır */ }
  const code = safeElevenCode(detail?.status || detail?.code);
  const httpStatus = Number(res?.status) || 0;
  const fallback = httpStatus === 401
    ? "ElevenLabs isteği yetkilendirilemedi (HTTP 401). Hesap ve API anahtarı durumunu kontrol edin."
    : httpStatus === 402
      ? "ElevenLabs isteği ödeme veya plan kısıtı nedeniyle reddedildi (HTTP 402). Hesap durumunu kontrol edin."
      : httpStatus === 403
        ? "ElevenLabs isteğine izin verilmedi (HTTP 403). Hesap planı ve API anahtarı izinlerini kontrol edin."
        : httpStatus === 429
          ? "ElevenLabs istek sınırı veya kota nedeniyle isteği reddetti (HTTP 429). Hesaptaki kullanım durumunu kontrol edin."
          : `ElevenLabs hizmeti isteği tamamlayamadı (HTTP ${httpStatus || "bilinmiyor"}).`;
  const error = new Error(ELEVEN_ERROR_MESSAGES[code] || fallback);
  error.name = "ElevenLabsError";
  error.provider = "elevenlabs";
  error.code = code;
  error.providerStatus = code;
  error.httpStatus = httpStatus;
  error.status = httpStatus;
  error.statusCode = httpStatus || 400;
  error.retryAt128 = bitrateSubscriptionDenial(code, detail?.message, httpStatus);
  return error;
}

async function elevenIstek(text, voiceId, format, baglam = {}) {
  const st = baglam.settings || getSettings();
  return fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${format}`,
    {
      method: "POST",
      headers: { "xi-api-key": st.elevenKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        // MODEL TONA GÖRE.
        //
        // v3 metindeki [laughs] gibi etiketleri OYNUYOR — komik/alaycı tonlarda
        // asıl fark bu. Ama v3 `stability`/`style` DESTEKLEMİYOR (model
        // listesinde yalnızca "tts" yazıyor), o yüzden etiketi olmayan tonlar
        // v2'de kalır ve orada ton→ses eşlemesi (canlı okuma) çalışır.
        // Kullanıcı ayardan model seçtiyse o kazanır.
        model_id: st.elevenModel || (baglam.v3 ? "eleven_v3" : "eleven_multilingual_v2"),
        // Bu blok hiç gönderilmiyordu; ElevenLabs kendi varsayılanlarını
        // kullanıyordu. Belgesel anlatımında istikrar önemli — cümleden cümleye
        // ton kayması uzun videoda yorucu oluyor.
        // TON BURAYA DA GİRER.
        //
        // Eskiden ton HİÇ kullanılmıyordu: her videoda stability 0,45 ve
        // style 0 sabit gidiyordu. `style: 0` en düz okuma demek, yani komik
        // seçilse bile ElevenLabs metni belgesel ağzıyla okuyordu ve espri
        // ölüyordu. Edge tarafında ton en azından hıza yansıyordu, burada
        // hiçbir şeye yansımıyordu.
        //
        // Kullanıcının kendi ayarı varsa O KAZANIR (elevenStability/elevenStyle
        // elle girilmişse tona bakılmaz) — ayarı ezmek doğru olmaz.
        voice_settings: {
          stability: st.elevenStability ?? baglam.tonSes?.stability ?? 0.45,
          similarity_boost: st.elevenSimilarity ?? 0.75,
          style: st.elevenStyle ?? baglam.tonSes?.style ?? 0,
          use_speaker_boost: st.elevenSpeakerBoost !== false,
          speed: st.elevenSpeed ?? 1.0,
        },
        // KOMŞU METİN — uzun videoda en çok duyulan kusurun ilacı.
        // Her segment AYRI istekle seslendiriliyor; model önceki cümleyi
        // bilmediği için tonlama her segment başında sıfırlanıyor ve video
        // "yan yana dizilmiş cümleler" gibi duyuluyordu. Komşu metin verilince
        // model cümleyi bir paragrafın ortasıymış gibi okuyor.
        ...(baglam.onceki ? { previous_text: baglam.onceki } : {}),
        ...(baglam.sonraki ? { next_text: baglam.sonraki } : {}),
        // SAYI/TARİH OKUMA. Ölçüldü: varsayılan "auto" ile "10935" ham rakam
        // olarak kalıyor; "on" ile "ten thousand nine hundred thirty-five"
        // diye okunuyor. Belgesel sayı dolu, bu şart.
        // Kritik ayrıntı: `alignment` SENARYO metnini korur, yalnızca
        // `normalized_alignment` değişir — yani ekrandaki yazı "10.935 m"
        // kalırken ses doğru okur. Kelime zamanları `alignment`tan alınıyor.
        apply_text_normalization: st.elevenNormalize || "on",
        // Dil kilidi: özel adların yanlış dilde okunmasını engeller.
        ...(baglam.dil ? { language_code: baglam.dil } : {}),
      }),
    }
  );
}

export async function elevenSynth(text, voiceId, outDir, baglam = {}) {
  // Planı destekliyorsa 192 kbps iste — Creator planının satın alınan farkı bu.
  let res;
  if (!yuksekBitrateKapali) {
    res = await elevenIstek(text, voiceId, "mp3_44100_192", baglam);
    if (!res.ok) {
      const error = await elevenErrorFromResponse(res);
      if (!error.retryAt128) throw error;
      yuksekBitrateKapali = true;
      res = await elevenIstek(text, voiceId, "mp3_44100_128", baglam);
    }
  } else {
    res = await elevenIstek(text, voiceId, "mp3_44100_128", baglam);
  }
  if (!res.ok) {
    throw await elevenErrorFromResponse(res);
  }
  const data = await res.json();
  const audioFilePath = path.join(outDir, "audio.mp3");
  fs.writeFileSync(audioFilePath, Buffer.from(data.audio_base64, "base64"));
  // karakter zamanlarını kelimelere çevir
  const words = [];
  const al = data.alignment || data.normalized_alignment;
  if (al?.characters?.length) {
    let cur = "", start = null, end = 0;
    for (let i = 0; i < al.characters.length; i++) {
      const ch = al.characters[i];
      const s = al.character_start_times_seconds[i];
      const e = al.character_end_times_seconds[i];
      if (/\s/.test(ch)) {
        if (cur) { words.push({ t: cur, start, end }); cur = ""; start = null; }
      } else {
        if (start === null) start = s;
        cur += ch; end = e;
      }
    }
    if (cur) words.push({ t: cur, start, end });
  }
  // SES ETİKETİNİ KELİME LİSTESİNDEN AT.
  //
  // v3'e "[laughs]" gönderiyoruz ve model onu OYNUYOR — ama hizalama o
  // karakterleri aynen geri veriyor (ölçüldü: hizalama metni
  // "...shrugs. [laughs] The atmosphere..." çıktı). Altyazı ve ekrandaki
  // yazı bu listeden kurulduğu için ayıklanmazsa izleyici "[laughs]" YAZISINI
  // okur. Zamanlar korunuyor: yalnızca etiket kelimeleri düşüyor, kalanların
  // start/end değerleri olduğu gibi kalıyor.
  // Köşeli parantez içeren her belirteç etikettir: anlatım metninde köşeli
  // parantez zaten yasak (istem "parantez YAZMA" diyor).
  const temizWords = words.filter((w) => !/[[\]]/.test(w.t));
  return { audioFilePath, words: temizWords };
}

// ---------- ana giriş ----------

/**
 * Tüm segmentleri seslendir.
 * @returns [{segId, text, audio, duration, words}]  (bölüm sırasına göre)
 */
export async function synthesizeAll(job, script, ttsDir, logFn, isCancelled, { cached = [], onResult = () => {} } = {}) {
  const st = getJobSettings(job);
  const voiceKey = fingerprint([job.voiceId,job.elevenVoiceId,job.language,job.tone,st.ttsProvider,st.elevenModel,st.elevenStability,st.elevenStyle,st.elevenSpeed,st.trimSilence]);
  const saved = new Map(cached.filter(Boolean).map(t => [t.segId,t]));
  fs.mkdirSync(ttsDir, { recursive: true });
  const prosody = TONE_PROSODY[job.tone] || TONE_PROSODY.varsayilan;

  const segs = [];
  let idx = 0;
  for (const sec of script.sections)
    // SESLENDİRME ETİKETLİ METNİ OKUR, EKRAN TEMİZİNİ GÖRÜR.
    //
    // seg.ses varsa (ses etiketi içeren hâl) TTS onu okur; seg.text her yerde
    // kullanılan temiz metindir (bkz. script.js sesEtiketleriniAyir). Ayrım
    // orada bir kez yapıldığı için burada tek satır yetiyor.
    for (const seg of sec.segments) segs.push({ segId: `s${idx++}`, text: seg.ses || seg.text });

  const reusable = (s) => { const old=saved.get(s.segId); return validVoice(old,s.text) && (!old.voiceKey || old.voiceKey===voiceKey); };
  if (segs.every(reusable)) { logFn("Seslendirme önbellekten alındı; yeni sağlayıcı isteği yapılmadı."); return segs.map(s => saved.get(s.segId)); }

  let useEleven = st.ttsProvider === "eleven" && st.elevenKey && job.elevenVoiceId;

  // ElevenLabs kotası bu videoya yetiyor mu? Yetmiyorsa 40. segmentte patlamaktansa
  // baştan Edge TTS'e düş — kullanıcı 10 dakikalık işi çöpe atmasın.
  if (useEleven) {
    const chars = segs.filter(s => !reusable(s)).reduce((a, s) => a + s.text.length, 0);
    try {
      const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": st.elevenKey } });
      if (r.ok) {
        const sub = await r.json();
        const left = Math.max(0, (sub.character_limit || 0) - (sub.character_count || 0));
        if (chars > left) {
          useEleven = false;
          logFn(
            `ElevenLabs kotası yetersiz (gereken ${chars.toLocaleString("tr-TR")}, kalan ${left.toLocaleString("tr-TR")} karakter) — ` +
            `Edge TTS'e geçildi, video kesintisiz tamamlanacak.`
          );
        } else {
          logFn(`ElevenLabs kotası uygun: ${chars.toLocaleString("tr-TR")} / ${left.toLocaleString("tr-TR")} karakter kullanılacak.`);
        }
      }
    } catch { /* kota okunamadıysa devam et, hata anında zaten yakalanır */ }
  }

  logFn(`${segs.length} segment seslendiriliyor (${useEleven ? "ElevenLabs" : "Edge TTS — " + (VOICES[job.voiceId]?.name || job.voiceId)})...`);

  let done = 0;
  let kirpToplam = 0, kirpSayi = 0;   // kırpılan ölü hava (sn / adet)
  const results = await mapLimit(segs, useEleven ? 3 : 2, async ({ segId, text }, sira) => {
    if (isCancelled()) throw new Error("cancelled");
    if (reusable({segId,text})) return saved.get(segId);
    const dir = path.join(ttsDir, `${segId}-${fingerprint([text,voiceKey]).slice(0,12)}`);
    fs.mkdirSync(dir, { recursive: true });

    let audio, words = [], duration = 0;
    if (useEleven) {
      // Komşu segmentlerin metni tonlama sürekliliği için gönderilir. Uzunluk
      // sınırlı tutuluyor: bağlam ne kadar uzun olursa istek o kadar şişer,
      // karşılığında kazanç son birkaç cümleden sonra kayboluyor.
      // ETİKETLİ METİN YALNIZCA v3'E. v2 de etiketi oynamaz, okur — bu yüzden
      // v3 devrede değilse temiz metin gönderilir. (Ton etiketsizse zaten
      // metinde etiket olmaz; bu, o varsayım bozulursa diye ikinci kapı.)
      const v3Aktif = !!TONE_ETIKET[job.tone] && !st.elevenModel;
      const okunacak = v3Aktif ? text : etiketleriAyikla(text);
      const r = await elevenSynth(okunacak, job.elevenVoiceId, dir, {
        settings:st,
        onceki: etiketleriAyikla(segs[sira - 1]?.text || "").slice(-300),
        sonraki: etiketleriAyikla(segs[sira + 1]?.text || "").slice(0, 300),
        dil: job.language === "en" ? "en" : "tr",
        // Seçilen tonun ses karşılığı (stability/style) — bkz. TONE_ELEVEN.
        tonSes: TONE_ELEVEN[job.tone] || TONE_ELEVEN.varsayilan,
        // Model seçimi ile gönderilen metin AYNI karara bağlı olmalı: v3
        // değilse etiketler zaten ayıklandı, model de v2 kalmalı.
        v3: v3Aktif,
      });
      audio = r.audioFilePath; words = r.words;
      duration = await ffprobeDuration(st.ffprobePath, audio);
    } else {
      // EDGE ETİKETİ OYNAYAMAZ — HARF HARF OKUR.
      //
      // `[laughs]` gibi ses etiketleri yalnızca ElevenLabs v3'ün anladığı bir
      // şey. Edge TTS onu metin sanıp "bracket laughs" diye okur ve videoyu
      // gülünç değil bozuk yapar. Bu yüzden Edge dalına DAİMA temiz metin
      // gider; etiketli hâl (seg.ses) sadece v3'e özel.
      const r = await edgeSynth(etiketleriAyikla(text), job.voiceId, prosody, dir, job.language, st.ffprobePath);
      audio = r.audioFilePath;
      duration = r.duration;
      if (r.metadataFilePath) words = parseEdgeMetadata(r.metadataFilePath);
    }

    if (!duration || duration < 0.3) throw new Error(`Seslendirme bozuk (${segId})`);
    if (!words.length) words = estimateWords(text, duration);
    // metnin sonundaki sessizliği kırp: son kelime bitişini süreyle sınırla
    words = words.map((w) => ({ ...w, start: Math.min(w.start, duration), end: Math.min(w.end, duration) }));

    // ÖLÜ HAVA KIRPMA. Süre ve kelime zamanları HESAPLANMADAN ÖNCE burada
    // yapılmalı — render zaman çizelgesi ve altyazı bu değerlerden türüyor,
    // sonradan kırpılırsa hepsi kayar.
    if (st.trimSilence !== false) {
      try {
        const kirpik = path.join(dir, "kirpik.wav");
        const r = await kirpDuraklamalar(audio, kirpik, words, {
          ffmpegPath: st.ffmpegPath, ffprobePath: st.ffprobePath, maxDur: 0.5,
        });
        if (r) {
          audio = r.file; duration = r.duration; words = r.words;
          kirpToplam += r.kazanc; kirpSayi += r.sayi;
        }
      } catch { /* kırpma başarısızsa ham sesle devam — akış kırılmasın */ }
    }

    done++;
    if (done % 6 === 0 || done === segs.length) logFn(`Seslendirme: ${done}/${segs.length}`);
    const result = { segId, text, audio, duration, words, voiceKey };
    onResult(result);
    return result;
  });

  const failed = results.filter((r) => !r.ok);
  if (failed.length) throw failed[0].error;
  if (kirpToplam > 1) {
    logFn(`Ölü hava kırpıldı: ${kirpSayi} duraklama, ${kirpToplam.toFixed(1)} sn kazanıldı.`);
  }
  return results.map((r) => r.value);
}

/** Ses önizlemesi (Ayarlar/Stüdyo'daki "dinle" düğmesi). */
export async function previewVoice(voiceId, outDir) {
  const lang = VOICES[voiceId]?.lang || "tr";
  const text = lang === "tr"
    ? "Merhaba! Nova Stüdyo ile videolarınızı ben seslendireceğim."
    : "Hello! I will be the voice of your videos in Nova Studio.";
  const dir = path.join(outDir, voiceId.replace(/[^a-zA-Z0-9-]/g, ""));
  fs.mkdirSync(dir, { recursive: true });
  const cached = path.join(dir, "audio.mp3");
  if (fs.existsSync(cached)) return cached;
  const { audioFilePath } = await edgeSynth(text, voiceId, {}, dir, lang, getSettings().ffprobePath);
  return audioFilePath;
}
