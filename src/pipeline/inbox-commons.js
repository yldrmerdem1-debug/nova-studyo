// GÖRSEL KUTUSU → GERÇEK FOTOĞRAF (El Niño haberi, 14 Ekim 2026).
//
// Gece OpenAI'ın kredisi bitti; motor 12 AI görselini ChatGPT kutusuna yazıp durdu ve iş sabaha kadar bekledi. Elle
// Wikimedia Commons'tan gerçek, serbest lisanslı fotoğraflarla dolduruldu (ilk aramanın 4/12'si yanlış çıktı: WMO
// yerine bir tabela, "veri merkezi" satırında nükleer zirve, Nixon). Kanal sahibi: "senin kredin bitince Nova tek başına
// çıkaracak". Artık Nova kendisi yapar: her eksik görsel için anlatımdan Commons aramaları yazılır (Claude), adaylar
// lisans ve boyut süzgecinden geçer, görme modeli satıra uyanı seçer (hiçbiri uymuyorsa boş bırakır), seçilen dosya
// kutuya NN.png olarak konur ve atfı arşiv künyesine yazılır. Kanal zaten gerçek görseli tercih ediyor (AI etiketi).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { callJSON, callVisionJSON } from "../llm.js";
import { kutuKunyesi } from "./kunye.js";
import { commonsAuthor, commonsKey, permissionUsable } from "./provenance.js";
import { markMonoSource } from "./media.js";

const UA = { "User-Agent": "NovaStudyo/1.16 (documentary research)" };
const OK_LICENSE = /public domain|cc0|cc[- ]by(?![- ]?n[cd])(?!.*\b(nc|nd)\b)/i;
const strip = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
/** What the engine takes from the inbox (docu-engine/lib/image-inbox.mjs EXT): a hand-dropped 01.jpg is a filled slot. */
const INBOX_EXT = ["png", "jpg", "jpeg", "webp"];
/** Years a text names (1000–2099): "2016-02-02", "8 January 1934", "1930s", "Contemporary 2025-2026". */
const yearsNamed = (s) => [...strip(s).matchAll(/\b(1\d\d\d|20\d\d)s?\b/g)].map((m) => +m[1]);

/**
 * The media type the vision API must be told, from the bytes; null when it is not a picture the API reads.
 * Fransa borcu, 24 Ekim 2026: every thumb went out as "image/jpeg", but a PNG original's Commons thumb is a PNG —
 * one such thumb made the whole call 400 ("specified using the image/jpeg media type…") and the scene was lost.
 * Kartal, same day: "Could not process image" — an HTML error page or a 429 body was sent as a picture.
 */
