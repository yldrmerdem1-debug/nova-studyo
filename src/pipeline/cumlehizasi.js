// SAHNE KESMESİ CÜMLE SINIRINA OTURSUN.
//
// NEDEN VAR. Segment birden çok sahneye bölünürken süreler bir RİTİM EĞRİSİNE
// göre paylaştırılıyordu (ilk sahne uzun, sonrakiler sıkışır). Bu, tempo için
// iyi ama anlam için kör: kesme, cümlenin ortasına düşüyor ve görsel, kendi
// cümlesi söylenmeden önce ya da sonra ekranda kalıyor.
//
// Ölçüldü (20260809-bc5629): 27 görselin en fazla 6'sı kendi cümlesiyle
// hizalıydı; 5 tanesi bir sahne kayıktı — radyo görseli, radyodan bahsedilen
// cümleden bir sahne ÖNCE görünüyordu. Kullanıcının şikâyeti tam buydu:
// "evini söylüyorsa evi çıksın, çocukluğunu söylüyorsa çocukluğu çıksın."
//
// Elimizde TTS'ten gelen kelime zamanları var (her kelimenin başlangıç ve
// bitişi). Yani cümlenin sesin neresinde olduğunu TAHMİN etmeye gerek yok,
// ölçebiliyoruz. Bu modül cümleleri zaman pencerelerine çevirip sahne
// sınırlarını o pencerelere oturtuyor.
//
// Ritim tamamen kaybolmuyor: sahneler cümle gruplarına bölünürken hedef süreye
// en yakın DENGELİ bölme seçiliyor, ama kesme daima bir cümle bitiminde.

/**
 * Metni cümlelere böl.
 *
 * Kısaltma tuzağı: "Dr.", "1911'de 3 Ekim'de" gibi yerlerde nokta cümle sonu
 * değildir. Nokta+boşluk+BÜYÜK HARF aranıyor; ayrıca tek harflik baş harfler
 * (A. Kunike) ve yaygın kısaltmalar bölmeyi tetiklemiyor.
 */
const KISALTMA = /(?:\b(?:Dr|Prof|Doç|Av|Sn|vb|vs|bkz|Mr|Mrs|St|No)\.|\b[A-ZÇĞİÖŞÜ]\.)\s*$/;

