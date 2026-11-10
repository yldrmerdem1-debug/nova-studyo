// COMMONS KATALOĞU SORGULARI — konunun öznesi önce; konu cümlesi, kaynak adları ve Türkçe sözcükler sorgu değil.
//
// ÖLÇÜLEN KUSUR (24 Ekim 2026, denizaltı çarpışması, iş 20261024-373aaf): commons-catalog.json sorguları [konu cümlesi,
// başlık cümlesi, 'National Interest', 'France', 'Telegraph', 'Hansard', 'Bellona', 'Ground Zero Center', 'Fransa',
// 'Wikinews', 'Triomphant-class', 'Bugaled Breizh', 'Resmî', 'French']. Konu ve başlık 0 dosya buldu; 130 dosyanın
// yalnızca 13'ü konuydu (Çek banknotları, Colmar sokakları, Teksas telgraf ofisleri). Sebep: 80 karakterlik konu/başlık
// cümleleri tekrar anahtarıydı, içlerindeki "HMS Vanguard" ve "Triomphant" "zaten soruldu" diye atıldı; kategori
// taraması da ilk dört sorguda (iki cümle + iki kaynak adı) boşa gitti. Senarist 1 Commons dosyasını adıyla seçti,
// videoda 56 AI görseli. Ağ YOK: Commons sahte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { catalogQueries, buildCommonsCatalog } from '../src/pipeline/docu-commons-catalog.js';

const topic = 'Two Nuclear Submarines Collided in the Atlantic: The 2009 HMS Vanguard and Le Triomphant Accident';
const title = 'HMS Vanguard and Le Triomphant: The Night Two Nuclear Submarines Collided in the Atlantic';
// research.md'den kısaltılmış: olgu tablosu (kaynak sütunu), Türkçe notlar, bağlantılar.
const research = `# Araştırma Dosyası: 2009 HMS Vanguard – Le Triomphant Çarpışması
- Güvenilirlik: Grokipedia, 19FortyFive ve The National Interest gibi tekrar-anlatım siteleri **birincil kaynak değildir**.

| # | Olgu | Durum | Kaynak |
|---|---|---|---|
| 1 | İki denizaltı 3–4 Şubat 2009 gecesi Atlantik'te çarpıştı. | ✅ | Wikipedia: https://en.wikipedia.org/wiki/HMS_Vanguard_and_Le_Triomphant_submarine_collision |
| 3 | Yaralanma ve radyoaktif sızıntı bildirilmedi. | ✅ | Aynı kaynak; Bellona: https://bellona.org/news/nuclear-issues/2009-02-british-and-french-nuclear-subs-collide |
| 4 | Basın "Doğu Atlantik, ağır deniz, gece yarısı" dedi. | ✅ | Nuclear Information Service (NIS): https://www.nuclearinfo.org/article/foi-release |
| 5 | Bir kaynak yeri "Biscay Körfezi" diye yazdı. Resmî teyit yok. | ⚠️ | Ground Zero Center: https://www.gzcenter.org/subs-in-the-night/ |
| 6 | HMS Vanguard rutin devriyedeydi, Le Triomphant devriyeden dönüyordu. | ✅ | Fandom: https://military-history.fandom.com/wiki/HMS_Vanguard |
| 7 | Triomphant 70 günlük bir görev turunu bitiriyordu. | ⚠️ | Wikinews: https://en.wikinews.org/wiki/Two_nuclear_submarines_collide |
| 9 | Fransız açıklamasına göre sonar kubbesi hasar gördü. | ✅ | Bellona |
| 10 | Le Triomphant, fırkateyn eşliğinde Brest yakınındaki Île Longue üssüne döndü. | ✅ | Wikinews |
| 13 | HMS Vanguard, 14 Şubat 2009'da kendi gücüyle Faslane'e döndü. | ✅ | Hansard |
| 14 | Sun'a göre Vanguard yedekte çekilerek döndü. | ⚠️ | Bellona vs Hansard |
| 19 | Triomphant'ın hasarı: pruvadaki aktif sonar kubbesi. Triomphant'ın Vanguard'a çarptığına işaret ediyor. | ✅ | National Interest |
| 27 | Resmî olarak Avam Kamarası'nda soru soruldu. | ⚠️ | Hansard: https://hansard.parliament.uk/Commons/2009-03-02/debates/HMSVanguard |
| 30 | Fransa Savunma Bakanı Hervé Morin durumu "rastlantılar zinciri" diye niteledi. | ✅ | Wikinews |

Durum: Fransa ile görüşmeler sürüyor. Aynı bilgi başka kaynakta yok. Olgu tablosu yukarıda. Basın sessiz.
Durum değişmedi. Aynı gece HMS Vanguard 250 kişilik mürettebatla dalıştaydı; Le Triomphant 111 kişiyle.
Başka bir kaynak (National Interest: https://nationalinterest.org/blog/buzz/subs) "40'tan fazla" diyor.
Olgu: [The National Interest](https://nationalinterest.org/blog/subs-collide) ve [Wikinews](https://en.wikinews.org/wiki/Two) aynı rakamı veriyor.
Basın: Telegraph metninin kopyası var. Resmî açıklama Hervé Morin'den geldi; bakan Hervé Morin ertesi gün tekrarladı.
`;

