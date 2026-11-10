// KREDİ ÖN KONTROLÜ (1.16.23, 24-25 Ekim 2026). Üç video aynı gün sıraya girdi. OpenAI görsel kredisi sıfırdı;
// Nova bunu bilmeden araştırmayı, senaryoyu, sesi ve gerçek klipleri yaptı, sonra görsel adımında 4, 25 ve 26
// görselle takıldı. Eksikleri elle dolduran stok fotoğraflar finans videosuna balinalı monitör ve iş başvuru formu
// soktu (kanal sahibi: "uygulama hata yapmasın"). Yeni iş, başlamadan önce ödediği servislerin kredisine bakar:
// yetmiyorsa hiç başlamaz ve ne yükleneceğini söyler. Ağ yoksa ya da servis cevap vermiyorsa işi durdurmaz (uyarır).
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../util.js";

/** Uzun video başına ElevenLabs ihtiyacı (Fransa 13:49 ≈ 7k; Kartal Yuvası tahmini 12k): bu kadar yoksa başlamaz. */
export const ELEVEN_MIN = 13000;
/** Görsel kredisinin "var" sonucu bu kadar saat hatırlanır (deneme görseli ~1 sent). */
export const IMAGE_OK_HOURS = 6;
const CACHE = () => path.join(DATA_DIR, "credit-probe.json");

const readCache = () => { try { return JSON.parse(fs.readFileSync(CACHE(), "utf8")); } catch { return {}; } };
const writeCache = (c) => { try { fs.writeFileSync(CACHE(), JSON.stringify(c, null, 2)); } catch {} };

/** ElevenLabs kalan karakter; bilinmiyorsa null. */
export async function elevenRemaining(key, fetchFn = fetch) {
  const r = await fetchFn("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": key } });
  if (!r.ok) return null;
  const j = await r.json();
  return Number.isFinite(j?.character_limit) && Number.isFinite(j?.character_count) ? j.character_limit - j.character_count : null;
}

/** Görsel servisinin kredisi: "ok" | "empty" | null (bilinmiyor). Gerçek, en küçük bir görsel ister. */
export async function imageCredit(provider, settings, fetchFn = fetch) {
  if (provider === "openai") {
    const r = await fetchFn("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${settings.openaiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: settings.openaiImageModel || "gpt-image-1", prompt: "a grey stone on a table", size: "1024x1024", quality: "low", n: 1 }),
    });
    if (r.ok) return "ok";
    const t = await r.text().catch(() => "");
    return r.status === 429 && /insufficient_quota|credit_balance|no credits/i.test(t) ? "empty" : null;
  }
  if (provider === "replicate") {
    const r = await fetchFn("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions", {
      method: "POST",
      headers: { authorization: `Bearer ${settings.replicateKey}`, "content-type": "application/json" },
      body: JSON.stringify({ input: { prompt: "a grey stone on a table", num_outputs: 1 } }),
    });
    if (r.ok || r.status === 201) return "ok";
    return r.status === 402 ? "empty" : null;
  }
  return null;
}

/**
 * @param provider docuImageProvider(settings) — "manual" (ChatGPT kutusu) görsel kredisi istemez
 * @returns {{problems: string[], warnings: string[]}} problems doluysa iş başlamamalı
 */
export async function creditPreflight(settings, { provider, fetchFn = fetch, now = Date.now(), elevenNeed = ELEVEN_MIN } = {}) {
  const problems = [];
  const warnings = [];
  if (settings.docuCreditCheck === false) return { problems, warnings };
  if (settings.elevenKey) {
    try {
      const left = await elevenRemaining(settings.elevenKey, fetchFn);
      if (left !== null && left < elevenNeed) problems.push(`ElevenLabs kredisi yetmiyor: ${left.toLocaleString("tr-TR")} kalan, bir uzun video ~${elevenNeed.toLocaleString("tr-TR")} ister — elevenlabs.io'dan kredi yükleyin ya da yeni anahtar girin`);
    } catch (e) { warnings.push(`ElevenLabs kredisi kontrol edilemedi (${String(e?.message || e).slice(0, 80)})`); }
  }
  if (provider && provider !== "manual") {
    const cache = readCache();
    const hit = cache[provider];
    if (!(hit?.ok && now - hit.at < IMAGE_OK_HOURS * 3600e3)) {
      try {
        const st = await imageCredit(provider, settings, fetchFn);
        if (st === "ok") writeCache({ ...cache, [provider]: { ok: true, at: now } });
        else if (st === "empty") problems.push(provider === "openai"
          ? "OpenAI görsel kredisi bitmiş — platform.openai.com → Billing'den kredi yükleyin (ya da Ayarlar'da görsel kaynağını \"ChatGPT kutusu\" yapın)"
          : "Replicate kredisi bitmiş — replicate.com/account/billing'den kredi yükleyin");
        else warnings.push(`${provider} görsel kredisi kontrol edilemedi`);
      } catch (e) { warnings.push(`${provider} görsel kredisi kontrol edilemedi (${String(e?.message || e).slice(0, 80)})`); }
    }
  }
  return { problems, warnings };
}
