// EKRANDAKİ SAYI = ANLATICININ SÖYLEDİĞİ — Irkutsk (Ekim 2026): "nearly two hundred" derken sayaç 189 gösterdi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignCountersToSpeech } from '../src/pipeline/docu-script.js';

test('sayaç söylenen yakın rakama eşitlenir; söylenen rakam, yıl ve rakamsız satır olduğu gibi kalır', () => {
  const sc = [
    { type: 'counter', say: 'Nearly two hundred people were placed under medical observation.', to: 189 },
    { type: 'counter', say: 'By half past five, thirty-two thousand soldiers had crossed.', to: 32000 },
    { type: 'counter', say: 'The price of oil quadrupled.', to: 12 },
    { type: 'counter', year: true, say: 'In 1973 it began.', to: 1973 },
    { type: 'counter', say: 'Yaklaşık iki yüz kişi gözetime alındı.', to: 189 },
  ];
  assert.equal(alignCountersToSpeech(sc.slice(0, 4), 'en'), 1);
  assert.deepEqual(sc.slice(0, 4).map((x) => x.to), [200, 32000, 12, 1973]);
  assert.equal(alignCountersToSpeech([sc[4]], 'tr'), 1);
  assert.equal(sc[4].to, 200);
});

test('uzak rakam (yüzde 20 dışı) değiştirilmez', () => {
  const sc = [{ type: 'counter', say: 'Two hundred died, and many more fled.', to: 4000 }];
  assert.equal(alignCountersToSpeech(sc, 'en'), 0);
  assert.equal(sc[0].to, 4000);
});
