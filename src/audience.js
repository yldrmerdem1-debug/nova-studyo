import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { beginJobEdit, isJobEditing } from './job-locks.js';
import { getJob, jobDir } from './store.js';
import { readJson, writeJson } from './util.js';

export const AUDIENCE_IMPORT_LIMITS = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxRows: 20_000,
  maxColumns: 100,
});

const ACTIVE_STATUSES = new Set(['running', 'queued', 'awaiting_picks', 'awaiting_cost']);
const SUMMARY_FIELDS = ['views', 'impressions', 'ctr', 'averageViewed', 'averageViewDurationSec', 'watchTimeHours', 'subscribers'];
const ALL_FIELDS = [...SUMMARY_FIELDS, 'retention30', 'audienceRetentionCurve'];

const aliases = {
  videoId: ['video', 'video id', 'video_id', 'content', 'icerik', 'video kimligi'],
  date: ['date', 'day', 'tarih', 'gun'],
  duration: ['duration', 'video duration', 'sure', 'video suresi'],
  views: ['views', 'view count', 'goruntulemeler', 'goruntuleme sayisi'],
  impressions: ['impressions', 'impression count', 'gosterimler', 'gosterim sayisi'],
  ctr: ['ctr', 'impressions click through rate', 'impressions click through rate percent', 'impression click through rate percent', 'gosterim tiklama orani', 'gosterim tiklama orani percent', 'tiklama orani percent'],
  averageViewed: ['average percentage viewed', 'average percentage viewed percent', 'average view percentage', 'average viewed percent', 'ortalama goruntuleme yuzdesi', 'ortalama goruntuleme yuzdesi percent', 'ortalama izlenme yuzdesi percent', 'ortalama goruntuleme orani percent'],
  averageViewDurationSec: ['average view duration', 'average_view_duration_seconds', 'ortalama goruntuleme suresi', 'ortalama izlenme suresi'],
  watchTimeHours: ['watch time hours', 'watch time hour', 'izlenme suresi saat', 'izleme suresi saat'],
  subscribers: ['subscribers', 'subscribers gained', 'aboneler', 'kazanilan aboneler'],
  elapsedRatio: ['elapsed video time ratio', 'elapsedvideotimeratio'],
  elapsedPercent: ['elapsed video time percentage', 'elapsed_video_time_percentage', 'elapsed video time percent', 'video time percent', 'gecen video suresi percent', 'video zamani percent', 'video konumu percent'],
  elapsedTime: ['elapsed video time', 'video time', 'gecen video suresi', 'gecen sure'],
  audienceRatio: ['audience watch ratio', 'audiencewatchratio'],
  audiencePercent: ['audience retention percentage', 'audience_retention_percentage', 'audience retention percent', 'absolute retention percent', 'absolute audience retention percent', 'izleyiciyi elde tutma percent', 'kitleyi elde tutma orani percent', 'mutlak elde tutma percent', 'mutlak kitle tutma percent'],
  relativeRetention: ['relative retention performance', 'relativeretentionperformance', 'relative retention percent', 'goreli elde tutma performansi', 'goreli elde tutma percent', 'diger videolara kiyasla percent'],
};

