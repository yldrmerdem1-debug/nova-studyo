// 1.16.16 — KÜÇÜK KANAL PATLAMALARI (15-16 Ekim 2026): 100-10 bin aboneli kanalların bu ay 58 bin-3,5 milyon izlenen
// 15 videosunun ilk 90 sn'si ve son üç filmimizin (Kızıldeniz kabloları, AI balonu, Black Buck) ölçümü. Açılış dersleri
// (sahnenin ortasında, inanışı yıkmak, üç parçalı vaat, haberde büyük hikâye + "quick orientation"), seri şablonu
// (konu fikirlerinden başlık paketine), büyük dikey fotoğrafın tam ekran olması, kanal köşe damgası, okuma hızı.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const L = await import('../src/pipeline/growth-lessons.js');
const V = await import('../docu-engine/src/effects/variety.js');
const P = await import('../docu-engine/lib/pace.mjs');

test('açılış: sahnenin ortasında, inanışı yıkmak, üç parçalı vaat; haberde büyük hikâye ve kısa oryantasyon yalnızca haberde', () => {
  const long = L.hookGrowthLines().join('\n');
  const news = L.hookGrowthLines({ news: true }).join('\n');
  // 22 Ekim 2026: üç parçalı vaat yerine tek açılış çizelgesi ve TEK cümlelik vaat (Fransa: liste vaat + meta 0:20-0:50 kaybettirdi).
  for (const s of ['SAHNENİN ORTASINDA', 'YAYGIN İNANIŞI YIK', 'AÇILIŞ ÇİZELGESİ', 'TEK cümlelik vaat', 'Kanıt sesiyle']) assert.ok(long.includes(s), s);
  assert.ok(!long.includes('quick orientation'), 'tarih videosunda haber oryantasyonu yok');
  assert.ok(news.includes("'kim kim' HARİTASIYLA") && news.includes('America is fighting Iran'), 'haber: büyük hikâye; oryantasyon haritası 2. bölümde');
  // yazarın iki yeri de haber bayrağını geçirir
  const script = read('src', 'pipeline', 'docu-script.js');
  assert.equal(script.match(/hookGrowthLines\(\{ news: !!plan\.news \}\)/g)?.length, 2);
});

test('seri şablonu: fikirler seri bölümü olarak gelir, iş kaydına girer, yazar ve başlık paketi şablonu kullanır', () => {
  assert.ok(L.SERIES.length >= 6 && L.SERIES.some(([ch]) => ch === 'Kelevin'));
  const s = L.seriesLines().join('\n');
  assert.ok(s.includes('Myths That Turned Out To Be True') && s.includes('SERİNİN bölümleri'));
  const server = read('server.js');
  assert.ok(server.includes('2 SERİ şablonu × 4 bölüm') && server.includes('growth.seriesLines()'));
  assert.ok(server.includes('required: ["title", "series", "hook", "theme", "durationPreset"]'));
  const index = read('src', 'pipeline', 'index.js');
  assert.ok(index.includes('job.docuSeries = body.docuSeries'), 'iş kaydı');
  const script = read('src', 'pipeline', 'docu-script.js');
  assert.ok(script.includes('serisinin bir bölümü'), 'yazar');
  // seri yoksa kutsal kitap anahtarı eskisi gibi (önceki işlerin ücretli planı korunur)
  assert.ok(script.includes('job.docuMapMode || "", ...(job.docuSeries ? [job.docuSeries] : [])]'));
  const pkg = read('src', 'pipeline', 'docu-package.js');
  assert.ok(pkg.includes('SERIES: this video is an episode') && pkg.includes('...(job.docuSeries ? { series: job.docuSeries } : {})'));
  const app = read('public', 'app.js');
  assert.ok(app.includes('id="fDocuSeries"') && app.includes('state.form.docuSeries = idea.series'));
});

