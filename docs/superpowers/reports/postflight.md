# Postflight kalite raporu

## Uygulanan sözleşme

`src/postflight.js` iki API sunar:

- `await buildPostflight(id)`: yalnız yerel iş dosyalarını ve paketli FFmpeg/FFprobe ikililerini kullanır, `data/jobs/<id>/postflight.json` dosyasını atomik yazar ve güvenli raporu döndürür.
- `readPostflight(id)`: `{ available, stale, report }` döndürür. Kaynak imzası final videonun boyut/zaman bilgisini ve `script.json`, `tts.json`, `edit-plan.json`, `media.json`, `sound-plan.json` içeriğini kapsar.

Rapor; sürüm, iş kimliği, üretim zamanı, kaynak imzası, `ready|incomplete` durumu, ölçümler, kanıta bağlı bulgular, eylemler ve yerel örnek karelerden oluşur. Her bulgu `code`, `timestamp`, `sceneId`, `severity`, `message` ve sayısal `metric` taşır. Ölçülemeyen değerler `null` kalır.

## Yerel ölçümler

- FFprobe ile final kapsayıcı, görüntü akışı ve ses akışı süreleri ölçülür. Mutlak A/V farkı 0,25 saniyeyi aşarsa bulgu ve yeniden hizalama eylemi oluşur.
- İlk en fazla 30 saniyedeki konuşma süresi, TTS sürelerinin kurgu sahnesi zaman çizelgesine yerleştirilmesiyle hesaplanır. Bu bir dinleme veya transkripsiyon iddiası değildir.
- 10 saniye ve üzerindeki kesintisiz görsel sahneler ile `media.json` içinde aynı kaynak kimliğini kullanan sonraki sahneler işaretlenir.
- Senaryo sahnelerinin geçerli TTS ve kurgu planı kapsaması ölçülür. Eşleşmeyen TTS, geçersiz süre, eksik sahne zamanlaması ve eksik final çıktı ayrı bulgulardır.
- Segment sonundaki açıklanamayan sessiz aralıklar ölçülür. Bölümlü senaryonun son segmentindeki kasıtlı 7 saniyelik bitiş kartı kuyruğu bu hesaptan çıkarılır.
- İncelemeye yardım eden en fazla dört JPEG örneği yalnız bulgu zamanlarından çıkarılır. Raporda mutlak yol yerine `postflight-frames/<güvenli-ad>.jpg` bulunur.

Aktif veya sıradaki işler reddedilir. Analiz, `beginJobEdit` kilidini kullandığı için editör ve yeniden render işlemleriyle aynı dışlama mekanizmasına katılır. İş kimliği `jobDir` tarafından doğrulanır; dış TTS/medya yolları okunmaz ve rapora aktarılmaz. Sağlayıcı çağrısı, kullanıcı ayarı veya API anahtarı okuması yoktur. Bozuk önbellek içeriği bilinen rapor alanlarına indirgenir; mutlak örnek kare yolları reddedilir.

## TDD ve doğrulama

Kırmızı/yeşil döngüler gözlendi:

1. İlk test çalıştırması eksik `src/postflight.js` nedeniyle başarısız oldu.
2. Gerçek A/V fixture, aktif/kilitli iş, bozuk/eksik kaynak ve eski rapor senaryoları eklendikten sonra 4/4 test geçti.
3. Kısmen geçerli fakat senaryoyu kapsamayan kurgu önbelleği testi önce `missing-edit-coverage` bulunmadığı için 3/4 ile başarısız oldu; uygulama sonrası 4/4 geçti.
4. Ölçülemeyen sürenin yanlışlıkla sıfıra dönüşmesi testi önce `0 !== null` ile başarısız oldu; sayısal ayrıştırma düzeltildikten sonra geçti.
5. Gerçek yalnız-görüntü MP4 fixture'ı ses süresinin `null`, raporun `incomplete` ve bulgunun `missing-av-stream` olduğunu doğruladı.

Son doğrulama:

- `node --test --test-concurrency=1 test/postflight.test.mjs`: 5 test, 5 başarılı.
- İzole `NOVA_HOME`, `TEMP` ve `TMP` ile `npm run test:quality`: 65 test, 65 başarılı.

Testler geçici bir `NOVA_HOME` altında çalıştı. Ağ çağrıları engellendi; gerçek kullanıcı ayarları, işler, kaynaklar ve çıktılar değiştirilmedi.

## Sınırlar

Konuşma kapsamı kayıtlı TTS sürelerinden çıkarılır; sesin anlaşılabilirliğini veya metinle semantik uyumunu doğrulamaz. Görsel tekrar kontrolü kayıtlı kaynak kimliğini karşılaştırır; pikselleri benzer fakat farklı dosyaları aynı saymaz. Rapor izlenme, retention veya öznel kalite puanı üretmez.