function normalizedHeader(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replaceAll('ı', 'i').replaceAll('_', ' ').replaceAll('%', ' percent ')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

const aliasLookup = new Map(Object.entries(aliases).flatMap(([key, values]) => values.map(value => [normalizedHeader(value), key])));

function identifyHeader(value) {
  const normalized = normalizedHeader(value);
  const exact = aliasLookup.get(normalized);
  if (exact) return exact;
  if (/^(content|icerik)$/.test(normalized) || (/\bvideo\b/.test(normalized) && /\b(id|kimligi)\b/.test(normalized))) return 'videoId';
  if (/(elapsed|gecen|video zamani)/.test(normalized) && /(ratio|orani)/.test(normalized)) return 'elapsedRatio';
  if (/(elapsed|gecen|video time|video zamani)/.test(normalized) && /percent|yuzde/.test(normalized)) return 'elapsedPercent';
  if (/(audience|izleyici|kitle)/.test(normalized) && /(retention|elde tutma)/.test(normalized) && /percent|yuzde/.test(normalized)) return 'audiencePercent';
  return null;
}

function audienceError(message, statusCode = 400, details) {
  const error = Object.assign(new Error(message), { statusCode });
  if (details) Object.assign(error, details);
  return error;
}

function requireJob(id, { writable = false } = {}) {
  const job = getJob(id);
  if (!job) throw audienceError('Video bulunamadı.', 404);
  if (writable && (isJobEditing(id) || ACTIVE_STATUSES.has(job.status))) {
    throw audienceError('Üretim veya başka bir düzenleme sürerken izleyici verisi içe aktarılamaz.', 409);
  }
  return job;
}

function inputBytes(csv) {
  if (Buffer.isBuffer(csv) || csv instanceof Uint8Array) {
    const bytes = Buffer.from(csv);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw audienceError('CSV UTF-8 olarak okunamadı.'); }
    return { bytes, text };
  }
  if (typeof csv !== 'string') throw audienceError('CSV içeriği metin veya UTF-8 baytları olmalı.');
  return { bytes: Buffer.from(csv, 'utf8'), text: csv };
}

function delimiterFor(text) {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && (char === '\n' || char === '\r')) break;
    else if (!quoted && char === ',') commas++;
    else if (!quoted && char === ';') semicolons++;
  }
  if (!commas && !semicolons) return ',';
  return semicolons > commas ? ';' : ',';
}

function parseCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  if (!text.trim()) throw audienceError('CSV boş.');
  if (text.includes('\0')) throw audienceError('CSV geçersiz ikili veri içeriyor.');
  const delimiter = delimiterFor(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let justClosed = false;
  const finishRow = () => {
    row.push(field);
    if (row.some(value => value.trim() !== '')) rows.push(row);
    row = [];
    field = '';
    justClosed = false;
  };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; justClosed = true; }
      else field += char;
      continue;
    }
    if (char === '"') {
      if (field !== '') throw audienceError('CSV tırnak yapısı geçersiz.');
      quoted = true;
    } else if (char === delimiter) {
      row.push(field); field = ''; justClosed = false;
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      finishRow();
    } else if (justClosed && /\s/.test(char)) {
      // Excel sometimes inserts harmless whitespace after a quoted value.
    } else if (justClosed) {
      throw audienceError('CSV tırnak yapısı geçersiz.');
    } else field += char;
  }
  if (quoted) throw audienceError('CSV içinde kapanmamış tırnak var.');
  if (field !== '' || row.length) finishRow();
  if (rows.length < 2) throw audienceError('CSV başlık ve en az bir veri satırı içermeli.');
  if (rows.length - 1 > AUDIENCE_IMPORT_LIMITS.maxRows) throw audienceError(`CSV en fazla ${AUDIENCE_IMPORT_LIMITS.maxRows} veri satırı içerebilir.`);
  if (rows[0].length > AUDIENCE_IMPORT_LIMITS.maxColumns) throw audienceError(`CSV en fazla ${AUDIENCE_IMPORT_LIMITS.maxColumns} sütun içerebilir.`);
  for (let index = 1; index < rows.length; index++) {
    if (rows[index].length !== rows[0].length) throw audienceError(`CSV ${index + 1}. satırında ${rows[0].length} sütun bekleniyordu; ${rows[index].length} bulundu.`);
  }
  return rows;
}

