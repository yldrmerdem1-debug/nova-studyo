// BÖLÜME GÖRE FON MÜZİĞİ.
//
// ESKİ HÂLİ: `pickMusic(job)` video başına TEK parça döndürüyordu ve o parça
// `-stream_loop -1` ile sonuna kadar tekrarlıyordu. Ölçüldü: elimizdeki dört
// yatak parçanın dördü de 4:00 uzunlukta. Yani 12 dakikalık videoda aynı dört
// dakika ÜÇ kez, 20 dakikalıkta BEŞ kez arka arkaya çalıyordu. Haftada bir
// video atan bir kanalda bu tek başına "hep aynı video" hissi veriyor.
//
// YENİ HÂLİ: her bölüm kendi yatağını alır, bölüm sınırlarında çapraz geçiş
// yapılır. Tek videoda 3-4 farklı müzik duyulur.
//
// ROL BİLGİSİ NEDEN KONUMDAN TÜRETİLİYOR: outline şemasında bölüm başına bir
// "rol" alanı isteniyor (script.js) ama o alan script.json'a taşınmıyor —
// bölümlerde yalnızca title/segments var. Üstelik bu hesapta structured
// output zorlanmadığı için model alan adlarını değiştirebiliyor. Konum her
// zaman var ve hiç bozulmuyor: ilk bölüm kanca, son bölüm kapanış, aradakiler
// kurulum/doruk.
import path from "node:path";
import {scoreMoodForSection, scoreProvenanceForFile} from './score-catalog.js';

/**
 * Tema → dört aşamalı yatak akışı: [kanca, kurulum, doruk, kapanis].
 * Anahtarlar dosya adında aranır (yatak-gerilim.mp3 → "gerilim").
 */
export const MUZIK_AKISI = {
  belgesel: ["gerilim", "notr", "derin", "ilham"],
  hikaye: ["gerilim", "notr", "derin", "ilham"],
  haber: ["gerilim", "notr", "gerilim", "notr"],
  analiz: ["notr", "derin", "gerilim", "ilham"],
  vox: ["ilham", "notr", "ilham", "notr"],
  egitim: ["ilham", "notr", "derin", "ilham"],
  top5: ["ilham", "gerilim", "notr", "ilham"],
};
const VARSAYILAN_AKIS = ["gerilim", "notr", "derin", "ilham"];

/**
 * AŞAMA KAZANCI (dB) — akış indeksine göre yatak seviyesi.
 *
 * [kanca, kurulum, doruk, kapanis]. Kanca ve doruk yükselir, kurulum ve
 * kapanış çekilir; böylece video baştan sona tek düzlemde kalmaz.
 * Ölçülen kusur ve gerekçe muzikZinciri() içinde.
 */
export const ASAMA_KAZANC = [2.0, -1.5, 2.5, -1.5];

/** Çapraz geçiş süresi (sn). Bölüm sınırında bir yatak diğerine erir. */
export const CAPRAZ = 3;
/** Bundan kısa bölüm kendi yatağını hak etmez, komşusuna katılır. */
export const EN_KISA_BLOK = 25;
// Girdi sayısı patlamasın: en çok bu kadar ayrı yatak bloğu.
//
// 10'a çıkarıldı: 6 tavanı, havuzda o rolden birden çok parça olduğu hâlde
// uzun videoyu az bloğa sıkıştırıyordu. Ölçüldü — 30 dk / 7 bölüm benzetiminde
// "notr" bloğu 771 saniyeye çıkıyor ve 2:17'lik parça 5,6 kez tekrarlıyordu.
// ffmpeg için 10 girdi ucuz; her biri sadece -stream_loop'lu bir mp3.
export const EN_COK_BLOK = 10;

/** Konum → akış indeksi. İlk bölüm kanca, son bölüm kapanış. */
export function akisIndeksi(i, n) {
  if (n <= 1) return 0;
  if (i === 0) return 0;
  if (i === n - 1) return 3;
  if (n === 3) return 2; // tek orta bölüm doruk olsun; kanca→doruk→kapanış
  const oran = (i - 1) / (n - 2);
  return oran < 0.5 ? 1 : 2;
}

