// Global zaman çizelgesinden ASS (yakılacak) + SRT (YouTube CC için) üretir.

function assTime(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function srtTime(sec) {
  const totalMs = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

const esc = (t) => t.replace(/[{}]/g, "").replace(/\\/g, "");

/** Harf/rakam dışını at — TTS kelimesiyle özgün belirteci eşlemek için. */
const sade = (s) => String(s || "").toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");

const portraitClassic = (mode, {width=1920,height=1080,editorial=false}={}) => editorial && height>width && mode!=="word" && mode!=="strip";
const phraseLead = new Set("a an the and or but as at by for from in into of on than that to with is are was were be been being had has have can could would should will may might must isnt arent wasnt werent hasnt havent hadnt cant couldnt wouldnt shouldnt wont its his her their ve veya ama bir bu şu ile için en daha".split(" "));
const numberPart = /^(?:\d+[.,\d]*|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|bc|bce|ad|sıfır|bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar)$/;
const sentenceEnd = /[.!?…]["'”’)]*$/;

// Keep a short sentence together when it fits. Within longer sentences, choose
// small phrases near 24 characters without stranding articles or a last word.
// A 32-character ceiling leaves room for a coherent phrase on two lines.
function portraitPhrases(words) {
  const out=[];
  for(let begin=0;begin<words.length;){
    let end=begin+1;
    while(end<words.length&&!sentenceEnd.test(words[end-1].t))end++;
    const costs=new Map([[end,0]]),next=new Map();
    for(let i=end-1;i>=begin;i--){
      let text="",best=Infinity,numbers=0;
      for(let j=i;j<Math.min(end,i+6);j++){
        text+=(text?" ":"")+words[j].t;
        if(numberPart.test(sade(words[j].t)))numbers++;
        if(j>i&&text.length>32)break;
        const count=j-i+1;
        // A spoken number/date may need one extra word to keep its full value.
        if(count>5&&numbers<2)break;
        const dangling=j+1<end&&phraseLead.has(sade(words[j].t))&&!/[,;:]$/.test(words[j].t);
        const splitNumber=j+1<end&&numberPart.test(sade(words[j].t))&&(numberPart.test(sade(words[j+1].t))||/^(and|ve)$/.test(sade(words[j+1].t)));
        const score=10+(text.length-24)**2/32+(count===1?45:count===2||count===6?4:0)+(dangling?25:0)+(splitNumber?35:0)
          +(/[,;:]$/.test(words[j].t)?-4:0)+costs.get(j+1);
        if(score<best){best=score;next.set(i,j+1);}
      }
      costs.set(i,best);
    }
    for(let i=begin;i<end;){const stop=next.get(i);out.push(words.slice(i,stop));i=stop;}
    begin=end;
  }
  return out;
}

function portraitLineBreak(text) {
  const clean=esc(text);
  if(clean.length<=24||!clean.includes(" "))return clean;
  const spaces=[...clean.matchAll(/ /g)].map(x=>x.index);
  const at=spaces.reduce((best,x)=>Math.abs(x-clean.length/2)<Math.abs(best-clean.length/2)?x:best);
  return clean.slice(0,at)+"\\N"+clean.slice(at+1);
}

/**
 * TTS KELİMELERİNE NOKTALAMAYI GERİ YAZ.
 *
 * ÖLÇÜLEN KUSUR (20260811-d6e97f): altyazı "May 2012 A woman named Cathy
 * Hutchinson lifts" diye akıyordu — 2012'den sonraki nokta yok. "years Her
 * arm", "cortex It's beautiful" — cümleler birbirine giriyor.
 *
 * Sebep: altyazı TTS'in KELİME ZAMANLAMALARINDAN kuruluyor ve o kelimeler
 * noktalamasız geliyor. Özgün metin (`seg.text`) noktalamalı olarak zaten
 * elde duruyordu, kullanılmıyordu.
 *
 * İKİ KUSUR BİRDEN: aşağıdaki öbekleme kodu ZATEN noktalamaya bakıyor
 * (`/[.!?…]$/`, `/[,;:]$/`). Noktalama hiç gelmediği için o dallar hiç
 * çalışmıyordu ve altyazı yalnızca 42 karakterde kesiliyordu — cümle
 * sınırına saygı gösteren tasarım sessizce devre dışıydı.
 *
 * Hizalama toleranslı: TTS bir kelimeyi bölebiliyor/birleştirebiliyor, o
 * yüzden birkaç belirteç ileri bakılıyor ve eşleşme bulunamazsa kelime
 * olduğu gibi bırakılıyor (metin asla bozulmaz, sadece o kelime noktalamasız
 * kalır).
 */
export function noktalamaGeriYaz(words, text) {
  if (!words?.length || !text) return words || [];
  const belirtec = String(text).trim().split(/\s+/).filter(Boolean);
  if (!belirtec.length) return words;

  const out = [];
  let j = 0;
  for (const w of words) {
    const hedef = sade(w?.t);
    if (!hedef) { out.push(w); continue; }
    let bulundu = -1;
    for (let k = j; k < Math.min(belirtec.length, j + 4); k++) {
      if (sade(belirtec[k]) === hedef) { bulundu = k; break; }
    }
    if (bulundu >= 0) {
      out.push({ ...w, t: belirtec[bulundu] });
      j = bulundu + 1;
    } else {
      out.push(w);
    }
  }
  return out;
}

/**
 * @param timeline [{offset, duration, words:[{t,start,end}], text}] — offset: segmentin videodaki başlangıcı
 * @param mode "classic" | "word" | "strip"
 * @param options Optional render canvas and editorial flag; omitted keeps legacy grouping.
 */
export function buildCaptions(timeline, mode, options={}) {
  const captions = []; // {start, end, text}
  for (const ham of timeline) {
    if (!ham.words?.length) continue;
    // Noktalama geri yazılmadan öbekleme cümle sınırını göremiyor.
    const seg = { ...ham, words: noktalamaGeriYaz(ham.words, ham.text) };
    if (mode === "strip") {
      // Kolaj şeridi: 1-2 kelime, ~1,3 sn'de sert kesme
      let chunk = [];
      const flush = () => {
        if (!chunk.length) return;
        captions.push({
          start: seg.offset + chunk[0].start,
          end: seg.offset + chunk[chunk.length - 1].end + 0.06,
          text: chunk.map((w) => w.t).join(" ").toUpperCase(),
        });
        chunk = [];
      };
      for (const w of seg.words) {
        chunk.push(w);
        const span = chunk[chunk.length - 1].end - chunk[0].start;
        const longWord = chunk.reduce((a, x) => a + x.t.length, 0) > 15;
        if (chunk.length >= 2 || span >= 1.3 || longWord || /[.!?…]$/.test(w.t)) flush();
      }
      flush();
    } else if (mode === "word") {
      for (const w of seg.words) {
        const start = seg.offset + w.start;
        let end = seg.offset + w.end;
        if (end - start < 0.09) end = start + 0.09;
        captions.push({ start, end, text: w.t.toUpperCase() });
      }
    } else if (portraitClassic(mode,options)) {
      for(const chunk of portraitPhrases(seg.words))captions.push({
        start:seg.offset+chunk[0].start,
        end:seg.offset+chunk[chunk.length-1].end+.12,
        text:chunk.map(w=>w.t).join(" "),
      });
    } else {
      // klasik: ~42 karakterlik öbekler, noktalama sınırlarına saygılı
      let chunk = [], len = 0;
      const flush = () => {
        if (!chunk.length) return;
        captions.push({
          start: seg.offset + chunk[0].start,
          end: seg.offset + chunk[chunk.length - 1].end + 0.12,
          text: chunk.map((w) => w.t).join(" "),
        });
        chunk = []; len = 0;
      };
      // TAVAN AŞILMADAN BÖL.
      //
      // Eski kod kelimeyi EKLEDİKTEN sonra bakıyordu: `len >= 42` ancak son
      // kelime dizildikten sonra doğru olduğu için satır 42'yi aşmış oluyordu.
      // Ölçüldü (20260812-b499f0): 73 altyazı satırının 12'si 45 karakterden
      // uzundu, en uzunu 48 — "out with a robotic arm she was moving by thought".
      // Uzun satır küçük ekranda iki satıra sarıyor ve görüntüyü kapatıyor.
      const SATIR_TAVANI = 42;
      for (const w of seg.words) {
        const ek = w.t.length + 1;
        // Bu kelimeyi eklersek tavanı aşacaksak, ÖNCE mevcut öbeği kapat.
        if (chunk.length && len + ek > SATIR_TAVANI) flush();
        chunk.push(w); len += ek;
        const endPunct = /[.!?…]$/.test(w.t);
        const midPunct = /[,;:]$/.test(w.t);
        if ((endPunct && len >= 12) || (midPunct && len >= 34)) flush();
      }
      flush();
    }
  }
  // çakışmaları temizle
  for (let i = 0; i < captions.length - 1; i++) {
    if (captions[i].end > captions[i + 1].start) captions[i].end = captions[i + 1].start;
  }
  return captions;
}

export function buildAss(captions, mode, { width = 1920, height = 1080, editorial = false } = {}) {
  const portrait=portraitClassic(mode,{width,height,editorial});
  const editorialSize=Math.round(Math.min(width,height)*.038);
  const classicStyle=portrait
    ? `Style: Classic,Segoe UI Semibold,${Math.round(width*64/1080)},&H00F7F4EF,&H00F7F4EF,&H00121820,&H80121820,0,0,0,0,100,100,0,0,1,${Math.max(2,Math.round(width*3/1080))},1,5,${Math.round(width*.08)},${Math.round(width*.16)},0,1`
    : editorial
    ? `Style: Classic,Segoe UI,${editorialSize},&H00F7F4EF,&H00F7F4EF,&H40121820,&H40121820,-1,0,0,0,100,100,0,0,3,${Math.max(3,Math.round(editorialSize*.14))},0,2,${Math.round(width*.09)},${Math.round(width*.09)},${Math.round(height*.08)},1`
    : `Style: Classic,Arial,${Math.round(height * 0.049)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,-1,0,0,0,100,100,0,0,1,${Math.round(height * 0.0042)},1,2,${Math.round(width * 0.12)},${Math.round(width * 0.12)},${Math.round(height * 0.075)},1`;
  const header = `[Script Info]
Title: Nova Studyo Altyazi
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${classicStyle}
Style: Word,Arial,${Math.round(height * 0.067)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H96000000,-1,0,0,0,100,100,1,0,1,${Math.round(height * 0.0056)},2,2,${Math.round(width * 0.08)},${Math.round(width * 0.08)},${Math.round(height * 0.085)},1
Style: Strip,Arial,${Math.round(height * 0.058)},&H00DCEBF4,&H00DCEBF4,&H002E2A2A,&H002E2A2A,-1,0,0,0,100,100,2,0,3,0,0,2,${Math.round(width * 0.08)},${Math.round(width * 0.08)},${Math.round(height * 0.062)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const style = mode === "word" ? "Word" : mode === "strip" ? "Strip" : "Classic";
  const fx = mode === "word" ? "{\\fscx82\\fscy82\\t(0,80,\\fscx104\\fscy104)\\t(80,150,\\fscx100\\fscy100)}" : portrait ? `{\\q2\\pos(${Math.round(width*.46)},${Math.round(height*.77)})}` : "";
  const lines = captions.map(
    (c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},${style},,0,0,0,,${fx}${portrait?portraitLineBreak(c.text):esc(c.text)}`
  );
  return header + lines.join("\n") + "\n";
}

export function buildSrt(timeline) {
  // SRT her zaman klasik öbeklerle (YouTube CC için)
  const captions = buildCaptions(timeline, "classic");
  return captions
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join("\n");
}
