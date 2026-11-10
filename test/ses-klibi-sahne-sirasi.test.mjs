// SES KLİBİNDEN SONRAKİ SAHNENİN DÜZELTMESİ KENDİ SAHNESİNE YAZILIR (docu.js: ön izleme kapısı + render sonrası düzeltme).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, 1. tur kod incelemesi — ortak docu.js paketi; Kartal Yuvası 20261024-950730'ta ses klibi
// yoktu, etkilenmedi): kapı ve render sonrası denetim sahneleri MOTORUN senaryosuyla sayar; ses klipleri (source-clips.js
// sourceVoice) oraya yeni sahne olarak girer. Düzeltme kayıtları ise YÖNETMENİN senaryosuyla okunur: docu-qa-fixes.json
// (applyQaRejections, qaAiOnly → arşiv seçicisinin aiOnly'si), AI notları (applyPreviewAiNotes), arşiv seçiminin silinmesi
// (invalidateArchivePicks) ve scene-N künyeleri. Klipten sonraki bir sahnenin yeniden seçimi bir SONRAKİ sahnenin arşiv
// seçimini siliyor, ret/AI notunu ona yazıyordu; sceneCredit'in sıra yedeği de o sahnenin künyesini veriyordu. Ses klibinin
// kendisi yeniden seçilince yönetmenin senaryosundaki ilgisiz bir sahne iki turda AI görseline düşerdi.
// Ağ YOK; seçimler ve künyeler işin kendi dosyalarının biçiminde.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-ses-klibi-sira-'));
globalThis.fetch = async () => { throw Error('Unstubbed network forbidden'); };
const D = await import('../src/pipeline/docu.js');
const { applySourcePicks } = await import('../src/pipeline/source-clips.js');
const { stablePhotoRefs } = await import('../src/pipeline/media.js');
const Q = await import('../src/pipeline/docu-qa.js');
const P = await import('../src/pipeline/docu-preview.js');
const { sceneFp } = await import('../src/pipeline/docu-design-gate.js');
const docuSrc = fs.readFileSync(new URL('../src/pipeline/docu.js', import.meta.url), 'utf8');

// Yönetmenin senaryosu (arşivden sonra): A, B, C arşivde; D'nin görseli AI.
const directed = () => ({ title: 't', scenes: [
  { type: 'photo', say: 'The mayor spoke at noon.', image: 'build/j/arch-a.jpg', archived: true, source: 'archive', search: 'mayor', dur: 4 },
  { type: 'photo', say: 'Then the fire reached the roof.', image: 'build/j/arch-b.jpg', archived: true, source: 'archive', search: 'roof fire', dur: 4 },
  { type: 'photo', say: 'Smoke rose over the valley.', image: 'build/j/arch-c.jpg', archived: true, source: 'archive', search: 'smoke valley', dur: 4 },
  { type: 'photo', say: 'By night it was gone.', imagePrompt: 'ruins of a mountain house at night', dur: 4 },
] });
const credits0 = () => ({
  'scene-0': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/a.jpg', file: 'build/j/arch-a.jpg' },
  'scene-1': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/b.jpg', file: 'build/j/arch-b.jpg' },
  'scene-2': { provider: 'wikimedia', url: 'https://upload.wikimedia.org/c.jpg', file: 'build/j/arch-c.jpg' },
});
const VOICE = { scene: 0, kind: 'voice', id: 'vvvvvvvvvvv', url: 'https://www.youtube.com/watch?v=vvvvvvvvvvv', title: 'Mayor speech', channel: 'Town TV', label: 'Video: Town TV', video: 'build/j/src/v.mp4', wav: 'build/j/src/v.wav', dur: 3, w: 1280, h: 720, quote: 'We will rebuild.' };
const engineOf = () => { const credits = credits0(); const { script } = applySourcePicks(directed(), credits, [VOICE]); return { script, credits }; };