test('büyük dikey/kare fotoğraf tam ekran (Kızıldeniz: 2160x2880 kart oluyordu); küçük olan, panorama ve dikey klip bütün kalır', () => {
  assert.equal(V.fullBleedOK(2160, 2880), true, '2160x2880 dikey');
  assert.equal(V.fullBleedOK(2560, 2528), true, '2560x2528 kare');
  assert.equal(V.fullBleedOK(1624, 1300), true, '1624x1300');
  assert.equal(V.fullBleedOK(1038, 1300), false, 'küçük dikey 1.85x büyürdü');
  assert.equal(V.fullBleedOK(866, 1300), false);
  assert.equal(V.fullBleedOK(1080, 1920, true), false, 'telefon klibi bütün');
  assert.equal(V.fullBleedOK(2560, 1012), false, 'panorama bütün');
  assert.equal(V.fullBleedOK(640, 480), false);
  assert.equal(V.fullBleedOK(1920, 1080), true);
  assert.equal(V.resolveFit({ type: 'photo', image: 'a.jpg', imgW: 2160, imgH: 2880 }), 'cover');
  assert.equal(V.resolveFit({ type: 'photo', image: 'a.jpg', imgW: 2160, imgH: 2880, fit: 'contain' }), 'cover', 'sanat yönetmeninin "contain"i yalnızca belgede geçerli');
  assert.equal(V.resolveFit({ type: 'photo', image: 'a.jpg', imgW: 2160, imgH: 2880, fit: 'contain', document: true }), 'contain');
  assert.equal(V.resolveFit({ type: 'photo', image: 'a.jpg', imgW: 866, imgH: 1300 }), 'contain');
});

test('kanal köşe damgası: ayardaki ad stile göre; yalnızca resim sahnelerinde, haritada ve bölüm kartında kenara çekilir', async () => {
  const { docuChannelName } = await import('../src/pipeline/docu.js');
  const names = { docuChannelNames: { epic: 'Then What History', news: 'Then What News', finance: '' } };
  assert.equal(docuChannelName(names, { docuGenre: 'epic' }), 'Then What History');
  assert.equal(docuChannelName(names, { docuFormat: 'news' }), 'Then What News');
  assert.equal(docuChannelName(names, { docuGenre: 'finance' }), null, 'boş ad = damga yok');
  assert.equal(docuChannelName(names, { docuGenre: 'crime' }), null);
  assert.equal(docuChannelName({}, { docuGenre: 'epic' }), null);
  // bileşen: resim sahnesi koşuları (yarım saniyeden kısa boşluk birleşir, 2 sn'den kısa koşu düşer)
  const bug = read('docu-engine', 'src', 'ChannelBug.tsx');
  assert.ok(bug.includes("const CLEAN = new Set(['photo', 'words', 'slam', 'montage', 'split'])"), 'harita/belge/kart CLEAN değil');
  assert.ok(read('docu-engine', 'src', 'Engine.tsx').includes('<ChannelBug name={script.channel}'));
  // ilk render'da işe yazılır; yama render damgasız eski videoya damga eklemez
  const docu = read('src', 'pipeline', 'docu.js');
  assert.ok(docu.includes('const patching = Array.isArray(job.patchScenes) && job.patchScenes.length;') && docu.includes('job.docuChannel ?? (patching ? null : docuChannelName(settings, job))'));
  // ayar beyaz listesi: üç kanal, düz kısa metin
  const { settingsPatch } = await import('../src/settings-input.js');
  assert.deepEqual(settingsPatch({ docuChannelNames: { epic: ' Then  What <b>', news: 'X', finance: '' } }).docuChannelNames, { epic: 'Then What b', news: 'X', finance: '' });
  assert.throws(() => settingsPatch({ docuChannelNames: 'x' }));
  assert.equal(settingsPatch({ docuVoiceSpeed: '1.5' }).docuVoiceSpeed, 1.2);
});

test('damga parça anahtarına yalnızca varken girer (eski render parçaları geçerli kalır)', async () => {
  const { chunkKey } = await import('../docu-engine/lib/produce.mjs');
  const base = { id: 'k', genre: 'epic', scenes: [{ type: 'photo', image: 'a.jpg', say: 'x' }] };
  const args = (script) => ({ script, placed: [{ from: 0, frames: 90 }], chunk: { a: 0, b: 0, start: 0, end: 89 }, bundle: 'b', tctx: {}, style: { camera: [], fit: [], fx: [] } });
  const k0 = chunkKey(args(base));
  assert.equal(chunkKey(args({ ...base, channel: undefined })), k0);
  assert.notEqual(chunkKey(args({ ...base, channel: 'Then What' })), k0);
});

