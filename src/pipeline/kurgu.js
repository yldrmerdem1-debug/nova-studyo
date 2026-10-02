// KURGU PLANI — videonun tamamı için TEK çağrı.
//
// NEDEN VAR:
// Kurgu kararları (hangi sahnede ne gösterilecek) şimdiye kadar tamamen kuralla
// veriliyordu: şablon sırayla seçiliyor, köşe öğesi aralık kuralına göre
// konuyor, vurgu kelime uzunluğuna/bilgi değerine göre seçiliyordu. Sonuç
// tutarlıydı ama MEKANİKTİ — kod sahnenin İÇERİĞİNİ görmüyor. 7. sahnenin bir
// portre, 8'inin geniş manzara olduğunu bilmiyor.
//
// NEDEN SAHNE BAŞINA DEĞİL, VİDEO BAŞINA TEK ÇAĞRI:
// Sahne başına ayrı çağrı 30 bağımsız karar demek — her biri makul, hepsi bir
// arada dağınık. Tek çağrıda model bütün sahneleri birden görür ve çeşitliliği
// BİLEREK planlar: "burada bölüm kartı, şurada grafik, doruğa tam ekran".
// Tutarlılık böyle artar, azalmaz. Maliyet de sahne başına değil, video başına.
//
// İŞ BÖLÜMÜ:
//   Model  → NİYET  (bu sahnede hangi araç, neyi vurgula)
//   Kod    → GEOMETRİ (güvenli alan, çakışmama, süre-nötr geçiş, alaka kapısı)
// Model geçersiz/eksik dönerse kural tabanlı yol aynen devam eder — kurgu
// planı bir İYİLEŞTİRMEDİR, bağımlılık değil.

import { callJSON } from "../llm.js";
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function cachedKurguPlani(scenes,options={}) {
  const {cacheDir,planner=kurguPlani,...opts}=options;
  if(!cacheDir) return planner(scenes,opts);
  const key=createHash('sha256').update(JSON.stringify({version:1,scenes,title:opts.baslik,profile:opts.profile,model:opts.model})).digest('hex');
  const file=path.join(cacheDir,'kurgu-plan-cache.json');
  try {
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(saved.key===key && Array.isArray(saved.entries) && saved.entries.every(([i,p])=>Number.isInteger(i)&&i>=0&&i<scenes.length&&ARACLAR.includes(p?.arac)&&GECISLER.includes(p?.gecis))) {
      opts.logFn?.('Önceki kurgu kararları korundu; yeniden model çağrısı yapılmadı.');
      return new Map(saved.entries);
    }
  } catch {} // Missing or incomplete cache is recomputed; never trusted as valid.
  const plan=await planner(scenes,opts);
  fs.mkdirSync(cacheDir,{recursive:true});
  const temporary=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary,JSON.stringify({version:1,key,entries:[...plan]},null,2));
  fs.renameSync(temporary,file);
  return plan;
}

/** Modelin seçebileceği kurgu araçları. */
export const ARACLAR = ["temiz", "kose", "tamekran", "grafik", "bolum"];

/**
 * Geçiş NİYETLERİ — efekt adı değil, ANLAM.
 *
 * Katalogda 58 xfade türü var ama hangisinin nereye geleceği karma değeriyle
 * seçiliyordu; yani içerikten bağımsız, keyfî. İyi kurguda geçişin bir anlamı
 * vardır ve o anlamı ancak sahneyi bilen seçebilir. Kod yine güvenliği
 * garanti eder: süre-nötrlük, en az gövde, kısa sahnede kısaltma.
 */
export const GECISLER = ["kes", "eritme", "karart", "parlat", "kaydir"];

/** Niyet → ffmpeg xfade türü ve varsayılan süre. */
export const GECIS_HARITASI = {
  kes: { tip: "", sure: 0 },
  eritme: { tip: "fade", sure: 0.42 },
  karart: { tip: "fadeblack", sure: 0.72 },
  parlat: { tip: "fadewhite", sure: 0.28 },   // kısa: flaş uzarsa darbe olmaktan çıkar
  kaydir: { tip: "smoothleft", sure: 0.36 },
};

