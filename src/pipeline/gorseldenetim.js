// GÖRSEL DENETİMİ — indirilen fotoğraf gerçekten ne gösteriyor?
//
// NEDEN VAR:
// Alaka, sağlayıcının yazdığı başlık ve etiketlerden ölçülüyordu. Gerçek bir işte
// ölçüldüğünde bu eksenin doğruyla yanlışı ayıramadığı görüldü:
//
//   0.264  "Mount Everest summit aerial"        -> Everest fotoğrafı        (DOĞRU)
//   0.260  "Trieste bathyscaphe 1960 Piccard"   -> Şarm El Şeyh tatil resifi (YANLIŞ)
//
// İki puan neredeyse aynı. Eşik nereye konursa konsun biri yanlış tarafta kalır.
// "kathy, cat, maine coon, portrait" etiketli bir KEDİ, "Kathy Sullivan astronaut
// portrait" sorgusuna metin ekseninde rahatça geçiyordu ve videoda gerçekten
// köşede duruyordu. Rus marka bir bahçe dalgıç pompası, "submersible" kelimesi
// yüzünden "Deepsea Challenger submersible 2012" sahnesinin tam ekran arka planı
// oldu.
//
// Kesinliği ancak GÖRSELE BAKMAK verir. Bu modül indirilen her görseli küçültüp
// (yerel ffmpeg, ücretsiz) modele sorar: "bu fotoğraf şunu gösteriyor mu?"
// Maliyet küçük modelle iş başına birkaç kuruş; karşılığında ekrandaki her
// görselin ne olduğu ölçülmüş oluyor.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { callVisionJSON } from "../llm.js";
import { getSettings } from "../config.js";
import { run, mapLimit, downloadFile, ffprobeDuration } from "../util.js";

// İKİ KADEMELİ EŞİK (0..3 ölçeği).
//
// Tek eşik yanlış sonuç veriyor. Ölçüldü: gerçek bir işte 21 görselin 15'i
// "2" eşiğinin altında kaldı; hepsi elenirse sahnelerin çoğu renk zeminine
// düşer ve video çıplak kalır. Ama bu 15'in çoğu "zayıf ama konuyla ilgili"
// (puan 1) — tam ekran arka plan olarak düz renkten iyidir.
//
// Kenardaki küçük öğe farklı: hiçbir şey anlatmıyorsa ekranda durmasının
// anlamı yok, üstelik izleyici tam ona takılıyor (kullanıcının şikâyeti).
// Oraya sadece gerçekten uyan görsel konur.

/** Kenardaki kesik için: en az "kabul edilebilir" olmalı. */
export const GORSEL_ESIGI = 2;

/** Tam ekran arka plan için: yalnızca "hiç ilgisi yok" (0) reddedilir. */
export const ARKA_GORSEL_ESIGI = 1;

// KALİTE — ALAKADAN AYRI BİR EKSEN.
//
// Alaka tek başına yetmiyor. Gerçek vaka (volkan videosu, 217. saniye):
// termal kamera MONİTÖRÜNÜN eğik çekilmiş videosu. Konuyla birebir alakalı
// olduğu için denetimden 3 (tam isabet) aldı ve tam ekran arka plan oldu.
// Ama kadrajın sağ yarısı karanlık boş oda, sol yarısı yanmış sarı bir ekran:
// izleyici için okunaksız. "Doğru konu" ile "ekranda iyi durur" aynı şey değil.
//
// Bu yüzden model artık iki ayrı puan veriyor. Eşikler alakadan gevşek tutuldu:
// amaç kötü kadrajı elemek, mükemmeliyetçilik yapmak değil.

/** Tam ekran arka plan için: yalnızca "kullanılamaz" (0) reddedilir. */
export const ARKA_KALITE_ESIGI = 1;

/** Kenardaki küçük kesik için: küçülünce okunaklı kalmalı. */
export const KESIK_KALITE_ESIGI = 2;

const SEMA = {
  type: "object",
  properties: {
    sonuclar: {
      type: "array",
      items: {
        type: "object",
        properties: {
          no: { type: "integer", description: "Görselin sıra numarası (1'den başlar)" },
          puan: {
            type: "integer",
            description: "ALAKA: 0 = konuyla hiç ilgisi yok, 1 = zayıf/dolaylı, 2 = kabul edilebilir, 3 = tam isabet",
          },
          kalite: {
            type: "integer",
            description: "KALİTE: 0 = tam ekran kullanılamaz, 1 = zayıf kadraj, 2 = kullanılabilir, 3 = temiz ve net",
          },
          gorunen: { type: "string", description: "Fotoğrafta gerçekte ne var — en fazla 8 kelime" },
          // KAMERA HAREKETİ İÇİN. Model zaten bu karenin önünde; nerede
          // durduğunu da söylemesi ek maliyet getirmiyor (bkz. kamera.js).
          kadraj: {
            type: "string",
            enum: ["yuz", "manzara", "belge", "nesne", "kalabalik"],
            description: "Kare türü: yuz=portre/insan yakın | manzara=geniş açı yer/doğa/şehir | " +
              "belge=yazı, harita, gravür, tablo, ekran | nesne=tek bir şey yakından | kalabalik=çok insan",
          },
          // YER KİMLİĞİ — ölçülen en zararlı kusur. Denetim "aynı türden başka
          // bir yeri" tam isabet sayıyordu: Truva kazısı sorgusuna gelen
          // Florida'daki Kızılderili mezarlığı 3/3 aldı (20260817-b05a7a).
          yer: {
            type: "string",
            enum: ["dogru", "belirsiz", "baska", "yok"],
            description: "Sorguda adı geçen YER bu fotoğrafta mı? dogru=evet, kanıt var | " +
              "belirsiz=kanıt yok | baska=açıkça başka bir yer | yok=sorguda adlı yer yok",
          },
          odak: {
            type: "string",
            enum: ["sol", "orta", "sag"],
            description: "Kareyi üçe böl: asıl konunun ağırlık merkezi hangi dilimde? " +
              "Konum ölçümüdür. 'orta' yalnızca konu gerçekten ortadaysa ya da kareye " +
              "eşit yayılmışsa doğrudur; emin olunmadığı için 'orta' yazılmaz.",
          },
          akis: {
            type: "string",
            enum: ["sola", "saga", "yaklas", "uzaklas", "sabit", "karisik", "bilinmiyor"],
            description: "Video şeridinde baskın kamera/konu hareketi. Fotoğrafta sabit.",
          },
          videoTutarlilik: {
            type: "integer",
            description: "Üç video karesinin aynı olayı/konuyu sürdürme puanı: 0-3. Fotoğrafta 3.",
          },
        },
        required: ["no", "puan", "kalite", "gorunen", "kadraj", "odak", "yer", "akis", "videoTutarlilik"],
      },
    },
  },
  required: ["sonuclar"],
};

