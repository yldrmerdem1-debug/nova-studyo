// MÜZİK FİLMİN KONUSUNU, DÖNEMİNİ BİLMELİ VE NEFES ALMALI.
//
// ÖLÇÜLEN KUSUR (26 Ekim 2026, 2009 denizaltı çarpışması, 20261024-373aaf):
// müzik planı "dönem ? · konu space · tercih ambient/synth…" dedi, tema
// "Laniakea" (bir galaksi kümesi) oldu ve 13,9 dakikada hiç nefes yoktu.
//   - Dönem: yearsIn, arkasından virgül/nokta gelen yılı ("February 2009, two
//     boats…", "in 2009.") saymıyordu; anlatımdaki her 2009 böyleydi.
//   - Konu: konu kitabının GÖRÜNÜŞ alanları okunuyordu — görünüm "deep-space-cyan"
//     ve "retro-nasa", "rocket" ikonu, Space Grotesk yazı tipi → "space".
//     Denizaltı/sonar/donanma için bir konu rengi de yoktu.
//   - Nefes: her bölüm zirveyle bitiyor, ardından bölüm kartı geliyordu; nefes
//     yalnızca aynı bölümde ve farklı bir duyguya geçerken veriliyordu → 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { yearsIn, storyYear, styleProfile, planScore } from '../docu-engine/lib/audio-director.mjs';

test('cümle sonundaki yıl sayılıyor, sayı içindeki sayılmıyor', () => {
  assert.deepEqual(yearsIn('On 17 February 2009, British ministers were handed a line.'), [2009]);
  assert.deepEqual(yearsIn('They collided in 2009.'), [2009]);
  assert.deepEqual(yearsIn('Le Triomphant (1994) and Vanguard; 1993'), [1994, 1993]);
  assert.deepEqual(yearsIn('2,009 sailors'), []);
  assert.deepEqual(yearsIn('a ratio of 2009.5'), []);
});

test('konu kitabının görünüşü konu sayılmıyor; denizaltı hikâyesi "naval"', () => {
  const script = {
    title: 'HMS Vanguard and Le Triomphant: The Night Two Nuclear Submarines Collided in the Atlantic',
    topic: {
      message: 'PROBABLY A CONTAINER', variants: ['retro-nasa', 'deep-space-cyan', 'blueprint-lab'],
      iconSet: ['ship', 'rocket', 'anchor'], typography: { headline: 'spacegrotesk', body: 'plexMono' },
      backdrops: ['charcoal sonar waterfall'], params: { collision: '3-4 FEB 2009' },
    },
    scenes: [{ say: 'Both were nuclear missile submarines.' }, { say: 'On 17 February 2009, ministers spoke.' }],
  };
  const p = styleProfile(script, 'epic');
  assert.ok(!p.topics.some((t) => t.startsWith('space')), `konu: ${p.topics}`);
  assert.ok(p.topics.includes('naval'), `konu: ${p.topics}`);
  assert.equal(p.year, 2009);
  assert.ok((p.w.drone ?? 0) > 0 && (p.w.beat ?? 0) < 0, JSON.stringify(p.w));
});

test('uzay hikâyesi hâlâ uzay', () => {
  const p = styleProfile({ title: 'Voyager 1: The Spacecraft That Left the Solar System', scenes: [{ say: 'In 1977 NASA launched it.' }] }, 'science');
  assert.ok(p.topics.includes('space'));
  assert.equal(storyYear({ scenes: [{ say: 'In 1977, NASA launched it.' }] }), 1977);
});

const JOB = 'D:/Nova Studyo/data/jobs/20261024-373aaf';
const LIB = 'D:/Nova Studyo/data/audio-library';
const real = fs.existsSync(`${JOB}/docu/20261024-373aaf.props.json`) && fs.existsSync(`${LIB}/library.json`);
test('gerçek iş: dönem 2009, konu naval, en az dört dakikada bir nefes (bölüm kartında)', { skip: !real && 'iş dosyaları bu makinede yok' }, async () => {
  const { placeTimeline } = await import('../docu-engine/src/timeline.js');
  const script = JSON.parse(fs.readFileSync(`${JOB}/docu/20261024-373aaf.props.json`, 'utf8')).script;
  const sceneSeconds = placeTimeline(script.scenes, 30, []).map((p) => p.frames / 30);
  const lib = JSON.parse(fs.readFileSync(`${LIB}/library.json`, 'utf8'));
  const plan = planScore({ script, sceneSeconds, lib, root: LIB, genre: script.genre, seed: '20261024-373aaf', history: [], selector: 'v2' });
  assert.equal(plan.profile.year, 2009);
  assert.ok(plan.profile.topics.includes('naval') && !plan.profile.topics.some((t) => t.startsWith('space')), plan.profile.topics.join(','));
  const breaths = plan.cues.filter((c) => c.breath);
  const total = plan.cues.at(-1).toSec;
  assert.ok(breaths.length >= Math.floor(total / 240), `${breaths.length} nefes / ${total.toFixed(0)} sn`);
  for (const b of breaths) assert.ok(b.toSec - b.fromSec >= 1.5 && b.toSec - b.fromSec <= 2.7, 'nefes 1,6-2,6 sn');
  const starts = breaths.map((b) => b.fromSec).sort((a, b) => a - b);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 89, 'nefesler arası ≥ 90 sn');
});
