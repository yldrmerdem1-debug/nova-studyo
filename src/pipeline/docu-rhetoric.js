// VURUCULUK VE TEK İZLEYİCİ ÇAĞRISI — her video başka türlü vurur, beğeni/abone tek kez istenir.
//
// Kullanıcı (6 Ekim 2026, Hürmüz yeniden yapımı): "'one o, one bu' olsun ama her zaman onla yaptığını fark
// ettim; farklı farklı vuruculuklar olmalı, 50-100 tane ekle" ve "videonun sonunda veya başında like da
// isteyebilir, insanları etkileyici ufak sözler" — ardından: "sürekli istemesin, videonun belli yerinde
// sadece 1 kere".
//
// PUNCHES: vurucu söz kalıpları (retorik araçlar). Her videoya kanalda son kullanılmamışlardan bir set
// verilir; aynı kalıp bir videoda en fazla 2 kez, üçlü kalıp ("One X. One Y. One Z.") en fazla 1 kez.
// CTAS: beğeni/abone çağrıları. Video başına TEK çağrı, tek yerde (erken: ilk büyük bilgiden sonra; ya da
// son): hem cümle hem yer kanal geçmişine göre döner.
import fs from "node:fs";
import path from "node:path";

const P = (id, ad, how, example) => ({ id, ad, how, example });

