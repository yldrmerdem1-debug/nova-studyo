import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-audience-'));

const { createJob, jobDir, updateJob } = await import('../src/store.js');
const { beginJobEdit } = await import('../src/job-locks.js');
const { readJson, writeJson } = await import('../src/util.js');
const {
  AUDIENCE_IMPORT_LIMITS,
  importAudience,
  audienceReport,
} = await import('../src/audience.js');

const makeJob = (id, status = 'done') => createJob({
  id,
  status,
  topic: 'Audience fixture',
  createdAt: '2026-09-01T00:00:00.000Z',
  outputs: {},
});

test('imports a BOM/quoted English Studio summary and preserves manual publication feedback', () => {
  const id = '20260907-a10001';
  makeJob(id);
  const manual = { source: 'manual', recordedAt: '2026-09-01T08:00:00.000Z', ctr: 3.2, notes: 'Keep me' };
  writeJson(path.join(jobDir(id), 'publication.json'), manual);
  const csv = '\uFEFFContent,Video title,Views,Impressions,Impressions click-through rate (%),Average percentage viewed (%)\r\nabc123,"A title, with comma","1,234","20,000",4.5,62.4\r\n';

  const result = importAudience(id, { csv, filename: 'Table data.csv', period: { start: '2026-08-01', end: '2026-08-31' } });

  assert.equal(result.import.source, 'youtube-studio-csv');
  assert.equal(result.import.videoId, 'abc123');
  assert.deepEqual(result.import.metrics, { views: 1234, impressions: 20000, ctr: 4.5, averageViewed: 62.4 });
  assert.ok(fs.readFileSync(path.join(jobDir(id), result.import.storedFile), 'utf8').includes('A title, with comma'));
  assert.deepEqual(readJson(path.join(jobDir(id), 'publication.json')), manual);
  assert.equal(result.report.manual.notes, 'Keep me');
  assert.deepEqual(result.report.history.map(item => item.source), ['manual', 'youtube-studio-csv']);
});

test('parses Turkish semicolon retention and computes 30 seconds only from duration plus elapsed axis', () => {
  const id = '20260907-a10002';
  makeJob(id);
  const csv = [
    'İçerik;Geçen video süresi (%);İzleyiciyi elde tutma (%);Göreli elde tutma performansı',
    'vid-tr;0;100;0,50',
    'vid-tr;25;76;0,45',
    'vid-tr;50;55;0,40',
    'vid-tr;75;120;0,65',
    'vid-tr;100;20;0,30',
  ].join('\r\n');

  const withoutDuration = importAudience(id, { csv, filename: 'kitle.csv', period: '1–31 Ağustos 2026' });
  assert.equal(withoutDuration.import.retention.retention30, null);
  assert.ok(withoutDuration.import.unavailable.includes('retention30'));

  const withDuration = importAudience(id, { csv, filename: 'kitle.csv', durationSec: 60, period: '1–31 Ağustos 2026' });
  assert.equal(withDuration.import.retention.retention30.seconds, 30);
  assert.equal(withDuration.import.retention.retention30.audienceWatchRatio, 0.55);
  assert.equal(withDuration.import.retention.retention30.percentage, 55);
  assert.equal(withDuration.import.retention.points[3].audienceWatchRatio, 1.2);
  assert.ok(withDuration.import.caveats.some(text => /yeniden|tekrar/i.test(text)));
});

test('keeps official audienceWatchRatio values above one as replay behavior', () => {
  const id = '20260907-a10003';
  makeJob(id);
  const csv = 'video,elapsedVideoTimeRatio,audienceWatchRatio,relativeRetentionPerformance\nxyz789,0,1,0.5\nxyz789,0.5,1.2,0.8\nxyz789,1,0.4,0.2';
  const { import: record } = importAudience(id, { csv, filename: 'retention.csv', durationSec: 60 });
  assert.equal(record.retention.points[1].audienceWatchRatio, 1.2);
  assert.equal(record.retention.retention30.percentage, 120);
});

test('does not synthesize a 30-second value from neighboring retention buckets', () => {
  const id = '20260907-a10009';
  makeJob(id);
  const csv = 'video,elapsedVideoTimeRatio,audienceWatchRatio\nno-estimate,0.4,0.8\nno-estimate,0.6,0.5';
  const { import: record } = importAudience(id, { csv, filename: 'buckets.csv', durationSec: 60 });
  assert.equal(record.retention.retention30, null);
  assert.ok(record.unavailable.includes('retention30'));
});

