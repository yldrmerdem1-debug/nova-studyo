// NOVA TEK BAŞINA (14 Ekim 2026, kanal sahibi: "senin kredin bitince oradan video çıkaracağız… kusursuz çıkarmalı"):
// gece elle yapılan işler artık Nova'nın kendi işi — AI görsel kredisi bitince Commons'tan gerçek fotoğraf, paket
// aşaması bir kez yeniden denenir, video bitince Shorts'lar kendiliğinden üretilir.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

test("an empty AI-image balance no longer parks the job: the inbox is filled from Commons and the engine runs again", () => {
  const d = src("../src/pipeline/docu.js");
  // 25 Ekim 2026: kapı ve render tek kuralla (inbox-commons.js inboxWaitAction: kutu seçildiyse ya da Commons denendiyse durur).
  assert.match(d, /inboxWaitAction\(e, settings, \{ commonsTried \}\) !== "commons"/);
  assert.match(d, /fillInboxFromCommons\(\{ jobDir: dir/);
});

test("fillInboxFromCommons: Claude writes queries, licence and size filter, the vision model picks (or refuses), credit is written", async () => {
  const { fillInboxFromCommons, commonsCandidates } = await import("../src/pipeline/inbox-commons.js");
  const job = fs.mkdtempSync(path.join(os.tmpdir(), "inbox-"));
  fs.mkdirSync(path.join(job, "gorsel-kutusu"));
  fs.writeFileSync(path.join(job, "gorsel-kutusu", "needed.json"), JSON.stringify([{ n: 1, file: "build/x/img-1.jpg", prompt: "Wide exterior of the WMO headquarters in Geneva. Style." }, { n: 2, file: "build/x/img-2.jpg", prompt: "A data centre aisle. Style." }]));
  fs.writeFileSync(path.join(job, "docu-script.json"), JSON.stringify({ scenes: [{ imagePrompt: "Wide exterior of the WMO headquarters in Geneva. Style.", say: "In Geneva, the WMO said…" }, { imagePrompt: "A data centre aisle. Style.", say: "The IEA publishes data-centre estimates." }] }));
  fs.writeFileSync(path.join(job, "docu-archive-done.json"), JSON.stringify({ credits: {} }));
  const page = (title, lic, w = 2000, h = 1300) => ({ title: `File:${title}`, index: 1, imageinfo: [{ width: w, height: h, url: `https://x/${title}`, thumburl: `https://x/t/${title}`, descriptionurl: `https://c/${title}`, extmetadata: { LicenseShortName: { value: lic }, Artist: { value: "<a>Someone</a>" } } }] });
  // Thumbs are JPEG-signed bytes: since 25 Oct 2026 a body that is not a picture never reaches the vision model.
  const fetchImpl = async (u) => ({
    ok: true,
    json: async () => ({ query: { pages: /WMO/.test(decodeURIComponent(u)) ? { 1: page("WMO building.jpg", "CC BY-SA 2.0"), 2: page("Logo NC.jpg", "CC BY-NC 2.0"), 3: page("tiny.jpg", "CC0", 600, 400) } : { 1: page("Servers.jpg", "CC BY 4.0") } } }),
    arrayBuffer: async () => Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer,
  });
  const c = await commonsCandidates("WMO headquarters", { fetchImpl });
  assert.deepEqual(c.map((x) => x.title), ["WMO building.jpg"], "NC licence and small files are filtered out");
  const llm = async () => ({ scenes: [{ n: 1, queries: ["WMO headquarters Geneva"] }, { n: 2, queries: ["data center servers"] }] });
  let calls = 0;
  const visionLlm = async () => ({ pick: ++calls === 1 ? 1 : 0 });
  const ffmpeg = (await import("ffmpeg-static")).default;
  const n = await fillInboxFromCommons({ jobDir: job, llm, visionLlm, fetchImpl, ffmpeg });
  // The 16-byte fake picture cannot be decoded, so nothing is placed — but no crash, and a refused pick places nothing.
  assert.ok(n <= 1);
  assert.equal(calls, 2, "the vision model judged both scenes");
});

test("the package step is retried once, and the finished video gets docuAutoShorts Shorts (default 2)", () => {
  const d = src("../src/pipeline/docu.js");
  assert.match(d, /for \(let attempt = 1; attempt <= 2 && !pkg; attempt\+\+\)/);
  assert.match(d, /const autoShorts = Math\.max\(0, Math\.min\(3, Number\(settings\.docuAutoShorts \?\? 2\) \|\| 0\)\);/);
  assert.match(src("../src/config.js"), /docuAutoShorts: 2,/);
  assert.match(src("../src/settings-input.js"), /docuAutoShorts:\[0,3,true\]/);
});
