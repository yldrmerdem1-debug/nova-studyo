// Opening-logic catalog: many ways in, fitted to the tone, rotated across the channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-hooks-test-'));
const H = await import('../src/pipeline/docu-hooks.js');
const S = await import('../src/pipeline/docu-script.js');

test('hooks: fifty-two different opening logics, every tone has a real choice, ids unique', () => {
  assert.equal(H.HOOKS.length, 52);
  assert.equal(new Set(H.HOOKS.map((h) => h.id)).size, 52);
  for (const t of ['documentary', 'crime', 'epic', 'science', 'inspire', 'finance', 'horror', 'news', 'ranking', 'whatif']) {
    assert.ok(H.hookCandidates({ tone: t, topic: 'x' }).length >= 6, t);
  }
});

test('hooks: a serious news story is never offered the shock-slam opening; the last six used are not offered again', () => {
  const news = H.hookCandidates({ tone: 'news', topic: 'plague lab death', n: 50 }).map((h) => h.id);
  assert.ok(!news.includes('slam-fragments'));
  const history = ['cold-fact', 'contradiction', 'one-question', 'timestamp', 'rumor-vs-record', 'two-timelines'].map((id) => ({ id }));
  const next = H.hookCandidates({ tone: 'news', topic: 'plague lab death', history, n: 6 }).map((h) => h.id);
  assert.ok(next.every((id) => !history.some((x) => x.id === id)), next.join(','));
});

test('hooks: the history is kept, and chapter one is told to open with the chosen logic', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-hooks-'));
  H.recordHook(dir, { id: 'scene-promise', topic: 'Napoleon 1812' });
  assert.equal(H.readHookHistory(dir).at(-1).id, 'scene-promise');
  const g = { write: { openers: ['montage'], coldOpen: 'Montaj: 5-7 makro detay' } };
  assert.match(S.openingRule({ openingLogic: 'scene-promise' }, g), /Sahne \+ vaat/);
  assert.match(S.openingRule({}, g), /Montaj: 5-7 makro detay/, 'an older plan keeps its genre opening');
});

test('hooks: news and finance lead with a striking-but-clear opening that rotates (not always state-of-play), never slam fragments', () => {
  for (const tone of ['news', 'finance']) {
    const firsts = new Set(['strait of hormuz', 'plague in irkutsk', 'nvidia 6 trillion', 'gas prices record', 'iran war'].map((topic) => H.hookCandidates({ tone, topic, n: 6 })[0].id));
    for (const id of firsts) assert.ok(H.LEAD_NEWS.includes(id), id);
    assert.ok(firsts.size >= 2, 'the lead rotates across topics: ' + [...firsts].join(','));
    assert.ok(!H.hookCandidates({ tone, topic: 'strait of hormuz', n: 60 }).some((h) => h.id === 'slam-fragments'), tone);
  }
  const used = H.LEAD_NEWS.slice(0, 5).map((id) => ({ id }));
  assert.equal(H.hookCandidates({ tone: 'news', topic: 'x', history: used, n: 6 })[0].id, H.LEAD_NEWS[5], 'the recently used leads are skipped');
  assert.match(H.hookById('teaser-ladder').how, /fragman/);
  assert.doesNotMatch(H.hookById('state-of-play').how, /slam, gizem kurma YOK/);
});
