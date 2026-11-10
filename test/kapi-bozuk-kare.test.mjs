// BOZUK KARE DÜZELTMESİZ GEÇMEZ — kapı her orta/yüksek önemli "broken" bulgusuna bir düzeltme verir, sürerse başka bir
// düzeltme dener, basamaklar bitince durur.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, denizaltı çarpışması, iş 20261024-373aaf): on-izleme/rapor-tur-1.json'da dört "broken"
// vardı — sahne 29 "Kare aşırı pozlanmış, neredeyse tamamen beyaz/krem" (HIGH, arşiv fotoğrafı, fx zoom-blur + flash-frame),
// 131 "Kare tamamen boş bej vinyet zemin" (HIGH, arşiv fotoğrafı; dosyanın kendisi sağlam), 4 "Harita neredeyse boş" ve 74
// "Harita yüklenmemiş" (çizilmemiş dünya haritaları). Plan {repick:[2,100,160,139], ai:[21,88,120,35,112,153], patches:[]}:
// dördüne de dokunmadı — arşiv fotoğrafının bozukluğu "rerender" sayılıyordu (yeniden seçim yalnızca klipte), cihazın
// bozukluğunun düzeltme yolu yoktu; bozuk kareler render'a gidecekti. Kural: resim sahnesi → yeniden seç (arşiv) ya da
// bozuk kare notuyla yeniden üret (AI), cihaz → sade görsel (kendi arşiv resmi olan manşet/belge/alıntı önce yeniden
// seçilir); bozukluk sürerse sonraki tur başka basamak (efektler kalkar, en son önceki kare), aynı basamak iki kez denenmez,
// kapı sonsuza dönmez. Ayrıca: düşük önemli cihaz notu cihazı düz resme çevirmez. Görme modeli ve motorun hazırlığı
// taslak; ağ, ücretli çağrı, ffmpeg ve render YOK.
// SONRADAN ÖLÇÜLEN (aynı iş): 29, 74 ve 131'in "beyaz/boş bej" kareleri resmin değil anın kusuruydu — kare sahnenin son
// karesinden, çıkan film-burn/dip-color geçişinin içinden alınmıştı (kapi-kare-ani). Kural: geçiş karesi bozuk kare
// düzeltmesini tetikleyemez; geçişten kaçılamayan kısa sahnenin karesindeki "broken" sağlam resmi attırmaz (yalnızca
// bildirilir). Aşağıdaki plan testleri kare iyi bir andan alınmış gerçek bozukluk içindir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bozuk-kare-home-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const P = await import('../src/pipeline/docu-preview.js');
const Q = await import('../src/pipeline/docu-qa.js');
const G = await import('../src/pipeline/docu-design-gate.js');
const D = await import('../src/pipeline/docu.js');
const fp = G.sceneFp;

