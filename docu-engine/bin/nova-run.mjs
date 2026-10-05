// Nova Studyo'nun alt süreci. Kullanım:
//   ELECTRON_RUN_AS_NODE=1 <Nova Studyo.exe> bin/nova-run.mjs <spec.json>
//
// spec.json: { scriptPath, workDir, cacheDir, output, srt?, thumbnail?, voiceId?, voiceModel?, ffmpeg?, concurrency?,
//              renderConcurrency?, imageProvider?, openaiImageModel?, minSeconds?, audioLibrary?, musicSource?,
//              keepChunks?, cancelFile? }
// Anahtarlar ortamdan gelir (dosyaya yazılmaz): NOVA_ELEVEN_KEY, NOVA_REPLICATE_KEY, NOVA_KLING_KEY, NOVA_OPENAI_KEY.
// Ses kütüphanesi ve müzik kaynağı da ortamdan: NOVA_AUDIO_LIB (klasör), NOVA_MUSIC_SOURCE ("library" | "eleven").
//
// stdout'a her satır bir JSON olay yazar:
//   {"type":"log","msg":"..."}  {"type":"progress","stage":"images","pct":12.5}
//   {"type":"done","output":"...","durationSec":38.6,"warnings":{...},"musicCues":[...],"sfxCredits":[...]}
//   {"type":"error","msg":"...","stack":"...","cancelled":false,"quota":false}
//
// Nazik iptal: SIGINT/SIGTERM ya da spec.cancelFile dosyasının oluşması motoru bir sonraki
// güvenli noktada (iki istek arası, iki render parçası arası) durdurur; bitmiş parçalar
// önbellekte kalır. Süreç doğrudan öldürülse de yarım dosya önbelleğe girmez.
import { existsSync, readFileSync } from 'node:fs';
import { setPriority } from 'node:os';
import { produce } from '../lib/produce.mjs';

// The engine works in the background: below-normal priority (inherited by the
// Chrome tabs and ffmpeg it spawns) keeps the PC responsive during a render.
// NOVA_RENDER_PRIORITY=0 renders at full speed when nobody is using the PC.
try { setPriority(process.pid, Number(process.env.NOVA_RENDER_PRIORITY ?? 10)); } catch {}

const say = (o) => process.stdout.write(JSON.stringify(o) + '\n');
/*
 * Son satır borudan çıkmadan süreç kapanmasın: Nova'ya giden boru eşzamansız
 * olabilir ve write()'ın hemen ardından process.exit() son "done"/"error"
 * olayını kesebilir — iş, diskte bitmiş video varken çökmüş görünürdü.
 */
const finish = (code) => process.stdout.write('', () => process.exit(code));

let stop = false;
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    // İkinci sinyal beklemez: kullanıcı gerçekten kapatmak istiyor.
    if (stop) process.exit(130);
    stop = true;
  });
}

try {
  const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const script = JSON.parse(readFileSync(spec.scriptPath, 'utf8'));
  let lastPct = -1;
  let lastCheck = 0;
  const res = await produce(script, {
    workDir: spec.workDir,
    cacheDir: spec.cacheDir,
    output: spec.output,
    srt: spec.srt,
    thumbnail: spec.thumbnail,
    voiceId: spec.voiceId,
    voiceModel: spec.voiceModel,
    ffmpeg: spec.ffmpeg,
    concurrency: spec.concurrency,
    renderConcurrency: spec.renderConcurrency,
    imageProvider: spec.imageProvider,
    openaiImageModel: spec.openaiImageModel,
    // Opening motion clips (Replicate) and the optional paid 2.5D depth layers (Nova settings).
    videoModel: spec.videoModel || undefined,
    klingOpeningModel: spec.klingOpeningModel || undefined,
    klingOpeningResolution: spec.klingOpeningResolution || undefined,
    depthLayers: typeof spec.depthLayers === 'boolean' ? spec.depthLayers : undefined,
    // Seslendirmeden sonra ölçülen süre bunun altındaysa müzik/render'a geçilmez.
    minSeconds: Number(spec.minSeconds) || 0,
    // Nova hazırlık modu: render hariç her şey; sıradaki video render olurken hazırlanır.
    planOnly: !!spec.planOnly,
    audioLibrary: process.env.NOVA_AUDIO_LIB || spec.audioLibrary || undefined,
    musicSource: process.env.NOVA_MUSIC_SOURCE || spec.musicSource || undefined,
    // Render parçaları: belirtilmezse yalnız eksik varlıklı (yeniden render'ı beklenen) videoda saklanır.
    keepChunks: typeof spec.keepChunks === 'boolean' ? spec.keepChunks : undefined,
    keys: { eleven: process.env.NOVA_ELEVEN_KEY, replicate: process.env.NOVA_REPLICATE_KEY, kling: process.env.NOVA_KLING_KEY, openai: process.env.NOVA_OPENAI_KEY },
    cancelled: () => {
      if (!stop && spec.cancelFile && Date.now() - lastCheck > 500) {
        lastCheck = Date.now();
        stop = existsSync(spec.cancelFile);
      }
      return stop;
    },
    log: (msg) => say({ type: 'log', msg }),
    progress: (stage, pct) => {
      const p = Math.round(pct * 10) / 10;
      if (p !== lastPct) say({ type: 'progress', stage, pct: p });
      lastPct = p;
    },
  });
  say({
    type: 'done', output: res.output, durationSec: res.durationSec, props: res.props, srt: res.srt, thumbnail: res.thumbnail,
    sectionTimes: res.sectionTimes,
    // Kalite uyarıları (yedek görsel, eksik ortam sesi…) ve künye: kullanılan kütüphane müziği ve efektleri.
    warnings: res.warnings, musicCues: res.musicCues, sfxCredits: res.sfxCredits,
  });
  finish(0);
} catch (e) {
  // Kısa mesaj kullanıcıya; yığın Nova'nın iş günlüğüne (uzun bir render'ın nerede çöktüğü ancak böyle görülür).
  say({ type: 'error', msg: String(e?.message ?? e), stack: e?.stack ? String(e.stack).slice(0, 4000) : undefined, cancelled: !!e?.cancelled, quota: !!e?.quota });
  finish(1);
}
