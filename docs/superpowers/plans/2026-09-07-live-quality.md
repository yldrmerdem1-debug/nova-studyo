# Gerçek üretim ve yayın ölçümü planı

> İş akışı: superpowers:subagent-driven-development. Kullanıcının “Kalanları hallet” talimatı önceki mesajdaki gerçek üretim, görsel/ses inceleme ve izleyici verisi işlerini onaylıyor. Kaynak Git deposu değil; sürüm öncesi dosya yedeği alındı.

**Hedef:** Bir kısa yeni videoyu gerçek sağlayıcılarla üretmek, ölçülebilen kalite sorunlarını uygulamada görünür yapmak ve gerçek YouTube dışa aktarımlarını inceleyebilmek.

**Mimari:** Mevcut üretim hattı korunur. Yerel postflight raporu ve yayın sonuçları içe aktarımı ayrı modüller olur; mevcut Kurgu ve yayın ekranına bağlanır.

**Teknolojiler:** Node/Express/Electron, FFmpeg/FFprobe, vanilla JS.

## Sınırlar

- API anahtarları çıktıya, rapora veya yeni test evlerine yazılmaz. Mevcut hizmetlere gönderilen yetkili isteklerde bellekte kullanılır.
- Başlangıçta bir adet 1 dakikalık İngilizce belgesel: mevcut kanal konularına uygun gerçek araştırma + yeni senaryo + yeni ElevenLabs sesi + stok medya. Tam AI ve ücretli video üretimi kapalı, AI görsel bütçesi sıfır. Gereksiz tekrar yok.
- Gerçek kaynak eksikliğinde sahte başarı, tahmini izlenme skoru veya uydurma analytics üretilmez. YouTube verisi kullanıcı kanalına erişim veya dışa aktarımla gerekir; yayınlama yetkisi varsayılmaz.
- Eski iş kaynakları ve son videolar korunur. Geliştirme testleri izole NOVA_HOME kullanır.
- Kayıtlı ayarlar kullanıcı tercihidir; geçici üretim tercihi mümkünse yalnız deneme işine uygulanır.

## A — Yerel kalite kontrolü (quality agent)

Dosyalar: yeni src/postflight.js ve test/postflight.test.mjs; gerekirse yeni src/postflight-api.js. Ana server/index/public dosyalarını root bağlar.

- [x] Gerçek FFprobe süreleri, A/V farkı, ilk 30 saniye anlatımı, uzun veya tekrar kullanılan görüntüler ve TTS zamanlarından açık boşluklar için rapor sözleşmesini kur.
- [x] `buildPostflight(id)` async: raporu jobDir/postflight.json'a yazar; salt yerel analiz ve örnek kareler. `readPostflight(id)` veya rapor dönüşü UI için güvenli veriler verir. Aktif işi reddet, kaynak eksikliği eylem önerisi versin.
- [x] Kanıta bağlı bulgular (timestamp, sceneId, severity, message, metric) üret; öznel dinleme/semantik doğruluk/izlenme garantisi iddiası yok. Film sonu payını konuşma arası boşluk sayma.
- [x] Gerçek FFmpeg fixture ve kötü cache kayıtlarıyla anlamlı testler; test çıktısı ve rapor.

## B — YouTube dışa aktarımı ve sonuç geçmişi (audience agent)

Dosyalar: yeni src/audience.js, test/audience.test.mjs; publication.js değişikliği gerekiyorsa önce root ile sözleşme. Public/server dosyalarını root bağlar.

- [x] Resmî YouTube dışa aktarımı/retention metriklerini doğrula. Noktalı virgül/virgül, BOM ve tırnaklı CSV desteği; boyut/satır sınırı ve geçersiz sayılar için testler.
- [x] `importAudience(id,{csv,filename,videoId?,durationSec?,period?})`: CSV içeriğini yalnız o işte sakla; kaynak, ithal zamanı, video kimliği ve dönem kaydı tut. Birden fazla videodan sessiz toplam yapma.
- [x] Özet metrikler ve mümkünse retention eğrisi çıkar; 30. saniye metriğini ancak gerçek süre/zaman ekseniyle hesapla. Eksik veri eksik kalır.
- [x] `audienceReport(id)` geçmişi ve ölçüme dayalı önerileri döndürür; farklı tarih/kitlelerden nedensel A/B kazananı ilan etmez. Elle kayıtlardan ithal kayıtlar ayırt edilir.
- [x] Offline örnek CSV testleri ve rapor; kullanıcıya ait veri yoksa bu sınır açıkça kaydedilir.

## C — Canlı üretim, arayüz ve teslim (root)

- [x] Model erişimi ve ses kotasını salt okunur kontrol et; 1 dakikalık iş oluştur, üretim tamamlanana kadar incele ve gerçek engelleri düzelt.
- [x] Postflight raporu, ilk 30 saniye video önizlemesi, inceleme checklist'i ve CSV içe aktarma/geçmişini mevcut editöre bağla. İnceleme kayıtları mevcut video revizyonuna bağlanmalı.
- [x] Çıktıyı kareler, kaynak eşleşmesi, ses sinyali ve varsa ayrı transkripsiyon kanıtıyla değerlendir; saptanan önemli sorunları düzelt. Öznel olarak dinlenmeyen sesi dinledim diye sunma.
- [x] Yeni testler, ilgili eski testler, bağımsız inceleme ve tarayıcı denemesi; güncel kaynakla paketle, kur ve sürümü doğrula.
- [x] Sonuçları gerçek üretim kimliği/çıktısı, sağlayıcı kullanım kaydı ve kalan dış veri gereksinimleriyle bildir.

## Gerçekleşen sonuç
1.2.0 kuruldu, kurulu uygulama açıldı ve paket/source eşleşmesi doğrulandı. 110 test geçti. Yeni 63 sn pilotun revizyon 2 çıktısı tamamlandı, yerel görüntü/ses ve çevrimdışı transkripsiyon kontrolü yapıldı. ElevenLabs payment_issue nedeniyle yalnız pilot Edge sesine geçirildi; ücretli Scribe canlı denemesi yapılmadı. Kullanıcı Analytics CSV'si sağlanmadığından gerçek izleyici analizi dış girdiye bağlıdır. Son kanıt: docs/superpowers/reports/1.2.0-teslim.md ve çalışma klasöründeki quality-review/1.2.0-delivery-verification.json.