// Motora giden senaryodan (docu/engine-script.json) kısaltılmış sahneler, işin indeksleriyle.
const SAY29 = "A sonar dome is a submarine's ears, the window through which she hears the sea around her.";
const SAY131 = 'The replies read like a bank statement blacked out except for the balance.';
const MAP4 = { type: 'map', mood: 'tension', say: 'They collided underwater in the Atlantic, on the night of 3 to 4 February 2009.', dur: 5, region: 'world', box: [-23.957, 42.5, -6.043, 49.5], points: [{ label: 'Atlantic', x: 0.5, y: 0.5 }], focus: 0, mapName: 'Atlantic', energy: 3, pace: 'normal' };
const PHOTO29 = { type: 'photo', mood: 'reveal', say: SAY29, dur: 5, source: 'stock', search: 'submarine sonar headphones', imagePrompt: 'Detail shot of headphones and a glowing green sonar screen in a dark control room, faint red light', image: 'build/j/arch-17ae2f543544.jpg', archived: true, imgW: 974, imgH: 1300, focus: [0.5, 0.3], grade: 'selective', fx: ['zoom-blur', 'flash-frame'], camera: 'detail-punch', fit: 'contain', energy: 4, pace: 'quick', icons: [{ id: 'ear', side: 'left', glow: true, at: 'ears' }] };
const MAP74 = { type: 'map', mood: 'tension', say: 'Between Brest and Faslane lay open ocean, and Vanguard was still out in it.', dur: 5, region: 'world', box: [-24.717, 45.318, 15.407, 59.142], points: [{ label: 'Brest', x: 0.5041, y: 0.7778 }, { label: 'Faslane', x: 0.4959, y: 0.2222 }], focus: 1, mapName: 'Faslane', energy: 4, pace: 'quick' };
const PHOTO131 = { type: 'photo', mood: 'tension', say: SAY131, dur: 5, source: 'stock', search: 'redacted document black ink', imagePrompt: 'Extreme close-up of a page with thick black redaction bars across most lines, harsh side light', image: 'build/j/arch-05772a976686.jpg', archived: true, imgW: 1024, imgH: 682, grade: 'mono', fit: 'cover', energy: 2, pace: 'normal', fullBleed: true };
const JOB = [];
Object.assign(JOB, {
  2: { type: 'photo', say: 'It was a British nuclear submarine.', source: 'stock', search: 'dark ocean underwater', imagePrompt: 'Underwater view looking down into black-blue Atlantic depths', image: 'build/j/arch-96fa9ea901a8.jpg', archived: true, icons: [{ id: 'ship', side: 'right' }] },
  3: { type: 'photo', say: 'France said its submarine had struck an object.', source: 'ai', imagePrompt: 'A submarine sail at dusk' },
  4: MAP4,
  21: { type: 'photo', say: 'The sonar dome was damaged, nobody aboard was hurt, and nuclear safety had never been compromised.', imagePrompt: 'Detail of a typed official French government statement lying on a dark desk under a single lamp' },
  29: PHOTO29,
  35: { type: 'photo', say: '[softly] On that night, neither seems to have heard the other.', source: 'ai', imagePrompt: 'Extreme wide underwater view of two faint submarine silhouettes far apart in black-blue water' },
  74: MAP74,
  88: { type: 'photo', say: 'As First Sea Lord, he was the professional head of the Royal Navy.', source: 'archive', search: 'First Sea Lord Royal Navy admiral 2009', imagePrompt: "Medium shot of the man in admiral's uniform standing at a lectern" },
  100: { type: 'photo', say: '[serious] The French Defence Minister went on television and said the quiet part out loud.', source: 'archive', search: 'Hervé Morin French defence minister 2008', name: 'Hervé Morin', image: 'build/j/arch-768e065bdb81.jpg', archived: true },
  112: { type: 'photo', say: 'So had her starboard diving plane. The first statement had mentioned the dome alone.', source: 'archive', search: 'French submarine sail diving planes', imagePrompt: 'Close-up of the horizontal diving plane jutting from a submarine sail' },
  120: { type: 'photo', say: '[serious] On 17 February 2009, British ministers were handed a line to repeat.', source: 'ai', imagePrompt: 'Wide shot of a pale stone government building in Whitehall', caption: 'WHITEHALL · 17 FEBRUARY 2009' },
  131: PHOTO131,
  132: { type: 'photo', say: 'The Ground Zero Center at Bangor.', image: 'build/j/arch-gz.jpg', archived: true },
  139: { type: 'photo', say: 'His written question to the French National Assembly offered suspicion, not evidence.', source: 'stock', search: 'fishing boat grey harbour', image: 'build/j/arch-157475addd68.jpg', archived: true },
  153: { type: 'photo', say: 'They never did. They arrived in the same water, both listening, neither making a sound to hear.', source: 'ai', imagePrompt: 'Wide underwater shot of two dark submarine silhouettes far apart in murky blue-black water' },
  160: { type: 'words', say: 'It was two boats built never to be heard, listening exactly as designed.', source: 'stock', search: 'dark ocean surface aerial', text: 'listening exactly as designed.', textMode: 'none', video: 'build/j/clip-0a0c4e69aa2b.mp4', image: 'build/j/clip-0a0c4e69aa2b.jpg', archived: true },
});
// rapor-tur-1.json'un 16 bulgusu, görme bulgusu kuralından (visionIssue) ve kapının tekrar/zaman çizelgesi kayıtlarıyla.
const seen = (scene, kind, severity, detail) => Q.visionIssue({ frame: 1, kind, severity, detail }, { t: scene * 4, row: { r: scene, scene, start: scene * 4 - 1, end: scene * 4 + 2, s: JOB[scene] } });
const ROUND1 = [
  seen(2, 'generic', 'high', 'Kanca karesinde anlatım İngiliz nükleer denizaltısını söylüyor; görsel yalnızca jenerik su yüzeyi ve gemi ikonu, denizaltı görünmüyor.'),
  seen(4, 'broken', 'medium', "Harita neredeyse boş: kıyı çizgisi yok, yalnızca 'ATLANTIC' etiketi ve nokta var; çarpışma yeri anlaşılmıyor."),
  seen(29, 'broken', 'high', 'Kare aşırı pozlanmış, neredeyse tamamen beyaz/krem; sonar kubbesi anlatımına ait hiçbir şey seçilemiyor.'),
  seen(21, 'mismatch', 'low', 'Brest/Île Longue anlatılırken karlı dağlarla çevrili bir liman gösteriliyor; Brest coğrafyasıyla uyuşmuyor.'),
  seen(74, 'broken', 'high', "Harita yüklenmemiş: yalnızca boş bej vinyet zemin ve soluk 'FASLANE'/'BREST' etiketleri görünüyor, harita çizimi yok."),
  seen(131, 'broken', 'high', 'Kare tamamen boş bej vinyet zemin; hiçbir görsel ya da içerik yok.'),
  seen(88, 'repeat', 'medium', "#96'daki kürsüdeki amiral görseli bir sonraki sahnede birebir tekrar kullanılmış; ardından #98'de yine aynı kare geliyor."),
  seen(120, 'mismatch', 'medium', "'WHITEHALL · 17 FEBRUARY 2009' etiketi, Whitehall yerine denizdeki bir denizaltı görüntüsünün üzerine konmuş."),
  seen(100, 'wrong_face', 'medium', "'HERVÉ MORIN' isim kartındaki yüz, #116'daki Hervé Morin fotoğrafıyla uyuşmuyor; büyük olasılıkla başka biri."),
  seen(132, 'text_overflow', 'low', "Yazı 'GROUND ZERO' diye bitiyor, 'CENTER' eksik; kurumun adı yarım görünüyor ve üstünden ışık şeridi geçiyor."),
  seen(160, 'mismatch', 'low', "'Duyulmamak için yapılmış iki tekne' denirken ekranda köpük izi bırakan hızlı bir sürat teknesi var; denizaltı yok."),
  seen(139, 'mismatch', 'low', "Fransız Ulusal Meclisi'ne verilen yazılı sorudan söz edilirken ekranda denizde demirli küçük bir balıkçı teknesi var."),
  { scene: 35, kind: 'repeat', severity: 'medium', detail: 'Sahne 34 ile aynı kare (7 sn arayla)', fix: 'review', source: 'dhash' },
  { scene: 112, kind: 'repeat', severity: 'medium', detail: 'Sahne 109 ile aynı kare (21 sn arayla)', fix: 'review', source: 'dhash' },
  { scene: 153, kind: 'repeat', severity: 'medium', detail: 'Sahne 151 ile aynı kare (18 sn arayla)', fix: 'review', source: 'dhash' },
  { scene: 3, kind: 'hook_slow', severity: 'medium', detail: 'Kancada aynı kare 5,3 sn kesilmeden duruyor (büyük kanallar 1,5-3 sn\'de keser)', fix: 'insert', source: 'timeline' },
];

