// GERÇEK KİŞİ CAST'TA OLMASA DA AI KARESİNDE UYDURMA YÜZ YOK; AI GAZETESİ YOK.
//
// ÖLÇÜLEN KUSURLAR (26 Ekim 2026):
// - Madoff (finans, 20261026-27b4d8): "[quietly] On December 10, 2008, Madoff told his sons, Mark and Andrew, the truth."
//   satırının ardındaki arşiv sahnesi ("Mark Madoff Andrew Madoff 2008") fotoğraf bulamayıp AI'a düştü; istem "Medium shot
//   of two men in their forties in business suits ... serious faces" yüz gizlenmeden ChatGPT görsel kutusuna gitti
//   (gorsel-kutusu/needed.json #6). hideRealFace yalnızca sahnenin cast'ına bakıyordu; iki gerçek oğul hiçbir cast
//   listesinde yoktu, script.realCast'ı da hiçbir adım yazmıyordu.
// - Lula (haber, 20261026-29db03): cast boştu; Lula ve Bolsonaro'lar anlatılırken AI benzemeyen adamlar çizdi (ön izleme
//   bir karede Justin Trudeau gördü — "the father in 2022, the son in 2026" satırı).
// - Çernobil (tarih, 20261026-24122a): "the New York Post announced a mass grave" satırında AI bir tabloid ön sayfası
//   çizdi, anlamsız manşetle ("NTD THE BLENS") — gerçek gazetenin sahte nüshası.
//
// Kural: sahnenin anlatımı, araması, isim kartı ya da istemi gerçek bir kişinin adını taşıyorsa (ya da bir önceki satırda
// adı geçen kişi "he / the son" diye sürüyorsa) ve istem birini gösteriyorsa, AI karesi yüzü gizler — OpenAI'a da ChatGPT
// görsel kutusuna da aynı istem gider. AI karesi gazete ön sayfası, manşet, dergi kapağı ya da okunur belge çizmez.
// Kimsenin adı geçmeyen sahne, adsız kalabalık ve "anonymous examiner" olduğu gibi kalır.
// 29 Ekim 2026 (Gimli 20261028-9ff721 / Kartal Yuvası 950730, parlaklık 52-56): gizleme eki artık "seen from behind
// or at a distance, face not visible" — "in silhouette" gerçek kişiyi siyah bir figüre çeviriyordu (produce.mjs HIDDEN_FACE).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hideRealFace, realPeople, namedAt, stillPrompt, noPrintedRecord, showsPerson, cuedNames } from "../docu-engine/lib/produce.mjs";
import { addNeed, loadNeeds, writeList } from "../docu-engine/lib/image-inbox.mjs";
import { realCastOf } from "../src/pipeline/docu-script.js";

