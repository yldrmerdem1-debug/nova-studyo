# Nova Stüdyo 1.1.0 — doğrulama

## Uygulanan kapsam

Yedi içerik türü için kurgu/ses profili, açılış ve kapanış yönlendirmesi, kaynak ve başlık kanıtı kontrolleri, doğrulanan JSON çıktıları, model/önbellek bazında tahmini kullanım, sahne düzenleme, ses önizleme, seçici yeniden üretim, devam etme, elle kapak hazırlama ve manuel yayın metrikleri uygulandı.

Önceki videolar ve kaynak dosyaları korunur. İlk kaynak yedeği `C:/Users/erdem/Videos/Nova Studyo/development-backups/20260907-before-quality` konumundadır. Kullanıcının API anahtarları test evlerine kopyalanmadı.

## Otomatik testler

- `npm run test:quality`: **65/65 test geçti**, sıfır atlanan veya başarısız test. Kanıt: `final-quality-tests.log`.
- Son fiyat yenileme/önbellek düzeltmesinden sonra bütçe, devam etme ve sağlayıcı snapshot testleri: **22/22 geçti**. Bu sayı yukarıdaki grupla örtüşür; toplam 87 ayrı test iddiası değildir. Kanıt: `final-followup-tests.log`.
- Eski `npm test` içindeki **61 dosyanın tamamı** ilk koşu ve düzeltmelerden sonraki hedefli tekrarlarla geçti. Tek bir kesintisiz `npm test` başarılı oldu iddiası değildir. Dosya bazında kanıt: `editorial-checks-ledger.json`.
- Gerçek FFmpeg ile kapaklar, sahne filtreleri, geçişler, altyazı hizası, müzik seviyesi, orijinal SFX, son AAC ses seviyesi ve A/V süreleri doğrulandı.
- Bağımsız incelemede bulunan bütçe kurtarma, yerel kolaj görseli kaybı ve yanlış sağlayıcı snapshot sorunları düzeltildi. Ayrıntı: `final-independent-review.md`.

## Arayüz denemesi

Geçici `quality-review/ui-home` verisiyle yerel sunucu açıldı; gerçek kullanıcı işlerine bağlanılmadı. Tarayıcıda sahne metni kaydedildi, yalnızca değişen sahnenin sesi geçersizleşti; kapak yazısı değiştirilip üç kapak üretildi; CTR/ilk 30 saniye tutma ve YouTube bağlantısı kaydedilip tekrar açıldı. İş bütçesi güncellendi. Sıfır müzik, özel CRF 26 ve Dinamik kurgu ayarları kaydedilip ekranda doğrulandı. Kurgu/kapak ekranlarının görünümü incelendi; kontrol edilen tarayıcı hata kaydı boştu. Deneme sunucusu ve sekmesi kapatıldı.

## Gerçek kaynaklarla örnek

`quality-review/showcase/brain-interface-documentary/output.mp4`: eski işin iki ayrı orijinal anlatım dosyası ve kendi görsel kayıtları üzerinden yeni miksaj/kurgu. Süre **50,700 saniye**, 1280×720, 1521 kare. Video ve ses akış süreleri eşit. Entegre ses **−14,09 LUFS**, true peak **−1,46 dBTP**, LRA **4,7 LU**. Bunlar seçilen miksaj hedefinin ölçümleridir; YouTube'un zorunlu yayın standardı iddiası değildir.

Örnek 720p inceleme çıktısıdır. Tam boyut sinematik deneme ağır çalıştığı için önizleme süresi sınırlandı; uygulamanın normal çözünürlükleri değiştirilmedi. Tek fotoğrafın uzun kaldığı bölümlerde daha iyi kaynak/çekim çeşitliliği için insan kurgu değerlendirmesi hâlâ değerlidir. Görseller, tarihî kişilerin gerçek görüntüsü gibi tanımlanmadı. Müzik mevcut yerel dosyadan geldi; lisansı bu çalışma sırasında bağımsız doğrulanmadı. Ayrıntılar örneğin README ve review.json dosyalarında.

## Paket

Sürüm 1.1.0. Son paket kanıtı `build-1.1.0-final.log`, paket–kaynak karşılaştırması `package-verification.json` dosyasındadır. Doğrulama bütün `src`, `public`, `electron` dosyalarını ve server.js dosyasını karşılaştırır; derleyicinin çıkardığı geliştirme alanları dışında paket meta verisini kontrol eder. `data/` paket içinde olmamalıdır.

Son NSIS build başarılı. **54 kaynak dosyası bire bir eşleşti**, sürüm 1.1.0; paket içinde `data/` kaydı yok. Paketli Electron/Node çalıştırılarak ayrı boş evde sunucu açıldı: FFmpeg hazır, yeni editör betiği HTTP 200, müzik 0 / CRF 26 / custom kalite / dynamic yoğunluk ayarları çalıştı. Kanıt: `packaged-smoke.json`. Deneme süreci kapatıldı. Kurulum çalışma klasörüne kopyalandı; SHA-256 değerleri eşit (`release-artifact.json`). 7-Zip NSIS içerik testi `Everything is Ok` ve çıkış kodu 0 verdi.

## Sınırlar

Ücretli üretim sağlayıcılarına canlı istek gönderilmedi. Model erişimi, gerçek sağlayıcı çıktı kalitesi ve tüm seslerin öznel dinleme kalitesi bu doğrulamada garanti edilmedi. Başlık/kapak doğruluğu ve izlenme artışı otomatik ölçümlerden çıkarılamaz. Otomatik YouTube yükleme ve canlı analitik bağlantısı kapsamda yoktur.