const SEMA = {
  type: "object",
  properties: {
    sahneler: {
      type: "array",
      items: {
        type: "object",
        properties: {
          no: { type: "integer", description: "Sahne numarası (verilen listedeki sıra, 0'dan başlar)" },
          arac: {
            type: "string",
            enum: ARACLAR,
            description:
              "temiz: yalnızca tam ekran görüntü, hiçbir öğe yok | " +
              "kose: köşede küçük destek görseli | " +
              "tamekran: destek görseli bir anlığına ekranı kaplar (vuruş anı) | " +
              "grafik: sayı/karşılaştırma grafiği | " +
              "bolum: bölüm kartı",
          },
          vurgu: {
            type: "string",
            description:
              "Ekranda büyük puntoyla duracak SÖZ — sahnenin metninden AYNEN alınmış " +
              "1-3 kelime. Sayı, tarih, ölçü ya da özel ad tercih edilir. " +
              "Vurgulanacak bir şey yoksa boş string.",
          },
          gecis: {
            type: "string",
            enum: GECISLER,
            description:
              "BU sahneye NASIL girilecek. kes: sert kesme (VARSAYILAN) | " +
              "eritme: yumuşak çözülme | karart: siyaha inip çıkma | " +
              "parlat: beyaz flaş (ifşa/darbe) | kaydir: yana kayma (karşılaştırma)",
          },
          neden: { type: "string", description: "Tek cümlelik gerekçe (log için, en fazla 60 karakter)" },
        },
        required: ["no", "arac", "vurgu", "gecis", "neden"],
      },
    },
  },
  required: ["sahneler"],
};

const SISTEM = `Sen deneyimli bir belgesel KURGUCUsun. Sana bir videonun bütün
sahneleri sırayla veriliyor: o sahnede ne anlatıldığı, ekranda hangi görüntünün
olduğu ve süresi. Görevin her sahne için TEK bir kurgu kararı vermek.

TEMEL İLKE: ekran çoğu zaman TEMİZ kalmalı. Öğe, hak ettiği anda çıkar.
Sürekli bir şey gösterilirse öğeler dekora dönüşür ve hiçbiri anlam taşımaz.

ARAÇLAR
temiz    — varsayılan. Görüntü kendi başına konuşuyorsa hiçbir şey ekleme.
kose     — anlatılan şeyin İKİNCİ bir yüzü varsa (kişi anılıyor, yer anılıyor,
           nesne tarif ediliyor) küçük destek görseli. Ekranda ~%25'i geçmesin.
tamekran — sahnenin vuruş anı; destek görseli bir anlığına ekranı kaplar.
           Video başına en fazla 2-3 kez. Fazlası etkisini yok eder.
grafik   — SAYI ya da KARŞILAŞTIRMA anlatılıyorsa. Belgeselin en güçlü anı budur.
bolum    — yeni bölüm başlıyorsa.

RİTİM KURALLARI
- Ardışık iki sahne aynı aracı almasın; en az bir sahne "temiz" araya girsin.
- Sahnelerin en az yarısı "temiz" olmalı.
- "grafik" yalnızca metinde gerçekten sayı/karşılaştırma varsa.
- "tamekran" tüm videoda 2-3 taneyi geçmesin.

VURGU
Ekranda büyük duracak sözü sahnenin metninden AYNEN kopyala (çekim ekleriyle
birlikte). Sayı, tarih, ölçü ve özel ad en değerlisidir. Sıradan fiil veya
zarf vurgulama — "iniyordu", "yaklaşık", "sonra" gibi sözler ekranda hiçbir
şey söylemez, o durumda boş bırak. Sahnelerin bir kısmında vurgu olmaması
normaldir ve iyidir.

GEÇİŞ — bu sahneye NASIL girilecek
SERT KESME VARSAYILANDIR. Görünür efekt çoğaldıkça video amatörleşir; en
güçlü geçiş kesmedir. Efekti ancak bir ANLAMI varsa kullan:
  kes     — devamlılık ya da darbe. Sahnelerin ÇOĞU bu olmalı.
  eritme  — zaman geçti, konu yumuşak bağlanıyor.
  karart  — bölüm bitti, büyük sıçrama. Video başına 1-2 kez.
  parlat  — İFŞA anı: şaşırtıcı bir sayı, beklenmedik gerçek, darbe.
            Video başına en fazla 2 kez; fazlası etkisini yok eder.
  kaydir  — karşılaştırma ya da mekân değişimi ("bu arada", "öte yandan").
Ardışık iki sahne aynı efekti almasın. Şüphedeysen "kes" yaz.`;