function numeric(raw, { field, row, count = false, allowNegative = false, integer = false } = {}) {
  let value = String(raw ?? '').trim().replace(/[\u00a0\u202f\s%]/g, '');
  if (!value) return null;
  if (value.includes(',') && value.includes('.')) {
    if (value.lastIndexOf(',') > value.lastIndexOf('.')) value = value.replaceAll('.', '').replace(',', '.');
    else value = value.replaceAll(',', '');
  } else if (value.includes(',')) {
    value = count && /^[-+]?\d{1,3}(,\d{3})+$/.test(value) ? value.replaceAll(',', '') : value.replace(',', '.');
  } else if (count && /^[-+]?\d{1,3}(\.\d{3})+$/.test(value)) value = value.replaceAll('.', '');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) {
    throw audienceError(`${row}. satırdaki ${field} değeri sayısal değil: ${String(raw).slice(0, 80)}`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || (!allowNegative && number < 0)) throw audienceError(`${row}. satırdaki ${field} değeri geçersiz.`);
  if (integer && !Number.isInteger(number)) throw audienceError(`${row}. satırdaki ${field} değeri tam sayı olmalı.`);
  return number;
}

function seconds(raw, context) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d+(?::\d{1,2}){1,2}(?:[.,]\d+)?$/.test(value)) {
    const parts = value.replace(',', '.').split(':').map(Number);
    if (parts.slice(1).some(part => part >= 60)) throw audienceError(`${context.row}. satırdaki ${context.field} süresi geçersiz.`);
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  return numeric(value, context);
}

function columnsFor(headers) {
  const columns = {};
  headers.forEach((header, index) => {
    const key = identifyHeader(header);
    if (!key) return;
    if (columns[key]) throw audienceError(`CSV aynı ölçüm sütununu birden fazla içeriyor: ${header}`);
    columns[key] = { index, header: String(header) };
  });
  const hasSummary = SUMMARY_FIELDS.some(key => columns[key]);
  const hasRetention = (columns.elapsedRatio || columns.elapsedPercent || columns.elapsedTime) && (columns.audienceRatio || columns.audiencePercent);
  if (!hasSummary && !hasRetention) throw audienceError('CSV desteklenen YouTube Studio özet veya izleyici tutma sütunlarını içermiyor.');
  return { columns, hasSummary, hasRetention };
}

function cell(row, column) { return column ? row[column.index] : ''; }
function cleanVideoId(value) { return String(value ?? '').trim(); }
function isTotal(value) { return /^(total|toplam|genel toplam)$/i.test(cleanVideoId(value)); }

function chooseRows(rows, columns, requestedVideoId) {
  const dataRows = rows.slice(1).map((values, index) => ({ values, csvRow: index + 2 }));
  const videoColumn = columns.videoId;
  const ids = videoColumn
    ? [...new Set(dataRows.map(row => cleanVideoId(cell(row.values, videoColumn))).filter(value => value && !isTotal(value)))]
    : [];
  const requested = requestedVideoId == null ? '' : cleanVideoId(requestedVideoId);
  if (requestedVideoId != null && (!requested || requested.length > 128 || /[\u0000-\u001f]/.test(requested))) throw audienceError('Video kimliği geçersiz.');
  if (!requested && ids.length > 1) {
    throw audienceError(`CSV birden fazla video içeriyor. Şunlardan birini videoId ile seçin: ${ids.slice(0, 20).join(', ')}`, 400, { availableVideoIds: ids });
  }
  if (requested && ids.length && !ids.includes(requested)) {
    throw audienceError(`Seçilen video CSV içinde bulunamadı: ${requested}. Kullanılabilir kimlikler: ${ids.slice(0, 20).join(', ')}`, 400, { availableVideoIds: ids });
  }
  const selectedId = requested || (ids.length === 1 ? ids[0] : null);
  let selected = dataRows;
  if (videoColumn && selectedId) selected = dataRows.filter(row => cleanVideoId(cell(row.values, videoColumn)) === selectedId);
  else if (videoColumn && ids.length) selected = dataRows.filter(row => !isTotal(cell(row.values, videoColumn)));
  else if (videoColumn) {
    const totals = dataRows.filter(row => isTotal(cell(row.values, videoColumn)));
    if (totals.length) selected = totals;
  }
  if (!selected.length) throw audienceError('Seçilen video için CSV veri satırı bulunamadı.');
  return { selected, selectedId, availableVideoIds: ids };
}

