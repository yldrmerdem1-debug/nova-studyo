# Nova Studyo — Sürüm Notları

## 1.16.2 (4 Ekim 2026)

İlk sıralama videosu ("10 kayboluş") kare kare incelendi; kalite denetiminin bulduklarıyla birlikte düzeltildi.

- **Bölünmüş ekran asla boş değil**: kurgu yönetmeni bir sahneyi bölünmüş ekrana çevirirken sahnenin kendi resmini atıyor, resimsiz tarafı simsiyah bırakıyordu ("Paris: he was not on it"; "Darling Downs / Swan River" ikisi de boş). Artık her taraf bir resim göstermeli: önceki sahneden (fromScene) ya da — tek bir taraf için — sahnenin kendi resmi (boş kompartıman gibi; getirilir/üretilir). İki tarafı da resimsiz öneri reddedilir. Motor da yedekli: resmi çözülemeyen taraf öbür tarafın sisli hayaletini, ikisi de boşsa önceki resmi gösterir.
- **Sıra rozeti sol altta ve yalnızca resim sahnelerinde**: sol üstteki "#7 · MADDE" etiketi harita etiketlerinin, belge başlıklarının ve teletype kartlarının üstüne biniyordu. Artık sol altta; harita, belge, pano, kart ve infografik sahnelerinde çekilir.
- **Geç söylenen sayaç okunuyor**: sayı söylenene kadar tutulan önceki resmin üstüne inen sayaç, açık görünümlü filmde (gazete kâğıdı) kâğıdın koyu mürekkebini alıyordu — karanlık uçak kabininde "120,000" kayboldu. Artık o zemin koyu sayılır, rakam açık basılır.
- **Sıra kartında yer satırı sığar**: "LE BOURGET, FRANCE – NORTH ATL…" kenarda kesiliyordu; satır sütuna sığacak boyda dizilir.
- Bağımsız Shorts: merak boşluklu başlık kalıpları (kim / kimse / neden / sır / gerçek / sonra / gerçekler) ve "gerçekler" listesi formatı; karanlık AI karelerine otomatik aydınlatma (Noir altında kararıyordu); OpenAI'nin "bakiye bitti" yanıtı hız sınırından ayrılır (bekleyip denemek yerine durur ve söyler).

## 1.16.1 (4 Ekim 2026)

