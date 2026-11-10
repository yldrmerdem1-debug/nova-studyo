// Başlık olayın adıyla başlar (26 Ekim 2026, denizaltı videosu, tarih kanalı): önerilen başlık
// "HMS Vanguard Was 'Probably a Container,' Said France" idi, diğerleri "Why Two Allied Nuclear Subs Couldn't Hear Each
// Other" gibi. Kullanıcı: "videonun ne olduğu belli olsun". Her başlık olayın adıyla (yılı biliniyorsa yılıyla) açılır,
// açı iki noktadan sonra gelir; alıntı ve konuyu saklayan gizem açılışı modele onarıma döner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'nova-title-anchor-'));
process.env.NOVA_HOME = home; process.env.TEMP = home; process.env.TMP = home;
const L = await import('../src/pipeline/docu-lint.js');
const P = await import('../src/pipeline/docu-package.js');

// Gerçek iş klasörlerindeki konu ve çalışma başlıkları.
const SUB = { topic: 'Two Nuclear Submarines Collided in the Atlantic: The 2009 HMS Vanguard and Le Triomphant Accident', title: 'HMS Vanguard and Le Triomphant: The Night Two Nuclear Submarines Collided in the Atlantic' };
const FRANCE = { topic: "France's €3 Trillion Debt Trap: How Europe's Second Economy Ran Out of Room", title: "France's €3.6 Trillion Debt: How Europe's Second Economy Ran Out of Room" };
const HASTINGS = { topic: '1066: The 19 Days That Changed England', title: '1066: The 19 Days That Changed England' };

test('olayın adı ve yılı konudan ve çalışma başlığından çıkar', () => {
  const a = L.storyAnchor(SUB);
  assert.equal(a.year, '2009');
  for (const w of ['hms', 'vanguard', 'triomphant', 'nuclear', 'submarine']) assert.ok(a.names.includes(w), w);
  assert.equal(L.storyAnchor(FRANCE).year, null, 'yıl yazmayan haber konusunda yıl şartı yok');
  assert.ok(L.storyAnchor(HASTINGS).names.includes('england'), 'baş yalnız yılsa adlar başlığın geri kalanından');
});

test('denizaltı videosunun eski başlıkları reddedilir', () => {
  const a = L.storyAnchor(SUB);
  const bad = {
    "HMS Vanguard Was 'Probably a Container,' Said France": /alıntı/,
    "Why Two Allied Nuclear Subs Couldn't Hear Each Other": /olayın adıyla başlamalı/,
    'HMS Vanguard vs Le Triomphant: The 2009 Sub Collision': /yıl \(2009\)/,
    'The Night Two Nuclear Submarines Collided': /olayın adıyla başlamalı/,
    '“Probably a Container”: HMS Vanguard in 2009': /alıntı/,
  };
  for (const [t, re] of Object.entries(bad)) assert.match(L.titleAnchorErrors(t, a).join(' | '), re, t);
});

test('adı ve yılı başta olan başlıklar geçer; iyelik kesmesi alıntı sayılmaz', () => {
  const sub = L.storyAnchor(SUB);
  for (const t of ['The 2009 Nuclear Submarine Collision: HMS Vanguard vs Le Triomphant', 'HMS Vanguard and Le Triomphant (2009): Why Neither Heard the Other', 'Two Nuclear Submarines Collided in 2009: What Went Wrong']) assert.deepEqual(L.titleAnchorErrors(t, sub), [], t);
  const fr = L.storyAnchor(FRANCE);
  assert.deepEqual(L.titleAnchorErrors("France's €3.6 Trillion Debt: Where the Room Went", fr), []);
  assert.match(L.titleAnchorErrors('Why France Now Pays More Than Italy to Borrow', fr).join(' '), /olayın adıyla başlamalı/);
  const h = L.storyAnchor(HASTINGS);
  assert.deepEqual(L.titleAnchorErrors('1066: How William Won England in 19 Days', h), [], 'olayın adı yılın kendisiyse yılla açılabilir');
});

test('paket planı: kural modele onarım için döner; geri sayım ve dizi kendi kalıbında kalır', () => {
  const thumbs = [
    { hero: 'c1', layout: 'hero', text: 'Neither Heard It', titleIndex: 0 },
    { hero: 'c2', layout: 'number', number: '32', text: 'Missiles', titleIndex: 1 },
    { hero: 'c1', layout: 'document', text: 'Day Twelve', titleIndex: 2 },
  ];
  const old = ["HMS Vanguard Was 'Probably a Container,' Said France", 'HMS Vanguard vs Le Triomphant: The 2009 Sub Collision', 'Two Nuclear Submarines Collided in 2009. Neither Heard It', '32 Missiles, 2 Reactors: The 2009 Atlantic Submarine Crash', "Why Two Allied Nuclear Subs Couldn't Hear Each Other"];
  const docu = { title: SUB.title };
  const anchor = P.packageAnchor({ topic: SUB.topic, docu, script: {} });
  const e = P.planErrors({ titles: old.map((text) => ({ text, angle: 'x' })), thumbnails: thumbs }, { ids: ['c1', 'c2'], anchor });
  assert.ok(e.some((x) => /^titles\[0\] alıntı/.test(x)));
  assert.ok(e.some((x) => /^titles\[4\] olayın adıyla/.test(x)));
  assert.ok(e.some((x) => /^titles\[3\] olayın adıyla/.test(x)), '"32 Missiles" sayıyla açılıyor, olayın adıyla değil');
  const good = ['The 2009 Submarine Collision: HMS Vanguard vs Le Triomphant', 'HMS Vanguard and Le Triomphant (2009): Why Neither Heard', 'The 2009 Submarine Collision: Twelve Days of Silence', 'HMS Vanguard 2009: The Crash Two Navies Hid', 'Nuclear Submarine Collision 2009: 32 Missiles, One Crash'];
  assert.deepEqual(P.planErrors({ titles: good.map((text) => ({ text, angle: 'x' })), thumbnails: thumbs }, { ids: ['c1', 'c2'], anchor }), []);
  assert.equal(P.packageAnchor({ topic: '10 Disappearances', docu: { title: '10 Disappearances Nobody Solved', format: 'ranking' }, script: {} }), null);
  assert.equal(P.packageAnchor({ topic: SUB.topic, docu, script: {}, brand: { series: 'Then What' } }), null);
});

test('yedek paket: seo.json başlıklarından adı başta olan öne geçer (önerilen başlık odur)', () => {
  const anchor = L.storyAnchor(SUB);
  const t = P.sanitizeTitles([], ["Why Two Allied Nuclear Subs Couldn't Hear Each Other", 'The 2009 Submarine Collision: HMS Vanguard vs Le Triomphant'], anchor);
  assert.equal(t[0].text, 'The 2009 Submarine Collision: HMS Vanguard vs Le Triomphant');
  assert.equal(t.length, 2, 'hiçbir başlık atılmaz, yalnız sıra değişir');
});
