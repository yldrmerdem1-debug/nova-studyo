// Opening-logic catalog: many ways in, fitted to the tone, rotated across the channel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-hooks-test-'));
const H = await import('../src/pipeline/docu-hooks.js');
const S = await import('../src/pipeline/docu-script.js');

test('hooks: fifty different opening logics, every tone has a real choice, ids unique', () => {
  assert.equal(H.HOOKS.length, 50);
  assert.equal(new Set(H.HOOKS.map((h) => h.id)).size, 50);
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
