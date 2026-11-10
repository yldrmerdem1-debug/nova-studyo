// ADIYLA COMMONS — senaryo bir sahneye tam Commons dosya adı yazdıysa (güncel olay: ABD Donanması, hükümet,
// ajans fotoğrafı) arama ve ücretli seçici atlanır, dosya lisansı kontrol edilerek doğrudan alınır. Aynı
// dosya ikinci sahneye verilmez; lisansı uygun olmayan dosya alınmaz, sahne aramaya döner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
import { resolveArchive, commonsFile } from '../src/pipeline/docu-archive.js';

const ornek = path.join(os.tmpdir(), `adiyla-${process.pid}.jpg`);
spawnSync(ffmpegPath, ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=1600x900', '-frames:v', '1', ornek]);
const sayfa = (lisans, artist = 'U.S. Navy') => ({ query: { pages: { 7: { title: 'File:Tanker 2019.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/a/Tanker_2019.jpg', thumburl: 'https://upload.wikimedia.org/a/2560px-Tanker_2019.jpg', mime: 'image/jpeg', width: 4000, height: 2250, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Tanker_2019.jpg', extmetadata: { LicenseShortName: { value: lisans }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0' }, Artist: { value: artist } } }] } } } });
const deps = (lisans) => ({
  fetchJson: async () => sayfa(lisans),
  download: async (_u, dest) => fs.copyFileSync(ornek, dest),
  run: async (_ff, args) => fs.copyFileSync(ornek, args[args.length - 1]),
});

test('adıyla istenen dosya aramasız alınır, ikinci sahneye verilmez', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adiyla-'));
  const docu = { scenes: [
    { type: 'photo', say: 'Iran seized the tanker.', source: 'archive', search: 'tanker seized', commons: 'File:Tanker 2019.jpg' },
    { type: 'photo', say: 'The same ship, again.', source: 'ai', commons: 'File:Tanker_2019.jpg' },
  ] };
  const log = [];
  const { script, credits } = await resolveArchive(docu, { dir, publicDir: dir, buildPrefix: 'build/x', settings: {}, logFn: (m) => log.push(m), deps: deps('Public domain') });
  assert.ok(script.scenes[0].image?.startsWith('build/x/cm-'));
  assert.equal(script.scenes[0].archived, true);
  assert.equal(script.scenes[0].imgW, 1600);
  assert.equal(credits['scene-0'].provider, 'wikimedia');
  assert.equal(credits['scene-0'].permissionVerified, true);
  assert.equal(script.scenes[1].image, undefined, 'aynı dosya ikinci kez verilmez');
  assert.ok(log.some((m) => /ikinci kez/.test(m)));
});

test('adıyla istenen dosya split ve sayaç sahnesine de alınır (Panama: AI\'a düşüyordu)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adiyla-'));
  const docu = { scenes: [
    { type: 'split', say: 'Now compare.', left: { label: 'A' }, right: { label: 'B' }, imagePrompt: 'a bridge', commons: 'File:Tanker 2019.jpg' },
  ] };
  const { script } = await resolveArchive(docu, { dir, publicDir: dir, buildPrefix: 'build/x', settings: {}, logFn: () => {}, deps: deps('Public domain') });
  assert.ok(script.scenes[0].image?.startsWith('build/x/cm-'));
  assert.equal(script.scenes[0].archived, true);
});

test('lisansı uygun olmayan dosya alınmaz', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adiyla-'));
  const got = await commonsFile('File:Tanker 2019.jpg', { publicDir: dir, buildPrefix: 'build/x', deps: deps('CC BY-NC 4.0') });
  assert.ok(got && !got.file && /lisans/.test(got.reason));
});
