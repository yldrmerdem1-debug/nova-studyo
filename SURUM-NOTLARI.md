# Nova Studyo — Sürüm Notları

## 1.15.2 (hazırlanıyor)

- **Shorts görüntü-cümle uyumu**: teaser planlanırken Claude her altyazı satırında uzun videonun ekranda ne gösterdiğini de görür (kimin portresi, hangi sayaç, hangi manşet); bir kişiyi anan cümleye o kişinin karesi gelir.
- **Senaryo yazarı**: Claude yapılandırılmış çıktısı bölüm şemasını boyutundan dolayı reddediyordu (58 isteğe bağlı alan > 24 sınırı; sığdırılınca da "dil bilgisi çok büyük"). Reddedilen şema artık hatırlanır, sonraki bölümler boşuna istek atmaz; JSON onarımının sebebi kayda yazılır. Kalıcı çözüm (şemayı temel + cihaz alanları diye ikiye bölmek) ayrı iş.

## 1.15.1 (2 Ekim 2026)

- **Shorts kırpılmıyor**: uzun videonun yatay karesi dikeyde tam genişlikte gösterilir (önce kenarlardan kırpılıyor, yazılar ve sahneler kesiliyordu); kamera hareketi en fazla %4.
- **Shorts açılış patlaması**: ilk videoların imza kancası gibi, 3 kelime (ör. CRASH / GREED / PANIC) ilk 1,5 sn'de sırayla ortaya sarı etiketle çakılır, sonra kanca başlığı üstte kalır.
- Altyazıda yazıyla okunan sayılar da (fourteen billion, ten percent) sarı vurgulanır; kelime zamanları kaydedilir (yeniden render için).

## 1.15.0 (2 Ekim 2026)

Sinematik Belgesel motoru, 1929 / 1453 / Cooper videolarının kare kare incelenmesiyle bulunan sorunlara göre düzeltildi.

### Yeni: Shorts
- Kütüphanede tamamlanan her belgeselin yanında **📱 Shorts** butonu: uzun videoya **yönlendiren yeni bir fragman (teaser)** üretir — Claude yeni 45-55 sn'lik metin yazar (kanca, 3-5 çarpıcı an, cevabı vermeden bırakma, "tüm hikâye kanalda"), aynı anlatıcı sesiyle (ElevenLabs) seslendirilir, her cümlenin altına uzun videodan uygun an gelir; dikey 1080x1920, videonun müziği, sarı etiket kanca, kelime kelime altyazı, sonda kapakla "full documentary on the channel" kartı. Başlık + açıklama da yazılır; her basışta yeni teaser. ElevenLabs yoksa yedek: en güçlü 40-58 sn'lik kesit.
- Kütüphane düzeltmesi: "YouTube paketi", 📁 ve "Yeniden render" butonları bağlanmıyordu (seçici hatası).

### Klasik montaj açılışı geri geldi
- İlk videolardaki imza açılış (hızlı montaj + patlayan kanca kelimeleri + büyük başlık kartı, sarı etiketli sayaçlar) açılış türlerine **`montage`** olarak eklendi; diğer 6 türle (manşet, saat-tarih, soğuk açılış, delil, harita, alıntı) eşit ağırlıkta dönüşümlü seçilir; her video farklı açılır, art arda iki videoda aynı açılış olmaz.

### Dönem doğruluğu
- **1500 öncesi yıllar artık tanınıyor** (MS 100+ ve MÖ yıllar). Önceden "1453" yıl sayılmadığı için dönem denetimi ve "modern şey seçme" kuralları o videoda hiç çalışmamıştı (NY silueti, cruise gemisi, futbol taraftarı geçmişti).
- **1850 öncesi konular için ek kurallar** (seçici + dönem denetimi): insan görünen fotoğraf, sonraki dönem fotoğrafları, çelik/cruise/replika gemiler, elektrik, plastik, Paskalya yumurtası, kızılhaç, başka yüzyıl üniforması, yanlış coğrafya (Akdeniz hikâyesinde tropik orman) reddedilir.
- **Arşiv filminin başlık kartı atlanır**: klibin sahne penceresinde 1,5 sn'den uzun duran kart ("SEEING LONDON · Part Three") varsa sahne kartın sonrasından açılır.
- **Ödünç görselde yanlış altyazı yok**: başka sahnenin resmini ödünç alan sahne kendi resim altyazısını/kaynağını taşımaz ("Mehmed şehre giriyor" yazısı bir İsa mozaiğinin altında kalmıştı).

### Tasarım
- **İnce çizgiler kaldırıldı**: bölüm kartı çubukları, kelime altı çizgileri, sol dikey çubuklar, isim yazısı çizgileri, sayaç/istatistik çubukları.
- **Vurgu = basılı etiket**: anahtar kelime hafif yamuk, dolu renkli bir etiketin üstüne çakılır (görünüme göre sarı / kırmızı / altın). Terminal görünümü de etiket kullanır.
- **Grafik titremesi giderildi**: "kenar karartma" efekti artık kalp atışı gibi sürekli atmıyor; sabit, yalnızca vurguda bir kez sıkılaşıyor.
- **"4HOURS" hatası**: sayı ile birim arasındaki boşluk artık korunuyor ("4 HOURS").

### Ses
- **Mekanik sayaç tıkırtısı yasaklandı** (kütüphane yasak listesi `SFX_BANNED`). Sayaç ve grafiklerin altında tıkırtı yok; yalnızca iniş vuruşu. Saat motifli açılışta sarkaç sesi en fazla 2,5 sn.

### Dayanıklılık
- **OpenAI kredisi bitince video durmuyor**: arşiv ağırlıklı videolarda AI görseli isteyen sahneler gerçek/ödünç kareyle sürer.
- **Bölüm yazarı hata ayrıntısını kaydeder**: yapılandırılmış çıktı reddedilirse sebebi log'a yazılır.
- **Sahne düzeltme dosyası** (`docu-scene-overrides.json`): `null` değer bir alanı siler (yanlış klibi fotoğrafa çevirmek için).

### Bulut render hazırlığı (henüz arayüzde değil)
- `docu-engine/bin/render-props.mjs`: hazırlanmış videonun props + public klasöründen yalnızca render + mastering.
- `docu-engine/scripts/cloud-setup.sh`: Ubuntu render makinesi kurulumu.
- Not: kullanıcının yükleme hızı ~3,5 Mbit/sn; varlıklar hazırlık sırasında yüklenmeden bulut, yerel render'dan hızlı değil.