test('directedIndexes: motor sırası → yönetmen sırası; araya giren ses klibi -1, aynı anlatım sırasıyla, elle değişmiş anlatım kaydırılmış sırayla', () => {
  const { script: eng } = engineOf();
  assert.deepEqual(eng.scenes.map((s) => (s.sourceVoice ? 'V' : s.say.slice(0, 8))), ['The mayo', 'V', 'Then the', 'Smoke ro', 'By night']);
  assert.deepEqual(D.directedIndexes(directed().scenes, eng.scenes), [0, -1, 1, 2, 3]);
  // İki ses klibi (sahne 0 ve 2'nin ardına).
  const two = applySourcePicks(directed(), credits0(), [VOICE, { ...VOICE, scene: 2, id: 'wwwwwwwwwww', url: 'https://www.youtube.com/watch?v=wwwwwwwwwww', video: 'build/j/src/w.mp4', wav: 'build/j/src/w.wav' }]).script;
  assert.deepEqual(D.directedIndexes(directed().scenes, two.scenes), [0, -1, 1, 2, -1, 3]);
  // Aynı anlatım iki kez: sırasıyla eşleşir. Klip yoksa sıra aynen (normal durum).
  const dup = { scenes: [{ say: 'x' }, { say: 'y' }, { say: 'x' }] };
  assert.deepEqual(D.directedIndexes(dup.scenes, [dup.scenes[0], { say: 'q', sourceVoice: {} }, dup.scenes[1], dup.scenes[2]]), [0, -1, 1, 2]);
  assert.deepEqual(D.directedIndexes(directed().scenes, directed().scenes), [0, 1, 2, 3]);
  // docu-scene-overrides.json anlatımı değiştirdiyse: eklenen klip kadar kaydırılmış sıra.
  const ov = eng.scenes.map((s, i) => (i === 3 ? { ...s, say: 'Smoke rose over the whole valley.' } : s));
  assert.deepEqual(D.directedIndexes(directed().scenes, ov), [0, -1, 1, 2, 3]);
});

test('kapının yeniden seçimi: künye, AI notu ve kayıt anahtarı yönetmenin sahnesi (eskiden bir sonraki sahne)', () => {
  const { script: eng, credits } = engineOf();
  const at = D.directedIndexes(directed().scenes, eng.scenes);
  // Motor sahnesi 2 = yönetmenin 1'i ("Then the fire"); motorun hazırladığı görsel künyedeki dosyadan başka (ör. .lift.jpg).
  const lifted = { ...eng.scenes[2], image: 'build/j/arch-b.lift.jpg' };
  assert.equal(D.sceneCredit(credits, lifted, at[2]).url, 'https://upload.wikimedia.org/b.jpg', 'kendi künyesi');
  assert.equal(D.sceneCredit(credits, lifted, 2).url, 'https://upload.wikimedia.org/c.jpg', 'eski sıra yedeği: bir sonraki sahnenin (C) künyesi reddedilirdi');
  assert.equal(D.sceneCredit(credits, { ...eng.scenes[3], image: 'build/j/arch-c.lift.jpg' }, at[3]).url, 'https://upload.wikimedia.org/c.jpg');
  // AI notu (kapının plan.ai'ı / PICK_AI_AFTER düşüşü) yönetmenin senaryosuna arşivden sonra yazılır (applyPreviewAiNotes).
  const note = 'it must plainly show what the narration says: By night it was gone.';
  const ed = directed();
  assert.equal(P.applyPreviewAiNotes(ed.scenes, { [at[4]]: note }), 1);
  assert.ok(ed.scenes[3].imagePrompt.endsWith(note), 'motor sahnesi 4 = yönetmenin 3\'ü (D)');
  assert.equal(P.applyPreviewAiNotes(directed().scenes, { 4: note }), 0, 'eski: motor sırası yönetmen senaryosunda yok, not kayboluyordu');
  assert.equal(D.fixSceneKey(at[2], eng.scenes[2]), 1);
});