export const PUNCHES = [
  P("tricolon", "Üçlü ritim", "Üç kısa paralel parça; üçüncüsü dönüş. Videoda EN FAZLA 1 kez.", "One strait. One fifth of the oil. And now, almost no ships."),
  P("not-but", "X değil, Y", "Beklenen açıklamayı reddet, gerçeğini koy.", "This isn't a story about oil. It's a story about a toll gate."),
  P("short-after-long", "Uzundan sonra kısa", "Uzun, bilgi dolu bir cümlenin ardından 2-4 kelimelik tek cümle.", "…and every one of them has to pass through the same channel. All of them."),
  P("number-then-meaning", "Önce sayı, sonra anlamı", "Sayıyı yalın söyle; bir sonraki cümle onun hayattaki karşılığını versin.", "Six million barrels a day. That is less than a third of normal."),
  P("understatement", "Hafife alma", "Büyük bir olguyu kasten sakin söyle.", "That is not a rounding error."),
  P("scale-compare", "Ölçek kıyası", "Rakamı tanıdık bir şeyle kıyasla.", "That is more oil than the entire United States imports."),
  P("callback", "Geri dönüş", "Daha önce söylenmiş bir cümleyi/sayıyı yeni anlamıyla geri getir.", "Twenty-one miles. It keeps coming back to those twenty-one miles."),
  P("hypophora", "Sor ve cevapla", "Seyircinin aklındaki soruyu sor, hemen cevapla.", "So why not just go around it? Because there is almost nothing to go around with."),
  P("official-vs-real", "Resmî ve gerçek", "Resmî ifadeyi ve sahadaki gerçeği yan yana koy.", "Officially, the strait is open. In practice, almost no one is using it."),
  P("delayed-detail", "Kimsenin söylemediği ayrıntı", "Önemli bir ayrıntıyı 'çoğu haberde geçmeyen' diye sun (doğruysa).", "There is one detail most reports leave out."),
  P("do-the-math", "Hesabı yap", "Seyirciyle basit bir hesap yap.", "Do the math: every dollar on a barrel adds about two and a half cents to a gallon."),
  P("you-line", "Seninle bağ", "Olguyu izleyicinin günlük hayatına bağla.", "If you filled up your car this month, you have already paid for this."),
  P("plain-terms", "Düz söyle", "Teknik bir şeyi 'basitçe' diye tek cümlede çevir.", "In plain terms: the pipe around the strait is too small."),
  P("one-word", "Tek kelime", "Tek kelimelik bir cümle; ağırlığı sessizlikten gelir.", "Gone."),
  P("then-now", "O zaman, şimdi", "İki zamanı aynı kalıpta yan yana koy.", "In February, a hundred ships a day. In September, a handful."),
  P("irony", "İroni", "Durumun ironisini abartısız söyle.", "The cheapest weapon in the Gulf is a mine that costs less than a car."),
  P("chiasmus", "Ters çevirme", "Bir ifadeyi ters çevirerek tekrar et.", "The ships did not stop because of the war. The war started paying because the ships stopped."),
  P("real-quote", "Gerçek alıntı", "Kaynaklı, kısa bir alıntı; ardından bir cümle yorum. Uydurma ASLA.", "The IEA called it the largest supply disruption in history. It did not exaggerate."),
  P("name-run", "İsim dizisi", "Hızlı bir isim/yer dizisi; ölçeği isimler taşısın.", "Kuwait. Iraq. Qatar. Bahrain. All of them, one exit."),
  P("the-catch", "İşin püf noktası", "'Ama bir sorun var' diye dönüş yap.", "Here is the catch: the pipelines were already near full."),
  P("first-since", "…den beri ilk kez", "Tarihsel bir eşiği vurgula.", "For the first time since 1988, warships are escorting tankers through Hormuz."),
  P("timestamp-line", "Saat damgası", "Kesin saat/tarihle tek cümle.", "At 4:37 in the afternoon, the projectile hit the engine room."),
  P("counterfactual", "Olmasaydı", "Tek bir değişkeni değiştirip sonucu söyle.", "Had that pipeline held, prices would have stayed under a hundred."),
  P("anaphora", "Baştan tekrar", "Ardışık cümleleri aynı sözcükle başlat (one değil).", "Every tanker. Every pipeline. Every gallon you buy."),
  P("antithesis-numbers", "Karşıt sayılar", "İki sayıyı karşıt kalıpla ver.", "Twenty million barrels before. Six million now."),
  P("dry-fact", "Kuru olgu", "Sıfatsız, kuru, doğrulanmış tek cümle.", "Two hundred and ninety people died."),
  P("human-scale", "İnsan ölçeği", "Büyük rakamı tek bir insana çevir.", "For a family that drives to work, that is about fifty dollars more a month."),
  P("sensory", "Duyusal ayrıntı", "Tek bir görsel/işitsel ayrıntıyla anı canlandır.", "On deck, the only sound was the engine and the wind off the mountains."),
  P("that-is-the-problem", "Sorun bu", "Olguyu söyle, ardından 've sorun da bu' ile kilitle.", "Most of it goes to Asia. And that is the problem."),
  P("remember-this", "Bunu aklında tut", "İleride dönecek bir ayrıntıyı işaretle (sonra mutlaka dön).", "Remember that name: Kazimah. We will come back to it."),
  P("we-come-back", "Döneceğiz", "Bir soruyu açık bırak, sonraki bölümde cevapla.", "Why they did not simply sail around it, we will get to."),
  P("real-reason", "Asıl sebep", "Görünen sebebi söyle, asıl sebebi aç.", "The real reason is not the missiles. It is insurance."),
  P("light-metaphor", "Tek metafor", "Tek, sade bir metafor (videoda en fazla bir kez).", "Hormuz is a valve on the world's fuel line."),
  P("daily-analogy", "Günlük benzetme", "Tanıdık bir gündelik durumla benzet.", "It is like closing the only door out of a crowded room."),
  P("nobody-planned", "Kimse hazırlıklı değildi", "Hazırlıksızlığı tek cümleyle söyle (doğruysa).", "Nobody had planned for both straits at once."),
  P("both-true", "İkisi de doğru", "Çelişkili görünen iki gerçeği birlikte kabul et.", "Exports are back near normal. And the strait is nearly empty. Both are true."),
  P("price-tag", "Fiyat etiketi", "Bir kararın bedelini tek rakamla söyle.", "That decision cost one point two billion dollars a day."),
  P("chapter-question", "Bölüm sonu sorusu", "Bölümü cevaplanacak net bir soruyla kapat.", "So who is actually letting the ships through?"),
  P("history-rhymes", "Tarih tekrar eder", "Geçmişle bugünü tek cümleyle bağla.", "In 1987 it was mines. In 2026 it is drones. The water is the same."),
  P("quote-pair", "İki alıntı", "İki tarafın kısa, kaynaklı sözlerini art arda ver.", "Washington says the strait is open. Tehran says it decides who passes."),
  P("show-it", "Göster", "'İşte böyle görünüyor' deyip görsele bırak.", "This is what a closed strait looks like from space."),
  P("zoom-out", "Geri çekil", "Ayrıntıdan büyük resme dön.", "Step back, and look at the whole map."),
  P("zoom-in", "Yaklaş", "Büyük resimden tek bir gemiye/insana in.", "Now look at one ship."),
  P("happened-before", "Daha önce de oldu", "Emsal varsa söyle.", "This has happened before."),
  P("the-rule", "Kural basit", "Oyunun kuralını tek cümleyle koy.", "The rule is simple: whoever controls the lanes controls the price."),
  P("two-endings", "İki son", "Olası iki sonu kısa ve paralel ver.", "If it reopens, prices fall fast. If it doesn't, they don't stop."),
  P("overlooked-number", "Gözden kaçan sayı", "Haberlerde geçmeyen ama belirleyici bir sayı.", "The number that matters is not the price. It is two point six."),
  P("myth-fact", "Duyduğun ve gerçek", "Yaygın bir yanlışı düzelt.", "You may have heard the strait is closed. Not quite."),
  P("quiet-line", "Sessiz satır", "Ağır bir olguyu kısık, yavaş tek satırla ver (kısık-ton bütçesine uyar).", "Most of them were going home for the holiday."),
  P("countdown", "Üç şey", "Belirleyici şeyleri sayıyla duyur, sonra sırayla aç.", "Three things decide what happens next."),
  P("aphorism", "Akılda kalan söz", "Videonun tek cümlelik özü; genelde son bölümde.", "What reopens a strait is not a fleet. It is a deal."),
  P("except", "Ama", "Tek kelimelik dönüşle beklentiyi kır.", "It should have worked. Except."),
  P("sounds-small", "Küçük görünüyor ama", "'Küçük gibi duruyor, değil' kalıbı.", "Two miles sounds like a lot of water. It isn't."),
  P("escalation", "Tırmanma", "Olayları artan şiddetle sırala.", "First the warnings. Then the seizures. Then the missiles."),
  P("what-changed", "Ne değişti", "Önce/sonra farkını tek soruyla aç.", "So what changed in March?"),
  P("who-pays", "Bedeli kim öder", "Bedelin kime gittiğini söyle.", "And in the end, someone pays for every mile a tanker detours. You."),
  P("timing-irony", "Zamanlama", "Zamanlamanın tuhaflığını vurgula.", "The ceasefire was signed in June. The blockade came back in July."),
  P("the-clock", "Saat işliyor", "Bir sürenin kısalığını/uzunluğunu vurgula.", "It took eleven days."),
  P("odd-pair", "Yan yana gelmemesi gereken iki sayı", "Birbiriyle çelişen iki ölçümü yan yana koy.", "Exports are up. Transits are down. Those two numbers should not go together."),
  P("definition", "Tanım", "Anahtar kavramı tek cümlede tanımla.", "A chokepoint is a place where there is no plan B."),
  P("look-at-this", "Şuna bak", "Ekrandaki grafiğe/haritaya izleyicinin dikkatini çek.", "Look at this line."),
  P("consequence-chain", "Zincir", "Sebep-sonuç zincirini adım adım izleyiciye kadar getir.", "A drone hits a pump station. Yanbu stops loading. Brent jumps. Your receipt changes."),
  P("insider-term", "İçeriden terim", "Sektör terimini söyle ve anında çevir.", "Traders call it a risk premium. It means fear, priced in dollars."),
  P("concession", "Hakkını ver", "Karşı tarafın haklı olduğu noktayı kabul et; güven kurar.", "To be fair, the escorts have worked. Just not enough."),
  P("setup-payoff-number", "Kur ve öde", "Bir sayıyı erken kur, sonra şaşırtıcı biçimde öde.", "Remember the two point six million? That was the plan B."),
  P("strong-verb", "Güçlü fiil", "Tek, kısa, güçlü fiilli cümle.", "Prices broke."),
  P("rhetorical-silence", "Söylemeden bırak", "Cümleyi bitirmeden bırak, görüntü tamamlasın.", "And the next ship in line was…"),
  P("contrast-scale", "Küçük ve büyük", "Küçük bir neden ile dev bir sonucu yan yana koy.", "A drone the size of a lawnmower. Four million barrels a day."),
  P("rule-of-thumb", "Pratik kural", "Akılda kalan bir pratik kural ver (doğruysa).", "Rule of thumb: ten dollars on a barrel, a quarter on a gallon."),
];

