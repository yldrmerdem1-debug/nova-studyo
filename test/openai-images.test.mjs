import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-openai-images-'));
const { createOpenAIImagesProvider } = await import('../src/pipeline/openai-images.js');
const { imageProvider, videoProvider, providerReady } = await import('../src/pipeline/collage.js');
const { DEFAULT_SETTINGS, publicSettings, saveSettings, snapshotSettings } = await import('../src/config.js');
const { settingsPatch } = await import('../src/settings-input.js');

const response = (body, { ok = true, status = 200 } = {}) => ({
  ok, status, json: async () => body,
});

test('OpenAI text generation sends the documented request and returns a JPEG data URL', async () => {
  const calls = [];
  const provider = createOpenAIImagesProvider(async (url, init) => {
    calls.push({ url, init });
    return response({ data: [{ b64_json: Buffer.from('jpeg fixture').toString('base64') }] });
  });
  const result = await provider.textToImage('Odysseus at sea', {
    openaiKey: 'private-test-key', openaiImageModel: 'gpt-image-2', kanvasW: 1920, kanvasH: 1080,
  });
  assert.match(result, /^data:image\/jpeg;base64,/);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer private-test-key');
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    model: 'gpt-image-2', prompt: 'Odysseus at sea', quality: 'high', output_format: 'jpeg', size: '1536x864', n: 1,
  });
});

test('OpenAI image edit sends the reference as multipart image input', async () => {
  let request;
  const provider = createOpenAIImagesProvider(async (url, init) => {
    request = { url, init };
    return response({ data: [{ b64_json: Buffer.from('edited').toString('base64') }] });
  });
  const anchor = `data:image/jpeg;base64,${Buffer.from('anchor').toString('base64')}`;
  await provider.imageToImage('Keep the style', anchor, { openaiKey: 'key', openaiImageModel: 'gpt-image-2', kanvasW: 1080, kanvasH: 1920 });
  assert.equal(request.url, 'https://api.openai.com/v1/images/edits');
  assert.equal(request.init.headers.Authorization, 'Bearer key');
  assert.equal(request.init.headers['Content-Type'], undefined);
  assert.equal(request.init.body.get('model'), 'gpt-image-2');
  assert.equal(request.init.body.get('size'), '864x1536');
  assert.equal(request.init.body.getAll('image[]').length, 1);
});

test('OpenAI requests honor an already-aborted cancellation signal', async () => {
  let calls = 0;
  const provider = createOpenAIImagesProvider(async () => { calls++; return response({}); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(provider.textToImage('cancel me', { openaiKey: 'key', __signal: controller.signal }), /cancel/i);
  assert.equal(calls, 0);
});

test('OpenAI failures do not expose response bodies', async () => {
  const provider = createOpenAIImagesProvider(async () => response({ error: { message: 'echoed private-test-key' } }, { ok: false, status: 401 }));
  await assert.rejects(provider.textToImage('prompt', { openaiKey: 'private-test-key' }), error => {
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, /private-test-key/);
    return true;
  });
});

test('OpenAI is image-only while animation keeps an explicit video provider', () => {
  const settings = { imageProvider: 'openai', openaiKey: 'image-key', videoProvider: 'kie', kieKey: 'video-key' };
  assert.equal(imageProvider(settings).name, 'OpenAI');
  assert.equal(videoProvider(settings).name, 'Kie AI');
  assert.equal(providerReady(settings), true);
  assert.equal(providerReady({ ...settings, kieKey: '' }), false);
  assert.equal(providerReady({ ...settings, kieKey: '' }, { animate: false }), true);
});

test('OpenAI settings are validated and credentials stay out of public data and snapshots', () => {
  assert.equal(DEFAULT_SETTINGS.openaiImageModel, 'gpt-image-2');
  assert.deepEqual(settingsPatch({ imageProvider: 'openai', openaiKey: ' key ', openaiImageModel: 'gpt-image-2' }), {
    imageProvider: 'openai', openaiKey: 'key', openaiImageModel: 'gpt-image-2',
  });
  saveSettings({ openaiKey: 'private-test-key' });
  const pub = publicSettings();
  assert.equal(pub.hasOpenaiKey, true);
  assert.equal(pub.openaiKey, undefined);
  assert.equal(snapshotSettings().openaiKey, undefined);
});
