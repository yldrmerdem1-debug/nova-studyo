// ARKA PLAN SEÇİMİ — hangi sahnede hangi görsel tam ekran durur?
//
// render.js içinde bir closure'dı; saf fonksiyona çıkarıldı ki test edilebilsin.
// Varsayılan kural: BİR GÖRSEL VİDEODA İKİ KEZ ÇIKMAZ — kullanılmamış bir
// alternatif varken. Açık gerekçe ve bu paragraftaki anlatım çapası olan
// editoryal geri dönüş yalnızca kendi planlanmış beat'i için istisnadır.
//
// Neden önemli (bitmiş volkan videosunda 1 fps taramayla ölçüldü):
//     portre     195s <-> 215s   benzerlik 0,996
//     termal     217s <-> 238s   benzerlik 0,998
//     kül bulutu 245s <-> 267s   benzerlik 0,997
//     lav akışı   74s <->  87s   benzerlik 0,990
// Dördü de aynı segmentin ilk ve son sahnesi. İki ayrı sebep vardı:
//   a) segment 22,75 sn'yi aşınca 4. sahne açılıyordu ama segment başına
//      yalnızca 3 medya iniyor -> 4. sahnenin kendi görseli hiç yok
//      (bu render.js'te sahne sayısını medyayla sınırlayarak çözüldü)
//   b) sıralama "puanı yüksek ama zaten gösterilmiş"i, "puanı biraz düşük ama
//      yeni"ye tercih ediyordu; ayrıca yasak yalnızca ARDIŞIK tekrarı tutuyordu
import { ARKA_GORSEL_ESIGI, ARKA_KALITE_ESIGI } from "./gorseldenetim.js";

/**
 * Tam ekran arka plan olabilmek için İKİ bağımsız koşul:
 *   alaka  — konuyla ilgisiz olmayacak
 *   kalite — tam ekran kullanılamaz kadraj olmayacak
 * İkincisi olmadan, konusu birebir doğru ama yarısı karanlık boş oda olan bir
 * kare tam ekran arka plan oluyordu (gerçek vaka: termal monitör videosu,
 * alaka 3 / kalite 1). Denetim hiç çalışmadıysa alanlar yoktur ve kapı
 * uygulanmaz — eski işleri yeniden render ederken hepsini boşaltmak yanlış olur.
 */
export const arkaPlanGecer = (m) => Boolean(m?.file) &&
  // A rejected multi-frame audit is stronger evidence than weak relevance.
  // Score 1 stills may remain usable; inconsistent video content may not.
  !(m.type === 'video' && Number.isFinite(m.videoTutarlilik) && m.videoTutarlilik <= 1) &&
  !(Number.isFinite(m.gorsel) && m.gorsel < ARKA_GORSEL_ESIGI) &&
  !(Number.isFinite(m.kalite) && m.kalite < ARKA_KALITE_ESIGI);

/**
 * GÖRSELİN KİMLİĞİ DOSYA ADI DEĞİL, KAYNAK ADAYIDIR.
 *
 * İndirilen dosyalar beat adıyla saklanıyor (`s0b2.jpg`, `s6b0.jpg`), yani AYNI
 * kaynak görsel iki beat için indirilirse iki FARKLI dosya adı alıyor. Dosya
 * adına bakan bir tekrar süzgeci bunu göremez.
 *
 * Gerçek videoda ölçüldü (Baba Vanga, 2026-08-08): Rupite kilisesinin tek bir
 * Wikimedia görseli (`wikimedia-0-23720`) üç beat için indirilmişti — s0b2,
 * s6b0, s7b1 — ve videoda 15., 124. ve 149. saniyelerde üç kez çıktı.
 * Vekil sorgular ve "yeni açı" arama aynı en iyi görsele yakınsadığı için bu
 * artık daha da olası.
 *
 * adayId yoksa (eski işler, yerel klipler) dosya adına düşülür.
 */
// KAYNAK KİMLİĞİ — hangi FOTOĞRAF olduğu, hangi sorgudan geldiği değil.
//
// Önce adayId kullanılıyordu; içinde adayın liste SIRASI var
// (`wikipedia-4-70861`). Aynı dosya başka bir sorgudan gelince sıra değişiyor
// (`wikipedia-0-70861`) ve tekrar koruması onları iki ayrı görsel sanıyordu.
// Ölçüldü (20260809-dee3fd): Baba Vanga'nın tek fotoğrafı DÖRT sahnede birden
// çıktı, üçü arka arkaya. kaynakId dosya adından türer, sorgudan bağımsızdır.
const kimlik = (m) => m?.kaynakId || m?.adayId || m?.file || null;

// Curated/Director reuse is a per-beat instruction, not a source-wide flag.
// A reason must describe its purpose (at least 3 words / 12 characters), and
// its anchor must be a real phrase in the current paragraph. Missing context,
// booleans and generic one-word "reuse" flags keep ordinary duplicate rules.
export const editorialReuse = (m, narration) => {
  const instruction = m?.editorial;
  if (!instruction || typeof instruction !== 'object' || Array.isArray(instruction) ||
      typeof instruction.reusePurpose !== 'string' || typeof instruction.anchorQuote !== 'string' ||
      typeof narration !== 'string') return false;
  const clean = (s) => s.replace(/\s+/g, ' ').trim();
  const purpose = clean(instruction.reusePurpose), anchor = clean(instruction.anchorQuote);
  const words = (s) => (s.match(/[\p{L}\p{N}]+/gu) || []).length;
  return purpose.length >= 12 && words(purpose) >= 3 && anchor.length >= 8 && words(anchor) >= 3 &&
    clean(narration).includes(anchor);
};

