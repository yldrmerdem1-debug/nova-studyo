const TEXT = new Set(['anthropicKey','model','pexelsKey','pixabayKey','unsplashKey','elevenKey','europeanaKey','falKey','falImageModel','falImageEditModel','falVideoModel','kieKey','kieImageModel','kieVideoModel','higgsKey','higgsImageModel','higgsVideoModel','openaiKey','replicateKey','openaiImageModel','ffmpegPath','ffprobePath','elevenModel','audioLibraryDir','replicateVideoModel','klingKey']);
const VOICE_MODELS=['eleven_v4','eleven_v4_turbo'];
const KLING_MODELS=['kling-3.0','kling-2.5-turbo'];
const BOOL = new Set(['useWebSearch','demoMode','cinemaGrade','keepIntermediate','dryRun','soundDesign','elevenSpeakerBoost','trimSilence','shortsMotion','docuOpeningMotion','docuDepthLayers']);
const NUMBERS = {fps:[24,60,true],crf:[14,30,true],concurrency:[1,12,true],musicVolume:[0,0.5],sfxVolume:[0,0.5],elevenStability:[0,1],elevenSimilarity:[0,1],elevenStyle:[0,1],elevenSpeed:[0.7,1.2],docuMaxClaudeUsd:[0,1000],shortsMotionMax:[0,20,true]};
const ENUMS = {docuVoiceModel:VOICE_MODELS,docuShortsVoiceModel:VOICE_MODELS,ttsProvider:['edge','eleven'],imageProvider:['kie','fal','higgs','openai'],videoProvider:['kie','fal','higgs'],renderQuality:['hizli','dengeli','kalite','custom'],editIntensity:['restrained','balanced','dynamic'],preset:['ultrafast','superfast','veryfast','faster','fast','medium','slow','slower','veryslow'],elevenNormalize:['on','off','auto'],docuMusicSource:['library','eleven'],klingOpeningModel:KLING_MODELS,klingModel:KLING_MODELS,klingOpeningResolution:['720p','1080p'],klingResolution:['720p','1080p']};
function invalid(key) { throw new Error(`Geçersiz ayar: ${key}`); }
export function settingsPatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid('gövde');
  const patch = {};
  for (const [key, value] of Object.entries(body)) {
    if (TEXT.has(key)) { if (typeof value !== 'string' || value.length > 2000) invalid(key); patch[key] = value.trim(); }
    else if (BOOL.has(key)) { if (typeof value !== 'boolean') invalid(key); patch[key] = value; }
    else if (NUMBERS[key]) {
      if (typeof value !== 'number' && typeof value !== 'string') invalid(key);
      const n = Number(value), [min,max,integer] = NUMBERS[key];
      if (String(value).trim() === '' || !Number.isFinite(n)) invalid(key);
      patch[key] = Math.max(min,Math.min(max,integer ? Math.round(n) : n));
    } else if (ENUMS[key]) { if (!ENUMS[key].includes(value)) invalid(key); patch[key] = value; }
    else if (key === 'modelRates') {
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 50) invalid(key);
      patch.modelRates = {};
      for (const [model, rate] of Object.entries(value)) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,150}$/.test(model) || !rate || typeof rate !== 'object') invalid(key);
        const clean = {};
        for (const name of ['input','output','cacheRead','cacheWrite']) {
          if (rate[name] === undefined) continue;
          if (typeof rate[name] !== 'number' || !Number.isFinite(rate[name]) || rate[name] < 0 || rate[name] > 10000) invalid(key);
          clean[name] = rate[name];
        }
        if (clean.input === undefined || clean.output === undefined) invalid(key);
        patch.modelRates[model] = clean;
      }
    }
  }
  if (('crf' in patch || 'preset' in patch) && !('renderQuality' in patch)) patch.renderQuality = 'custom';
  return patch;
}
