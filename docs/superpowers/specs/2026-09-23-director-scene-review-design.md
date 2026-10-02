# AI Yönetmen sahne seçimi ve final kare denetimi

Kullanıcı, AI Yönetmen'in stok/AI seçimlerini GPS belgeselinde yapılan sahne bazlı kontrol düzeyine yaklaştırmak istiyor. Kurulu 1.6.1 sürümünde otomatik arama, kaynak görsel denetimi ve teknik final MP4 kontrolü var; fakat AI Yönetmen'de üretim öncesi seçim ekranı kapalı ve final kurgunun her kesmesi görünür biçimde incelenmiyor.

## Karar

AI Yönetmen'in otomatik akışı varsayılan kalır. Üretim kartında isteğe bağlı **Önce bana göster** açılır. Bu seçim mevcut aday ekranını kullanır: kaynak, video önizlemesi, anlatım ve görsel puanı görünür. Kullanıcının öneriden farklı seçtiği aday kimliği kaydedilir. İndirilen gerçek aday farklıysa veya bu aday editoryal denetimden geçmezse onay sessizce başka kaynağa aktarılmaz; iş belirli sahneyi göstererek durur. Onaylanmış uygun kaynak AI ile değiştirilmez. Otomatik önerileri değiştirmeden onaylamak, normal otomatik iyileştirmeyi engellemez.

AI Yönetmen renderı, kodlanmış MP4'ün teknik çözümleme kontrolünden sonra her kesmenin orta karesini alır. Kesme zamanları `edit-plan.json` içindeki tamsayı kare sürelerinden hesaplanır. Her örnek için kesme kimliği, zaman, anlatım cümlesi, kaynak kimliği ve küçük JPEG korunur. Görsel model kısa gruplarda gerçek son kareyi anlatımla, dönem/yer/eylemle ve görünen metnin bariz kusurlarıyla karşılaştırır. Ağ/model hatası "temiz" sonucuna dönüşmez; sahne doğrulanmamış olarak işaretlenir. Bu denetim bütün kareleri izlediği iddiasında bulunmaz; her kesmenin son kompozisyonunu örnekler, kaynak videonun hareket tutarlılığı mevcut beş kareli medya denetiminde kalır.

Sonuç `director-shot-review.json` ve güvenli kare dosyaları olarak işin yayınlanan revizyonuna taşınır. Kalite ekraninde tüm kesmeler kronolojik listelenir, sorunlular öne çıkar; bir kareye tıklamak videoyu ilgili zamana götürür. Uyuşmayan veya doğrulanamayan kesmeler `needsReview` uyarısı yaratır. Video ve önceki revizyon korunur; kullanıcı editörde medyayı değiştirdikten sonra yeniden render ederek raporu yeniler. Otomatik model kararı yayın başarısı ya da kusursuzluk garantisi sayılmaz.

## Kapsam ve kabul

- AI Yönetmen'de manuel kaynak kontrolü seçilebilir, sunucu `mediaMode` değerini korur; diğer modların davranışı değişmez.
- Değiştirilmiş kullanıcı seçimi gerçek indirilen adayla eşleşmeli ve editoryal denetimden geçmeli; eşleşmezse açık sahne hatası verilir.
- Her final kesmenin JPEG'i, doğru zaman/anlatım eşlemesi ve doğrulanmış/uyarı durumu vardır. Hiçbir model hatası sahneyi otomatik onaylamaz.
- Kalite ekranında kare, zaman, anlatım ve uyarı görülebilir; video o ana alınabilir.
- Eski işler ve üretilmiş dosyalar korunur. Yeni kontrol yalnızca yeni AI Yönetmen renderlarında çalışır.

İki alternatif değerlendirildi: yalnızca manuel aday ekranı, finaldeki kompozisyon hatalarını kaçırır; sınırsız otomatik yeniden üretim, doğrulama olmadan ücretli döngü ve yanlış değişim riski taşır. Yukarıdaki kontrollü seçim ve raporlu final denetimi seçildi.