test('ses klibinin kendisi yeniden seçilince yalnızca klibin adresi reddedilir: klip bir daha konmaz, ilgisiz sahne AI\'a düşmez', () => {
  const { script: eng, credits } = engineOf();
  const at = D.directedIndexes(directed().scenes, eng.scenes);
  assert.equal(at[1], -1);
  const c = D.sceneCredit(credits, eng.scenes[1], at[1]);
  assert.equal(c.url, VOICE.url, 'klibin kendi künyesi (dosyasıyla)');
  const key = D.fixSceneKey(at[1], eng.scenes[1]);
  assert.equal(key, `klip-${sceneFp(eng.scenes[1])}`);
  // İki tur üst üste (PICK_AI_AFTER = 2) aynı klip reddedildi: kayıtta tries/ai yok, yönetmen sırasında sahne yok.
  const fixes = { scenes: { [key]: { rejected: [...new Set(stablePhotoRefs(c))], kind: 'mismatch', detail: 'konuşan başka biri' } } };
  assert.deepEqual(Q.qaAiOnly(fixes), [], 'arşiv seçicisinin aiOnly listesine sahne girmez');
  const ed = directed();
  const cr = credits0();
  assert.equal(Q.applyQaRejections(ed, cr, fixes), 0);
  assert.deepEqual(ed.scenes, directed().scenes, 'yönetmenin sahneleri değişmez');
  // Sonraki hazırlık: docu.js'nin kaynak video adımına verdiği ret listesi → klip konmaz.
  const rejected = [...Object.values(fixes.scenes).flatMap((x) => x.rejected || [])];
  const again = applySourcePicks(directed(), credits0(), [VOICE], { rejected });
  assert.equal(again.script.scenes.length, 4, 'ses klibi bir daha araya girmez');
  assert.equal(again.added.length, 0);
});

test('docu.js: kapı ve render sonrası düzeltme, kaydı ve arşiv seçimini yönetmenin sırasıyla yazar', () => {
  const pre = docuSrc.indexOf('if (settings.docuPreview !== false && !patching && !job.docuPrepareOnly)');
  const gate = docuSrc.slice(pre, docuSrc.indexOf('// 6) MOTOR'));
  for (const s of [
    'const toDirected = directedIndexes(directed.scenes, engineDocu.scenes);',
    'for (const a of ai) if (toDirected[a.scene] >= 0) allAi[toDirected[a.scene]] = a.note;',
    'const at = toDirected[f.scene];',
    'const key = fixSceneKey(at, engineDocu.scenes[f.scene]);',
    'const c = sceneCredit(credits, engineDocu.scenes[f.scene], at);',
    'if (at < 0) { scenesFix[key] = { rejected, kind: f.kind, detail: f.detail }; continue; }',
    'scenesFix[at] = { rejected, tries,',
    'if (ai && !allAi[at]) allAi[at] =',
    'const ids = repick.map((f) => toDirected[f.scene]).filter((i) => i >= 0);',
    // Yalnızca ses klibi reddedildiyse arşiv geçişi (docu-archive-done.json) silinmez.
    'const removed = ids.length ? forgetArchivePicks(dir, directed, ids) : 0;',
  ]) assert.ok(gate.includes(s), s);
  const after = docuSrc.slice(docuSrc.indexOf('const maxRounds = Math.max(1, Math.min(3, Number(settings.docuAutoFixRounds) || 2));'));
  for (const s of [
    'const toDirected = directedIndexes(directed.scenes, engineDocu.scenes);',
    'const key = fixSceneKey(toDirected[f.scene], engineDocu.scenes[f.scene]);',
    'const c = sceneCredit(credits, engineDocu.scenes[f.scene], toDirected[f.scene]);',
    'const ids = qa.fixable.map((f) => toDirected[f.scene]).filter((i) => i >= 0);',
    'const removed = ids.length ? forgetArchivePicks(dir, directed, ids) : 0;',
  ]) assert.ok(after.includes(s), s);
  assert.ok(!docuSrc.includes('credits[`scene-${f.scene}`]'), 'motor sırasıyla künye aranmaz');
  assert.ok(!/scenesFix\[f\.scene\]/.test(docuSrc), 'motor sırasıyla kayıt yazılmaz');
});
