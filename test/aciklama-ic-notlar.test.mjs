// AÇIKLAMADA İÇ NOT YOK (Kartal Yuvası 20261024-950730, Fransa borcu 20261024-48ae2d — 24 Ekim 2026).
//
// ÖLÇÜLEN KUSUR: Nova'nın kendi kopyala-yapıştır bloğu (package.md, "Baslik ve Aciklama.md" diye teslim edildi)
//   - görsel künyesini 5 (Fransa: 4) "Permission not verified: <klip adı>" satırıyla bitirdi: yayıncıya not,
//     izleyiciye gitti;
//   - aynı bloğun "The other archive images are public domain" cümlesi o YouTube kliplerini de kapsadı (klip lisansı
//     "YouTube — kısa alıntı (kaynak belirtilerek)" atıf kalıbına uymadığı için kamu malı sayıldı); kanalları hiç
//     yazılmadı;
//   - İngilizce açıklamada her müzik parçasının altına Türkçe "YouTube Ses Kitaplığı — atıf gerekmez" basıldı: docu.js
//     müzik listesini kurarken `source`u düşürüyor, künye kitaplık parçasını tanımıyordu.
// YUKLEME - aciklama.txt'ler ancak elle düzeltilerek temiz çıktı (15:49).
// Ağ YOK; kayıtlar işin kendi dosyalarından (kısaltılarak).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-aciklama-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { kunyeUret, muzikKunyesi } = await import("../src/pipeline/kunye.js");
const { renderSeoMarkdown } = await import("../src/pipeline/seo.js");

