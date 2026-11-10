// BÜYÜME DERSLERİ — kanal verisi + niş çıkıntı çalışması (14 Ekim 2026).
//
// Kanal sahibi: "kaç aydır uğraşıyoruz… tutmuşlar gibi çıkarmalıyız, kendi edit sistemimizle". Kendi üç kanalımızın
// Studio verisi ve tarih / gündem / finans nişlerinde ~30 kanalın son videoları (kendi kanal ortancalarının 2,5-68 katı
// izlenenler) aynı şeyi söyledi: ÜNLÜ bir isim ya da yer + TEK, şaşırtıcı ve somut bir açı. Az bilinen konu, şiirsel
// ya da belirsiz başlık ve konuyu söylemeyen açılış kaybediyor. Bu dosya o dersleri tek yerde tutar; konu önerileri
// (/api/ideas), senaryo kutsal kitabı (docu-script.js), YouTube paketi ve Shorts planlayıcıları buradan okur.

/** Niş başına gerçek çıkıntılar (başlık · kanalının ortancasına göre kat). */
export const OUTLIERS = {
  history: [
    ["The Miserable Reality Of Life On The Mayflower", 12.8],
    ["The Entire History of Ancient Japan", 9.5],
    ["How Alexander the Great Fooled Darius at Gaugamela", 8.0],
    ["Why Is Japan So Rich?", 7.7],
    ["Year 536 Was the Worst Year to Be Alive - What Happened?", 7.3],
    ["Maus Tank: 207-Ton Monster That Had to Swim", 31.0],
    ["Why did Soldiers Fight in Lines?", 13.2],
  ],
  news: [
    ["How a US B2 Bomber Bombed Afghanistan from Missouri", 16.4],
    ["How the UK is becoming a 'third-world' economy", 14.3],
    ["How a nuclear bomb really works", 14.3],
    ["I went to Greenland, here's why the US wants it", 13.1],
    ["Why Canada is WAY Further South Than You Think", 11.4],
    ["Russia is Running Out of People", 3.0],
  ],
  finance: [
    ["J.P. Morgan Documentary: How One Man Financed America", 12.2],
    ["Rockefeller: The World's First Billionaire", 9.0],
    ["How Andrew Carnegie Became The Richest Man In The World", 9.4],
    ["Fried Chicken Wars: The Fall of KFC in America", 5.4],
    ["GoPro Is Going Bankrupt?", 571],
    ["How This Vandal Made $200 Million by Spray Painting An Office", 40.3],
  ],
};

/** Tür (genre / format) → niş. */
export function nicheOf({ genre = "", format = "", topic = "" } = {}) {
  if (format === "news") return "news";
  if (genre === "finance" || /\b(stock|bank|money|billion|economy|market|company|brand|fraud|crash)\b/i.test(topic)) return "finance";
  return "history";
}

/** The one formula, in English (the writer and the packager write English videos). */
export const FORMULA = "a FAMOUS name or place + ONE surprising, concrete angle (a trick, a number, a hidden cost, the daily reality, the fall)";

/** Lines for the documentary writer's bible: title and first 15 seconds carry the famous subject and the angle. */
export function bibleGrowthLines(niche) {
  const ex = (OUTLIERS[niche] || OUTLIERS.history).slice(0, 4).map(([t, x]) => `"${t}" (${x}x)`).join(", ");
  return [
    `BÜYÜME DERSİ (kanal verisi + nişteki çıkıntılar, Ekim 2026): tutan videolar ${FORMULA}. Bu nişte kendi kanal ortalamasının katlarını izlenenler: ${ex}.`,
    "- title: konunun ARANAN adını (kişi, yer, olay, marka) ilk kelimelerde taşı ve tek şaşırtıcı açıyı söyle; şiirsel ya da belirsiz başlık yok.",
    "- İlk 15 saniye: konuyu hiç duymamış izleyiciye ne olduğunu açıkça söyle (kim/ne, nerede/ne zaman, ne pahasına) — kendi Shorts'umuzda konuyu söylemeyen açılış izleyicinin ~%40'ını 12 sn'de kaybetti; uzun videolarımızda izleyen kalıyor (Panama 5:54, 1929 %64), sorun tıklanmak ve ilk saniyeler.",
    "- Az bilinen bir konu ise onu ÜNLÜ bir şeye bağla (dönemin ünlü olayı, herkesin bildiği marka/kişi/yer) ve bunu başlıkta ve açılışta kullan.",
  ];
}

/** Lines for the topic-ideas prompt (Turkish UI, English channel). */
export function ideaGrowthLines() {
  const all = Object.entries(OUTLIERS).map(([n, list]) => `${n}: ${list.slice(0, 4).map(([t, x]) => `"${t}" ${x}x`).join("; ")}`).join("\n");
  return [
    `Kanallar İngilizce; başlıkları İngilizce yaz. Formül (gerçek veri, Ekim 2026): ${FORMULA}. Nişlerde kanal ortalamasının katlarını izlenen gerçek videolar:`,
    all,
    "Az bilinen konu önerme (bizim Cannae 22, Truva 13 izlenme aldı; Apollo 13 ve Yom Kippur tuttu): herkesin bildiği ve YouTube'da aranan bir isim seç, ona daha önce duyulmamış somut bir açıyla gel. Her fikre 'neden tutar' diye tek cümle ekle.",
  ];
}

/*
 * ALTYAZI ÇALIŞMASI (14 Ekim 2026): tutmuş 28 uzun video ve 10 Shorts'un ilk dakikaları kelime kelime okundu.
 * Uzun videolar: tek somut şeyle açılır ("This is a $100 trillion bank note from Zimbabwe", "These are 5 pictures of
 * Tokyo… taken in the 1860s", "This man, who you see on the screen…"), 20 sn içinde çelişkiyi verir (Japonya orta
 * çağda, 80 yıl sonra uçak gemileri; GoPro 86 dolardan 1,30'a), 30 sn içinde soruyu açıkça sorar ("So how did they
 * get here? And will they go bankrupt?"), sayıları tanıdık ölçüye çevirir ("closer to Chicago than to Moscow",
 * "would fill less than half of Michigan Stadium", "just ahead of Mississippi"), sade ve konuşur gibi anlatır, sık
 * sık bilinen bir yanlışı düzeltir ("we all know Canadians like to pretend they're further north…"). Shorts: ilk
 * cümle özne + uç iddia + sayı ("Remember GoPro… they're getting annihilated. Their stock has plummeted 97%"),
 * ardından kısa soru ("So what happened?" / "Why?"), sonra 3-5 olgu, her biri bir sayıyla, mekanizmayı açıklar
 * ("The trick was…"), en sonda ironik bir dönüş ya da şaşırtıcı son olgu ("Detroit is the only American city where
 * travelling south takes you to Canada"); 30-56 sn, hızlı ve sohbet dili; şiirsel parça yok.
 */
/*
 * KÜÇÜK KANAL PATLAMALARI — AÇILIŞ (15-16 Ekim 2026): 100-10 bin aboneli kanalların bu ay 58 bin-3,5 milyon izlenen
 * 15 videosunun ilk 90 sn'si kelime kelime (Hidden History 815 abone / 372 bin, Frontline Echoes, Militopia, Wrongly
 * Assumed, Vlad Medieval History, Iron Circuit, Inside Decoded, Statrys 393 abone / 871 bin, Base Central, Built
 * Beyond, Kelevin 1.820 abone / 3,5 milyon…). Büyük kanallarla aynı kalıp, üstüne dört şey: sahnenin ortasında,
 * şimdiki zamanda açılış ("The gun is deserted… Then an 18-year-old climbs up to that gun."); yaygın inanışı açıkça
 * yıkmak ("Start with what you already know… Almost none of that is true."); 30-45 sn'de üç parçalı açık vaat ("By
 * the end of this video, you'll know why…"); haberde herkesin izlediği büyük hikâyeden küçük olaya inip "First, a quick
 * orientation" ile kim kimdir. Anlatım 139-209 kelime/dk (ortanca ~157), videolar 13-34 dk (ortanca ~16).
 */