test('konunun öznesi ilk dört sorguda: HMS Vanguard ve Triomphant (kategori taraması ilk dörtten yapılır)', () => {
  const q = catalogQueries({ topic, title, research });
  const ilk4 = q.slice(0, 4);
  // Ad, cümlenin içinde değil kendi başına sorgu (konu cümlesi de /HMS Vanguard/ içerir ama 0 dosya bulur).
  assert.ok(ilk4.includes('HMS Vanguard'), q.join(' | '));
  assert.ok(ilk4.some((x) => /^(Le )?Triomphant$/.test(x)), q.join(' | '));
  // Tek başına "Vanguard" değil: konu tam adı "HMS Vanguard" diyor ve araştırma da onu kullanıyor.
  assert.ok(!q.includes('Vanguard'), q.join(' | '));
});

test('konu/başlık cümlesi sorgu değil; kaynak sütunu, bağlantı ve Türkçe tablo sözcükleri sayılmaz', () => {
  const q = catalogQueries({ topic, title, research, max: 40 });
  assert.ok(!q.some((x) => x.split(/\s+/).length > 5), `cümle sorgu olmuş: ${q.join(' | ')}`);
  for (const bad of ['Bellona', 'Wikinews', 'Hansard', 'Ground Zero Center', 'Nuclear Information Service', 'Fransa', 'Resmî', 'Aynı', 'Başka', 'Olgu', 'Durum', 'Basın']) {
    assert.ok(!q.some((x) => x === bad || x.startsWith(`${bad} `)), `${bad} in ${q.join(' | ')}`);
  }
  assert.ok(q.includes('Hervé Morin'), 'gövdede iki kez geçen gerçek isim kalır');
});

test('araştırmanın başlığa yazdığı konu cümlesi konu ismi üretmez ("Is AI a Bubble?")', () => {
  const t = 'Is AI a Bubble? The Money, Debt and Profits Behind the Boom';
  const r = `# Araştırma Dosyası: "${t}"\nMicrosoft harcıyor. Microsoft borçlanıyor. Kristalina Georgieva uyardı. Kristalina Georgieva tekrar uyardı.\n1. ${t}\n`;
  const q = catalogQueries({ topic: t, research: r });
  for (const bad of ['Profits Behind the Boom', 'Is AI', 'Money', 'Debt', 'Bubble']) assert.ok(!q.includes(bad), `${bad} in ${q.join(' | ')}`);
  assert.ok(q.includes('Microsoft') && q.includes('Kristalina Georgieva'), q.join(' | '));
});