export function mediaTypeOf(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * An archive photo plainly older than a present-day scene. Fransa borcu, 24 Ekim 2026: a 1934 Stavisky-affair photo
 * ("8-1-34, au Palais…", men in hats, sepia) filled the "your savings and your loans" scene of a 2025-2026 story; the
 * QA saw it after the render. Only present-day stories (from 1995) and only a clear gap: Kartal's own hand pick for
 * the Eagle's Nest was a 2004 photo of the building for a 2026 scene, and that is right.
 */
export function tooOldFor(year, era) {
  return !!(year && era && era.start >= 1995 && year < era.start - 30);
}

/**
 * Candidates for one query: landscape, ≥1200 px wide (minWidth), a free licence. A name card takes the person's
 * real photo from 800 px: Houthi–Saudi news, 28 Oct 2026, the only Commons photo of Mohammed Ali al-Houthi was
 * 869x548 (a TV still, CC BY 3.0), and without it the card for him stood on a Riyadh skyline.
 */
export async function commonsCandidates(query, { fetchImpl = fetch, limit = 6, minWidth = 1200 } = {}) {
  const u = `https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=15&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1920`;
  let j = {};
  for (let a = 0; a < 4; a++) {
    try {
      j = await (await fetchImpl(u, { headers: UA })).json();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 2500 * (a + 1)));
    }
  }
  const pages = Object.values(j.query?.pages || {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const m = ii.extmetadata || {};
    const lic = strip(m.LicenseShortName?.value);
    if (ii.width < minWidth || ii.height < Math.round(minWidth * 0.58) || ii.width / ii.height < 1.2 || !OK_LICENSE.test(lic)) continue;
    // The photo's own date ("DateTime" is the upload's); the latest year it names, so "between 1930 and 1935" is 1935.
    const year = Math.max(0, ...yearsNamed(m.DateTimeOriginal?.value)) || null;
    out.push({ title: p.title.replace(/^File:/, ""), thumb: ii.thumburl || ii.url, url: ii.url, page: ii.descriptionurl, license: lic, author: strip(commonsAuthor(m)).slice(0, 120), year });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * The scene of each wanted still (the engine's prompt is the scene's imagePrompt plus style): its narration line, its
 * own era and, on a name card, the person. The LONGEST imagePrompt the wanted prompt starts with wins. Houthi–Saudi
 * news, 28 Oct 2026: slot 09 ("Extreme close-up of a hand holding a smartphone in a dark room…", scene 76, the name
 * card for Mohammed Ali al-Houthi) was matched on its first 50 characters to scene 9 ("…in a dark bedroom…", "Riyadh
 * heard explosions"), and the Riyadh skyline was put under his name. The 50-character head stays the fallback.
 */
export function sceneOf(jobDir, prompt) {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(jobDir, "docu-script.json"), "utf8"));
    const want = String(prompt || "");
    const own = (x) => String(x.imagePrompt || "").trim().replace(/[.\s]+$/, "");
    const exact = (s.scenes || []).filter((x) => own(x) && want.startsWith(own(x))).sort((a, b) => own(b).length - own(a).length)[0];
    const head = want.slice(0, 50);
    const sc = exact || (s.scenes || []).find((x) => String(x.imagePrompt || "").startsWith(head));
    return { say: String(sc?.say || "").replace(/\[[^\]]*\]/g, "").trim(), era: String(sc?.era || ""), name: String(sc?.name || "").trim(), role: String(sc?.role || "").trim() };
  } catch {
    return { say: "", era: "", name: "", role: "" };
  }
}

/**
 * The years a wanted still belongs to: the scene's era ("2026"), else the years its prompt names (the France debt
 * script had no scene era; its style said "Contemporary 2025-2026"). The scene comes first: Kartal's prompt for the
 * 2026 minister carried an era-audit note "period-accurate for 1939". null when neither names a year.
 */
function eraOf(sceneEra, prompt) {
  const own = yearsNamed(sceneEra);
  const ys = own.length ? own : yearsNamed(prompt);
  if (!ys.length) return null;
  const start = Math.min(...ys), end = Math.max(...ys);
  return { start, end, label: own.length ? sceneEra.slice(0, 40) : start === end ? String(start) : `${start}-${end}` };
}

/**
 * The Commons files the video already shows: archived scenes (their `commons` name) and every credit's work.
 * Gimli Glider, 28 Oct 2026: the archive had put the 1984 Toronto photo on scenes 0 and 33; the inbox fill put the
 * same photo on slot 41 ("returned to service") — three times one picture.
 */
export function usedCommonsKeys(jobDir) {
  const used = new Set();
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(jobDir, "docu-archive-done.json"), "utf8"));
    for (const sc of rec?.script?.scenes || []) if (sc?.archived && sc.commons) used.add(commonsKey(sc.commons));
    for (const c of Object.values(rec?.credits || {})) if (c?.provider === "wikimedia" && c.eser) used.add(commonsKey(c.eser));
  } catch {}
  return used;
}

/**
 * Fill <job>/gorsel-kutusu with real Commons photos for every still still missing. Returns the number filled.
 * deps: llm (queries), visionLlm (pick), fetchImpl, ffmpeg.
 */