const C = (id, place, how, example) => ({ id, place, how, example });

/** Tek izleyici çağrısı. place: early = ilk büyük bilgiden hemen sonra (60-150 sn), end = kapanışta. */
export const CTAS = [
  C("useful-so-far", "early", "Faydalıysa beğeni iste; kısa, yalvarmadan.", "If this is already useful, a like helps more people find it."),
  C("free-and-helps", "early", "Abonelik ücretsiz ve kanala gerçekten yardım ediyor.", "Subscribing is free, and for a small channel it genuinely helps."),
  C("what-we-do", "early", "Kanalın ne yaptığını tek cümleyle söyle, sonra abonelik.", "If you're new: we explain the news behind the prices you pay. Subscribe if that's your kind of thing."),
  C("research-took", "early", "Emeği söyle (doğruysa), sonra abonelik.", "This took a lot of digging. If you want more like it, subscribe."),
  C("learned-something", "early", "Bir şey öğrendiyse beğeni; devamı geliyor de.", "If you learned something already, hit like — the best part is still coming."),
  C("send-a-friend", "early", "Konuyu soran bir arkadaşa gönder.", "If you know someone who keeps asking why fuel is so expensive, send them this."),
  C("algorithm-honest", "early", "Algoritmayı dürüstçe söyle.", "Quick, honest note: a like tells YouTube this is worth showing to others."),
  C("one-click", "early", "Tek tıklık, sade.", "One click on the like button. Then back to the strait."),
  C("before-we-go-on", "early", "'Devam etmeden önce' kalıbı.", "Before we go on — if you're enjoying this, subscribe."),
  C("follow-the-story", "early", "Hikâyeyi takip etmek için abonelik.", "This story is still moving. Subscribe and you'll get the next chapter."),
  C("comment-question", "early", "Yorumda tek bir soru sor (beğeni yerine).", "Tell me in the comments: have prices gone up where you live?"),
  C("where-watching", "early", "Nereden izlediğini sor.", "Where are you watching from? Tell me below — this hits every country differently."),
  C("if-confusing", "early", "Kafa karıştıran kısmı yorumda sormaya çağır.", "If any part of this is confusing, ask in the comments. I read them."),
  C("support-independent", "early", "Bağımsız açıklayıcı içeriği desteklemek.", "If you like explainers without the shouting, a subscribe supports exactly that."),
  C("notification", "early", "Bildirim zilini sadece güncel konularda öner.", "Things change fast here. If you want to know when, subscribe and turn on notifications."),
  C("worth-your-time", "end", "Zamanına değdiyse beğeni.", "If this was worth your time, a like helps others find it."),
  C("next-chapter", "end", "Hikâyenin bir sonraki bölümü için abonelik.", "The next chapter of this story hasn't happened yet. Subscribe, and you'll see it when it does."),
  C("thanks-end", "end", "Sona kadar izlediği için teşekkür + beğeni.", "Thanks for watching to the end. If it helped, leave a like."),
  C("follow-up-promise", "end", "Takip videosu vaadi (gerçekten yapılacaksa).", "When this changes — and it will — we'll explain it. Subscribe so you don't miss it."),
  C("your-take", "end", "Görüşünü yorumda sor.", "So what do you think happens next? Tell me in the comments."),
  C("share-if-clear", "end", "Konu netleştiyse paylaş.", "If this finally made it make sense, share it with someone who's still confused."),
  C("small-channel", "end", "Küçük kanalı dürüstçe söyle.", "We're a small channel. Every subscriber genuinely makes a difference."),
  C("more-like-this", "end", "Benzer içerik için abonelik.", "We make one of these on every big story. Subscribe for the next one."),
  C("like-and-go", "end", "Kısa ve sıcak kapanış.", "A like, a subscribe, and I'll see you in the next one."),
  C("one-thing-to-remember", "end", "Akılda kalacak tek şeyi söyle, sonra abone.", "If you remember one thing, remember the twenty-one miles. And subscribe for the next story."),
  C("comment-correction", "end", "Hata görürsen yaz — güven kurar.", "If we got anything wrong, tell us below. And if we got it right, a like helps."),
  C("next-topic-vote", "end", "Sonraki konuyu yorumda öner.", "What should we explain next? Leave it in the comments."),
  C("keep-up", "end", "Haberi takip etmek için abone.", "If you want to keep up with this without the noise, subscribe."),
  C("bell-for-updates", "end", "Gelişmeler için zil.", "Turn on notifications if you want the update the day it happens."),
  C("save-for-later", "end", "Sonra tekrar bakmak için kaydet.", "Save this one — you'll want it the next time this is in the news."),
  C("friend-who-drives", "end", "Konuyla ilgili birine gönder.", "Send this to the friend who complains about gas prices every week."),
  C("did-it-help", "end", "İşe yaradı mı diye sor.", "Did this help? A like tells me to make more like it."),
  C("history-and-now", "end", "Tarih + güncel içerik için abone.", "We connect history to the headlines. Subscribe if that's your thing."),
  C("subscribe-quiet", "end", "Sessiz, tek cümle.", "If you'd like more of these, you know where the button is."),
  C("ten-seconds", "end", "Kısa bir rica.", "It takes two seconds and it helps a lot: like and subscribe."),
  C("why-it-matters", "end", "Neden önemli olduğunu bağla.", "These stories decide what you pay every week. Subscribe so you're never the last to know."),
  C("community", "end", "Topluluğa katıl.", "Join the people here who like to understand the news, not just hear it."),
  C("question-for-you", "end", "İzleyiciye kişisel bir soru.", "Would you pay more at the pump to keep the strait open? Tell me below."),
  C("next-video-tease", "end", "Sonraki videoyu sezdir (gerçekse).", "Next, we're looking at the other strait nobody is talking about. Subscribe to catch it."),
  C("respect-time", "end", "İzleyicinin zamanına saygı.", "Thanks for spending ten minutes with this. If it was worth it, a like says so."),
  C("feedback-loop", "end", "Geri bildirimle gelişme.", "Every comment shapes the next video. Tell us what to dig into."),
  C("explain-better", "end", "Daha iyi anlatmak için geri bildirim.", "If there's a part we should explain better, say so in the comments."),
  C("plain-cta", "end", "En sade biçim.", "If you enjoyed this, like and subscribe."),
  C("no-hype", "end", "Abartısız haber vaadi.", "No hype, just what's actually happening. Subscribe for more."),
  C("stay-curious", "end", "Merak çağrısı.", "Stay curious — and subscribe for the next one."),
  C("see-you", "end", "Yeniden görüşme.", "I'll see you in the next one. Subscribe so it finds you."),
  C("one-like", "early", "Tek beğeni ricası, konuya bağlı.", "If those twenty-one miles just made sense to you, give this a like."),
  C("halfway-check", "early", "İlk bilgiden sonra kısa kontrol.", "Still with me? Good — a quick like helps, and then the part that matters most."),
  C("context-channel", "early", "Bağlam veren kanal tanımı.", "We give you the context the headlines skip. Subscribe if you want more of that."),
  C("trust-sources", "early", "Kaynaklı içerik vaadi.", "Every number here is sourced in the description. If you value that, subscribe."),
];