// İnceleme (25 Ekim 2026): etiket silme 120 karaktere kadar geri gidiyordu, "(Hansard: https://…)" ile biten olgu satırının
// ismi de siliniyordu; konu cümlesi tekrar anahtarı olmayınca başlığın sıradan sözcüğü ("Fire") ilk sorgulara çıkıyordu.
test('kaynağı satır sonunda verilen olgunun ismi sayılır; başlığın sıradan sözcüğü sorgu değil, gemi adı kalır', () => {
  const satir = '- HMS Vanguard returned to Faslane on 14 February (Hansard: https://hansard.parliament.uk/a)\n- HMS Vanguard was towed, said The Sun (Bellona: https://bellona.org/b)\n';
  assert.ok(catalogQueries({ topic: 'Hormuz mines', research: satir }).includes('HMS Vanguard'));
  const yangin = 'Fire broke out at 23:10. Fire crews came. The fire spread to the roof; the fire burned for hours and the fire was out by dawn. Martin Bormann ordered the house. Martin Bormann paid.';
  const q = catalogQueries({ topic: "Hitler's Eagle's Nest fire, October 2026", title: "The Eagle's Nest Fire: What Burned on the Kehlstein", research: yangin });
  assert.ok(!q.includes('Fire') && q.includes('Martin Bormann'), q.join(' | '));
  const gemi = 'Endurance sailed in 1914. Endurance was crushed by the ice. Endurance sank in 1915. It was a feat of endurance. Frank Worsley steered. Frank Worsley navigated.';
  assert.equal(catalogQueries({ topic: "Endurance: Shackleton's Lost Ship", research: gemi })[0], 'Endurance');
});

test('kaynak sütunundaki ad metinde de geçse kategori taramasının ilk dört sorgusuna girmez, sona kalır', () => {
  const r = `| # | Olgu | Kaynak |\n|---|---|---|\n| 1 | HMS Vanguard döndü. | Telegraph |\n| 2 | Le Triomphant döndü. | [The National Interest](https://nationalinterest.org/a) |\n
The Telegraph reported the collision. The Telegraph said more. The National Interest wrote. The National Interest added.
HMS Vanguard reached Faslane. HMS Vanguard was repaired at Faslane. Le Triomphant reached Brest. Le Triomphant docked at Brest.
Hervé Morin spoke. Hervé Morin repeated.`;
  const q = catalogQueries({ topic, title, research: r });
  const ilk4 = q.slice(0, 4);
  assert.ok(ilk4.includes('HMS Vanguard') && ilk4.includes('Le Triomphant'), q.join(' | '));
  assert.ok(!ilk4.includes('Telegraph') && !ilk4.includes('National Interest'), q.join(' | '));
  assert.ok(q.includes('Telegraph') && q.includes('National Interest'), `atılmaz, sona kalır: ${q.join(' | ')}`);
});

test('kısa konu eskisi gibi ilk sorgu; kategori taraması özneyle yapılır ("HMS Vanguard (S28)")', async () => {
  assert.equal(catalogQueries({ topic: 'Yom Kippur War', research: 'Golda Meir spoke. Golda Meir resigned.' })[0], 'Yom Kippur War');
  const queries = catalogQueries({ topic, title, research });
  const asked = [];
  const fetchJsonFn = async (url) => {
    const u = decodeURIComponent(url);
    asked.push(u);
    if (/srnamespace=14/.test(u) && /srsearch=HMS Vanguard/.test(u)) return { query: { search: [{ title: 'Category:HMS Vanguard (S28)' }] } };
    return { query: { pages: {}, search: [] } };
  };
  await buildCommonsCatalog({ queries, fetchJsonFn });
  assert.ok(asked.some((u) => /deepcategory:"HMS Vanguard \(S28\)"/.test(u)), asked.filter((u) => /srnamespace=14|deepcategory/.test(u)).join('\n'));
});
