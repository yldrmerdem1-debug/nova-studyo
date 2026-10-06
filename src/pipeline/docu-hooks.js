// GİRİŞ MANTIĞI KATALOĞU — her video başka türlü açılır.
//
// Kullanıcı (6 Ekim 2026): "her şeye vurucu giriş yapma, bu konu ciddi miydi bilemedim; Napolyon videosu
// güzel; bi öyle bi böyle çıksın, 50 tane farklı giriş mantığı koy, bu şu anda olan (slam) da olur."
// Eskiden her türün TEK sabit soğuk açılışı vardı (docu-script.js coldOpen): aynı türdeki her video aynı
// tip girişle açılıyordu. Şimdi senaristin önüne konunun tonuna uyan, kanalda son kullanılmamış 6 aday
// konur; o birini seçer (bible.openingLogic), bölüm 1 o mantıkla yazılır. Seçim kanal geçmişine yazılır.
//
// tones: hangi tür/formatlara uyduğu (documentary, crime, epic, science, inspire, finance, horror,
// news, ranking, whatif). short: Shorts açılışı olabilir mi + hangi Shorts biçimiyle (fragments,
// question, statement, quote, number).
import fs from "node:fs";
import path from "node:path";

const ALL = ["documentary", "crime", "epic", "science", "inspire", "finance", "horror", "news", "ranking", "whatif"];
const L = (id, ad, how, tones, short = null) => ({ id, ad, how, tones: tones === "*" ? ALL : tones, short });