/** Video boyunca taşınan seçim durumu. Her render için bir tane. */
export function yeniArkaDurum() {
  return {
    kullanim: new Map(),   // görsel kimliği -> kaç sahnede arka plan oldu
    sonDosya: null,        // bir önceki sahnenin görsel kimliği
  };
}

/**
 * Segment içindeki kardeş medya kayıtları (en fazla 6 sahne desteklenir).
 *
 * `durum` verilirse VİDEODA ZATEN GÖSTERİLMİŞ kaynaklar sayılmaz. Sahne sayısı
 * tavanı bunu bilmek zorunda: segment 3 görsele sahip görünüp biri başka bir
 * segmentte zaten kullanılmışsa, 3 sahne açmak 3. sahnede tekrarı zorunlu
 * kılıyor. Ölçüldü (Baba Vanga videosu): aynı kilise görseli üç segmentte
 * indirilmişti ve 3 sahne açılınca üçünde de göründü.
 *
 * Aynı kaynak segment içinde iki beat'e inmişse de bir kez sayılır. Açık
 * editoryal geri dönüş, bu paragrafın anlatımına dayanıyorsa kendi beat'i
 * için sayılır; kaynağın kimliği ve kullanım geçmişi değiştirilmez.
 */
export function kardesleriBul(media, segIdx, durum = null, narration = null) {
  const liste = [0, 1, 2, 3, 4, 5]
    .map((k) => media[`s${segIdx}b${k}`])
    .filter(arkaPlanGecer);
  if (!durum) return liste;
  const gorulen = new Set();
  return liste.filter((m) => {
    const k = kimlik(m), reuse = editorialReuse(m, narration);
    if (!k || (gorulen.has(k) && !reuse)) return false;  // gerekçesiz segment içi kopya
    if ((durum.kullanim.get(k) || 0) > 0 && !reuse) return false;
    gorulen.add(k);
    return true;
  });
}

/**
 * @param media   beatId -> medya kaydı
 * @param segIdx  segment sırası
 * @param b       segment içindeki sahne sırası
 * @param durum   yeniArkaDurum() ile üretilmiş, çağrılar arası taşınan durum
 * @param narration bu segmentin anlatımı; gerekçeli tekrar çapası burada doğrulanır
 * @returns seçilen medya kaydı ya da {file:null, type:"card"}
 */
export function arkaPlanSec(media, segIdx, b, durum, narration = null) {
  const isaretle = (m) => {
    const k = kimlik(m);
    if (k) {
      durum.kullanim.set(k, (durum.kullanim.get(k) || 0) + 1);
      durum.sonDosya = k;
    }
    return m;
  };
  const kullanildi = (m) => (durum.kullanim.get(kimlik(m)) || 0) > 0;

  const own = media[`s${segIdx}b${b}`];

  // 1) Kendi görseli — daha önce gösterilmemişse veya bu beat için açık,
  // anlatımla doğrulanmış geri dönüş varsa. İzin kardeşlere taşınmaz.
  //
  // "Zaten gösterildi mi?" sorusunda ARDIŞIK olması gerekmiyor. Eski kod
  // yalnızca bir önceki sahneyi yasaklıyordu ve şu tekrar kaçıyordu: b1'in
  // kendi medyası denetimden kalır, kardeş olarak b2'ninkini alır; sıra b2'ye
  // gelince o da kendi medyasını döndürür ve aynı görsel iki sahnede çıkar.
  if (arkaPlanGecer(own) && (editorialReuse(own, narration) ||
      (kimlik(own) !== durum.sonDosya && !kullanildi(own)))) {
    return isaretle(own);
  }

  // 2) Kardeşler. Seçim İNDEKS SIRASIYLA değil ÖLÇÜTLE yapılır.
  const kardesler = kardesleriBul(media, segIdx);
  if (kardesler.length) {
    kardesler.sort((x, y) =>
      // Bir önceki sahnenin dosyası EN SONA — puanı yüksek olsa bile.
      ((kimlik(x) === durum.sonDosya ? 1 : 0) - (kimlik(y) === durum.sonDosya ? 1 : 0)) ||
      // HİÇ KULLANILMAMIŞ ÖNCE. Bu ölçüt eskiden puandan SONRA geliyordu; yani
      // "puanı yüksek ama zaten gösterilmiş" görsel, "puanı biraz düşük ama
      // yeni" görsele tercih ediliyordu. Tekrar, düşük puandan kötüdür.
      ((durum.kullanim.get(kimlik(x)) || 0) - (durum.kullanim.get(kimlik(y)) || 0)) ||
      ((y.gorsel ?? 1) - (x.gorsel ?? 1)));
    return isaretle(kardesler[0]);
  }

  // 3) Kardeş yoksa kendi medyası tekrar kullanılır — boş karttan iyidir.
  if (arkaPlanGecer(own)) return isaretle(own);

  // 4) Videonun rastgele bir görseline DÜŞÜLMEZ: alakasız tam ekran görüntü,
  //    renk zeminli bir sahneden çok daha kötü.
  return { beatId: `s${segIdx}b${b}`, file: null, type: "card" };
}