const SISTEM = `Sen bir belgesel yapımında görsel seçimini denetleyen kurgu asistanısın.
Sana fotoğraflar veriliyor. Her fotoğrafla birlikte iki şey görüyorsun:
  ANLATILAN — o an seslendirmede söylenen cümle. ASIL ÖLÇÜT BUDUR.
  ARANMA AMACI — o fotoğrafı bulmak için kullanılan İngilizce sorgu (ipucu).

Görevin: fotoğraf, O AN SÖYLENENİ izleyiciye gösteriyor mu — dürüstçe puanla.

Bir görselin etiketinde VİDEO ŞERİDİ yazıyorsa o tek fotoğraf değildir: soldan
sağa videonun başlangıç, orta ve sonundan alınmış üç karedir. Üç kareyi birlikte
değerlendir. Başta doğru olup sonra başka konuya geçen, yazı/logo dolduran veya
görüntüsü bozulan klibi yüksek puanlama.

SORGUYA DEĞİL, ANLATILANA BAK. Bir fotoğraf sorguya birebir uyup yine de
izleyiciye alakasız gelebilir; ölçüt izleyicinin o an duyduğu cümledir.
Gerçek vaka: sorgu "Neuralink N1 implant coin size", gelen fotoğraf bir uzay
görüntüsü, o an söylenen cümle ise "zihin kontrolünü unut, asıl tehlike daha
sıradan" idi. Sorgu ekseninde tartışılabilir, ANLATILAN ekseninde 0.
ANLATILAN boş geldiyse yalnızca sorguya göre puanla.

PUANLAMA
3 = fotoğraf, anlatılan cümledeki kişiyi/yeri/nesneyi/olayı doğrudan gösteriyor
2 = doğru konuda, anlatılanı destekleyen kabul edilebilir bir görsel (yanıltmaz)
1 = yalnızca yüzeysel/kelime düzeyinde ilgi var, izleyiciyi yanıltır
0 = anlatılanla hiçbir ilgisi yok

CÜMLEDE GEÇEN KELİMEYİ GÖSTERMEK, SAHNEYİ GÖSTERMEK DEĞİLDİR.
Bir isim cümlede yalnızca ÖLÇÜ BİRİMİ ya da BENZETME olarak geçiyorsa, o ismin
fotoğrafı sahneyi anlatmaz — en fazla 1'dir. Kurguda bunun adı "kelime tetikli
kesme"dir ve izleyici onu anahtar kelime slayt gösterisi olarak okur.
Gerçek vaka: konu bağırsak gazının hacmiydi, cümlede "bir uçağın yaktığı yakıt
kadar" geçiyordu, gelen görsel bir UÇAKTI. Sahnenin konusu uçak değil gaz: 1.

İSTİSNA — benzetme cümlenin VURGUSU ise, onu göstermek doğrudur ve 3 alır.
"413.000 metreküp, iki Hindenburg eder" cümlesinde Hindenburg fotoğrafı 3'tür:
rakamın izleyiciye anlam kazandığı yer orasıdır.

Ayırt etme sorusu: bu görsel olmasa izleyici bir şey kaybeder mi?
Kaybetmiyorsa, kelime tutsa bile 1.

════════════════════════════════════════════════════════════════════
AYNI TÜRDEN BAŞKA BİR YER, O YER DEĞİLDİR. BU EN SIK YAPILAN HATA.
════════════════════════════════════════════════════════════════════
Sorguda ADI GEÇEN bir yer varsa, önce şunu sor: bu fotoğraf O YERİ mi
gösteriyor, yoksa aynı TÜRDEN başka bir yeri mi? Cevap "başka yer" ise
puan EN FAZLA 1'dir — fotoğraf ne kadar güzel, ne kadar konuyla ilgili
türde olursa olsun.

Gerçek vakalar (hepsi Truva belgeselinden, hepsi 2 veya 3 almıştı):
  "Troy VIIa arrowheads hasty burial skeleton"
      -> Fountain of Youth, Indian Burial Ground, St. Augustine, FLORIDA
      Bir kazı alanı. Ama Anadolu'da değil, Amerika'da. DOĞRUSU: 1
  "Hisarlik mound Troy ruins today"
      -> Karak, Amman'ın 79 mil güneyi, ÜRDÜN
      Bir höyük/kale. Ama Truva değil, Haçlı kalesi. DOĞRUSU: 1
  "Troy VIIa burnt bones excavation"
      -> Tell Beit Mirsim, FİLİSTİN
      Bir kazı. Ama başka ülkede, başka dönem. DOĞRUSU: 1
  "Library of Alexandria engraving"
      -> "On the road between Washington & Alexandria" (Virginia, ABD)
      Yalnızca kelime tutuyor. DOĞRUSU: 0

Kural şöyle işler:
  Sorguda özel adlı bir YER geçiyor mu?  (Truva, Hisarlık, İskenderiye,
  Pompeii, Machu Picchu, Stonehenge, bir müze, bir şehir, bir ülke...)
     HAYIR -> bu kural işlemez, normal puanla.
     EVET  -> fotoğrafın gerçekten O yer olduğuna dair kanıt var mı?
              (başlıkta/açıklamada o yerin adı, tanınır bir yapı, yazıt)
        Kanıt VAR       -> normal puanla, 3 vermekten çekinme.
        Kanıt YOK       -> en fazla 1.
        Başka yer OLDUĞU belli -> 0.

"Doğru türde ama yanlış yer" tuzağı, sıradan alakasızlıktan DAHA ZARARLI:
izleyici belgeselin ona Truva'yı gösterdiğini sanır. Yanlış bilgi verir.
Aynı mantık DÖNEM için de geçerli: Tunç Çağı anlatılırken ortaçağ el
yazması ya da modern beton bina en fazla 1'dir.

"yer" alanına kararını yaz: "dogru" (o yer), "belirsiz" (kanıt yok),
"baska" (açıkça başka bir yer), "yok" (sorguda adlı yer geçmiyor).

KATI OL. Şu tuzaklara dikkat et — hepsi gerçek vakadır:
- "submersible" sorgusuna gelen bir BAHÇE DALGIÇ POMPASI: 0
- "Kathy Sullivan astronaut portrait" sorgusuna gelen bir KEDİ: 0
- "pressure hull test" sorgusuna gelen TANSİYON ALETİ: 0
- "HMS Challenger 1875 expedition" sorgusuna gelen DAĞ TIRMANIŞI: 0
- "James Cameron submersible" sorgusuna gelen KOL SAATİ: 0
- Ürün fotoğrafı, marka logosu, stok "iş insanı" görseli, ekran görüntüsü:
  belgesel sahnesi değildir, en fazla 1.
Doğru konudaki gerçek bir manzara/nesne/arşiv fotoğrafına 2-3 vermekten çekinme.

MÜZEDEKİ ESER İKİ FARKLI ŞEY OLABİLİR — AYIR.
Burada tek bir kural vardı ("sergi/galeri fotoğrafı en fazla 1") ve yanlış
tarafa kesiyordu. Ölçüldü (20260817-b05a7a, Truva videosu): "Achilles ancient
Greek statue" sorgusuna gelen MÜZEDEKİ AKHİLLEUS HEYKELİ 1 aldı. Oysa antik
çağda o heykel konunun KENDİSİDİR; başka bir kaydı yoktur.

  ESERİN KENDİSİ anlatılıyorsa (heykel, rölyef, vazo, tablet, el yazması,
  sikke, tablo, mozaik, silah, takı) müzede çekilmiş olması KUSUR DEĞİLDİR.
  Normal puanla — 3 vermekten çekinme. Antik tarih, arkeoloji ve sanat
  konularında serbest lisanslı tek kayıt çoğu zaman müze fotoğrafıdır.

  VİTRİN BAŞKA BİR ŞEYİN YERİNE geçiyorsa en fazla 1. Anlatılan bir KİŞİ ya
  da bir YER ise, onun müzesindeki vitrin o kişiyi/yeri göstermez. Gerçek
  vaka: "Baba Vanga portrait photograph" sorgusuna gelen müze vitrini 0'dır —
  izleyicinin görmek istediği kadının yüzüydü.

Ölçüt yine aynı: anlatılan şey ekranda GÖRÜNÜYOR mu? Eser anlatılıyorsa ve
eser görünüyorsa, arkasındaki cam ya da müze duvarı puanı düşürmez.

SORGU BİR KİŞİYİ ADIYLA ANIYORSA, O KİŞİNİN YÜZÜ EN DEĞERLİ ŞEYDİR.
Yüzü GÖRÜNÜYORSA 3 ver — taşıyıcı ne olursa olsun:
kimlik belgesi, pasaport, sınır geçiş kâğıdı, gazete kupürü, kitap kapağı,
duvardaki tablo, anıt üstündeki madalyon, aile albümü sayfası. Hepsi geçer.
"Fotoğraf değil, belge/gravür/tablo" diye puan KIRMA — izleyicinin görmek
istediği o yüzdür ve tarihî kişilerde çoğu zaman tek kaynak budur.
Buna karşılık kişi adına bağlı ama kişiyi GÖSTERMEYEN şeyler en fazla 1'dir:
mezarı, evi, büstünün uzaktan çekilmiş bahçe fotoğrafı, adını taşıyan çeşme
ya da pompa, müzesindeki vitrin. Gerçek vaka: "Baba Vanga portrait photograph"
sorgusunda ilk 21 adayın 7'si onun adını taşıyan bir BAHÇE POMPASIYDI; hepsi 0.

AYRICA KALİTE PUANI VER — bu ALAKADAN BAĞIMSIZDIR.
Soru şu: bu görsel 1920x1080 TAM EKRAN arka plan olarak iyi durur mu?
3 = temiz, net, iyi kadrajlanmış; konu kareyi dolduruyor
2 = kullanılabilir; küçük kusurları var ama izleyiciyi rahatsız etmez
1 = zayıf: kadrajın büyük bölümü boş/ölü alan, bulanık, aşırı yanmış,
    bir EKRANDAN/MONİTÖRDEN çekilmiş, eğik, ağır sıkıştırma bozuğu
0 = tam ekran kullanılamaz

Gerçek vaka: termal kamera MONİTÖRÜNÜN eğik çekilmiş videosu — konu birebir
doğruydu (alaka 3) ama sağ yarısı karanlık boş odaydı, sol yarısı yanmış sarı
bir ekrandı. Alaka 3, KALİTE 1. İki puanı birbirine karıştırma.
Konusu yanlış ama fotoğrafı güzel bir görsel: alaka 0, kalite 3. Bu da olur.

"gorunen" alanına fotoğrafta NE GÖRDÜĞÜNÜ yaz (sorguyu tekrarlama).

SON İKİ ALAN KAMERA HAREKETİ İÇİN — puanla ilgisi yok, hep doldur.
Kurgucu bu karenin üstünde nasıl bir hareket yapacağına buradan karar veriyor.

"kadraj" — bu ne tür bir kare:
  yuz       = bir insanın yüzü/portresi belirgin, kare onunla dolu
  manzara   = geniş açı: şehir, doğa, bina dışı, kalabalık olmayan mekân
  belge     = yazı, harita, gravür, tablo, gazete, çizim, ekran görüntüsü
  nesne     = tek bir şey yakından: alet, cihaz, eser, hayvan, yiyecek
  kalabalik = çok sayıda insan, tören, sokak dolusu, salon dolusu

"odak" — KAREYİ ÜÇE BÖL, asıl konunun ağırlık merkezi hangi dilimde?
  sol  = konu sol üçtebirde  |  orta = orta üçtebirde  |  sag = sağ üçtebirde

Bu bir KONUM ölçümüdür, bir yorum değil. Bakışını karenin üstünde gezdir ve
konunun nerede durduğunu söyle. Fotoğrafçılar konuyu bilerek yana yerleştirir
(üçler kuralı); gerçek fotoğrafların önemli bir bölümünde konu ortada DEĞİLDİR.

"orta" yalnızca konu gerçekten ortadaysa ya da kareye eşit yayılmışsa
(geniş manzara, kalabalık, desen) doğrudur. Emin olamadığın için "orta"
YAZMA — ölçüldü: 98 karenin 96'sına "orta" dendi ve bu, kameranın konuyu
kadrajda tutmasını engelledi.

VİDEO ŞERİDİ için iki alan daha doldur:
  "akis" = üç kare boyunca baskın yön: sola, saga, yaklas, uzaklas, sabit,
           karisik veya bilinmiyor.
  "videoTutarlilik" = 3: üç kare de anlatılan aynı şeyi sürdürüyor;
                      2: küçük sapma var ama klip kullanılabilir;
                      1: klip ortasında konu/kadraj belirgin değişiyor;
                      0: kareler ilgisiz, bozuk, siyah veya yanıltıcı.
Fotoğraf için akis="sabit" ve videoTutarlilik=3 yaz.

Bu alanları ASLA boş bırakma.`;

