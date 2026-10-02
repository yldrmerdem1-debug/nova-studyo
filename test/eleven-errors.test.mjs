import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-eleven-errors-'));

const { elevenErrorFromResponse, elevenSynth } = await import('../src/pipeline/voice.js');

function failedResponse(httpStatus, code, providerMessage = 'provider detail') {
  const raw = JSON.stringify({ detail: { status: code, message: providerMessage } });
  return { ok: false, status: httpStatus, text: async () => raw };
}

const cases = [
  ['payment_issue', 401, /ödeme|fatura/i],
  ['invalid_api_key', 401, /API anahtarı geçersiz/i],
  ['missing_permissions', 403, /izin/i],
  ['authorization_error', 403, /yetkilendirilemedi|izin/i],
  ['quota_exceeded', 429, /kota/i],
  ['voice_not_found', 404, /ses.*bulunamadı/i],
  ['max_character_limit_exceeded', 400, /karakter sınır/i],
];

for (const [code, httpStatus, messagePattern] of cases) {
  test(`maps ${code} to a sanitized structured Turkish error`, async () => {
    const secret = `raw-${code}-secret-invoice-987`;
    const error = await elevenErrorFromResponse(failedResponse(httpStatus, code, secret));
    assert.equal(error.name, 'ElevenLabsError');
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, httpStatus);
    assert.equal(error.provider, 'elevenlabs');
    assert.match(error.message, messagePattern);
    assert.doesNotMatch(error.message, new RegExp(secret));
    if (code === 'payment_issue') assert.doesNotMatch(error.message, /anahtar.*geçersiz/i);
  });
}

test('preserves a safe unknown provider status without exposing the raw response body', async () => {
  const error = await elevenErrorFromResponse(failedResponse(418, 'future_provider_status', 'token=super-secret-value'));
  assert.equal(error.code, 'future_provider_status');
  assert.equal(error.httpStatus, 418);
  assert.match(error.message, /HTTP 418/i);
  assert.doesNotMatch(error.message, /super-secret|token=/i);
});

test('uses unknown when an untrusted provider status is not a safe code', async () => {
  const error = await elevenErrorFromResponse(failedResponse(500, 'secret key: abc/123', 'do not expose'));
  assert.equal(error.code, 'unknown');
  assert.doesNotMatch(error.message, /abc|do not expose/i);
});

test('payment and permission failures do not retry the paid synthesis request at 128 kbps', async () => {
  for (const [httpStatus, code] of [[401, 'payment_issue'], [403, 'missing_permissions'], [403, 'authorization_error']]) {
    const calls = [];
    const original = globalThis.fetch;
    globalThis.fetch = async url => { calls.push(String(url)); return failedResponse(httpStatus, code, 'private account detail'); };
    try {
      await assert.rejects(
        elevenSynth('Offline test', 'voice-id', fs.mkdtempSync(path.join(process.env.NOVA_HOME, 'tts-')), { settings: { elevenKey: 'placeholder' } }),
        error => error.code === code,
      );
      assert.equal(calls.length, 1);
      assert.match(calls[0], /mp3_44100_192/);
    } finally {
      globalThis.fetch = original;
    }
  }
});

test('retries once at 128 kbps only for an explicit 192 kbps subscription denial', async () => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async url => {
    calls.push(String(url));
    if (calls.length === 1) return failedResponse(403, 'subscription_required', 'The mp3_44100_192 output format requires a higher subscription.');
    return { ok: true, status: 200, json: async () => ({ audio_base64: Buffer.from('offline-audio').toString('base64') }) };
  };
  const dir = fs.mkdtempSync(path.join(process.env.NOVA_HOME, 'tts-'));
  try {
    const result = await elevenSynth('Offline test', 'voice-id', dir, { settings: { elevenKey: 'placeholder' } });
    assert.equal(calls.length, 2);
    assert.match(calls[0], /mp3_44100_192/);
    assert.match(calls[1], /mp3_44100_128/);
    assert.equal(fs.readFileSync(result.audioFilePath, 'utf8'), 'offline-audio');
  } finally {
    globalThis.fetch = original;
  }
});