function parseDurationOption(durationSec) {
  if (durationSec == null || durationSec === '') return null;
  const value = Number(durationSec);
  if (!Number.isFinite(value) || value <= 0 || value > 7 * 24 * 3600) throw audienceError('Video süresi pozitif ve geçerli bir saniye değeri olmalı.');
  return value;
}

function uniqueMetric(rows, column, parser, caveats, key) {
  if (!column) return undefined;
  const values = rows.map(row => parser(cell(row.values, column), { field: column.header, row: row.csvRow })).filter(value => value != null);
  if (!values.length) return undefined;
  const unique = [...new Set(values)];
  if (unique.length === 1) return unique[0];
  caveats.push(`${column.header} birden fazla farklı satır değeri içeriyor; ${key} sessizce toplanmadı veya ortalanmadı.`);
  return undefined;
}

function summaryMetrics(selected, columns, caveats) {
  const metrics = {};
  const count = (raw, context) => numeric(raw, { ...context, count: true, integer: true });
  const subscriberCount = (raw, context) => numeric(raw, { ...context, count: true, integer: true, allowNegative: true });
  const regular = (raw, context) => numeric(raw, context);
  for (const key of ['views', 'impressions']) {
    const value = uniqueMetric(selected, columns[key], count, caveats, key);
    if (value !== undefined) metrics[key] = value;
  }
  const subscribers = uniqueMetric(selected, columns.subscribers, subscriberCount, caveats, 'subscribers');
  if (subscribers !== undefined) metrics.subscribers = subscribers;
  for (const key of ['ctr', 'averageViewed']) {
    const value = uniqueMetric(selected, columns[key], regular, caveats, key);
    if (value !== undefined) {
      if (value > 100) throw audienceError(`${columns[key].header} yüzde değeri 0–100 aralığında olmalı.`);
      metrics[key] = value;
    }
  }
  const averageDuration = uniqueMetric(selected, columns.averageViewDurationSec, seconds, caveats, 'averageViewDurationSec');
  if (averageDuration !== undefined) metrics.averageViewDurationSec = averageDuration;
  const watchTime = uniqueMetric(selected, columns.watchTimeHours, regular, caveats, 'watchTimeHours');
  if (watchTime !== undefined) metrics.watchTimeHours = watchTime;
  return metrics;
}

function csvDuration(selected, column, caveats) {
  const value = uniqueMetric(selected, column, seconds, caveats, 'durationSec');
  if (value === undefined) return null;
  if (value <= 0 || value > 7 * 24 * 3600) throw audienceError('CSV video süresi pozitif ve geçerli olmalı.');
  return value;
}

