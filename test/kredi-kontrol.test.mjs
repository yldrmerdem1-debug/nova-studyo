// 1.16.23 — KREDİ ÖN KONTROLÜ ve KAPISIZ RENDER YOK (24-25 Ekim 2026). OpenAI görsel kredisi sıfırken üç iş sıraya
// girdi, görselde takıldı; elle doldurulan stok fotoğraflar finans videosuna hata soktu. Ön izleme kapısı tarayıcı
// zaman aşımıyla kapanınca video denetimsiz render'a girdi (25 sorun). Kanal sahibi: "uygulama hata yapmasın".
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-kredi-'));
const P = await import('../src/pipeline/credit-preflight.js');
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

test('ElevenLabs yetmiyorsa ve OpenAI görsel kredisi bittiyse iş başlamaz; ne yükleneceği söylenir', async () => {
  const fetchFn = async (url) => /elevenlabs/.test(url)
    ? res(200, { character_limit: 131000, character_count: 120000 })
    : res(429, { error: { code: 'credit_balance_exhausted', type: 'insufficient_quota' } });
  const r = await P.creditPreflight({ elevenKey: 'e', openaiKey: 'o' }, { provider: 'openai', fetchFn, now: 1 });
  assert.equal(r.problems.length, 2);
  assert.match(r.problems[0], /ElevenLabs kredisi yetmiyor/);
  assert.match(r.problems[1], /OpenAI görsel kredisi bitmiş.*Billing/);
});

test('kredi varsa sorun yok; görsel "var" sonucu 6 saat hatırlanır (deneme görseli her işte ödenmez)', async () => {
  let calls = 0;
  const fetchFn = async (url) => { if (/openai/.test(url)) calls++; return /elevenlabs/.test(url) ? res(200, { character_limit: 131000, character_count: 0 }) : res(200, {}); };
  const s = { elevenKey: 'e', openaiKey: 'o' };
  assert.deepEqual((await P.creditPreflight(s, { provider: 'openai', fetchFn, now: 1000 })).problems, []);
  await P.creditPreflight(s, { provider: 'openai', fetchFn, now: 1000 + 3600e3 });
  assert.equal(calls, 1, 'ikinci kontrol kayıttan');
});

test('ağ hatası işi durdurmaz (uyarı); ChatGPT kutusu görsel kredisi istemez; kontrol kapatılabilir', async () => {
  const down = async () => { throw new Error('ENOTFOUND'); };
  const r = await P.creditPreflight({ elevenKey: 'e', openaiKey: 'o' }, { provider: 'replicate', fetchFn: down, now: 5 });
  assert.equal(r.problems.length, 0);
  assert.equal(r.warnings.length, 2);
  let hit = 0;
  await P.creditPreflight({ openaiKey: 'o' }, { provider: 'manual', fetchFn: async () => { hit++; return res(200, {}); } });
  assert.equal(hit, 0);
  assert.deepEqual(await P.creditPreflight({ elevenKey: 'e', docuCreditCheck: false }, { provider: 'openai', fetchFn: down }), { problems: [], warnings: [] });
});

test('akış: kredi kontrolü işin başında; yeni iş kredisizse başlamaz; kapı çalışamazsa render başlamaz', () => {
  const d = read('../src/pipeline/docu.js');
  const start = d.indexOf('export async function runDocuJob(');
  const research = d.indexOf('// 1-2) ARAŞTIRMA');
  const pre = d.indexOf('creditPreflight(settings, { provider: docuImageProvider(settings) })');
  assert.ok(start > 0 && pre > start && pre < research, 'araştırmadan önce');
  assert.ok(d.includes('if (pre.problems.length && !hasScript) throw new Error(`İş başlamadı — ${pre.problems.join("; ")}`);'));
  assert.ok(d.includes('if (settings.docuPreviewRequired !== false) throw new Error(`Ön izleme kapısı çalışmadı — render başlatılmadı'));
  const gate = d.indexOf('if (settings.docuPreviewRequired !== false) throw');
  assert.ok(gate > 0 && gate < d.indexOf('// 6) MOTOR'), 'render adımından önce');
});