/**
 * Videonun tamamı için kurgu planı üret.
 *
 * @param sahneler [{no, metin, gorunen, sure, bolumBasi, bolumAdi, sayiVar}]
 * @returns Map<no, {arac, vurgu, neden}>  — başarısızlıkta BOŞ map (kural yolu sürer)
 */
export async function kurguPlani(sahneler, { baslik = "", logFn = () => {}, usage, profile = null } = {}) {
  if (!Array.isArray(sahneler) || sahneler.length < 2) return new Map();

  const liste = sahneler.map((s) =>
    `${s.no}) [${s.sure.toFixed(1)}sn]${s.bolumBasi ? ` <YENİ BÖLÜM: ${s.bolumAdi}>` : ""}\n` +
    `   SÖYLENEN: ${String(s.metin || "").slice(0, 180)}\n` +
    `   EKRANDA : ${String(s.gorunen || "(bilinmiyor)").slice(0, 90)}`
  ).join("\n");

  try {
    // ÇIKTI SÖZLEŞMESİ PROMPT'UN İÇİNDE YAZILI — şemaya güvenilmiyor.
    // Ölçüldü (2026-08-07): bu hesapta output_config/json_schema desteklenmiyor,
    // istek 400 dönüyor ve llm.js sessizce promptla-JSON yoluna düşüyor. O yolda
    // enum bir "açıklama" olmaktan öteye gitmiyor: model kendi araç adlarını
    // uydurdu ("arsiv", "harita", "animasyon"). Sözleşme metne yazılınca uyuyor.
    const cikti = await callJSON({
      system: SISTEM + (profile ? `\nTür: ${profile.name}. ${profile.description} Yoğunluk: ${profile.intensity}. Bölüm dışındaki geçişlerin çoğu sert kesme olmalı; her sahneyi efektle doldurma.` : ''),
      user:
        `Video: "${baslik}"\nToplam ${sahneler.length} sahne.\n\n${liste}\n\n` +
        `ÇIKTI BİÇİMİ — tam olarak şu JSON:\n` +
        `{"sahneler":[{"no":0,"arac":"temiz","vurgu":"","neden":"..."}, ...]}\n\n` +
        `"arac" alanı SADECE şu beş değerden biri olabilir, başka hiçbir şey yazma:\n` +
        `  temiz · kose · tamekran · grafik · bolum\n` +
        `"vurgu" alanı: o sahnenin SÖYLENEN metninden AYNEN kopyalanmış 1-3 kelime, ` +
        `ya da boş string. Açıklama yazma, kendi cümleni kurma — metinden kelime kopyala.\n` +
        `0'dan ${sahneler.length - 1}'e kadar HER sahne için bir kayıt olmalı.`,
      schema: SEMA,
      maxTokens: 8000,
      usage,
      logFn,
    });

    // Model çıplak dizi de dönebiliyor (şema uygulanmadığı için) — iki biçimi de kabul et.
    const kayitlar = Array.isArray(cikti) ? cikti : (cikti?.sahneler || cikti?.scenes || []);
    const plan = new Map();
    kayitlar.forEach((s, sira) => {
      const no = Number.isInteger(s?.no) ? s.no : sira;
      if (no < 0 || no >= sahneler.length) return;
      // Tanınmayan araç adı ATILMAZ, "temiz"e çekilir: sahneyi plansız bırakmak
      // kural yoluna düşürür ve plan yarım kalır; temiz kadraj güvenli varsayılan.
      const arac = ARACLAR.includes(s?.arac) ? s.arac : "temiz";
      // Vurgu KARAKTERDEN değil KELİMEDEN kırpılır. 28. karakterde kesmek
      // sözcüğü ortadan bölüyor ve render tarafındaki "metinde geçiyor mu"
      // denetimi tutmuyordu — model doğru söz seçse bile atılıyordu.
      plan.set(no, {
        arac,
        // Tanınmayan geçiş adı "kes"e çekilir — güvenli varsayılan, en güçlü seçim.
        gecis: GECISLER.includes(s?.gecis) ? s.gecis : "kes",
        vurgu: String(s?.vurgu || "").trim().split(/\s+/).filter(Boolean).slice(0, 3).join(" "),
        neden: String(s?.neden || "").slice(0, 60),
      });
    });
    if (plan.size < Math.ceil(sahneler.length * 0.6)) {
      logFn(`Kurgu planı eksik döndü (${plan.size}/${sahneler.length}) — kural tabanlı kurgu kullanılacak.`);
      return new Map();
    }

    // Model ritim kurallarını ihlal edebilir — kod son sözü söyler.
    duzelt(plan, sahneler.length, logFn);

    const dagilim = {};
    for (const v of plan.values()) dagilim[v.arac] = (dagilim[v.arac] || 0) + 1;
    logFn(`Kurgu planı: ${Object.entries(dagilim).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    return plan;
  } catch (e) {
    logFn(`Kurgu planı alınamadı, kural tabanlı kurgu kullanılacak: ${String(e.message).slice(0, 90)}`);
    return new Map();
  }
}

/**
 * RİTİM DÜZELTMESİ — modelin sözünü kod denetler.
 * Prompt'ta yazması yeterli değil: ölçüldüğünde model ardışık aynı aracı ve
 * fazla "tamekran" üretebiliyor. Bunlar sessizce düzeltilir.
 */
function duzelt(plan, adet, logFn) {
  let oncekiArac = null, tamEkranSayisi = 0, degisen = 0;
  let oncekiGecis = null, parlatSayisi = 0, karartSayisi = 0, efektSayisi = 0;

  for (let i = 0; i < adet; i++) {
    const p = plan.get(i);
    if (!p) continue;

    // Ardışık aynı araç → ikincisi temizlenir (temiz hariç, o zaten dinlenme).
    if (p.arac !== "temiz" && p.arac === oncekiArac) { p.arac = "temiz"; degisen++; }

    // "tamekran" tüm videoda en fazla 3 — fazlası etkisini yok ediyor.
    if (p.arac === "tamekran") {
      if (tamEkranSayisi >= 3) { p.arac = "kose"; degisen++; }
      else tamEkranSayisi++;
    }
    oncekiArac = p.arac;

    // --- GEÇİŞ RİTMİ ---
    // Prompt'ta yazmak yetmiyor; ölçüldüğünde model efektleri fazla dağıtıyor.
    // En güçlü geçiş sert kesmedir, kural onu korumalı.
    if (p.gecis !== "kes") {
      if (p.gecis === oncekiGecis) { p.gecis = "kes"; degisen++; }           // ardışık aynı efekt
      else if (p.gecis === "parlat" && parlatSayisi >= 2) { p.gecis = "kes"; degisen++; }
      else if (p.gecis === "karart" && karartSayisi >= 2) { p.gecis = "eritme"; degisen++; }
      // Efekt oranı tavanı: sahnelerin en fazla üçte biri efektli girsin.
      else if (efektSayisi >= Math.ceil(adet / 3)) { p.gecis = "kes"; degisen++; }
      else {
        efektSayisi++;
        if (p.gecis === "parlat") parlatSayisi++;
        if (p.gecis === "karart") karartSayisi++;
      }
    }
    oncekiGecis = p.gecis;
  }
  if (degisen) logFn(`Kurgu planı ritim kurallarına göre ${degisen} sahnede düzeltildi.`);
}