test('rapor-tur-1: dört bozuk karenin dördü de düzeltme alır; işin geri kalan planı aynı', () => {
  assert.equal(ROUND1.length, 16);
  assert.equal(ROUND1[2].fix, 'rerender', 'görme kuralı arşiv fotoğrafının bozukluğuna eskisi gibi "rerender" der (yeniden seçim kapının basamağı)');
  const plan = P.previewFixPlan(ROUND1, JOB, { fp });
  assert.deepEqual(plan.repick.map((f) => f.scene), [2, 100, 160, 139, 29, 131], 'arşiv fotoğrafları (29 beyaz, 131 boş) yeniden seçilir');
  assert.deepEqual(plan.ai.map((f) => f.scene), [21, 88, 120, 35, 112, 153]);
  assert.deepEqual(plan.patches.map((p) => [p.scene, p.fix]), [[4, 'device-fallback'], [74, 'device-fallback']], 'çizilmemiş haritalar sade görsele döner');
  assert.equal(plan.patches[0].say, fp(MAP4));
  assert.deepEqual(plan.repick.slice(4).map((f) => f.kind), ['broken', 'broken']);
});

// docu.js'nin kapı döngüsü (5d), taslak: tur → plan → yeniden seçim yeni arşiv dosyası verir, AI notu isteme yazılır, yamalar
// sahne başına birikir (mergePreviewPatches) ve yönetmenin senaryosuna baştan uygulanır (applyPreviewPatches) → sonraki tur.
const filler = (k) => ({ type: 'photo', say: `Filler line number ${k} about the two boats.`, image: `build/j/f${k}.jpg`, archived: true, source: 'archive', search: `boat ${k}`, dur: 4, voiceDur: 4 });
// Kancadan (ilk 30 sn) sonra, her bozuk sahnenin arasında başka bir resim: yalnızca bozuk kare kuralı çalışsın.
const directed = () => ({ title: 'Submarines', scenes: [
  ...Array.from({ length: 8 }, (_, k) => filler(k)),
  { ...MAP4, voiceDur: 4.5 }, filler(8), { ...PHOTO29, voiceDur: 4.5 }, filler(9), { ...MAP74, voiceDur: 4.5 }, filler(10), { ...PHOTO131, voiceDur: 4.5 }, filler(11),
] });
const BROKEN = [8, 10, 12, 14];
const placeTimeline = (sc) => { let at = 0; return sc.map((s) => { const frames = Math.round(Math.max(Number(s.dur) || 0, (s.voiceDur ?? 3) + 0.4) * 30); const p = { from: at, frames }; at += frames; return p; }); };
const render = async (items) => { for (const it of items) fs.writeFileSync(it.out, 'jpg'); return { files: items.map((it) => it.out) }; };
const vision = (isBroken) => async (o) => {
  const one = new Map();
  for (const g of o.got) if (isBroken(g.row.s) && !one.has(g.row.scene)) one.set(g.row.scene, { scene: g.row.scene, time: +g.t.toFixed(2), kind: 'broken', severity: 'high', detail: 'Kare boş/bozuk', fix: 'rerender', source: 'vision' });
  return { issues: [...one.values()], vision: { calls: 1, frames: o.got.length, skipped: null } };
};
async function gateRounds(judge) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bozuk-kare-'));
  const base = directed();
  const picks = {};
  const ai = {};
  let patches = [];
  const build = () => {
    const scenes = base.scenes.map((s, i) => (picks[i] ? { ...s, image: s.image.replace('.jpg', `-r${picks[i]}.jpg`) } : { ...s }));
    P.applyPreviewAiNotes(scenes, ai);
    return D.applyPreviewPatches({ ...base, scenes }, patches);
  };
  let engine = build();
  let changed = null;
  const plans = [];
  for (let round = 1; round <= P.PREVIEW_ROUNDS; round++) {
    const only = round > P.FULL_ROUNDS ? new Set(changed) : null;
    if (only && !only.size) break;
    const res = await P.previewGate({ props: engine, scenes: engine.scenes, render, placeTimeline, dir, judge, fp, round, only, ffmpeg: path.join(dir, 'ffmpeg-yok.exe') });
    const { repick, ai: notes, patches: fixes } = res.plan;
    plans.push([...repick.map((f) => `${f.scene}:repick`), ...notes.map((f) => `${f.scene}:ai`), ...fixes.map((p) => `${p.scene}:${p.fix}`)].sort((a, b) => parseInt(a, 10) - parseInt(b, 10)).join(' '));
    for (const f of repick) picks[f.scene] = (picks[f.scene] || 0) + 1;
    for (const a of notes) ai[a.scene] = a.note;
    patches = D.mergePreviewPatches(patches, fixes);
    changed = [...new Set([...repick, ...notes, ...fixes].map((f) => f.scene))];
    if (!changed.length) break;
    engine = build();
  }
  return { plans, engine, dir };
}