/** Basit, kararlı sayısal özet — aynı iş hep aynı müziği alsın. */
function tohumla(s) {
  let h = 0;
  for (const ch of String(s || "")) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

/**
 * KURULUMLA GELEN YER TUTUCU YATAKLAR — gerçek müzik varken kullanılmazlar.
 *
 * ÖLÇÜLEN KUSUR: bunlar müzik değil, üretilmiş sub-bas drone'lar. Dördü de tam
 * 4:00.02 uzunluğunda, 160 kb/s, aynı boyutta. Ölçüldü:
 *
 *   dosya              spektral merkez   LRA
 *   yatak-derin.mp3          87 Hz       2,4
 *   yatak-notr.mp3           81 Hz       1,6
 *   (gerçek parça)         1042 Hz       6,3
 *
 * 81-87 Hz'de enerjinin tamamına yakını sub-bas'ta kalıyor; telefon ve laptop
 * hoparlörü orayı zaten kesiyor, yani izleyicinin çoğu için SESSİZLİK.
 * Gerçek işte ölçüldü (20260817-b05a7a): beş bölümün ikisi bu drone'lara düştü
 * ve videonun %40'ı pratikte müziksiz kaldı. Kullanıcının 'sesler yetersiz'
 * şikâyetinin kaynağı buydu.
 *
 * Dosyalar silinmez; render planı bunları dışlar ve gerçek müzik eksikliğini
 * kullanıcıya açıkça bildirir. parcaSec eski bağımsız çağrılarla uyumludur.
 */
const YER_TUTUCU = new Set([
  "yatak-derin.mp3", "yatak-gerilim.mp3", "yatak-ilham.mp3", "yatak-notr.mp3",
]);

/** Dosya kurulumla gelen yer tutucu mu? */
export function yerTutucuMu(dosya) {
  return YER_TUTUCU.has(path.win32.basename(String(dosya || "")).toLowerCase());
}

/**
 * Akış anahtarına uyan dosyayı seç.
 *
 * Kullanıcı music/ klasörüne YouTube Audio Library'den rastgele adlı parçalar
 * atarsa hiçbiri "gerilim"/"derin" içermez ve hepsi aynı yedek dala düşerdi —
 * o zaman dört bölüm de aynı parçayı alırdı. `sira` çarpanı yedek dalda bile
 * havuzda farklı yerlere düşürüyor, yani isimsiz parçalarla da çeşitlilik var.
 */
export function parcaSec(anahtar, dosyalar, tohum, sira) {
  const uyan = dosyalar.filter((f) => f.toLowerCase().includes(anahtar));
  // Gerçek parça varken yer tutucu drone seçilmez.
  const gercek = uyan.filter((f) => !yerTutucuMu(f));
  const havuz = gercek.length ? gercek : uyan;
  if (havuz.length) return havuz[tohum % havuz.length];
  const tumGercek = dosyalar.filter((f) => !yerTutucuMu(f));
  const yedek = tumGercek.length ? tumGercek : dosyalar;
  return yedek[(tohum + sira * 7) % yedek.length];
}

/** flat segment listesinden bölüm sürelerini çıkar. */
export function bolumSureleri(flat) {
  const s = [];
  for (const f of flat || []) {
    const i = Number.isFinite(f?.sectionIndex) ? f.sectionIndex : 0;
    s[i] = (s[i] || 0) + (Number(f?.dur) || 0);
  }
  return Array.from(s, (v) => v || 0);
}

/**
 * Bölüm sürelerinden yatak bloklarını kur.
 *
 * İki birleştirme yapılır:
 *   1) Aynı dosyaya düşen ARDIŞIK bölümler tek blok olur — yoksa aynı parça
 *      kendi kendine çapraz geçiş yapar ve izleyici parçanın baştan
 *      başladığını duyar.
 *   2) EN_KISA_BLOK altındaki blok komşusuna katılır — 8 saniyelik bir bölüm
 *      için 3 saniyelik çapraz geçiş bloğun kendisinden uzun olurdu.
 *
 * @returns [{ dosya, sure }] — sure toplamı girdi toplamına eşittir.
 */
export function muzikPlani(job, sureler, dosyalar) {
  dosyalar = (dosyalar || []).filter(f => !yerTutucuMu(f));
  if (!dosyalar?.length) return [];
  const gecerli = (sureler || []).filter((s) => Number(s) > 0);
  if (!gecerli.length) return [];

  const akis = MUZIK_AKISI[job?.theme] || VARSAYILAN_AKIS;
  const tohum = tohumla(job?.id);
  const n = gecerli.length;

  // Aynı role düşen ARDIŞIK bölümler aynı dosyayı almasın: rol başına bir
  // sayaç tutulup havuzda o rolden kaç parça varsa sırayla dolaşılıyor.
  //
  // Gerekçe (ölçüldü): 30 dk / 7 bölümde 2., 3. ve 4. bölümlerin üçü de
  // "notr" rolüne düşüyor. Sayaç olmadan üçü de aynı dosyayı alıp tek bir
  // 771 saniyelik bloğa yapışıyordu — 2:17'lik parça 5,6 kez tekrarlıyor,
  // yani düzeltmeye çalıştığımız monotonluk uzun videoda aynen geri geliyordu.
  // Havuzda o rolden tek parça varsa davranış eskisi gibi (birleşir).
  const kullanim = new Map();
  let oncekiDosya=null;
  let bloklar = gecerli.map((sure, i) => {
    const k = akisIndeksi(i, n);
    const sayac = kullanim.get(k) || 0;
    kullanim.set(k, sayac + 1);
    const katalog=doymusKatalogSec(job,i,n,sure,dosyalar,oncekiDosya);
    if(katalog) {
      oncekiDosya=katalog.file;
      return {dosya:katalog.file,sure,asama:k,provenance:katalog};
    }
    // Aşama da taşınıyor: dinamik kazanç buna göre veriliyor (muzikZinciri).
    const dosya=parcaSec(akis[k], dosyalar, tohum + sayac, k);
    oncekiDosya=dosya;
    return { dosya, sure, asama: k };
  });

  const birlestir = (liste) => {
    const cikti = [];
    for (const b of liste) {
      const son = cikti[cikti.length - 1];
      if (son && son.dosya === b.dosya) son.sure += b.sure;
      else cikti.push({ ...b });   // ...b aşamayı da taşır
    }
    return cikti;
  };

  bloklar = birlestir(bloklar);

  // Kısa blokları komşuya kat. Komşunun dosyası kazanır (daha uzun olan
  // bölümün müziği baskın kalsın diye önce daha uzun komşuya bakılır).
  for (let guvenlik = 0; guvenlik < 50; guvenlik++) {
    if (bloklar.length <= 1) break;
    const i = bloklar.findIndex((b) => b.sure < EN_KISA_BLOK);
    if (i < 0) break;
    const onceki = bloklar[i - 1];
    const sonraki = bloklar[i + 1];
    const hedef = !onceki ? sonraki : !sonraki ? onceki : onceki.sure >= sonraki.sure ? onceki : sonraki;
    hedef.sure += bloklar[i].sure;
    bloklar.splice(i, 1);
    bloklar = birlestir(bloklar);
  }

  // Blok sayısı tavanı: en kısa bloğu komşusuna katarak indir.
  while (bloklar.length > EN_COK_BLOK) {
    let enKisa = 0;
    for (let i = 1; i < bloklar.length; i++) if (bloklar[i].sure < bloklar[enKisa].sure) enKisa = i;
    const onceki = bloklar[enKisa - 1];
    const sonraki = bloklar[enKisa + 1];
    const hedef = !onceki ? sonraki : !sonraki ? onceki : onceki.sure >= sonraki.sure ? onceki : sonraki;
    hedef.sure += bloklar[enKisa].sure;
    bloklar.splice(enKisa, 1);
    bloklar = birlestir(bloklar);
  }

  return bloklar;
}

const AKIS_RUHLARI=['suspenseful dark intense','mysterious somber calm','epic intense dark','uplifting epic mystical'];
const TUR_RUHLARI={haber:'intense suspenseful',analiz:'mysterious somber',egitim:'calming uplifting',vox:'uplifting epic',top5:'driving epic',hikaye:'somber mysterious',belgesel:'epic somber mysterious'};
const YONETMEN_RUHLARI={
  tension:'suspenseful intense dark',
  contemplative:'somber calming mysterious',
  wonder:'mystical',
  resolve:'uplifting',
  neutral:'somber',
};
function doymusKatalogSec(job,index,sectionCount,sure,dosyalar,onceki) {
  const adaylar=dosyalar.map(file=>scoreProvenanceForFile(file)).filter(Boolean);
  if(!adaylar.length) return null;
  const acik=scoreMoodForSection(job,index);
  const acikSozcukler=acik.split(/[^a-z]+/).filter(Boolean);
  const yonetmenSozcukleri=acikSozcukler.flatMap(w=>(YONETMEN_RUHLARI[w]||w).split(' '));
  const rol=AKIS_RUHLARI[akisIndeksi(index,sectionCount)]||'';
  const genel=`${TUR_RUHLARI[job?.theme]||''} ${rol}`.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const yeterli=adaylar.filter(x=>Number(x.duration)>=Number(sure)+CAPRAZ);
  const havuz=yeterli.length?yeterli:adaylar;
  return havuz.slice().sort((a,b)=>{
    const puan=x=>yonetmenSozcukleri.reduce((s,w)=>s+(String(x.composerMood||'').toLowerCase().includes(w)?1:0),0)*100 +
      genel.reduce((s,w)=>s+(String(x.composerMood||'').toLowerCase().includes(w)?1:0),0)*10 +
      (x.file===onceki?-100:0) + Math.min(Number(x.duration)||0,Number(sure)+CAPRAZ)/1000;
    if(!yeterli.length && Number(b.duration)!==Number(a.duration)) return Number(b.duration)-Number(a.duration);
    return puan(b)-puan(a) || a.title.localeCompare(b.title);
  })[0];
}

/**
 * Blok planından ffmpeg girdi listesi + filtre zinciri üret.
 *
 * Her blok AYRI bir `-i` girdisi: aynı dosya iki ayrı blokta geçebiliyor ve
 * bir girdi akışı asplit olmadan iki yerde kullanılamıyor. Blok sayısı en çok
 * EN_COK_BLOK olduğu için girdi sayısı da sınırlı.
 *
 * Her girdi `-stream_loop -1` ile sonsuz; `atrim` onu bloğun boyuna kesiyor.
 * Bu sayede 4 dakikalık parça 7 dakikalık bir bölümü de doldurabiliyor.
 *
 * Zincirin ÇIKIŞI [mus] etiketi — ducking ve amix çağıran tarafta kalıyor.
 */
export function muzikZinciri(bloklar, { narration, musicVolume, toplamSure, profile = null, sectionDurations = [] }) {
  const girdiler = ["-i", narration];
  for (const b of bloklar) girdiler.push("-stream_loop", "-1", "-i", b.dosya);

  const cikisBas = Math.max(0, (toplamSure || 0) - 3.5).toFixed(2);
  const parcalar = [];
  const sections = sectionDurations.filter(x=>Number.isFinite(x)&&x>0);
  let dynamics = '';
  if(profile && sections.length) {
    const gains=sections.map((_,i)=>Math.pow(10,(profile.music.stageGain[akisIndeksi(i,sections.length)] || 0)/20));
    // Smooth chapter level changes independent of track boundaries: no restart needed.
    let at=0,expression=gains[0].toFixed(5);
    for(let i=1;i<sections.length;i++) {
      at+=sections[i-1];
      const change=gains[i]-gains[i-1],ramp=Math.min(2,sections[i]);
      expression+=`+(${change.toFixed(5)})*clip((t-${at.toFixed(3)})/${ramp.toFixed(3)},0,1)`;
    }
    dynamics=`volume='${expression}':eval=frame,`;
  }

  bloklar.forEach((b, i) => {
    // Çapraz geçiş her iki taraftan CAPRAZ saniye yiyor; blokları o kadar
    // uzun kesip farkı geçişe veriyoruz ki toplam süre korunsun.
    const boy = (b.sure + (bloklar.length > 1 ? CAPRAZ : 0)).toFixed(3);
    // Sabit kazanç: dışarıdan atılan parçalar kurulum yataklarıyla aynı güce
    // gelsin (bkz. muzikseviye.js). Ölçüm yoksa kazanç 0, filtre hiç eklenmez.
    // AŞAMA KAZANCI — videonun tamamı tek düzlemde kalmasın.
    //
    // ÖLÇÜLEN KUSUR (20260817-b05a7a): programın LRA'sı 2,2 LU ve BEŞ BÖLÜMÜN
    // BEŞİ de aynı çıktı (B1 2,5 · B2 2,0 · B3 2,1 · B4 2,0 · B5 2,0). Kanca,
    // doruk ve kapanış kulakta birbirinden ayrılmıyor; uzun videoda dinleme
    // yorgunluğu yapıyor.
    //
    // Yatak, akış aşamasına göre yükselip alçalıyor: kanca ve doruk yukarı,
    // kurulum ve kapanış aşağı. Değerler küçük tutuldu (±2 dB) — anlatım
    // müziğin ~16 dB üstünde olduğu için fazlası sözü örter.
    //
    // DÜRÜSTLÜK NOTU: bunun program LRA'sını ölçülebilir biçimde yükseltip
    // yükseltmeyeceği DOĞRULANMADI. Program konuşma ağırlıklı; ±2 dB müzik
    // hareketi kulakta hissedilir ama LRA rakamını az oynatabilir. Sonraki
    // videoda bölüm bölüm ölçülecek.
    const asamaKazanc = dynamics ? 0 : ((profile?.music.stageGain || ASAMA_KAZANC)[b.asama] ?? 0);
    const kz = (Number(b.kazanc) || 0) + asamaKazanc;
    const seviye = Number.isFinite(kz) && Math.abs(kz) >= 0.1 ? `volume=${kz.toFixed(1)}dB,` : "";
    parcalar.push(
      `[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,${seviye}` +
        `atrim=0:${boy},asetpts=N/SR/TB[m${i}]`
    );
  });

  let son = "m0";
  for (let i = 1; i < bloklar.length; i++) {
    const yeni = `x${i}`;
    parcalar.push(`[${son}][m${i}]acrossfade=d=${CAPRAZ}:c1=tri:c2=tri[${yeni}]`);
    son = yeni;
  }

  parcalar.push(
    `[${son}]${dynamics}afade=t=in:st=0:d=2.5,afade=t=out:st=${cikisBas}:d=3.5,` +
      `atrim=0:${Number(toplamSure).toFixed(3)},volume=${Math.max(0,Number(musicVolume) || 0) * (profile?.music.level ?? 1)}[mus]`
  );

  return { girdiler, muzikZinciri: parcalar.join(";") };
}