export const HOOKS = [
  L("scene-promise", "Sahne + vaat", "Bir yer ve an kur (mevsim, nehir, sabah), ölçeği tek cümleyle büyüt, sonra izleyiciye cevabı vaat et: 'Midsummer, 1812. A river in Lithuania… By the end, one thin line will tell you where half a million men went.' Sakin, şok kelime yok.", ["epic", "documentary", "science", "inspire", "whatif"], "statement"),
  L("slam-fragments", "Üç parça + slam", "Üç kısa sözlü parça, ritimli; her biri bu hikâyeden somut bir şey (nesne, yer, sayı), üçüncüsü dönüş. Kelimeleri ekrana çakılır. Konu gerçekten sert/aksiyonsa kullan; ciddi haber/trajedide ve bilgi isteyen haber/finans konularında KULLANMA.", ["crime", "epic", "horror", "whatif"], "fragments"),
  L("one-question", "Tek soru", "Videonun merkez sorusunu doğrudan, sade bir cümleyle sor ve bir an sus. Soru cevabı merak ettirmeli, retorik olmamalı.", "*", "question"),
  L("ending-first", "Sondan başla", "Hikâyenin sonucunu ilk cümlede ver (kimin kazandığını, neyin battığını) ve asıl soruyu 'ama nasıl?' diye aç. Seyirci sonu bilir, yolu merak eder.", ["documentary", "crime", "epic", "finance", "inspire"], "statement"),
  L("ordinary-morning", "Sıradan bir sabah", "Her şeyin değişmesinden hemen önceki sıradan anı anlat: bir kişinin rutin sabahı, sakin bir sokak. Felaket söylenmez, sezdirilir.", ["documentary", "crime", "horror", "news", "epic"], "statement"),
  L("single-number", "Tek sayı", "Bir sayıyla aç (counter): ölçeği ya da bedeli taşıyan tek rakam; ikinci cümle o sayının ne olduğunu açıklar.", ["finance", "science", "epic", "ranking", "news"], "number"),
  L("contradiction", "Çelişki", "İki çelişen gerçeği yan yana koy: 'X dedi. Y oldu.' / 'Resmî açıklama şu. Yerel basın bu.' Seyirci hangisinin doğru olduğunu merak eder.", ["news", "crime", "finance", "documentary"], "statement"),
  L("object-close", "Tek nesne", "Hikâyeyi taşıyan tek bir nesneye yakın planla aç (bir saat, bir mektup, bir tüp, bir anahtar) ve onun neden önemli olduğunu sonra açıkla.", ["crime", "documentary", "horror", "epic", "news"], "statement"),
  L("quote-open", "Gerçek alıntı", "Gerçek, kaynaklı bir alıntıyla aç (kim, ne zaman söyledi belli); alıntı hikâyenin kalbine işaret etsin. Uydurma alıntı ASLA.", ["epic", "inspire", "news", "documentary", "finance"], "quote"),
  L("map-zoom", "Haritadan iniş", "Dünyadan/bölgeden olayın yerine in: 'Burası X. Buradan Y kilometre ötede…' Coğrafya hikâyenin parçasıysa.", ["epic", "news", "science", "documentary"], "statement"),
  L("timestamp", "Saat ve tarih", "Kesin bir tarih ve saatle aç ('2 Nisan 1979, sabah 06:00'), o dakikada ne olduğunu tek cümleyle söyle.", ["crime", "news", "epic", "horror", "science"], "statement"),
  L("myth-buster", "Yaygın yanlış", "Herkesin bildiği bir yanlışla aç ve 'bu doğru değil' de; video gerçeği gösterecek.", ["documentary", "science", "epic", "finance", "ranking"], "statement"),
  L("what-if", "Ya olsaydı", "Tek bir küçük değişikliği sor: 'Ya o gemi bir gün geç kalsaydı?' Sonra gerçekte ne olduğunu söyle.", ["whatif", "epic", "science", "finance"], "question"),
  L("person-portrait", "Bir insan", "Tek bir insanı tanıtarak aç: adı, yaşı, o an ne yaptığı; hikâye onun gözünden büyür. Sessiz ve insani.", ["inspire", "documentary", "news", "epic", "crime"], "statement"),
  L("document-read", "Belge okuma", "Gerçek bir belgeden (rapor, telgraf, mahkeme kaydı) bir satır okuyarak aç; belgenin neyi gizlediği soru olur.", ["crime", "news", "epic", "documentary", "finance"], "quote"),
  L("sound-first", "Önce ses", "İlk saniyeler anlatımsız: ortam sesi (rüzgâr, alarm, telsiz) ve tek görüntü; ilk cümle sessizliği bozar.", ["horror", "crime", "epic", "news"], null),
  L("scale-compare", "Ölçek kıyası", "Akılda kalan bir kıyasla aç: 'Bu, Eyfel Kulesi'nin X katı' / 'Bir şehrin nüfusu kadar insan'. Rakamı somutlaştır.", ["science", "finance", "epic", "ranking"], "number"),
  L("countdown-tease", "Sıralama fragmanı", "Listenin en çarpıcı üç maddesinden kısa birer görüntü/cümle ver, birinciyi söyleme: 'Ve bir numara… hâlâ çözülmedi.'", ["ranking"], "fragments"),
  L("last-words", "Son sözler", "Birinin kaydedilmiş son sözleriyle ya da son mesajıyla aç (kaynaklı). Sakin ve ağır.", ["crime", "epic", "horror", "inspire", "documentary"], "quote"),
  L("before-after", "Önce / sonra", "Aynı yerin iki hâlini art arda göster: 'Burası 1985'te böyleydi. Bugün böyle.' Aradaki hikâye video.", ["documentary", "science", "epic", "finance", "news"], "statement"),
  L("mystery-detail", "Tuhaf ayrıntı", "Kimsenin açıklayamadığı tek tuhaf ayrıntıyla aç (bir iz, bir eksik saat, açık bırakılmış bir kapı).", ["crime", "horror", "documentary", "science"], "statement"),
  L("stakes-first", "Bedel önce", "Ne kaybedilebileceğini en başta söyle: 'Bir yanlış karar ve bir milyon insan…' Abartısız, gerçek bedel.", ["epic", "finance", "news", "science"], "statement"),
  L("viewer-you", "Sen", "İzleyiciyi hikâyenin içine koy: 'Bir sabah uyanıyorsun ve…' (ikinci tekil). Sadece gerçekten yaşanabilecek bir durumsa.", ["whatif", "science", "finance", "horror"], "statement"),
  L("headline-wall", "Manşetler", "O günün gerçek manşetlerinden 2-3'ünü art arda ver; hepsinin cevaplamadığı soruyu sor.", ["news", "finance", "epic", "crime"], "fragments"),
  L("unanswered-call", "Cevapsız çağrı", "Kesilen bir telsiz, cevapsız bir telefon, son sinyal: iletişimin koptuğu anla aç.", ["crime", "horror", "science", "epic"], "statement"),
  L("rise-fall", "Zirve ve düşüş", "Zirvedeki anla aç (en zengin, en güçlü, en hızlı) ve tek cümleyle düşüşü sezdir.", ["finance", "inspire", "epic", "documentary"], "statement"),
  L("child-eyes", "Bir çocuğun gözünden", "Olayı o gün orada olan bir çocuğun (kaynaklı tanıklık) anlatımıyla aç; sade ve dokunaklı.", ["epic", "documentary", "news", "inspire"], "quote"),
  L("cold-fact", "Kuru gerçek", "Tek, kuru, doğrulanmış bir olgu cümlesiyle aç; dramatize etme. Ciddi haber ve trajedide en güvenli giriş.", ["news", "documentary", "science", "epic", "crime"], "statement"),
  L("two-timelines", "İki zaman", "İki zamanı art arda kes: bugün ve geçmiş ('Ekim 2026, Sibirya. / 1347, Kırım.') ve aralarındaki bağı sor.", ["news", "documentary", "epic", "science", "horror"], "fragments"),
  L("price-tag", "Fiyat etiketi", "Bir şeyin fiyatıyla aç (bir hisse, bir bilet, bir fidye); o fiyat hikâyenin anahtarı.", ["finance", "crime", "documentary"], "number"),
  L("secret-kept", "Saklanan sır", "Uzun süre saklanmış bir şeyi ima et: 'X yıl boyunca bunu kimse söylemedi.' Kaynaklı olmalı.", ["crime", "epic", "news", "documentary"], "statement"),
  L("experiment", "Deney", "Bir deneyin/testin anıyla aç: geri sayım, ölçüm, beklenmedik sonuç.", ["science", "whatif", "epic"], "statement"),
  L("letter", "Mektup", "Gerçek bir mektuptan/günlükten bir cümleyle aç; yazanın o an bilmediği şey gerilimi kurar.", ["epic", "inspire", "documentary", "crime"], "quote"),
  L("crowd-silence", "Kalabalık ve sessizlik", "Kalabalık, gürültülü bir anla aç ve birden sessizliğe kes; sessizliğin nedeni soru olur.", ["epic", "horror", "news", "finance"], "statement"),
  L("rule-broken", "Çiğnenen kural", "Bir kuralı/protokolü söyle ve o gün çiğnendiğini ekle: 'Kural basitti: X. O gün…'", ["crime", "science", "news", "finance"], "statement"),
  L("map-line", "Bir çizgi", "Haritada ya da kâğıtta tek bir çizgiyle aç (bir rota, bir grafik, bir sınır) ve o çizginin ne anlattığını vaat et.", ["epic", "finance", "science", "crime"], "statement"),
  L("rumor-vs-record", "Söylenti ve kayıt", "Dolaşan söylentiyi söyle, sonra resmî kaydı; ikisinin arasındaki boşluk video. Haberde ideal, kimseyi suçlamadan.", ["news", "crime", "documentary"], "statement"),
  L("wrong-guess", "Yanlış tahmin", "O dönemde herkesin yaptığı yanlış tahminle aç ('Herkes X sanıyordu.') ve doğruyu vaat et.", ["finance", "science", "epic", "news", "documentary"], "statement"),
  L("empty-place", "Boş mekân", "Artık bomboş olan bir yeri göster ve orada eskiden ne olduğunu sor.", ["horror", "documentary", "epic", "crime"], "statement"),
  L("first-time", "İlk kez", "Bir şeyin dünyada ilk kez olduğu anla aç (ilk uçuş, ilk teşhis, ilk çöküş).", ["science", "inspire", "epic", "finance"], "statement"),
  L("the-call", "Karar anı", "Bir insanın vermek zorunda kaldığı kararla aç: 'Saniyeler içinde karar vermesi gerekiyordu.'", ["inspire", "epic", "crime", "science"], "statement"),
  L("artifact-voice", "Nesnenin hikâyesi", "Bir nesnenin yolculuğunu anlatarak aç (bir para, bir mektup, bir silah elden ele).", ["documentary", "crime", "epic", "finance"], "statement"),
  L("numbers-pair", "İki sayı", "İki sayıyı art arda ver (öncesi/sonrası, beklenen/gerçek) ve farkı soru yap.", ["finance", "science", "news", "ranking", "epic"], "number"),
  L("prophecy", "Kehanet ya da uyarı", "Önceden yapılmış gerçek bir uyarıyla/kehanetle aç ve dinlenmediğini söyle.", ["science", "finance", "epic", "news", "horror"], "quote"),
  L("legend-check", "Efsaneyi sına", "Bir efsaneyi anlat, sonra 'ama kayıtlar başka bir şey söylüyor' de.", ["documentary", "epic", "horror", "crime", "ranking"], "statement"),
  L("small-to-big", "Küçükten büyüğe", "Mikroskobik/küçük bir şeyle aç (bir bakteri, bir vida, bir kod satırı) ve dünyayı değiştirdiğini söyle.", ["science", "finance", "epic", "news"], "statement"),
  L("witness", "Tanık", "Olayı gören gerçek bir tanığın (kaynaklı) cümlesiyle aç; sonra o cümlenin neden önemli olduğu.", ["crime", "news", "epic", "horror"], "quote"),
  L("anniversary", "Yıl dönümü", "Bugünkü bir yıl dönümünden ya da tarihten geçmişe köprü kur.", ["epic", "news", "documentary"], "statement"),
  L("odds", "İhtimal", "Olayın ihtimalini söyleyerek aç ('milyonda bir') ve yine de olduğunu ekle.", ["science", "whatif", "finance", "crime"], "number"),
  // Ekim 2026: eski hâli "slam, gizem YOK" diyordu ve haber/finans açılışlarını köreltti (kanal sahibi: "kanca mantığı gitmiş").
  L("state-of-play", "Durum özeti", "İlk cümle bu olayın en çarpıcı, doğrulanmış ANI ya da rakamı (bir ölüm, bir fiyat, bir saat); hemen ardından haber netliğiyle ŞU AN ne oluyor (konunun adı, tarih), bu izleyiciye neden dokunuyor (fiyat, güvenlik, günlük hayat) ve videonun neyi açıklayacağı. Gerilim serbest; uydurma gizem ve abartı yok.", ["news", "finance", "science", "documentary"], "statement"),
  // MagnatesMedia / Moon / ColdFusion açılışı (Ekim 2026 incelemesi): gerçek bir an ya da söz → konu adıyla → "bu, X'in hikâyesi" → 2-3 tırmanan fragman.
  L("teaser-ladder", "Fragman merdiveni", "İlk 5-10 sn: bu hikâyenin gerçek, en çarpıcı anı ya da sözü (kaynaklı). Sonra konuyu adıyla söyle ('Bu, X'in akıl almaz hikâyesi'), ardından 2-3 kısa ve giderek büyüyen fragman ver — videoda neler göreceğiz, ama cevaplamadan ('Kurucusunu kovmaya kalkışmalarından… başladıkları her ilkeyi terk etmelerine'). Son cümle izleyiciye bağlar ('ve bu, hepimizi etkileyen bir hikâye'). Başlık ~30-45 sn'de.", ["news", "finance", "documentary", "crime", "epic", "science", "inspire", "whatif"], "statement"),
  L("question-chain", "Soru zinciri", "Üç kısa soruyu art arda sor; üçüncüsü videonun asıl sorusu. Slam yok, sadece merak.", ["news", "documentary", "science", "whatif", "crime"], "fragments"),
];

