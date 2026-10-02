# Hareketi anlatıyla planlayan AI Yönetmen

Onaylı istek: Başarılı elle kurgulanmış videolardaki yöntemleri standart üretime taşı; fotoğraf baskınlığını azalt, ilgili hareketli sahneleri artır. Uzun video, Shorts, belge ve yalnız görsel modları korunur.

## Bulgu
1.5.3 stok seçiminde videoya yerel öncelik veriyor fakat yönetmen sekizli gruplarda toplam süre/hareket hedefini görmüyor. Doğrulanmış video bile AI fotoğrafıyla değiştirilebiliyor. AI klip isteği her sahnede altı saniye; hareket raporu sekiz dakikanın altındaki videolarda uyarı vermiyor.

## Tasarım
- Süreye göre planlanan hareket hedefi: AI Yönetmen uygun sahnelerde %65; belge/arşiv fotoğrafı ve kullanıcı kaynakları korunur. Bu bir kalite hedefidir, ilgisiz görüntüyle doldurulacak kota değildir.
- Uygun, doğrulanmış stok hareketi korunur. Eksik hareket için yönetmen fiziksel eylem ve sabit kalacak ayrıntıları tarif eder; durağan diziyi önlemek için dağıtılmış tercih noktaları alır. Yapay zoom gerçek kaynak hareketi sayılmaz.
- Tüm plan tek kez değerlendirilir; yetersiz hareket planı üretimden önce bir kez yeniden düzenlenir. Bütçe ve ücretli yeniden deneme defteri korunur; başarısız hareket sessizce fotoğraf olarak kabul edilmez.
- Klip isteği tahmini sahne süresinden türetilir. Son rapor gerçek kurgu sürelerinden hareket kapsamını, AI fotoğraf süresini ve en uzun durağan diziyi ölçer. Kısa videolar da kapsanır; hedef karşılanmadığında açık inceleme uyarısı verilir.
- Mevcut tür, ses miksajı, doğal geçiş, altyazı, odak kırpması ve kaynak devamlılığı kuralları korunur.

## Uygulama ve doğrulama
1. Kurulu sürümü SHA256 kontrolüyle ayrı source/nova-studio dizinine kurtar; testleri yedeklerden geri getir.
2. Süreye dayalı hareket planlayıcısı, ilgili video koruması, eksik hareketi yeniden planlama ve kısa video kalite regresyonlarını önce başarısız çalıştır.
3. Gerçek seçim/yönetmen/üretim/rapor akışına bağla; politika ve kullanıcı açıklamasını güncelle.
4. İzole testleri çalıştır; gerçek sağlayıcı ve kısa karşılaştırma çıktısıyla doğrula. Mevcut videoları değiştirme.
5. Yeni sürümü paketle, kurulum dosyalarını ve kullanıcı verilerinin korunduğunu doğrula.