test('okuma hızı: yeni sesler 1,1x; yavaş/fısıltı yönlendirmesi 1,0x; önbellek anahtarı değişmez, kabul edilmezse hızsız', () => {
  assert.equal(P.VOICE_SPEED, 1.1);
  assert.ok(P.SLOW_DIRECTION.test('[whispers] It was gone.') && !P.SLOW_DIRECTION.test('[curious] It was gone.'));
  const prod = read('docu-engine', 'lib', 'produce.mjs');
  // anahtar satırı hız taşımaz: ödenmiş sesler yeniden ödenmez
  assert.ok(prod.includes('const key = hash(`${VOICE}|${MODEL}|${JSON.stringify(settings)}|${text}'));
  assert.ok(prod.includes("voice_settings: sp !== 1 ? { ...l.settings, speed: sp } : l.settings"));
  assert.ok(prod.includes('okuma hızını kabul etmedi'));
  assert.ok(read('docu-engine', 'bin', 'nova-run.mjs').includes('voiceSpeed:'));
  assert.ok(read('src', 'pipeline', 'docu.js').includes('voiceSpeed: Number.isFinite(Number(settings.docuVoiceSpeed))'));
});

test('gerçek haber görüntüsü: manşet araştırmadaki makaleyle (aynı gazete) eşleşir; çekilen sayfa tam ekran fotoğraf olur, önbellekten tekrar kullanılır', async () => {
  const A = await import('../src/pipeline/article-shots.js');
  const research = `Kaynaklar: https://fortune.com/2024/03/04/internet-cables-cut-red-sea).
    https://www.aljazeera.com/news/2026/10/13/iran-threatens-gulf-data-centres-how-exposed-is-the-regions-internet,
    https://en.wikipedia.org/wiki/Bab_al-Mandab_Strait_crisis https://www.cnbc.com/2026/07/29/microsoft-msft-q4-earnings-report-2026.html`;
  const urls = A.researchUrls(research);
  assert.equal(urls[0], 'https://fortune.com/2024/03/04/internet-cables-cut-red-sea', 'sondaki noktalama atılır');
  // Kızıldeniz: anlatım "Globes yazdı" derken Fortune'un makalesi gösterilmez
  assert.equal(A.matchArticle({ paper: 'Globes', headline: 'Four Red Sea cables damaged', date: '26 February 2024' }, urls), null);
  assert.match(A.matchArticle({ paper: 'AL JAZEERA', headline: 'Iran threatens Gulf data centres', date: '13 October 2026' }, urls), /aljazeera\.com\/news\/2026\/10\/13/);
  assert.equal(A.matchArticle({ paper: 'AL JAZEERA', headline: 'Iran threatens Gulf data centres', date: '2019' }, urls), null, 'yıl tutmazsa yok');
  assert.match(A.matchArticle({ paper: 'CNBC', headline: 'Microsoft jumps 8% as it boosts capital spending', date: 'July 29, 2026' }, urls), /cnbc\.com/);

  const tmp = fs.mkdtempSync(path.join(fs.mkdtempSync(path.join(ROOT, '..', 'nova-test-')), 'job-'));
  const pub = path.join(tmp, 'public');
  const script = { scenes: [
    { type: 'photo', image: 'x.jpg', say: 'a' },
    { type: 'headline', paper: 'AL JAZEERA', headline: 'Iran threatens Gulf data centres', date: '13 October 2026', say: 'Iran warned.', dur: 5, mood: 'tension', image: 'build/j/front.jpg', translation: 'x', source: 'stock' },
    { type: 'headline', paper: 'Globes', headline: 'Four Red Sea cables damaged', date: '26 February 2024', say: 'b' },
  ] };
  const credits = { 'scene-1': { file: 'front.jpg' } };
  let calls = 0;
  const capture = async (url, { words }) => { calls++; assert.ok(words.includes('iran')); return { png: Buffer.from('png'), w: 1903, h: 942, y: 0.17, title: 'Iran threatens Gulf data centres: How exposed…' }; };
  const n = await A.realArticleShots(script, { research, publicDir: pub, jobId: 'j', dir: tmp, credits, capture });
  assert.equal(n, 1);
  const s = script.scenes[1];
  assert.equal(s.type, 'photo');
  assert.match(s.image, /^build\/j\/article-[0-9a-f]{12}\.png$/);
  assert.ok(fs.existsSync(path.join(pub, s.image)));
  assert.equal(s.caption, 'AL JAZEERA · 13 October 2026');
  assert.equal(s.say, 'Iran warned.', 'anlatım ve süre aynen');
  assert.ok(s.fullBleed && s.natural && s.fit === 'cover' && !('paper' in s) && !('translation' in s) && !('source' in s));
  assert.ok(!credits['scene-1'], 'kullanılmayan ön sayfa fotoğrafının künyesi düşer');
  assert.equal(script.scenes[2].type, 'headline', 'eşleşmeyen manşet çizilmiş kalır');
  // yeniden çalıştırma sayfayı yeniden açmaz
  const again = { scenes: [{ type: 'headline', paper: 'AL JAZEERA', headline: 'Iran threatens Gulf data centres', date: '13 October 2026', say: 'x' }] };
  assert.equal(await A.realArticleShots(again, { research, publicDir: pub, jobId: 'j', dir: tmp, capture }), 1);
  assert.equal(calls, 1);
  // açılmayan sayfa bir daha denenmez, sahne kalır
  const failDir = fs.mkdtempSync(path.join(tmp, 'f-'));
  const cnbc = { scenes: [{ type: 'headline', paper: 'CNBC', headline: 'Microsoft jumps 8% as it boosts capital spending', date: 'July 29, 2026', say: 'x' }] };
  assert.equal(await A.realArticleShots(cnbc, { research, publicDir: pub, jobId: 'j', dir: failDir, capture: async () => null }), 0);
  assert.equal(await A.realArticleShots(cnbc, { research, publicDir: pub, jobId: 'j', dir: failDir, capture: async () => { throw new Error('tekrar açıldı'); } }), 0);
  assert.equal(cnbc.scenes[0].type, 'headline');
  // Electron dışında (testler, komut satırı) çekim yok
  assert.equal(await A.electronCapture('https://example.com', { words: ['x'] }), null);
  // akışa bağlı: yama render eski videoyu değiştirmez
  const docu = read('src', 'pipeline', 'docu.js');
  assert.ok(docu.includes('realArticleShots(ed,') && docu.includes('(!patching || fs.existsSync(path.join(dir, "article-shots.json")))'));
  fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
});