test('dört bozuk kare: düzeltme işe yarayınca kapı biter (harita sade görsel, beyaz kare efektsiz, boş kare yeni seçim)', async () => {
  // Motor haritayı çizemiyor (R5'in konusu); 29'un kareyi yakan flash/zoom-blur'u; 131'in ilk seçimi boş geliyor.
  const judge = vision((s) => s.type === 'map' || (s.say === SAY29 && s.fx?.length) || (s.say === SAY131 && s.image === PHOTO131.image));
  const { plans, engine } = await gateRounds(judge);
  assert.deepEqual(plans, ['8:device-fallback 10:repick 12:device-fallback 14:repick', '10:simplify', '']);
  const [m4, p29, m74, p131] = BROKEN.map((i) => engine.scenes[i]);
  assert.deepEqual([m4.type, m4.bg, m74.type, m74.bg], ['words', 'prev', 'words', 'prev'], 'harita önceki karenin üstünde yazı');
  assert.deepEqual([p29.type, p29.image, p29.fx, p29.icons], ['photo', 'build/j/arch-17ae2f543544-r1.jpg', undefined, undefined], 'yeni seçim + efektler kalktı');
  assert.deepEqual([p131.type, p131.image, p131.fullBleed], ['photo', 'build/j/arch-05772a976686-r1.jpg', true], 'yeni seçim, tasarım aynı');
});