function retentionData(selected, columns, durationSec, caveats) {
  const retention = { durationSec, points: [], retention30: null };
  const axisColumn = columns.elapsedRatio || columns.elapsedPercent || columns.elapsedTime;
  const audienceColumn = columns.audienceRatio || columns.audiencePercent;
  if (!axisColumn || !audienceColumn) return retention;
  for (const row of selected) {
    const rawAxis = cell(row.values, axisColumn);
    const rawAudience = cell(row.values, audienceColumn);
    if (!String(rawAxis).trim() && !String(rawAudience).trim()) continue;
    if (!String(rawAxis).trim() || !String(rawAudience).trim()) throw audienceError(`${row.csvRow}. satırda zaman ekseni ve izleyici tutma birlikte bulunmalı.`);
    let elapsedRatio = null;
    let elapsedSec = null;
    if (columns.elapsedRatio) elapsedRatio = numeric(rawAxis, { field: axisColumn.header, row: row.csvRow });
    else if (columns.elapsedPercent) elapsedRatio = numeric(rawAxis, { field: axisColumn.header, row: row.csvRow }) / 100;
    else elapsedSec = seconds(rawAxis, { field: axisColumn.header, row: row.csvRow });
    if (elapsedRatio != null && elapsedRatio > 1) throw audienceError(`${row.csvRow}. satırdaki video zaman oranı 0–1 (veya yüzde sütununda 0–100) aralığında olmalı.`);
    if (elapsedRatio != null && durationSec != null) elapsedSec = elapsedRatio * durationSec;
    if (elapsedSec != null && durationSec != null && elapsedSec > durationSec + 0.01) throw audienceError(`${row.csvRow}. satırdaki geçen süre video süresini aşıyor.`);
    let audienceWatchRatio = numeric(rawAudience, { field: audienceColumn.header, row: row.csvRow });
    if (columns.audiencePercent) audienceWatchRatio /= 100;
    const point = { elapsedRatio, elapsedSec, audienceWatchRatio };
    if (columns.relativeRetention) {
      let relative = numeric(cell(row.values, columns.relativeRetention), { field: columns.relativeRetention.header, row: row.csvRow });
      if (relative != null && /percent|yuzde/.test(normalizedHeader(columns.relativeRetention.header))) relative /= 100;
      if (relative != null && relative > 1) throw audienceError(`${row.csvRow}. satırdaki göreli elde tutma değeri 0–1 aralığında olmalı.`);
      point.relativeRetentionPerformance = relative;
    }
    retention.points.push(point);
  }
  retention.points.sort((a, b) => (a.elapsedSec ?? a.elapsedRatio) - (b.elapsedSec ?? b.elapsedRatio));
  for (let index = 1; index < retention.points.length; index++) {
    const previous = retention.points[index - 1];
    const current = retention.points[index];
    const previousAxis = previous.elapsedSec ?? previous.elapsedRatio;
    const currentAxis = current.elapsedSec ?? current.elapsedRatio;
    if (Math.abs(previousAxis - currentAxis) < 1e-9) throw audienceError('İzleyici tutma CSV’sinde aynı zaman noktası birden fazla kez bulunuyor; ek boyutları filtreleyip tek videoluk rapor dışa aktarın.');
  }
  if (retention.points.some(point => point.audienceWatchRatio > 1)) {
    caveats.push('İzleyici tutma oranının %100’ü aşması geçerlidir: YouTube’a göre bir bölümün aynı görüntülemede yeniden oynatıldığını gösterebilir; izleyici sayısı değildir.');
  }
  if (durationSec == null) {
    caveats.push('30. saniye tutulması hesaplanmadı: video süresi CSV’de yoktu ve durationSec verilmedi.');
    return retention;
  }
  if (durationSec < 30 || retention.points.some(point => point.elapsedSec == null)) {
    caveats.push('30. saniye tutulması hesaplanmadı: video 30 saniyeden kısa veya zaman ekseni saniyeye dönüştürülemedi.');
    return retention;
  }
  const exact = retention.points.find(point => Math.abs(point.elapsedSec - 30) < 1e-6);
  if (exact) {
    retention.retention30 = { seconds: 30, audienceWatchRatio: exact.audienceWatchRatio, percentage: Number((exact.audienceWatchRatio * 100).toFixed(10)), method: 'exact-axis-point' };
    return retention;
  }
  caveats.push('30. saniye tutulması hesaplanmadı: CSV zaman ekseninde tam 30. saniyeye karşılık gelen ölçüm noktası yok. Komşu ölçümlerden tahmin üretilmedi.');
  return retention;
}

