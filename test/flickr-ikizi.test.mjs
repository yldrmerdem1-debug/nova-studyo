// AYNI FOTOĞRAFIN FLICKR KOPYASI (Gimli Glider, 28 Ekim 2026, 20261028-9ff721): 0. sahne Commons dosyasını adıyla aldı
// ("C-GAUN 604 … Toronto, July 14 1984. (5530418110) (cropped).jpg"); 3. sahnenin (başlık kartı) araması aynı fotoğrafı
// Flickr'dan seçti (live.staticflickr.com/5052/5530418110_….jpg). Adres farklıydı, adıyla alınan dosyanın resim özeti de
// tutulmuyordu: açılışta aynı kare 15 saniye arayla iki kez çıktı. Commons'a Flickr'dan aktarılan dosya adında Flickr
// numarasını taşır; statik ve sayfa adresleri de. Ağ, ffmpeg ve görme modeli YOK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-flickr-ikizi-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const { photoTwinKey } = await import('../src/pipeline/media.js');
const { resolveArchive } = await import('../src/pipeline/docu-archive.js');

const TITLE = 'File:C-GAUN 604 Boeing 767-233 Air Canada, the "Gimli Glider", Toronto, July 14 1984. (5530418110) (cropped).jpg';
const THUMB = 'https://upload.wikimedia.org/wikipedia/commons/c/c8/C-GAUN_604_Boeing_767-233_Air_Canada%2C_the_%22Gimli_Glider%22%2C_Toronto%2C_July_14_1984._%285530418110%29_%28cropped%29.jpg';
const SAYFA = 'https://commons.wikimedia.org/wiki/File:C-GAUN_604_Boeing_767-233_Air_Canada,_the_%22Gimli_Glider%22,_Toronto,_July_14_1984._(5530418110)_(cropped).jpg';
const FLICKR = 'https://live.staticflickr.com/5052/5530418110_f88a580519_b.jpg';
const BASKA = 'https://upload.wikimedia.org/wikipedia/commons/9/9b/Boeing_767-233%2C_Air_Canada_AN0078557.jpg';

test('a Commons Flickr import, its static URL and its Flickr page share one key; other files have none', () => {
  assert.equal(photoTwinKey(TITLE), 'flickr:5530418110');
  assert.equal(photoTwinKey(FLICKR), 'flickr:5530418110');
  assert.equal(photoTwinKey('https://www.flickr.com/photos/58613084@N02/5530418110'), 'flickr:5530418110');
  assert.equal(photoTwinKey('File:Gimli Glider.jpg'), null);
  assert.equal(photoTwinKey(BASKA), null);
});

test('the search does not offer the Flickr copy of a photo another scene took by name', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flickr-ikizi-'));
  const sayfa = { query: { pages: { 7: { title: TITLE, imageinfo: [{ url: THUMB, thumburl: THUMB, mime: 'image/jpeg', width: 2560, height: 1480, descriptionurl: SAYFA,
    extmetadata: { LicenseShortName: { value: 'CC BY-SA 2.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/2.0' }, Artist: { value: 'Andrew Thomas' } } }] } } } };
  const indirilen = [];
  const deps = {
    fetchJson: async () => sayfa,
    download: async (u, dest) => {
      indirilen.push(u);
      if (u === THUMB) return fs.writeFileSync(dest, 'jpeg');
      throw new Error('test: indirme yok');
    },
    run: async (_ff, args) => fs.copyFileSync(args[2], args[args.length - 1]),
    search: async () => [
      { provider: 'flickr', type: 'image', url: FLICKR, width: 1024, height: 630, eser: "C-GAUN / 604 Boeing 767-233 Air Canada, the 'Gimli Glider', Toronto, July 14 1984.", lisans: 'CC BY-SA 2.0', sayfa: 'https://www.flickr.com/photos/58613084@N02/5530418110' },
      { provider: 'wikimedia', type: 'image', url: BASKA, width: 1024, height: 641, eser: 'Boeing 767-233, Air Canada AN0078557', lisans: 'GFDL 1.2', sayfa: 'https://commons.wikimedia.org/wiki/File:Boeing_767-233,_Air_Canada_AN0078557.jpg' },
    ],
    pick: async () => ({ choice: 1, reason: 'test' }),
  };
  const docu = { scenes: [
    { type: 'photo', chapter: 0, say: 'This Boeing 767 left Montreal with a fuel sheet reading 22,300.', source: 'archive', search: 'C-GAUN Air Canada Boeing 767 1984', commons: TITLE },
    { type: 'photo', chapter: 0, say: 'This is Air Canada Flight 143, the Gimli Glider.', source: 'archive', search: 'Gimli Glider C-GAUN Boeing 767' },
  ] };
  const { script, credits } = await resolveArchive(docu, { dir, publicDir: dir, buildPrefix: 'build/g', settings: {}, logFn: () => {}, deps });
  assert.ok(script.scenes[0].image?.startsWith('build/g/cm-'), 'the by-name file is on the first scene');
  assert.ok(!indirilen.includes(FLICKR), `the Flickr copy of the same photo was a candidate: ${indirilen.join(', ')}`);
  assert.ok(indirilen.includes(BASKA), 'the other candidate is still tried');
  assert.notEqual(credits['scene-1']?.url, FLICKR);
});
