import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { test, after } from 'node:test';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-settings-contract-'));
process.env.NOVA_HOME = home;
process.env.NOVA_EMBEDDED = '1';
const probe = net.createServer().listen(0, '127.0.0.1');
await once(probe, 'listening');
process.env.NOVA_PORT = String(probe.address().port);
await new Promise(resolve => probe.close(resolve));
const { server, shutdown } = await import('../server.js');
if (!server.listening) await once(server, 'listening');
const cfg = await import('../src/config.js');
const base = `http://127.0.0.1:${server.address().port}`;
async function save(body) {
  const r = await fetch(base + '/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
after(async () => { const closed = once(server, 'close'); shutdown(); await closed; });

test('zero music volume survives the public API and effective render settings', async () => {
  const r = await save({ musicVolume: 0 });
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.musicVolume, 0);
  assert.equal(cfg.getSettings().musicVolume, 0);
});
test('a manual CRF change reaches the encoder without a hidden quality override', async () => {
  const r = await save({ crf: 26 });
  assert.equal(r.status, 200);
  assert.equal(cfg.getSettings().crf, 26);
  assert.equal(r.data.settings.crf, 26);
  assert.equal(cfg.getSettings().renderQuality, 'custom');
});
test('named quality wins explicitly and the UI sees the effective value', async () => {
  const r = await save({ renderQuality: 'kalite', crf: 26 });
  assert.equal(r.data.settings.renderQuality, 'kalite');
  assert.equal(r.data.settings.crf, 16);
  assert.equal(cfg.getSettings().crf, 16);
});
test('sound controls round trip, including a fully silent effects layer', async () => {
  const r = await save({ soundDesign: false, sfxVolume: 0, editIntensity: 'restrained' });
  assert.equal(r.data.settings.soundDesign, false);
  assert.equal(r.data.settings.sfxVolume, 0);
  assert.equal(r.data.settings.editIntensity, 'restrained');
});
test('invalid settings reject atomically instead of recording NaN or unexpected modes', async () => {
  const before = cfg.getSettings().musicVolume;
  const r = await save({ musicVolume: 'broken', editIntensity: 'extreme' });
  assert.equal(r.status, 400);
  assert.equal(cfg.getSettings().musicVolume, before);
});
test('job snapshots preserve editorial settings but never credentials or machine executables', async () => {
  assert.equal(typeof cfg.snapshotSettings, 'function');
  cfg.saveSettings({ anthropicKey: 'test-secret', musicVolume: 0.11 });
  const snapshot = cfg.snapshotSettings();
  assert.equal(snapshot.anthropicKey, undefined);
  assert.equal(snapshot.ffmpegPath, undefined);
  cfg.saveSettings({ musicVolume: 0.24 });
  const effective = cfg.getJobSettings({ settingsSnapshot: snapshot });
  assert.equal(effective.musicVolume, 0.11);
  assert.equal(effective.anthropicKey, 'test-secret');
  assert.equal(cfg.publicSettings().anthropicKey, undefined);
});
