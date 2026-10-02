# Nova Stüdyo 1.3.2 — üretim seçenekleri

2026-09-08. Kullanıcı isteği: beş üretim seçeneğinin çalışmasını doğrulamak ve bir dakikalık seçeneği eklemek.

## Davranış

- `test` süre kimliği geriye uyum için korundu; görünür adı **1 dakika**. Bu, seslendirmeye göre değişebilen hedef süredir. 3/8/10/12/20/30 dakika seçenekleri korunur.
- Sadece görsel: arşiv fotoğrafı; eski bütçe değerleri AI üretimini açamaz. İndirme aşaması yanlışlıkla seçilmiş kaynak videoyu da eler.
- Normal: arşiv video/fotoğraf; AI yalnızca arşiv boşluklarını toplam bütçe içinde tamamlar.
- AI görselli: senaryoya planlanan AI sahneleri ve arşiv boşlukları aynı toplam bütçeyi paylaşır. Bölüm başı yuvarlama bütçeyi şişirmez.
- Kolaj: önceki Tam AI seçimi fotogerçekçi stili taşıyamaz. Önceki kurgu dili Kolaj'dan çıkınca geri gelir.
- Tam AI ve Kolaj: kare/hibrit/hareketli kontrolleri ikisinde de görünür. Hibrit yaklaşık %40 sahneyi canlandırır; fiyat hesabı aynı sayıyı kullanır.
- Görsel üretimi için video sağlayıcısı gereksiz yere zorunlu değildir. Eksik sağlayıcı gerçek üretimi sessizce yer tutucuya çeviremez. Dry-run stok/AI hattında ücretli görsel çağrısı yapmaz.
- Yerel videolar FFmpeg'in yalnızca HTTP için geçerli `user_agent` seçeneği yüzünden eleniyordu: seçenek artık yalnızca HTTP(S) girdilerine uygulanır.

## Doğrulama

- `npm run test:quality`: **151/151** geçti. İzole geçici NOVA_HOME; gerçek anahtar, proje veya müzik kullanılmadı.
- 25 mod geçişi, API seçenekleri, eski süre kimlikleri, eksik sağlayıcı, dry-run, hibrit maliyet/animasyon ve video başarısızlığında kareyi koruma testleri.
- Beş modun her birinde yerel özgün test desenleriyle gerçek indirme/dosya hazırlama ve FFmpeg montajı; sonuçlarda oynatılabilir video ve ses akışı doğrulandı.
- Sadece görsel: 3 fotoğraf, 0 AI isteği. Normal: 3 kaynak video, 0 AI isteği. AI görselli: 1 üretilmiş fotoğraf + 2 video. Kolaj/Tam AI: üçer kare, birer animasyon.
- AI sağlayıcı sınırları yerel fixture döndüren taklit sağlayıcılarla test edildi. Canlı Kie/fal/ElevenLabs başarısı veya kotası doğrulanmış değildir. Önceki ElevenLabs ödeme hatası için ücretli yeniden deneme yapılmadı.
- Bu testler profesyonel görüntü kalitesi veya 12–20 dakikalık tam bir üretimin kalite onayı değildir. Önceki pilotun yayın öncesi insan incelemesi ve kaynak/müzik doğrulaması gereksinimleri devam eder.

Kayıt: `C:/Users/erdem/Videos/Nova Studyo/quality-review/1.3.2-quality.log`.