function normalizedPeriod(period, selected, dateColumn) {
  if (period != null && period !== '') {
    if (typeof period === 'string') {
      const value = period.trim();
      if (!value || value.length > 200) throw audienceError('Dönem açıklaması 1–200 karakter olmalı.');
      return value;
    }
    if (typeof period === 'object' && !Array.isArray(period)) {
      const start = String(period.start ?? '').trim();
      const end = String(period.end ?? '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) throw audienceError('Dönem başlangıç ve bitişi YYYY-AA-GG biçiminde olmalı.');
      return { start, end };
    }
    throw audienceError('Dönem metin veya başlangıç/bitiş nesnesi olmalı.');
  }
  if (!dateColumn) return null;
  const dates = [...new Set(selected.map(row => String(cell(row.values, dateColumn)).trim()).filter(Boolean))];
  if (!dates.length) return null;
  if (dates.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) return { start: [...dates].sort()[0], end: [...dates].sort().at(-1) };
  return dates.length === 1 ? dates[0].slice(0, 200) : null;
}

function importFile(id) { return path.join(jobDir(id), 'audience.json'); }

function readImports(id) {
  const saved = readJson(importFile(id), { version: 1, imports: [] });
  return Array.isArray(saved?.imports) ? saved.imports : [];
}

function periodLabel(record) {
  if (typeof record.period === 'string') return record.period;
  if (record.period?.start && record.period?.end) return `${record.period.start}/${record.period.end}`;
  return String(record.importedAt || '').slice(0, 10) || 'tarihsiz dönem';
}

function reportSuggestions(imports, latest) {
  if (!latest) return [];
  const suggestions = [];
  const curve = latest.retention?.points || [];
  const at30 = latest.retention?.retention30;
  if (at30 && curve.length && curve[0].audienceWatchRatio - at30.audienceWatchRatio >= 0.1) {
    const drop = (curve[0].audienceWatchRatio - at30.audienceWatchRatio) * 100;
    suggestions.push(`${periodLabel(latest)} döneminde başlangıçtan 30. saniyeye ölçülen düşüş ${drop.toFixed(1)} yüzde puanıydı; açılıştaki vaat, tempo ve ilk görsel değişimini bu zaman aralığında inceleyin.`);
  }
  if (curve.some(point => point.audienceWatchRatio > 1)) suggestions.push(`${periodLabel(latest)} döneminde %100’ü aşan bölüm yeniden oynatma davranışı gösterebilir; o bölümdeki konu veya görseli sonraki kurgu için gözlem olarak kaydedin.`);
  for (const metric of ['ctr', 'averageViewed', 'retention30']) {
    const currentValue = metric === 'retention30' ? latest.retention?.retention30?.percentage : latest.metrics?.[metric];
    if (currentValue == null) continue;
    const previous = [...imports].slice(0, -1).reverse().find(item => {
      if (latest.videoId && item.videoId && item.videoId !== latest.videoId) return false;
      return metric === 'retention30' ? item.retention?.retention30?.percentage != null : item.metrics?.[metric] != null;
    });
    if (!previous) continue;
    const previousValue = metric === 'retention30' ? previous.retention.retention30.percentage : previous.metrics[metric];
    const delta = currentValue - previousValue;
    if (Math.abs(delta) < 1e-9) continue;
    const label = { ctr: 'CTR', averageViewed: 'ortalama izlenen yüzde', retention30: '30. saniye tutulması' }[metric];
    suggestions.push(`${label}: ${periodLabel(previous)} döneminde %${previousValue.toFixed(2)}, ${periodLabel(latest)} döneminde %${currentValue.toFixed(2)}; gözlenen değişim ${delta > 0 ? '+' : ''}${delta.toFixed(2)} yüzde puanı. Dönem ve kitle farkları nedeniyle bu karşılaştırma nedensel sonuç göstermez.`);
  }
  return suggestions;
}

export function importAudience(id, { csv, filename, videoId, durationSec, period } = {}) {
  requireJob(id, { writable: true });
  const safeFilename = path.basename(String(filename ?? '')).slice(0, 255);
  if (!/\.csv$/i.test(safeFilename)) throw audienceError('YouTube Studio’dan dışa aktarılan bir CSV dosyası seçin.');
  const input = inputBytes(csv);
  if (!input.bytes.length) throw audienceError('CSV boş.');
  if (input.bytes.length > AUDIENCE_IMPORT_LIMITS.maxBytes) throw audienceError(`CSV çok büyük; sınır ${AUDIENCE_IMPORT_LIMITS.maxBytes} bayt.`);
  const rows = parseCsv(input.text);
  const { columns, hasSummary, hasRetention } = columnsFor(rows[0]);
  const { selected, selectedId, availableVideoIds } = chooseRows(rows, columns, videoId);
  const caveats = [];
  if (!columns.videoId) caveats.push('CSV video kimliği içermiyor; içe aktarımın bu işe ait olduğu dosyadan doğrulanamadı.');
  const suppliedDuration = parseDurationOption(durationSec);
  const duration = suppliedDuration ?? csvDuration(selected, columns.duration, caveats);
  const metrics = summaryMetrics(selected, columns, caveats);
  const retention = retentionData(selected, columns, duration, caveats);
  if (retention.retention30) metrics.retention30 = retention.retention30.percentage;
  const unavailable = ALL_FIELDS.filter(key => key === 'retention30'
    ? !retention.retention30
    : key === 'audienceRetentionCurve'
      ? !retention.points.length
      : metrics[key] == null);
  const now = new Date().toISOString();
  const relative = `audience-imports/${now.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.csv`;
  const record = {
    source: 'youtube-studio-csv',
    importedAt: now,
    filename: safeFilename,
    storedFile: relative,
    videoId: selectedId,
    availableVideoIds,
    period: normalizedPeriod(period, selected, columns.date),
    durationSec: duration,
    kind: hasRetention && hasSummary ? 'summary-and-retention' : hasRetention ? 'retention' : 'summary',
    rowCount: selected.length,
    metrics,
    retention,
    unavailable,
    caveats: [...new Set(caveats)],
  };
  const release = beginJobEdit(id);
  const absolute = path.join(jobDir(id), ...relative.split('/'));
  try {
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, input.bytes);
    try { writeJson(importFile(id), { version: 1, imports: [...readImports(id), record] }); }
    catch (error) { try { fs.unlinkSync(absolute); } catch {} throw error; }
  } finally {
    release();
  }
  return { import: record, report: audienceReport(id) };
}

