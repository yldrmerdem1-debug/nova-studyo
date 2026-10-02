// KAMERA HAREKETİ — karede NE OLDUĞUNA göre, ve plan SÜRESİNE göre.
//
// İKİ AYRI KUSUR, İKİSİ DE ÖLÇÜLDÜ.
//
// 1) HAREKET İÇERİĞE BAKMIYORDU. Her fotoğrafa altı hareketten biri, sırf SIRA
//    NUMARASINA göre atanıyordu (`variants[(i * 7 + 3) % 6]`): bir portre ile
//    bir harita aynı muameleyi görüyordu. Elle kurgulayan biri yüze yaklaşır,
//    manzarada yana kayar, belgede durur, kalabalıkta geri çekilir.
//
// 2) HAREKET SABİT MESAFE VERİYORDU, SABİT HIZ DEĞİL.
//    İfadeler `on/(N-1)` ile normalize edilmişti: toplam yol plan süresinden
//    BAĞIMSIZDI. 4 saniyelik planda da 20 saniyelik planda da kamera aynı
//    mesafeyi kat ediyor, uzun planda hareket kayda değer biçimde yavaşlıyordu.
//
//    DÜRÜSTLÜK NOTU — BU DEĞİŞİKLİK ÖLÇÜLEN DONMAYI AÇIKLAMIYOR.
//    Bitmiş videoda 124,3 saniye donuk kare ölçüldü (%18,5) ve ilk teşhis
//    burasıydı. Ama izole ölçümde ESKİ ifadeler de %0 donuk verdi:
//
//      freezedetect n=-58dB d=0.6, gerçek fotoğraf, 1920x1080/30fps
//      plan boyu:      6sn    10sn    15sn    20sn
//      belge (eski)   0,0%    0,0%    0,0%    0,0%
//      manzara(eski)  0,0%    0,0%    0,0%    0,0%
//      yuz (eski)     0,0%    0,0%    0,0%    0,0%
//
//    Donmanın ölçülebilen kaynağı graphics.js'teki punchZoom'du (aynı testte
//    10 saniyelik planda %48,3). Buradaki değişiklik yine de duruyor çünkü
//    KENDİ BAŞINA doğru: 20 saniyelik bir plan, 4 saniyelik planla aynı yolu
//    kat etmemeli — kare birebir kopya olmasa da izleyici durgunluk hisseder.
//    Ama "donmayı bu düzeltti" DENMEZ; ölçüm onu desteklemiyor.
//
// ÇÖZÜM: hareket artık SANİYE BAŞINA tanımlı. Toplam yol = hız × süre, yani
// uzun planda kamera daha çok yol alır ve kare başına düşen hareket sabit kalır.
// Alt sınır da var: hiçbir plan görünür hareketin altına inemez (bkz. EN_AZ_*).
//
// BURASI SAF: ffmpeg ifadesi üretir, hiçbir şey çalıştırmaz — sınanabilsin diye.

/** Konunun kadrajdaki yerine göre yatay çapa (zoompan x ifadesi). */
const YATAY = {
  // 0 = tamamen sol kenar, (iw-iw/zoom) = tamamen sağ kenar.
  // Uçlara yapıştırmıyoruz: %18/%82 konuyu kadrajda tutarken biraz nefes bırakır.
  sol: `(iw-iw/zoom)*0.18`,
  orta: `(iw-iw/zoom)/2`,
  sag: `(iw-iw/zoom)*0.82`,
};

// HIZLAR — saniye başına. Bunlar ölçümle seçildi, tahminle değil: her değer
// için gerçek ffmpeg zinciri çalıştırılıp mpdecimate ile kopya kare oranına
// bakıldı (bkz. test/kamera.test.mjs). Hedef, 3-20 sn arası HER plan boyunda
// kopya kare oranının %0 çıkması.

/** Yaklaşma/uzaklaşma hızı: saniyede yüzde kaç zoom. */
const ZOOM_HIZ = { yuz: 0.022, nesne: 0.026, belge: 0.010, kalabalik: 0.024, genel: 0.026 };
/** Yatay kayma hızı: saniyede kadrajın kaydırılabilir payının yüzde kaçı. */
const PAN_HIZ = { manzara: 0.075 };

/** Toplam zoom bu kadarı aşmasın — fazlası kırpıp bozuyor. */
const EN_COK_ZOOM = 0.34;

/**
 * Toplam zoom alt sınırı — kısa planda hareket görünmez kalmasın.
 *
 * TÜRE ÖZEL, çünkü tek bir alt sınır "belgede yavaş" niyetini eziyordu: 3
 * saniyelik bir belge planında hız × süre = 0,03 çıkıyor, genel alt sınır 0,07
 * onu yukarı çekiyor ve belge, portreyle aynı hızda yaklaşıyordu.
 *
 * Belgenin alt sınırı daha düşük ama SIFIR DEĞİL — sıfır tam olarak ölçülen
 * kusurun kendisiydi (7,9 saniyelik donuk blok, 99,1-107,0 sn). Yavaş ama
 * sürekli. Değer ölçümle doğrulandı: freezedetect ile %0 donuk kare
 * (bkz. test/kamera.test.mjs).
 */
const EN_AZ_ZOOM = { belge: 0.040, genel: 0.070 };
/** Yatay kaymada kullanılacak payın alt/üst sınırı (0..1). */
const EN_AZ_PAN = 0.28;
const EN_COK_PAN = 1.0;

/** Sayıyı ffmpeg ifadesine yazılabilir hâle getir. */
const s3 = (x) => x.toFixed(3);