export function hookGrowthLines({ news = false } = {}) {
  return [
    "AÇILIŞ (tutmuş 28 uzun video + 15 küçük kanal patlamasının ilk dakikası, Ekim 2026):",
    "- İlk cümle TEK SOMUT ŞEY: ekrandaki bir nesne, belge, fotoğraf, kişi ya da yer, adıyla ('This is a $100 trillion bank note from Zimbabwe.', 'These are five pictures of Tokyo, taken in the 1860s.', 'This man is the person the Taliban fear the most.'). Soyut atmosfer, sis, 'Imagine…' ile başlama.",
    "- Ya da SAHNENİN ORTASINDA aç: şimdiki zaman, fiziksel bir an, bir insan ('The gun is deserted. The ship is burning. Then an 18-year-old climbs up to that gun.', 'The explorers broke through the concrete seal into a tunnel nobody had entered for decades.'); yer ve tarih 2-3 cümle sonra gelir.",
    "- Kanıt sesiyle açmak da tutar: gerçek bir alıntı ya da kişinin kendi sözü, hemen kaynağıyla ('That's not a rumor from a comment section. It's a sentence from a book written by a man who was there.', 'The man you just watched is Mickey Rourke.'). Alıntı araştırmada gerçekten olmalı.",
    "- 20 saniye içinde çelişki ya da tezat: önce/sonra, beklenen/gerçek ('Eighty years later, Japan had aircraft carriers.', 'Microsoft tried this first. It worked. Then Microsoft quietly walked away.').",
    "- YAYGIN İNANIŞI YIK: izleyicinin bildiğini söyle, sonra boz ('Start with what you already know… Almost none of that is true.', 'Most people assume it's attitude. It's the opposite.', 'Here's what almost every headline skips.', 'It is stranger than the legend.').",
    // 22 Ekim 2026 (Fransa izlenme eğrisi + yazım denetimi): açılışa ~10 ayrı konum talimatı sıkışıyordu (üç parçalı vaat,
    // numaralı vaat, kim-kim haritası, fragmanlar, meta, "basics"…) ve hepsi uygulanınca ~90 sn'lik bir giriş çıktı;
    // 0:20-0:50 arasında izleyicinin dörtte biri gitti. Artık TEK bir açılış çizelgesi var.
    "- AÇILIŞ ÇİZELGESİ (tek ve bağlayıcı; aşağıdaki bütün açılış kuralları bunun içinde, ilk bölüm ~55 sn): 0-15 sn: an, çelişki ya da tek somut şey; 15-30 sn: konunun adı ve izleyicinin kafasındaki SORU; TEK cümlelik vaat (en çok ~20 kelime, liste değil: 'By the end, you'll know why the dam failed on the one night it mattered.'); izleyici çağrısı varsa ~8 sn; HEMEN ARDINDAN henüz söylenmemiş EN GÜÇLÜ olgu; bölüm o olgunun açtığı yeni soruyla biter. Açılışa GİRMEYENLER: ikinci ve üçüncü vaat, 'Along the way…' fragman listesi, oryantasyon/'the basics' özeti, harita turu, süreç cümlesi ('As I record this…'). Bunlar gerekiyorsa 2. bölümün içinde, bir olayın parçası olarak gelir. Vaat edilen her şey videoda cevaplanır.",
    "- Her büyük sayı tanıdık bir ölçüye bağlanır: bir şehir, bir stadyum, bir ülke, bir ünlü şirket ('closer to Chicago than to Moscow', 'about 2% of America's entire GDP', '1,300 tons — about the same as 1,000 passenger cars').",
    "- İLK CÜMLEDE TARİH YOK (bizim videolarımızın yarısı 'October 29th, 1929, 10:00.' ya da 'Palm Sunday…' diye açılıyordu): ilk cümle çatışma, sonuç ya da imkânsız görünen şey; yıl ve yer 2-3. cümlede ('Richard Whitney single-handedly saved the market on Black Thursday. Nine years later, armed guards put him on a train to Sing Sing.'). İSTİSNA: saatiyle bir AN, yani cümlenin içinde bir şey OLURKEN verilen tarih serbesttir; tek başına başlık gibi duran kuru tarih yasaktır. Örnek AN, 4,1 milyon izlenen Nepal açıklayıcısının açılışı: 'At 37 minutes past 8 in the morning on the 26th of August, a mountain on the border between Nepal and Tibet came apart. Not a landslide, not an earthquake, though seismometers recorded it as one.' Burada an, olumsuzlama ve ölçek ilk 15 saniyede geliyor.",
    "- BİYOGRAFİ VE ARKA PLAN DÖKÜMÜ YOK: ilk 2 dakikada geçmiş (doğum yeri, çocukluk, antlaşmalar, kurum tarihçesi) en çok 20 saniye ve yalnızca ana olayı açıklıyorsa; vaat edilen cevabın İLK PARÇASI 30. saniyeden önce gelir (Napolyon: 'Hiçbir savaş yok etmedi, peki ne?' dediysen 22. saniyede Tilsit Antlaşması değil, sınırı geçtikleri ilk haftada ölen 10.000 at). Ana omurgaya hizmet etmeyen yan hayat ayrıntısı (Bakker'ın 1998 evliliği, 2002'de evlat edinmesi) hiç girmez.",
    "- Dil sade ve konuşur gibi; yeri gelince izleyicinin bildiği bir yanlışı düzelt ('Most people think X. It isn't.'). Edebi süs ve gizemli yarım cümle yok.",
    ...(news ? [
      "- HABER: herkesin takip ettiği BÜYÜK hikâyeyle aç, küçük olayı onun içinde bir çelişki olarak sor ('America is fighting Iran. So why are missiles from Yemen heading towards Saudi Arabia?' — Inside Decoded, 4.200 abone, 172 bin; bizim aynı konudaki videomuz 14 izlenme).",
      // 20 Ekim 2026 derin inceleme (9 haber açıklayıcısı satır satır): 7'sinin ortak omurgası çelişki sorusu → vaat →
      // kim-kim haritası; ilk %10'da en yüksek izleme Inside Decoded'ın kim-kim haritasında (0,63). 22 Ekim: harita ve
      // oryantasyon açılıştan çıktı, 2. bölümün başına (Fransa'da açılışa sıkışınca giriş 90 sn'ye uzadı).
      "- HABER OMURGASI (çelişki sorusu): ilk 15 sn'de çelişki SORUSU; açılış çizelgesindeki TEK cümlelik vaat; 2. bölüm bir 'kim kim' HARİTASIYLA (map sahnesi, aktörler/ülkeler söylendiği sırayla, en çok ~30 sn) ve bu haftanın ilk olayıyla açılır. Videonun geri kalanı vaadi öder, son bölüm açılış sorusunu adıyla cevaplar.",
      "- Haber taze ve tarihli: 'this week', 'On Thursday, the stock dropped 21%', ardından yetkilinin çelişen sözü ve 'Then why…?' (Statrys, 393 abone, 871 bin). Eski bir olay yeni gibi sunulmaz.",
    ] : []),
  ];
}

/*
 * ANLATIM SESİ (16 Ekim 2026): 15 küçük kanal patlamasının TAM transkripti baştan sona, bizim son 8 senaryomuzla
 * aynı ölçüyle (docu-engine/lib/edit-scorecard.mjs narrationStyle). Patlamalar: cümle ort. 14,7 kelime (ortanca 13),
 * ≤8 kelimelik cümle %29, 25+ kelime %12, dakikada 0,3 soru, izleyiciye "you" 100 kelimede 1,0, kısaltma 2,0.
 * Biz: 8,9 kelime, kısa %48, 25+ %0,4, 0,8 soru/dk, "you" 0,2, kısaltma 1,1 — kesik, sürekli teaser soran, sayı
 * yağdıran ve izleyiciyle hiç konuşmayan bir anlatım. Hidden History ile bizim Black Buck aynı türden hikâye:
 * onlarda sıfır teaser sorusu, kronolojik neden-sonuç zinciri, aksiyonda kısa / açıklamada uzun cümle, "you" ile akıl
 * yürütme ("Here's what you need to understand about that moment… You couldn't outrun them, you couldn't outgun them");
 * bizde "Whether it mattered was another question" 3 kez, "one code word" 5 kez, "The Waddington Wing." gibi yarım cümleler.
 * Açıklayıcı ve finans (Iron Circuit, Statrys): sorun izleyicinin hayatından başlar, mekanizma düz zincirle anlatılır,
 * iddia/tahmin/bilinmeyen dürüstçe ayrılır ("That's the company's own claim", "designed to last 25 years, not
 * demonstrated"), az sayı tutulur ("Hang on to that number"), anlatıcının ölçülü kendi sesi ("My honest take?").
 */
/*
 * KAMERA ARKASI YOK (16 Ekim 2026, kanalın Studio verisi + transkriptleri): Super El Niño videosunda anlatıcı izleyiciye
 * "These figures were not in our original research file. They were flagged for checking before broadcast.", "The brief
 * for this video names a 2026 Hormuz shock.", "Our research file could not verify what happened there." okudu —
 * ortalama izleme 22,5 sn (%2). Kızıldeniz: "In the public sources we could check, that is not confirmed.", "Our sources
 * still cannot say." Suudi–Husi: satırların %12'si kaynak atfı ("according to…", "Reuters reported…"); patlayanlarda en
 * çok %6,6 (Inside Decoded), çoğunda %0-1,5. Panama (%45 izlenme) ise hiç kamera arkası konuşmadan, düz hikâye.
 */
