// SHORT PLANLAYICISI İŞİN BİÇİMİNİ BİLİR; SHORT'UN ffmpeg'İ TAKILIRSA DURUR.
//
// ÖLÇÜLEN KUSUR 1 (25 Ekim 2026, 2. tur R7): planPictureTeaser `newsStory` alıyor, ama tek çağıranı makePictureTeaser
//   onu hiç geçmiyordu. Anlatımı yıl anmayan bir tarih Short'u (storyYear null) böylece haber sayıldı ve planlayıcıya
//   "no present-day photos" satırı gitmedi (1.16.24'te gidiyordu).
// KUSUR 2 (25 Ekim 2026, iş 20261024-373aaf): geri dönmeyen senkron bir çağrı (hata kutusu; ffmpeg değil) uygulamayı
//   48 dk dondurdu. docu-shorts.js'teki ffmpeg çağrılarının hepsi spawnSync, hiçbirinde süre sınırı yoktu: takılan bir
//   ffmpeg ana süreci aynı şekilde sonsuza dek bekletirdi (spawnSync beklerken Node durur), arkasında konsol penceresi
//   açılır, stdin'i okuyabilirdi.
// Kural: planlayıcıya newsStory: job.docuFormat === "news" gider. Bu dosyadaki her spawnSync'in süre sınırı
//   (kodlama SHORT_ENCODE_MS, yoklama SHORT_PROBE_MS) ve windowsHide'ı var, her ffmpeg -nostdin ile başlar. Süre dolunca
//   hata bunu açıkça söyler.
// Ağ YOK, ffmpeg çalışmaz: planlayıcı ve llm taklit, görsel kataloğu önbellekten.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const S = await import("../src/pipeline/docu-shorts.js");

const STOP = new Error("plan yakalandı");

/** A finished job: output + subtitles, 12 archive photos (dummy files), their catalogue already in shorts/pictures.json. */
function jobWith({ era } = {}) {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-shorts-bicim-"));
  const att = path.join(jobDir, "attempts", "a");
  fs.mkdirSync(att, { recursive: true });
  fs.writeFileSync(path.join(att, "output.mp4"), "x");
  fs.writeFileSync(path.join(att, "subs.srt"), "1\n00:00:00,000 --> 00:00:03,000\nThe ship went down at dawn.\n\n2\n00:00:03,000 --> 00:00:06,000\nNobody aboard saw it coming.\n");
  const pub = path.join(jobDir, "docu", "public", "build", "j");
  fs.mkdirSync(pub, { recursive: true });
  const scenes = [];
  const cache = {};
  for (let i = 1; i <= 12; i++) {
    const rel = `build/j/cm-${i}.jpg`;
    fs.writeFileSync(path.join(jobDir, "docu", "public", rel), "x");
    scenes.push({ say: `Line ${"abcdefghijkl"[i - 1]} of the story, with no year in it.`, image: rel, imgW: 1600, imgH: 1200 });
    cache[rel] = { what: `Archive photo ${i} of the ship and its crew`, textHeavy: false, modern: false, quality: 4, box: { x: 0.2, y: 0.1, w: 0.6, h: 0.7 } };
  }
  fs.writeFileSync(path.join(jobDir, "docu", "j.props.json"), JSON.stringify({ script: { ...(era ? { era } : {}), scenes } }));
  fs.mkdirSync(path.join(jobDir, "shorts"));
  fs.writeFileSync(path.join(jobDir, "shorts", "pictures.json"), JSON.stringify(cache));
  return jobDir;
}