test('bozukluk sürerse her tur başka basamak; aynı basamak iki kez denenmez; basamaklar bitince kapı durur (sonsuz tur yok)', async () => {
  const always = new Set(BROKEN.map((i) => fp(directed().scenes[i])));
  const { plans, engine, dir } = await gateRounds(vision((s) => always.has(fp(s))));
  assert.deepEqual(plans, [
    '8:device-fallback 10:repick 12:device-fallback 14:repick',
    '8:key-only 10:simplify 12:key-only 14:prev-picture',
    '8:prev-picture 10:prev-picture 12:prev-picture',
    '',
  ]);
  assert.ok(plans.length < P.PREVIEW_ROUNDS, 'altı tur dolmadan biter');
  for (const i of BROKEN) {
    const s = engine.scenes[i];
    assert.deepEqual([s.type, s.textMode, s.bg, s.image, s.archived, s.imagePrompt], ['words', 'none', 'prev', undefined, undefined, undefined], `sahne ${i}: önceki karenin üstünde yazısız`);
    assert.equal(s.say, directed().scenes[i].say, 'anlatım aynı (yamalar parmak iziyle bulunur)');
  }
  // Rapor kalır: son turda da bozuk kare bildirilir, ama planı boş.
  const last = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', `rapor-tur-${plans.length}.json`), 'utf8'));
  assert.ok(last.issues.some((x) => x.kind === 'broken'));
  assert.deepEqual(last.fixes, []);
  const first = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', 'rapor-tur-1.json'), 'utf8'));
  assert.deepEqual(first.fixes.find((f) => f.scene === 10), { scene: 10, fp: fp(PHOTO29), kind: 'broken', fix: 'repick' }, 'sonraki tur kaydı');
});

test('basamaklar: AI kartı önce yeniden üretilir, arşiv kartı önce yazısı; başlık önceki kareye dönmez; cihaz önce kendi arşiv resmi; sayaç yalnızca bildirilir', () => {
  const broken = (scene) => ({ scene, kind: 'broken', severity: 'high', detail: 'boş kare', fix: 'rerender' });
  const plan = (s, tried) => {
    const p = P.previewFixPlan([broken(0)], [s], { fp, tried: tried ? new Map([[0, tried]]) : null });
    return [...p.repick.map(() => 'repick'), ...p.ai.map((a) => `ai:${a.note.slice(0, 21)}`), ...p.patches.map((x) => x.fix)];
  };
  const aiWords = { type: 'words', say: 'Both boats went home.', text: 'went home', imagePrompt: 'two submarines in harbour' };
  assert.deepEqual(plan(aiWords), ['ai:a clear, well-exposed']);
  assert.deepEqual(plan(aiWords, [{ kind: 'broken', fix: 'ai' }]), ['key-only']);
  const noted = { ...aiWords, imagePrompt: `two submarines in harbour — ${P.previewFixPlan([broken(0)], [aiWords]).ai[0].note}` };
  assert.deepEqual(plan(noted), ['key-only'], 'not istemde zaten var: aynı resim gelirdi, basamak atlanır');
  const archWords = { type: 'words', say: 'Both boats went home.', text: 'went home', textMode: 'key', image: 'a.jpg', archived: true };
  assert.deepEqual(plan(archWords), ['clean-picture'], 'arşiv kartında önce yazının uygulaması (eskisi gibi)');
  assert.deepEqual(plan(archWords, [{ kind: 'broken', fix: 'clean-picture' }]), ['repick']);
  assert.deepEqual(plan(archWords, [{ kind: 'mismatch', fix: 'repick' }, { kind: 'broken', fix: 'clean-picture' }]), ['repick'], 'başka bulgunun düzeltmesi bozuk kare basamağı sayılmaz');
  const title = { type: 'title', say: 'x', title: 'SILENT RUNNING', image: 't.jpg', archived: true };
  assert.deepEqual(plan(title, [{ kind: 'broken', fix: 'other-style' }, { kind: 'broken', fix: 'repick' }]), [], 'başlık kartı önceki kareye dönmez');
  const held = { type: 'words', say: 'y', text: 'y', bg: 'prev', archived: true, image: 'prev.jpg' };
  assert.deepEqual(plan(held, [{ kind: 'broken', fix: 'key-only' }]), ['prev-picture'], 'önceki kareyi taşıyan satırın arşivi komşusunun: yeniden seçilmez');
  const headline = { type: 'headline', say: 'The papers said nothing.', paper: 'The Times', headline: 'Subs collide', image: 'h.jpg', archived: true, source: 'archive', search: 'Times 2009' };
  assert.deepEqual(plan(headline), ['repick'], 'kendi arşiv resmi olan manşet önce yeniden kurulur');
  assert.deepEqual(plan(headline, [{ kind: 'broken', fix: 'repick' }]), ['device-fallback']);
  assert.deepEqual(plan({ type: 'split', say: 'z', left: { label: 'A' }, right: { label: 'B' }, image: 's.jpg', archived: true }), ['device-fallback'], 'bölünmüş ekranın resmi arşiv anahtarı taşımaz');
  assert.deepEqual(plan({ ...MAP4 }, [{ kind: 'broken', fix: 'device-fallback' }]), [], 'yedeği bir türlü uygulanmamış cihaz turu döndürmez');
  assert.deepEqual(plan({ type: 'counter', say: 'c', from: 0, to: 2009 }), [], 'sayaç/grafik motorun çizimi: yalnızca bildirilir');
  // Ara plandaki bozukluk eskisi gibi o ara planı kaldırır.
  const ins = P.previewFixPlan([{ ...broken(0), insert: true }], [{ ...PHOTO131 }], { fp });
  assert.deepEqual(ins.patches.map((p) => p.fix), ['no-inserts']);
});

