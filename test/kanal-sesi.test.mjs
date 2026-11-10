// 1.16.16 — KANAL SESİ (16 Ekim 2026): podcast (36 kanallı otomasyon kanalcısı): "Brian 40.000 kanalda", aynı sesli
// kanallar bir kefeye konuyor. Kullanıcı Voice Design ile kanala özel ses seçti ("Tarih · The Last Entry",
// "Finans · Margin Theory"). Bu sesler v4 doğrulaması taşımıyor (verified_languages boş) ama v4'te okuyor; eski liste
// yalnızca v4 doğrulamalı sesleri gösterdiği için Nova'da hiç görünmüyorlardı.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const { settingsPatch } = await import('../src/settings-input.js');

test('ses listesi: hesabın kendi sesleri (Voice Design/klon) v4 doğrulamasız da listede ve en üstte, kanalıyla', () => {
  const src = read('../server.js');
  assert.ok(src.includes('const OWN_VOICE = new Set(["generated", "cloned"]);'));
  assert.ok(src.includes('v4: !!v4 || own, own,'));
  assert.ok(src.includes('Number(b.own) - Number(a.own) || Number(b.v4) - Number(a.v4)'));
  const body = src.slice(src.indexOf('const ownChannel = '), src.indexOf('};', src.indexOf('const ownChannel = ')) + 2);
  const ownChannel = new Function(`${body}; return ownChannel;`)();
  const settings = { docuStyleVoices: { epic: 'Aa6nEBJJMKJwJkCx8VU2', news: 'NEWSVOICE1234', finance: '' } };
  assert.equal(ownChannel({ voice_id: 'ZxNJpas4pkSiLrqFxH6c', labels: { nova_channel: 'epic' } }, settings), 'epic');
  assert.equal(ownChannel({ voice_id: 'NEWSVOICE1234', labels: {} }, settings), 'news');
  assert.equal(ownChannel({ voice_id: 'other', labels: { nova_channel: 'cooking' } }, settings), null);
});

test('ayar: kanal sesleri yalnızca üç kanal ve geçerli ses kimliği; boş = seçilmedi', () => {
  assert.deepEqual(settingsPatch({ docuStyleVoices: { epic: 'ZxNJpas4pkSiLrqFxH6c', finance: 'FzYpZgiSsZQTU8fLsYQR' } }).docuStyleVoices,
    { epic: 'ZxNJpas4pkSiLrqFxH6c', news: '', finance: 'FzYpZgiSsZQTU8fLsYQR' });
  assert.throws(() => settingsPatch({ docuStyleVoices: { epic: '<script>' } }));
  assert.throws(() => settingsPatch({ docuStyleVoices: 'ZxNJpas4pkSiLrqFxH6c' }));
  assert.equal('cooking' in settingsPatch({ docuStyleVoices: { cooking: 'ZxNJpas4pkSiLrqFxH6c' } }).docuStyleVoices, false);
});

test('arayüz: kanal sesi "🏛 Tarih kanalının sesi — The Last Entry", Ayarlar\'da ★ sana özel; yaygın kütüphane sesine uyarı', () => {
  const app = read('../public/app.js');
  assert.ok(app.includes('const CHANNEL_VOICE_TR = { epic: "🏛 Tarih", news: "📰 Gündem", finance: "💹 Finans" };'));
  assert.ok(app.includes('kanalının sesi — ${v.name.split(" · ").pop()}') && app.includes('sana özel ses · başka hiçbir kanalda yok'));
  assert.ok(app.includes('⚠ çok yaygın') && app.includes('id="sVoice_${k}"') && app.includes('docuStyleVoices: Object.fromEntries('));
  const fn = app.slice(app.indexOf('function channelVoiceOptions'), app.indexOf('\n}\n', app.indexOf('function channelVoiceOptions')) + 2);
  const esc = (s) => String(s ?? '');
  const make = (voices) => new Function('state', 'esc', `${fn}; return channelVoiceOptions;`)({ elevenVoices: voices }, esc);
  const html = make([{ id: 'BRIANxxxxxx', name: 'Brian - Deep' }, { id: 'ZxNJpas4pkSiLrqFxH6c', name: 'Tarih · The Last Entry', own: true }])('ZxNJpas4pkSiLrqFxH6c');
  assert.ok(html.indexOf('★ Tarih · The Last Entry · sana özel') < html.indexOf('Brian'), 'kendi ses önce');
  assert.ok(/value="ZxNJpas4pkSiLrqFxH6c" selected/.test(html));
  // liste gelmeden kaydedilirse mevcut ses korunur
  assert.ok(/value="Aa6nEBJJMKJwJkCx8VU2" selected>yükleniyor/.test(make(null)('Aa6nEBJJMKJwJkCx8VU2')));
});
