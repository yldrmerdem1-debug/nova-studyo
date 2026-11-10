// GÖSTERİLEN KLİBİN SESİ ANLATICIYLA ÜST ÜSTE KONUŞMAMALI.
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, kanal sahibi: "videoları gösterirken arada yine
// konuşuyor"): olay klibinin kendi sesi (natSound) anlatımın ~11 LU altına
// konuyordu. Fransa borcu (20261024-48ae2d) Merkel–Sarkozy basın toplantısında
// ikisinin konuşması, Le Parisien klibinde muhabirin sesi anlatıcının altında
// duyuldu; Kartal Yuvası (20261024-950730) drone kliplerinde başkasının müziği
// vardı (Content ID riski). Spektral düzlük ölçüsü konuşma/müzik ile ortam sesini
// ayırmadı (9 klip: 0,012-0,18 arası, sınıf sınırı yok).
//
// KURAL: klibin kendi sesi yalnızca docuNatSound: true ile girer. Kişinin kendi
// sesi (kind "voice") ayrı sahne olarak kalır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applySourcePicks } from '../src/pipeline/source-clips.js';

const pick = { scene: 0, kind: 'event', video: 'build/x/src/a.mp4', image: 'build/x/src/a.jpg', wav: 'build/x/src/a.wav', dur: 4, w: 1280, h: 720, url: 'https://www.youtube.com/watch?v=abc', title: 'Press conference', channel: 'Rapporteur News', label: 'Video: Rapporteur News · Oct 2011' };
const script = () => ({ scenes: [{ type: 'photo', say: 'Merkel and Sarkozy faced the press.', dur: 4, imagePrompt: 'p' }] });

test('attachSourceClips klibin sesini yalnızca docuNatSound: true ile açıyor', () => {
  const src = fs.readFileSync(new URL('../src/pipeline/source-clips.js', import.meta.url), 'utf8');
  assert.match(src, /natural:\s*settings\.docuNatSound\s*===\s*true/, 'varsayılan kapalı olmalı');
  assert.doesNotMatch(src, /natural:\s*settings\.docuNatSound\s*!==\s*false/, 'eski varsayılan (açık) kalmamalı');
});

test('kapalıyken klip görüntüsü girer, sesi girmez; açıkken girer', () => {
  const off = applySourcePicks(script(), {}, [pick], { natural: false });
  assert.equal(off.script.scenes[0].video, pick.video);
  assert.equal(off.script.scenes[0].natSound, undefined);
  const on = applySourcePicks(script(), {}, [pick], { natural: true });
  assert.equal(on.script.scenes[0].natSound?.file, pick.wav);
});