// docu-source-clips.json'daki seçimler (Kartal Yuvası; ikincisi sosyal medya) → source-clips.js applySourcePicks'in
// künye kaydı: { provider: youtube|social, eser, kanal, url, sayfa, file, type: "video", lisans: "YouTube — kısa alıntı …" }.
const picks = [
  { title: "Kehlsteinhaus - Eagle's Nest from above || Drone", channel: "Billy Cosgrave", url: "https://www.youtube.com/watch?v=nOmymsR6H9c", video: "build/20261024-950730/src/src-84d564d9c6.mp4" },
  { title: "Limoges City Hall on fire: what really happened", channel: "@citizen on TikTok", url: "https://www.tiktok.com/@citizen/video/1", video: "build/20261024-950730/src/src-8d26c0370b.mp4" },
];
const credit = (p) => ({ provider: /youtube.com|youtu.be/i.test(p.url || "") ? "youtube" : "social", eser: p.title, kanal: p.channel, url: p.url, sayfa: p.url, file: p.video, type: "video", lisans: "YouTube — kısa alıntı (kaynak belirtilerek)" });
const clipCredits = () => Object.fromEntries(picks.map((p, i) => [`scene-${i}`, credit(p)]));
const ccBy = { file: "build/x/arch-01070488eb92.jpg", provider: "wikipedia", lisans: "CC BY 4.0", sahip: "Anil Öztas", eser: "Berchtesgaden (DE), Dokumentation Obersalzberg -- 2024 -- 0411.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Berchtesgaden_(DE),_Dokumentation_Obersalzberg_--_2024_--_0411.jpg", lisansUrl: "https://creativecommons.org/licenses/by/4.0", modifications: "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama (duotone), film greni ve üst yazı eklendi." };
// Stok ve kamu malı: atıf istemez ama İngilizce açıklamada Türkçe not da basmamalı.
const pexelsClip = { file: "build/x/pexels-19.mp4", provider: "pexels", lisans: "Pexels License", sahip: "Lay-Z Owl", eser: "a burning wood", sayfa: "https://www.pexels.com/video/2590997/", lisansUrl: "https://www.pexels.com/license/", type: "video", modifications: "Video düzeninde bir bölümü kullanıldı (kısaltıldı), ses kaldırıldı; kadraj ve yeniden boyutlandırma, renk tonlama (duotone), film greni ve üst yazı eklendi." };
const mixkit = { file: "build/x/mixkit-114.mp4", provider: "mixkit", lisans: "Mixkit Stock Video Free License (ticari kullanım, atıf gerekmez)", sahip: "Mixkit", eser: "mountainous area in the alps", sayfa: "https://mixkit.co/free-stock-video/4132/", type: "video", modifications: "Video düzeninde bir bölümü kullanıldı (kısaltıldı), ses kaldırıldı; kadraj ve yeniden boyutlandırma, renk tonlama (duotone), film greni ve üst yazı eklendi." };
const pd = { file: "build/x/arch-a797af3dc45b.jpg", provider: "wikipedia", lisans: "Public domain", sahip: "DennisPeeters", eser: "Kehlstein Mountain.JPG", sayfa: "https://commons.wikimedia.org/wiki/File:Kehlstein_Mountain.JPG", modifications: ccBy.modifications };
// props.json musicCues (Kartal Yuvası), docu.js'nin o günkü biçiminde: { file, title, artist, license, sourceUrl, licenseUrl } — `source` yok
// (docu.js seoMusicList artık geçiriyor; burada künyenin lisanstan tanıması sınanıyor).
const cues = [
  { title: "Broken Promise", artist: "Jimena Contreras", license: "YouTube Ses Kitaplığı — atıf gerekmez", file: "broken-promise-f335cc.mp3", source: "youtube-audio-library" },
  { title: "Sad Trio", artist: "Kevin MacLeod", license: "\"Sad Trio\" Kevin MacLeod (incompetech.com) Licensed under Creative Commons: By Attribution 4.0", file: "sad-trio-69695d.mp3", source: "incompetech", sourceUrl: "https://incompetech.com", licenseUrl: "https://creativecommons.org/licenses/by/4.0/" },
  { title: "Standoff", artist: "Density & Time", license: "YouTube Ses Kitaplığı — atıf gerekmez", file: "standoff-49a0fd.mp3", source: "youtube-audio-library" },
  { title: "Pulse", artist: "Mixkit", license: "Mixkit Free License — ticari kullanım, atıf gerekmez", file: "pulse-1a2b3c.mp3", source: "mixkit" },
];
const docuMuzikleri = (list) => list.filter((c) => c?.title).map((c) => ({
  file: c.file || `${c.title}${c.artist ? `--${c.artist}` : ""}.mp3`, title: c.title, artist: c.artist, license: c.license, sourceUrl: c.sourceUrl, licenseUrl: c.licenseUrl,
}));
const INTERNAL = /Permission not verified|Changes not recorded|kısa alıntı|atıf|Ses Kitaplığı|Video düzeninde|doğrulanamadı/;
const blockOf = (md) => md.match(/## Açıklama[^\n]*\n(?:[^\n]*\n)*?```\n([\s\S]*?)\n```/)[1];
const seoMd = (media, muzikler) => renderSeoMarkdown({ language: "en", topic: "Eagle's Nest" }, { title: "Eagle's Nest" }, { description: "The Eagle's Nest burned.\n\n{BOLUMLER}", titles: ["Eagle's Nest"], tags: ["Eagle's Nest"] }, [{ start: 0, title: "Spared by a World War" }], 767, media, muzikler);

test("YouTube and social clips are credited with their channel, never as public domain, and their notes stay out of the text", () => {
  const media = { ...clipCredits(), "scene-116": ccBy };
  for (const opts of [{ dil: "en", grouped: true }, { dil: "en" }, { dil: "en", compact: true }, { dil: "en", mandatoryOnly: true }]) {
    const k = kunyeUret(media, opts), tag = JSON.stringify(opts);
    assert.doesNotMatch(k.metin, INTERNAL, tag);
    assert.doesNotMatch(k.metin, /public domain/, `${tag}: the clips were folded into the public-domain sentence`);
    assert.match(k.metin, /Kehlsteinhaus - Eagle's Nest from above \|\| Drone/, tag);
    assert.match(k.metin, /Billy Cosgrave on YouTube/, tag);
    assert.match(k.metin, /@citizen on TikTok/, tag);
    assert.match(k.metin, /Anil Öztas/, tag);
    assert.equal(k.zorunlu, 1, `${tag}: a clip is not a licensed work`);
    assert.equal(k.warnings.filter((w) => /Permission not verified/.test(w)).length, 2, `${tag}: the publisher is still told`);
  }
  assert.match(kunyeUret(media, { dil: "en", grouped: true }).metin, /• Short clips used for commentary and context: "Kehlsteinhaus - Eagle's Nest from above \|\| Drone" \(Billy Cosgrave on YouTube\); "Limoges City Hall on fire: what really happened" \(@citizen on TikTok\)/);
  assert.match(kunyeUret(media, { dil: "en" }).metin, /\n  Source: https:\/\/www\.youtube\.com\/watch\?v=nOmymsR6H9c/);
  // Turkish description: the same line in Turkish.
  assert.match(kunyeUret(media, { grouped: true }).metin, /• Yorum ve bağlam için kullanılan kısa klipler: .*\(YouTube: Billy Cosgrave\)/);
  // A real public-domain picture still gets its sentence.
  assert.match(kunyeUret({ ...media, pd }, { dil: "en", grouped: true }).metin, /The other archive images are public domain/);
  // A clip is never a required licensed credit, whatever its licence text says (a "by" in it reads as CC BY).
  const byClip = { "scene-0": { ...media["scene-0"], lisans: "Used by permission of the channel" } };
  for (const opts of [{ dil: "en", grouped: true }, { dil: "en" }]) assert.equal(kunyeUret(byClip, opts).zorunlu, 0, JSON.stringify(opts));
});

test("the English copy-paste block has no internal note or Turkish licence; the notes are printed below it for the publisher", () => {
  const media = { ...clipCredits(), "scene-116": ccBy, "scene-19": pexelsClip, "scene-114": mixkit, "scene-71": pd };
  const md = seoMd(media, docuMuzikleri(cues));
  const block = blockOf(md);
  assert.doesNotMatch(block, INTERNAL);
  assert.doesNotMatch(block, /[şğı]/, "no Turkish in an English description");
  assert.match(block, /Billy Cosgrave on YouTube/);
  assert.match(block, /Changes: A section used \(trimmed\), sound removed/, "the stock clip's change note in English");
  assert.match(block, /free for commercial use, no attribution required/, "Mixkit's licence note in English");
  assert.equal((block.match(/YouTube Audio Library/g) || []).length, 1, "library tracks summed up once");
  assert.doesNotMatch(block, /Broken Promise|Standoff/);
  assert.match(block, /• "Sad Trio" — Kevin MacLeod\n  https:\/\/incompetech\.com\n  "Sad Trio" Kevin MacLeod \(incompetech\.com\) Licensed under Creative Commons: By Attribution 4\.0\n  https:\/\/creativecommons\.org\/licenses\/by\/4\.0\//, "an attribution-required track keeps its full credit");
  const after = md.slice(md.indexOf(block) + block.length);
  assert.match(after, /\*\*Yayın öncesi kontrol \(görsel\):\*\*\n- Permission not verified: Kehlsteinhaus - Eagle's Nest from above \|\| Drone/);
  assert.ok(after.indexOf("Yayın öncesi kontrol (görsel)") < after.indexOf("## Etiketler"), "right after the block");
});

test("the grouped last fit (description over 5,000 characters) is just as clean", () => {
  const media = { ...clipCredits(), "scene-19": pexelsClip, "scene-71": pd };
  for (let i = 1; i <= 45; i++) media[`s${i}`] = { ...ccBy, file: `build/x/cm-${i}.jpg`, sahip: `Photographer Number ${i}`, eser: `Bayeux Tapestry Scene ${i} (cropped) with a rather long descriptive file name.png`, sayfa: `https://commons.wikimedia.org/wiki/File:X_${i}.jpg` };
  const md = seoMd(media, docuMuzikleri(cues));
  const block = blockOf(md);
  assert.match(block, /• CC BY 4\.0 \(Wikimedia Commons\): /, "the grouped variant was used");
  assert.ok(block.length <= 5000, `block ${block.length}`);
  assert.doesNotMatch(block, INTERNAL);
  assert.match(block, /Short clips used for commentary and context: .*Billy Cosgrave on YouTube/);
  assert.match(md.slice(md.indexOf(block) + block.length), /- Permission not verified: Limoges City Hall on fire/);
  // No publisher note at all: no section.
  assert.doesNotMatch(seoMd({ "scene-116": ccBy }, null), /Yayın öncesi kontrol \(görsel\)/);
});

test("music: the library is known by its licence too; a track whose licence asks for attribution stays listed", () => {
  const en = muzikKunyesi(docuMuzikleri(cues), { dil: "en" });
  assert.doesNotMatch(en.metin, /atıf|Kitaplığı/);
  assert.match(en.metin, /• Other tracks: YouTube Audio Library$/);
  assert.equal(muzikKunyesi(docuMuzikleri(cues.slice(0, 1)), { dil: "en" }).metin, "Music: YouTube Audio Library");
  assert.equal(muzikKunyesi(docuMuzikleri(cues.slice(0, 1))).metin, "Müzik: YouTube Ses Kitaplığı");
  assert.equal(muzikKunyesi([{ title: "Calm", artist: "A", license: "YouTube Audio Library — no attribution required", file: "calm.mp3" }], { dil: "en" }).metin, "Music: YouTube Audio Library");
  const owed = muzikKunyesi([{ title: "Hymn", artist: "B. Writer", license: "YouTube Audio Library — attribution required: \"Hymn\" by B. Writer", file: "hymn.mp3" }], { dil: "en" });
  assert.match(owed.metin, /• "Hymn" — B\. Writer/, "a required attribution is never folded into the library line");
  // docu.js now passes `source`: the licence still decides, a library track that asks for attribution stays listed.
  assert.match(muzikKunyesi([{ title: "Hymn", artist: "B. Writer", license: "YouTube Audio Library — attribution required: \"Hymn\" by B. Writer", file: "hymn.mp3", source: "youtube-audio-library" }], { dil: "en" }).metin, /• "Hymn" — B\. Writer/);
  assert.match(muzikKunyesi([{ title: "Aria", artist: "C", license: "YouTube Audio Library — Creative Commons Attribution 4.0", file: "aria.mp3", source: "youtube-audio-library" }], { dil: "en" }).metin, /• "Aria" — C/);
  assert.match(muzikKunyesi(docuMuzikleri(cues.slice(3)), {}).metin, /ticari kullanım, atıf gerekmez/, "Turkish description keeps its own wording");
});