export function audienceReport(id) {
  requireJob(id);
  const imports = readImports(id);
  const latest = imports.at(-1) || null;
  const publication = readJson(path.join(jobDir(id), 'publication.json'), null);
  const manual = publication?.source === 'manual' ? publication : null;
  const history = [
    ...(manual ? [manual] : []),
    ...imports,
  ].sort((a, b) => String(a.importedAt || a.recordedAt || '').localeCompare(String(b.importedAt || b.recordedAt || '')));
  const metrics = latest ? { ...latest.metrics } : {};
  const unavailable = latest ? [...latest.unavailable] : [...ALL_FIELDS];
  const caveats = [
    ...(latest?.caveats || []),
    'İçe aktarımlar farklı tarihlerde, trafik kaynaklarında veya kitlelerde ölçülmüş olabilir; gözlenen değişimler nedensel A/B sonucu değildir.',
  ];
  if (!imports.length) caveats.unshift('Henüz kullanıcıya ait bir YouTube Studio CSV dışa aktarımı yok.');
  return {
    jobId: id,
    imports,
    manual,
    history,
    latest,
    metrics,
    retention: latest?.retention || { durationSec: null, points: [], retention30: null },
    suggestions: reportSuggestions(imports, latest),
    unavailable,
    availability: Object.fromEntries(ALL_FIELDS.map(key => [key, !unavailable.includes(key)])),
    caveats: [...new Set(caveats)],
  };
}