test('AI istemine önceki turda yazılmış not tekrar "yeniden üretim" sayılmaz (aynı istem aynı resim: tur boşa dönerdi)', () => {
  const s = { type: 'photo', say: 'The sonar dome was damaged.', imagePrompt: 'typed statement on a desk' };
  const issue = { scene: 0, kind: 'mismatch', severity: 'medium', detail: 'karlı dağlar', fix: 'review' };
  const first = P.previewFixPlan([issue], [s], { fp });
  assert.equal(first.ai.length, 1);
  const again = P.previewFixPlan([issue], [{ ...s, imagePrompt: `${s.imagePrompt} — ${first.ai[0].note}` }], { fp });
  assert.equal(again.ai.length + again.repick.length + again.patches.length, 0);
});

test('prev-picture: sahne kendi resmini, isim/yer yazısını ve efektlerini bırakır; başlık ve sayaç değişmez; ikinci uygulama aynı', () => {
  const out = G.applyFix({ ...PHOTO29, name: 'Sonar operator', caption: 'BREST · 2009', inserts: [{ src: 'i.jpg', at: 1 }], cutaway: true }, 'prev-picture');
  assert.deepEqual([out.type, out.textMode, out.bg], ['words', 'none', 'prev']);
  for (const k of ['image', 'archived', 'source', 'search', 'imagePrompt', 'fx', 'icons', 'focus', 'name', 'caption', 'inserts', 'cutaway', 'imgW']) assert.ok(!(k in out), `${k} kalktı`);
  assert.equal(out.text, 'through which she hears the sea around her.', 'anlatımın son sekiz sözü (fallbackScene gibi)');
  assert.deepEqual([out.say, out.mood, out.dur], [SAY29, 'reveal', 5]);
  assert.deepEqual(G.applyFix(out, 'prev-picture'), out);
  const title = { type: 'title', say: 'x', title: 'SILENT RUNNING', image: 't.jpg' };
  assert.deepEqual(G.applyFix(title, 'prev-picture'), title);
  const counter = { type: 'counter', say: 'c', from: 0, to: 2009 };
  assert.deepEqual(G.applyFix(counter, 'prev-picture'), counter);
  // Kaynak videonun (source-clips.js applySourcePicks) künyesi ve kendi sesi klibiyle gider: motor natSound'u her sahnede
  // anlatımın altına karıştırır (produce.mjs) — klip kalkınca sirenin sesi önceki karenin üstünde çalardı.
  const clip = G.applyFix({ type: 'photo', say: SAY131, video: 'build/j/src/c.mp4', videoDur: 6, image: 'build/j/src/c.jpg', archived: true, sourceLabel: 'Video: Royal Navy', natSound: { file: 'build/j/src/c.wav', dur: 6 } }, 'prev-picture');
  assert.deepEqual([clip.type, clip.bg, clip.video, clip.sourceLabel, clip.natSound], ['words', 'prev', undefined, undefined, undefined]);
});