/** makePictureTeaser up to its plan: what the planner got (stub) and, with the real planner, the prompt the llm got. */
async function planOf(job, era) {
  const jobDir = jobWith({ era });
  let got = null;
  let prompt = null;
  const llm = async ({ user }) => {
    prompt = [].concat(user).join("\n");
    throw STOP;
  };
  const base = { jobDir, job, settings: {}, llm, deps: { subjectTopUp: async () => [] } };
  try {
    await assert.rejects(S.makePictureTeaser({ ...base, deps: { ...base.deps, planPictureTeaser: async (a) => { got = a; throw STOP; } } }), (e) => e === STOP);
    await assert.rejects(S.makePictureTeaser(base), (e) => e === STOP);
  } finally {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
  return { got, prompt };
}

test("the planner is told the job's format: a yearless history Short keeps 'no present-day photos', a news Short does not", async () => {
  const history = await planOf({ topic: "The ship" });
  // The real planner's prompt first: that is the regression itself (1.16.24 had the line), whatever the seam.
  assert.match(history.prompt, /every picture must belong to the story's time: no present-day photos or footage/);
  assert.ok(history.got, "makePictureTeaser calls the planner it is given");
  assert.equal(history.got.year, null, "the narration names no year");
  assert.equal(history.got.newsStory, false, "no docuFormat: not a news story");

  const news = await planOf({ topic: "The ship", docuFormat: "news" });
  assert.equal(news.got.year, null);
  assert.equal(news.got.newsStory, true);
  assert.doesNotMatch(news.prompt, /no present-day photos/, "Kartal: a news Short keeps its present-day pictures");

  // Nothing else moved: a ranking job is no news story, and a history job with an era keeps its year in the line.
  const ranking = await planOf({ topic: "The ship", docuFormat: "ranking" });
  assert.equal(ranking.got.newsStory, false);
  const dated = await planOf({ topic: "The ship" }, "1938");
  assert.equal(dated.got.year, 1938);
  assert.equal(dated.got.newsStory, false);
  assert.match(dated.prompt, /story's time \(1938\): no present-day photos/);
});

test("every spawnSync in docu-shorts.js has a time limit and windowsHide, every ffmpeg starts with -nostdin (source)", () => {
  const src = fs.readFileSync(new URL("../src/pipeline/docu-shorts.js", import.meta.url), "utf8");
  const lines = src.split(/\r?\n/);
  const calls = lines.map((l, i) => ({ l, i })).filter(({ l }) => /\b(spawnSync|execFileSync|execSync)\(/.test(l) && !/^import /.test(l));
  assert.ok(calls.length >= 5, `found ${calls.length} spawnSync calls`);
  for (const { l, i } of calls) {
    const at = `docu-shorts.js:${i + 1}`;
    assert.match(l, /windowsHide: true/, at);
    assert.match(l, /timeout: SHORT_(ENCODE|PROBE)_MS/, at);
    const inline = l.match(/(?:spawnSync|execFileSync)\(\w+, \[\s*"([^"]+)"/);
    if (inline) assert.equal(inline[1], "-nostdin", at);
    else {
      assert.match(l, /(?:spawnSync|execFileSync)\(\w+, args,/, at);
      const decl = lines.slice(0, i).reverse().find((x) => /const args = \[/.test(x));
      assert.match(decl || "", /const args = \["-nostdin", /, `${at}: its args`);
      // The encodes (renderShort, renderTeaser) get the encode limit, never a probe's minute.
      assert.match(l, /timeout: SHORT_ENCODE_MS/, at);
    }
  }
  // A duration probe that hung is no 0-second video: every teaser shot would come from the first seconds, silently.
  const dur = src.slice(src.indexOf("function videoDuration("), src.indexOf("\n}\n", src.indexOf("function videoDuration(")));
  assert.match(dur, /if \(!m && r\.error\?\.code === "ETIMEDOUT"\) throw new Error\(/);
  // A healthy encode is never killed: a picture Short's render + cover took up to ~25 min (France, 20 Oct 2026).
  assert.ok(S.SHORT_ENCODE_MS >= 30 * 60 * 1000, String(S.SHORT_ENCODE_MS));
  assert.ok(S.SHORT_PROBE_MS >= 10 * 1000 && S.SHORT_PROBE_MS <= 5 * 60 * 1000, String(S.SHORT_PROBE_MS));
});

test("a timed-out call says so; any other failure keeps ffmpeg's own last words", () => {
  // The shape Node gives a spawnSync that ran past its limit (a real child, killed after 300 ms).
  const r = spawnSync(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { encoding: "utf8", windowsHide: true, timeout: 300 });
  assert.equal(r.status, null);
  assert.equal(S.ffmpegWhy(r, S.SHORT_ENCODE_MS), "ffmpeg 45 dk içinde bitmedi (takıldı), durduruldu");
  assert.equal(S.ffmpegWhy(r, S.SHORT_PROBE_MS), "ffmpeg 1 dk içinde bitmedi (takıldı), durduruldu");
  assert.equal(S.ffmpegWhy(r, 30000), "ffmpeg 30 sn içinde bitmedi (takıldı), durduruldu");
  const bad = { status: 1, stderr: `${"x".repeat(900)}Invalid argument` };
  assert.equal(S.ffmpegWhy(bad, S.SHORT_ENCODE_MS, 400), bad.stderr.slice(-400));
  assert.equal(S.ffmpegWhy({ status: null, stderr: "", error: new Error("spawnSync ffmpeg ENOENT") }, S.SHORT_PROBE_MS), "spawnSync ffmpeg ENOENT");
});