test('rejects multi-video exports until a listed video is explicitly selected', () => {
  const id = '20260907-a10004';
  makeJob(id);
  const csv = 'Content,Views,Impressions\nvideo-a,100,1000\nvideo-b,900,9000';
  assert.throws(
    () => importAudience(id, { csv, filename: 'many.csv' }),
    error => error.statusCode === 400 && /video-a/.test(error.message) && /video-b/.test(error.message),
  );
  const chosen = importAudience(id, { csv, filename: 'many.csv', videoId: 'video-b' });
  assert.equal(chosen.import.videoId, 'video-b');
  assert.equal(chosen.import.metrics.views, 900);
  assert.equal(chosen.import.metrics.impressions, 9000);
  assert.throws(() => importAudience(id, { csv, filename: 'many.csv', videoId: 'missing' }), /bulunamadı/i);
});

test('rejects malformed content, invalid numbers, oversized files and too many rows', () => {
  const id = '20260907-a10005';
  makeJob(id);
  assert.throws(() => importAudience(id, { csv: 'Views\nnot-a-number', filename: 'bad.csv' }), /sayısal/i);
  assert.throws(() => importAudience(id, { csv: 'Views\n"12', filename: 'bad.csv' }), /tırnak/i);
  assert.throws(() => importAudience(id, { csv: 'Unknown\nvalue', filename: 'bad.csv' }), /desteklenen/i);
  assert.throws(() => importAudience(id, { csv: 'Views\n1', filename: 'bad.txt' }), /CSV/i);
  assert.throws(
    () => importAudience(id, { csv: Buffer.alloc(AUDIENCE_IMPORT_LIMITS.maxBytes + 1, 65), filename: 'large.csv' }),
    /büyük/i,
  );
  const tooMany = `Views\n${Array.from({ length: AUDIENCE_IMPORT_LIMITS.maxRows + 1 }, () => '1').join('\n')}`;
  assert.throws(() => importAudience(id, { csv: tooMany, filename: 'rows.csv' }), /satır/i);
});

test('accepts a negative net subscriber change but rejects fractional count metrics', () => {
  const id = '20260907-a10008';
  makeJob(id);
  const accepted = importAudience(id, { csv: 'Content,Views,Subscribers\nnet-change,100,-2', filename: 'net.csv' });
  assert.equal(accepted.import.metrics.subscribers, -2);
  assert.throws(() => importAudience(id, { csv: 'Content,Views\nnet-change,1.5', filename: 'fraction.csv' }), /tam sayı/i);
});

test('accepts common Studio percentage headings even when the literal percent suffix is omitted', () => {
  const id = '20260907-a10010';
  makeJob(id);
  const csv = 'İçerik;Gösterim tıklama oranı;Ortalama görüntüleme yüzdesi\nplain-headings;4,7;61,5';
  const result = importAudience(id, { csv, filename: 'basliklar.csv' });
  assert.equal(result.import.metrics.ctr, 4.7);
  assert.equal(result.import.metrics.averageViewed, 61.5);
});

test('imports share production/editor locks and never read provider settings', () => {
  const id = '20260907-a10006';
  makeJob(id, 'running');
  assert.throws(() => importAudience(id, { csv: 'Views\n1', filename: 'one.csv' }), error => error.statusCode === 409);
  updateJob(id, { status: 'done' });
  const release = beginJobEdit(id);
  try {
    assert.throws(() => importAudience(id, { csv: 'Views\n1', filename: 'one.csv' }), error => error.statusCode === 409);
  } finally {
    release();
  }
});

test('reports dated observed trends with unavailable fields and no invented winner or view estimate', () => {
  const id = '20260907-a10007';
  makeJob(id);
  importAudience(id, { csv: 'Content,Impressions click-through rate (%)\ntrend-id,3.5', filename: 'old.csv', period: '2026-07-01/2026-07-31' });
  importAudience(id, { csv: 'Content,Impressions click-through rate (%)\ntrend-id,4.2', filename: 'new.csv', period: '2026-08-01/2026-08-31' });

  const report = audienceReport(id);
  assert.equal(report.imports.length, 2);
  assert.equal(report.metrics.ctr, 4.2);
  assert.ok(report.unavailable.includes('views'));
  assert.ok(report.unavailable.includes('retention30'));
  assert.ok(report.suggestions.some(text => text.includes('2026-07-01/2026-07-31') && text.includes('2026-08-01/2026-08-31')));
  const prose = JSON.stringify(report).toLowerCase();
  assert.doesNotMatch(prose, /a\/b kazananı|tahmini izlenme|estimated views|winner/);
  assert.ok(report.caveats.some(text => /nedensel/i.test(text)));
});

test('missing jobs are rejected without creating storage', () => {
  assert.throws(() => audienceReport('20260907-ffffff'), error => error.statusCode === 404);
  assert.throws(() => importAudience('20260907-ffffff', { csv: 'Views\n1', filename: 'one.csv' }), error => error.statusCode === 404);
});
