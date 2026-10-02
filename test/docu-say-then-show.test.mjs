// "Say it, then show it": on-screen information never appears before the narrator says it
// (docu-engine/src/infographics/timing.js). User: "önce söylesin, sonra ekranda gözüksün".
import test from 'node:test';
import assert from 'node:assert/strict';

const T = await import('../docu-engine/src/infographics/timing.js');
const sp = (pairs) => T.spokenOf(pairs.map(([word, t]) => ({ word, t })));

test('a comma after "thousand" does not split the number; a real second number stays apart', () => {
  const defenders = sp([['The', 0.07], ['total...', 0.16], ['four', 1.728], ['thousand,', 2], ['seven', 3.187], ['hundred', 3.58], ['and', 4.14], ['seventy-three.', 4.61]]);
  const nums = T.spokenNumbers(defenders);
  assert.deepEqual(nums.map((n) => n.values), [[4773]]);
  assert.equal(nums[0].t, 1.728);
  assert.equal(nums[0].tEnd, 4.61, 'the count can land on the last spoken word');
  assert.deepEqual(T.spokenNumbers(sp([['About', 0], ['ten', 0.3], ['thousand,', 0.6], ['maybe', 1], ['twelve.', 1.4]])).map((n) => n.values), [[10000], [12]]);
});

test('a big figure starts counting on its word, not 0.85 s before it', () => {
  const scene = { type: 'stat', value: '80,000', label: 'Ottoman army', wordTimes: [{ word: 'Against', t: 0.4 }, { word: 'them', t: 0.6 }, { word: 'eighty', t: 2.6 }, { word: 'thousand.', t: 2.97 }] };
  const plan = T.infoPlan(scene, 150, 30);
  assert.equal(plan.start, Math.round(2.6 * 30), 'starts on "eighty"');
  assert.ok(plan.land > plan.start);
});

test('bars: a bar named later grows on its own word', () => {
  const scene = {
    type: 'bars',
    items: [{ label: 'Ottomans', value: 80000 }, { label: 'Greeks', value: 7000 }],
    wordTimes: [{ word: 'The', t: 0.1 }, { word: 'Ottomans', t: 0.5 }, { word: 'brought', t: 0.9 }, { word: 'eighty', t: 1.2 }, { word: 'thousand,', t: 1.5 }, { word: 'the', t: 2.4 }, { word: 'Greeks', t: 2.6 }, { word: 'seven', t: 3.1 }, { word: 'thousand.', t: 3.4 }],
  };
  const plan = T.infoPlan(scene, 180, 30);
  assert.ok(plan.hits[1] >= Math.round(2.6 * 30), 'the second bar waits for "Greeks"');
  assert.ok(plan.hits.every((h) => h == null || h >= 0));
});