test('bayraklı harita: modern hikâyede (1992+) boyanan ülke kendi bayrağıyla; eski hikâyede renk; tartışmalı yerde bayrak yok', async () => {
  const W = await import('../docu-engine/lib/world-map.mjs');
  const box = W.worldBox([{ lat: 15.35, lon: 44.2 }, { lat: 24.7, lon: 46.7 }, { lat: 35.7, lon: 51.4 }]);
  const g = W.worldGeometry(box, { highlight: ['Yemen', 'Saudi Arabia', 'Iran'], flags: true });
  assert.deepEqual(g.flagFills.map((f) => f.flag), ['ye', 'sa', 'ir']);
  assert.ok(g.fills.length >= 3, 'renk dolgusu eskisi gibi de var (bayraksız ülke ve eski testler)');
  assert.equal(W.worldGeometry(box, { highlight: ['Yemen'] }).flagFills, undefined, 'bayrak istenmezse yok');
  assert.equal(W.flagsFit({ era: '2024' }), true);
  assert.equal(W.flagsFit({ era: '1066' }), false, 'Hastings: bugünün bayrağı yok');
  assert.equal(W.flagsFit({ era: '1956' }), false, 'Macaristan 1956');
  assert.equal(W.flagsFit({}, { era: 'October 2026' }), true, 'senaryonun dönemi');
  assert.equal(W.flagsFit({ era: '2026', flags: false }), false);
  assert.equal(W.flagsFit({}), false, 'dönem bilinmiyorsa bayrak yok');
  assert.equal(W.flagOf('Turkey'), 'tr');
  assert.equal(W.flagOf('Dem. Rep. Congo'), 'cd');
  assert.equal(W.flagOf('W. Sahara'), null);
  assert.equal(W.flagOf('Somaliland'), null);
  assert.ok(fs.existsSync(path.join(ROOT, 'docu-engine', 'public', 'flags', 'ye.svg')) && fs.existsSync(path.join(ROOT, 'docu-engine', 'public', 'flags', 'LICENSE.txt')));
  const attached = W.attachWorldMaps({ era: '2026', scenes: [{ type: 'map', region: 'world', box, countries: ['Iran'] }] });
  assert.deepEqual(attached.scenes[0].geo.flagFills.map((f) => f.flag), ['ir']);
  assert.equal(W.attachWorldMaps({ era: '1942', scenes: [{ type: 'map', region: 'world', box, countries: ['Iran'] }] }).scenes[0].geo.flagFills, undefined);
  // motor bayrağı ülkeye kırpar; işin klasörüne yalnızca kullanılan bayraklar kopyalanır
  const map = read('docu-engine', 'src', 'map.tsx');
  assert.ok(map.includes('staticFile(`flags/${ff.flag}.svg`)') && map.includes('flagclip'));
  assert.ok(read('docu-engine', 'lib', 'produce.mjs').includes("join(ENGINE_DIR, 'public', 'flags', `${code}.svg`)"));
});