/**
 * Bir fotoğraf için zoompan bileşenlerini kur.
 *
 * @param kadraj "yuz" | "manzara" | "belge" | "nesne" | "kalabalik" | "" (bilinmiyor)
 * @param odak   "sol" | "orta" | "sag" | "" (bilinmiyor)
 * @param i      klip sırası — aynı türden ardışık kareler aynı yöne kaymasın diye
 * @param N      kare sayısı
 * @param fps    kare hızı — süreyi buradan çıkarıyoruz (hız × süre = yol)
 * @returns { z, x, y, ad }  ad: günlüğe ve teste görünen hareket adı
 */
export function hareketSec(kadraj, odak, i, N, fps = 30, profile = null) {
  const N1 = Math.max(1, N - 1);
  const linear = `on/${N1}`;
  const p = profile?.camera.easing === 'smooth' ? `((${linear})*(${linear})*(3-2*(${linear})))` : linear;
  const speed = profile?.camera.speed ?? 1;
  const sure = Math.max(0.5, N / Math.max(1, fps));   // saniye
  const yatay = YATAY[odak] || YATAY.orta;
  const dikeyOrta = `(ih-ih/zoom)/2`;
  // Ardışık aynı tür kareler birbirinin kopyası gibi durmasın: yön alternatif.
  const ters = i % 2 === 1;

  // Süreye göre toplam yol. Sınırlar arasına kelepçelenir.
  const zoomYolu = (tur) =>
    Math.min(EN_COK_ZOOM,
      Math.max((EN_AZ_ZOOM[tur] ?? EN_AZ_ZOOM.genel) * speed, (ZOOM_HIZ[tur] ?? ZOOM_HIZ.genel) * sure * speed));
  const panYolu = () =>
    Math.min(EN_COK_PAN, Math.max(EN_AZ_PAN * speed, PAN_HIZ.manzara * sure * speed));

  switch (kadraj) {
    case "yuz": {
      // YAKLAŞ. Yüz kadrajda kalmalı, o yüzden x konunun yanına çapalanır ve
      // hareket boyunca SABİT durur — kayarsa yüz kenardan çıkar.
      // Dikeyde biraz yukarı: yüzler kadrajın üst yarısında oturur.
      const dz = zoomYolu("yuz");
      return { z: `1+${s3(dz)}*${p}`, x: yatay, y: `(ih-ih/zoom)*0.38`, ad: "yüze yaklaşma" };
    }

    case "manzara": {
      // YANA KAY. Yakınlaşmak geniş açıyı öldürür; zoom sabit, hareket yatay.
      // Kayma payı süreye göre büyür: uzun planda daha çok yol, aynı hız.
      const w = panYolu();
      const bas = ters ? s3(w) : "0";
      const yon = ters ? `-${s3(w)}*${p}` : `+${s3(w)}*${p}`;
      return {
        z: `1.14`,
        x: `(iw-iw/zoom)*(${bas}${yon})`,
        y: dikeyOrta,
        ad: ters ? "manzarada sağdan sola" : "manzarada soldan sağa",
      };
    }

    case "belge": {
      // NEREDEYSE DUR. Yazı, harita, gravür: izleyici okuyor. Kayan kamera
      // okumayı imkânsız kılar — ama TAMAMEN durmak da olmaz: ölçülen 7,9
      // saniyelik donuk blok tam olarak bu daldan geliyordu. Yavaş ama SÜREKLİ.
      const dz = zoomYolu("belge");
      return { z: `1.02+${s3(dz)}*${p}`, x: `(iw-iw/zoom)/2`, y: dikeyOrta, ad: "belgede yavaş yaklaşma" };
    }

    case "kalabalik": {
      // GERİ ÇEKİL. Kalabalığın anlamı ÖLÇEK; açılan kadraj onu anlatır.
      const dz = zoomYolu("kalabalik");
      return { z: `${s3(1 + dz)}-${s3(dz)}*${p}`, x: `(iw-iw/zoom)/2`, y: dikeyOrta, ad: "kalabalıktan açılma" };
    }

    case "nesne": {
      // YAKLAŞ, konunun üstünde kal.
      const dz = zoomYolu("nesne");
      return { z: `1+${s3(dz)}*${p}`, x: yatay, y: dikeyOrta, ad: "nesneye yaklaşma" };
    }

    default: {
      // BİLİNMİYOR — denetim çalışmadı ya da alan gelmedi. Sıraya göre değişen
      // genel Ken Burns. Bilgi yokken içerik varsayıp yanlış hareket uygulamaktan
      // iyidir; ama hareketin KENDİSİ yine süreye göre ölçekleniyor.
      const dz = zoomYolu("genel");
      return ters
        ? { z: `${s3(1 + dz)}-${s3(dz)}*${p}`, x: `(iw-iw/zoom)/2`, y: dikeyOrta, ad: "genel uzaklaşma" }
        : { z: `1+${s3(dz)}*${p}`, x: `(iw-iw/zoom)/2`, y: dikeyOrta, ad: "genel yaklaşma" };
    }
  }
}

/**
 * Tam zoompan filtre zinciri.
 *
 * Kaynak 2× büyütülüp lanczos ile küçültülüyor: zoompan tamsayı adımlarla
 * örneklediği için bu, kenar bulanıklığını belirgin azaltıyor. (Ölçüldü:
 * donuk kare oranını değiştirmiyor — titreme başka yerden geliyordu.)
 */
export function kameraFiltresi(kadraj, odak, i, N, fps, kanvas, profile = null) {
  const v = hareketSec(kadraj, odak, i, N, fps, profile);
  return `zoompan=z='${v.z}':x='${v.x}':y='${v.y}':d=${N}:s=${kanvas.w * 2}x${kanvas.h * 2}:fps=${fps}` +
    `,scale=${kanvas.w}:${kanvas.h}:flags=lanczos`;
}