export const BACKSTAGE = /\b(?:research (?:file|brief|dossier|notes?)|our (?:original )?research|our (?:sources|source|file|files|brief|notes|team)\b|the brief (?:for|also|says|names|mentions|calls|describes)|this brief\b|(?:for|before) (?:broadcast|publication)\b|flagged for (?:checking|review|verification)|fact[- ]?check(?:ed|ing|ers?)?\b|editorial (?:frame|framing)|(?:sources|reports) we could (?:check|find|verify)|we (?:could|can)(?:not|n't) (?:verify|confirm|find)|could not be verified by us)/i;

/** Narration lines that talk about our own research process instead of the story. */
export function backstageLines(scenes = []) {
  return (scenes || []).map((s) => String(s?.say || "").replace(/\[[^\]]*\]/g, " ").trim()).filter((t) => t && BACKSTAGE.test(t));
}

/*
 * OKUMA (16 Ekim 2026): seslendirme "Ankara's"ı "Anchora's", "$109.29"u "$1929", mil olan "21 m"yi metre okudu.
 * Yeni yazılan satırlarda kısaltılmış birim ve kuruşlu para yazıyla açılır; söylenen = ekranda yazan kalır (altyazı
 * satırın kendisinden). Yalnızca yeni bölümler (önbellekteki bölümler ve ödenmiş sesler değişmez).
 */
export function spokenFix(say) {
  let t = String(say || "");
  t = t.replace(/\$(\d+(?:\.\d+)?)\s?(?:bn|b)\b/gi, "$$$1 billion");
  t = t.replace(/\$(\d+(?:\.\d+)?)\s?(?:mn|m)\b/g, "$$$1 million");
  t = t.replace(/\$(\d+(?:\.\d+)?)\s?(?:tn|t)\b/gi, "$$$1 trillion");
  t = t.replace(/\$(\d{1,3}(?:,\d{3})*)\.(\d{2})\b(?!\s*(?:billion|million|trillion)\b)/gi, (m, d, c) => (c === "00" ? `${d} dollars` : `${d} dollars and ${Number(c)} cents`));
  t = t.replace(/(\d)\s?mi\b/g, "$1 miles");
  t = t.replace(/(\d)\s?km\b/g, "$1 kilometers");
  t = t.replace(/(\d)\s?mph\b/gi, "$1 miles per hour");
  t = t.replace(/(\d)\s?kph\b/gi, "$1 kilometers per hour");
  return t;
}

/*
 * "YAKLAŞIK" + KESİN SAYI YOK (16 Ekim 2026, Ebola: "about 81,124 people live in 22 displacement sites"): yaklaşıklık
 * sözüyle birlikte gelen 4+ haneli kesin sayı iki anlamlı basamağa yuvarlanır — about/around/roughly → en yakın,
 * more than/over → aşağı, nearly/almost/under → yukarı. Kesin sayı (yaklaşıklık sözü olmadan) aynen kalır.
 */
const ABOUT_NUM = /\b(about|around|roughly|approximately|some|more than|over|nearly|almost|under|fewer than|less than)\s+(\d{1,3}(?:,\d{3})+)\b(?![.,]\d)/gi;
/** [word, number] after rounding; "nearly 4,410" would claim 4,500, so a far ceiling turns into "more than 4,400". */
const roundedOf = (word, num) => {
  const n = Number(num.replace(/,/g, ""));
  const step = 10 ** Math.max(0, String(n).length - 2);
  if (n % step === 0) return [word, num];
  const fmt = (x) => x.toLocaleString("en-US");
  const w = word.toLowerCase();
  if (/^(more than|over)$/.test(w)) return [word, fmt(Math.floor(n / step) * step)];
  if (/^(nearly|almost|under|fewer than|less than)$/.test(w)) {
    const up = Math.ceil(n / step) * step;
    if (up - n <= n * 0.01) return [word, fmt(up)];
    return [/^[A-Z]/.test(word) ? "More than" : "more than", fmt(Math.floor(n / step) * step)];
  }
  return [word, fmt(Math.round(n / step) * step)];
};
export function roundAbout(line) {
  return String(line || "").replace(ABOUT_NUM, (m, word, num) => roundedOf(word, num).join(" "));
}
/** roundAbout on a scene's line; the same number on its screen text (words text/keyword, caption) follows. */
export function roundAboutScene(s) {
  if (!s?.say) return s;
  const pairs = [];
  s.say = String(s.say).replace(ABOUT_NUM, (m, word, num) => {
    const [w, r] = roundedOf(word, num);
    if (r !== num) pairs.push([m, `${w} ${r}`], [num, r]);
    return `${w} ${r}`;
  });
  for (const k of ["text", "keyword", "caption"]) if (typeof s[k] === "string") for (const [a, b] of pairs) s[k] = s[k].split(a).join(b);
  return s;
}

export function honestyLines({ news = false } = {}) {
  return [
    "KAMERA ARKASI YOK (kanalın kendi verisi: El Niño videosunda anlatıcı 'These figures were not in our original research file' dedi, izleyici 22. saniyede gitti): anlatım dünyayı anlatır, bizim çalışma sürecimizi değil. ASLA: research file, brief, our sources, our research, the sources we could check, flagged for checking, before broadcast, fact-check, editorial framing, 'we could not verify'. Doğrulanamayan bilgi metne HİÇ girmez — onun hakkında konuşulmaz, atlanır.",
    "- Belirsizlik gerekiyorsa dünyanın diliyle ve yalnızca hikâyenin merkezindeki tartışmalı iddiada: 'Saudi Arabia says the strike came from Yemen. The Houthis deny it.' Kaynak adı ('Reuters reported') bölümde en çok 2 kez, yalnızca çarpıcı ya da tartışmalı iddiada; tarih/saat farkları ('the 25th or the 26th') ve kaynakların birbirini doğrulamaması anlatılmaz. Kurum kısaltmalarını yığma: en önemli bir-iki kurum adıyla.",
    "- OKUNUŞ: birimler kısaltmasız ('21 miles', '35 meters', not '21 mi', '21 m'); kuruşlu fiyat yuvarlanır ('about four dollars forty a gallon'); büyük para en çok bir ondalık ('$44.5 billion'); yabancı yer adına iyelik eki ekleme ('the government in Ankara', not 'Ankara's').",
    ...(news ? ["- GÜNDEMDE TARİH: güncel krizde tarihsel arka plan en çok BİR emsal ve 60-90 saniye (veba videosu 2. dakikada 1338 Kırgızistan'a gitti, izleyici tam orada çıktı); sonra hemen bugüne dön."] : []),
    // İkinci dış analiz + ölçüm (16 Ekim 2026): bizde dakikada 2,5-5,4 tarih (El Niño 5,4, Kızıldeniz 4,0, Suudi 3,2),
    // patlayanlarda 0-1,6; Jim Bakker 14 dakikada 26 tarih. Videolarımızın yarısı ilk cümleye tarihle başlıyor.
    "- TARİH AZ, BAĞLAÇ ÇOK: dakikada en çok ~2 tarih/yıl (patlayanlar 0-1,6; bizimkiler 2,5-5,4). Olaylar 'so', 'but', 'until', 'which is why' ile bağlanır, takvim yaprağı çevrilmez ('In 1966… In 1973… In 1974…' değil). Tarih yalnızca dönüm noktasında ya da sayının anlamı için.",
    // Ebola gündem videosunun son okuması (16 Ekim 2026): elle düzeltilen hatalar.
    "- ADIL KIYAS: sayı yalnızca kendi türüyle kıyaslanır ('70,000 doses' ile 'five million displaced people' değil — aşı herkese değil temaslılara ve sağlık çalışanlarına yapılır). Benzetme olguyu çarpıtmamalı.",
    "- İSİM: bir yetkiliyi adıyla yalnızca adı araştırmada birden çok ya da birincil kaynakta geçiyorsa an; yoksa unvanıyla ('the WHO's incident manager in Congo'). Yanlış yazılmış bir isim bütün videonun güvenini düşürür.",
    "- MANTIK: her cümle bir öncekiyle çelişmesin ('a vaccine needs nobody's trust' yanlış — aşı da güven ister). 'Until then', 'that', 'it' gibi bağlar hemen önceki cümlede neye bağlandığı açık olmadan kullanılmaz.",
    "- TEKRAR: aynı olgu art arda iki sahnede yeniden anlatılmaz (Kenya yolculuğu üç kez söylendi); aynı alıntı videoda en çok iki kez — açılışta ve kapanışta.",
    "- BİLİNMEYEN = GİZEM: kesinleşmemiş olanı 'bilmiyoruz, bekleyeceğiz' diye frenleme; olgulardan kurulmuş açık bir soruya çevir ('Moscow calls it pneumonia of unknown cause. So why lock sixty staff inside the building and quarantine two hundred people?'). Yalan yok: soru olgulardan çıkar, cevap uydurulmaz; videonun sonunda en çok bir kez 'what we still don't know'.",
  ];
}

/*
 * Patlayanlar TEK bir sesle konuşmuyor (16 Ekim 2026, 15 tam transkript): belgesel hikâye (Hidden History, Frontline,
 * Last Life, Base Central — üçüncü şahıs, uzun akan cümle, "you" neredeyse yok), sunuculu açıklayıcı (Iron Circuit,
 * Statrys, Nolan — "I/my honest take", sohbet, dürüst ayar), kanıt/soruşturma (Wrongly Assumed, Militopia, Vlad),
 * sakin haber (Inside Decoded — kısa düz cümle, her iddianın dayanağı, "you" çok az), esprili/maskotlu (Kelevin,
 * MonkeyExplains, Well.). Ortak olan: kanal kendi sesinde tutarlı, neden-sonuçla akan anlatım, somut ayrıntı, dürüst
 * kanıt. Bizim "fragman sesi" (yarım cümle + tekrar eden teaser) hiçbirinde yok. Her kanal kendi sesiyle yazar:
 * tarih = belgesel hikâye + kanıt; gündem = sakin haber; finans/bilim = sunuculu açıklayıcı.
 */
export const VOICE_STYLES = {
  story: [
    "SES — BELGESEL HİKÂYE + KANIT (tarih kanalı; Hidden History, Frontline Echoes, Vlad, Militopia): üçüncü şahıs, kronolojik, olaylar neden-sonuçla akar; bağlam uzun ve akan cümlelerle, aksiyon kısa seriyle. 'you' ölçülü: akıl yürütmede ('Here's what you need to understand about that moment.') ve ortada bir kez sahneye sokmada ('Picture the deck at 8:52 that morning…'). Anlatıcı 'I' demez, espri yok.",
    "- Kanıt: kaynağın kendi sözü ve yorumu ('Haney writes…', 'Notice the language.'), tek bir vakayı yakından anlat (tek bir iskelet: 'Towton 25'), itirazı kendin getir ('There is an obvious objection, and it is a fair one.'), efsaneyi gerçekle tart ('Honestly, the true version is more impressive than the myth.').",
    "- DRAMATİK KESİNLİK (Cannae videomuz akademik makale gibiydi: 'The surviving account does not let us measure how neatly each unit withdrew…'): olayı sahnede, insanlarla anlat — çember daraldıkça kılıcını çekemeyecek kadar sıkışan lejyonerler, öndekini ezen arkadakiler, ses, toz, korku. Kaynağın sınırı videoda en çok BİR kez ve tek cümle ('Polybius is our only witness, and he wasn't there.'); 'the account does not let us…', 'we cannot separate…' gibi akademik çekinceyle cümle kurma. Uydurma yok: sahne kaynaktaki olgulardan kurulur.",
  ],
  news: [
    "SES — SAKİN HABER (gündem kanalı; Inside Decoded, 4.200 abone / 172 bin): düz, tam ve kısa-orta cümleler (11-14 kelime); hikâyenin merkezindeki tartışmalı iddia ölçülür ('That supports the fact of the strike. It does not prove what cargo the aircraft carried.', 'A launch, an interception, and a confirmed impact are different facts.'), geri kalanı düz anlatılır; kaynak adı bölümde en çok 2 kez (Inside Decoded'da satırların %6,6'sı, bizim Suudi videosunda %12); espri ve anlatıcı yargısı yok; gündelik benzetme ('Think of a busy harbor with one narrow driveway.').",
    // 19 Ekim 2026, kanal sahibi "ekle": Hürmüz senaryosu 100 kelimede 0,05 "you" (tutmuşlar ~1; Ebola 0,25). Sakin haber
    // sesi izleyiciyi yine de olayın içine alır — yalnızca etkinin ve bakılacak yerin söylendiği satırlarda.
    "- İZLEYİCİYE HİTAP ölçülü: 'you' 100 kelimede yaklaşık yarım (bölümde 1-2 kez), yalnızca olayın izleyiciye dokunduğu ve neye bakacağının söylendiği yerde ('If you filled up a car this week, this strait is part of the reason.', 'What you're looking at is the lane Washington says it swept.', 'When you see a ship's name in a UKMTO bulletin, that is the confirmation.'). Hitap bilgi taşır: 'you won't believe', 'stay with me', 'imagine you're…' gibi doldurma ve dramatik çağrı yok; her paragrafa 'you' serpiştirme yok.",
    // 20 Ekim 2026 derin inceleme: 16,7 bin aboneli kanalın 4,1 milyon izlenen Nepal açıklayıcısı güvenini ilk şahısla
    // kurulmuş bir dürüstlük çerçevesiyle kazanıyor; bizim haber sesimizde anlatıcı hiç "I" demiyordu.
    // 21 Ekim 2026, Fransa videosu izleyici notu: 0:30'daki "As I record this… I'll keep three things apart" cümlesi dürüst ama
    // kancanın heyecanını frenledi; hemen ardından gelen paradoks ("40 derecelik sınıftan yanan belediye binasına") ve
    // "we lost control" itirafı videonun en güçlü yerleriydi.
    "- DÜRÜSTLÜK ÇERÇEVESİ (ilk şahıs, ölçülü) İLK DAKİKADA YOK: kanca ve vaatten sonra hemen hikâyenin paradoksu ve en güçlü olgusu gelir; süreç anlatan meta cümle ('As I record this…', 'I'm going to keep three things separate…') ilk 60 saniyeye girmez. Gerekirse, hikâye gerçekten belirsizse, ilk bölümden sonra TEK kısa cümle ('Some of this is still unconfirmed, and I'll flag it when it is.') ya da kapanıştaki 'what we still don't know' kısmında. Videoda EN ÇOK 2 'I' (20 Ekim 2026 derin inceleme: 'I' gerçek sunuculu kanallarda çalışıyor; yapay seste dürüstlüğü daha çok kaynak taşır): bu çerçeve ve gerekirse kapanıştaki güncelleme sözü ('When the report comes out, I'll come back and update this.'). Belirsizliğin asıl taşıyıcısı KAYNAKLA DÜRÜSTLÜK: tartışmalı iddia kim söylediyle ve durumuyla ('Reuters reported it; it has not been confirmed.', 'That is the ministry's figure, a dated estimate, not a final total.'). Anlatıcı yargısı ve espri yine yok.",
  ],
  host: [
    "SES — SUNUCULU AÇIKLAYICI (finans/bilim; Iron Circuit, Statrys, Nolan Matthias): izleyiciyle sohbet eden bir anlatıcı ('you' bol ve doğal: 'Every time you ask an AI a question…'), sorun izleyicinin hayatından başlar, mekanizma düz zincirle anlatılır, işaretli listeler ('Problem number one, maintenance.', 'Rule number two:').",
    "- DÜRÜST AYAR: iddia, tahmin ve bilinmeyen ayrılır ('That's the company's own claim.', 'designed to last 25 years, not demonstrated', 'To be precise, because the headlines this week were not: AirAsia has filed nothing.'); kapanışa yakın kısa karne: What's real / What's claimed / What's still unknown.",
    "- TİPİK KİŞİYLE HESAP: soyut riski tipik kişilerle hesapla ('Maya buys a fund with cash, Leo buys options, Sam borrows… the fund falls 30%: Maya is down $3,000, Leo is wiped out, the bank sells Sam's shares'; 'Let's say Xiaoming earns an average salary… it would take him 42 years.').",
    "- HAKKINI VER ('Here's what makes this story better than the outrage version: the breakthrough was real.'); ANLATICININ SESİ ölçülü: bölümde en çok bir kişisel yargı ('My honest take?') ve en çok bir kuru espri ('Oh, and he ordered hundreds of new Airbus jets. Bad timing.').",
  ],
};

/** Kanal sesi: gündem = news, finans/bilim = host, gerisi (tarih, belgesel) = story. */
export function voiceStyleOf({ news = false, finance = false, explain = false } = {}) {
  return news ? "news" : finance || explain ? "host" : "story";
}

export function voiceGrowthLines({ style = "story" } = {}) {
  return [
    "ANLATIM SESİ (tutmuş 15 videonun tam transkripti ölçüldü, Ekim 2026 — beş farklı ses var ama hiçbiri bizim 'fragman sesimiz' değil: yarım cümle + tekrar eden teaser):",
    "- AKAN CÜMLE: ortalama 11-16 kelime (tutmuşlar 9,6-24,2, bizimkiler 7,9-9,8). Aksiyon anında kısa cümle serisi serbest ('He aimed. He fired. He loaded again. Five times.'), bağlam ve açıklama bağlı cümlelerle. Yarım cümle/etiket satırı ('The Waddington Wing.', 'About sixteen hours.') ve '…one.' gibi yapay duraklama yok.",
    "- HİKÂYEYİ ANLAT, TEASER YAĞDIRMA: soru cümlesi az (videoda 4-6; tutmuşlar dakikada ~0,3), aynı merak kalıbı ('Whether X was another question', 'one code word') videoda en çok bir kez; motif kelime en çok 2-3 kez.",
    "- İNSAN VE AYRINTI: her kişi tek akılda kalan ayrıntıyla tanıtılır ('Her name was Stier, German for bull. She was named after the star sign of her captain's wife.'); somut insani ayrıntı soyut özetten iyidir ('malted milk tablets and pemmican').",
    "- SAYI AZ VE TUTULU: her sayı bir iş görür; ana sayı önceden işaretlenir ve sonra ödenir ('Hang on to that number, because it's the one in the title.'); tartışmalı sayı dürüstçe ('a floor rather than a ceiling').",
    "- GÜNDELİK BENZETME: her bölümde 1-2 tane, izleyicinin elindeki şeyden ('like a can of Coke', 'stacked like a lasagna', 'chemically similar to household drain cleaner').",
    "- TEMA CÜMLESİ: hikâyenin özünü erken tek cümlede ek ve sonda öde ('Remember that. It is the whole story.' … sonda 'The same pride that… The same pride that…'). Tartışmalı yerde iki tarafı ver ('That is his side. The landlord's side is in the court papers.'); soruyu yeniden çerçevele ('So the real question isn't X. It's this: …').",
    "- Konuşma dili kısaltmaları doğal (it's, didn't, couldn't).",
    ...(VOICE_STYLES[style] || VOICE_STYLES.story),
  ];
}

/*
 * ORTA VE SON (16 Ekim 2026): 15 küçük kanal patlamasının TAM transkripti — yeniden kanca cümleleri, orta noktada vaadin
 * hatırlatılması, son 90 sn. 15'in 7'si sonda açılış sorusuna AÇIKÇA döndü ("So, back to the question I opened with",
 * "That is the answer to the question we started with", "So, the story the title promises resolves like this");
 * ortada vaadi hatırlatanlar (Iron Circuit %48 "And remember that title promise?", Hidden History %82-88 "Remember the
 * promise at the start… Now, the number I promised you"); dönüş cümleleri düz ("Here's where it gets uncomfortable",
 * "So, here's what's actually going on"); haber/finans "izlenecek işaretlerle" biter ve aboneyi o güncellemeye bağlar.
 */
export function middleGrowthLines() {
  return [
    // 22 Ekim 2026 yazım denetimi: buradaki örnek köprüler ("Here's where it gets uncomfortable", "But here's the thing")
    // Fransa'da birebir kopyalandı ve zirveden sonraki boş yorum bloğunu kurdu. Hatırlatma artık bir OLGUYLA yapılır.
    "ORTA NOKTA (küçük kanal patlamaları, tam transkript, Ekim 2026): bu bölümde açılıştaki soruyu/vaadi AÇIKÇA bir kez hatırlat — ama yeni bir OLGUYLA: önce olay ya da sayı, sonra o olgunun soruyu nasıl değiştirdiği (kalıp: [yeni olgu]. [Bu olgu açılıştaki soruyu şöyle değiştiriyor]). Dönüş cümlesi düz ve bilgi taşır; tek başına duran köprü cümlesi (bilgi taşımayan 'işte asıl mesele burada' türü) yazma, süslü geçiş yok.",
  ];
}

/*
 * BÖLÜM OMURGASI (20 Ekim 2026 derin inceleme: 39 tutmuş videonun HEPSİ satır satır, kanal sahibi "hepsini ekle önerdiğin
 * gibi yap"; rapor quality-review/deep-study-20261019/RAPOR.md §9). Dört grupta ortak: her 30-90 sn'de tek cümlelik
 * dönüş; her önemli sayı tanıdık bir şeyle (en çok tekrar izlenen anlar bu kareler: bomba Güneş'in yanında, uçak gemisi
 * "Charles de Gaulle Havalimanı'ndan yoğun", "piyasa değeri < CEO'nun bir yıllık maaşı"); haberde her bölüm alt soruyla
 * açılıp "X değil, Y" ve tek benzetmeyle kapanıyor; "nasıl buraya geldik" domino zinciri (Klaus 11× abone); iki
 * replikli mini diyalog (Klaus'un 3 zirvesinin üçü).
 */
export function spineLines({ news = false, story = false, first = false, last = false } = {}) {
  return [
    "BÖLÜM OMURGASI (tutmuş 39 videonun hepsi satır satır, Ekim 2026):",
    "- YENİDEN KANCA: her 60-90 sn'de (~150-220 kelimede bir) tek cümlelik dönüş — 'X değil, Y' ('A threatened passage is not automatically a closed passage.') ya da soru + olumsuz cevap ('So how do they guard it? They don't.'). Dönüş bir OLGU taşır; bilgi taşımayan köprü cümlesi sayılmaz. Olay olarak söylenir, süs olarak değil.",
    // 22 Ekim 2026 yazım denetimi: kurallardaki 132 örnek cümle senaryolara birebir giriyordu ("First, the basics",
    // "Here's where it gets uncomfortable", "Think of…"). Örnek kalıbı gösterir; cümlenin kendisi bu hikâyeden yazılır.
    "- ÖRNEKLER KALIPTIR: bu talimatlardaki İngilizce örnek cümlelerin hiçbiri senaryoya birebir ya da yarı değişmiş girmez; kalıbı al, cümleyi bu hikâyenin olgularından yeniden kur. Kod, kopyalanan örnek cümleyi bulup son okumada yeniden yazdırır.",
    "- TANIDIK KARŞILIK: bu bölümün her önemli sayısı (büyük para, kişi sayısı, mesafe, süre, sıcaklık) aynı ya da hemen sonraki cümlede izleyicinin bildiği bir şeyle verilir: bir şehir, insan boyu, bir maaş, bir havalimanı, Güneş ('hotter than the core of our sun', 'busier than Charles de Gaulle airport', 'worth less than its CEO's pay for one year'). Karşılık yalnızca araştırmadaki olgularla kurulur; yoksa sayı oranla verilir ('for every dollar spent, eighty more').",
    ...(news && !first ? ["- HABER BÖLÜMÜ: bölüm, cevapladığı ALT SORUYLA açılır (bölüm kartı da o soruyu taşıyabilir) ve bir 'X değil, Y' ifşası + TEK gündelik benzetmeyle kapanır."] : []),
    ...(news ? ["- ARKA PLAN = DOMİNO ZİNCİRİ: 'nasıl buraya geldik' anlatılıyorsa her olay bir öncekinin sonucu olarak açılır ('Which is why…', 'And that is what led to…'); tarih yaprağı çevrilmez."] : []),
    // Fransa videosu izlenme eğrisi (22 Ekim 2026): "we lost control" zirvesinden (6:34) sonra Macron'un suçlaması, "here's
    // where it gets uncomfortable", "the government's account is not the only one", hak örgütleri — 6:50-8:14 arası kalan
    // izleyicinin yarısı gitti (%27 → %15). Zirveden sonra somut gelir; yorum bloğu kısa ve olgulu.
    "- ZİRVEDEN SONRA SOMUT: en büyük ifşadan/itiraftan/sayıdan hemen sonraki ilk dakika yeni bir OLAY, SONUÇ, harita ya da sayı taşır (ne oldu, kim ne yaptı, ne değişti). 'X şunu diyor, Y bunu diyor' yorum/analiz bloğu en çok ~30 sn (3-4 satır) ve her satırı bir olgu taşır (isim, sayı, tarih, yer); 'Here's where it gets uncomfortable', 'So the question is no longer…', 'And that is the problem.' gibi yorum köprüleri art arda gelmez.",
    ...(news && last ? ["- ZİNCİRİ KAPAT: arka planda domino anlatıldıysa son bölümde tek cümlede tekrar et ('The coup created the revolution. The revolution created the hostages…')."] : []),
    ...(story ? ["- DÖNGÜ DEFTERİ (tarih): kancada açılan her vaat, cevaplandığı bölümde ADIYLA geri çağrılır ('Remember the promise at the start? Here it is.', 'This is where we came in.'); ödeme videonun ikinci yarısındadır, ilk bölümlerde harcanmaz."] : []),
    "- MİNİ DİYALOG (isteğe bağlı, videoda en çok 2): iki tarafın araştırmada geçen GERÇEK iki kısa sözü art arda iki quote sahnesinde ('Trump called it eliminating imminent threats.' / 'Iran called it an act of war.'). Uydurma replik ve dramatize diyalog yok.",
  ];
}

export function endGrowthLines({ news = false, finance = false, series = "" } = {}) {
  return [
    "KAPANIŞ (15 patlamanın son 90 saniyesi; 7'si açılış sorusuna açıkça döndü):",
    "- Cevabı İŞARETLEYEREK ver: 'So, back to the question we started with…' ya da 'That's the answer to the question we opened with:' ve ardından TEK düz cümlelik cevap. İzleyici cevabın geldiğini duymalı.",
    "- Açılıştaki somut şeye (nesne, alıntı, cümle) geri dön ve onu yeni anlamıyla bir kez daha söyle ('Go back to that sentence one more time.').",
    "- Efsane düzeltildiyse gerçeği efsaneyle tart ('Honestly, the true version is more impressive than the myth.'). Son fikir bir ters çevirme olabilir ('As battles grew longer, wars grew shorter.').",
    "- Yorum sorusu varsa İKİ SEÇENEKLİ ve konuya özgü olsun ('The smartest idea in data centres, or a very expensive way to heat the ocean? Tell me in the comments.').",
    // 20 Ekim 2026 derin inceleme: 536 videosunun "ders" kuyruğunda izleyici son %10'da %1'e indi; çıplak biten AiTelly'nin
    // sonu en düşük; Klaus domino zinciriyle, Base Central "the answer to the question we started with… Pride" ile kapandı.
    "- DERS KUYRUĞU YOK: son 30 sn genel bir ahlak dersi ya da 'tarih bize şunu öğretiyor' değildir; SON CÜMLE açılıştaki somut imgeye, söze ya da soruya döner (videonun ilk satırındaki kelimeyle).",
    ...(news || finance ? ["- HABER/FİNANS KAPANIŞI: 'What to watch next' — izleyicinin takip edebileceği 2-3 somut, tarihli işaret ('watch three things: verified damage, the movement of ships, and whether any agreement covers other countries'). İzleyici çağrısı bu bölümdeyse onu bu güncellemeye bağla ('when that data comes out, we'll cover it here')."] : []),
    ...(series ? [`- SERİ ("${series}"): kapanış satırından hemen önce tek cümleyle serinin devam ettiğini söyle ('There are more stories like this in the series on the channel.'); başka bir bölümün adını uydurma.`] : []),
  ];
}

/*
 * SERİ ŞABLONU (15 Ekim 2026, küçük kanal patlamaları): hiçbiri "tek video şansı" değil. Her biri TEK bir başlık
 * şablonunu seri olarak kullanıyor ve neredeyse her gün ya da 2-3 günde bir atıyor; videoların çoğu yüzler-binler
 * alıyor, 10-20'de biri patlıyor. Biz her videoda başka kalıpta, seri kimliği olmadan atıyorduk.
 */
export const SERIES = [
  ["Kelevin", "Myths That Turned Out To Be True", "3.5M on 1.8k subscribers"],
  ["Well.", "All N [Regions] Stereotypes Explained", "117k-619k every time on 87 subscribers"],
  ["Militopia", "Why [Elite Unit] Operators Don't [Normal Thing]", "947k, daily"],
  ["Wrongly Assumed", "[Famous Mystery] Was Reanalyzed by AI", "1M"],
  ["Built Beyond", "China's [Megaproject] Just Failed", "230k on 566 subscribers"],
  ["Last Life Survival", "The Rise and Fall of [Place]", "189k, daily"],
  ["Base Central", "[Celebrity] Made MILLIONS. Now [Fall]", "59k on 98 subscribers"],
  ["Frontline Echoes", "They Opened a Sealed [Place] — [What Was Inside]", "321k"],
];

export function seriesLines() {
  return [
    "SERİ ŞABLONU (küçük kanal patlamaları, Ekim 2026): patlayan küçük kanalların hepsi TEK bir başlık şablonunu seri olarak kullanıyor, sık atıyor; 10-20 videoda biri patlıyor:",
    SERIES.map(([ch, t, r]) => `"${t}" (${ch}: ${r})`).join("; "),
    "Fikirleri bir SERİNİN bölümleri olarak öner: aynı şablon, her bölümde başka ünlü isim/yer ve aynı vaat. Şablon kısa, aranan adı taşır, her bölümde tekrar kullanılabilir.",
  ];
}

/*
 * 20 Ekim 2026 (kanal sahibi onayı): Short'un anlatımında uzun videoya çağrı yok — bağlantı İlgili video alanı ve
 * açıklamada. Planlayıcı yine de yazarsa o vuruş düşer (Fransa Short'ları "the full documentary separates fact from
 * guesswork" diye bitiyordu). "in the Channel" (Manş) bilerek yakalanmaz.
 */
export const SHORT_SELL_LINE = /\b(?:full (?:documentary|video|story|episode|breakdown)|on (?:our|this) channel|link (?:below|in the description)|watch the (?:whole|long|full) (?:thing|video|documentary)|the long version)\b/i;
/** Beats that only sell the long video are dropped (at least `min` beats stay). */
export function dropSellBeats(beats = [], min = 3) {
  const keep = (beats || []).filter((b) => !SHORT_SELL_LINE.test(String(b?.say || "")));
  return keep.length >= min ? keep : beats;
}

export function shortGrowthLines() {
  return [
    "FİYAT + NEDEN (kendi verimiz, Hürmüz 20 Ekim 2026): 'Why a Strait of Hormuz Tanker Pays $10 Million to Cross Once' kanalın en hızlı Short'u oldu (7 saatte 186, %115 izlendi, %66 kaydırmadı) — haberin içindeki somut bir fiyatı başlık ve ilk cümle yap, 'neden' sorusuyla aç. SHORT YAPISI (tutmuş Shorts'ların transkriptleri, Ekim 2026): 1) ilk cümle özne + uç iddia + bir sayı ('Remember GoPro? Their stock has plummeted 97%.', 'This man made $300,000, completely legally and tax free.'); 2) kısa soru: 'So what happened?' / 'Why?'; 3) 3-5 olgu, her biri bir sayı ya da isim taşır ve mekanizmayı anlatır ('The trick was…'); 4) son cümle en güçlü sonuç ya da en ağır ayrıntı ('total destruction', 'beat each other with clubs') ve AÇILIŞ CÜMLESİNE DÖNER (döngü: tekrar izleyen akışı kesintisiz duyar). Hızlı, sohbet dili; şiirsel ya da gizemli parça yok.",
    // 20 Ekim 2026 derin inceleme (12 Short + 5 altyazısı sonradan alınan, satır satır): kazanan Short'lar BAĞIMSIZ,
    // tek açılı ve CEVABI VEREN hikâyeler — GoPro Short'u 8 M (uzun videosu 235 bin), Johnny Harris nükleer bomba 8,5 M,
    // Grönland 7,8 M; uzun videodan kesilen fragmanlar en zayıf (Epic History 0,07-0,11× abone, Xerxes 275 bin).
    "BAĞIMSIZ HİKÂYE, FRAGMAN DEĞİL (kanal sahibi onayı, 20 Ekim 2026): Short uzun videonun TEK bir açısını baştan sona anlatır ve CEVABI VERİR — cevabı saklayıp uzun videoya satmaya çalışan Short kaybeder. Anlatımda uzun videoya çağrı YOK ('the full documentary', 'the full story is on the channel', 'link below'); bağlantı Short'un 'İlgili video' alanı ve açıklamasıdır. İsteğe bağlı: döngü cümlesinden sonra en çok 10 kelimelik GEREKÇELİ tek abone cümlesi ('If you want the next one explained, subscribe.'). Tempo: dakikada 156-180 kelime.",
  ];
}

/*
 * SHORTS KANCASI — İLK 3 SANİYE (16 Ekim 2026, kanal sahibinin getirdiği ders: Shorts'larının ve başka kanalların ilk 3
 * saniyesini tek tek inceleyen, kalanların oranı %73,8'e çıkan bir üretici). Shorts'u kimse seçmiyor, akışta önüne
 * çıkıyor; iş kaydıran parmağı durdurmak. Kanca iki parça: söylenen cümle VE ilk kare, aynı anda vurur. Beş kalıp
 * (her Short'ta biri ya da ikisi): sonucu başa koy ("133 videos, 5.4 billion views. How?"), ters köşe ("If AI gives you
 * nonsense, the problem isn't the AI." — doğru olmalı, "değil" anında ekrana damga), garip ama anlaşılır tek görüntü
 * ve ona işaret eden cümle ("We will never see this man's face."), izleyicinin sorusu (cevap saklanır ama mutlaka
 * verilir), karşılaştırma (iki şey yan yana, "Which one?"). Ekran: ilk kare dolu (kapak gibi çalışır), ilk saniyede
 * bir şey hareket eder (kesim/zoom/yazı), ekran yazısı en çok 4 kelime ve cümleyi TEKRARLAMAZ, TAMAMLAR (söz merak,
 * yazı kanıt: "None of these accounts are real." + "538K FOLLOWERS IN 7 DAYS"). 3-10. saniye: vaadin ilk parçası
 * hemen; "first you need to know…" ile yavaşlama yok. Yasak: selam, logo, "in this video I'll show you". En iyisi:
 * ters köşe + ilk karede hareket. Studio'da 2 gün sonra "kaydırıp geçen" oranı kötüyse içerik değil ilk 3 saniye
 * değiştirilip yeni Short denenir.
 */
export const SHORT_HOOK_PATTERNS = {
  result: "SONUÇ BAŞTA: hikâyenin en sonunda izleyicinin göreceği şey (rakam, bitmiş sonuç, önce/sonra) ilk cümlede ve ilk karede, ardından kısa 'How?' ('In 3 days, 2,700 strangers sent Mickey Rourke $100,000. He said no.')",
  contradiction: "TERS KÖŞE: izleyicinin inandığını söyle ve 'değil' de ('Delta Force operators rarely salute, and it isn't attitude.'); words = olumsuzluk kelimesi (NOT, ISN'T, DIDN'T, NEVER): söylendiği an ekrana çakılır. Yalnızca videonun gerçekten kanıtladığı bir ters köşe — yalan kanca kanalı kaybettirir",
  strange: "GARİP AMA ANLAŞILIR GÖRÜNTÜ: ilk karede TEK tuhaf, bir bakışta anlaşılan şey; ilk cümle ona işaret eder ('This ship is sitting on top of a hill.', 'Nobody has read a single sentence of this book.'). Karışık ekran değil, tek şey",
  question: "İZLEYİCİNİN SORUSU: kısa, 2 saniyede okunur, izleyicinin kafasındaki soru ('Why did 70 ships cross a hill?', 'What if the internet under the Red Sea went dark?'); cevap saklanır ama Short bitmeden MUTLAKA verilir",
  compare: "KARŞILAŞTIRMA: iki şey yan yana — eski/yeni, ucuz/pahalı, beklenen/gerçek; açılış üç kısa parça: A (kendi resmi), B (kendi resmi), 'Which one…?' ('A $4,500 ad. A $1 billion company. Which came first?'). İzleyici tahmin eder, doğru mu diye kalır",
};
export const SHORT_HOOK_KEYS = Object.keys(SHORT_HOOK_PATTERNS);

const NEGATION = /^(not|no|never|isn't|isnt|wasn't|wasnt|aren't|arent|weren't|werent|didn't|didnt|don't|dont|doesn't|doesnt|won't|wont|can't|cant|couldn't|couldnt)$/i;
const normWord = (w) => String(w || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/** The hook's screen text: at most 4 words (28 characters) that ADD to the sentence; one that only repeats it is dropped. */
export function screenText(screen, say) {
  const t = String(screen || "").replace(/\s+/g, " ").trim().toUpperCase();
  if (!t) return "";
  const words = t.split(" ");
  if (words.length > 4 || t.length > 28) return "";
  const spoken = new Set(String(say || "").split(/\s+/).map(normWord).filter(Boolean));
  const own = words.map(normWord).filter(Boolean);
  return own.length && own.every((w) => spoken.has(w)) ? "" : t;
}

/**
 * The planned opening's hook: its pattern, its screen text, and for a contradiction the negation word as the slam
 * ("the problem isn't the AI" → ISN'T lands when said). Mutates the opening beats' slam.
 */
export function shortOpeningPlan(op = {}, opening = []) {
  const pattern = SHORT_HOOK_KEYS.includes(op?.pattern) ? op.pattern : "";
  if (pattern === "contradiction") {
    for (const b of opening) {
      const neg = String(b.say || "").split(/\s+/).map((w) => w.replace(/[^\p{L}']/gu, "")).find((w) => NEGATION.test(w));
      if (neg) { b.slam = neg.toUpperCase(); break; }
    }
  }
  return { pattern, screen: screenText(op?.screen, opening.map((b) => b.say).join(" ")) };
}

export function shortHookLines({ previousPatterns = [] } = {}) {
  const used = previousPatterns.filter((p) => SHORT_HOOK_KEYS.includes(p));
  return [
    "SHORTS KANCASI — İLK 3 SANİYE (Ekim 2026; Shorts'u kimse seçmez, akışta önüne çıkar: iş kaydıran parmağı durdurmak). Kanca iki parçadır: söylenen cümle ve ilk kare AYNI ANDA vurur.",
    `- opening.pattern = aşağıdaki beş kalıptan biri (ikisini birleştirebilirsin; en iyi tutan: ters köşe + ilk karede hareket):${SHORT_HOOK_KEYS.map((k) => `\n  · ${k}: ${SHORT_HOOK_PATTERNS[k]}`).join("")}`,
    ...(used.length ? [`- bu videonun önceki Short'ları ${[...new Set(used)].join(", ")} kalıbıyla açıldı: bu Short BAŞKA bir kalıpla açılır (aynı içerik, yeni ilk 3 saniye).`] : []),
    "- Kalıp ne olursa olsun açılış cümlesi konuyu hiç duymamış birine kim/ne ve nerede/ne zaman'ı söyler (kanal verisi: konuyu söylemeyen şifreli açılış izleyicinin ~%40'ını 12 sn'de kaybetti).",
    "- İLK KARE DOLU: açılışın ilk resmi hikâyenin en çarpıcı GERÇEK görüntüsüdür (kapak gibi çalışır); logo, boş zemin, yazı kartı yok.",
    "- opening.screen = ekranda ilk kareden itibaren duran en çok 4 kelime; cümleyi TEKRARLAMAZ, TAMAMLAR — söz merak ettirir, yazı kanıt verir ('None of these accounts are real.' + '538K FOLLOWERS IN 7 DAYS'; 'He said no.' + '$100,000'). Tamamlayan bir kanıt yoksa boş bırak.",
    "- 3-10. SANİYE: açılıştan hemen sonraki ilk vuruş vaadin İLK PARÇASINI verir (sorulan sorunun ilk cevabı, ters köşenin ilk kanıtı, garip görüntünün ilk açıklaması). 'First, you need to know…' gibi yavaşlayan köprü yok.",
    "- YASAK: selam ('Hey guys', 'Welcome back'), logo/kanal tanıtımı, 'In this video I'll show you…' — söyleme, göster. Kamera arkası da yok: araştırma, kaynaklarımız, doğrulama süreci, 'not confirmed by our sources' Short'a girmez.",
  ];
}

/*
 * KURGU ÇALIŞMASI (14 Ekim 2026, 1.16.16): tutmuş 18 uzun video + 3 Shorts'un ilk 60 sn'si 2 sn'de bir kare kare
 * (Business Casual J.P. Morgan, Zimbabwe hiperenflasyon, Why Is Japan So Rich, Bronze Age Collapse, Year 536, Dollar
 * Shave Club, KFC, College, Taliban, Wendover, CaspianReport, PolyMatter…) ve kendi dört videomuz aynı ölçümle.
 * Onlar: kare dolu (tam ekran), ekran yazısı BİLGİ (sayı etiketi, isim+unvan, harita etiketi, liste, sayılı bölüm
 * kartı), ilk dakikada 1-3 canlı harita, hikâyenin tamamı erken tek grafikte, kanıt gerçek ekran görüntüsü, anlatım
 * ~165 kelime/dk. Biz: yazı kartı sahnelerin %24-30'u, harita 0, anlatım 106-124 kelime/dk.
 */
/**
 * `maps`: "Haritalı anlatım" sekmesi (job.docuMapMode = "haritali", Epik Tarih altında) — her yer haritada.
 * Kanal sahibi: "sadece haritalı videolar üretmek tuhaf olabilir, tarih kanalının altında sekme olmalı"; diğer
 * videolarda harita yalnızca yer hikâyenin parçasıysa gelir (dünya haritası yine her yer için çalışır).
 */
export function editGrowthLines({ maps = false } = {}) {
  return [
    "KURGU (tutmuş 21 videonun ilk dakikası kare kare, Ekim 2026):",
    maps
      ? "- YER = HARİTA (haritalı anlatım): anlatımda izleyiciye yeni bir ülke/şehir/bölge geçiyorsa bir map sahnesi (region \"world\", places [{label, lat, lon}] GERÇEK koordinat, countries = boyanacak ülkeler). İlk 90 saniyede en az bir harita; videoda 3-5."
      : "- HARİTA: yer hikâyenin parçasıysa (bir rota, bir cephe, bir ülkenin konumu) bir map sahnesi (region \"world\" dünyanın her yeri, places GERÇEK koordinat, countries = boyanacak ülkeler); her yer adına harita koyma.",
    "- EKRAN YAZISI BİLGİDİR: sayı (söylendiği kelimede), isim + unvan, yer, tarih, kısa liste, gerçek alıntı. Anlatımı tekrarlayan bir kelime ya da cümle kartı (words) YAZMA — words yalnızca bilgi taşıyan satıra, bölüm başına en çok 2; bilgisiz satır temiz, tam ekran bir fotoğraftır (photo).",
    "- HİKÂYE TEK GRAFİKTE: veri gerçekse ilk 60-90 saniyede bütün seyir tek grafikte (chart: yükseliş ve çöküş, iki ülkenin yarışı, borcun büyümesi).",
    // Küçük kanal patlamaları kare kare (16 Ekim 2026): Inside Decoded'ın krizi bayraklı harita, Hidden History'nin
    // sayıları nesne ("FIVE SHELLS LEFT" = beş mermi, "MORE THAN 300 MEN" = 300 asker), MonkeyExplains "30 MILLION" kalabalık.
    "- BAYRAKLI KRİZ HARİTASI: bugünün ülkeler arası krizi (1992 sonrası) map sahnesiyle, countries = taraflar: Nova bu ülkeleri kendi bayraklarıyla boyar (Inside Decoded, 4.200 abone / 172 bin: İran–Suudi–Yemen). Eski hikâyede ülke renkle boyanır.",
    "- SAYIYI NESNEYLE GÖSTER: küçük ve sayılabilir bir sayı (5 mermi, 17 şirket, 3 kablo) icons sahnesiyle — total/filled/label; sayaç yalnızca büyük sayılar ve paralar için.",
    // Orta ve son 2 dakika kare kare (16 Ekim 2026): Hidden History "THE FREIGHTER'S CHOICE: OUTRUN ✗ OUTGUN ✗ SURRENDER",
    // Inside Decoded "Who carried it out? ?", Wrongly Assumed "Statistics make it look like language. Structure makes it act like a machine."
    "- ORTADA: karar anını seçenek şemasıyla göster (flow: gemi → 'OUTRUN' / 'OUTGUN' / 'SURRENDER'); bilinmeyen açıkça bilinmeyen kalır ('Who carried it out? Public reporting has not said.'); videonun tezi bir kez, tek cümle olarak ekranda (words, keyword = tezin kilit kelimesi).",
    "- KANIT GERÇEK: manşet/belge yalnızca anlatım gerçekten bir habere ya da resmî belgeye dayanıyorsa, gerçek gazete adıyla; uydurma gazete ya da belge yok. headline sahnesi araştırmadaki bir makaleyse paper = o sitenin adı ('AL JAZEERA', 'REUTERS'), headline = makalenin KENDİ başlığının ilk kelimeleri, date = yayın tarihi: Nova o sayfanın gerçek ekran görüntüsünü başlığı sarıyla çizilmiş olarak gösterir (tutmuş kanalların kanıtı böyle).",
    "- BÖLÜM BAŞLIĞI SOMUT: bir sayı ya da nesne taşır ('The $4,500 Ad', 'Nineteen Days', 'The Missing Uranium'), en çok 5 kelime; 'Introduction', 'The Beginning', 'Aftermath' gibi boş başlık yok.",
    "- TEMPO: tutmuş anlatıcılar dakikada ~165 kelime konuşur. Cümleler akıcı ve bağlı (12-20 kelime); yapay \"...\" durakları ve [slowly]/[whispers] gibi yavaşlatan yönlendirmeler bölümde en çok bir kez.",
  ];
}

/*
 * SHORTS ETİKETLERİ (15 Ekim 2026, kanal verisi): El Niño Short'u "#history #dnasequencing #blackdeath" etiketleriyle
 * yayımlandı — veba videosunun etiketleri elle kopyalanmıştı; Nova'nın paketinde hiç etiket yoktu. Artık her Short
 * kendi etiketleriyle gelir: #shorts + niş + modelin önerdiği konu etiketleri, yalnızca BU Short'un başlığında,
 * açıklamasında ya da anlatımında geçen adlardan (geçmeyen etiket atılır).
 */
const foldTag = (s) => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function shortHashtags({ tags = [], title = "", description = "", narration = "", niche = "" } = {}) {
  const corpus = foldTag([title, description, narration].join(" "));
  const out = ["#shorts"];
  if (niche) out.push("#" + foldTag(niche));
  for (const t of Array.isArray(tags) ? tags : []) {
    const k = foldTag(t);
    if (k.length < 3 || k.length > 24 || !corpus.includes(k)) continue;
    const tag = "#" + String(t).replace(/^#+/, "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "");
    if (!out.some((x) => foldTag(x) === k)) out.push(tag);
  }
  return out.slice(0, 5);
}

/*
 * KENDİ KANAL VERİMİZ (Studio, 17 Eyl - 14 Ekim 2026). Uzun videolarda ortalama izlenme oranı:
 * Panama 7.7 depremi %45, GPS %37, Apollo 13 %33 — doğrudan olayla açılan, 11-13 dk videolar. En kötüleri en uzun
 * ve en yavaş olanlar: El Niño (18:42) 22 sn, 1066 (15:08) 18 sn, Cannae 18 sn. Tıklanma: "Panama's 7.7 Earthquake: Why
 * Wasn't It Worse?" %4,9, "The Yom Kippur War: 19 Days That Shook the World" %4,9; "Super El Niño 2026: Is It Really
 * Off the Charts?" %0,8 (jargon sorusu), "What If GPS Went Dark…" %0,6. Shorts'ta en iyi tutma: Yom Kippur %79,
 * Konstantinopolis 1453 "He Dragged 70 Ships Over a Hill" izleyici tekrar izledi (%119) — tek somut eylem + sayı.
 */
export const OWN_DATA = {
  // Hürmüz (20 Ekim 2026, ilk 7 saat, 1.16.16 mimarisi): 5:04 / 13:46 izlendi, önerilenlerin %45'i büyük İran savaşı
  // videolarının yanından; kapak "NO NAMES, NO PROOF?" %1,8 tıklandı → ChatGPT tam kapakları A/B testine kondu.
  bestRetention: [["Panama's 7.7 Earthquake: Why Wasn't It Worse?", "45% watched, 12:12"], ["Hormuz: Iran Says Two Tankers Hit Mines. Proof?", "37%, 13:46"], ["What If GPS Went Dark for 24 Hours?", "37%, 13:06"], ["Apollo 13: How Three Men Survived 200,000 Miles From Home", "33%, 11:12"]],
  worstRetention: [["Super El Niño 2026: Is It Really Off the Charts?", "22 s average, 18:42"], ["He Won the Battle of His Life. 19 Days Later, He Lost England (1066)", "18 s, 15:08"]],
  bestCtr: [["Panama's 7.7 Earthquake: Why Wasn't It Worse?", 4.9], ["The Yom Kippur War: 19 Days That Shook the World (1973)", 4.9]],
  worstCtr: [["Super El Niño 2026: Is It Really Off the Charts?", 0.8], ["What If GPS Went Dark for 24 Hours? The Hidden Clock", 0.6]],
  bestShorts: [["The Yom Kippur War: 19 Days That Shook the World", "79% watched"], ["He Dragged 70 Ships Over a Hill", "119% (rewatched)"], ["Why a Strait of Hormuz Tanker Pays $10 Million to Cross Once", "115%, 66% kept, 186 views in 7 h"]],
};

/** Paket ve başlık istemleri için kendi verimizden tek satırlık ders. */
export function ownDataLines() {
  return [
    "OUR OWN CHANNEL DATA (Studio, Sep-Oct 2026): titles that NAME the event with a number get clicked (" + OWN_DATA.bestCtr.map(([t, c]) => '"' + t + '" ' + c + "%").join(", ") + "); a jargon question does not (" + OWN_DATA.worstCtr.map(([t, c]) => '"' + t + '" ' + c + "%").join(", ") + "). Best kept: 11-13 minute videos that open on the event itself (Panama 45%, Apollo 13 33%); the longest, slowest ones lost viewers in ~20 s (El Niño 18:42, 1066 15:08). Best Shorts: one concrete action + a number ('He Dragged 70 Ships Over a Hill'), or one concrete price + why ('Why a Strait of Hormuz Tanker Pays $10 Million to Cross Once': 115% watched, the channel's fastest Short). Thumbnails: a cryptic composited cover ('NO NAMES, NO PROOF?') got 1.8% — the scene of the story + the subject in plain words wins.",
  ];
}