export function cumleleriBol(metin) {
  const s = String(metin || "").trim();
  if (!s) return [];
  const parcalar = [];
  let bas = 0;
  const re = /[.!?…]+["'»)\]]?\s+/g;
  let m;
  while ((m = re.exec(s))) {
    const aday = s.slice(bas, m.index + m[0].length);
    // Kısaltmadan sonra gelen nokta cümleyi bitirmez — sonrakine ekle.
    if (KISALTMA.test(aday.trimEnd())) continue;
    parcalar.push(aday.trim());
    bas = re.lastIndex;
  }
  const kalan = s.slice(bas).trim();
  if (kalan) parcalar.push(kalan);
  return parcalar.filter(Boolean);
}

/** Karşılaştırma için sadeleştir: noktalama ve büyük/küçük harf farkı silinir. */
const sade = (w) => String(w).toLowerCase().replace(/[^\wçğıöşüâîû]/gi, "");

/**
 * CÜMLELERİ ZAMAN PENCERESİNE ÇEVİR.
 *
 * Kelime listesi ile cümle metinleri arasında birebir eşleşme aranmaz —
 * TTS bazı kelimeleri birleştirebiliyor, sayıları açıyor ("1911" -> "bin
 * dokuz yüz on bir"). Bu yüzden KELİME SAYISI üzerinden yürünüyor: her
 * cümlenin kaç kelime olduğu bilinir, kelime akışından o kadarı tüketilir.
 * Sayı açılımı yüzünden kayma olabileceği için, cümlenin son kelimesi metinde
 * de aranıp bulunursa oraya hizalanır (düzeltici adım).
 *
 * @param toplamSure segmentin ses süresi (kelime zamanları bunun içinde)
 * @returns [{metin, bas, son}] — bas/son saniye, segment başına göre
 */
export function cumlePencereleri(metin, kelimeler, toplamSure) {
  const cumleler = cumleleriBol(metin);
  if (!cumleler.length) return [];
  const kl = (kelimeler || []).filter((w) => w && Number.isFinite(w.start) && Number.isFinite(w.end));
  // Kelime zamanı yoksa hizalama yapılamaz — çağıran eski davranışa döner.
  if (kl.length < cumleler.length) return [];

  const pencere = [];
  let i = 0;
  for (let c = 0; c < cumleler.length; c++) {
    const kelimeSayisi = cumleler[c].split(/\s+/).filter(Boolean).length;
    const kalanCumle = cumleler.length - c - 1;
    // Son cümleye en az 1 kelime kalsın diye tavan konur.
    const tavan = kl.length - i - kalanCumle;
    let adet = Math.max(1, Math.min(kelimeSayisi, tavan));

    // DÜZELTİCİ ADIM: cümlenin son kelimesi yakında geçiyorsa oraya hizala.
    // Sayı açılımı ("1942" -> üç kelime) kelime sayısını kaydırıyor.
    const sonKelime = sade(cumleler[c].split(/\s+/).filter(Boolean).pop() || "");
    if (sonKelime.length > 2) {
      const pencereBoyu = Math.min(6, tavan - 1);
      for (let d = 0; d <= pencereBoyu; d++) {
        for (const yon of [adet - 1 + d, adet - 1 - d]) {
          if (yon < 0 || yon >= tavan) continue;
          if (sade(kl[i + yon]?.t) === sonKelime) { adet = yon + 1; d = 99; break; }
        }
        if (d === 99) break;
      }
    }

    const bas = c === 0 ? 0 : pencere[c - 1].son;
    const sonKl = kl[Math.min(i + adet - 1, kl.length - 1)];
    const son = c === cumleler.length - 1 ? toplamSure : Math.min(toplamSure, sonKl.end);
    pencere.push({ metin: cumleler[c], bas, son: Math.max(bas + 0.01, son) });
    i += adet;
    if (i >= kl.length) {
      // Kelime bitti: kalan cümleleri son pencereye yığmak yerine bırak.
      break;
    }
  }
  // Son pencere daima segmentin sonuna kadar uzar (kuyruk sessizliği dahil).
  if (pencere.length) pencere[pencere.length - 1].son = toplamSure;
  return pencere;
}

/**
 * CÜMLE PENCERELERİNİ n SAHNEYE GRUPLA.
 *
 * Kesme daima cümle bitiminde olur. Gruplar arasında süre dengesi gözetilir
 * (hedef: toplam/n) ama denge uğruna cümle ortasından kesilmez — ritim
 * ikincil, anlam birincil.
 *
 * Cümle sayısı n'den azsa n düşürülür: 2 doğru sahne, 3 kayık sahneden iyidir.
 * En kısa sahne süresi (minSure) altına düşen bölme kabul edilmez.
 *
 * Arama: cümle sayısı 2-8, n 1-4 aralığında olduğu için tüm bölmeler taranıyor
 * (kombinasyon sayısı en fazla birkaç yüz). Sezgisel gerekmiyor.
 *
 * @returns [{bas, son, dur}] — uzunluğu <= n
 */
export function sahnelereGrupla(pencereler, n, minSure = 2.2) {
  const P = pencereler.length;
  if (!P) return [];
  const hedefN = Math.max(1, Math.min(n, P));
  if (hedefN === 1) return [{ bas: pencereler[0].bas, son: pencereler[P - 1].son, dur: pencereler[P - 1].son - pencereler[0].bas }];

  const toplam = pencereler[P - 1].son - pencereler[0].bas;

  // Belirli bir grup sayısı için en dengeli bölmeyi bul.
  const enIyiBolme = (g) => {
    const hedef = toplam / g;
    let enIyi = null, enIyiCeza = Infinity;
    // kesimNoktalari: g-1 tane cümle sınırı seçilir (1..P-1 arasından)
    const gez = (bas, kalan, secim) => {
      if (kalan === 0) {
        const sinir = [0, ...secim, P];
        const gruplar = [];
        for (let k = 0; k < sinir.length - 1; k++) {
          const a = pencereler[sinir[k]].bas, b = pencereler[sinir[k + 1] - 1].son;
          gruplar.push({ bas: a, son: b, dur: b - a });
        }
        if (gruplar.some((x) => x.dur < minSure)) return;
        const ceza = gruplar.reduce((acc, x) => acc + (x.dur - hedef) ** 2, 0);
        if (ceza < enIyiCeza) { enIyiCeza = ceza; enIyi = gruplar; }
        return;
      }
      for (let k = bas; k <= P - kalan; k++) gez(k + 1, kalan - 1, [...secim, k]);
    };
    gez(1, g - 1, []);
    return enIyi;
  };

  // İstenen grup sayısından başlayıp aşağı in: minSure yüzünden olmuyorsa
  // sahne sayısı düşer, ama kesme yine cümle sınırında kalır.
  for (let g = hedefN; g >= 1; g--) {
    const b = enIyiBolme(g);
    if (b) return b;
  }
  return [{ bas: pencereler[0].bas, son: pencereler[P - 1].son, dur: toplam }];
}

// Kuratör/Yönetmen her görsele benzersiz bir anlatım alıntısı verdiyse,
// süre dengesi bu açık eşlemeyi bozamaz. Kısmi alıntı kendi cümlesinin başına
// bağlanır; kısa arama terimleri veya belirsiz/süreye sığmayan planlar alınmaz.
function capalardanGrupla(pencereler, n, minSure, sorgular) {
  if (n < 2 || !Array.isArray(sorgular) || sorgular.length !== n) return null;
  const temiz = (s) => s.replace(/\s+/g, " ").trim();
  const cumleler = pencereler.map((p) => temiz(p.metin));
  const anlatim = cumleler.join(" ");
  const baslar = [];
  let ofset = 0;
  for (const cumle of cumleler) { baslar.push(ofset); ofset += cumle.length + 1; }
  const indeksler = [];
  for (const sorgu of sorgular) {
    if (typeof sorgu !== "string") return null;
    const capa = temiz(sorgu);
    if (capa.length < 8 || (capa.match(/[\p{L}\p{N}]+/gu) || []).length < 3) return null;
    const bas = anlatim.indexOf(capa), son = bas + capa.length;
    if (bas < 0 || anlatim.indexOf(capa, bas + 1) >= 0) return null;
    if (/[\p{L}\p{N}_]/u.test(anlatim[bas - 1] || "") || /[\p{L}\p{N}_]/u.test(anlatim[son] || "")) return null;
    const c = baslar.findIndex((b, i) => bas >= b && son <= b + cumleler[i].length);
    // Bir cümleye iki farklı görsel, ters sıra veya cümleler arası alıntı:
    // var olan gruplama ve özel ad/yıl eşlemesi karar versin.
    if (c < 0 || (indeksler.length && c <= indeksler.at(-1))) return null;
    indeksler.push(c);
  }
  const sinirlar = [0, ...indeksler.slice(1).map((i) => pencereler[i].bas), pencereler.at(-1).son];
  const gruplar = indeksler.map((_, i) => ({ bas: sinirlar[i], son: sinirlar[i + 1], dur: sinirlar[i + 1] - sinirlar[i] }));
  return gruplar.every((g) => g.dur >= minSure) ? gruplar : null;
}

/**
 * Segment için sahne süreleri — cümleye hizalı.
 * @param sorgular görsellerin arama sorguları (özgün sırayla); verilirse her
 *   sahneye, o sahnede söylenen cümleye en yakın görsel atanır.
 * @returns {gruplar, pencereler, gorselSirasi} ya da hizalanamazsa null
 *   (çağıran eski ritim bölmesine döner)
 */
export function sahneHizasi(metin, kelimeler, n, toplamSure, minSure = 2.2, sorgular = null) {
  if (!(toplamSure > 0) || n < 1) return null;
  const pencereler = cumlePencereleri(metin, kelimeler, toplamSure);
  if (pencereler.length < 2) return null;   // tek cümle: bölmenin anlamı yok
  const capali = capalardanGrupla(pencereler, n, minSure, sorgular);
  if (capali) return { gruplar: capali, pencereler, gorselSirasi: capali.map((_, i) => i) };
  let gruplar = sahnelereGrupla(pencereler, n, minSure);
  // Açılış/bölüm kartlarında 3,2 sn tercih edilir. Tek anlamlı cümle sınırı bu
  // tercihin az altında kaldığında bütün uzun segmenti tek görsele düşürmek daha
  // kötü sonuç verir. Yalnızca tercih edilen taban TÜM kesmeleri kapattıysa,
  // aynı cümle sınırlarını 2,2 sn mutlak görsel tabanıyla bir kez daha dene.
  // Böylece rastgele kesme açılmaz ve gerçekten kısa cümle ayrı sahne olmaz.
  const mutlakTaban = 2.2;
  if (gruplar.length === 1 && n > 1 && minSure > mutlakTaban) {
    const yedek = sahnelereGrupla(pencereler, n, mutlakTaban);
    if (yedek.length > 1) gruplar = yedek;
  }
  if (!gruplar.length) return null;
  // Toplam süre korunmalı: render kare hesabını buna göre yapıyor, aksi
  // halde her segmentte birikip ses kayar.
  const t = gruplar.reduce((a, g) => a + g.dur, 0);
  if (Math.abs(t - toplamSure) > 0.05) {
    const k = toplamSure / t;
    let akan = 0;
    for (const g of gruplar) { g.dur *= k; g.bas = akan; akan += g.dur; g.son = akan; }
  }
  // Görsel ataması ÖLÇEKLEMEDEN ÖNCEKİ pencerelerle yapılmalı; ölçekleme
  // yalnızca süreleri esnetiyor, cümle-sahne örtüşmesini değiştirmiyor.
  const gorselSirasi = sorgular
    ? gorselleriGruplaraDagit(gruplar, pencereler, sorgular)
    : gruplar.map((_, i) => i);
  return { gruplar, pencereler, gorselSirasi };
}

// GÖRSELİ, SAHNEYE DÜŞEN CÜMLEYE EŞLE.
//
// Kesmeyi cümle sınırına oturtmak yarısı; diğer yarısı o sahnede DOĞRU
// görselin olması. Eskiden eşleme sıraydı: 1. görsel 1. sahneye, 2. görsel
// 2. sahneye. Senaryo modeli görselleri anlatım sırasına göre yazdığı için
// çoğu zaman tutuyor, ama tutmadığında görsel bir sahne kayıyor. Ölçüldü
// (20260809-bc5629): radyo görseli, radyodan bahsedilen cümleden BİR SAHNE
// ÖNCE ekrana geliyordu.
//
// Sorgular İngilizce, anlatım Türkçe. Yani ortak olabilecek şey ÖZEL ADLAR ve
// SAYILAR — ki zaten bağı kuran da onlar: "Zemun", "Petriç", "1942", "Rupite".
// Ortak hiçbir işaret yoksa sıra korunur (kör karıştırma yapılmaz).

const AYIRAC = /[^\wçğıöşüâîûÇĞİÖŞÜ]+/;

// TÜRKÇE HARFLERİ ASCII'YE İNDİR — bu eşleşmenin ta kendisi.
//
// Anlatım Türkçe, sorgular İngilizce. Aynı yerin adı iki metinde farklı
// yazılıyor: "Petriç" ve "Petrich", "İstanbul" ve "Istanbul". Ölçüldü:
// katlama yapılmadan S7'de görseller TERS takas edildi — mezar görseli
// "evi müze oldu" cümlesine, müze görseli cenaze cümlesine düştü. Çünkü
// "petriç".startsWith("petric") yanlış dönüyordu ve tek eşleşen "Rupite" kaldı.
const TR_ASCII = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u", é: "e" };
const asciile = (s) => String(s).toLowerCase().replace(/[çğıöşüâîûé]/g, (c) => TR_ASCII[c] || c);

/**
 * Metinden eşleşebilir çekirdekler: özel ad kökleri ve yıllar.
 *
 * `ilkKelimeAtla`: cümlenin İLK kelimesi her zaman büyük harfle başlar, bu da
 * onu sahte bir özel ad yapar. Ölçüldü: "Meme kanserinden öldüğünde..."
 * cümlesinde "Meme" özel ad sayılıp gürültü üretiyordu. Sorgularda böyle bir
 * sorun yok (sorgu cümle değil), o yüzden seçmeli.
 */
function cekirdekler(metin, ilkKelimeAtla = false) {
  const out = new Set();
  const ham0 = String(metin || "");
  // Kesme işareti Türkçede ÖZEL ADIN ekini ayırır: "Petriç'teki", "Zemun'daki".
  // Bu, cümle başındaki kelimenin gerçekten özel ad olduğunun güvenilir
  // işareti. Ölçüldü: kör "ilk kelimeyi atla" kuralı "Petriç'teki evi 2008'de"
  // cümlesinde asıl özel adı siliyor ve görselleri ters takas ettiriyordu.
  const kesmeliBaslangic = /^[A-ZÇĞİÖŞÜ][\wçğıöşüâîû]*'/.test(ham0.trimStart());
  const parcalar = ham0.split(AYIRAC).filter(Boolean);
  parcalar.forEach((ham, i) => {
    if (/^\d{3,4}$/.test(ham)) { out.add(ham); return; }           // yıl
    if (ilkKelimeAtla && i === 0 && !kesmeliBaslangic) return;
    if (ham.length < 4) return;
    if (!/^[A-ZÇĞİÖŞÜ]/.test(ham)) return;                          // özel ad
    // Türkçe ekleri kırp ve ASCII'ye indir: "Petriç'teki" -> "petric"
    out.add(asciile(ham.split("'")[0]).slice(0, 6));
  });
  return out;
}

function ortakSayisi(a, b) {
  let n = 0;
  for (const x of a) for (const y of b) if (x.startsWith(y) || y.startsWith(x)) { n++; break; }
  return n;
}

/**
 * @param gruplar sahnelereGrupla çıktısı
 * @param pencereler cumlePencereleri çıktısı (cümle metinleri + zamanları)
 * @param sorgular her görselin arama sorgusu, ÖZGÜN sıralarıyla
 * @returns her sahne için kullanılacak GÖRSEL İNDEKSİ (özgün sıradaki)
 */
export function gorselleriGruplaraDagit(gruplar, pencereler, sorgular) {
  const G = gruplar.length;
  const V = (sorgular || []).length;
  const varsayilan = Array.from({ length: G }, (_, i) => Math.min(i, Math.max(0, V - 1)));
  if (!G || V < 2) return varsayilan;

  // Her sahnenin metni: o zaman aralığına düşen cümleler.
  // Her cümlenin ilk kelimesi ayrı ayrı atlanmalı — cümleler birleştirilirse
  // yalnızca ilkinin başı atlanır ve diğerleri sahte özel ad olarak kalır.
  const grupCekirdek = gruplar.map((g) => {
    const birlesik = new Set();
    for (const p of pencereler) {
      if (!(p.bas < g.son - 0.01 && p.son > g.bas + 0.01)) continue;
      for (const c of cekirdekler(p.metin, true)) birlesik.add(c);
    }
    return birlesik;
  });
  const sorguCekirdek = sorgular.map((q) => cekirdekler(q));

  // Hiç ortak işaret yoksa karıştırma — sıra en iyi tahmindir.
  let toplamSinyal = 0;
  const puan = grupCekirdek.map((gc) => sorguCekirdek.map((sc) => {
    const p = ortakSayisi(gc, sc); toplamSinyal += p; return p;
  }));
  if (!toplamSinyal) return varsayilan;

  // Küçük boyutlu açgözlü atama: en güçlü eşleşmeden başla. Eşitlikte
  // ÖZGÜN SIRA kazanır — sinyal yokken yerinden oynatmamak için.
  const atama = new Array(G).fill(-1);
  const kullanilan = new Set();
  const adaylar = [];
  for (let g = 0; g < G; g++) for (let v = 0; v < V; v++) adaylar.push({ g, v, p: puan[g][v] });
  adaylar.sort((a, b) => b.p - a.p || Math.abs(a.g - a.v) - Math.abs(b.g - b.v) || a.g - b.g);
  for (const a of adaylar) {
    if (a.p <= 0) continue;
    if (atama[a.g] !== -1 || kullanilan.has(a.v)) continue;
    atama[a.g] = a.v; kullanilan.add(a.v);
  }
  // Boşta kalan sahnelere, kullanılmamış görselleri sırayla ver.
  const bosta = Array.from({ length: V }, (_, i) => i).filter((v) => !kullanilan.has(v));
  for (let g = 0; g < G; g++) if (atama[g] === -1) atama[g] = bosta.shift() ?? varsayilan[g];
  return atama;
}

/**
 * CÜMLEDE SOMUT BİR ÇAPA VAR MI?
 *
 * Belgesel anlatımının azımsanmayacak bir bölümü SOYUTTUR: retorik soru, geçiş
 * cümlesi, yorum. "Peki o geleceği mi gördü yoksa her nesil kendi korkusunu mu
 * okudu?" — bunun gösterilecek bir karşılığı yoktur. Arşivden ne konursa konsun
 * yalnızca çağrışım düzeyinde kalır ve izleyiciyi yanıltır.
 *
 * Ölçüldü (5 üretim, kare kare): "söyleneni gösteriyor" oranı %55-61 aralığında
 * takılı kaldı ve kalan kaybın büyük kısmı bu tür cümlelerdi — seçim hatası
 * değil, gösterilecek şey olmaması.
 *
 * Çapa = özel ad, yıl ya da sayı. Biri varsa aranacak somut bir şey vardır.
 * Cümlenin ilk kelimesi büyük harfli olduğu için özel ad sayılmaz (kesme
 * işareti taşımıyorsa) — ölçülmüş bir tuzak.
 */
export function somutCapaVar(metin) {
  const s = String(metin || "");
  if (/\b\d{3,4}\b/.test(s)) return true;                    // yıl
  if (/\b\d+([.,]\d+)?\s*(bin|milyon|milyar|kişi|yıl|km|metre)\b/i.test(s)) return true; // nicelik
  // Seslendirme metninde sayılar çoğu zaman YAZIYLA yazılır ("on beş bin kişi",
  // "bin dokuz yüz kırk iki") — rakam aramak bunları kaçırıyordu.
  // Dikkat: SÜRE bir çapa değildir. "otuz yıl sonra" aranacak bir şey
  // göstermez; "on beş bin kişi" gösterir. Bu yüzden "yıl" listede yok.
  if (/\b(bir|iki|üç|dört|beş|altı|yedi|sekiz|dokuz|on|yirmi|otuz|kırk|elli|altmış|yetmiş|seksen|doksan|yüz|bin|milyon|milyar)\s+(bin|milyon|milyar|yüz|kişi)\b/i.test(s)) return true;
  const parcalar = s.split(AYIRAC).filter(Boolean);
  const kesmeliBas = /^[A-ZÇĞİÖŞÜ][\wçğıöşüâîû]*'/.test(s.trimStart());
  return parcalar.some((h, i) => {
    if (i === 0 && !kesmeliBas) return false;
    return h.length >= 4 && /^[A-ZÇĞİÖŞÜ]/.test(h);
  });
}
