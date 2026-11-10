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

/**
 * Tek izleyici çağrısı. place: hook = kanca ve vaatten hemen sonra, ÜÇLÜ (beğen + abone + yorum, 19 Ekim 2026 kanal
 * sahibi: "ilk saniyelerde kanca girişinden sonra… like abone yorum 3'lü, animasyonla"); early = ilk büyük bilgiden
 * hemen sonra (60-150 sn), end = kapanışta. Üçlü örneklerin hepsi üç kelimeyi de söyler (like, subscribe, comments):
 * ekrandaki üç düğme (docu-engine src/cta.tsx) o kelimelerde sırayla çıkar.
 *
 * 20 Ekim 2026 derin inceleme (39 tutmuş video satır satır, kanal sahibi: "hepsini ekle önerdiğin gibi yap"): kancadan
 * hemen sonra soran tek kanal Weird History; o slot izleyicinin atladığı yer (536'da çağrı 0:33, zirve 1:03; büyük
 * kanallarda sponsorun bittiği saniye zirve). Üçlü kalır ama kısa (≤20 kelime, ~8 sn), GEREKÇELİ ("If you want…") ve
 * hemen ardından videonun en güçlü vuruşu gelir — atlayan izleyici tam oraya iner.
 */
export const HOOK_CTA_MAX_WORDS = 20;
export const CTAS = [
  C("trio-follow-up", "hook", "Gerekçe: hikâye sürüyor, gelişmeyi takip etmek; yorumda izleyicinin sorusu.", "If you want the follow-up when this changes, like, subscribe, and tell me in the comments what you'd ask."),
  C("trio-guess", "hook", "Gerekçe: cevabı görmek; yorumda tahmin.", "Like and subscribe if you want the answer, and leave your guess in the comments."),
  C("trio-small-channel", "hook", "Gerekçe: küçük kanal, üç küçük şey.", "We're a small channel, so a like, a subscribe and a word in the comments really help."),
  C("trio-where", "hook", "Gerekçe: yeni gelene bu tür videolar; yorumda nereden izlediği.", "If you're new, like and subscribe for more of these, and tell me in the comments where you're watching."),
  C("trio-what-you-know", "hook", "Gerekçe: konu yeniyse; yorumda ne duyduğu.", "If this is new to you, like and subscribe, and tell me in the comments what you'd heard."),
  C("trio-next-topic", "hook", "Gerekçe: daha fazla açıklayıcı; yorumda sıradaki konu.", "If you want more explainers like this, like, subscribe, and tell me in the comments what to cover next."),
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

/** Yorum isteyen çağrılar: ortadaki beğeni/abone ricasında değil, kapanış sorusunda yaşar. */
const COMMENT_CTAS = new Set(["comment-question", "where-watching", "if-confusing"]);

const seedOf = (s) => [...String(s || "")].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const shuffled = (list, seed) => list.map((x, i) => ({ x, k: ((seedOf(x.id) ^ seed) + i * 7919) % 100003 })).sort((a, b) => a.k - b.k).map((o) => o.x);

/**
 * Bu videonun retorik planı: bölüm başına 2 vuruculuk (kanalda son kullanılmamışlardan, hepsi farklı) ve
 * TEK izleyici çağrısı (yeri: erken ya da son; son videonunkinden farklı yer tercih edilir).
 */
/*
 * HASSAS KONU (16 Ekim 2026, Ebola gündem videosu): yerinden edilmiş insanları anlattıktan hemen sonra "If that cup
 * comparison made contact tracing click for you, a like helps" geldi — ölüm ve hastalık konusunda ricası saygısız
 * duruyor, son okumada elle çıkarıldı. Salgın, felaket, toplu ölüm konularında beğeni/abone istenmez; kapanıştaki
 * yorum sorusu kalır. Savaş tarihi (1066, 1812) bu kapsamda değil.
 *
 * 21 Ekim 2026 (kanal sahibi: "isyan, savaş, siyasi kriz haberlerinde üçlü çağrı konsun"): Fransa isyan videosu
 * yönlendirmesindeki "death toll" yüzünden hassas sayılıp çağrısız çıktı. Haber kanalında savaş/isyan/kriz sık geldiği
 * için liste yalnızca gerçek trajedilerle sınırlı: salgın, doğal afet, kıtlık, katliam, soykırım, toplu silahlı saldırı,
 * terör saldırısı. "death toll", "victims", "refugees", tek başına "shooting" artık çağrıyı silmez.
 */
const SENSITIVE = /\b(ebola|outbreak|epidemic|pandemic|cholera|plague|measles|mpox|disease|virus|earthquake|tsunami|flood(?:s|ing)?|hurricane|cyclone|typhoon|wildfire|famine|massacre|genocide|mass shooting|terror(?:ist)? attack|salgın|deprem|sel(?:de|i)?|kıtlık|katliam|soykırım|terör saldırısı)\b/i;
export const sensitiveTopic = (...texts) => SENSITIVE.test(texts.filter(Boolean).join(" "));

export function rhetoricPlan({ topic = "", chapters = 5, history = [], sensitive = false } = {}) {
  const seed = seedOf(topic);
  const recentPunches = new Set(history.slice(-Math.ceil(PUNCH_MEMORY / 10)).flatMap((x) => x.punches || []));
  const need = Math.max(4, chapters);
  let pool = shuffled(PUNCHES.filter((p) => !recentPunches.has(p.id)), seed);
  if (pool.length < need) pool = [...pool, ...shuffled(PUNCHES.filter((p) => recentPunches.has(p.id)), seed)];
  const picks = pool.slice(0, need);
  // One device per chapter (Oct 2026: less pounding — "heryere vuruculuğu kesip uyumlu editler").
  const perChapter = Array.from({ length: chapters }, (_, i) => picks.slice(i, i + 1).map((p) => p.id));
  const recentCtas = new Set(history.slice(-CTA_MEMORY).map((x) => x.cta).filter(Boolean));
  /*
   * İZLENME VERİSİ (kanalın YouTube grafikleri, Ekim 2026): izleyicinin çoğu ilk 30-40 sn'de karar veriyor; ilk dakikadaki
   * rica çıkışı hızlandırır, sondaki ricayı izleyicilerin ~%20'si görür. Beğeni/abone ricası artık hep ~1/3'te, bir
   * açığa çıkışın hemen ardından ("mid"); kapanış bölümü onun yerine tartışılabilir tek bir YORUM sorusu sorar.
   * Yorum biçimindeki çağrılar ortadaki ricada kullanılmaz (sondaki soruyla iki kez yorum istenmesin).
   *
   * 19 Ekim 2026, kanal sahibinin kararı: çağrı artık KANCADAN HEMEN SONRA ("hook") ve üçlü — beğen, abone ol, yorum —
   * tek cümlede, ekranda üç düğme animasyonla. Bölüm 1'de, kanca ve vaat cümlesi biter bitmez (~15-45 sn). Kapanıştaki
   * konuya özgü yorum sorusu yerinde kalır. Hassas konularda (aşağıda) yine hiç rica yok.
   */
  const place = "hook";
  const callPool = CTAS.filter((c) => c.place === "hook");
  let ctas = callPool.filter((c) => !recentCtas.has(c.id));
  if (!ctas.length) ctas = callPool;
  const cta = shuffled(ctas, seed)[0];
  if (sensitive) return { perChapter, cta: null, ctaPlace: "none", ctaChapter: -1, closingQuestion: chapters > 1, sensitive: true };
  return { perChapter, cta: cta.id, ctaPlace: place, ctaChapter: 0, closingQuestion: chapters > 1, hypeChapter: hypeChapterOf(chapters), hype: seed % HYPE_ASKS.length };
}

/*
 * HYPE (kanal sahibi, 22 Ekim 2026: "hype da istenebilir… arada söylemeli ve animasyonu da gözükmeli"). YouTube'un Hype
 * düğmesi yalnızca videonun İLK HAFTASINDA basılabilir; anlatım ise haftalarca izlenir — bu yüzden cümle şartlıdır ve
 * her zaman doğru kalır ("If you're watching in its first week…"). Videoda tek kez, ~%40'ta, ilk büyük ifşadan hemen
 * sonra; ekranda Hype düğmesi "Hype" kelimesinde basılır (docu-engine src/cta.tsx). Hassas konuda yok.
 */
export const HYPE_MAX_WORDS = 16;
export const HYPE_ASKS = [
  "If you're watching this in its first week, tap Hype. It helps small channels get seen.",
  "Watching in the first week? A Hype from you pushes this to new people.",
  "One quick thing: in a video's first week, Hype is how small channels get found.",
];
/** The chapter (0-based) that carries the Hype line: about a third of the way in, never the hook chapter. */
export const hypeChapterOf = (chapters) => (chapters >= 4 ? Math.max(1, Math.round(chapters * 0.45) - 1) : -1);

export const punchById = (id) => PUNCHES.find((p) => p.id === id) || null;
export const ctaById = (id) => CTAS.find((c) => c.id === id) || null;

/** Bölüm yazarına giden satırlar. */
export function rhetoricLines(plan, i, chapters) {
  if (!plan?.perChapter) return [];
  const mine = (plan.perChapter[i] || []).map(punchById).filter(Boolean);
  const lines = [
    "VURUCULUK (her video başka türlü vurur): bu bölümde aşağıdaki kalıbı YALNIZCA hikâyenin gerçek bir dönüm noktası varsa, EN FAZLA BİR KEZ ve doğal biçimde kullan; yoksa hiç kullanma — anlatım akıcı ve sakin kalsın, her cümle vurmaya çalışmasın; aynı kalıp videoda en fazla 2 kez, üçlü ritim ('One X. One Y. One Z.') videoda en fazla 1 kez. Kalıbı yalnızca olgu taşıyorsa kullan, süs için değil:",
    ...mine.map((p) => `- ${p.ad}: ${p.how} Örnek (konuya uyarla, kopyalama): "${p.example}"`),
  ];
  const cta = ctaById(plan.cta);
  const closing = plan.closingQuestion && i === chapters - 1 && i !== plan.ctaChapter;
  if (cta && i === plan.ctaChapter && plan.ctaPlace === "hook") {
    lines.push(`İZLEYİCİ ÇAĞRISI — ÜÇLÜ (videoda TEK KEZ, burada): kanca ve vaat cümlesi ("By the end of this video…") biter bitmez, videonun ~15-45. saniyesinde TEK cümle, EN ÇOK ${HOOK_CTA_MAX_WORDS} kelime (~8 sn) ve GEREKÇELİ: neden abone olsun, konuya ya da kanala bağlı ("If you want the follow-up when this changes…", "We're a small channel, so…"). Üçü de açıkça söylenir: like, subscribe ve comments — ekranda üç düğme bu kelimelerde sırayla animasyonla çıkar. ${cta.how} Örnek (konuya uyarla): "${cta.example}". Kendi photo sahnesinde, sakin mood'da; yalvarma, "smash" deme, abartma. HEMEN ARDINDAN GELEN CÜMLE videonun açılışındaki EN GÜÇLÜ vuruştur — henüz söylenmemiş en çarpıcı olgu, sayı ya da ters köşe (derin inceleme, Ekim 2026: izleyici çağrıyı atlar ve tam sonrasına iner; orada arka plan ya da "First, a quick orientation" olursa gider). Oryantasyon bu vuruştan SONRA gelir. Kanca ve vaat çağrıdan ÖNCE gelir; başka hiçbir yerde beğeni/abone isteme (kapanışta yalnızca konuya özgü yorum sorusu).`);
  } else if (cta && i === plan.ctaChapter && plan.ctaPlace === "mid") {
    lines.push(`İZLEYİCİ ÇAĞRISI (videoda TEK KEZ, burada — videonun ~1/3'ü): bu bölümün ilk büyük açığa çıkışından (reveal / en çarpıcı olgu) HEMEN SONRA tek, kısa (≤25 kelime), konuya bağlı bir cümle: ${cta.how} Örnek (konuya uyarla): "${cta.example}". ASLA videonun ilk 60 sn'sinde değil. Bu cümle kendi photo sahnesinde, sakin mood'da; yalvarma, "smash" deme, abartma. Başka hiçbir yerde beğeni/abone isteme.`);
  } else if (cta && i === plan.ctaChapter) {
    lines.push(plan.ctaPlace === "early"
      ? `İZLEYİCİ ÇAĞRISI (videoda TEK KEZ, burada): bu bölümün ilk büyük bilgisini verdikten hemen sonra (videonun ~60-150. saniyesi, ASLA ilk 30 sn'de değil) tek, kısa (≤25 kelime), konuya bağlı bir cümle: ${cta.how} Örnek (konuya uyarla): "${cta.example}". Bu cümle kendi photo sahnesinde, sakin mood'da; yalvarma, "smash" deme, abartma. Başka hiçbir yerde beğeni/abone isteme.`
      : `İZLEYİCİ ÇAĞRISI (videoda TEK KEZ, burada): son sahneden hemen önce tek, kısa (≤25 kelime), konuya bağlı bir cümle: ${cta.how} Örnek (konuya uyarla): "${cta.example}". Kapanış satırı yine en sonda kalır. Yalvarma, "smash" deme. Başka hiçbir yerde beğeni/abone isteme.`);
  } else if (closing) {
    lines.push("Bu bölümde beğeni/abone isteme (rica videoda tek kez, başka bölümde).");
    lines.push("KAPANIŞ SORUSU (yorumlar için, beğeni değil): son 2-3 sahne içinde izleyiciye bu konuya ÖZGÜ, iki tarafı da savunulabilir TEK bir soru sor (ör. 'Sence bu şans mıydı, yoksa hazırlık mı? Yorumlarda yaz.'); genel 'ne düşünüyorsunuz' değil. Kendi photo sahnesinde, sakin mood'da; kapanış satırı yine en sonda kalır.");
  } else if (cta) {
    lines.push("Bu bölümde beğeni/abone/yorum isteme (izleyici çağrısı videoda tek kez, başka bölümde).");
  }
  if (!plan.sensitive && Number.isInteger(plan.hypeChapter) && plan.hypeChapter >= 0 && i === plan.hypeChapter) {
    lines.push(`HYPE ÇAĞRISI (videoda TEK KEZ, bu bölümde): bölümün ilk büyük ifşasından HEMEN SONRA tek, kısa (en çok ${HYPE_MAX_WORDS} kelime) bir cümle ve 'Hype' kelimesini AÇIKÇA söyler — ekranda Hype düğmesi o kelimede animasyonla basılır. Hype yalnızca videonun ilk haftasında basılabildiği için cümle şartlıdır ve her zaman doğru kalır. Örnek (konuya uyarla): "${HYPE_ASKS[(plan.hype ?? 0) % HYPE_ASKS.length]}". Kendi photo sahnesinde, sakin mood'da; yalvarma, beğeni/abone burada isteme; hemen ardından hikâye kaldığı yerden, bir OLAYLA devam eder.`);
  }
  if (plan.sensitive && !closing) lines.push("HASSAS KONU (ölüm, hastalık, felaket): bu videoda HİÇBİR yerde beğeni/abone isteme; yorum sorusu yalnızca kapanışta.");
  else if (plan.sensitive) lines.push("HASSAS KONU (ölüm, hastalık, felaket): beğeni/abone isteme; yalnızca kapanış sorusu.");
  return lines;
}

/*
 * The viewer call on screen (docu-engine src/cta.tsx): the first line that asks for a like/subscribe gets
 * cta:'like', the first that asks for comments gets cta:'comment'; the engine pops the button exactly on the
 * spoken word and lets it go ~2.4 s later. "looked like a talk show" is not an ask: only "a like", "like button",
 * "like and subscribe", "subscribe"… (owner, Oct 2026: "tam istediği anda çıkmalı, uzun sürmesin").
 */
const LIKE_ASK = /\b(a like|leave a like|hit like|smash like|give (?:this|it) a like|like button|like and subscribe|subscrib\w*)\b|\b(beğen(?:i|in|meyi)\b|abone ol\w*)/i;
const HYPE_ASK = /\bhype\b|\bhype'?la/i;
const COMMENT_ASK = /\b(in the comments|comment below|in a comment|leave a comment|tell (?:us|me)\b[^.?!]{0,60}\bbelow)\b|\b(yorumlarda|yorum(?:a|lara)? yaz\w*)/i;
const say = (s) => String(s?.say || "").replace(/\[[^\]]*\]/g, " ");
/** İzleyiciden bir şey isteyen satır (beğen/abone, Hype, yorum) — kanal sahibinin kararı, editör geçişleri dokunamaz. */
export const isAudienceAsk = (text) => {
  const t = String(text || "").replace(/\[[^\]]*\]/g, " ");
  return LIKE_ASK.test(t) || HYPE_ASK.test(t) || COMMENT_ASK.test(t);
};
/** Lines that ask for a like or a subscription (a sensitive video's chapter is sent back for them). */
export const likeAskLines = (scenes = []) => scenes.filter((s) => LIKE_ASK.test(say(s))).map((s) => say(s).replace(/\s+/g, " ").trim());
/** Marks the one like-ask and the one comment-ask in a script's scenes (in place). → how many were marked. */
export function markCtaScenes(scenes = []) {
  let like = false, comment = false, hype = false, n = 0;
  for (const s of scenes) {
    if (!s || s.cta) { if (s?.cta === "like") like = true; if (s?.cta === "comment") comment = true; if (s?.cta === "hype") hype = true; continue; }
    const t = say(s);
    if (!like && LIKE_ASK.test(t)) { s.cta = "like"; like = true; n++; }
    else if (!hype && HYPE_ASK.test(t)) { s.cta = "hype"; hype = true; n++; }
    else if (!comment && COMMENT_ASK.test(t)) { s.cta = "comment"; comment = true; n++; }
  }
  return n;
}