test('düşük önemli cihaz notu cihazı düz resme çevirmez (görme kuralından geçen bulguyla kapı); orta önemli çevirir; fotoğrafta düşük not eskisi gibi düzeltilir', async () => {
  const scenes = [...Array.from({ length: 8 }, (_, k) => filler(k)), { ...MAP74, voiceDur: 4.5 }, filler(8), { ...PHOTO131, voiceDur: 4.5 }, filler(9)];
  const gate = async (severity) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bozuk-kare-dusuk-'));
    const judge = async (o) => {
      const at = (i) => o.got.findIndex((g) => g.row.scene === i);
      const raw = [[8, { kind: 'mismatch', severity, detail: 'Faslane İskoçya değil İrlanda kıyısında gösterilmiş' }], [10, { kind: 'mismatch', severity: 'low', detail: 'karartılmış belge yerine yığın' }]];
      return { issues: raw.map(([i, it]) => Q.visionIssue({ frame: at(i) + 1, ...it }, o.got[at(i)])).filter(Boolean), vision: { calls: 1, frames: o.got.length, skipped: null } };
    };
    return P.previewGate({ props: { scenes }, scenes, render, placeTimeline, dir, judge, fp, ffmpeg: path.join(dir, 'ffmpeg-yok.exe') });
  };
  const low = await gate('low');
  assert.ok(low.issues.some((x) => x.scene === 8 && x.device && x.severity === 'low'), 'bulgu raporda');
  assert.deepEqual(low.plan.patches, [], 'harita kalır');
  assert.deepEqual(low.plan.repick.map((f) => f.scene), [10], 'fotoğrafın düşük önemli uyuşmazlığı yine yeniden seçilir (tek render)');
  const medium = await gate('medium');
  assert.deepEqual(medium.plan.patches.map((p) => [p.scene, p.fix]), [[8, 'device-fallback']]);
});

// İşin gerçek zaman çizelgesi (docu/20261024-373aaf.props.json + placeTimeline): sahneler, kare sayıları, son sözcükler; çıkan
// geçişler engine-script'ten (30 ← film-burn, 75 ← film-burn, 132 ← dip-color). Görme denetimi taslağı, sahnenin son 10
// karesini (çıkan çift geçiş — film-burn 9, dip-color 7 kare — ve yazının sönmesi) "boş bej vinyet" görür: çizilen kare
// geçişin içindeyse bozuk der, değilse resim sağlam.
const W = (pairs) => pairs.map(([word, t]) => ({ word, t }));
const realJob = () => {
  const scenes = [
    ...Array.from({ length: 8 }, (_, k) => ({ ...filler(k), transition: 'cut' })),
    { type: 'photo', transition: 'spin-blur', say: '[slowly, with weight] And the part of Le Triomphant that broke was her bow.', image: 'build/j/arch-bow.jpg', archived: true, source: 'archive', search: 'Le Triomphant bow' },
    { ...PHOTO29, transition: 'cut', wordTimes: W([['A', 0], ['ears,', 2.08], ['window', 3.28], ['hears', 4.28], ['sea', 4.92], ['around', 5.12], ['her.', 5.84]]) },
    { type: 'slam', transition: 'film-burn', say: 'The part built to hear danger was the part the danger broke.', word: 'broke' },
    { type: 'words', transition: 'spin-blur', say: 'Vanguard faced a longer passage north, toward Faslane on the Clyde.', text: 'toward Faslane', textMode: 'key', image: 'build/j/arch-clyde.jpg', archived: true },
    { ...MAP74, transition: 'cut', wordTimes: W([['Between', 0], ['Vanguard', 3.28], ['out', 4.32], ['in', 4.56], ['it.', 4.92]]) },
    { type: 'photo', transition: 'film-burn', say: 'In London, the Ministry of Defence would not even confirm that anything had happened.', image: 'build/j/arch-mod.jpg', archived: true },
    { type: 'ui-card', transition: 'cut', say: 'MPs had asked about repair costs, the sonar, the marine environment and France.' },
    { ...PHOTO131, transition: 'cut', wordTimes: W([['The', 0], ['statement', 1.6], ['except', 3.04], ['the', 3.52], ['balance.', 4.12]]) },
    { type: 'words', transition: 'dip-color', say: '[firmly] The Nuclear Information Service and the Ground Zero Center asked for the report itself.', text: 'the report itself', textMode: 'key', image: 'build/j/arch-gzc.jpg', archived: true },
  ];
  return { scenes, frames: [...Array(8).fill(132), 152, 188, 130, 137, 160, 156, 192, 139, 211] };
};
const placeFrames = (frames) => () => { let at = 0; return frames.map((n) => { const p = { from: at, frames: n }; at += n; return p; }); };
// Kare geçişin/sönmenin içindeyse "boş bej vinyet" (görme kuralından, işin bulgusunun sözüyle).
const washedVision = async (o) => ({
  issues: o.got.map((g, k) => {
    const from = Math.round(g.row.start * 30);
    const frames = Math.round((g.row.end - g.row.start) * 30);
    return Math.round(g.t * 30) - from >= frames - 10 ? Q.visionIssue({ frame: k + 1, kind: 'broken', severity: 'high', detail: 'Kare tamamen boş bej vinyet zemin; hiçbir görsel ya da içerik yok.' }, g) : null;
  }).filter(Boolean),
  vision: { calls: 1, frames: o.got.length, skipped: null },
});
const brokenFixes = (plan) => [...plan.repick, ...plan.ai, ...plan.patches].filter((f) => f.kind === 'broken').map((f) => `${f.scene}:${f.fix || 'repick/ai'}`);

