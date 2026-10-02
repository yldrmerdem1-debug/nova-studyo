// SES SEVİYESİ — iki geçişli loudnorm.
//
// NEDEN: tek geçişte loudnorm hedefi tutturamıyor. Filtre sesi ilerledikçe
// "öğrendiği" için videonun başını yanlış kazançla geçiyor ve ortalama hedefin
// altında kalıyor. Bitmiş iki videoda ölçüldü:
//     hedef -14 LUFS  ->  gerçekleşen -15,4 ve -16,0 LUFS
// YouTube yalnızca YÜKSEK sesi kısar, kısık sesi YÜKSELTMEZ. Yani bu 2 dB
// doğrudan izleyiciye gidiyordu: video başkalarınınkinden sessiz çalıyor,
// izleyici sesi açmak zorunda kalıyor.
//
// ÇÖZÜM: birinci geçiş yalnızca ÖLÇER (çıktı /dev/null'a gider), ikinci geçiş
// ölçüme göre tek seferde doğru kazancı uygular. `linear=true` tüm parçaya tek
// bir sabit kazanç bindirir — dinamiği bozmaz, sadece seviyeyi yerine oturtur.
// ffmpeg gereken kazanç tepe sınırını (TP) aşacaksa kendiliğinden dinamik moda
// düşer, o yüzden ayrıca korumaya gerek yok.
import fs from 'node:fs';
import path from 'node:path';
import { run } from "../util.js";

export const HEDEF = { I: -14, TP: -1.5, LRA: 11 };

const temel = `I=${HEDEF.I}:TP=${HEDEF.TP}:LRA=${HEDEF.LRA}`;

// ffmpeg ölçüm JSON'unu stderr'in SONUNA basar; öncesinde uyarılar/uzun filtre
// dökümü olabilir. Bu yüzden baştan değil, SONDAN geriye doğru ilk geçerli
// nesneyi arıyoruz.
export function olcumAyristir(stderr) {
  const s = String(stderr || "");
  let son = s.lastIndexOf("{");
  while (son !== -1) {
    const kapanis = s.indexOf("}", son);
    if (kapanis !== -1) {
      try {
        const o = JSON.parse(s.slice(son, kapanis + 1));
        const say = (v) => {
          const n = parseFloat(v);
          return Number.isFinite(n) ? n : null;
        };
        const m = {
          I: say(o.input_i), TP: say(o.input_tp),
          LRA: say(o.input_lra), esik: say(o.input_thresh),
          kaydirma: say(o.target_offset),
        };
        // -inf/nan gelirse (tamamen sessiz girdi) ikinci geçiş bozulur.
        if (Object.values(m).every((v) => v !== null)) return m;
      } catch {}
    }
    // DİKKAT: lastIndexOf negatif fromIndex'i 0 sayar, yani son=0 iken
    // lastIndexOf("{", -1) yine 0 döner ve döngü sonsuza girer. Ölçüldü:
    // "-inf" içeren (tamamen sessiz) girdide test kilitlendi.
    if (son === 0) break;
    son = s.lastIndexOf("{", son - 1);
  }
  return null;
}

export function olcumFiltresi() {
  return `loudnorm=${temel}:print_format=json`;
}

export function uygulamaFiltresi(m) {
  // offset ffmpeg'in kendi önerdiği düzeltme; olduğu gibi geri veriliyor.
  return `loudnorm=${temel}:measured_I=${m.I}:measured_TP=${m.TP}` +
    `:measured_LRA=${m.LRA}:measured_thresh=${m.esik}` +
    `:offset=${m.kaydirma}:linear=true`;
}

export function tepeDuzeltmeFiltresi() {
  return 'aresample=192000,alimiter=limit=0.6:attack=5:release=80:level=false:latency=true,aresample=48000';
}

export async function kodlanmisTepeyiSinirla(ffmpegPath, file, {measured, measureFn, killer, logFn}={}) {
  if(typeof measureFn!=='function') throw new Error('Kodlanmış tepe düzeltmesi için ölçüm işlevi gerekli.');
  const before=measured || await measureFn(ffmpegPath,file,{killer});
  if(Number.isFinite(before?.truePeakDb) && before.truePeakDb<=-1.2) return {measured:before,corrected:false,correction:null,warning:null};
  const ext=path.extname(file)||'.m4a', temp=file.slice(0,-ext.length)+'.peak-fix'+ext;
  try {
    await run(ffmpegPath,['-i',file,'-af',tepeDuzeltmeFiltresi(),'-ar','48000','-c:a','aac','-b:a','192k','-y',temp],{killer});
    const after=await measureFn(ffmpegPath,temp,{killer});
    fs.copyFileSync(temp,file);
    const unresolved=!Number.isFinite(after?.truePeakDb) || after.truePeakDb>-1.2;
    const warning=unresolved?'Kodlanmış ses tepe seviyesi sınırlı düzeltmeden sonra da hedefi aşıyor; yayından önce miksajı kontrol edin.':null;
    logFn?.(unresolved?warning:`Kodlanmış ses tepesi düzeltildi: ${before.truePeakDb.toFixed(2)} → ${after.truePeakDb.toFixed(2)} dBTP.`);
    return {measured:after,corrected:true,correction:{attempts:1,before,after,filter:tepeDuzeltmeFiltresi()},warning};
  } catch(e) {
    if(killer?.cancelled) throw e;
    const warning=`Kodlanmış ses tepe düzeltmesi tamamlanamadı: ${e.message}; yayından önce miksajı kontrol edin.`;
    logFn?.(warning);
    return {measured:before,corrected:false,correction:{attempts:1,before,error:e.message},warning};
  } finally { try { fs.rmSync(temp,{force:true}); } catch {} }
}

// girdiler : ffmpeg giriş argümanları (ör. ["-i", narration, "-i", music])
// zincir   : [mix] etiketiyle BİTEN filter_complex metni
// cikis    : yazılacak ses dosyası
export async function normalizeEt(ffmpegPath, girdiler, zincir, cikis, { killer, logFn } = {}) {
  let ham = "";
  let olcum = null;
  try {
    await run(ffmpegPath, [
      ...girdiler, "-filter_complex", `${zincir}[mix];[mix]${olcumFiltresi()}[out]`,
      "-map", "[out]", "-ar", "48000", "-f", "null", "-",
    ], { killer, onLine: (s) => { ham += s; if (ham.length > 60000) ham = ham.slice(-30000); } });
    olcum = olcumAyristir(ham);
  } catch (e) {
    if (killer?.cancelled) throw e;
    logFn?.(`Ses ölçümü yapılamadı (${e.message.slice(0, 80)}) — tek geçişe düşülüyor.`);
  }

  if (!olcum) {
    // Ölçüm alınamadıysa eski davranış aynen sürsün; sessizce bozulmasın.
    logFn?.("Ses ölçümü okunamadı — tek geçişli normalleştirme kullanılıyor.");
    await run(ffmpegPath, [
      ...girdiler, "-filter_complex", `${zincir}[mix];[mix]loudnorm=${temel}[out]`,
      "-map", "[out]", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-y", cikis,
    ], { killer });
    return null;
  }

  logFn?.(`Ses ölçüldü: ${olcum.I.toFixed(1)} LUFS → ${HEDEF.I} LUFS'a getiriliyor (YouTube standardı).`);
  await run(ffmpegPath, [
    ...girdiler, "-filter_complex", `${zincir}[mix];[mix]${uygulamaFiltresi(olcum)}[out]`,
    "-map", "[out]", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-y", cikis,
  ], { killer });
  return olcum;
}