export async function fillInboxFromCommons({ jobDir, settings = {}, usage = null, ffmpeg = "ffmpeg", logFn = () => {}, llm = callJSON, visionLlm = callVisionJSON, fetchImpl = fetch } = {}) {
  const inbox = path.join(jobDir, "gorsel-kutusu");
  let needed;
  try {
    needed = JSON.parse(fs.readFileSync(path.join(inbox, "needed.json"), "utf8"));
  } catch {
    return 0;
  }
  // The photos already put in by hand are credited first (KUNYE.txt → docu-archive-done.json).
  inboxCredits({ jobDir, logFn });
  const items = (Array.isArray(needed) ? needed : needed.items || Object.values(needed)).filter((x) => x && x.n && !INBOX_EXT.some((e) => fs.existsSync(path.join(inbox, `${String(x.n).padStart(2, "0")}.${e}`))));
  if (!items.length) return 0;
  const lines = items.map((x) => {
    const sc = sceneOf(jobDir, x.prompt);
    return { n: x.n, say: sc.say, want: String(x.prompt || "").split(". ")[0].slice(0, 200), era: eraOf(sc.era, x.prompt), name: sc.name, role: sc.role };
  });
  // A name card shows the person: the person's real photo first, the AI scene only when Commons has none.
  const card = (l) => (l.name ? ` · NAME CARD for ${l.name}${l.role ? ` (${l.role})` : ""}: the first query is the person's name alone (a spelling variant as the second, e.g. Muhammad/Mohammed), for a real photo of that person` : "");
  const plan = await llm({
    system: "You find real, freely licensed photos on Wikimedia Commons for documentary scenes. Return only the requested JSON.",
    user: [
      "For each scene, write 2 short Wikimedia Commons search queries (2-5 words each) that would find a REAL photo or official map/chart showing exactly what the narration talks about — the named institution's real building, the real place, the real object, the agency's own chart. Never generic stock words alone; prefer named things.",
      ...lines.map((l) => `${l.n}) narration: "${l.say}" · wanted picture: ${l.want}${card(l)}`),
    ].join("\n"),
    schema: { type: "object", properties: { scenes: { type: "array", items: { type: "object", properties: { n: { type: "integer" }, queries: { type: "array", items: { type: "string" } } }, required: ["n", "queries"], additionalProperties: false } } }, required: ["scenes"], additionalProperties: false },
    model: settings.docuFastModel || "claude-sonnet-5-5",
    maxTokens: 2000,
    usage,
    logFn,
  });
  const creditsFile = path.join(jobDir, "docu-archive-done.json");
  const used = usedCommonsKeys(jobDir);
  let done = 0;
  for (const it of items) {
    const nn = String(it.n).padStart(2, "0");
    const line = lines.find((l) => l.n === it.n);
    const qs = (plan?.scenes || []).find((s) => s.n === it.n)?.queries || [];
    // The name itself is searched even when the query writer forgot it.
    if (line?.name && !qs.some((q) => q.toLowerCase().includes(line.name.toLowerCase()))) qs.unshift(line.name);
    let cands = [];
    for (const q of qs.slice(0, 2)) {
      cands.push(...(await commonsCandidates(q, { fetchImpl, ...(line?.name ? { minWidth: 800 } : {}) })));
      await new Promise((r) => setTimeout(r, 1200));
    }
    const seen = new Set();
    cands = cands.filter((c) => !seen.has(c.title) && seen.add(c.title));
    const shown = cands.filter((c) => used.has(commonsKey(c.title)));
    if (shown.length) logFn(`görsel kutusu ${nn}: ${shown.length} aday videoda zaten var, tekrar konmaz (${shown[0].title})`);
    cands = cands.filter((c) => !shown.includes(c));
    const old = cands.filter((c) => tooOldFor(c.year, line?.era));
    cands = cands.filter((c) => !old.includes(c)).slice(0, 6);
    // Kartal, 24 Ekim 2026: "0 görsel Commons'tan kondu" and not one line said why; every slot now says what happened.
    if (!cands.length) {
      logFn(`görsel kutusu ${nn}: Commons'ta aday yok (${qs.slice(0, 2).join(" / ") || "sorgu yazılmadı"})${old.length ? ` — ${old.length} aday ${line.era.label} sahnesi için fazla eski (${old[0].year})` : ""}`);
      continue;
    }
    const imgs = [];
    for (const c of cands) {
      try {
        const res = await fetchImpl(c.thumb, { headers: UA });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        const mediaType = mediaTypeOf(buf);
        if (mediaType) imgs.push({ c, b64: buf.toString("base64"), mediaType });
      } catch {}
    }
    if (!imgs.length) {
      logFn(`görsel kutusu ${nn}: ${cands.length} adayın küçük resmi indirilemedi`);
      continue;
    }
    // The picker saw only the narration: "savings and loans" plus a title naming Crédit Agricole was enough for 1934.
    const era = line?.era ? ` The scene is set in ${line.era.label}: a photo plainly from another era (an old archive photo for a present-day scene; modern people, cars or dress for a historical one) is 0.` : "";
    const ask = (set) =>
      visionLlm({
        system: "You are a strict documentary picture editor. Return only the JSON schema.",
        user: `Narration: "${line?.say}". Wanted picture: "${line?.want}".${era}${line?.name ? ` This is the name card for ${line.name}${line.role ? `, ${line.role}` : ""}: a photo of that person (the file title names them) is the right picture; a place, skyline or object under a person's name is 0.` : ""} Which picture shows exactly what this line talks about (the named place, institution, object or chart)? Answer with its number, or 0 if none fits — a wrong picture is worse than none.`,
        images: set.map((x, i) => ({ etiket: `Picture ${i + 1}: ${x.c.title}${x.c.year ? ` (dated ${x.c.year})` : ""}`, data: x.b64, mediaType: x.mediaType })),
        schema: { type: "object", properties: { pick: { type: "integer" } }, required: ["pick"], additionalProperties: false },
        model: settings.visionModel || "claude-haiku-5-5",
        usage,
        logFn,
      });
    let pick = -1;
    try {
      pick = Number((await ask(imgs))?.pick) - 1;
      if (!imgs[pick]) logFn(`görsel kutusu ${nn}: ${imgs.length} adaydan hiçbiri satıra uymadı`);
    } catch (e) {
      const msg = String(e?.message || e);
      logFn(`görsel kutusu ${nn}: seçim yapılamadı (${msg.slice(0, 120)})`);
      // One picture the API cannot read must not lose the whole slot: each candidate is then asked about alone.
      if (imgs.length > 1 && /image/i.test(msg)) {
        for (let i = 0; i < imgs.length && pick < 0; i++) {
          try {
            if (Number((await ask([imgs[i]]))?.pick) === 1) pick = i;
          } catch {}
        }
        if (pick < 0) logFn(`görsel kutusu ${nn}: adaylar tek tek de soruldu, uyan yok`);
      }
    }
    const chosen = imgs[pick];
    if (!chosen) continue;
    used.add(commonsKey(chosen.c.title));
    // A name card's portrait goes into the archive record, not the AI slot: the inbox still is an AI still to the
    // preview gate, which called Tommy Pigott's real State Department photo "an AI face" and dropped his card.
    if (line?.name && archiveNameCard({ jobDir, line, chosen, file: it.file, ffmpeg, logFn, nn })) {
      done++;
      continue;
    }
    const src = path.join(inbox, `${nn}.src`);
    fs.writeFileSync(src, Buffer.from(chosen.b64, "base64"));
    // Synchronous in the main process (25 Ekim 2026): one hung ffmpeg froze the whole app → 60 s cap, SIGKILL.
    // A timeout (status null) is "could not convert" too; a half-written PNG left in the inbox is a filled slot to the engine.
    const png = path.join(inbox, `${nn}.png`);
    const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-loglevel", "error", "-i", src, "-vf", "scale=1536:1024:force_original_aspect_ratio=increase,crop=1536:1024", png], { windowsHide: true, timeout: 60000, killSignal: "SIGKILL" });
    fs.rmSync(src, { force: true });
    if (r.status !== 0) {
      fs.rmSync(png, { force: true });
      logFn(`görsel kutusu ${nn}: seçilen fotoğraf dönüştürülemedi (${chosen.c.title})`);
      continue;
    }
    try {
      const doneJson = JSON.parse(fs.readFileSync(creditsFile, "utf8"));
      doneJson.credits = doneJson.credits || {};
      doneJson.credits[`inbox-${nn}`] = { provider: "wikimedia", eser: chosen.c.title, sahip: chosen.c.author, lisans: chosen.c.license, sayfa: chosen.c.page, url: chosen.c.url, file: it.file, permissionVerified: true, modifications: "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama, film greni ve üst yazı eklendi." };
      fs.writeFileSync(creditsFile, JSON.stringify(doneJson, null, 1));
    } catch {}
    logFn(`görsel kutusu ${nn} ← Commons: ${chosen.c.title} (${chosen.c.license})`);
    done++;
  }
  return done;
}

