// TELEFON GÖRÜNTÜSÜ SIĞAR (kanal sahibi, Panama Short, Ekim 2026: "shortsda bazı görüntüler ekrana sığmıyor telefon
// falan… ölçek önemli"). 428x854'lük görgü tanığı klipleri 9:16'ya kesilip 2,5 kat büyütülüyordu: kaynağın kendi siyah
// şeritleri ve yuvarlak köşeleri görünüyor, "BAY VIEW" yazısı "Y VIEW" oluyor, görüntü yumuşuyordu. Artık telefon
// görüntüsü bütün olarak, bulanık kopyasının üstünde kart gibi durur; yatay ve büyük görseller ekranı doldurmaya devam eder.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { FIT_TOP, clipBorders, fitCard, fitsWhole, renderPictureTeaser } from "../src/pipeline/docu-shorts-pictures.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "telefon-olcek-"));

test("which pictures are fitted whole: eyewitness clips, small portrait ones, ones narrower than 9:16", () => {
  assert.equal(fitsWhole({ rel: "hand/ew-tower.mp4", srcW: 428, srcH: 854 }), true);
  assert.equal(fitsWhole({ rel: "hand/ew-wide.mp4", srcW: 1920, srcH: 1080 }), true, "an eyewitness clip keeps its label whole");
  assert.equal(fitsWhole({ rel: "build/x/cm-a.jpg", srcW: 400, srcH: 720 }), true, "a small phone photo: filling would blow it up 2.7x");
  assert.equal(fitsWhole({ rel: "build/x/cm-e.jpg", srcW: 720, srcH: 1280 }), false, "a 720p phone photo fills (1.5x)");
  assert.equal(fitsWhole({ rel: "build/x/cm-1792fddf0bf1.jpg", srcW: 1126, srcH: 1282 }), false, "Bakker on TV: near-square, fills the screen sharply");
  assert.equal(fitsWhole({ rel: "build/x/cm-b.jpg", srcW: 1500, srcH: 4000 }), true, "a tall screenshot would lose its ends");
  assert.equal(fitsWhole({ rel: "build/x/cm-c.jpg", srcW: 2560, srcH: 1440 }), false, "landscape still fills");
  assert.equal(fitsWhole({ rel: "hand/clip-1.mp4", srcW: 1920, srcH: 1080 }), false);
  assert.equal(fitsWhole({ rel: "build/x/cm-d.jpg", srcW: 3000, srcH: 4000 }), false, "a big 3:4 portrait fills sharply");
  assert.equal(fitsWhole(null), false);
});

test("the card shows the whole phone frame, under the top margin, never stretched past 2.2x", () => {
  const c = fitCard(418, 854);
  assert.equal(c.y, FIT_TOP);
  assert.ok(c.y + c.h <= 1920 - 150 + 2, JSON.stringify(c));
  assert.ok(c.w <= 1080 * 0.92 + 2 && c.w % 2 === 0 && c.h % 2 === 0);
  assert.ok(Math.abs(c.w / c.h - 418 / 854) < 0.01, "aspect kept: nothing cut");
  assert.ok(c.h / 854 <= 2.2 + 1e-9);
  assert.equal(c.x, Math.round((1080 - c.w) / 2));
  // a tiny clip is not blown up to the full screen
  assert.ok(fitCard(240, 426).h <= Math.round(426 * 2.2) + 2);
});

test("a phone clip's own black bar is found over its window and trimmed", () => {
  const clip = path.join(tmp, "bar.mp4");
  spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=s=428x812:r=30:d=2", "-vf", "pad=428:854:0:42:black", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
  const b = clipBorders(clip, 428, 854, { start: 0, dur: 1.5, ffmpeg: ffmpegPath });
  assert.ok(b.y >= 40 && b.y <= 44 && b.h >= 808 && b.h <= 814, JSON.stringify(b));
});

test("render: a fitted eyewitness clip leaves blurred margins at the sides and its whole frame on screen", () => {
  const clip = path.join(tmp, "ew-phone.mp4");
  // a bright green phone frame with a white label block at its top-left corner
  spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=0x00c000:s=428x854:r=30:d=3", "-vf", "drawbox=x=10:y=20:w=200:h=60:color=white:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", clip]);
  const voice = path.join(tmp, "v.mp3");
  spawnSync(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=2.5:sample_rate=48000", voice]);
  const ass = path.join(tmp, "t.ass");
  fs.writeFileSync(ass, "[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n");
  const out = path.join(tmp, "fit.mp4");
  renderPictureTeaser({ segments: [{ abs: clip, kind: "clip", clipStart: 0, srcW: 428, srcH: 854, box: { x: 0, y: 0, w: 1, h: 1 }, dur: 2, rel: "hand/ew-phone.mp4" }], voiceFile: voice, assFile: ass, out, total: 2.2, ffmpeg: ffmpegPath });
  const frame = spawnSync(ffmpegPath, ["-v", "error", "-ss", "1", "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 * 1024 * 1024 }).stdout;
  const px = (x, y) => { const o = (y * 1080 + x) * 3; return [frame[o], frame[o + 1], frame[o + 2]]; };
  const card = fitCard(428, 854);
  const mid = px(540, 1000);
  assert.ok(mid[1] > mid[0] + 40, `card is the green clip (${mid})`);
  const side = px(20, 1000);
  assert.ok(side[1] < mid[1] - 30, `side margin is the darker blurred copy (${side} vs ${mid})`);
  // the label block (white) is on screen, inside the card, near its top-left
  const lx = card.x + Math.round((60 / 428) * card.w), ly = card.y + Math.round((50 / 854) * card.h);
  const lab = px(lx, ly);
  assert.ok(lab[0] > 110 && lab[2] > 110 && Math.abs(lab[0] - lab[1]) < 25, `label kept, not the green picture (${lab})`);
});
