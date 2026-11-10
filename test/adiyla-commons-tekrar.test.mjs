// ADIYLA ALINAN COMMONS DOSYASI İKİNCİ KEZ EKRANA GELMEZ — aramadaki kopyası (Openverse/upload adresi) da.
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, Kartal Yuvası yangını, iş 20261024-950730): job.log "Commons dosyası ikinci kez istendi,
// bu sahne arama yapacak: File:Kehlsteinhaus zepředu.jpg" (zezadu ve Brettgabel için de) yazdı; o sahnelerin araması
// aynı dosyayı yeniden seçti. docu-archive-done.json: scene-12 (wikimedia, cm-1f2c309dc85c.jpg, url thumb.wikimedia.org)
// ile scene-79 (openverse, upload.wikimedia.org/…/Kehlsteinhaus_zep%C5%99edu.jpg) aynı fotoğraf; scene-32/85 ve
// scene-1/86 bayt bayt aynı (md5 732215d2…, ef9f8b06…). Videoda 0:48 ve 6:42'de aynı kare, açıklamada çift künye.
// Sebep: adıyla seçilen dosyalar yalnızca yerel adiylaDosya kümesine yazılıyordu, kullanılan fotoğraf kaydı (ayrilan)
// onları bilmiyordu; ayrıca photoKey thumb.wikimedia.org adresini tanımıyordu. Ağ, ffmpeg ve görme modeli YOK.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-adiyla-tekrar-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const { photoKey } = await import('../src/pipeline/media.js');
const { resolveArchive } = await import('../src/pipeline/docu-archive.js');

const UPLOAD = 'https://upload.wikimedia.org/wikipedia/commons/3/32/Kehlsteinhaus_zep%C5%99edu.jpg';
// Kartal künyesindeki (scene-12) gerçek adres biçimi.
const THUMB = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/3/32/Kehlsteinhaus_zep%C5%99edu.jpg/3840px-Kehlsteinhaus_zep%C5%99edu.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail';
const SAYFA = 'https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_zep%C5%99edu.jpg';
const BASKA = 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Kehlsteinhaus_zezadu.jpg';

test('photoKey: thumb.wikimedia.org küçük resmi, upload adresi ve Commons sayfası tek anahtar', () => {
  assert.equal(photoKey(THUMB), photoKey(UPLOAD));
  assert.equal(photoKey(THUMB), photoKey(SAYFA));
  assert.equal(photoKey(THUMB), 'wikimedia:kehlsteinhaus_zepředu.jpg');
  assert.notEqual(photoKey(THUMB), photoKey(BASKA), 'başka dosya ayrı kalır');
});

test('adıyla alınan dosya, ikinci kez isteyen sahnenin aramasında (Openverse kopyası) aday olmaz', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adiyla-tekrar-'));
  const sayfa = { query: { pages: { 7: { title: 'File:Kehlsteinhaus zepředu.jpg', imageinfo: [{ url: UPLOAD, thumburl: THUMB, mime: 'image/jpeg', width: 3504, height: 1640, descriptionurl: SAYFA,
    extmetadata: { LicenseShortName: { value: 'CC BY 2.5' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by/2.5' }, Artist: { value: 'Ondřej Žváček' } } }] } } } };
  const indirilen = [];
  const deps = {
    fetchJson: async () => sayfa,
    // Adıyla alınan dosya yazılır; arama adaylarının küçük resmi indirilemez (ffmpeg hiç çalışmaz).
    download: async (u, dest) => {
      indirilen.push(u);
      if (u === THUMB) return fs.writeFileSync(dest, 'jpeg');
      throw new Error('test: indirme yok');
    },
    run: async (_ff, args) => fs.copyFileSync(args[2], args[args.length - 1]),
    search: async () => [
      { provider: 'openverse', type: 'image', url: UPLOAD, width: 2560, height: 1198, eser: 'File:Kehlsteinhaus zepředu.jpg', lisans: 'BY 2.5', sayfa: 'https://commons.wikimedia.org/w/index.php?curid=15731027' },
      { provider: 'wikimedia', type: 'image', url: BASKA, width: 2560, height: 1920, eser: 'Kehlsteinhaus zezadu', lisans: 'CC BY 2.5', sayfa: 'https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_zezadu.jpg' },
    ],
    pick: async () => ({ choice: 1, reason: 'test' }),
  };
  const docu = { scenes: [
    { type: 'photo', chapter: 0, say: 'This is the Kehlsteinhaus.', source: 'archive', search: 'Kehlsteinhaus front', commons: 'File:Kehlsteinhaus zepředu.jpg' },
    { type: 'photo', chapter: 5, say: 'But was this really where Hitler lived?', source: 'archive', search: 'Kehlsteinhaus front view stone building', commons: 'File:Kehlsteinhaus_zepředu.jpg' },
  ] };
  const log = [];
  const { script, credits } = await resolveArchive(docu, { dir, publicDir: dir, buildPrefix: 'build/k', settings: {}, logFn: (m) => log.push(m), deps });
  assert.ok(script.scenes[0].image?.startsWith('build/k/cm-'), 'adıyla istenen dosya ilk sahnede');
  assert.equal(credits['scene-0'].url, THUMB);
  assert.ok(log.some((m) => /ikinci kez istendi/.test(m)));
  assert.ok(!indirilen.includes(UPLOAD), `aynı fotoğrafın Openverse kopyası aday yapıldı: ${indirilen.join(', ')}`);
  assert.ok(indirilen.includes(BASKA), 'öteki aday yine denenir (arama çalıştı)');
  assert.equal(script.scenes[1].image, undefined);
  assert.equal(credits['scene-1'], undefined, 'aynı dosyaya ikinci künye yazılmaz');
});
