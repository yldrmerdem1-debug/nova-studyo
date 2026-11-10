// SLAM YÜZDESİ (inceleme, 28 Ekim 2026): Gimli Short'u (20261028-9ff721) "about 45 percent of the fuel it needed" dedi,
// açılış vuruşu ekrana tek başına "45" çaktı — izleyici neyin 45'i olduğunu okuyamaz. Ağ, ffmpeg ve model YOK.
import test from "node:test";
import assert from "node:assert/strict";
import { openingBeats, slamWord } from "../src/pipeline/docu-shorts.js";

test("a number said with percent slams with its sign", () => {
  assert.equal(slamWord("left Montreal with about 45 percent of the fuel it needed.", "45"), "45%");
  assert.equal(slamWord("only 45 per cent made it.", "45"), "45%");
  assert.equal(slamWord("The sheet read 22,300.", "22,300"), "22300", "a plain number stays as it was");
  assert.equal(slamWord("Seventy ships.", "ships"), "SHIPS");
  assert.equal(slamWord("it fell 45 points.", "45"), "45");
  const b = openingBeats({ say: "In 1983 a 767 left with 45 percent of its fuel. Nobody noticed. Then it ran dry.", words: ["45", "noticed", "dry"] });
  assert.equal(b[0].slam, "45%");
});