const HISTORY = "docu-hook-history.json";
/** Bu kadar son kullanılan giriş tekrar önerilmez. */
export const HOOK_MEMORY = 6;

export function readHookHistory(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, HISTORY), "utf8")); } catch { return []; }
}
export function recordHook(dataDir, entry) {
  if (!dataDir || !entry?.id) return;
  const h = readHookHistory(dataDir);
  h.push({ ...entry, at: new Date().toISOString() });
  fs.writeFileSync(path.join(dataDir, HISTORY), JSON.stringify(h.slice(-60), null, 2));
}

const seedOf = (s) => [...String(s || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

/** Haber/finansın ilk adayı bunlardan biri: çarpıcı açılır, konuyu ~20 sn içinde netleştirir. */
export const LEAD_NEWS = ["teaser-ladder", "state-of-play", "contradiction", "quote-open", "numbers-pair", "timestamp"];

/**
 * Konunun tonuna uyan, kanalda son HOOK_MEMORY girişte kullanılmamış adaylar (en fazla n).
 * tone: tür id'si ya da "news" / "ranking" / "whatif". Konuya göre karışık sıra (aynı konu → aynı sıra).
 */
export function hookCandidates({ tone = "documentary", topic = "", history = [], n = 6, short = false } = {}) {
  const recent = new Set(history.slice(-HOOK_MEMORY).map((x) => x.id));
  let pool = HOOKS.filter((h) => h.tones.includes(tone) && (!short || h.short));
  const fresh = pool.filter((h) => !recent.has(h.id));
  if (fresh.length >= Math.min(n, 3)) pool = fresh;
  const seed = seedOf(topic);
  // Haber/finans: ilk aday hem çarpıcı hem net bir giriştir — ama hep aynısı değil (her video "durum özeti"yle açılınca
  // kanca köreldi). Bu girişler arasından konuya göre biri, son kullanılanlar hariç.
  const lead = (tone === "news" || tone === "finance") && !short
    ? (() => { const ids = LEAD_NEWS.filter((id) => !recent.has(id)); const list = ids.length ? ids : LEAD_NEWS; return HOOKS.find((h) => h.id === list[seed % list.length]); })()
    : null;
  const ranked = pool
    .map((h, i) => ({ h, k: (seedOf(h.id) ^ seed) + i }))
    .sort((a, b) => (a.k % 997) - (b.k % 997))
    .map((x) => x.h)
    .filter((h) => h !== lead);
  return (lead ? [lead, ...ranked] : ranked).slice(0, n);
}

export const hookById = (id) => HOOKS.find((h) => h.id === id) || null;

/** Senariste gidecek aday listesi (satırlar). */
export function hookPromptLines(cands) {
  return [
    "GİRİŞ MANTIĞI (openingLogic): videonun ilk ~30 saniyesi aşağıdaki adaylardan konuya ve TONA en uygun OLANLA açılır (id yaz).",
    "Ciddi haber, trajedi, gerçek ölüm: ölçülü ve güvenilir giriş (kuru gerçek, çelişki, soru…); şok kelimeler/slam yalnızca konu gerçekten sertse.",
    ...cands.map((h) => `- ${h.id} — ${h.ad}: ${h.how}`),
  ];
}