/** Width and height from a JPEG (SOF) or PNG (IHDR) header; null when unknown. */
export function pictureSize(buf) {
  if (!buf || buf.length < 24) return null;
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG") return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  for (let i = 2; i + 9 < buf.length; ) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * NAME CARD → ARCHIVE RECORD (Houthi–Saudi news, 28 Oct 2026). The real portraits of Mohammed Ali al-Houthi and
 * Tommy Pigott were put into the inbox by hand; the inbox still is an AI still to the gate ("wrong_face: an AI face
 * for Tommy Pigott") and to the archive step, which had already dropped both name cards ("no real photo"). Fixed by
 * hand in docu-archive-done.json: the scene archived with the photo, name and role back, credited as scene-N. This
 * does the same: the archive pass is reused on "continue" (same script key), so the card shows on his real photo.
 * Returns false when the record or the scene is not there (the photo then goes to the slot as before).
 */
function archiveNameCard({ jobDir, line, chosen, file, ffmpeg, logFn, nn }) {
  const doneFile = path.join(jobDir, "docu-archive-done.json");
  let d;
  try { d = JSON.parse(fs.readFileSync(doneFile, "utf8")); } catch { return false; }
  const clean = (t) => String(t || "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();
  const idx = (d.script?.scenes || []).findIndex((x) => !x.archived && clean(x.say) === clean(line.say));
  if (idx < 0) return false;
  const buildDir = path.dirname(String(file || "")).replace(/\\/g, "/");
  if (!buildDir || buildDir === ".") return false;
  const rel = `${buildDir}/arch-cm-${nn}-${Buffer.from(chosen.c.title).toString("hex").slice(0, 12)}.jpg`;
  const dest = path.join(jobDir, "docu", "public", rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(chosen.b64, "base64");
  if (chosen.mediaType === "image/jpeg") fs.writeFileSync(dest, buf);
  else {
    const src = `${dest}.src`;
    fs.writeFileSync(src, buf);
    const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-loglevel", "error", "-i", src, "-q:v", "2", dest], { windowsHide: true, timeout: 60000, killSignal: "SIGKILL" });
    fs.rmSync(src, { force: true });
    if (r.status !== 0) { fs.rmSync(dest, { force: true }); return false; }
  }
  const size = pictureSize(fs.readFileSync(dest));
  const s = d.script.scenes[idx];
  Object.assign(s, { name: line.name, ...(line.role ? { role: line.role } : {}), image: rel, archived: true, ...(size ? { imgW: size.w, imgH: size.h } : {}) });
  if (!s.focus) s.focus = [0.5, 0.3];
  // Arşiv kaydına giren gerçek portre: siyah-beyazsa scene.monoSource (Gimli 9ff721 önce/sonra, 29 Ekim 2026 — renkli
  // kaynak bölümün soluk notuyla griye boyanmaz, gerçekten s/b olan işaretlenir). Diskteki dosya ölçülür.
  markMonoSource(s, dest, { ffmpeg });
  d.credits = d.credits || {};
  d.credits[`scene-${idx}`] = { provider: "wikimedia", eser: chosen.c.title, sahip: chosen.c.author, lisans: chosen.c.license, sayfa: chosen.c.page, url: chosen.c.url, sourceUrl: chosen.c.url, file: rel, permissionVerified: true, modifications: "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama (duotone), film greni ve üst yazı eklendi." };
  fs.writeFileSync(doneFile, JSON.stringify(d, null, 1));
  logFn(`görsel kutusu ${nn}: ${line.name} isim kartı ← Commons: ${chosen.c.title} (${chosen.c.license}) — arşiv kaydına kondu, kart geri geldi`);
  return true;
}

/**
 * The credits of the inbox's pictures (inbox-NN), with the photos put in by hand written into docu-archive-done.json.
 * Kartal Yuvası, 24 Ekim 2026: two CC BY / CC BY-SA Commons photos (Michael Lucan, Wolfgang Manousek) were dropped
 * into the inbox and credited in gorsel-kutusu/KUNYE.txt; Nova never read that file and the credits went into the
 * description by hand. Each line (kunye.js kutuKunyesi) becomes the record Nova writes for its own pick, keyed by
 * the still's file: the package, the Short (pictureAssets) and docu.js withInboxCredits read the file's inbox-NN
 * records. Returned too, Nova's own picks included (they are written after the archive step, so the job's credits
 * lack them). Only a slot whose photo is in the inbox; a record of that still not taken from KUNYE.txt wins (Nova's
 * Commons pick carries the file's url, an archive record has its own key): that is the picture the engine took.
 */
export function inboxCredits({ jobDir, logFn = () => {} } = {}) {
  const inbox = path.join(jobDir, "gorsel-kutusu");
  const creditsFile = path.join(jobDir, "docu-archive-done.json");
  let doneJson = {}, canWrite = true;
  try {
    doneJson = JSON.parse(fs.readFileSync(creditsFile, "utf8")) || {};
  } catch (e) {
    // A file that does not parse is still the archive pass: it is never overwritten, only a missing one is started.
    canWrite = e?.code === "ENOENT";
  }
  const credits = { ...(doneJson.credits || {}) };
  let metin = "", needed = null;
  try {
    metin = fs.readFileSync(path.join(inbox, "KUNYE.txt"), "utf8");
    needed = JSON.parse(fs.readFileSync(path.join(inbox, "needed.json"), "utf8"));
  } catch {}
  const written = [], missing = [];
  for (const [k, r] of Object.entries(kutuKunyesi(metin, needed))) {
    const nn = String(Number(k.slice("inbox-".length))).padStart(2, "0");
    if (!INBOX_EXT.some((e) => fs.existsSync(path.join(inbox, `${nn}.${e}`)))) {
      missing.push(nn);
      continue;
    }
    const key = `inbox-${nn}`;
    if (Object.entries(credits).some(([ck, c]) => c?.file === r.file && (ck !== key || c.url))) continue;
    const rec = { ...r, permissionVerified: permissionUsable(r) };
    if (JSON.stringify(credits[key]) === JSON.stringify(rec)) continue;
    credits[key] = rec;
    written.push(nn);
  }
  if (missing.length) logFn(`görsel kutusu: KUNYE.txt satırının fotoğrafı kutuda yok (${missing.join(", ")}) — atfı yazılmadı`);
  if (written.length && canWrite) {
    try {
      fs.writeFileSync(creditsFile, JSON.stringify({ ...doneJson, credits }, null, 1));
      logFn(`görsel kutusu: elle konan ${written.length} fotoğrafın atfı KUNYE.txt'den künyeye yazıldı (${written.join(", ")})`);
    } catch {}
  }
  return Object.fromEntries(Object.entries(credits).filter(([k]) => k.startsWith("inbox-")));
}

/**
 * What a stop of the engine means for the inbox — one rule for the preview gate and the render (docu.js).
 * Denizaltı/Kartal, 25 Ekim 2026: once the gate became mandatory, the inbox wait ended as "Ön izleme kapısı
 * çalışmadı" and the Commons fill, which only wrapped the render, could no longer run at all.
 *   "commons" — the AI image balance ran out and the inbox was not chosen: fill from Commons, then run the round again
 *   "inbox"   — the inbox was chosen (docuImageProvider "manual") or Commons was already tried: stop with the engine's
 *               own message ("N görsel ChatGPT'den bekleniyor — LISTE.txt …"); this is not a gate failure
 *   null      — not an inbox wait (the caller's own rule applies)
 */
export function inboxWaitAction(err, settings = {}, { commonsTried = false } = {}) {
  if (!/ChatGPT'den bekleniyor/.test(String(err?.message || ""))) return null;
  return settings.docuImageProvider === "manual" || commonsTried ? "inbox" : "commons";
}