test('haber görüntüsü: anlatımdaki sayı makalede geçiyorsa o cümle vurgulanır (Al Jazeera: "More than 90 percent…")', async () => {
  const A = await import('../src/pipeline/article-shots.js');
  assert.deepEqual(A.sayNumbers('On 21 August 1986, 1,746 people died; 4.5 billion dollars, 21% and 3 ships in 2026.'), ['21', '1,746', '4.5']);
  const src = read('src', 'pipeline', 'article-shots.js');
  assert.ok(src.includes("CSS.highlights.set('nova', new Highlight(sentence))"));
  assert.ok(src.includes("h.closest('article') || h.closest('main')"), 'başka <article> (ilgili haber kartı) aranmaz');
  assert.ok(src.includes('nums: sayNumbers(s.say)'));
});

test('orta ve son: orta noktada vaat hatırlatılır, sonda cevap işaretlenir, haber/finans izlenecek işaretlerle biter, seri devam eder', () => {
  const mid = L.middleGrowthLines().join('\n');
  // 22 Ekim 2026: köprü örnekleri birebir kopyalanıyordu; hatırlatma artık bir olguyla yapılır.
  assert.ok(mid.includes('AÇIKÇA bir kez hatırlat') && mid.includes('yeni bir OLGUYLA') && !mid.includes("But here's the thing."));
  const end = L.endGrowthLines().join('\n');
  for (const s of ['back to the question we started with', 'Go back to that sentence one more time', 'more impressive than the myth', 'İKİ SEÇENEKLİ']) assert.ok(end.includes(s), s);
  assert.ok(!end.includes('What to watch next') && !end.includes('SERİ'), 'tarih videosunda yok');
  assert.ok(L.endGrowthLines({ finance: true }).join('\n').includes('What to watch next'));
  assert.ok(L.endGrowthLines({ news: true, series: 'Myths That Turned Out To Be True' }).join('\n').includes('SERİ ("Myths That Turned Out To Be True")'));
  const script = read('src', 'pipeline', 'docu-script.js');
  assert.ok(script.includes('...(!first && !last && ch.midpoint ? middleGrowthLines() : [])'));
  assert.ok(script.includes('...(last && !plan.ranking ? endGrowthLines({ news: !!plan.news, finance: !!plan.finance, series: plan.series || "" }) : [])'));
  assert.ok(script.includes('...(job.docuGenre === "finance" ? { finance: true } : {})'));
});

test('kapanış açılışa döner: son sakin fotoğraf ilk dakikadaki gerçek fotoğrafa, yalnızca son satır açılışla bağlıysa', async () => {
  const { bookendClosing } = await import('../src/pipeline/docu.js');
  const make = (lastSay) => ({ scenes: [
    { type: 'title', dur: 4, say: '' },
    { type: 'photo', image: 'build/j/arch-a.jpg', archived: true, imgW: 2000, imgH: 1300, focus: [0.5, 0.3], dur: 6, say: 'The gun is deserted. Then an eighteen-year-old cadet climbs up to it.' },
    { type: 'counter', dur: 5, say: 'Five shells left.' },
    { type: 'photo', image: 'build/j/img-x.jpg', search: 'sunset sea', dur: 12, say: lastSay },
  ] });
  const credits = { 'scene-1': { file: 'arch-a.jpg' } };
  const s = make('The cadet never came home.');
  assert.equal(bookendClosing(s, credits), 1);
  assert.equal(s.scenes[3].image, 'build/j/arch-a.jpg');
  assert.equal(s.scenes[3].bookend, 1);
  assert.ok(!('search' in s.scenes[3]) && credits['scene-3'] === credits['scene-1'], 'künye de gelir');
  assert.equal(bookendClosing(make('The war ended two years later.'), {}), 0, 'son satır açılıştan söz etmiyorsa dönüş yok');
  const clip = make('The cadet never came home.'); clip.scenes[3].video = 'x.mp4';
  assert.equal(bookendClosing(clip, {}), 0, 'klip kapanışa dokunulmaz');
  const docu = read('src', 'pipeline', 'docu.js');
  assert.ok(docu.includes('if (!patching && bookendClosing(ed, cr))'), 'yama eski videoyu değiştirmez');
  assert.ok(read('src', 'pipeline', 'docu-qa.js').includes('const bookend = x === last'), 'kalite denetimi bunu tekrar saymaz');
});

