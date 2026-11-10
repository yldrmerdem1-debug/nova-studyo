// ÖN İZLEME KAPISINDA GÖRSEL KUTUSU → COMMONS (docu.js bağlantısı).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 2009 denizaltı çarpışması 20261024-373aaf): önceki çalıştırma 06:07:52'de "HATA: Ön izleme
// kapısı çalışmadı — render başlatılmadı (Sinematik motor: 65 görsel ChatGPT'den bekleniyor …)" diye bitti. OpenAI kredisi
// bitince motorun kutu beklemesi kapı arızası diye etiketlendi; Commons dolgusu ("Görsel kutusu: AI görsel kredisi yok —
// eksikler Wikimedia Commons'tan…") yalnızca render'ı sarıyordu ve kapı zorunlu olduğundan beri hiç çalışmadı (son kez
// Kartal Yuvası, 24 Ekim 18:13). Kapı ve render artık tek kuralla karar verir (inbox-commons.js inboxWaitAction), Commons
// durma başına bir kez denenir.
// ÖLÇÜLEN KUSUR (25 Ekim 2026, WP-J): görsel kaynağı artık işin ayar kopyasında donmuyor; render anahtarı canlı ayara
// bağlı kalsaydı Ayarlar'da kaynağı değiştirmek bitmiş videoyu aynı senaryoyla yeniden render ettirirdi. Yeni işin
// kopyasında kaynak hiç yok (inceleme, 25 Ekim 2026): başladığı kaynak ilk çalıştırmada işe yazılır.
// Ağ ve motor YOK: docu.js kaynağı okunur.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const d = fs.readFileSync(new URL("../src/pipeline/docu.js", import.meta.url), "utf8");

test("gate catch: an inbox wait tries Commons first and re-runs the round; otherwise it stops with the engine's own message, never 'kapı çalışmadı'", () => {
  const start = d.indexOf("let gateRetries = 1;");
  const fail = d.indexOf("throw new Error(`Ön izleme kapısı çalışmadı", start);
  assert.ok(start > 0 && fail > start, "the gate block");
  const gate = d.slice(start, fail);
  const at = (s) => { const i = gate.indexOf(s); assert.ok(i >= 0, s); return i; };
  const rule = at("const inboxAct = inboxWaitAction(e, settings, { commonsTried });");
  const fill = at("await fillInboxFromCommons({ jobDir: dir, settings, usage, ffmpeg: settings.ffmpegPath || \"ffmpeg\", logFn: log2 })");
  assert.ok(gate.slice(fill, fill + 300).includes(".catch((x) => {"), "a failed fill ends with the inbox message, not its own error");
  const again = at("if (filled) { round--; continue; }");
  const stop = at("if (inboxAct) throw e;");
  const retry = at("if (gateRetries-- > 0) {");
  assert.ok(at("if (isCancelled()) return;") < rule, "a cancel never pays for Commons");
  assert.ok(rule < at("if (inboxAct === \"commons\") {") && at("commonsTried = true;") < fill, "Commons once per stop");
  assert.ok(fill < again && again < stop, "a filled inbox re-runs the same gate round");
  assert.ok(stop < retry, "the inbox wait is neither retried as a technical failure nor relabelled");
  assert.doesNotMatch(gate, /const technical = /, "no second rule for the inbox wait in the gate");
});

test("render catch: the same rule, and no second paid Commons + vision round for the same stop", () => {
  const decl = d.indexOf("let commonsTried = false;");
  const gate = d.indexOf("if (settings.docuPreview !== false && !patching && !job.docuPrepareOnly)");
  assert.ok(decl > 0 && decl < gate, "declared before the gate, so the render catch sees it");
  const render = d.indexOf("rendered = await renderWith(engineDocu, { keepChunks: autoFix ? true : undefined });");
  const tail = d.slice(render, d.indexOf("// A patch is used once", render));
  assert.match(tail, /if \(inboxWaitAction\(e, settings, \{ commonsTried \}\) !== "commons" \|\| isCancelled\(\)\) throw e;\n\s*commonsTried = true;/);
  assert.match(tail, /logFn: log2 \}\)\n\s*\.catch\(\(x\) => \{[^\n]*return 0; \}\);\n[^\n]*\n\s*if \(!filled\) throw e;/, "same as the gate: a failed fill rethrows the engine's message");
  assert.doesNotMatch(tail, /ChatGPT'den bekleniyor\/\.test/, "the old regex rule is gone");
  assert.equal((d.match(/inboxWaitAction\(e, settings, \{ commonsTried \}\)/g) || []).length, 2, "gate + render");
});

test("image provider follows Settings: an old job says so once, and its render key keeps the provider it started with", () => {
  const top = d.slice(d.indexOf("export async function runDocuJob("), d.indexOf("const guard = claudeGuard(usage, settings, log2);"));
  assert.ok(top.includes("const startedWith = job.settingsSnapshot?.docuImageProvider || job.docuImageProviderAtStart;"));
  // Yeni işin kopyasında kaynak yok: canlı ayarla anahtar, Ayarlar'da kaynak değişince bitmiş videoyu yeniden render ettirirdi.
  assert.ok(top.includes("if (!startedWith && settings.docuImageProvider) updateJob(jobId, { docuImageProviderAtStart: settings.docuImageProvider });"), "a new job records the provider it started with");
  assert.match(top, /if \(startedWith && startedWith !== settings\.docuImageProvider\) log2\(`Görsel kaynağı ayarlardan: \$\{docuImageProvider\(settings\)\} \(iş \$\{startedWith\} ile başlamıştı\)`\);/);
  assert.ok(d.includes("const keyProvider = docuImageProvider(startedWith ? { ...settings, docuImageProvider: startedWith } : settings);"));
  assert.ok(d.includes("const renderKeyOf = (ed) => [ed, voiceId, keyProvider, DOCU_ENGINE_VERSION,"), "render key");
  // Görsel üretimi canlı kaynakla: motora giden spec docuImageProvider(settings).
  assert.ok(d.includes("imageProvider: docuImageProvider(settings),"));
});

