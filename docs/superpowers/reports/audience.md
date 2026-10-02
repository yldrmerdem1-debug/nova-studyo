# YouTube izleyici verisi içe aktarımı

Doğrulama tarihi: 7 Eylül 2026

## Resmî dayanak

- [YouTube Studio Gelişmiş Mod](https://support.google.com/youtube/answer/9717005?hl=tr), mevcut görünümün kanal veya video düzeyinde dışa aktarılabildiğini ve Studio indirmelerinin 500 satırla sınırlı olduğunu açıklıyor.
- [YouTube Analytics boyutları](https://developers.google.com/youtube/analytics/dimensions), `elapsedVideoTimeRatio` değerinin videoda geçen bölümün toplam süreye oranı olduğunu; API'nin video başına eşit aralıklı 100 nokta döndürdüğünü açıklıyor.
- [YouTube Analytics metrikleri](https://developers.google.com/youtube/analytics/metrics), `audienceWatchRatio` değerinin bir bölümün izlenme sayısını video görüntülemelerine oranladığını ve yeniden oynatma yüzünden 1'in üzerine çıkabileceğini; `relativeRetentionPerformance` değerinin 0–1 aralığında benzer süreli videolara göre göreli konumu gösterdiğini açıklıyor.
- [YouTube kanal raporları](https://developers.google.com/youtube/analytics/channel_reports), retention sorgusunun tek video kimliği gerektirdiğini ve çoklu video filtresini desteklemediğini açıklıyor.
- [Analytics ve Reporting API karşılaştırması](https://developers.google.com/youtube/reporting), sorgu API'sindeki `video`, `elapsedVideoTimeRatio` ve `audienceWatchRatio` alanlarının Reporting API'de sırasıyla `video_id`, `elapsed_video_time_percentage` ve `audience_retention_percentage` adlarını kullandığını açıklıyor.

## Uygulanan sözleşme

`src/audience.js` iki ESM işlevi dışa aktarır:

- `importAudience(id, { csv, filename, videoId?, durationSec?, period? })`
- `audienceReport(id)`

İçe aktarım UTF-8 metin veya bayt kabul eder. Virgül ve noktalı virgül ayırıcıları, BOM, CRLF/LF, kaçırılmış çift tırnaklar, tırnak içinde ayırıcı ve satır sonu desteklenir. Yaygın İngilizce/Türkçe Studio özet başlıkları ile Analytics/Reporting retention alan adları tanınır. Dosya 5 MiB, veri 20.000 satır ve 100 sütunla sınırlıdır. Bozuk tırnak, sütun sayısı, sayı, yüzde, süre veya zaman ekseni içe aktarımı durdurur.

Birden çok video kimliği görülürse içe aktarım `videoId` olmadan reddedilir ve seçilebilir kimlikleri hata üzerinde döndürür. Seçim yapıldığında yalnız eşleşen satırlar işlenir. CSV video kimliği taşımıyorsa kayıt bunu bir caveat olarak bildirir; kimlik uydurulmaz.

Ham CSV yalnız ilgili işin `audience-imports/` klasörüne yazılır. Geçmiş ve ayrıştırılmış ölçümler aynı işteki `audience.json` dosyasında tutulur. Elle girilmiş sonuçların bulunduğu `publication.json` okunur ve raporda `source: manual` olarak ayrı gösterilir; dosya değiştirilmez.

30. saniye tutulması yalnız geçerli video süresi ve elapsed ekseninde tam 30. saniyeye karşılık gelen gerçek ölçüm noktası olduğunda üretilir. Komşu noktalardan tahmin yapılmaz. Süre veya tam eksen noktası yoksa alan `unavailable` kalır. `audienceWatchRatio > 1` geçerli tutulur ve yeniden oynatma anlamı caveat olarak verilir.

Öneriler yalnız içe aktarılan ölçümlerden ve tarih/dönem etiketli değişimlerden üretilir. Farklı dönem veya kitlelerin nedensel A/B sonucu olmadığı her raporda belirtilir. İzlenme tahmini ya da kazanan varyant üretilmez.

Aktif üretim durumları ve ortak edit kilidi içe aktarımı 409 ile reddeder. Modül ayar veya sağlayıcı anahtarı okumaz ve ağ isteği yapmaz.

## Doğrulama

`node --test test/audience.test.mjs`

11 test geçti. Testler izole bir `NOVA_HOME` altında, ağ kullanmadan İngilizce/Türkçe özet ve retention örneklerini; BOM, ayırıcı/tırnak davranışını; çoklu video seçimini; 30. saniye koşullarını; %100 üzeri replay oranını; sayı/dosya/satır doğrulamasını; kilitleri; manuel/ithal geçmiş ayrımını ve tarihli öneri sınırlarını kapsıyor.

Kullanıcı kanalına ait CSV sağlanmadığı için gerçek kanal ölçümü yapılmadı; uygulama bu durumda alanları kullanılabilir gibi göstermez.