test('geçiş karesi bozuk kare düzeltmesini tetikleyemez: işin zaman çizelgesiyle 29, 74, 131 temiz anda, sağlam resimler yerinde', async () => {
  const { scenes, frames } = realJob();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bozuk-kare-gecis-'));
  const res = await P.previewGate({ props: { scenes }, scenes, render, placeTimeline: placeFrames(frames), dir, judge: washedVision, fp, ffmpeg: path.join(dir, 'ffmpeg-yok.exe') });
  // Eski kod: 29 → 187/188, 74 → 159/160, 131 → 138/139 → üç "broken" → 29 ve 131 yeniden seçilir, harita düz resme döner.
  assert.deepEqual(res.issues.filter((x) => x.kind === 'broken').map((x) => x.scene), [], 'hiçbir kare geçişin içinden çizilmedi');
  assert.deepEqual(brokenFixes(res.plan), []);
  const [s29, m74, s131] = [9, 12, 15];
  assert.ok(!res.plan.repick.some((f) => [s29, s131].includes(f.scene)), 'sağlam arşiv fotoğrafları (arch-17ae2f543544, arch-05772a976686) yeniden seçilmez');
  assert.ok(!res.plan.patches.some((p) => p.scene === m74 && p.fix === 'device-fallback'), 'harita kalır');
});

test('kısa sahnenin geçiş karesindeki "broken" sağlam resmi attırmaz: yalnızca bildirilir (rapor ve günlükte "edge")', async () => {
  const SHORT = { ...PHOTO131, transition: 'film-burn', voiceDur: 0.2 };
  const scenes = [...Array.from({ length: 8 }, (_, k) => ({ ...filler(k), transition: 'cut' })), { ...filler(8), transition: 'cut' }, SHORT, { ...filler(9), transition: 'film-burn' }];
  const frames = [...Array(9).fill(132), 15, 132];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-bozuk-kare-kisa-'));
  const logs = [];
  const judge = async (o) => ({ issues: o.got.filter((g) => g.row.scene === 9).map((g) => Q.visionIssue({ frame: o.got.indexOf(g) + 1, kind: 'broken', severity: 'high', detail: 'Kare neredeyse tamamen beyaz/krem' }, g)), vision: { calls: 1, frames: o.got.length, skipped: null } });
  const res = await P.previewGate({ props: { scenes }, scenes, render, placeTimeline: placeFrames(frames), dir, judge, fp, logFn: (l) => logs.push(l), ffmpeg: path.join(dir, 'ffmpeg-yok.exe') });
  assert.deepEqual(res.issues.filter((x) => x.kind === 'broken').map((x) => [x.scene, x.edge]), [[9, true]], 'bulgu raporda, geçiş karesi diye işaretli');
  assert.deepEqual(brokenFixes(res.plan), [], 'yeniden seçim, AI, efekt ya da önceki kare yok');
  assert.ok(!res.plan.repick.some((f) => f.scene === 9));
  const report = JSON.parse(fs.readFileSync(path.join(dir, 'on-izleme', 'rapor-tur-1.json'), 'utf8'));
  assert.deepEqual(report.issues.filter((x) => x.kind === 'broken').map((x) => x.edge), [true]);
  assert.ok(logs.some((l) => l.includes('sahne 10: broken') && l.includes('geçiş karesi')), logs.join('\n'));
  const [lo, hi] = P.cleanSpan(scenes, placeFrames(frames)(), 9);
  assert.ok(lo > hi, '15 kare: film-burn girer, yazı söner, film-burn çıkar — temiz aralık yok');
  // Saf plan: aynı bulgu iyi bir andan geldiyse (edge yok) basamaklar eskisi gibi; geçiş karesinden geldiyse plan boş.
  const x = { scene: 0, kind: 'broken', severity: 'high', detail: 'boş bej', fix: 'rerender' };
  assert.deepEqual(P.previewFixPlan([x], [PHOTO131], { fp }).repick.map((f) => f.scene), [0]);
  const edge = P.previewFixPlan([{ ...x, edge: true }], [PHOTO131], { fp });
  assert.equal(edge.repick.length + edge.ai.length + edge.patches.length, 0);
  const map = P.previewFixPlan([{ ...x, edge: true }], [MAP74], { fp });
  assert.equal(map.patches.length, 0, 'geçiş karesindeki harita düz resme dönmez');
});
