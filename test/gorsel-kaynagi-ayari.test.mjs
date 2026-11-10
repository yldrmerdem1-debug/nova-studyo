// GÖRSEL KAYNAĞI AYARI DEVAM EDEN İŞE DE GEÇER.
//
// KUSUR (25 Ekim 2026, kod incelemesi): config.js SNAPSHOT_KEYS anahtarlar, ffmpeg yolları, keepIntermediate ve
// audioLibraryDir dışındaki her ayarı işin kopyasına alıyor, getJobSettings kopyayı güncel ayarın üstüne yazıyordu.
// docuImageProvider da kopyadaydı. OpenAI görsel kredisi bitince Nova "Ayarlar'da görsel kaynağını ChatGPT kutusu
// yapın" diyor (credit-preflight.js) ve motor "Kaldığı yerden devam et" diyor; ama devam eden iş eski kaynağı
// kopyasından okumaya devam ediyordu (docu.js docuImageProvider(settings), Commons kapısı) — job.json elle düzeltilmeliydi.
//
// DÜZELTME: docuImageProvider işletme seçimi; kopyaya girmez, eski işlerin kopyasındaki değer de yok sayılır.
// Yaratıcı ayarlar (ses modeli, yazar modeli, müzik seviyesi) ve kolaj sağlayıcısı (imageProvider) işle donmaya devam eder.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-gorsel-kaynagi-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const { saveSettings, snapshotSettings, getJobSettings } = await import('../src/config.js');

test('a new job snapshot carries no image provider, creative settings stay frozen', () => {
  saveSettings({ docuImageProvider: 'openai', docuVoiceModel: 'eleven_v3', musicVolume: 0.11 });
  const snap = snapshotSettings();
  assert.equal(Object.hasOwn(snap, 'docuImageProvider'), false);
  assert.equal(snap.docuVoiceModel, 'eleven_v3');
  saveSettings({ docuImageProvider: 'manual', docuVoiceModel: 'eleven_v4', musicVolume: 0.24 });
  const st = getJobSettings({ settingsSnapshot: snap });
  assert.equal(st.docuImageProvider, 'manual');
  assert.equal(st.docuVoiceModel, 'eleven_v3');
  assert.equal(st.musicVolume, 0.11);
});

test('an old job whose snapshot froze the provider follows the current Settings on resume', () => {
  // 20261024-950730 job.json settingsSnapshot'ından, olduğu gibi.
  const job = { settingsSnapshot: { docuImageProvider: 'openai', docuVoiceModel: 'eleven_v4', docuWriterModel: 'claude-opus-5-5', docuAutoShorts: 2, docuMaxClaudeUsd: 12, musicVolume: 0.16 } };
  saveSettings({ docuImageProvider: 'manual', docuVoiceModel: 'eleven_v3', docuMaxClaudeUsd: 4 });
  const st = getJobSettings(job);
  assert.equal(st.docuImageProvider, 'manual');
  assert.equal(st.docuVoiceModel, 'eleven_v4');
  assert.equal(st.docuMaxClaudeUsd, 12);
  saveSettings({ docuImageProvider: 'replicate' });
  assert.equal(getJobSettings(job).docuImageProvider, 'replicate');
});

test('the collage provider and credentials keep their earlier snapshot contract', () => {
  saveSettings({ imageProvider: 'fal', videoProvider: 'fal', anthropicKey: 'offline-placeholder' });
  const snap = snapshotSettings();
  assert.equal(snap.imageProvider, 'fal');
  assert.equal(snap.videoProvider, 'fal');
  assert.equal(snap.anthropicKey, undefined);
  assert.equal(snap.ffmpegPath, undefined);
  saveSettings({ imageProvider: 'kie', videoProvider: 'kie' });
  assert.equal(getJobSettings({ settingsSnapshot: snap }).imageProvider, 'fal');
});