// Gerçek iş: 20261026-27b4d8/docu/engine-script.json — cast ve sahne 66, 88, 89-94 (sırası korunarak).
const MADOFF = {
  cast: {
    madoff: "American man around 70 in 2008, thinning swept-back silver-gray hair, clean-shaven, thin lips with a faint tight smile, dark tailored overcoat over a charcoal suit, white shirt, conservative tie, composed wealthy-financier bearing.",
    markopolos: "American man in his early fifties around 2009, short dark hair receding at the temples, clean-shaven, rectangular wire-rimmed glasses, earnest serious expression, dark suit and plain tie, analyst and fraud-examiner look, seated at a congressional witness table.",
    picard: "American lawyer in his late sixties to seventies during the 2010s, white hair neatly combed, clean-shaven, rimless glasses, navy suit with white shirt and patterned tie, calm measured courtroom demeanor.",
  },
  scenes: [
    { type: "photo", say: "[quietly] With a case finally open, SEC staff had a choice: take Madoff's word for his trades, or check them.", source: "ai", imagePrompt: "Over-the-shoulder shot of an anonymous examiner at a government desk facing two stacks of paper, one neat binder and one untouched box, fluorescent light, green-black shadows, no legible text" },
    { type: "photo", say: "Remember Ann and Ben? Now picture every Ann asking for her money, and no Ben arriving.", source: "stock", search: "people queue bank", imagePrompt: "Wide shot of a long line of anxious people in winter coats outside a bank entrance, grey December daylight" },
    { type: "counter", say: "Madoff's clients asked for withdrawals reported at about seven billion dollars." },
    { type: "icons", say: "That's about one dollar in nine of what his statements claimed, far more than he had." },
    { type: "photo", say: "A Ponzi scheme can survive a warning letter. It can't survive a line at the door.", source: "archive", search: "Bernard Madoff 2008 portrait", imagePrompt: "Medium shot of the man in a dark overcoat on a Manhattan sidewalk, composed tight smile, cool winter light, wide establishing shot from far away", cast: ["madoff"], archived: true },
    { type: "words", say: "[quietly] On December 10, 2008, Madoff told his sons, Mark and Andrew, the truth.", text: "December 10, 2008, Madoff told his sons, Mark and Andrew", source: "ai", imagePrompt: "Silhouette of an older man standing by a tall apartment window at dusk, two younger men seated in shadow facing him, dim lamp light, heavy stillness", cast: ["madoff"] },
    { type: "photo", say: "The investment business, he told them, was one giant Ponzi scheme.", source: "archive", search: "Mark Madoff Andrew Madoff 2008", imagePrompt: "Medium shot of two men in their forties in business suits standing in a Manhattan office corridor, serious faces, cool fluorescent light" },
    { type: "photo", say: "[curious] So why did he suddenly confess to his own sons?", source: "stock", search: "rain window night city", imagePrompt: "Close-up of rain streaking down a dark window, blurred city lights behind the glass", archived: true },
  ],
};
const SONS = 6;
const HIDDEN_SONS = "Medium shot of two men in their forties in business suits standing in a Manhattan office corridor, cool fluorescent light, seen from behind or at a distance, face not visible";
const asked = (script, i) => stillPrompt(script.scenes[i].imagePrompt, { scene: script.scenes[i], named: namedAt(script.scenes, i, realPeople(script)) });

test("Madoff #93: oğullar cast'ta yok, arama adlarını taşıyor — AI karesi yüzü gizler, 'serious faces' düşer", () => {
  const sc = MADOFF.scenes[SONS];
  // Eski yol: sahnenin cast'ı boş, hideRealFace hiçbir şey yapmıyordu (needed.json #6 bu istemle gitti).
  assert.equal(sc.cast, undefined);
  assert.equal(hideRealFace(sc.imagePrompt, []), sc.imagePrompt);
  const people = realPeople(MADOFF);
  assert.deepEqual(people.keys, ["madoff"], "arşive cast'lanan Madoff gerçek; diğerleri bu kesitte adıyla geçmiyor");
  for (const n of ["Mark", "Andrew"]) assert.ok(people.names.includes(n), `"his sons, Mark and Andrew" → ${n}`);
  const named = namedAt(MADOFF.scenes, SONS, people);
  for (const n of ["Madoff", "Mark", "Andrew"]) assert.ok(named.includes(n), `${n} sahnede adıyla geçiyor: ${named}`);
  assert.equal(asked(MADOFF, SONS), HIDDEN_SONS);
  assert.ok(!/serious faces|faces/.test(asked(MADOFF, SONS)));
});

test("adsız kalabalık, 'anonymous examiner' ve kimsenin adı geçmeyen sahne olduğu gibi kalır (önbellek anahtarı değişmez)", () => {
  const [examiner, line] = MADOFF.scenes;
  assert.equal(asked(MADOFF, 0), examiner.imagePrompt, "yazar onu bilerek adsız yaptı");
  assert.equal(asked(MADOFF, 1), line.imagePrompt, "Ann/Ben kurgu, kuyruk kalabalık");
  assert.equal(asked(MADOFF, 7), MADOFF.scenes[7].imagePrompt, "yağmurlu cam: kimse yok");
  assert.equal(stillPrompt("Medium shot of an examiner at a desk, fluorescent light", { named: [] }), "Medium shot of an examiner at a desk, fluorescent light");
  // Adı geçen sahnede bile kalabalık, boş koltuk ya da yalnız mekân yüz istemez.
  assert.equal(showsPerson("Wide shot of supporters in red shirts crowded around a big outdoor screen at night, faces lit"), false);
  assert.equal(showsPerson("A judge's empty high-backed leather chair behind the bench, a gavel resting on the block"), false);
  assert.equal(showsPerson("Wide shot of a modern court building in Brasília at dusk, empty plaza"), false);
  assert.equal(showsPerson("Medium shot of a Brazilian senator in a dark suit walking through a marble corridor"), true);
});