- **Shorts görünümleri**: her Shorts konusuna göre giyinir, hep sarı değil. 8 görünüm (Punch, Dosya, İmparatorluk, Defter, Noir, Temiz, Editoryal, Tabloid): yazı tipi (Impact, daktilo, klasik serif, dar DIN, italik serif, yuvarlak modern, kitap serifi, ağır siyah), vurgu rengi, slam'in inişi (basılı kutu, damga, oyma serif, parıltı), flaş rengi (beyaz/siyah/sıcak), resim derecelendirmesi, gren, vinyet ve kamera hızı. Uzun videonun Shorts'u filminin türüne göre giyinir (suç → Dosya, savaş → İmparatorluk, finans → Defter...).
- **Açılış türleri**: üç kelime, soru, şok sayı, alıntı (kimin söylediğiyle) ya da tek cümlelik inanılmaz tespit; büyük ve ortada, anahtar kelimesi görünüm renginde.
- **Bağımsız Shorts**: uzun videoya bağlı olmayan Shorts hattı (docu-short-standalone.js): web araştırması, Claude planı (her cümleye bir görsel), gerçek kişi/yer/belge uzun videonun arşiv hattıyla (dönem kuralları, görüntü modeliyle seçim), fotoğraf öncesi için dönemin tablo/gravürü, AI yalnızca gerçek kişi içermeyen sahneye; ses kütüphanesinden ruh hâline uygun müzik; açıklamaya görsel künyesi.
- **Düzeltme**: anlatımın hiç söylemediği bir satırı olan arayüz kartı render'ı çökertiyordu ("inputRange ... [Infinity,Infinity]"); söylenmeyen satır artık sesten sonra yanar.
- **Düzeltme**: kredisi bittiği için düşülen sanat yönetmeni yedek planı önbelleğe yazılmıyor; kredi yüklenince model yeniden planlar.
- Sıralama araştırması 64k bütçe (ilk iş 32k'yı düşünmeye harcayıp metin yazamamıştı).

## 1.16.0 (4 Ekim 2026)

### Yeni kategori: Sıralama (geri sayım)
Sinematik Belgesel'in stil satırında **Sıralama**: aynı belgesel motoru (aynı kurgu, ses, dönem denetimi, ara planlar, kapaklar), senaryo bir geri sayım. Görsel ve ses dilini (Gizem, Epik, Finans...) Claude konuya göre seçer.
- **Yapı**: 1. bölüm giriş (30-45 sn: listenin ortasından bir maddenin en ürpertici anıyla soğuk açılış, sıralamanın ölçütü tek cümle, 1 numaranın vaadi — asla açıklanmaz), sonra N'den 1'e maddeler (5 dk'ya kadar 5, 10 dk'ya kadar 7, üstü 10). Her madde bir mini hikâye: ilk cümle en çarpıcı olgusu, neden bu sırada (bir kez), son sahne bir sonrakine köprü; her 2-3 maddede 1 numaraya gönderme. Yoğunluk sırayla yükselir; 1 numara 1,5 kat uzun ve kendi dönüşüyle.
- **Araştırma**: tek hikâye değil, listeden %60 fazla aday; her biri için yer, kesin tarih, doğrulanmış olgular, izleyiciyi durduracak tek ayrıntı, kaynaklar ve önerilen sıra/ölçüt.
- **Sıra kartı**: her maddenin başında maddenin kendi resmi (net, yavaş yaklaşan), dev sıra rakamı vuruş sesiyle iner, sonra adı kelime kelime, yer · yıl, altta 10'dan 1'e geri sayım çubuğu (geçilenler soluk, mevcut altın etiket). 1 numara daha büyük, altın parıltılı ve daha uzun.
- **Sıra rozeti**: madde boyunca sol üstte küçük "#7 · MADDE ADI" etiketi.
- **Madde başına dönem**: her maddenin sahneleri kendi yılını taşır; arşiv araması, stok kuralı ve dönem denetimi maddeye göre (1912'deki madde 1990'ın kurallarıyla, 1990'daki 1912'nin kurallarıyla yargılanmaz). Görsel dil dönemsiz; dönemi her görsel tarifi kendisi söyler.
- **Paket**: başlıkların çoğunda sayı başta ("10 …"), 1 numara başlıkta asla açıklanmaz; kapak 1 numarayı adını vermeden satar (en şok edici karesi + dev "#1").
- YouTube bölümleri "#7 Madde adı" olarak yazılır.

## 1.15.5 (3 Ekim 2026)

Kurgu ince ayarı (Napolyon kare kare incelendi: Borodino doruğunda top resmi iki cümle boyunca ~9 sn ekrandaydı).

- **Doruk anlarında ara planlar**: filmin en yoğun resim satırlarında (silah, ateş, hücum, kar fırtınası... ya da yönetmenin "rapid" dediği anlar) aynı anın yeni, tam kadraj bir karesi anlatıcının söylediği bir içerik kelimesinde sert kesmeyle girer (yakın, sonra geniş). Kişi sahneleri (isim kartı, altyazı), bilinçli durgun planlar, kolaj panoları ve tam cümle kartları hariç; anahtar kelime kartında kelime yeni resmin üstünde kalır. Napolyon'da 10 satır. Eski "hızlı tempo" aynı resmi yeniden kırpıyordu, göz bunu yeni plan saymıyor.
- **Nefes**: her kesme son kelimeden 0,4 sn sonra geliyordu. Artık bölümün son cümlesi 1,4 sn, sayaç/istatistik 1 sn, slam ve sakin/yaslı satır 0,9 sn, ruh hali dönen ağır satır 0,8 sn oturur (Napolyon: 43 satır, toplam +21 sn).
- **Yankı yazısı yok**: anlatıcının okuduğu cümleyi aynen basan yazı kartı (yedi kelime ve üstü) anahtar kelimeye döner ("MORE THAN FORTY-SEVEN FRENCH GENERALS WERE KILLED OR WOUNDED." kutusu gibi). Kısa tarih/etiketler kalır.
- **Duran plan nefes alır**: "sabit" kamera bir planda %1,2 yakınlaşıyordu, kalite denetimi "donmuş görüntü" diyordu; artık %4 (sığdırılmış taramada %3).

## 1.15.4 (3 Ekim 2026)

- **Her fotoğraf sahnesine kendi görseli**: AI görsel tavanı artık yalnızca yazı/slam/başlık sahnelerinden keser (bunlar önceki kareyi tutar); fotoğraf sahnesi arşivde bulunamazsa kendi AI görselini alır. Napolyon'da arşiv araması hız sınırına takılınca (HTTP 429) 40 sahne başka sahnelerin resmini ödünç almıştı, 24'ü ilgisiz uzak bir kareydi ("Moskova'nın altın kubbeleri" altında Smolensk surları, Berezina'da bir mektup). Tavan üstü pay 8 → 30; filmin ilk ve son karesi her zaman kendi görseli.
- **Savaş müziği yalnızca savaşta**: ciddi hikâyede savaş boruları/koro/davul taşıyan parçalar ("Clash Defiant" gibi) yalnızca gerçek bir çarpışma anının altında; fırtına, ölen atlar, yanmış Moskova'da bekleyiş gibi bölümlere gergin ama ağırbaşlı parçalar (Standoff, Red Shift). Napolyon'da 4,5 dakika savaş müziği çalıyordu.
- **Sayaç her zeminde okunur**: sayı söylenene kadar önceki resim kalır, sayı geldiğinde resim belirgin kararır ve rakam ile alt yazısı gölgeli halo taşır (karlı orman üstünde soluk mavi "<100,000" görünmüyordu).
- **Yazı yüz kapatmaz, küçük yazılar okunur**: resim üstündeki tek anahtar kelime ("ROSTOPCHIN") artık ortada portrenin gözlerinin üstünde değil, altyazının yerinde (altta ya da derinlik ayrımında boş tarafta); büyük kelimenin üstündeki küçük bölüm etiketi ("BORODINO") ham vurgu rengi yerine kelimenin kendi rengi ve gölgesiyle; sayaç alt yazısı koyu kırmızı değil, okunur açık ton.
- **Shorts görsel modu kuralları**: dönem hikâyesinde günümüz fotoğrafı/drone/renkli çekim katalogdan çıkar; mecazlar ("plato", "uçurum") kelimesi kelimesine resmedilmez; adı geçen gerçek kişiye arşivdeki kendi portresi (gerekirse ikinci kez), gerçek kişinin AI benzeri asla üretilmez (anonim figür); yeni görseller dönemin arşiv dokusunda (1850-1955: siyah-beyaz fotoğraf).
- **Shorts'ta karanlık klip yok**: görüntü modeli klibin tek karesini görür; klip kullanılacağı aralıkta kararıyorsa sabit karesi kullanılır.
- **Shorts'ta rakam sayı bitince**: "$205" artık "two hundred and FIVE dollars" bitince, "12.8%" "percent" ile gelir.

## 1.15.3 (3 Ekim 2026)

- **Vurucu kapaklar**: YouTube kapakları kanalın kendi tarzında — Anton, kalın siyah kontur, beyaz + sarı (vurgu satırı), sayılar kırmızı; görsel daha parlak ve sıcak, konunun arkasında turuncu ışıltı, karartma yalnızca yazının olduğu tarafta; kırmızı halka yazının içine girmez. Kapak planlayıcısı iki satırlık vurucu yazıyı, dev rakamı ve videonun en "imkânsız" karesini tercih eder.
- **Shorts görsel modu**: her cümle videonun kendi arşivinden (tablo, arşiv fotoğrafı, AI karesi, klip) tam ekran dikey bir görselle; görseller görüntü modeliyle bir kez kataloglanır (gerçekte ne gösterdiği, yazı ağırlıklı mı, ne kadar çarpıcı, konu nerede), dikey kırpma konuya göre; hiçbir şey göstermiyorsa yeni dikey görsel üretilir (en fazla 3); sayılar görselin üstüne söylendiği anda büyük yazıyla; kanca etiketi yalnızca girişte. Arşiv yetmezse eski "uzun videonun anları" teaser'ına düşer.
- **Senaryo yazarı kredi yakmıyor**: yazı/başlık sahnesinde eksik `imagePrompt` komşu sahneden doldurulur — her bölüm için yapılan ek Claude onarım çağrısı kalktı (Napolyon'da 8/8 bölüm).
- **YouTube açıklaması temiz**: YouTube Ses Kitaplığı parçaları tek satır ("Music: YouTube Audio Library"); "kaynak doğrulanamadı" gibi iç notlar açıklamaya değil "Yayın öncesi kontrol" bölümüne; İngilizce videoda görsel künyesindeki "Changes" satırı İngilizce.
- **Kuşatma teması**: şemadaki ince kesik çizgili çubuk yerine mazgallı sur silüeti; arka plandaki kesik ok yerine kalın sefer oku; geçiş paneli boş parşömen değil (büyük konu kelimesi + kuleli surlar).
- **Ses tepe seviyesi**: AAC kodlaması sonrası ölçülür, -1 dBTP'yi aşarsa bir kez düzeltilir (1453: -0,2 → artık ~-2,5 dBTP, -14 LUFS).
- **Önce söyle, sonra göster (devamı)**: slam alt satırı, önce/sonra karşılaştırmasının ikinci tarafı, zaman çizelgesi olayları ve belge vurgusu kendi sözlerini bekler.
- **1850 öncesi hikâyede stok sitesi kuralı**: 1453'te dönem denetimi Pexels/Unsplash/Mixkit karelerinin yarısını reddetti (modern İstanbul, canlandırmacılar, kruvaziyer...). Artık insan, şehir, ordu, gemi, yapı için stok adayı aranmaz — kurum arşivi (tablo, gravür) ya da AI; stok yalnızca zamansız kareler için (deniz, gök, ateş, hava, gece, doğa).

## 1.15.2 (2 Ekim 2026)

### Önce söyle, sonra göster
Ekrandaki hiçbir bilgi anlatıcı söylemeden görünmez (1453'te "21" ve "4,773" sayaçları sayıdan 1,4-3 sn önce ekrandaydı):
- **Sayaçlar**: sayı söylenene kadar önceki sahnenin resmi kalır; sayaç sayının ilk kelimesinde patlar ve sayının son kelimesinde yerine oturur ("four thousand, seven hundred and seventy-three" → son hane "seventy-three" ile). Virgüllü sayılar artık tek sayı.
- **Büyük rakam (stat)** kendi kelimesinde saymaya başlar; **çubuk grafik** her çubuk kendi adı söylenince büyür; **grafik ekseni** yalnızca çizginin ulaştığı değerleri yazar.
- **İsim etiketi ve fotoğraf altyazısı** isim/söz söylendiğinde gelir; **konu altyazıları** ve **lower-third** yazı stili kelime kelime, söylendiği anda (önceden sıkıştırılmış, erken bitiyordu).
- **Alıntı, UI kartı, delil panosu** henüz söylenmemiş metni okunur hayalet olarak göstermez (noktalar); **açıklama şemasının** ilk adımı söyleniyorsa sözünü bekler; **manşet** okunurken dizilir; **harita** yer adı ve **pano** fotoğrafı söylendiğinde gelir.

### Müzikte ciddiyet
- Kütüphanedeki her parça yeniden dinlendi ve **tonu** etiketlendi: ağır / dramatik / kahramanca / hafif, ciddiyet puanı ve "oyun müziği gibi" işareti (`audio-library.mjs tone`).
- Nova hikâyenin **ciddiyetini** ölçer (savaş, ölüm, çöküş, suç, borsa krizi): ciddi bir hikâyede yalnızca ağır ve dramatik parçalar çalar; coşkulu macera, boss-savaşı, umutlu fragman müziği hiç gelmez (1453'te 3:30'daki "Taking Flight" gibi). Hüzün ve sakin anlara yaslı, sade parçalar; ana tema yas tutabilen bir melodi.

### Kurgu dili (geçiş, efekt, kamera)
- Yeni kural katmanı (`docu-engine/lib/edit-grammar.mjs`), render'dan hemen önce: ciddi hikâyede ışık sızması, glitch, piksel/dönme geçişleri, renk ayrışması, bokeh, VHS, flare yok. Whip, zoom, slide, flash, zoom-blur, sarsıntı, speed-ramp **vurgu**dur: yalnızca bir doruk anında veya bölüm dönüşünde, bölüm başına bir kez. Dolly-zoom filmde en fazla bir kez, korku anında. Hüzünlü/sakin sahne kesme ya da karartmayla açılır, kamerası durur veya yavaşça ilerler; el kamerası yalnızca aksiyonda.
- Sanat yönetmeni (Opus) bu kuralları baştan bilir.

### Shorts
- **Kanca**: açılış üç kısa ritmik söz ("One chain. One hill. And a sultan of twenty-one."); her sözün kelimesi anlatıcı söylediği anda, kendi görüntüsünün üstünde çakılır (rastgele sessiz kelimeler yok); açılışta altyazı yankısı yok.
- **Bir cümle = bir görüntü**: kesme cümle değişirken gelir (3-7 sn); görüntü uzun videoda aynı resmi gösteren aralığın içinde kalır (kareler karşılaştırılarak ölçülür), kısa sahne yavaşlatılır/son kare tutulur — sonraki sahneye kaymaz.
- Çakılan kelimenin görüntüsü o şeyi göstermiyorsa (ZİNCİR üstünde sur) videoda onu gösteren en yakın an seçilir; elle değiştirilmiş görseller "içeriği bilinmiyor" sayılır.
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
