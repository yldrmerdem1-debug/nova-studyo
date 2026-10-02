# Midway tarih paketi ve kaynak türüne duyarlı kurgu

Kullanıcı, tarih kanalı için İngilizce bir uzun video ve ona bağlı bir Shorts istiyor. Konu Midway Muharebesi (3–7 Haziran 1942); önceki Truva, Odysseus ve Cannae videoları tekrarlanmayacak. Uzun video hedefi yaklaşık 12 dakika ve en az 11 dakika; Shorts hedefi yaklaşık 60 saniye, 9:16. İki yapım aynı tarihsel soruya bağlanır: sabah Amerikan saldırıları başarısız görünürken 10:22–10:26 arasında üç Japon uçak gemisi nasıl vuruldu? Shorts olayın sonucunu ve çözülmesi gereken nedeni verir, uzun videoya yönlendirir.

## Tarihsel ve görsel yaklaşım

- Olgular ABD Naval History and Heritage Command savaş anlatısı, eylem raporları ve kronolojisiyle karşılaştırılır. Kod kırma tek mucize diye anlatılmaz; “AF su sıkıntısı” mesajı teyit öğesidir. Dört geminin dördünün aynı dört dakikada vurulduğu iddia edilmez: Akagi, Kaga, Soryu sabah; Hiryu öğleden sonra vuruldu. Yorktown'un nihai kaybı 7 Haziran olarak belirtilir.
- 1942 ABD Donanması filmi ve resmî fotoğraflar gerçek kayıt olarak, yalnızca gerçekten gösterdikleri olaylarda kullanılır. Japon komuta kararları, denizdeki görünmeyen konumlar ve taktik çizimler açıkça şema/canlandırmadır. Modern uçak veya gemi dönemin gerçek kaydı gibi sunulmaz. Kaynak ve lisans listesi teslim paketine girer.
- Kancada sonuç ilk saniyelerde gösterilir; sonra kronolojik nedene dönülür. Her bölüm yeni bir bilgi veya karar getirir. Tam sayı/birim ve saatler anlatımla birebir tutar. Ekrandaki yazı seyrek, kısa ve kaynaklıdır; uzun paragraf ekranı kaplamaz. Dönem görüntüsü ve canlandırma ardışık geldiğinde ayrı görsel türler oldukları anlaşılır.
- Seçili tür belgeseldir. Hareket için ilgili gerçek çekim önceliklidir; arşiv fotoğrafında gereksiz sürekli yakınlaştırma yapılmaz. Geçişler sahnenin sınırına ve kaynak kökenine göre seçilir. Konuşma müziğin üstünde anlaşılır; dramatik vuruşlar yalnızca anlatıdaki gerçek dönüm noktasında yer alır.

## Uygulamaya kalıcı davranış

AI Yönetmen, doğrulanmış arşiv/kanıt çekiminden AI canlandırmasına veya tersine geçerken aynı bölüm içindeki görüntüleri üst üste bindiren dissolve/slide kullanmaz. Sınır net bir kesme olur; bölüm sınırında mevcut kısa bölüm geçişi korunabilir. Böylece AI görüntüsü arşiv filminin devamı gibi algılanmaz. Değişiklik yalnızca AI Yönetmen moduna uygulanır; diğer modların geçiş kataloğu korunur. Kural `director-policy.js` içinde sürümlenir ve gerçek `planTransitions` regresyonuyla sınanır.

## Teslim ve kabul

- Uzun ve dikey Shorts MP4, İngilizce SRT, başlık/açıklama, kapak, kaynak/lisans notu ve inceleme raporu teslim edilir.
- Süre, çözünürlük, ses tepe seviyesi, altyazı okunabilirliği, en az üç zamandan kaynak/kurgu örneklemesi ve görsel anlatım uyumu ölçülür. Hatalı kesme bulunursa medya veya kurgu düzeltilip yeniden render edilir.
- Uygulama kodu ve regresyon testi, yapımda doğrulanan genel kaynak-köken geçiş dersini kalıcı hâle getirir. Paketleme/kurulum yapılırsa sürüm ve kurulu dosya bütünlüğü doğrulanır. Önceki işler, ayarlar ve medya silinmez.
