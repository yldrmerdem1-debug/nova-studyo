// Kling (direct API) image-to-video: request shape, per-model length, opening vs. cheap plan, errors.
import test from 'node:test';
import assert from 'node:assert/strict';

const K = await import('../docu-engine/lib/kling.mjs');
const V = await import('../src/pipeline/kling-video.js');

test('kling: 3.0 asks whole seconds 3-15, silent, single shot, no watermark; bans go into the prompt', () => {
  const b = K.klingBody({ image: 'data:image/jpeg;base64,QUJD', prompt: 'Fog drifts.', negative: 'text, morphing', duration: 3.4, resolution: '1080p', externalId: 'x1' });
  assert.deepEqual(b.settings, { resolution: '1080p', duration: 4, audio: 'off', multi_shot: false });
  assert.equal(b.contents[0].text, 'Fog drifts. Avoid: text, morphing.');
  assert.deepEqual(b.contents[1], { type: 'first_frame', url: 'QUJD' });
  assert.deepEqual(b.options, { external_task_id: 'x1', watermark_info: { enabled: false } });
  assert.equal(K.klingDuration(1), 3);
  assert.equal(K.klingDuration(40), 15);
});

test('kling: 2.5 Turbo only takes 5 or 10 s and no audio fields; units per second per model', () => {
  const b = K.klingBody({ image: 'QUJD', prompt: 'p', duration: 6.2, resolution: '720p', model: 'kling-2.5-turbo' });
  assert.deepEqual(b.settings, { resolution: '720p', duration: 10 });
  assert.equal(K.klingDuration(4, 'kling-2.5-turbo'), 5);
  assert.equal(K.klingUnitsPerSecond('1080p'), 0.8);
  assert.equal(K.klingUnitsPerSecond('720p', 'kling-2.5-turbo'), 0.3);
});

test('kling: the opening gets Kling 3.0 1080p, the rest the cheap 2.5 Turbo 720p', () => {
  assert.deepEqual(V.klingPlan({ opening: true }), { model: 'kling-3.0', resolution: '1080p' });
  assert.deepEqual(V.klingPlan({ opening: false }), { model: 'kling-2.5-turbo', resolution: '720p' });
  assert.deepEqual(V.klingPlan({ opening: true, settings: { klingOpeningResolution: '720p' } }), { model: 'kling-3.0', resolution: '720p' });
});

const json = (status, body) => ({ ok: status < 300, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });

test('kling: create → poll → download; the output bytes come back', async () => {
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push([url, init.method || 'GET']);
    if (url.endsWith('/image-to-video/kling-3.0')) return json(200, { code: 0, data: { id: 't1', status: 'submitted' } });
    if (url.includes('/tasks?')) return json(200, { code: 0, data: [{ id: 't1', external_id: new URL(url).searchParams.get('external_task_ids'), status: 'succeeded', outputs: [{ type: 'video', url: 'https://cdn/x.mp4' }] }] });
    if (url === 'https://cdn/x.mp4') return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('MP4DATA').buffer };
    throw Error('unexpected ' + url);
  };
  const buf = await K.klingImageToVideo({ key: 'k', image: 'QUJD', prompt: 'p', fetchFn, pollMs: 1 });
  assert.equal(buf.toString(), 'MP4DATA');
  assert.equal(calls[0][1], 'POST');
  assert.equal(calls.at(-1)[0], 'https://cdn/x.mp4');
});

test('kling: a used-up pack is quota (stop asking), a policy refusal is moderation', async () => {
  await assert.rejects(K.klingImageToVideo({ key: 'k', image: 'QUJD', prompt: 'p', fetchFn: async () => json(429, { code: 1102, message: 'resource pack exhausted' }) }), (e) => e.quota === true);
  await assert.rejects(K.klingImageToVideo({ key: 'k', image: 'QUJD', prompt: 'p', fetchFn: async () => json(400, { code: 1301, message: 'risk' }) }), (e) => e.moderation === true);
  await assert.rejects(K.klingImageToVideo({ key: 'k', image: 'QUJD', prompt: 'p', fetchFn: async () => json(401, { code: 1002 }) }), (e) => e.auth === true);
});

test('kling: a task already paid for (same cache key) is found and downloaded, never created again', async () => {
  const posts = [];
  const fetchFn = async (url, init = {}) => {
    if (init.method === 'POST') { posts.push(url); throw Error('must not create'); }
    if (url.includes('/tasks?')) return json(200, { code: 0, data: [{ id: 't9', external_id: 'nova-abc', status: 'succeeded', outputs: [{ type: 'video', url: 'https://cdn/y.mp4' }] }] });
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('OLD').buffer };
  };
  const buf = await K.klingImageToVideo({ key: 'k', image: 'QUJD', prompt: 'p', taskId: 'nova-abc', fetchFn, pollMs: 1, retryWaitMs: 1 });
  assert.equal(buf.toString(), 'OLD');
  assert.equal(posts.length, 0);
});

test('kling: a dropped connection while polling or creating is retried, not a lost (paid) clip', async () => {
  let polls = 0;
  let created = false;
  const fetchFn = async (url, init = {}) => {
    if (init.method === 'POST') { created = true; throw Object.assign(Error('fetch failed'), { cause: { code: 'ECONNRESET' } }); }
    if (url.includes('/tasks?')) {
      if (!created) return json(200, { code: 0, data: [] });
      polls++;
      if (polls === 2) throw Error('fetch failed');
      return json(200, { code: 0, data: [{ id: 't2', external_id: 'nova-x', status: polls < 4 ? 'processing' : 'succeeded', outputs: [{ type: 'video', url: 'https://cdn/z.mp4' }] }] });
    }
    return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('OK').buffer };
  };
  const buf = await K.klingImageToVideo({ key: 'k', image: 'QUJD', prompt: 'p', taskId: 'nova-x', fetchFn, pollMs: 1, retryWaitMs: 1 });
  assert.equal(buf.toString(), 'OK');
});