test('anlatım sesi: akan cümle, az soru, izleyiciyle konuşma; karne Hidden History paragrafını temiz, bizim Black Buck paragrafını hedef dışı bulur', async () => {
  const E = await import('../docu-engine/lib/edit-scorecard.mjs');
  // Hidden History (815 abone, 372 bin) — tam transkriptten bir paragraf
  const theirs = ["The Stephen Hopkins was a Liberty ship.", "If you know anything about these ships, you know they were never meant to be heroes.", "They were built fast and cheap in enormous numbers, largely by unskilled workers, to replace the merchant ships German U-boats were sinking faster than Britain could survive.", "Simple design, old-fashioned steam engines, a top speed of about 11 and 1/2 knots, slower than the raider that was about to find her.", "Here's what you need to understand about that moment.", "Merchant ships caught by raiders often did surrender.", "You couldn't outrun them, you couldn't outgun them, and surrender meant a prison camp instead of the bottom of the ocean.", "Paul Buck did not stop."];
  // Bizim Black Buck (20261015-cd55b5) — aynı türden bir paragraf
  const ours = ["Its squadrons flew from RAF Waddington, in Lincolnshire.", "Numbers 44, 50 and 101 Squadrons.", "The Waddington Wing.", "Their crews had trained for one job: a single nuclear strike.", "Ordinary iron bombs?", "They had barely practised with those in years.", "It was meant to retire.", "Instead, it went to war.", "But the real problem was the map.", "And if it got there, would one hole in a runway matter?"];
  const t = E.narrationStyle(theirs.map((say) => ({ say })), 0.5);
  const o = E.narrationStyle(ours.map((say) => ({ say })), 0.5);
  assert.ok(t.sent >= E.STYLE_TARGETS.sent, JSON.stringify(t));
  assert.ok(o.sent < E.STYLE_TARGETS.sent, JSON.stringify(o));
  const card = E.editScorecard({ scenes: ours.map((say) => ({ type: 'photo', say, dur: 3 })) });
  assert.match(E.scorecardLine(card), /hedef dışı: .*cümle ort\. /);
  // beş farklı ses var: kısa cümle oranı ve "you" sese bağlı — yalnızca yazılır, hedef dışı sayılmaz (Frontline 'you' 0,04, Inside Decoded 0,07)
  const frontline = E.editScorecard({ scenes: [{ type: 'map', say: 'The garrison grew to more than 11,000 men on Jersey by 1944, one soldier for every four islanders quartered in a fortress.', dur: 9 }, { type: 'map', say: 'Every one of those men had a helmet, a rifle, a gas mask, and a kit, and all of it was about to become the liberators problem.', dur: 9 }] });
  assert.ok(!frontline.misses.some((m) => /you|kısa cümle|cümle ort/.test(m)), frontline.misses.join('; '));
  // yazar: ortak kurallar + kanalın kendi sesi (tarih = belgesel hikâye, gündem = sakin haber, finans/bilim = sunuculu)
  const v = L.voiceGrowthLines().join('\n');
  for (const s of ['AKAN CÜMLE', 'TEASER YAĞDIRMA', 'İNSAN VE AYRINTI', 'SAYI AZ VE TUTULU', 'GÜNDELİK BENZETME', 'TEMA CÜMLESİ', 'BELGESEL HİKÂYE', "Anlatıcı 'I' demez"]) assert.ok(v.includes(s), s);
  assert.ok(!v.includes('DÜRÜST AYAR') && !v.includes('SAKİN HABER'));
  const news = L.voiceGrowthLines({ style: 'news' }).join('\n');
  assert.ok(news.includes('SAKİN HABER') && news.includes('different facts') && !news.includes('BELGESEL HİKÂYE'));
  const host = L.voiceGrowthLines({ style: 'host' }).join('\n');
  for (const s of ["What's real / What's claimed / What's still unknown", 'TİPİK KİŞİYLE HESAP', 'HAKKINI VER', 'SUNUCULU']) assert.ok(host.includes(s), s);
  assert.deepEqual([L.voiceStyleOf({ news: true }), L.voiceStyleOf({ finance: true }), L.voiceStyleOf({ explain: true }), L.voiceStyleOf({})], ['news', 'host', 'host', 'story']);
  const script = read('src', 'pipeline', 'docu-script.js');
  assert.equal(script.split('...voiceGrowthLines({ style: voiceStyleOf(plan) })').length - 1, 2);
  assert.ok(script.includes('çoğunlukla bir OLAY olarak') && script.includes("'Whether it mattered was another question' gibi kalıp videoda en çok bir kez"));
});