const HISTORY = "docu-rhetoric-history.json";
/** Son bu kadar videoda kullanılan çağrı tekrar önerilmez; vuruculuklar için de aynı pencere ×3. */
export const CTA_MEMORY = 10;
export const PUNCH_MEMORY = 30;

export function readRhetoricHistory(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, HISTORY), "utf8")); } catch { return []; }
}
export function recordRhetoric(dataDir, entry) {
  if (!dataDir || !entry) return;
  const h = readRhetoricHistory(dataDir);
  h.push({ ...entry, at: new Date().toISOString() });
  fs.writeFileSync(path.join(dataDir, HISTORY), JSON.stringify(h.slice(-80), null, 2));
}

const seedOf = (s) => [...String(s || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const shuffled = (list, seed) => list.map((x, i) => ({ x, k: ((seedOf(x.id) ^ seed) + i * 7919) % 100003 })).sort((a, b) => a.k - b.k).map((o) => o.x);

/**
 * Bu videonun retorik planı: bölüm başına 2 vuruculuk (kanalda son kullanılmamışlardan, hepsi farklı) ve
 * TEK izleyici çağrısı (yeri: erken ya da son; son videonunkinden farklı yer tercih edilir).
 */
export function rhetoricPlan({ topic = "", chapters = 5, history = [] } = {}) {
  const seed = seedOf(topic);
  const recentPunches = new Set(history.slice(-Math.ceil(PUNCH_MEMORY / 10)).flatMap((x) => x.punches || []));
  const need = Math.max(4, chapters * 2);
  let pool = shuffled(PUNCHES.filter((p) => !recentPunches.has(p.id)), seed);
  if (pool.length < need) pool = [...pool, ...shuffled(PUNCHES.filter((p) => recentPunches.has(p.id)), seed)];
  const picks = pool.slice(0, need);
  const perChapter = Array.from({ length: chapters }, (_, i) => picks.slice(i * 2, i * 2 + 2).map((p) => p.id));
  const recentCtas = new Set(history.slice(-CTA_MEMORY).map((x) => x.cta).filter(Boolean));
  const lastPlace = history.at(-1)?.ctaPlace;
  const place = lastPlace === "early" ? "end" : lastPlace === "end" ? "early" : seed % 2 ? "early" : "end";
  let ctas = CTAS.filter((c) => c.place === place && !recentCtas.has(c.id));
  if (!ctas.length) ctas = CTAS.filter((c) => c.place === place);
  const cta = shuffled(ctas, seed)[0];
  return { perChapter, cta: cta.id, ctaPlace: place, ctaChapter: place === "early" ? Math.min(1, chapters - 1) : chapters - 1 };
}

export const punchById = (id) => PUNCHES.find((p) => p.id === id) || null;
export const ctaById = (id) => CTAS.find((c) => c.id === id) || null;

/** Bölüm yazarına giden satırlar. */
export function rhetoricLines(plan, i, chapters) {
  if (!plan?.perChapter) return [];
  const mine = (plan.perChapter[i] || []).map(punchById).filter(Boolean);
  const lines = [
    "VURUCULUK (her video başka türlü vurur): bu bölümde aşağıdaki kalıplardan EN AZ BİRİNİ doğal biçimde kullan; aynı kalıp videoda en fazla 2 kez, üçlü ritim ('One X. One Y. One Z.') videoda en fazla 1 kez. Kalıbı yalnızca olgu taşıyorsa kullan, süs için değil:",
    ...mine.map((p) => `- ${p.ad}: ${p.how} Örnek (konuya uyarla, kopyalama): "${p.example}"`),
  ];
  const cta = ctaById(plan.cta);
  if (cta && i === plan.ctaChapter) {
    lines.push(plan.ctaPlace === "early"
      ? `İZLEYİCİ ÇAĞRISI (videoda TEK KEZ, burada): bu bölümün ilk büyük bilgisini verdikten hemen sonra (videonun ~60-150. saniyesi, ASLA ilk 30 sn'de değil) tek, kısa (≤25 kelime), konuya bağlı bir cümle: ${cta.how} Örnek (konuya uyarla): "${cta.example}". Bu cümle kendi photo sahnesinde, sakin mood'da; yalvarma, "smash" deme, abartma. Başka hiçbir yerde beğeni/abone isteme.`
      : `İZLEYİCİ ÇAĞRISI (videoda TEK KEZ, burada): son sahneden hemen önce tek, kısa (≤25 kelime), konuya bağlı bir cümle: ${cta.how} Örnek (konuya uyarla): "${cta.example}". Kapanış satırı yine en sonda kalır. Yalvarma, "smash" deme. Başka hiçbir yerde beğeni/abone isteme.`);
  } else if (cta) {
    lines.push("Bu bölümde beğeni/abone/yorum isteme (izleyici çağrısı videoda tek kez, başka bölümde).");
  }
  return lines;
}