/**
 * ADAYLARI KÜÇÜK RESİMDEN DENETLE — indirmeden önce.
 *
 * Kullanıcı "önce görselleri göster, sonra başlat" dediğinde seçim ekranının
 * yalnızca fotoğrafları dizmesi yetmiyor; hangisinin YANLIŞ olduğunu da
 * söylemeli. Tam dosyayı indirmeyi beklemek gereksiz — sağlayıcının küçük
 * resmi (thumb) bu iş için fazlasıyla yeterli ve saniyeler içinde geliyor.
 *
 * @param secilenler [{beatId, url, sorgu}]
 * @returns beatId -> {puan, gorunen}
 */
export async function adaylariDenetle(secilenler, { logFn = () => {}, isCancelled = () => false, usage, boyut = DENETIM_BOYUT, cumleler = {} } = {}) {
  const uygun = secilenler.filter((s) => s?.url && s?.beatId);
  if (!uygun.length) return {};
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-aday-"));
  try {
    const st = getSettings();
    // Küçük resmi indir + JPEG'e normalize et (PNG/WEBP gelebiliyor).
    const inen = await mapLimit(uygun, 6, async (s) => {
      if (isCancelled()) throw new Error("cancelled");
      const ham = path.join(tmp, s.beatId + ".bin");
      await downloadFile(s.url, ham, { timeoutMs: 25000 });
      const jpg = path.join(tmp, s.beatId + ".jpg");
      await run(st.ffmpegPath, ["-y", "-i", ham, "-frames:v", "1",
        "-vf", `scale=${boyut}:${boyut}:force_original_aspect_ratio=decrease`, "-q:v", "6", jpg], { timeoutMs: 45000 });
      return { beatId: s.beatId, file: jpg, type: "image", sorgu: s.sorgu };
    });
    const hazir = inen.filter((r) => r.ok).map((r) => r.value);
    if (hazir.length < uygun.length) logFn(`${uygun.length - hazir.length} aday görseli indirilemedi, denetim dışı kaldı.`);
    if (!hazir.length) return {};
    const media = {}; const sorgular = {};
    for (const h of hazir) { media[h.beatId] = h; sorgular[h.beatId] = h.sorgu; }
    return await gorselleriDenetle(media, sorgular, { logFn, isCancelled, usage, cumleler });
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

/**
 * DENETİM ÇÖZÜNÜRLÜĞÜ — ön sıralamayla AYNI olmalı.
 *
 * Burası 384'tü, ön sıralama ise 640'a bakıyordu ve gerekçesi de yazılıydı:
 * "384 pikselde Baba Vanga'nın belgesindeki vesikalık ~40 piksel kalıyor,
 * model yüzü göremiyor". Yani bu modülün kendi ölçümü 384'ün yetmediğini
 * söylüyordu ama ASIL denetim hâlâ 384'te bakıyordu.
 *
 * Sonucu ölçüldü (20260815-07e514, 62 sahne): aynı görsele iki bakış
 * 31 kez AYNI, 18 kez DÜŞÜK, 13 kez YÜKSEK puan verdi. Yani kalite rakamının
 * yarısı gürültüydü ve boru hattı o gürültüye bakıp yedek arıyor, AI parası
 * harcıyordu. İki bakışın aynı çözünürlükte olması bunun ilk şartı.
 */
export const DENETIM_BOYUT = 640;

/** Videonun tek bir iyi karesine aldanmamak için baş/orta/son örnekleri. */
export function videoSampleTimes(durationSec) {
  const duration = Math.max(0.3, Number(durationSec) || 3);
  const pad = Math.min(1, Math.max(0.05, duration * 0.15));
  return [pad, duration / 2, duration - pad].map((n) => Number(n.toFixed(3)));
}

/**
 * Denetim önizlemesi üretir. Videolar 3 x DENETIM_BOYUT piksel baş/orta/son şerididir;
 * böylece model bütün klibi tek istekte görür. Şerit üretilemezse tek kareye
 * düşer ve sonuç `frames:1` ile işaretlenir; bu klip aşağıda güvenli sayılmaz.
 */
export async function makeAuditPreview(ffmpeg, ffprobe, src, tur, dest, boyut = DENETIM_BOYUT, knownDuration) {
  if (tur !== "video") {
    await run(ffmpeg, ["-y", "-i", src, "-frames:v", "1",
      "-vf", `scale=${boyut}:${boyut}:force_original_aspect_ratio=decrease`,
      "-q:v", "6", dest], { timeoutMs: 60000 });
    return { file: dest, frames: 1, sampleTimes: [] };
  }

  const probed = Number(knownDuration) > 0 ? Number(knownDuration) : await ffprobeDuration(ffprobe, src);
  const sampleTimes = videoSampleTimes(probed);
  const panelHeight = Math.max(2, Math.round(boyut * 9 / 16 / 2) * 2);
  const args = ["-y"];
  for (const second of sampleTimes) args.push("-ss", second.toFixed(3), "-i", src);
  const panels = sampleTimes.map((_, i) =>
    `[${i}:v]scale=${boyut}:${panelHeight}:force_original_aspect_ratio=decrease,` +
    `pad=${boyut}:${panelHeight}:(ow-iw)/2:(oh-ih)/2:black[v${i}]`).join(";");
  args.push("-filter_complex", `${panels};[v0][v1][v2]hstack=inputs=3[out]`,
    "-map", "[out]", "-frames:v", "1", "-q:v", "5", dest);
  try {
    await run(ffmpeg, args, { timeoutMs: 90000 });
    return { file: dest, frames: 3, sampleTimes };
  } catch {
    await run(ffmpeg, ["-y", "-ss", sampleTimes[1].toFixed(3), "-i", src,
      "-frames:v", "1", "-vf", `scale=${boyut}:${panelHeight}:force_original_aspect_ratio=decrease`,
      "-q:v", "6", dest], { timeoutMs: 60000 });
    return { file: dest, frames: 1, sampleTimes: [sampleTimes[1]] };
  }
}

/** Üç bakışın ortancası — tek uç değer kararı belirlemesin. */
export function ortanca(sayilar) {
  const a = sayilar.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (!a.length) return null;
  return a[Math.floor(a.length / 2)];
}

/**
 * media haritasındaki her görseli denetler.
 * @returns {Object} beatId -> {puan, gorunen}  (denetlenemeyenler haritada olmaz)
 */
/**
 * İki bakış bu kadar ayrılırsa "çelişki" sayılır ve üçüncü kez sorulur.
 *
 * 2 seçildi çünkü 1 puanlık fark komşu kategoriler arasındaki normal
 * kararsızlıktır (2 = kabul edilebilir, 3 = tam isabet — ikisi de kullanılır).
 * 2 puanlık fark ise kararı DEĞİŞTİRİYOR: 3 ile 1 arasındaki fark, görselin
 * ekranda kalmasıyla yerine yedek aranması arasındaki farktır.
 */
export const CEKISME_FARKI = 2;

/** Kamera hareketini belirleyen kare türleri (bkz. kamera.js). */
export const KADRAJ_TURLERI = new Set(["yuz", "manzara", "belge", "nesne", "kalabalik"]);
/** Asıl konunun kadrajdaki yeri. */
export const ODAK_YONLERI = new Set(["sol", "orta", "sag"]);
/** Videodaki baskın hareket; geçiş yönü buna göre seçilir. */
export const AKIS_YONLERI = new Set(["sola", "saga", "yaklas", "uzaklas", "sabit", "karisik", "bilinmiyor"]);

/**
 * YER KİMLİĞİ — ölçülen en zararlı kusur.
 *
 * Denetim "aynı türden başka bir yeri" tam isabet sayıyordu. Truva belgeselinde
 * ölçüldü (20260817-b05a7a), üçü de ekrana çıktı:
 *
 *   "Troy VIIa arrowheads hasty burial skeleton"
 *       -> Fountain of Youth, Indian Burial Ground, St. Augustine, FLORIDA  (3/3)
 *   "Hisarlik mound Troy ruins today"
 *       -> Karak, Amman'ın 79 mil güneyi, ÜRDÜN                             (3/3)
 *   "Troy VIIa burnt bones excavation"
 *       -> Tell Beit Mirsim, FİLİSTİN                                       (2/3)
 *
 * Model "bir kazı alanı" görüyor ve tam isabet diyor. Bu, sıradan
 * alakasızlıktan DAHA ZARARLI: izleyici belgeselin ona Truva'yı gösterdiğini
 * sanır, yani video YANLIŞ BİLGİ verir.
 */
export const YER_KARARLARI = new Set(["dogru", "belirsiz", "baska", "yok"]);

/** Model "başka yer" dediyse puan bunu aşamaz — kendi kararıyla çelişemez. */
export const YANLIS_YER_TAVANI = 1;

export async function gorselleriDenetle(media, sorgular, { logFn = () => {}, isCancelled = () => false, usage, cumleler = {}, onPuanlar = {} } = {}) {
  const st = getSettings();
  const liste = Object.values(media).filter((m) => m?.file && (m.type === "image" || m.type === "video"));
  if (!liste.length) return {};

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nova-denetim-"));
  try {
    // 1) küçült (yerel, paralel, ücretsiz)
    const kucukler = await mapLimit(liste, 6, async (m) => {
      if (isCancelled()) throw new Error("cancelled");
      const dest = path.join(tmp, m.beatId + ".jpg");
      const preview = await makeAuditPreview(st.ffmpegPath, st.ffprobePath, m.file, m.type, dest, DENETIM_BOYUT, m.duration);
      return {
        beatId: m.beatId, jpg: dest,
        tur: m.type,
        previewFrames: preview.frames,
        sorgu: sorgular[m.beatId] || m.sorgu || "",
        // ASIL ÖLÇÜT: o an seslendirmede söylenen cümle. Sorgu yalnızca ipucu.
        cumle: cumleler[m.beatId] || "",
      };
    });
    const hazir = kucukler.filter((r) => r.ok).map((r) => r.value);
    if (!hazir.length) return {};

    // 2) partiler hâlinde sor (istek başına 6 görsel — hem ucuz hem model odaklı kalıyor)
    const PARTI = 6;
    const partile = (l) => {
      const p = [];
      for (let i = 0; i < l.length; i += PARTI) p.push(l.slice(i, i + PARTI));
      return p;
    };

    // Soru turu ayrı bir işlev: çelişkili görseller için ikinci kez çağrılıyor.
    // Parametre adı BİLEREK "sorulacak": aşağıdaki parti gövdesinde modelin
    // yanıtı da `kayitlar` adıyla okunuyor ve dıştaki adı gölgeliyordu.
    // Günlükte "Üçüncü bakış: 12/6" gibi anlamsız satırlar çıkıyordu (18
    // görselden 6'lık bir yanıt dizisinin uzunluğu payda olarak yazılıyordu).
    const sor = async (sorulacak, hedef, ilerlemeAdi) => {
    const partiler = partile(sorulacak);
    let bitti = 0;
    const sonuc = await mapLimit(partiler, 3, async (parti) => {
      if (isCancelled()) throw new Error("cancelled");
      const images = parti.map((p, i) => ({
        // ANLATILAN önce yazılıyor: model neyi ölçüt alacağını en başta görsün.
        // Cümle yoksa satır hiç eklenmiyor — boş bir "ANLATILAN:" satırı
        // modeli "ölçüt yok" diye yanıltırdı.
        etiket: `${p.tur === "video" ? "VİDEO ŞERİDİ" : "GÖRSEL"} ${i + 1}` +
          (p.cumle ? `\n  ANLATILAN: "${String(p.cumle).slice(0, 220)}"` : "") +
          `\n  ARANMA AMACI: "${p.sorgu}"`,
        data: fs.readFileSync(p.jpg).toString("base64"),
        mediaType: "image/jpeg",
      }));
      const cikti = await callVisionJSON({
        system: SISTEM,
        user: `Yukarıdaki ${parti.length} görseli sırayla puanla.\n` +
          // ÖRNEKTE SABİT DEĞER YAZMA. Şablonda "puan":0 yazıyordu ve model onu
          // olduğu gibi kopyalıyordu: kontrollü denemede sorguyla birebir örtüşen
          // bir görsel ("volcanic ash cloud eruption plume" -> modelin kendi
          // tarifi "Volkanik patlama plümü") yine de 0 aldı. Alanlar yer
          // tutucuyla gösteriliyor ki model değeri kendisi seçsin.
          // "kalite" de şablonda yoktu; model onu yalnızca şema açıklamasından
          // tahmin ediyordu — bu hesapta şema uygulanmadığı için güvenilmez.
          `Tam olarak şu biçimde döndür:\n` +
          `{"sonuclar":[{"no":<sıra>,"puan":<0-3 alaka>,"kalite":<0-3 kadraj>,` +
          `"gorunen":"<ne görüyorsun>","kadraj":"<yuz|manzara|belge|nesne|kalabalik>",` +
          `"odak":"<sol|orta|sag>","yer":"<dogru|belirsiz|baska|yok>",` +
          `"akis":"<sola|saga|yaklas|uzaklas|sabit|karisik|bilinmiyor>",` +
          `"videoTutarlilik":<0-3>}, ...]}\n` +
          `${parti.length} görselin ${parti.length}'i için de bir kayıt olmalı.`,
        // Tavan parti boyuna göre: her görsel için puan + kısa gerekçe dönüyor.
        // Sabit 4.000 varsayılanı kalabalık partide yanıtı ortadan kesebilir ve
        // o partinin TÜM puanları kaybolur (sıralama sessizce metin sırasına düşer).
        images, schema: SEMA, maxTokens: Math.max(4000, parti.length * 400), usage, logFn,
      });
      // Şema desteklenmediğinde promptla JSON'a düşülüyor ve model bazen ÇIPLAK
      // DİZİ döndürüyor. Her iki biçimi de kabul et — yoksa denetim sessizce
      // sıfır sonuç üretir (ölçüldü: 23 görselin 23'ü de kayboluyordu).
      const kayitlar = Array.isArray(cikti) ? cikti : (cikti?.sonuclar || cikti?.results || []);
      kayitlar.forEach((s, sira) => {
        // "no" gelmediyse dizideki sıraya düş.
        const p = parti[Number.isFinite(s?.no) ? s.no - 1 : sira];
        // Kalite alanı gelmezse (eski model/şema düşüşü) 2 varsayılır: eksik
        // bilgi yüzünden iyi görselleri elemek, kötüsünü geçirmekten kötü.
        // Kamera alanları: tanınmayan değer gelirse yazma. Yazılırsa render
        // bilinmeyen bir dala düşerdi; boş bırakılırsa varsayılan hareket
        // uygulanır — bilgisizken yanlış hareket yapmaktan iyidir.
        const kadraj = KADRAJ_TURLERI.has(String(s?.kadraj)) ? String(s.kadraj) : "";
        const odak = ODAK_YONLERI.has(String(s?.odak)) ? String(s.odak) : "";
        const yer = YER_KARARLARI.has(String(s?.yer)) ? String(s.yer) : "";
        const akis = p?.tur === "video" && AKIS_YONLERI.has(String(s?.akis)) ? String(s.akis) : "";
        const videoTutarlilik = p?.tur === "video"
          ? Math.max(0, Math.min(3, Number.isFinite(s?.videoTutarlilik) ? s.videoTutarlilik : 1))
          : null;

        // YER KURALI KODDA DA ZORLANIR — istem tek başına yetmedi.
        //
        // Model kuralı istemde okuyup yine de yüksek puan verebiliyor; ölçülen
        // vaka bunun kanıtı (Florida'daki mezarlık, Truva kazısı sorgusuna 3/3).
        // Model "başka yer" DEDİĞİ hâlde 3 verirse kendi kararıyla çelişir;
        // burada kesin olan alan kazanır.
        //
        // Yalnızca AÇIK vaka zorlanıyor ("baska"). "belirsiz" bilerek serbest
        // bırakıldı: kanıt yokluğu yanlışlık kanıtı değil ve her belirsizi
        // kırmak yedek arama + AI üretimi masrafını patlatır. Önce kaç tane
        // çıktığı ölçülecek (aşağıda sayılıyor), sonra karar verilecek.
        let puan = Math.max(0, Math.min(3, s.puan ?? 0));
        if (yer === "baska") puan = Math.min(puan, YANLIS_YER_TAVANI);
        if (p?.tur === "video" && (p.previewFrames < 3 || videoTutarlilik <= 1)) puan = Math.min(puan, 1);

        if (p) hedef[p.beatId] = {
          puan,
          kalite: Math.max(0, Math.min(3, Number.isFinite(s?.kalite) ? s.kalite : 2)),
          gorunen: String(s.gorunen || "").slice(0, 80),
          kadraj, odak, yer, akis, videoTutarlilik,
        };
      });
      bitti += parti.length;
      logFn(`${ilerlemeAdi}: ${bitti}/${sorulacak.length}`);
    });
    return sonuc;
    };

    logFn(`${hazir.length} görsel içerik denetiminden geçiriliyor...`);
    const puanlar = {};
    const sonuc = await sor(hazir, puanlar, "Görsel denetimi");

    const patlayanlar = sonuc.filter((r) => !r.ok);
    const patlayan = patlayanlar.length;
    if (patlayan) {
      // SEBEBİ DE YAZ. Eskiden yalnızca sayı yazılıyordu ve gerçek bir işte
      // (20260811-d6e97f) 48 partinin 48'i de patladığı hâlde NEDEN patladığı
      // hiçbir yere geçmedi. Sonradan anlaşıldı: API kredisi iş ortasında
      // bitmişti. Sebep yazılsaydı bir bakışta görülürdü.
      const ilk = String(patlayanlar[0]?.error?.message || "").slice(0, 120);
      logFn(`${patlayan}/${sonuc.length} denetim partisi başarısız — o görseller denetlenmeden geçti.` +
        (ilk ? ` Sebep: ${ilk}` : ""));
    }

    // ---------------------------------------------------------------------
    // ÇELİŞKİDE ÜÇÜNCÜ OY
    // ---------------------------------------------------------------------
    // Ölçüldü (20260815-07e514, 62 sahne): ön sıralama ile bu denetim AYNI
    // görsele 31 kez aynı, 18 kez daha düşük, 13 kez daha yüksek puan verdi.
    // Yani kararın yarısı gürültüydü — ve boru hattı o gürültüye bakıp yedek
    // indiriyor, AI parası harcıyordu. Gerçek örnek: model ön sıralamada
    // "GEDmatch giriş ekranı" için 3 dedi, denetimde aynı görsele 1 dedi;
    // arada değişen tek şey modelin o anki kararıydı.
    //
    // İki oy çeliştiğinde üçüncüsü sorulur ve ORTANCA alınır. Yalnızca
    // çelişenlere sorulduğu için maliyet küçük (ölçümde görsellerin ~%29'u).
    let cekismeCozulen = 0;
    const cekismeli = hazir.filter((h) => {
      const on = onPuanlar[h.beatId];
      const su = puanlar[h.beatId];
      return su && Number.isFinite(on?.puan) && Math.abs(on.puan - su.puan) >= CEKISME_FARKI;
    });
    if (cekismeli.length && !isCancelled()) {
      logFn(`${cekismeli.length} görselde iki bakış çelişti — üçüncü kez soruluyor.`);
      const ucuncu = {};
      try {
        await sor(cekismeli, ucuncu, "Üçüncü bakış");
        for (const h of cekismeli) {
          const u = ucuncu[h.beatId];
          const on = onPuanlar[h.beatId];
          const su = puanlar[h.beatId];
          if (!u || !su) continue;
          const p = ortanca([on.puan, su.puan, u.puan]);
          const k = ortanca([on.kalite, su.kalite, u.kalite]);
          const videoTutarlilik = h.tur === "video"
            ? Math.min(...[su.videoTutarlilik, u.videoTutarlilik].filter(Number.isFinite))
            : null;
          const birlesikPuan = h.tur === "video" && (!Number.isFinite(videoTutarlilik) || videoTutarlilik <= 1)
            ? Math.min(Number.isFinite(p) ? p : su.puan, 1)
            : (Number.isFinite(p) ? p : su.puan);
          if (p !== su.puan) cekismeCozulen++;
          puanlar[h.beatId] = {
            puan: birlesikPuan,
            kalite: Number.isFinite(k) ? k : su.kalite,
            // Görülen tarif, ortancayı VEREN bakıştan alınır ki puanla tutarlı olsun.
            gorunen: (p === u.puan ? u.gorunen : su.gorunen) || su.gorunen,
            // KAMERA ALANLARI DÜŞMESİN. Bu alanlar puandan bağımsız (karede ne
            // var, nerede duruyor) — üçüncü bakış yeniden kurarken silinirse
            // hareket sessizce genele düşerdi.
            kadraj: su.kadraj || u.kadraj || "",
            odak: su.odak || u.odak || "",
            yer: su.yer || u.yer || "",
            akis: su.akis || u.akis || "",
            videoTutarlilik,
          };
        }
        logFn(`Üçüncü bakış bitti: ${cekismeCozulen}/${cekismeli.length} görselin puanı düzeltildi.`);
      } catch (e) {
        if (isCancelled()) throw e;
        // Üçüncü tur patlarsa ikinci turun puanı kalır — iş durmaz.
        logFn(`Üçüncü bakış yapılamadı (${String(e.message).slice(0, 80)}) — ilk denetim puanları kullanılıyor.`);
      }
    }

    // YER KARARLARI RAPORLANIR. "baska" zaten koda takılıp 1'e iniyor;
    // "belirsiz" şimdilik serbest ve kaç tane çıktığı ölçülüyor — sıkılaştırma
    // ancak bu sayı görüldükten sonra yapılacak (bkz. YANLIS_YER_TAVANI).
    {
      const y = { dogru: 0, belirsiz: 0, baska: 0, yok: 0 };
      for (const p of Object.values(puanlar)) if (p.yer) y[p.yer] = (y[p.yer] || 0) + 1;
      if (y.baska || y.belirsiz) {
        logFn(`Yer denetimi: ${y.baska} görsel BAŞKA bir yeri gösteriyordu (puanı 1'e indirildi), ` +
          `${y.belirsiz} görselde yer kanıtı bulunamadı, ${y.dogru} görselde yer doğrulandı.`);
      }
    }

    const zayif = Object.values(puanlar).filter((p) => p.puan < GORSEL_ESIGI).length;
    const tutarsizVideo = Object.values(puanlar).filter((p) => Number.isFinite(p.videoTutarlilik) && p.videoTutarlilik <= 1).length;
    const bakilan = Object.keys(puanlar).length;
    logFn(`Görsel denetimi bitti: ${bakilan} görsel bakıldı, ${zayif} tanesi konuyla ilgisiz bulundu.`);
    if (tutarsizVideo) logFn(`${tutarsizVideo} video baş/orta/son boyunca tutarlı değildi ve kullanımdan çıkarıldı.`);

    // SESSİZ KALİTE KAYBI OLMASIN.
    //
    // Ölçülen kusur: denetim tamamen çöktüğü hâlde iş devam etti ve video
    // üretildi. Bitmiş videoda görsel isabeti %37 çıktı (19 karenin 12'si
    // zayıf/alakasız: tıbbi cihaz anlatılırken Stanford Hapishane Deneyi,
    // çip implantı anlatılırken Budist tapınağı). Kullanıcı bunu ancak
    // videoyu izleyince fark etti.
    //
    // Denetim istendiği hâlde HİÇBİR görsele bakılamadıysa bu bir uyarı değil,
    // videonun kalitesini belirleyen bir arıza — açıkça söylenmeli.
    if (hazir.length >= 4 && bakilan === 0) {
      logFn(`DİKKAT: görsel içerik denetimi hiç çalışamadı (${hazir.length} görselin hiçbirine bakılamadı). ` +
        `Görseller anlatılanla eşleşmeyebilir. Yukarıdaki sebebi kontrol edin — ` +
        `en sık nedeni API kredisinin bitmesidir.`);
    }
    return puanlar;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
}

/**
 * ADAYLARI GÖRSELE BAKARAK YENİDEN SIRALA.
 *
 * NEDEN VAR. Aday listesi METİN örtüşmesine göre sıralı ve autoPick listenin
 * ilkini alıyor. Metin, bir görselin ne gösterdiğini bilemez — yalnızca dosya
 * adında hangi kelimeler geçtiğini bilir.
 *
 * Ölçüldü (Baba Vanga videosu, 2026-08-09): kadının serbest lisanslı TEK
 * fotoğrafı, sınır geçiş belgesindeki vesikalığı, "Baba Vanga portrait
 * photograph" sorgusunda 32 adayın 18.'siydi (metin örtüşmesi 0,280) — çünkü
 * dosya adı "Baba Vanga Border Pass" ve içinde "portrait" ya da "photograph"
 * geçmiyor. Videoya mezar fotoğrafı girdi, kadının yüzü hiç görünmedi.
 *
 * Bu katman ilk N adayın KÜÇÜK RESMİNE bakıp yeniden sıralıyor. Model belgenin
 * üstündeki yüzü görüyor ve sıralama düzeliyor. İndirmeden önce çalışır, yani
 * yanlış görsel hiç inmez.
 *
 * Maliyet küçük modelle iş başına birkaç kuruş: yalnızca ilk N aday, sorgu
 * başına bir kez (aynı sorguyu paylaşan beat'ler tek denetimden faydalanır).
 */
// KAÇ ADAY TARANIR — ölçüme göre seçildi, tahminle değil.
// Baba Vanga videosunda doğru fotoğraf (vesikalık), aynı çekimin kopyaları
// katlandıktan SONRA 9. sıradaydı. 5 bakılsa kaçardı. 12, o örnekte üç sıra
// pay bırakıyor. Üstü: iş başına ~310 küçük resim, küçük modelle ~0,2 dolar.
export const SIRALAMA_ADAY = 12;

export async function adaylariSirala(candidates, { logFn = () => {}, isCancelled = () => false, usage, sorguCumlesi = {} } = {}) {
  const anahtarlar = Object.keys(candidates).filter((k) => (candidates[k] || []).length > 1);
  if (!anahtarlar.length) return 0;

  // Denetim beatId ile anahtarlandığı için sentetik kimlik üretiliyor:
  // "<sorguAnahtarıSırası>#<adaySırası>". Sonra geri eşleniyor.
  const istek = [];
  const harita = {};
  // Adaylar SORGUYA göre gruplandığı için cümle de sorgu üzerinden bağlanıyor.
  // Aynı sorguyu paylaşan beat'ler tek denetimden faydalanıyor; temsilci cümle
  // hangisiyse o kullanılır — sorgunun kendisinden daha iyi bir ölçüt.
  const sentetikCumle = {};
  anahtarlar.forEach((k, ki) => {
    const sorgu = k.split("||")[0];
    candidates[k].slice(0, SIRALAMA_ADAY).forEach((c, ci) => {
      const kimlik = `q${ki}#${ci}`;
      harita[kimlik] = { k, ci };
      istek.push({ beatId: kimlik, url: c.thumb || c.url, sorgu });
      sentetikCumle[kimlik] = sorguCumlesi[sorgu] || "";
    });
  });
  if (!istek.length) return 0;

  logFn(`${istek.length} aday görseline bakılıp ön sıralama yapılıyor...`);
  let puanlar = {};
  try {
    // ÇÖZÜNÜRLÜK ÖNEMLİ. 384 pikselde ölçüldü: Baba Vanga'nın sınır geçiş
    // belgesindeki vesikalık ~40 piksel kalıyor, model yüzü göremeyip
    // "el yazısı ve mühür" diyor ve belgeye 0 veriyor. Ön sıralamanın bütün
    // amacı o yüzü görmek olduğu için burada daha büyük bakılır.
    // Boyut SABİTTEN geliyor: ön sıralama ile asıl denetim aynı çözünürlükte
    // bakmazsa aynı görsele farklı puan verirler ve boru hattı gürültüye göre
    // yedek arar (ölçüldü: 62 sahnenin 31'inde iki bakış çelişiyordu).
    puanlar = await adaylariDenetle(istek, { logFn, isCancelled, usage, boyut: DENETIM_BOYUT, cumleler: sentetikCumle });
  } catch (e) {
    if (isCancelled()) throw e;
    logFn(`Ön sıralama yapılamadı (${String(e.message).slice(0, 70)}) — metin sırası korunuyor.`);
    return 0;
  }

  // Puanları adaylara yaz, sonra yalnızca ilk N'i yeniden sırala. Denetlenmemiş
  // adaylar (N'den sonrası) sırasını korur ve arkada kalır.
  let degisen = 0;
  for (const [kimlik, p] of Object.entries(puanlar)) {
    const h = harita[kimlik];
    if (!h) continue;
    const c = candidates[h.k]?.[h.ci];
    if (c) { c.onGorsel = p.puan; c.onKalite = p.kalite; c.onGorunen = p.gorunen; }
  }
  // GÖRSEL PUANI SIRALAMAYI ELE GEÇİRMEZ, DÜZELTİR.
  //
  // İlk denemede sıralama tamamen görsele devredilmişti; ölçüldüğünde işi
  // BOZDUĞU görüldü. "Baba Vanga portrait photograph" sorgusunda modelin
  // hepsine 0 verdiği bir turda eşitliği kalite bozdu ve elinde kamera tutan
  // alakasız bir stok kadın fotoğrafı (alaka 0, kalite 3) birinci sıraya
  // çıktı — metin sırasında 1. olan gerçek arşiv görselinin önüne.
  //
  // Doğrusu: metin sırası taban kalır, görsel ona ekleme/çıkarma yapar.
  // Denetlenemeyen aday (indirilemedi) hiç etkilenmez, cezalandırılmaz.
  // (Uygulaması aşağıda ayrı ve saf bir fonksiyonda — sınanabilsin diye.)
  for (const k of anahtarlar) {
    if (gorselDuzeltmesiUygula(candidates[k])) degisen++;
  }
  logFn(`Ön sıralama bitti: ${degisen}/${anahtarlar.length} sorguda birinci aday değişti.`);
  return degisen;
}

/**
 * GÖRSEL PUANINI METİN SIRASINA UYGULA — saf, yan etkisiz (liste dışında).
 *
 * Neden ayrı: burada bir kez gerçek bir hata yapıldı. İlk sürüm sıralamayı
 * tamamen görsele devrediyordu; modelin hepsine 0 verdiği bir turda eşitliği
 * KALİTE bozdu ve "elinde kamera tutan alakasız bir kadın" (alaka 0, kalite 3)
 * gerçek arşiv görselinin önüne geçti. Ölçülmeden fark edilmezdi.
 *
 * @returns birinci aday değiştiyse true
 */
export function gorselDuzeltmesiUygula(liste, N = SIRALAMA_ADAY) {
  const bas = liste.slice(0, N);
  if (!bas.some((c) => Number.isFinite(c.onGorsel))) return false;
  const oncekiIlk = bas[0];
  for (const c of bas) {
    if (!Number.isFinite(c.onGorsel)) continue;
    // Gördüğü şey doğruysa ödül büyük (tam isabet metinde 60 puanlık fark
    // kapatabilir); hiç ilgisi yoksa ceza var ama adayı listeden atmaz.
    let d = c.onGorsel >= 3 ? 60 : c.onGorsel === 2 ? 30 : c.onGorsel === 1 ? 0 : -35;
    // Kadraj YALNIZCA ince ayar (±5): alakayı asla ezemez.
    if (Number.isFinite(c.onKalite)) d += (c.onKalite - 2) * 5;
    c.gorselDuzeltme = d;
    c.score = (c.score || 0) + d;
  }
  bas.sort((x, y) => (y.score || 0) - (x.score || 0));
  liste.splice(0, N, ...bas);
  return bas[0] !== oncekiIlk;
}
