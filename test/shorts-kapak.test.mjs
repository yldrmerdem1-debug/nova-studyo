// SHORTS KAPAĞI (kanal sahibi, Ekim 2026: "jimbaker shorts kapağı nerde… shortslarının da kapaklarını yapmalısın").
// Her Short kendi dikey kapağını alır: kanca fotoğrafı (gerçek görsel), Short'un görünümünde 2-3 kısa satır; kapak
// videonun ilk karesi olur ki YouTube uygulamasında seçilebilsin. Telefon kaydının siyah kenarı kırpılır, etiketi kalır.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { blackBorders, coverLines, prependCoverFrame, renderShortCover, shortCoverAss } from "../src/pipeline/docu-shorts-pictures.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "shorts-kapak-"));
const probe = (f) => {
  const r = spawnSync(ffmpegPath, ["-hide_banner", "-i", f], { encoding: "utf8" });
  return String(r.stderr);
};

test("cover lines: the planner's lines in capitals, at most three; without them the hook split in two", () => {
  assert.deepEqual(coverLines(["159,903", "stays sold.", "500 rooms.", "extra"]), ["159,903", "STAYS SOLD.", "500 ROOMS."]);
  assert.deepEqual(coverLines([], "He sold the same room twice"), ["HE SOLD THE", "SAME ROOM TWICE"]);
  assert.deepEqual(coverLines(null, ""), []);
});

test("cover text uses the Short's look: its slam font, the key colour on the first and last line, ink between", () => {
  const ass = shortCoverAss(["159,903", "STAYS SOLD.", "500 ROOMS."], "ledger");
  assert.match(ass, /Style: Cover,Bahnschrift,/);
  const lines = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
  assert.equal(lines.length, 3);
  assert.match(lines[0], /\\c&H0020B0FF&?/i, "amber #ffb020 on the number");
  assert.match(lines[1], /\\c&H00FFFFFF/i, "white ink in the middle");
  assert.match(lines[2], /\\c&H0020B0FF/i);
  assert.match(lines[0], /\\fs230/);
  const pan = shortCoverAss(["7.7", "PANAMA"], "clean");
  assert.match(pan, /Style: Cover,Rubik,/);
  assert.match(pan, /\\fs330/, "a short number is the biggest thing on the cover");
  assert.ok(!/[{}]/.test(shortCoverAss(["A{B}"], "punch").split("\n").at(-2).replace(/^.*\}/, "")), "no override braces from the text");
});

test("a phone still's black side bar is found and trimmed; a dark picture is not cut into a sliver", () => {
  const bar = path.join(tmp, "bar.png");
  spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x6699cc:s=420x840", "-vf", "pad=430:840:10:0:black", "-frames:v", "1", bar]);
  const b = blackBorders(bar, 430, 840, ffmpegPath);
  assert.ok(b.x >= 8 && b.x <= 12 && b.w >= 416 && b.w <= 422, JSON.stringify(b));
  const dark = path.join(tmp, "dark.png");
  spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x050505:s=800x800", "-frames:v", "1", dark]);
  assert.deepEqual(blackBorders(dark, 800, 800, ffmpegPath), { x: 0, y: 0, w: 800, h: 800 });
});

test("Microsoft cover regression: fade leaves the upper subject visible and darkens only the lower text area", () => {
  const pic = path.join(tmp, "bright-subject.png");
  const made = spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0xcccccc:s=1080x1920", "-frames:v", "1", pic]);
  assert.equal(made.status, 0);
  const cover = renderShortCover({ picture: pic, srcW: 1080, srcH: 1920, lines: [], look: "ledger", out: path.join(tmp, "fade-regression.jpg"), ffmpeg: ffmpegPath });
  const sample = (y) => {
    const r = spawnSync(ffmpegPath, ["-v", "error", "-i", cover, "-vf", `crop=200:100:440:${y},scale=1:1`, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"]);
    assert.equal(r.status, 0);
    return [...r.stdout].reduce((a, b) => a + b, 0) / 3;
  };
  const upper = sample(400), middle = sample(850), lower = sample(1750);
  assert.ok(upper > 150, `upper subject must stay visible, got ${upper}`);
  assert.ok(middle > 150, `no black slab above the fade, got ${middle}`);
  assert.ok(lower < upper * 0.5, `lower text area needs a fade: ${lower} vs ${upper}`);
});

test("the cover is a 1080x1920 picture, and the Short gets it as its first frame with the sound kept in step", () => {
  const pic = path.join(tmp, "pic.png");
  spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1200x1300", "-frames:v", "1", pic]);
  const cover = renderShortCover({ picture: pic, srcW: 1200, srcH: 1300, box: { x: 0.3, y: 0.05, w: 0.4, h: 0.5 }, lines: ["7.7", "PANAMA", "SO FAR: ZERO"], look: "clean", out: path.join(tmp, "cover.jpg"), ffmpeg: ffmpegPath });
  assert.match(probe(cover), /1080x1920/);
  const short = path.join(tmp, "short.mp4");
  spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=1080x1920:r=30:d=2", "-f", "lavfi", "-i", "sine=f=440:d=2", "-shortest", "-c:v", "libx264", "-c:a", "aac", short]);
  const out = prependCoverFrame({ video: short, cover, out: path.join(tmp, "short-cover.mp4"), ffmpeg: ffmpegPath });
  const frames = (f) => Number(String(spawnSync(ffmpegPath, ["-v", "error", "-i", f, "-map", "0:v", "-f", "null", "-", "-stats"], { encoding: "utf8" }).stderr).match(/frame=\s*(\d+)/g).pop().replace(/\D/g, ""));
  assert.equal(frames(out), frames(short) + 1);
  assert.match(probe(out), /Audio: aac/);
  // the first frame is the cover, not red
  const px = spawnSync(ffmpegPath, ["-v", "error", "-i", out, "-frames:v", "1", "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout;
  assert.ok(!(px[0] > 200 && px[1] < 60 && px[2] < 60), `first frame is the cover (${[...px]})`);
});

test("a cover that cannot be drawn never costs the Short: the video stays where it was, with a warning", async () => {
  const { shortCover } = await import("../src/pipeline/docu-shorts.js");
  const out = path.join(tmp, "short-keep.mp4");
  fs.writeFileSync(out, "video");
  const logs = [];
  const r = shortCover({ seg: { abs: path.join(tmp, "missing.jpg"), kind: "still", srcW: 100, srcH: 100 }, lines: ["X"], look: "punch", dir: tmp, stamp: "t", ff: ffmpegPath, out, logFn: (m) => logs.push(m) });
  assert.equal(r, null);
  assert.equal(fs.readFileSync(out, "utf8"), "video");
  assert.ok(logs.some((m) => /UYARI: Shorts kapağı/.test(m)));
  assert.equal(shortCover({ seg: null, lines: ["X"] }), null);
});
