// SHORTS'TA KÜÇÜK COMMONS GÖRSELİ — dikey kare (1080x1920) görselin tam yüksekliğinden kesilir. 309 px'lik
// bir 1973 tank taraması 6 kat büyür, lekeli görünür (Yom Kippur Shorts planı, Ekim 2026). Plan böyle bir
// dosyayı adıyla isterse indirilmez; "küçük" diye döner, o cümle başka görsel arar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { commonsPicture, SHORT_MIN_PICTURE_H } from '../src/pipeline/docu-short-standalone.js';

const page = (h) => ({ query: { pages: { 1: { title: 'File:Tank.jpg', imageinfo: [{ url: 'https://upload.wikimedia.org/x/Tank.jpg', thumburl: 'https://upload.wikimedia.org/x/2000px-Tank.jpg', width: Math.round(h * 1.5), height: h, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Tank.jpg', extmetadata: { LicenseShortName: { value: 'Public domain' }, License: { value: 'pd' }, Artist: { value: 'IDF' } } }] } } } });
const fetchFor = (h, seen) => async (url) => {
  seen.push(url);
  if (url.includes('api.php')) return { ok: true, json: async () => page(h) };
  return { ok: true, arrayBuffer: async () => new Uint8Array([255, 216, 255, 217]).buffer };
};

test('küçük dosya indirilmez, yüksekliğiyle döner', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-'));
  const seen = [];
  const got = await commonsPicture('File:Tank.jpg', { publicDir: dir, fetchFn: fetchFor(446, seen) });
  assert.deepEqual(got, { small: 446 });
  assert.equal(seen.filter((u) => !u.includes('api.php')).length, 0, 'görsel indirilmemeli');
});

test('yeterince yüksek dosya alınır', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-'));
  const got = await commonsPicture('File:Tank.jpg', { publicDir: dir, fetchFn: fetchFor(2480, []) });
  assert.ok(got?.rel, 'rel dönmeli');
  assert.ok(fs.existsSync(path.join(dir, got.rel)));
});

test('eşik ~2.7 kat büyütme', () => {
  assert.ok(1920 / SHORT_MIN_PICTURE_H <= 2.7);
});
