// YAZIM KİLİTLERİ (22 Ekim 2026). Kanal sahibi: "en iyi mimari bu deme, tekrar tekrar aynı yere düşmeyelim".
// Her ders yeni bir talimat satırı değil, bir KİLİT olur:
//   1) altın senaryolar — Fransa ve Hürmüz'ün gerçek senaryoları; bilinen her kusuru Nova hâlâ yakalamalı (bir kural
//      değişikliği yakalamayı bozarsa test kırmızı);
//   2) talimat bütçesi — yazara giden kural metni şişemez (yeni ders eklenecekse eski bir satır çıkar);
//   3) yasak köprüler kurallarda yalnızca "yasak/yok" bağlamında geçer (örnek diye öğretilmez; Fransa'da birebir kopyalandı).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as L from "../src/pipeline/growth-lessons.js";
import { scriptLint, abstractRuns } from "../src/pipeline/docu-lint.js";
import { planClaimErrors } from "../src/pipeline/docu-plan-editor.js";

const golden = (name) => JSON.parse(fs.readFileSync(new URL(`./fixtures/yazim-altin/${name}.json`, import.meta.url), "utf8"));
const hits = (found, kind, re) => found.filter((x) => x.kind === kind && (!re || re.test(x.say ?? "")));

test("golden France: every flaw the retention curve and the viewer notes showed is still caught", () => {
  const f = golden("france");
  const say = (i) => f.scenes[i].say;
  const found = scriptLint(f.scenes, { research: f.research }).map((x) => ({ ...x, say: say(x.scene) }));
  assert.ok(hits(found, "meta", /As I record this/).length, "0:32 'As I record this…' (izleyicinin dörtte biri açılışta gitti)");
  assert.ok(hits(found, "count", /four words/).length >= 1, "'said four words: we lost control' (üç kelime)");
  assert.ok(hits(found, "unsupported", /5:53/).length, "'at 5:53' (X saat damgası, saat dilimi belirsiz)");
  assert.ok(hits(found, "absolute", /only death/).length, "'the only death officially on record'");
  assert.ok(hits(found, "relative-time", /four days away/).length, "'Saturday is four days away'");
  assert.ok(hits(found, "vague-source").length >= 2, "'Rights groups…', 'Reports say…'");
  assert.ok(hits(found, "template").length >= 3, "'First, the basics', 'But here's the thing', 'Here's where it gets uncomfortable'…");
  assert.ok(abstractRuns(f.scenes).some((r) => r.from <= 96 && r.to >= 98), "zirve sonrası olgusuz yorum bloğu (#95-#99, %27 → %15)");
  // The plan's own false facts are caught before a single chapter is written.
  const plan = planClaimErrors(f.bible, f.research);
  assert.ok(plan.some((e) => e.kind === "count" && e.chapter === 5), "plan ch5 hookIn: 'four words'");
  assert.ok(plan.some((e) => /5:53/.test(e.detail) && e.chapter === 5), "plan ch5 cliffhanger: 'at 5:53'");
});

test("golden Hormuz: copied rule examples are caught", () => {
  const h = golden("hormuz");
  const found = scriptLint(h.scenes, { research: h.research }).map((x) => ({ ...x, say: h.scenes[x.scene].say }));
  assert.ok(hits(found, "template", /quick orientation/).length, "'First, a quick orientation.' (kuraldan birebir)");
  assert.ok(hits(found, "template").length >= 2);
});

const ruleTexts = () => ({
  hook: L.hookGrowthLines({ news: true }),
  voice: L.voiceGrowthLines({ style: "news" }),
  honesty: L.honestyLines({ news: true }),
  spine: L.spineLines({ news: true, story: true, last: true }),
  mid: L.middleGrowthLines(),
  end: L.endGrowthLines({ news: true, finance: true }),
  edit: L.editGrowthLines({ maps: true }),
});
// 22 Ekim 2026 ölçümü: 17.613 karakter, 63 satır. Tavan biraz üstünde; yeni ders = eski satırla takas.
export const RULE_CHAR_BUDGET = 19000;
export const RULE_LINE_BUDGET = 70;

test("prompt budget: the writer's rule text cannot grow into a pile again", () => {
  const all = Object.values(ruleTexts()).flat();
  const chars = all.join("\n").length;
  assert.ok(chars <= RULE_CHAR_BUDGET, `kural metni ${chars} karakter > ${RULE_CHAR_BUDGET}: yeni ders eklenecekse eski bir satırı çıkar ya da birleştir`);
  assert.ok(all.length <= RULE_LINE_BUDGET, `kural satırı ${all.length} > ${RULE_LINE_BUDGET}`);
});

test("filler bridges appear in the rules only as things NOT to write", () => {
  const BRIDGES = [/here's where it gets uncomfortable/i, /but here's the thing/i, /first, the basics/i, /first, a quick orientation/i, /as i record this/i, /and that is the problem/i, /let's dive in/i];
  const NEGATIVE = /(yasak|yok|girmez|gelmez|yazma|değil|frenledi|kopyalan|asla|never|don't)/i;
  for (const [group, lines] of Object.entries(ruleTexts())) {
    for (const line of lines) {
      for (const b of BRIDGES) if (b.test(line)) assert.ok(NEGATIVE.test(line), `${group}: "${line.slice(0, 120)}…" köprüyü örnek gibi veriyor`);
    }
  }
});