test("ChatGPT görsel kutusu API ile aynı gizli istemi alır (needed.json + LISTE.txt)", () => {
  const src = fs.readFileSync(new URL("../docu-engine/lib/produce.mjs", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("async function safeImage("), src.indexOf("prepareSceneVideos(script"));
  const at = body.indexOf("prompt = stillPromptAt(prompt, i);");
  assert.ok(at > 0, "safeImage her istemi stillPromptAt'tan geçirir");
  assert.ok(at < body.indexOf("const shown = hideRealFace(prompt, cast.filter((n) => REAL.has(n)));"), "cast gizlemesinden önce");
  assert.match(body, /sceneImage\(shown, cast, period, style\)/);
  // Kutunun tek yazıldığı yer sceneImage, ve o istemi olduğu gibi yazar; sceneImage'ı safeImage'dan başka çağıran yok.
  assert.equal((src.match(/addNeed\(INBOX, /g) || []).length, 1);
  assert.match(src, /addNeed\(INBOX, \{ file, prompt: `\$\{prompt\}\.\$\{describe\(cast\)\} \$\{style\}\$\{period\} Wide 16:9/);
  assert.equal((src.match(/\bsceneImage\(/g) || []).length, 3, "tanım + ilk istek + yumuşatılmış istek");
  // Tavan sayımı da aynı istemin anahtarına bakar: önceden ödenmiş gizli kare "yeni" sanılıp kesilmez.
  assert.match(src, /const prompt = hideRealFace\(stillPromptAt\(asked, i\), cast\.filter\(\(n\) => REAL\.has\(n\)\)\);/);
  assert.match(src, /!aiCached\(sc\.imagePrompt, sc\.cast \?\? \[\], i\)/);
  // Kutu kaydı: sceneImage'ın yazdığı biçimle needed.json ve LISTE.txt gizli istemi taşır.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-yuz2-"));
  const n = addNeed(dir, { file: "build/x/img-test.jpg", prompt: `${asked(MADOFF, SONS)}. Authentic late-2000s financial photojournalism. Wide 16:9 cinematic documentary still.` });
  writeList(dir);
  assert.ok(loadNeeds(dir).items.find((x) => x.n === n).prompt.startsWith(HIDDEN_SONS));
  assert.ok(fs.readFileSync(path.join(dir, "LISTE.txt"), "utf8").includes(HIDDEN_SONS));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Lula: cast boş — isim kartı, unvan ve 'the father … the son' satırı yüzü gizler", () => {
  // Gerçek iş: 20261026-29db03 sahne 4, 87, 97-99 (isim kartı sahne 1'den).
  const lula = {
    cast: {},
    scenes: [
      { type: "photo", say: "On 25 October, Brazil re-elected Luiz Inácio Lula da Silva.", source: "archive", search: "Lula da Silva Brasília Planalto Palace", name: "Luiz Inácio Lula da Silva", archived: true, image: "x.jpg" },
      { type: "photo", say: "His opponent was Senator Flávio Bolsonaro, of the PL, Jair Bolsonaro's eldest son.", source: "archive", search: "Flávio Bolsonaro senator Brasília Senate", imagePrompt: "Medium shot of a middle-aged man in a suit speaking in a parliamentary chamber, soft overhead light" },
      { type: "photo", say: "[warm, unhurried] On the night of 25 October, Lula, about to turn 81, followed the count in a São Paulo hotel.", source: "ai", imagePrompt: "Wide shot of a dim hotel suite at night, an elderly man in a dark shirt seated on a sofa facing a glowing television, city lights of São Paulo through a large window behind him, warm lamp light" },
      { type: "photo", say: "Four years later, the Bolsonaro across from him was the son, Flávio.", source: "archive", search: "Flávio Bolsonaro senator Brasília", archived: true, image: "y.jpg" },
      { type: "photo", say: "Same family name, two generations: the father in 2022, the son in 2026.", imagePrompt: "Medium shot of a dark-haired man in his forties in a suit at a podium, cool interior light, different angle: low-angle close-up, shallow depth of field" },
      { type: "photo", say: "Turnout climbed to 80.79 percent.", source: "archive", search: "Brazil polling station voters queue", imagePrompt: "Wide shot of voters queuing outside a school polling station in northeastern Brazil, bright afternoon sun" },
    ],
  };
  const face = /seen from behind or at a distance, face not visible$/;
  for (const i of [1, 2, 4]) assert.match(asked(lula, i), face, `sahne ${i}: ${asked(lula, i)}`);
  assert.deepEqual(namedAt(lula.scenes, 4, realPeople(lula)).sort(), ["Bolsonaro", "Flavio"], "baba/oğul satırı önceki satırın adlarını taşır");
  assert.equal(asked(lula, 5), lula.scenes[5].imagePrompt, "seçmen kuyruğu: kimse adıyla geçmiyor");
});

// İnceleme, 27 Ekim 2026 (sıradaki İsrail 2026 seçim videosu): iyelikteki İŞ sözcüğü bir makamı adlandırır, kişinin yakınını
// değil — "Israel's attorney general" İsrail'i "gerçek kişi" yapıyor, o sahnelerdeki her AI insan karesi yüzünü gizliyordu.
test("iyelik yalnızca aile sözcüğüyle: ülke/şirketin makamı kişi değil, 'Madoff's sons' kişi — motor ve senarist aynı", () => {
  const offices = ["Israel's attorney general opened the file.", "Brazil's deputy foreign minister flew to Geneva.", "Apple's lawyer filed the appeal."];
  const one = (say) => ({ cast: {}, scenes: [{ type: "photo", say, source: "ai", imagePrompt: "Medium shot of a grey-haired official in a dark suit at a podium, flags behind" }] });
  for (const say of offices) {
    assert.deepEqual(cuedNames(say), [], say);
    assert.deepEqual(realCastOf(one(say)), [], `senarist: ${say}`);
    assert.deepEqual(realPeople(one(say)).names, [], `motor: ${say}`);
    assert.equal(asked(one(say), 0), one(say).scenes[0].imagePrompt, `AI karesi yüzlü kalır (önbellek anahtarı aynı): ${say}`);
  }
  const sons = "That night, Madoff's sons called a lawyer.";
  assert.deepEqual(cuedNames(sons), ["Madoff"]);
  assert.deepEqual(realCastOf(one(sons)), ["Madoff"]);
  assert.match(asked(one(sons), 0), /face not visible$/);
  for (const say of ["Netanyahu's wife Sara stood beside him.", "Jair Bolsonaro's eldest son ran.", "Golan's grandchildren watched."]) assert.equal(cuedNames(say).length, 1, say);
  // Adın ardından gelen iş sözcüğü yine kişidir: "his lawyer, Ira Sorkin".
  assert.ok(cuedNames("Madoff arrived with his lawyer, Ira Sorkin.").includes("Ira Sorkin"));
});

// İnceleme, 27 Ekim 2026 (2. tur, İsrail 2026 seçim videosu öncesi): ülke ya da halk adı kişinin ad sözcüğü değildir.
// "Defense Minister Israel Katz" "Israel"i ad sözcüğü yapıyordu — "Israel" diyen her sahnenin AI insan karesi yüzünü
// gizliyordu; "Israel's sons and daughters" / "Gaza's children" yeri kişi; "israeli_voter", "tel_aviv_protester",
// "idf_soldier" cast anahtarları aramadaki "Israeli", "Tel Aviv", "IDF" yüzünden gerçek kişi sayılıyordu.
test("ülke/halk adı kişi değil: Israel Katz 'Katz'la tanınır, 'Israel's sons' ve adsız İsrailli cast gerçek kişi değil", () => {
  for (const say of ["Israel's sons and daughters are still held in Gaza.", "Gaza's children have known nothing else.", "America's sons came home."]) {
    assert.deepEqual(cuedNames(say), [], say);
    assert.deepEqual(realCastOf({ cast: {}, scenes: [{ type: "photo", say }] }), [], `senarist: ${say}`);
  }
  const script = {
    cast: { israeli_voter: "Israeli woman in her thirties, dark hair", idf_soldier: "young soldier in olive uniform", tel_aviv_protester: "young man with a flag", netanyahu: "Israeli man in his seventies, grey hair" },
    scenes: [
      { type: "photo", say: "Defense Minister Israel Katz ordered the strike.", source: "archive", archived: true, name: "Israel Katz" },
      { type: "photo", say: "On Tuesday, Israel votes again.", search: "Israeli election polling station 2026", source: "ai", imagePrompt: "Medium shot of a woman dropping a ballot into a box at a polling station", cast: ["israeli_voter"] },
      { type: "photo", say: "The IDF is still in Gaza.", search: "IDF soldiers Gaza 2026", source: "ai", imagePrompt: "Medium shot of a soldier on patrol at dusk", cast: ["idf_soldier"] },
      { type: "photo", say: "In Tel Aviv, crowds marched again.", search: "Tel Aviv protest 2026", source: "ai", imagePrompt: "A young man waving a flag at a rally", cast: ["tel_aviv_protester"] },
      { type: "photo", say: "Benjamin Netanyahu is running again.", search: "Benjamin Netanyahu 2026 portrait", source: "archive", archived: true, cast: ["netanyahu"] },
    ],
  };
  const rp = realPeople(script);
  assert.deepEqual(rp.keys, ["netanyahu"]);
  assert.ok(rp.names.includes("Israel Katz"));
  assert.deepEqual(rp.tokens.map((t) => t.word).sort(), ["Benjamin", "Katz", "Netanyahu"]);
  assert.deepEqual(realCastOf(script), ["netanyahu", "Israel Katz", "Benjamin Netanyahu"]);
  // "Israel", "IDF", "Tel Aviv" diyen sahnelerin AI karesi yüzlü kalır (istem, önbellek anahtarı aynı).
  for (const i of [1, 2, 3]) assert.equal(asked(script, i), script.scenes[i].imagePrompt, `#${i}`);
  // Katz'ı anan satır yine gizlenir.
  const katz = { ...script, scenes: [...script.scenes, { type: "photo", say: "Katz said nothing.", source: "ai", imagePrompt: "Medium shot of a man in a dark suit at a lectern" }] };
  assert.match(asked(katz, 5), /face not visible$/);
});

test("Çernobil: AI tabloid ön sayfası katlanmış, yazısız gazete yığınına döner; headline cihazına dokunulmaz", () => {
  // Gerçek iş: 20261026-24122a sahne 44 (3:45, "NTD THE BLENS").
  const S44 = "Close-up of a 1980s tabloid front page on a newsstand, bold black headline type blurred, harsh street light";
  const out = noPrintedRecord(S44);
  assert.equal(out, "Close-up of a stack of folded 1980s newspapers on a newsstand, harsh street light, the print out of focus, no readable text, no masthead, no headline, no logo");
  assert.equal(stillPrompt(S44, { scene: { type: "photo", say: "On 2 May, the New York Post announced a mass grave for fifteen thousand." } }), out);
  // Yayın adı istemden düşer; ön sayfası istenen gerçek gazete de yığına döner.
  assert.equal(noPrintedRecord("Close-up of the front page of Pravda on a Moscow kiosk, May 1986"), "Close-up of a stack of folded newspapers on a Moscow kiosk, May 1986, the print out of focus, no readable text, no masthead, no headline, no logo");
  assert.ok(!/New York Post/.test(noPrintedRecord("A copy of the New York Post on a kitchen table, morning light")));
  // Okunur yazı istenen afiş / mektup yazısız kalır.
  assert.equal(noPrintedRecord('A propaganda poster reading "WORKERS UNITE" on a brick wall'), "A propaganda poster on a brick wall, any writing blurred and unreadable");
  // headline cihazı kendi sayfasını dizer: istemine dokunulmaz.
  assert.equal(stillPrompt(S44, { scene: { type: "headline" } }), S44);
  // Zaten güvenli istemler aynen kalır (önbellek anahtarı değişmez).
  for (const keep of [
    "Stack of yellowed old newspapers on a wooden floor, edges curling, single beam of light from a window",
    "Detail shot of folded newspapers stacked on a newsstand counter at dawn, blurred street behind, no readable text",
    "Detail shot of a typed government case form with checkboxes and a signature line, lit by harsh desk lamp, text blurred",
    "Extreme close-up of a sonar operator's headphones resting on an empty console in a dim red-lit control room, no screens readable, labelled reconstruction",
    "Wide night shot of the Nasdaq tower in Times Square glowing with stock tickers, crowds blurred below",
    "Close-up of headlights on a wet road at night",
  ]) assert.equal(noPrintedRecord(keep), keep);
});

test("anlatım resmin tarifi değildir: kesme karesinin satırı kalır, zaten bulanık manşet ve nesne kareleri değişmez", () => {
  // İnceleme (27 Ekim 2026, 24 eski iş): kesme karesi (inserts.mjs) satırı tırnakla taşır; tırnak "okunur yazı" sayılıp
  // 21 kesme karesinin satırı siliniyordu ("The moment, any writing blurred and unreadable").
  const cooper = 'Overhead shot of an evidence table: a black clip-on tie, a small tie clip and eight cigarette butts in an envelope under harsh flash. A closer view of the same moment: one detail of it, a different angle. The moment: "We\'ll rebuild that night minute by minute... then open fifty years of evidence."';
  assert.equal(noPrintedRecord(cooper), cooper, "D.B. Cooper 20260930-08f5fc #5");
  const master = 'Detail shot of a trading screen filled with green rising figures in a dark room, reflections on glass. A wider view of the same moment: the place and its scale. The moment: "By the end, you\'ll see how that guarantee allegedly fueled a bank\'s growth."';
  assert.equal(stillPrompt(master, { scene: { type: "photo" }, named: [] }), master, "Banco Master 20261011-b48aac #3");
  // Çernobil #44'ün kesme karesi: resim yığına döner, satır kalır, yalnızca gazetenin adı düşer.
  const ins44 = 'Close-up of a 1980s tabloid front page on a newsstand, bold black headline type blurred, harsh street light. A closer view of the same moment: one detail of it, a different angle. The moment: "On 2 May, the New York Post announced a mass grave for fifteen thousand."';
  const out44 = noPrintedRecord(ins44);
  assert.ok(out44.startsWith("Close-up of a stack of folded 1980s newspapers on a newsstand"), out44);
  assert.ok(out44.endsWith('The moment: "On 2 May, a newspaper announced a mass grave for fifteen thousand."'), out44);
  // Ön izleme notu gazeteden söz ediyorsa resme girecek sayfa okunmaz kalır.
  assert.equal(
    noPrintedRecord("Medium shot of a man in a grey suit leaving a courthouse — it must plainly show what the narration says: The headlines called him a hero."),
    "Medium shot of a man in a grey suit leaving a courthouse — it must plainly show what the narration says: The headlines called him a hero, any printed page out of focus, no readable text, no masthead",
  );
  // Yazarın zaten okunmaz tuttuğu manşet yeniden yazılmaz (aynı resim, yeni önbellek anahtarı = yeniden ödeme).
  for (const keep of [
    "A rack of 1972 newspapers on a rainy street corner, stacks tied with string, headlines blurred and unreadable",
    "A bundle of newspapers dropped on a wet pavement at dawn, twine around them, headlines unreadable, 1987",
    "A folded 1930s newspaper on the snowy stone sill of a dark hotel window at night, a white pigeon beside it, the headline too blurred to read, city lights far below",
    "A folded newspaper with blurred unreadable headlines left on an empty chair, rain on the window behind, dim room",
    "Detail shot of a pile of folded tabloid newspapers on a wet newsstand counter, headlines blurred and unreadable, early morning light",
  ]) assert.equal(noPrintedRecord(keep), keep);
  // Kişi kararı resmin kendi tarifinden: anlatımdaki "he" kuyruğu kişi yapmaz (Lula #132); nesnenin önündeki unvan kişi değildir.
  const lula132 = "Wide shot of voters queuing outside a school polling station in northeastern Brazil, bright afternoon sun — it must plainly show what the narration says: But he will govern a country whose states, and whose Congress, lean right.";
  assert.equal(stillPrompt(lula132, { scene: { type: "photo" }, named: ["Lula"] }), lula132);
  for (const thing of [
    "Detail shot of an official government case form with stamped boxes and handwritten initials, lit by cold overhead light",
    "Detail of a cluttered analyst desk at night, single desk lamp, calculator, stacked printouts, deep green-black shadows",
    "Official patent documents with red seals being slid across a desk by one hand toward another, 1885",
  ]) assert.equal(stillPrompt(thing, { scene: { type: "photo" }, named: ["Madoff"] }), thing);
  assert.equal(showsPerson("Medium shot of a grey-haired official in a dark suit at a press lectern"), true);
});

test("kaynakta: senarist bitince realCast yazılır — arşivin sildiği isim kartı da listede kalır; motor onu okur", () => {
  const withCard = { ...MADOFF, scenes: [...MADOFF.scenes, { type: "photo", say: "The court named a trustee, Irving Picard.", source: "archive", search: "Irving Picard trustee Madoff", name: "Irving Picard", imagePrompt: "Medium shot of the white-haired lawyer in rimless glasses and navy suit in a courthouse hallway", cast: ["picard"] }] };
  const rc = realCastOf(withCard);
  for (const k of ["madoff", "picard", "Mark", "Andrew", "Irving Picard"]) assert.ok(rc.includes(k), `${k}: ${rc}`);
  assert.ok(!rc.includes("markopolos"), "bu kesitte adıyla geçmeyen cast gerçek sayılmaz");
  // Arşiv adımı fotoğrafı çıkmayan sahnenin isim kartını siler ("…için gerçek fotoğraf yok"); realCast ad hâlâ elde.
  const after = { ...withCard, realCast: rc, scenes: withCard.scenes.map((s) => ({ ...s, name: undefined, source: s.source === "archive" && !s.archived ? "ai" : s.source })) };
  const people = realPeople(after);
  assert.ok(people.keys.includes("picard") && people.names.includes("Irving Picard"));
  assert.match(asked(after, after.scenes.length - 1), /face not visible$/);
  // Kurum ve yer kişi değildir.
  assert.deepEqual(realCastOf({ cast: {}, scenes: [{ type: "quote", say: "x", who: "World Health Organization" }, { type: "photo", say: "He landed at King Fahd Airport." }] }), []);
  // Yazar talimatı: adı geçen gerçek kişi yüzüyle istenmez, AI gazete/manşet istenmez.
  const ds = fs.readFileSync(new URL("../src/pipeline/docu-script.js", import.meta.url), "utf8");
  assert.match(ds, /Anlatımda ADI GEÇEN gerçek bir kişiyi \(cast'ta olsun olmasın/);
  assert.match(ds, /Gazete ön sayfası, manşet, dergi kapağı, okunur yazılı belge ya da afiş AI'a İSTENMEZ/);
  assert.match(ds, /const realCast = realCastOf\(script\);\s*\n\s*if \(realCast\.length\) \{\s*\n\s*script\.realCast = realCast;/);
});
