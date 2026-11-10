# Nova Studyo — Sürüm Notları

## 1.16.29 (29 Ekim 2026)

- **Her kanalın sesi düğmesinin yanında yazıyor.** Kanal sahibi "her kanalın sesini yanında göster, seçtiğimiz unutmayalım" dedi. Stüdyodaki Tarih, Gündem ve Finans stil düğmelerinin altında ayarlardaki kanal sesinin adı yazıyor, hangi sesin klonu olduğu da görünüyor: The Last Entry (Quentin klonu), Behind the Headline (Daniel klonu), Margin Theory (Michael C. Vincent klonu). Ses seçilmemişse "ses seçilmedi" yazıyor. Test: kanal-sesi-etiketi.

## 1.16.28 (29 Ekim 2026)

Kaynak: Husi-Suudi haberi (20261028-59b606). OpenAI kredisi 0'dı. 24 görsel ChatGPT'de elle üretildi, 4'ü Commons'tan geldi.

- **ChatGPT kutusu her mesajda tek görsel istiyor.** Dört görsellik her mesaj tek bir 1536x1024 resim içinde 2x2 kolaj olarak geldi; her çeyrek yalnız 768x512'ydi. Tek tek istenince 24 görselin hepsi tek kare geldi, her biri yaklaşık 1 dakikada. Test: image-inbox.
- **Görselin kendi yılı çağ etiketini yeniyor.** "Soldiers … in the 1960s" istemi 2026 sahnesinde "Set in 2026: vehicles, uniforms…" ile isteniyordu. İstemin kendisi bir yıl ya da on yıl söylüyorsa o geçerli (1960s → 1965). Test: resmin-yili.
- **Kutu → Commons doldurması doğru sahneyi buluyor.** Sahne istemin ilk 50 harfiyle eşleniyordu. "Extreme close-up of a hand holding a smartphone in a dark…" iki sahnede vardı; Mohammed Ali al-Houthi'nin isim kartına "Riyadh heard explosions" satırı gitti ve altına Riyad silüeti kondu. Artık istemin tamamıyla eşleniyor, en uzun eşleşme kazanıyor.
- **İsim kartında kişinin kendi adı aranıyor.** İlk arama kişinin adı oluyor; sorgu yazarı unutsa da ekleniyor. Portre 800 px'ten kabul ediliyor (al-Houthi'nin tek Commons fotoğrafı 869x548). Seçiciye "kişinin adı altında yer ya da nesne 0" deniyor. Test: gorsel-kutusu-commons.
- **Arşiv isim kartında kişiyi yalnız adıyla da arıyor; "al-" soyadı düşmüyor.** "Mohammed Ali al-Houthi Sanaa" boş döndü. Sade sorgu "al-Houthi"yi küçük harf diye atıp "Mohammed Ali Sanaa" yaptı, kart AI'a düştü. Oysa Commons'ta fotoğrafı adıyla duruyordu. al-/el-/bin-/ibn-/abu- ekli soyadı artık ad sayılıyor ve isim kartlı sahnede üçüncü sorgu kişinin adı. Test: docu-archive.
- **Kutu dolgusunun bulduğu portre arşiv kaydına gidiyor.** Kutudaki kare kapıya göre AI karesi: Pigott'un gerçek Dışişleri fotoğrafına "AI yüzü" dendi, isim kartı kalktı (gece elle arşiv kaydına taşındı). Artık isim kartlı sahnenin portresi `docu-archive-done.json`'a gerçek fotoğraf olarak yazılıyor: ad, rol ve scene-N künyesiyle; "Kaldığı yerden devam et" kartı onun gerçek yüzünde gösteriyor. Test: gorsel-kutusu-commons.
- **"Kapakları yenile" iyi paketi bozmuyor.** Yenilemede plan çağrısı başarısız oldu. Belirleyici yedek; 3 kapak ve yazılmış 5 başlığın yerine tek kapak ve seo.json başlıklarını koydu, kutudaki 3 ChatGPT kapağından yalnız biri kullanıldı. Artık önceki plan korunuyor, yalnız kapaklar yenileniyor. Test: docu-package.
- **Commons künyesinde sahip doğru.** "2026. Yahya Saree" fotoğrafının Artist alanı "You may select the license of your choice." idi; açıklamaya sahip diye bu basıldı. Boş ya da kalıp Artist, Attribution'a ("Tasnim News Agency") yer bırakıyor. Test: commons-sahibi.
- **Yazar kurumun ülkesini istemde yazıyor.** "A large parliament chamber" Mısır meclisi için İran bayraklı, Körfez kıyafetli geldi. Kurum, ordu, polis ya da kalabalık karesi ülkeyi ve şehri taşıyor. Test: kurumun-ulkesi.
- **Commons kataloğu olayın küçük tarihî fotoğraflarını tutuyor.** Gimli Glider: uçağın Gimli'de burnu yerde fotoğrafı (728x505, 1983), FAA'nın inişten sonraki karesi, C-GAUN'un 1983 ve 1985 fotoğrafları 900 px kuralına takıldı. Senarist yalnız 1984 Toronto fotoğrafını bildi, onu dört sahneye yazdı; iniş sahneleri AI'a düştü. 2000 öncesi tarihli tarama artık 480 px'ten sayılıyor. Test: gimli-commons.
- **Bir fotoğraf ile "(cropped)" kopyası tek dosya.** Toronto fotoğrafı ile kırpılmış kopyası iki ayrı dosya sayıldı, aynı kare 0. ve 33. sahnede çıktı. Katalog ve "aynı dosya iki sahneye verilmez" kuralı artık `commonsKey` ile karşılaştırıyor. Test: gimli-commons.
- **Aynı fotoğrafın Flickr kopyası ikinci sahneye gitmiyor.** Gimli: 0. sahne Toronto 1984 fotoğrafını Commons'tan adıyla aldı, 3. sahnenin (başlık kartı) araması aynı fotoğrafı Flickr'dan seçti; adres farklıydı, adıyla alınan dosyanın resim özeti de tutulmuyordu. Açılışta aynı kare 15 sn arayla iki kez çıktı. Flickr numarası (Commons dosya adındaki "(5530418110)", statik ve sayfa adresleri) ve adıyla alınan dosyanın dHash'i artık ayrılıyor. Test: flickr-ikizi.
- **Kutu dolgusu videoda zaten olan fotoğrafı koymuyor.** 41. yuvaya ("onarılıp hizmete döndü") yine Toronto fotoğrafı kondu, böylece aynı kare üç kez görünecekti. Arşivlenmiş sahnelerin ve künyelerin dosyaları aday listesinden çıkıyor; bir dolguda seçilen kare başka yuvaya da verilmiyor. Test: gimli-commons.
- **Yazar aracın tipini ve mekânın adını istemde yazıyor.** "A widebody airliner" Air Canada'nın 767'si için dört motorlu bir 747 getirdi. "Radar scope in a dark room" yerdeki kontrolörler içindi, kare kokpitte pilot üniformalı biriyle geldi. Hikâyenin aracı tipini ve biçimini taşıyor ("twin-engine Boeing 767-200, no upper-deck hump"); başka bir mekândaki kişiler o mekânın adını ("ground control room"). Test: aracin-tipi.
- **Dönem denetimi "sonrası" satırını tanıyor.** Gimli (1983): "onarılıp hizmete döndü" satırındaki 1998 Miami ve "emekliliğe" satırındaki 2008 Mojave fotoğrafı "1983'ten sonraki boya" diye reddedildi; satırlar yıl yazmıyordu. Ret arşivi baştan aratıp elle konan gerçek fotoğrafları da sildi. Yıl yazmayan sonrası satırında sonraki yılların görüntüsü artık doğru sayılıyor (tarama ve yakından onay). Test: donem-sonrasi.
- **Seçici satırın anını soruyor.** "Emekliliğe yakın yorgun bir uçak değildi" satırına seçici uçağın 2008'de Mojave'de depoda çekilmiş fotoğrafını koydu ("2008 anlatım aralığında" diye). Satır bir şeyi yeni hâliyle anlatıyorsa yıllar sonraki hâli uygunsuz; tersi de öyle. Test: gimli-commons.
- **Gerçek görüntü anlatıma uyduğu sürece akıyor (30 sn'ye kadar).** Kanal sahibi "videolar çok hızlı geçiliyor, anlatıma uyuyorsa 30 sn'lik de konabilir" dedi. Husi-Suudi haberinde 12 klip vardı, her biri yalnız kendi satırında 3,8–8 sn duruyordu; 17 sn'lik bir klip 6 sn'de kesildi. Klip artık aynı anı anlatan sonraki düz satırların altında da sürüyor: kancada en çok 8 sn, başka yerde en çok 30 sn, klibin kendi uzunluğu kadar. Yeni bölüm, isim kartı, kendi gerçek fotoğrafı olan satır, harita gibi bir cihaz, çağrı (abone/Hype), karanlıktan aydınlığa duygu dönüşü ya da yeni bir ad, tarih veya yer gelince duruyor. Kaynak planlayıcı her ana bir "span" yazıyor (kaç satır daha uyar); indirme o uzunluğa göre yapılıyor; 12 sn'den uzun klibin %75'teki karesi de denetleniyor. Test: gercek-goruntu-akisi.
- **Gerçek görüntünün kenarında sert geçiş yok.** Ras Tanura klibinden başlık kartına "whip", Bloomberg klibine "match" geçişi vardı. Gerçek görüntüye girerken ve çıkarken yalnız kesme, karartma ya da renk geçişi kullanılıyor (planda ve motorun kurgu dilbilgisinde). Test: gercek-goruntu-akisi.
- **Canlandırma dizisi "gerçek görüntü" diye girmiyor.** Gimli'nin kancası Mayday canlandırmasının "Havacılık Kazaları" yüklemesiyle açıldı; karede o programın Türkçe "Robert Pearson" isim kartı ve vesikalığı vardı. 10:19'daki klip doğrudan "Mayday: Air Disaster" kanalındandı (Cineflix, Content ID riski). İkisi de "Video: kanal · yıl" künyesiyle gerçek olay görüntüsü gibi durdu. Kanal ya da başlıkta Mayday, Air Crash Investigation, National Geographic, Smithsonian Channel, "reconstruction" ve benzerleri geçen video aday olmuyor. Kare denetiminde de yeni bir bayrak var: oyuncularla kurulmuş sahne ya da başka programın portreli isim kartı videonun tamamını düşürüyor. Test: canlandirma-klip.
- **Harita baştan başa kara olan boş kadraja yaklaşmıyor.** Gimli: "north of Winnipeg: Gimli" haritası 8°x3°'lik Manitoba kutusuydu; kamera Gimli'ye yaklaşınca kadrajda kıyı da sınır da kalmadı, 8:49'da koyu boş bir kart ve iki nokta göründü. Yakın kadraj %97'den çok kara ise ve hiçbir sınır geçmiyorsa kutu, kıyı ya da sınır görünene kadar genişliyor; pinler yerinde kalıyor (Gimli 2,25 kat, 49. paralel kadrajda). Boyalı ülkeli harita kutusunu koruyor. Test: harita-cizgisiz-kara.
- **Telemetri şemasında etiketler üst üste binmiyor.** Gimli sahne 59'da 6 adımlı şemanın uzay aracı ucunda adımlar ~190 px aralıklıydı; 300 px'lik iki etiket aynı tarafa düştü ("FIGU1.77"). Ön izleme kapısı iki turda düzeltemedi. Sıkışık komşular artık sırayla yolun üstüne ve altına diziliyor; 7–8 adımda etiketler daralıyor. Test: sema-etiket-cakismasi.
- **GÖRÜNÜŞ: videolar artık siyah-beyaz ve karanlık değil (29 Ekim 2026).** Kanal sahibi "videolar hep siyah, hep aynı, farklılık yok" dedi. Son 7 videonun ölçümü: parlaklık 52-75, doygunluk 2,5-7,5, karanlık kare %21-39. En iyi videomuz Panama 88 / 10,2'ydi. Görünüş adı her videoda değişiyordu ama renk değişmiyordu. Nedenleri:
  - konu motiflerinin 6/8'i "selective" (siyah-beyaz + tek renk) ayarını zorluyordu ve bu ayar her bölüme bağlayıcıydı;
  - her karede %22 siyah sinema bandı ve %60-90 kenar kararması vardı;
  - yazıların arkasındaki zemin 0,58 parlaklıktaydı;
  - bölüm kartları, şemalar ve çerçeveler hep siyaha yakın zemin üstündeydi;
  - görsel tarifleri "deep shadows" diyordu;
  - açılış rengi ayrıca %45 kısıyordu.

  Yeni kurallar:
  - Temel renk ayarı renkli: color, warm, cool, teal-orange ya da kodachrome. Siyah-beyaz yalnız TEK bölümde vurgu olarak, kancada asla, resimli sahnelerin en çok %15'inde. Gerçek arşiv fotoğrafı rengini korur, yalnız gerçekten siyah-beyazsa öyle kalır (otomatik ölçülür).
  - Kanalda arka arkaya iki video aynı temel renkte olmaz, 3 videonun 1'i açık zeminli olur.
  - Sinema bandı varsayılan olarak kapalı. Kenar kararması en çok 0,35. Ruh hâli filtresi yalnız resme uygulanır, yazıya değil.
  - Şema, bölüm kartı ve çerçeve zeminleri orta koyu tonda (parlaklık ≥45), arkalarında sahnenin bulanık fotoğrafı var. Açık görünüşlerde her şey açık paletle çizilir.
  - Görsel tariflerinde karanlık kelimeler yasak. Karelerin çoğu gün ışığında. Karanlık görseller 85'in altındaysa parlatılır (eski eşik 62).
  - Efektler anlatımdaki vuruşa bağlı, rastgele dağıtılmıyor. Nabız gibi atan kararma en çok 2 kez, sis efektindeki titreme kaldırıldı. Bölüm geçişinde siyah ekran yerine kesme kullanılıyor.
  - Kalite denetimi ve ön izleme kapısı görünüşü ölçüyor (hedef: parlaklık ≥75, doygunluk ≥8, karanlık kare ≤%15) ve tutmazsa uyarıyor.

  Doğrulama, eski işler yeni kurallarla yeniden planlanıp aynı kareler çizilerek (`docu-engine/scripts/look-verify.mjs`):

  | Video | Parlaklık | Doygunluk | Karanlık kare |
  |---|---|---|---|
  | Gimli | 48 → 72 | 2,2 → 15,2 | %44 → %0 |
  | Husi | 64 → 82 | 3,9 → 17,4 | %31 → %0 |
  | Bakker | 55 → 71 | 2,0 → 12,4 | %25 → %0 |

  Eski karanlık AI görselleri yeni üretimde parlatılacak. Testler: gorunus-renk-politikasi, gorunus-motor, gorunus-istem, gorunus-efekt, gorunus-olcum, gorunus-inceleme, gorunus-zemin, gorunus-zemin-inceleme, gorunus-mono-kaynak.
- **Nefret sloganlı afiş sahneye gelmiyor.** Husi-Suudi haberinde ~10:27'de Husilerin "sarkha" sloganı (Death to America… Curse on the Jews) yazılı bölüm kartı vardı; reklam uygunluğu riski. Seçicinin doğruluk satırlarına eklendi: ölüm ya da nefret sloganı okunan afiş, pankart veya duvar yazısı sahneye seçilmiyor. Test: docu-archive.
- **Short'un açılış sayısı birimini taşıyor.** "about 45 percent of the fuel" satırı ekrana tek başına "45" çaktı. "percent" ile söylenen sayı artık "45%" olarak çakılıyor. Test: slam-yuzde.

## 1.16.27 (27 Ekim 2026)

- **Gerçek kişinin yüzü, ekrandaki ad ve sahte gazete** (27 Ekim 2026; Lula, Çernobil ve Madoff videolarında bulunan hatalar; kanal sahibi: "düzelt").
  - **Anlatımda adı geçen gerçek kişiye AI uydurma yüz çizmiyor.** Kişi listede olmasa da kural geçerli: Madoff'un oğulları "Mark and Andrew" satırında AI iki uydurma yüz çizmişti. Sahnenin anlatımı, arşiv araması ya da isim kartı gerçek bir adı taşıyorsa AI karesi kişiyi arkadan ya da siluetle gösteriyor. ChatGPT görsel kutusu da aynı tarifi alıyor. Senaryo gerçek kişiler listesini (realCast) kendisi dolduruyor. Bu listeye isim kartları, alıntı sahipleri, unvanla ya da akrabalıkla anılanlar giriyor. Ülke, millet ve şirket adları kişi sayılmıyor: "Israel's attorney general", "Defense Minister Israel Katz" içindeki "Israel" bunlara örnek.
  - **AI sahte gazete çizmiyor.** Çernobil'deki anlamsız manşetli "New York Post" ön sayfası buna örnekti. Gazete ön sayfası, manşet, kapak ya da yayın adı isteyen AI karesi yazısı okunmayan, katlanmış bir gazete yığınına dönüyor. Gerçek manşet arşivden ya da manşet cihazından geliyor.
  - **Yazı yüzün üstüne binmiyor (uzun video ve Shorts).** Lula'da kanca başlığı ve dev "52" yüzlerin, Short'ta "LULA: 51.78%" alnın üstündeydi. Yüzlü resimdeki büyük yazı alt üçte bire iniyor. Shorts'un üst etiketi yüzün altına iniyor. Ön izleme kapısı yazıyı gerçekten indiriyor, altı tur aynı stili denemiyor.
  - **Ekrandaki ad yalnızca o kişinin resminde.** Çernobil'de "ANANENKO" ve Short'larda "AND BORYS BARANOV" başka adamların üstündeydi. İsim kartı, anahtar kelime, vuruş ya da altyazıdaki ad yalnızca o kişinin gerçek fotoğrafında duruyor. Kart kişinin kendi fotoğrafına taşınıyor, fotoğraf yoksa kalkıyor ve adı anlatıcı söylüyor. İnsan göstermeyen resimdeki ad yerinde kalıyor: Bakker'deki "Tammy", Hastings'teki "Harold". Ad eşleşmesi soyadına bakıyor, ortak ilk ad başka kişi sayılmıyor: Imre Nagy ile Imre Steindl, Yair Golan ile Yair Lapid.
  - **Gerçek kişinin adı AI görsel istemine gitmiyor.** Kapı yeniden ürettirirken anlatımdaki adlar "the person" oluyor.
  - Testler: gercek-kisi-yuzu-2, yuz-yazi-isim-karti, shorts-yuz-isim.
- **Haber videosunda olayın gerçek görüntüsü daha az atılıyor** (Kartal Yuvası yangını: 12 anın 5'i girmişti ve yangının kendi görüntüleri elenmişti; Lula: 10 anın 2'si).
  - Bir videonun ilk karesi stüdyoya, isim kartına ya da başlık kartına denk gelirse aynı videonun en çok 2 başka anına bakılıyor. Her an için 3 yerine 5 aday deneniyor, an başına en çok 8 kare denetleniyor.
  - Köşe logosu, filigran, küçük isim bandı ve tek satır altyazı klibi düşürmüyor. Bunlar olduğu gibi görünür kalıyor; hiçbiri kesilmiyor, kapatılmıyor. Karenin yaklaşık %15'inden fazlasını kaplayan başlık bandı klibi düşürüyor.
  - Yapay zekâyla üretilmiş "haber" kareleri ayrıca eleniyor. Kartal'da elenen "yangın" videolarından biri AI itfaiye karesiydi.
  - Her reddin nedeni iş günlüğüne ayrı yazılıyor: stüdyo spikeri, büyük ekran yazısı (%30), ajans etiketi, sert görüntü, farklı yıl, yapay zekâ görüntüsü, anlatıma uymuyor.
  - Yayıncı listesine Globo, Record, SBT, Band, CNN Brasil, Jovem Pan, TIME ve İsrail kanalları eklendi: Kan, N12, Kanal 13/14, i24NEWS.
  - Haber videosu başına en kötü durumda ~75 kare denetimi daha yapılıyor: ~0,2 $ ve ~30-40 dk daha uzun arama.
  - Eski işlerin kayıtlı klip seçimleri aynen kalıyor. Test: klip-eleme-nedenleri.

- **Haber konusu kapıdan geçmeden video yapılmıyor** (kanal sahibi: "France gibi olay yakalamalıyız"). YouTube yeni videoyu birkaç yüz kişiye gösteriyor, tıklanmazsa göstermeyi kesiyor. Behind the Headline'ın sayıları:
  - Kazananlar: France sokağa çıkma yasağı 3.527 gösterim ve 607 izlenme; Panama 7,7 depremi %4,9 tıklama ve 7:11 ortalama.
  - Kaybedenler: Lula'nın dördüncü dönemi ilk gün 92 gösterim. "lula wins fourth term" aramasında 11-23 saat içinde CNN, Bloomberg (3 video), ABC, France 24 ve AFP vardı. El Niño ve Kızıldeniz kabloları %1,2 tıklamayla 342 gösterimde durdu.

  Gündem radarı artık her öneri için olayın gidişatını (büyüyor / sürüyor / tek seferlik), büyük kanalların bıraktığı açıklama boşluğunu ve haberin yaşını soruyor. `newsGate` şu durumlarda öneriyi geçirmiyor:
  - büyüklük 4/5'in altında;
  - tek seferlik bir sonuç (kafa karışıklığı ve boşluk 4/5 değilse);
  - açıklama boşluğu 3/5'in altında;
  - 48 saatten eski;
  - Google'da ilgi tepenin %40'ının altına düşmüş ve yükselmiyor.

  Geçenler önce sıralanıyor; Google'ın 4 ölçümü onlara gidiyor. Gündem sayfası her konuda "✅ Kapıdan geçti" ya da "⛔" ile sebeplerini gösteriyor.
- **Büyüklük YouTube aramasında ölçülüyor.** `compareInterest` artık Trends'in YouTube arama verisini (gprop=youtube) okuyabiliyor. Radar önce bununla ölçüyor; Google reddederse web aramasına dönüyor ve sayfa hangisiyle ölçtüğünü yazıyor. 27 Ekim'de iki ölçü ayrıştı:
  - Ebola Google'da yükseliyordu, YouTube'da tepesinin yarısına düşmüştü.
  - "pentagon" YouTube'da tepedeydi ve yükseliyordu.
  - Son bir ayın en büyük haberi YouTube'da France ayaklanmalarıydı.
- **Haber başlığı soru sorar, sonucu özetlemez.** Haber videosunun 5 başlığından en az 4'ü yer/olay adı (+ sayı) ve "Why/How/What …?" sorusu taşımalı; aksi halde plan onarıma dönüyor (`newsTitleErrors`, `newsPackageLines`). Örnek "Panama's 7.7 Earthquake: Why Wasn't It Worse?", karşı örnek "Lula Wins Fourth Term…".

  Test: haber-konu-kapisi.
- **Açılış kuralları sertleşti** (kanalların izlenme eğrileri, 27 Ekim 2026; kanal sahibi: "ekle hepsini"). Kaçış 0:10-0:30 arasında oluyor. 30. saniyede kalanlar:
  - Panama %85 — ilk 15 sn'de rakamlı çelişki;
  - Bakker %65 — tarih ve karar;
  - France %55 — 0:21'de üç maddelik vaat, 0:32'de "As I record this…";
  - Hastings %20 — "Nineteen days." "October 2026. A queue outside the British Museum…"; hikâye 0:33'te başladı.

  `hookErrors` ilk 30 saniyede şunları yakalıyor: liste halindeki vaat, ikinci vaat, "stay with me / let's dive in" türü önsöz, ilk 15 sn'de hiç sayı olmaması ve tarih filminin bugüne sapması (haber ve bu yıla bağlı konular hariç). Tek kısa vaat serbest; yazım çizelgesi onu istiyor.

  Bulgular editörün ikinci, odaklı turuna giriyor (`hook-number`, `hook-modern`, `meta`). İkinci turdan sonra kalan önsöz ve süreç cümlesini kod kendisi kesiyor (`stripHookPreamble`).
- **Kapak kuralları sertleşti** (tıklama oranları).
  - Kazananlar: "PARIS UNDER CURFEW" France'ın A/B testini aldı; Panama'nın "7.4 COLOMBIA / 7.7 PANAMA" etiketleri %4,9.
  - Kaybedenler: "19 DAYS. ONE CROWN" %1,3, "FOR ONE CRATER" %1,7, "$116B IN ONE YEAR" %2,5; Fransa borcunda adı geçmeyen bir bakanın portresi %1,1.

  Plan doğrulaması (`thumbStoryErrors`) iki şartı arıyor, tutmayan plan onarıma dönüyor:
  - Her kapağın sözleri (yazı, sayı, etiketler, rozet) anlatımda geçen bir özel adı ya da olayın yılını taşır (`thumbNames`).
  - Kahraman yüz hikâyenin adıyla anılan öznesi olur: isim kartı başka birini söylüyorsa ya da yüz adı geçmeyen bir yetkili portresiyse olmaz.

  Paket istemi bu kuralı ve kullanılabilecek adları da söylüyor.

  Test: acilis-kapak-kurallari. docu-package testindeki örnek kapaklara 1971 rozeti eklendi.

- **Ciddi konuda saçma müzik çalmıyor, müzik duyguyu taşıyor** (27 Ekim 2026; kanal sahibi: "ciddi konuda saçma sapan şeyler çalmasın ve duyguyu hissettirsin, sesler mükemmel olsun"). 11 video ve 233 parça denetlendi, ardından 16 gerçek işin müziği yeniden planlandı (render yok, ücretli API yok).
  - **Bulunanlar:**
    - Hormuz mayın haberinin ana teması bir uyku parçasıydı: "Somnia… relax and sleep".
    - Kartal Yuvası yangınında smooth noir saksafon çaldı. "claimed hits" ve "al-Nazili" sözcükleri Hitler/Nazi sanılmış, hikâye 1942 sayılmıştı.
    - Çernobil 1976 sayıldı ("RBMK-1000" = 1000 yılı), cazlı bir palet aldı. "Borys Baranov died" satırı sürükleyici In Battery'nin altındaydı; 146 sahnede tek 'sad' yoktu.
    - Lula haberinde latin gitar çaldı.
    - Yatak sesin yalnız ~13,5 dB altındaydı, her 1,2 sn'lik nefeste 11 dB yükseliyordu.
    - Ölüm satırına vuruş, her bölüm kartına yükseltici düşüyordu.
    - Film sonu iki kez kısılıyordu.
  - **Parça sınıfı** (`seriousClass`): kütüphanede 83 güvenli, 16 koşullu, 134 asla. Etiketsiz parça "asla" sayılıyor. Uyku, ninni, çocuk, spa ve lo-fi parçaları hiç yüklenmiyor.
  - **Dinlenmemiş şüpheli parçalar** (Highway Nocturne, Marvel taklidi Marble Cinematic University, Survival Mode, Ezra Lipp'in dizi taklitleri, John Patitucci'nin iki parçası) ciddi hikâyede hiç çalmıyor.
  - **Ciddiyet:** hiçbir hikâye 'serious'ın altına inmiyor ('open' yalnız iş ya da ayar açıkça isterse). Finans ve ağır sözcük yoğunluğu 'grave' yapıyor. Havuz sert süzgeç: hafif parçayla doldurulmuyor.
  - **Dönem:** hat müziğe ayrı bir yıl yazıyor (`script.musicEra`). Bu yıl `script.era` değil: görünüm ve kalite denetimi değişmiyor, yama render da aynı yılı hesaplıyor. Sayısal yıl dönem sözcüğünü yeniyor, model numarası yıl sayılmıyor. 1950 öncesinde synth, pad ve elektronik çalmıyor, tema da döneme uygun oluyor.
  - **Uyum önce, çeşitlilik sonra:** geçmiş yalnız eşit uyanlar arasında karar veriyor. Kanalın son 3 videosunun parçası, uyan iki başkası varken oturuyor. Geçmiş kanal başına tutuluyor (`script.musicChannel`); köşe damgasının adı geçmişi artık gizlemiyor.
  - **Yas:** ölüm söyleyen satır 'sad' oluyor ve kilitleniyor. Altında yalnız yaslı, sakin parça çalıyor; doruk anında palet dolu olsa da (1453'te imparatorun ölümü The Challenger'ın altındaydı). Soru, koşul, efsane ve iddia yas sayılmıyor ("If your bank dies…", "was anyone actually killed?"). "Not one … survived" yas sayılıyor.
  - **Rahatlama:** "Nobody was hurt", "both boats came home" gibi satırlarda yaslı parça çalmıyor.
  - **Tema** en az iki yerde oturabilen parçadan seçiliyor; bir kez duyulan tema tema sayılmıyor.
  - **Bozuk ses olmuyor:** çok sessiz kayıt (Sad Trio, -36 LUFS) planlanmıyor; eskiden ölüm satırlarında 27-40 sn delik açıyordu. Zincirde 12 sn'den kısa kırpık parça yok.
  - **Ses seviyeleri:**
    - Ördek duyguya göre: hüzün ve sakin 0.14, merak 0.17, gerilim 0.2, ifşa 0.22. Yatak sesin ~16-21 dB altında.
    - 2 sn'den yakın satırlar tek pasaj. Kısa duraklamada en çok +5 dB.
    - Alıntı ve yas satırında müzik bir düzeye iniyor (yas 0.14, alıntı 0.12). İlk denemede ölüm satırının müziği ~31 dB gömülmüştü; şimdi ~20 dB'de, duyuluyor.
    - Vuruştan sonra 1,5 sn müzik yok. Ağır satırda vuruş, yükseltici ve stinger yok. Yükseltici en az 60 sn arayla, en çok 6.
  - **Müzik pencereleri:** yas ya da doruk satırından sonra ~150 sn'de bir 3,3 sn hava bırakılıyor ve müzik orada öne çıkıyor. Girişte ve bölüm kartının yanında olmuyor. Eskiden müzik sürenin yalnız %0,6-2'sinde öndeydi.
  - **Master:** tek 3,5 sn eşit güçte son kısma. ElevenLabs bestesine de ayrı kısma geliyor. Sınırlayıcıdan önce 1,5:1 kompresör, tavan 0.75. Kodlamadan sonra seviye 0,4 LU'dan fazla kaçarsa bir kez düzeltiliyor.
  - **Para:** kütüphane varken uygun parça çıkmazsa iş duruyor, ücretli besteye sessizce geçmiyor. Planın uyarıları iş günlüğüne yazılıyor.
  - **Görüntü değişmiyor:** kurgu dilinin ağırlığı eski kuralda kalıyor (`editGravity`), müzik kuralı eski videoların kurgusunu değiştirmiyor.
  - **16 işin yeni planı:**
    - Sessiz delik 0, kırpık 0, yaslı parça altında rahatlama satırı 0.
    - Yas satırlarının hepsi yaslı parçanın altında.
    - Her filmin iki-üç kez duyulan bir teması var.
    - Dakikada 0,68-0,95 müzik değişimi.
  - **Bilinen sınır:** etiketler parçanın yalnız iki 20 sn'lik kesitinden çıktı. Çalan sürenin ~%23'ü dinlenmiş kesitlerde. Bölüm bölüm yeniden etiketleme ücretli, onay bekliyor.
  - Testler: muzik-ciddiyet, muzik-gecis-ve-efekt, muzik-miks, muzik-yas-ve-donem; audio-director, docu-edit-grammar ve muzik-yas-ve-donem güncellendi.

## 1.16.26 (26 Ekim 2026)

- **Müzik filmin konusunu ve dönemini doğru okuyor, nefes alıyor** (kanal sahibi: "müzik kalitesini maksimize et"). 2009 denizaltı çarpışmasının (20261024-373aaf) müzik planı şöyleydi: "dönem ? · konu space · tercih ambient/synth", tema "Laniakea" (bir galaksi kümesi), 13,9 dakikada sıfır nefes. Üç sebep vardı:
  - **Dönem:** yıl okuyucu, arkasından virgül ya da nokta gelen yılı ("February 2009, two boats…", "in 2009.") saymıyordu; anlatımdaki her 2009 böyleydi. Artık yalnızca rakam ya da ayraç+rakam ("2,009", "2009.5") yılı sayı yapıyor.
  - **Konu:** konu kitabının görünüş alanları konu metni sayılıyordu: görünüm adları "deep-space-cyan" ve "retro-nasa", bir "rocket" ikonu, Space Grotesk yazı tipi. Görünüş anahtarları (variants, typography, iconSet, palette, backdrops, grade…) artık müzik konusuna girmiyor. Denizaltı, sonar ve donanma için yeni bir konu rengi var (`naval`: alçak drone ve pad, yaylılar; beat, caz ve gitar yok).
  - **Nefes:** her bölüm zirveyle bitiyor, ardından bölüm kartı geliyordu; nefes ise yalnızca aynı bölümde ve başka bir duyguya geçerken veriliyordu. Artık film yaklaşık her 4 dakikada bir nefes alıyor (en az 90 sn arayla). Bölüm kartından önceki zirve de nefese girebiliyor: kartın kendi vuruşu sessizlikte duyuluyor, yeni bölümün müziği ondan sonra giriyor. Denizaltı filminde 3 nefes çıkıyor.

  Aynı iş yeniden planlandığında: dönem 2009, konu naval, tercih orkestra/drone/ambient/pad/yaylı, tema "Standoff". Test: muzik-konu-donem-nefes.
- **Filmin görsel dili konu taşımıyor.** Denizaltı videosunda "WHITEHALL · 17 FEBRUARY 2009" etiketi bir denizaltı üssünün üstünde çıktı. Sebep: her AI isteğine eklenen visualStyle "…documentary photograph of North Atlantic nuclear submarines and their bases, …" diyordu, bu yüzden "Whitehall'da taş bir hükümet binası" istemi de denizaltı çizdi; AI kareleri de birbirinin aynısı siluetlere döndü. Yazarın şeması artık konu yazmayı yasaklıyor (örnek cümleden yer adı da çıktı). Yeni senaryoda "photograph/footage/image of …" konusu cümleden atılıyor, ışık, lens, renk ve doku kalıyor (`lookOnly`). Eski işlerin görsel önbelleği değişmiyor. Test: gorsel-dil-konu-tasimaz.

## 1.16.25 (25 Ekim 2026)

- **Bir dosya yazımı işi 48 dakika donduramaz.** Denizaltı işinin (20261024-373aaf) ön izleme kapısı 2. turda durdu: log yok, CPU sıfır, Nova'nın sunucusu cevapsız. Sebep zinciri:
  - job.json'ın yeniden adlandırılması, dosyayı başka bir okuyucu silme izni vermeden açık tuttuğu için düştü (EPERM; job.json.tmp diskte kaldı);
  - updateJob hatayı fırlattı, motorun çıktı dinleyicisinde kimse yakalamadı;
  - ana süreçteki hata yakalayıcı eşzamanlı ve kipli bir hata penceresi açtı; pencere arkada kaldı ve Node'u durdurdu.

  Artık rename kısa aralıklarla (toplam ~1,6 sn) yeniden deneniyor, olmazsa üstüne kopyalanıyor. updateJob yazamazsa fırlatmıyor, 2 sn sonra son durumu yeniden yazıyor. Hata yakalayıcı hatayı `data/ana-surec-hatalari.log`'a yazıyor ve en çok bir, beklemeyen pencere açıyor. Test: ana-surec-kilitlenmez.
- **Takılan adım işi sonsuza dek bekletmiyor.**
  - Ön izleme turu 10 dk ilerlemezse (`docuGateStallMs`) kesiliyor ve tur başına bir kez yeniden deneniyor; olmazsa iş render'dan önce duruyor.
  - Motor ve çizici süreçleri `close` gelmese de `exit`'ten 15 sn sonra kapanıyor; takılınca bütün süreç ağacı öldürülüyor.
  - Uygulama ve motordaki her eşzamanlı ffmpeg/yt-dlp çağrısının süre sınırı var (`-nostdin`, pencere yok); akış dinleyicilerinden hata kaçamıyor.
  - Kapak çizicinin tarayıcısı ısı koruması altında 25 yerine 90 sn bekliyor ve bir kez yeniden deniyor.

  Testler: kapi-takilma-bekcisi, motor-sureci-bekleme, kapak-cizici-bekleme, alt-surec-zaman-asimi, motor-ffmpeg-takilmaz, kapak-tarayici-baglanti.
- **Gösterilen klibin sesi anlatıcıyla üst üste konuşmuyor** (kanal sahibi: "videoları gösterirken arada yine konuşuyor"). Olay klibinin kendi sesi anlatımın altına giriyordu. Fransa'da Merkel–Sarkozy basın toplantısı ve Le Parisien muhabiri anlatıcının altında konuştu, Kartal'daki drone kliplerinde başkasının müziği vardı (Content ID riski). Klibin sesi artık yalnızca `docuNatSound: true` ile giriyor; atmosferi ortam sesi kütüphanesi veriyor. Kişinin kendi sesi ayrı sahne olarak kalıyor. Test: klip-sesi-anlatimla-cakismaz.
- **Ön izleme kapısı:**
  - Haritada, bölünmüş ekranda, manşette ve alıntıda görülen yanlış içerik (mismatch, wrong_face, ai_look) artık atılmıyor. Orta ve yüksek şiddette cihaz düz bir fotoğraf sahnesine dönüyor (`device-fallback`). Kartal'ın "AUSTRIA" haritası böyle kaçmıştı.
  - Yamalar sahne başına birikiyor; cihazı fotoğrafa döndüren yedek sonraki turda geri alınmıyor.
  - Kare artık geçişin ya da sönmenin içinden alınmıyor; her an sahnenin tam görünen aralığında. Denizaltıdaki üç "bozuk" kare (bej, beyaz) aslında sahnenin son, geçiş karesiydi, resimler sağlamdı.
  - Gerçek bir bozuk kare düzeltilmeden render'a gitmiyor (yeniden seçim, AI ya da cihaz yedeği). Çözülemeyen bulgu varken "Ön izleme temiz" yazılmıyor.
  - Kancada bekleyen başlık kartı ara plan alıyor. Ses klibinden sonraki sahnelerin düzeltmeleri doğru sahneye yazılıyor.

  Testler: icerigi-yanlis-cihaz, on-izleme-yamalari-birikir, kapi-kare-ani, kapi-bozuk-kare, kanca-baslik-karti, ses-klibi-sahne-sirasi.
- **Kaynak klip:**
  - Reddedilen klip kayıttan geri gelmiyor (Kartal kancasında 4 turda da geri konmuştu).
  - 640 px'ten dar ya da saniyede 12 kareden az klip alınmıyor. Klip yerine geçtiği fotoğrafın yazısını taşımıyor (denizaltı kancasında 480x348, 10 fps, başka bir tekne "LE TRIOMPHANT" yazısıyla girmişti). Wikipedia slayt kopyaları alınmıyor.
  - Klibin yılı olayınkiyle uyuşmalı (Fransa'ya 2018 öğrenci protestosu girmişti).
  - Denetim çağrısı token sınırına takılmıyor, denetlenemeyen klip kabul edilmiyor. Kredi/ağ hatası boş sonucu kalıcı kaydetmiyor.

  Testler: kaynak-klip-ret, reddedilen-klip-geri-gelmez, kaynak-klip-kunye-kare-hizi, kaynak-klip-kayit-kosulu-isaret.
- **Haritalar:**
  - Pinlerin durduğu ülke biliniyor (`countryAt`). Harita odaktaki yerin ülkesiyle adlanıyor ve boyanıyor.
  - Açık denizdeki harita kıyılar kadraja girene kadar genişliyor, pinler yeniden yerleşiyor.
  - Her harita temasında deniz, kara ve kıyı arasında en az kontrast var.

  Testler: harita-ev-ulkesi, harita-kara-kadraj, harita-deniz-kara-ayrimi.
- **Açıklama ve künye:**
  - İngilizce açıklamada Türkçe satır ("YouTube Ses Kitaplığı — atıf gerekmez") ve iç not ("Permission not verified") yok. Bunlar pakette ayrı bir "Yayın öncesi kontrol" bölümünde.
  - YouTube klipleri kanal adıyla anılıyor, "kamu malı" cümlesine girmiyor.
  - Yinelenen ve çöp yazar alanları temizleniyor. CC BY değişiklik notu doğru yazılıyor.

  Testler: aciklama-ic-notlar, kunye-temizligi, kunye-lisanssiz-ve-degisiklik, paket-yayin-oncesi-kontrol, ses-kitapligi-lisansi.
- **Shorts:**
  - Yeni resim yapılamazsa cümleyi gösterebilecek yedek seçiliyor; başka birinin portresi gelmiyor (Kartal'da Ciano için Bormann gelmişti).
  - Haber Short'u bugünün hikâyesini eski yıl sanıp gerçek fotoğrafları atmıyor (Kartal'da 92 fotoğrafın 68'i atılmıştı).
  - Short'taki rakam araştırmadan güçlü söylenemiyor ("only fourteen times").
  - Künye her fotoğrafı "Wikimedia Commons" diye yazmıyor; stok fotoğrafları listelemiyor, klipleri kanalıyla anıyor.

  Testler: shorts-yedek-gorsel, shorts-haber-donemi, shorts-sayi-denetimi, shorts-kunye, shorts-kunye-kutu, shorts-kutu-ve-donem.
- **Süre:** Senaryo hedef süreye gerçekten kırpılıyor. Tavan, işin kendi sesinin ölçülen temposundan (haber ~145, tarih ~141, finans ~134 kelime/dk) ve rehberdeki dakikadan geliyor. Kırpma kancayı, beğen-abone-yorum çağrısını ve kapanışı korur. Uzatma hiçbir zaman tavanı aşmaz. Fransa borcu 1997 kelimeyle 15 dk olmuştu. Testler: sure-tavani-kirpma, uzun-senaryo-kirpma, son-okuma-uzunluk.
- **AI görselleri:**
  - 2026 sahnelerine "modern nesne yok" yazılmıyor (Kartal'daki 1980'lerin ABD polis arabaları).
  - Gerçek kişinin AI karesinde yüz tarifi kalmıyor.
  - Ara plan istemleri sahnenin kendi görselinden geliyor; birbirinin aynısı istemler çeşitleniyor.
  - Kusurlu bulunan resim kapağa girmiyor.

  Testler: bugunun-sahnesi, gercek-kisi-yuzu, ara-plan-istemleri, istem-cesitleme, kapak-kusurlu-resim.
- **Arşiv:**
  - Haber videosunda bugünün satırı tarihî yıl almıyor.
  - Commons sorguları gemi ve kişi adlarını kaçırmıyor (denizaltı işinde HMS Vanguard ve Le Triomphant aranmamıştı).
  - Aynı fotoğraf başka adla ikinci kez girmiyor.
  - Görsel kutusunun Commons doldurması gerçekten çalışıyor.

  Testler: haber-arka-plan-donemi, commons-catalog-queries, adiyla-commons-tekrar, gorsel-kutusu-commons, kapi-kutu-commons.
- **Hız ve sağlamlık:**
  - "Schema is too complex" kararı hatırlanıyor; her işte ~6 dk bekleme bitti. Konu kimliği şeması artık reddedilmiyor.
  - Kopan akış (`terminated`) yeniden deneniyor.
  - Okunamayan resmin 400'ü iki kez ödenmiyor.
  - Ayarlar'daki görsel kaynağı devam eden işe de geçiyor.
  - Altyazıda 0,4 sn'lik tek kelimelik ekran yok.
  - Süre "9 dk 60 sn" yazılmıyor.

  Testler: sema-reddi-hafizasi, akis-kopmasi-yeniden, gorsel-400-tek-istek, gorsel-kaynagi-ayari, altyazi-yetim-kelime, saat-bicimi, motor-sure-bicimi, video-hazir-suresi.

- **Shorts dosyası yüklenebilir boyutta.** Kartal Yuvası Short 1 (55,8 sn) 580 MB çıktı, yani 83 Mbps; YouTube'a yüklemesi dakikalar sürdü ve elle küçültüldü. Aynı gün Fransa Short'ları 8,6 Mbps'ti. Kodlama ayarı ikisinde de aynıydı (crf 19), farkı içerik yaptı: tanık videosundaki yangın ve film greni. CRF tek başına tavan koymuyor. Artık Shorts'un dört kodlamasının hepsinde VBV tavanı var (`SHORT_VBV`: 16 Mbps, 32 Mbit tampon). Normal bir Short eskisi gibi kodlanıyor, yalnızca tepeler kırpılıyor. Test: shorts-bitrate (gürültülü dikey görüntüde tavansız 197 Mbps, tavanlı 22 Mbps; 3 sn'lik VBV sınırının altında).

## 1.16.24 (25 Ekim 2026)

- **Ön izleme kapısı her görseli görüyor.** Kartal Yuvası'nda kapı 4 turda bulguları 13'ten 2'ye indirdi, ama render sonrası denetim 21 sorun saydı. Sebep: kapı sahne başına TEK kare görüyordu, ara planlar ve uzun sahnenin ilk görseli hiç görülmüyordu. Kaçan hataların hepsi ara plan ya da sahne ortasıydı:
  - kancada gerçek fotoğraf gibi duran AI yangın karesi;
  - Hint plakalı motosiklet;
  - ABD itfaiyesi;
  - konum işaretli sahte "Kartal Yuvası" kulübesi.

  Artık her ara planın oturduğu an ve 7 sn'den uzun ara plansız sahnenin ortası da çiziliyor. Denetçiye "ara plan: AI görseli" deniyor; ara plandaki sorun yalnızca o ara planı kaldırıyor (`noInserts`), sahnenin gerçek fotoğrafı kalıyor. Test: kapi-dogrulama.
- **Beğen-abone-yorum çağrısı artık silinmiyor** (kanal sahibi: "like abone falan isteme niye girmemiş"). 24-25 Ekim'deki üç videoda da yazar kancadan sonraki üçlüyü yazdı, ama son okuma onu "meta, hikâyeyi frenliyor" diye sildi. Çağrı işareti bu geçişten sonra konduğu için koruma devreye girmiyordu. Beğen/abone, Hype ya da yorum isteyen satır artık son okumada silinemiyor; yeniden yazılırsa da çağrısı korunmak zorunda. Test: kapi-dogrulama.
- **Seçerken kontrol, 6 tur.** Sorunlu sahne doğru görsel bulunana kadar yeniden seçiliyor ve her seferinde yalnızca o sahne yeniden çizilip bakılıyor; tur sınırı 4'ten 6'ya çıktı. Render tek sefer.
- **Bitiş ekranı sessiz kalmıyor.** Müzik planı son satırdan sonra 13 sn'lik kapanış beklemesine sessizlik koymuştu (7,8 sn hiçbir şey). Sondaki 3 sn'den uzun planlı sessizlik artık son parçayla doluyor ve son karede kısılarak bitiyor.

## 1.16.23 (24 Ekim 2026)

- **Ölçü sayacı artık yıl sayılmıyor.** Kartal Yuvası haberinde "1,834 meters" sayacı (etiketi "METERS ABOVE SEA LEVEL") 5 kat ağırlıkla yıl sayıldı. Sonuçları:
  - 2026 haberinin ilk bölümü "1834 dönemi", bütün hikâye "1939 dönemi" diye denetlendi;
  - binanın bugünkü 25 gerçek fotoğrafı "dönem dışı" diye reddedildi;
  - AI istemlerine "1834'te elektrik ışığı yok" yazıldı.

  Sayaç artık yalnızca açıkça yılsa (`year`) ya da etiketi ve anlatımı bir ölçü (metre, kişi, euro, % …) söylemiyorsa yıl sayılıyor. Binlik ayırıcıyla yazılan sayı ("1,834") yıl değil. Test: gercek-goruntu.
- **Sosyal medya araması log'a yazılıyor.** Hangi aramada kaç gönderi bulunduğu ve her birinin neden alınmadığı (giriş gerekiyor, çok kısa, TV hesabı, indirilemedi) log'da görünüyor. Kartal Yuvası'nda 15 arama yapılmış ama iz kalmamıştı.
- **Kredi ön kontrolü** (kanal sahibi: "uygulama hata yapmasın"). 24 Ekim'de OpenAI görsel kredisi sıfırken üç iş sıraya girdi; Nova araştırmayı, senaryoyu ve sesi yapıp görselde 4, 25 ve 26 görselle takıldı. Elle doldurulan stok fotoğraflar finans videosuna balinalı monitör ve iş başvuru formu soktu. Artık yeni iş başlamadan:
  - ElevenLabs kalan kredisine bakılıyor (bir uzun video ~13 bin);
  - görsel servisinin kredisi en küçük bir deneme görseliyle (~1 sent) kontrol ediliyor; "kredi var" sonucu 6 saat hatırlanıyor.

  Yetmiyorsa iş hiç başlamıyor ve ne yükleneceğini söylüyor. Ağ yoksa uyarıyor ama işi durdurmuyor; devam eden iş yalnızca uyarılıyor. `docuCreditCheck:false` kontrolü kapatıyor. Test: kredi-kontrol.
- **Kapısız render yok.** Ön izleme kapısı teknik bir hatayla duramaz: önce bir kez yeniden deneniyor, yine çalışmazsa iş render'dan ÖNCE duruyor. "Kaldığı yerden devam et" kapıdan yeniden başlıyor; hazırlık ve görseller kayıtlı. `docuPreviewRequired:false` eski davranışı geri getiriyor.
- **Sondaki kalite denetimi artık hiçbir zaman kendiliğinden yeniden render açmıyor** (kanal sahibi: "sonda niye var bu kalite kontrolü"). Fransa borcu videosunda ön izleme kapısı teknik bir hatayla kapanmıştı ("Timed out … connect to the browser"). Bu yüzden denetim eski düzeltme moduna dönüp ikinci render açabiliyordu. Artık:
  - denetim yalnızca raporluyor; eski düzeltme turu yalnızca `docuAutoFix:"always"` ile açılıyor;
  - kapının teknik hatası 15 sn sonra bir kez yeniden deneniyor.

  Test: tek-render.
- **Avrupa yayıncıları ve ajansları da eleniyor.** Fransa borcu videosuna "Le Parisien" ve "CLPRESS / Agence de presse" klipleri girmişti. Engel listesine Fransız, Alman, İtalyan ve İspanyol büyük yayıncıları eklendi: Le Monde, BFM, TF1, franceinfo, Bild, Spiegel, ZDF, ARD, BR24, RAI, El País … Test: gercek-goruntu.
- **Şema temizleyici** (ayrı oturum): Claude'un reddettiği yapılandırılmış çıktı şemaları (çok fazla seçimli alan, minItems, nesne additionalProperties) istekten önce temizleniyor. Kısıtlar yanıttan sonra kodda denetleniyor. Test: sema-temizleyici.

## 1.16.22 (22 Ekim 2026)

- **YouTube Hype çağrısı** (kanal sahibi: "hype da istenebilir… arada söylemeli ve animasyonu da gözükmeli").
  - Videonun ~%40'ında, ilk büyük ifşadan hemen sonra tek ve kısa (en çok 16 kelime) bir cümle 'Hype' der. Hype yalnızca ilk haftada basılabildiği için cümle şartlıdır ve her zaman doğru kalır: "If you're watching this in its first week, tap Hype. It helps small channels get seen."
  - Ekranda alevli Hype düğmesi "Hype" kelimesinde basılır: kıvılcım saçar, "Hyped!" olur, "+1" yukarı süzülür (docu-engine `src/cta.tsx`).
  - Videoda tek kez; beğeni/abone üçlüsü kancadan sonra aynen kalır. Hassas konuda Hype istenmez. 4 bölümden kısa videoda yok.
- **Yazım süreci baştan kuruldu.** Kanal sahibi: "en iyi videoları analiz ettik, nie böyle oldu… yazım iyi olmalı". Fransa videosunun izlenme eğrisi şunu gösterdi:
  - 0:20-0:50 arasında izleyicinin dörtte biri vaat listesi, meta cümle ve "First, the basics" sırasında gitti.
  - Eylül'e dönen 2. bölümde %45 → %30'a düştü.
  - Zirveden sonraki yorum bloğunda %27 → %15'e düştü.
  - Arada kalan, olgulardan kurulu neden-sonuç zinciri %30'da düz kaldı.

  Yazım hattı denetimine göre kusurların hepsi planda doğdu ve hiçbir adım planı izleyici gözüyle okumuyordu. Profesyonel yazım araştırması (Paddy Galloway, Film Booth, MrBeast yapım notu, Kurzgesagt, NPR, Poynter, The News Manual) aynı sırayı öneriyor: vuruş planı → planın denetimi → taslak → kulak okuması → olgu kontrolü → izleyiciyi tutma turu. Yapılanlar:
  - **Plan editörü** (`docu-plan-editor.js`). Bölümler yazılmadan önce Opus planı her bölümün tahmini başlangıç saatiyle okur ve 11 maddelik bir kontrol listesiyle düzeltir:
    - açılış ~55 sn ve tek vaat;
    - 2. bölüm bu haftadan;
    - en çok bir arka plan bölümü;
    - but/therefore;
    - zirveden sonra olay;
    - vaatler araştırmada cevaplanabiliyor;
    - plandaki saat, sayı ve alıntı araştırmada var;
    - belirsizlik tek yerde;
    - kapanış açılışa döner.

    Yalnızca belirli alanları değiştirebilir. Düzeltilmiş plan plan kurallarından geçmezse özgünü kalır. Maliyet ~0,1 $; plan aynıysa yeniden ödenmez.
  - **Açılış bütçesi.** Bölümler eşit kelime alıyordu (15 dk'da 225); açılış bu yüzden en az ~85 sn oluyordu. Artık açılış ~140 kelime (~55 sn), kalan kelimeler diğer bölümlere gider.
  - **Tek açılış çizelgesi.** Açılışa sıkışan ~10 konum talimatı tek, çelişkisiz bir çizelgeye indi: an → soru → TEK cümlelik vaat → (çağrı) → en güçlü olgu. Fragman listesi, oryantasyon ve meta cümle açılışa girmez.
  - **Haber yapısı bu haftadan anlatılır.**
    - Plan arka plan bölümünü işaretler (`background`). Kancadan sonraki bölüm arka plan olamaz, en çok bir tane olur ve ~60-75 sn sürer; kalan kelimeleri bu haftanın bölümlerine verilir.
    - Zirveden sonraki dakika somut olur (olay, sonuç, harita, sayı).
  - **Araştırmanın yapım notları yazara gitmiyor.** Fransa araştırmasındaki "önceki haftalar 2:00" süre planı plana aynen 2. bölüm olmuştu.
  - **Yazar bütün metni görüyor.** Önceki bölümlerin tamamı, açılıştaki gerçek soru ve vaat cümleleri, bölümün videodaki başlangıç saati. Eskiden yalnızca son 3 satırı görüyordu; bölümler arası tekrarlar ve yanlış geri çağırmalar buradan çıkıyordu.
  - **Örnek cümleler kalıptır.** Kurallardaki 132 İngilizce örnek birebir kopyalanıyordu ("First, the basics", "Here's where it gets uncomfortable"). Kod kopyayı ve bilgi taşımayan köprüleri bulur ("Let's dive in", "Here you can see"…).
  - **Son okumaya yeni kod bulguları:**
    - araştırmada olmayan saat ya da sayı ("at 5:53"); Türkçe "550.000" ile İngilizce "550,000" aynı sayı sayılır;
    - araştırmada olmayan alıntı;
    - "the only / for the first time" kesin iddiaları;
    - göreli zaman ("four days away");
    - isimsiz kaynak ("rights groups say", "reports say"): atıf önde ve isimli olur;
    - kulağa yazılmamış noktalama;
    - art arda 5+ olgusuz satır.

    Editör satırları tahmini süreleriyle görür. Olgu düzeltmesinde yalnızca araştırmada geçen sayıyı kullanabilir; düzeltme tavanı 30.
  - **Son okuma 2. tur.** Ağır bulgular ilk okumadan sonra da duruyorsa editör yalnızca onlara bakar. Kalanlar uyarıya yazılır.
  - **Çelişkiler giderildi.**
    - Orta nokta kuralındaki köprü örnekleri kaldırıldı; hatırlatma bir olguyla yapılır.
    - Dürüstlük cümlesi ilk dakikada yok; belirsizliği kaynak taşır.
    - Önbellek sürümleri yenilendi (`docu-writer-4`, `son-okuma-2`).
  - Test: yazim-sureci (7), derin-inceleme-kurallari (18). Değişen beklentiler: docu-mode (plan editörü çağrısı, değişken bölüm bütçesi), son-okuma, patlayan-kanallar, shorts-acilis.
  - **Yazım kilitleri** (kanal sahibi: "en iyi mimari bu deme, tekrar tekrar aynı yere düşmeyelim"). Her ders bir kilit olur, yeni talimat satırı değil (test: yazim-kilitleri):
    - **Altın senaryolar** (`test/fixtures/yazim-altin`): Fransa ve Hürmüz'ün gerçek senaryoları. Nova bilinen her kusuru yakalamaya devam etmeli: meta cümle, "four words", "5:53", "the only death", "four days away", isimsiz kaynaklar, kopya köprüler, zirve sonrası olgusuz blok; plan seviyesinde "four words" ve "5:53". Yakalamayı bozan değişiklik testi kırar.
    - **Talimat bütçesi:** yazara giden kural metni en çok 19.000 karakter ve 70 satır (22 Ekim: 17.613 / 63). Yeni ders gelirse eski satırla takas edilir.
    - **Yasak köprüler** kurallarda yalnızca "yasak/yok/girmez" bağlamında geçer; örnek gibi öğretilemez.
    - Plan editörü plandaki "N words: …" sayımını da denetler.

## 1.16.21 (22 Ekim 2026)

- **Gerçek görüntü, haber kanalının ana silahı** (kanal sahibi: "anlattığı şeyin videosu çıksa insanlar daha çok izler… gündem kanalına tam oturur… başa koymak iyi olabilir"):
  - **Daha çok klip.** Haber biçiminde klip payı %18'den ~%33'e, olay anı 8'den 14'e çıktı. Tarih ve belgeselde %18 kalıyor.
  - **Kanca klibi.** Hikâye filme alındıysa ilk satırlardan biri en sert gerçek anla açılıyor ve pay sınırına takılmıyor.
  - **Doğal ses.** Olay klibinin kendi sesi (kalabalık, siren, cam) anlatımın ~11 LU altında, klip boyunca çalıyor (-30 LUFS). `docuNatSound:false` kapatır.
  - **TikTok / X / Instagram / Telegram / Reddit.** YouTube'da uygun klip çıkmayan olay anı için Claude web aramasıyla doğrudan gönderi adresi buluyor (video başına en çok 5 arama). yt-dlp yalnızca 3-8 saniyelik pencereyi indiriyor. Etikette hesap adı yazıyor ("Video: @hesap on TikTok · Oct 2026"). TV/ajans hesapları aynı listeyle eleniyor. Dikey telefon videosu kesilmeden, bulanık zemin üstünde bütün gösteriliyor. `docuSourceSocial:false` kapatır.
  - **Reklam güvenliği** (kanal sahibi onayı: gerilim girer, darbe girmez):
    - plan kan, yaralı/ölü insan, dövülen biri ya da birine ateş edilen silah içeren anı seçmiyor;
    - görme denetimi bunları gösteren kareyi reddediyor (`graphic`).
- **Gerçek görüntü titremiyor** (kanal sahibi: "videolar gözükürken ekran titremesin, izleyen düzgünce izlesin"). Arşiv/kaynak klibi artık çekildiği gibi oynuyor:
  - gergin sahne sallantısı yok;
  - vuruş sarsıntısı ve yakınlaştırma yok;
  - kamera itmesi ve yeniden kadraj yok;
  - yavaş çekim yok;
  - donan son karede kayma yok.
  Fotoğraflarda ve AI ile canlandırılan karelerde kamera hareketi aynen sürüyor.
- **Seçici renk görünümünde yüzler artık sararmıyor** (kanal sahibi: "bazı yerlerde insanların yüzü sararıyor"). Maske yalnızca güçlü, doygun kırmızıyı (ateş, siren, bayrak, rozet) tutuyor. Ten daha soluk olduğu için eşiğin altında kalıyor ve yüz siyah-beyaz görünüyor. Fransa videosunun Macron karesiyle denendi (`quality-review/selective-skin-fix`).
- Test: gercek-goruntu.

## 1.16.20 (21 Ekim 2026)

- **Ön izleme kapısı kendi düzeltmesine de bakıyor** (kanal sahibi: "en kral mimari derken sen bunu yapmadın mı zaten").
  - **Ne oldu:** Fransa videosu tek render çıktı ama render sonrası denetim 26 sorun saydı. Kapı iki tur bakmıştı, fakat 2. turun 10 arşiv yeniden seçimi ve 5 AI görseli hiç görülmeden render'a gitti. Yeni seçimler yine yanlıştı (okul kapısı polisi için Filipin, Sırp, ABD polisi).
  - **Artık:** 1. tur bütün sahnelere bakıyor. Sonraki turlar YALNIZCA değişen sahnelerin karesini çizip denetliyor (birkaç kare). Kapı, düzeltme kalmayana ya da 4 tur dolana kadar dönüyor.
  - **İki kez yanlış kare veren sahne AI'a düşüyor.** Arşiv aynı sahnede iki kez yanlış kare verirse sahne, anlatımla güçlendirilmiş istemle AI görseline geçiyor ve arşivde bir daha aranmıyor (seçici ücreti yok).
  - **Son tur.** Son turda yeniden seçim yapılmıyor, sahne doğrudan AI'a geçiyor, çünkü yeni seçime bir daha bakılamaz.
  - **Log artık dürüst.** "kapı temiz" ya da "son turda düzeltilen N sahneye bakılamadı" yazıyor.
- **Kanca hızı render'dan önce.** "Kancada aynı kare 6-7 sn" uyarısı yalnızca render'dan sonra çıkıyordu, oysa yalnızca senaryo ve ses süresi gerekiyor. Zaman çizelgesi eleştirmeni artık ön izlemede çalışıyor.
  - Yavaş kanca ya da uzun bekleyen kare bulursa o çekimdeki satırlar "ara plan" alıyor. Motor bu satırlara, yönetmen "hold" temposu verse de ara plan kesiyor:
    - yer/tarih yazısı kalıyor;
    - isim kartı olan satıra kesmiyor;
    - 2,4 sn'lik satırda da bir kesme yapıyor.
  - Fransa'nın kancasında 3 satır (sahne 3, 5, 6) bununla kesilirdi; alıntı kartı okunma süresi olarak kalıyor.
- **Şema/kart başlığı taşarsa başlık kalkıyor.** "FROM A HOT CLASSROOM TO A BURNING CITY H" iki turda da bulundu ama bu tür için düzeltme yolu yoktu; 5 sahnede render'a gitti. Konu tasarımcısı da artık modelin yarım bıraktığı tek harfi atıyor.
- **Denetçiye yazının uygulaması da söyleniyor.** Kapı "yazı yok" deyip sahneyi yazısız resme çevirince denetçiye hâlâ "ekrana gelen cümle" deniyordu; yazısız kare her turda "bozuk" sayılıyordu. Artık "anahtar kelime kartı" ya da "yazısız görüntü (kasıtlı)" deniyor.
- Test: kapi-dogrulama.

## 1.16.19 (20 Ekim 2026)

- **Kaynak video** (kanal sahibi: "kaynak videolardan tiktok o bu şu videolar koymak işe yaramış, bunu çekebilmeli"): küçük kanal patlamaları kare kare — Base Central Mickey Rourke'un KENDİ videosuyla, kendi sesi ve altyazısıyla açılıyor, köşede "his own video, January 2026", sonra haber klipleri; Statrys kurucunun kendi röportajlarıyla; bizim Panama (tanık videolu) en iyi tutan videomuz. Artık Nova, senaryo ve görsellerden sonra Claude'a en çok 8 "olay" anı (gerçek görüntüsü olan olay/yer/nesne) ve en çok 2 "ses" anı (adı geçen kişinin kendi sözü) seçtirir; yt-dlp ile YouTube'da arar, olay için videonun en çok tekrar izlenen anını (heatmap), ses için altyazıda sözün geçtiği yeri bulur ve yalnızca o 3-8 saniyeyi indirir. Olay klibi sahnenin görüntüsü olur (anlatım üstünde); ses klibi anlatım satırının ardına kendi sahnesi olarak girer — kişinin kendi sesi (TTS yok), ekranda altyazısı. Her klibin sol alt köşesinde "Video: kanal · Ay Yıl", künyesi açıklamada. Sınırlar: toplam en çok %18, tek klip en çok 8 sn; büyük TV/ajans kanalları (Content ID) elenir; görme modeli kareye bakar — anlatıma uymayan, stüdyo spikeri, ajans etiketi ("Source: Reuters") ya da dev gömülü başlık taşıyan klip girmez (gerçek denemede NewsX'in Reuters görüntüsü böyle çıktı). Kaynağın logosu asla kesilmez. yt-dlp: data/tools/yt-dlp.exe (ayar ytdlpPath); docuSourceClips:false kapatır. Test: kaynak-video.
- **Derin inceleme kuralları** (39 tutmuş videonun hepsi satır satır, rapor `quality-review/deep-study-20261019/RAPOR.md` §9; kanal sahibi: "hepsini ekle önerdiğin gibi yap"):
  - **Beğen-abone-yorum çağrısı kısaldı ve gerekçeli oldu.** Üçlü kancadan sonra kalıyor ama en çok 20 kelime (~8 sn) ve gerekçeli ("If you want the follow-up when this changes, like, subscribe…"). Hemen ardından videonun en güçlü vuruşu gelir; izleyici çağrıyı atlayıp tam oraya iniyor (536'da çağrı 0:33, en çok tekrar izlenen an 1:03). Eleştirmen 8,5 sn'den uzun çağrıyı yazar.
  - **Hassas konu listesi daraldı** (kanal sahibi, 21 Ekim 2026). Fransa isyan videosu yönlendirmesindeki "death toll" yüzünden çağrısız çıkmıştı. Artık çağrıyı yalnızca gerçek trajediler siliyor: salgın, doğal afet, kıtlık, katliam, soykırım, toplu silahlı saldırı, terör saldırısı. İsyan, savaş ve siyasi kriz haberlerinde üçlü çağrı var.
  - **Short artık bağımsız bir hikâye, fragman değil.** Short tek bir açıyı baştan sona anlatır ve CEVABI VERİR. Son cümle en güçlü sonuçtur ve açılışa döner. Anlatımda "the full documentary" çağrısı yok; planlayıcı yazarsa o vuruş düşer. Neden: GoPro Short'u 8 milyon, uzun videosu 235 bin; Epic History'nin kesit Short'ları aboneye göre 0,07-0,11×.
  - **Bölüm omurgası:**
    - her 60-90 sn'de tek cümlelik dönüş;
    - her önemli sayıya tanıdık bir karşılık (Güneş, havalimanı, maaş).
    - Haber:
      - açılışta çelişki sorusu;
      - 45. saniyeye kadar numaralı vaat;
      - "kim kim" haritası;
      - bölüm alt soruyla açılır, "X değil, Y" ve tek benzetmeyle kapanır;
      - arka plan domino zinciri olarak anlatılır.
    - Tarih: döngü defteri. Vaat ikinci yarıda adıyla geri çağrılarak ödenir; kutsal kitap planında bunu en az bir döngü yapar.
    - Kapanışta ders kuyruğu yok; son cümle açılışa döner.
  - **Zirve kareleri.** Kurgu yönetmeni videoda en az 3 yoğun veri karesi kurmalı (sıralı liste, ikonla sayım, ölçek, çok yerli harita); azsa kayda yazar.
  - **Son okumaya kod denetimi** (`docu-lint.js`), ses parası ödenmeden önce:
    - yapım notu sızıntısı ("The human cost line belongs here");
    - yanlış birim dönüşümü (536: °C → 34.8 °F);
    - söylenen sayının alıntıyla tutmaması (Fransa: "said four words: we lost control" — üç kelime);
    - kapanışın açılışa dönmemesi;
    - ilk dakikadaki süreç cümlesi ("As I record this…").

    Editör bunları düzeltmek zorunda. Birim düzeltmesi yalnızca kodun hesapladığı doğru değeri getirebilir. Yapım notu kalırsa cümle kesilir.
  - **Başlık videoda ödenmeli.** Başlıktaki iddia kelimesi ("scam", "collapse", "cover-up"…) anlatımda yoksa paket onarıma döner (Built Beyond "…a Scam").
  - **Dürüstlük cümlesi ilk dakikadan çıktı.** "I" en çok 2 kez. Belirsizliği kaynak taşır ("Reuters reported it; it has not been confirmed.").
  - **Merak kartı istisnası.** Bölüm başlığı, bölümün cevapladığı soru ya da cesur iddia olabilir. Büyük yazı tasarlanmış bir yüzeyde (paper/texture) videoda en çok 4 kez durabilir.
- **Fransa videosu izleyici notları** (21 Ekim 2026, kare kare izleyen bir analiz):
  - **Yazı artık kelimenin ortasından kesilmiyor.** "…BURNING CITY H" ve "eleven at night to six i" böyle kesilmişti. Konu kimliği artık kelime sınırında keser; sınırlar genişledi; model kısa değer yazar ("11 pm to 6 am").
  - **Yanlış ülke fotoğrafları elenir.** Paris anlatılırken Minneapolis 2020 yangını, BLM yürüyüşü, "POLICIA" yazılı polis, NYPD ve K-9 Crown Victoria araçları, Avrupa okulları için Arapça yazılı oda girmişti.
    - Amerika'yı anmayan hikâyede ABD şehir ve eyalet başlıkları baştan elenir ("us" zamir olduğu için listede yok).
    - Seçici videonun hikâyesini görür ve başka ülkenin polisini, aracını ya da yazısını reddeder.
    - Trajik satıra bar/kokteyl karesi koymaz ("pipetle beslenebildi" ≠ kokteyl pipeti).
    - Arşiv sorgusu ülkeyi ve anı taşır ("French police Paris school gate", "police" değil).
  - **Modern gazete sayfası.** CBC News ve Al Jazeera manşetleri 1900'lerin Gotik başlığı, "PRICE ONE CENT" ve okunan anlamsız sütunlarla çıkmıştı. 1990 sonrası tarih ya da bilinen bir dijital yayın artık temiz bir sayfa: sans yazı, cep ve fiyat yok, gövde metni bulanık.
  - **Açıklayıcı tahta artık bir anda kalır.** Fransa'da 4 tahta 19 sahneye yayılmıştı; ilki 24. sahneden 57'ye, yani 2,5 dakika sürdü.
    - Videoda en çok 3 tahta ve 10 tahta sahnesi.
    - 3'ten uzun bir tahta en çok 5 adım ve 6 sahne içinde kalır.
    - En çok 3 kez dönen tahta bilerek yapılmış bir geri çağırma sayılır, serbesttir (Tesla'nın "üç karar"ı).
  - Test: derin-inceleme-kurallari (14). Değişen beklentiler: docu-rhetoric, shorts-acilis, tek-render.

## 1.16.18 (20 Ekim 2026)

- **GPT kapakları** (kanal sahibi: "kapak sistemini novaya bağla gpt ile"): Hürmüz videosunda Nova'nın birleştirdiği kapak ("NO NAMES, NO PROOF?" + helikopter) %1,8 tıklandı; ChatGPT'de yazısı içinde yapılan 3 kapak ("2 TANKERS HIT / WHO MINED HORMUZ?", "IRAN: MINES IN HORMUZ?", "$10M TO CROSS HORMUZ?") YouTube A/B testine kondu. Artık paket her kapak için o tarifi yazar: sahne (hikâyenin anı, ana nesne sağda) + solda dev beyaz yoğun harfler, kalın siyah kontur, anahtar kelime sarı, isteğe bağlı küçük kırmızı etiket. OpenAI kredisi varsa hemen çizilir; yoksa işin kapak-kutusu/LISTE.txt dosyasına yazılır → ChatGPT'de üret, 01.png/02.png/03.png olarak koy, iş kartında "🖼 Kapakları yenile". Kutudaki görseller kapağın kendisidir (üstüne yazı basılmaz, motor çizmez), 1280x720 olur; üçünü Test ve karşılaştır'a yükle. Test: docu-package (GPT kapağı).
- **Tek render**: ön izleme kapısından geçen video render'dan sonra yeniden render'a girmez (Hürmüz 3 render oldu); kalite denetimi yalnızca raporlar.
- **Ön izleme her şeyi render'dan önce düzeltir**: render sonrası artık düzeltme yapılmadığı için, Hürmüz'de render sonrası bulunan sorunlar ön izlemeye taşındı. Düşük önemli görsel uyuşmazlık da render'dan önce değişir: "kuma düşen bozuk para" için Bitcoin jetonu, deniz sigortası için "HOME INSURANCE POLICY", "gemi adı açıklanmadı" derken adı okunan tanker. Arşiv yeniden seçilir, AI görseli yeniden üretilir. Ön izleme tekrarları da yakalar: aynı resim dosyası dakikalar arayla ve 30 sn içinde aynı kare. Kural render sonrası denetimle aynı fonksiyon (nearRepeats/farRepeats). Test: tek-render.
- **Derin inceleme dersleri** (20 Ekim: 27 uzun video, 12 Short, metinleri, kesmeleri, izleyicinin en çok tekrar izlediği anlar; rapor `quality-review/deep-study-20261019/RAPOR.md`):
  - **İlk cümlede saatiyle bir AN serbest.** 4,1 milyon izlenen Nepal açıklayıcısı "At 37 minutes past 8… a mountain… came apart" diye açılıyor. Kuru tarih başlığı ("October fifth, 1989.") yine yasak; kurgu karnesi de ikisini ayırıyor.
  - **Haber sesinde ilk şahısla dürüstlük çerçevesi.** Örnek: "I'm going to keep three things separate… When I'm not sure, I'll say so." Videoda en çok 2-3 "I". Atıf yerine belirsizlik bu çerçeveyle ayrılır.
- **Kendi verimiz (Hürmüz, ilk 7 saat)**: uzun video 5:04/13:46 izlendi (yeni mimariyle izleyici tutuluyor), önerilenlerin %45'i büyük İran savaşı videolarının yanından; "$10 Million to Cross Once" Short'u kanalın en hızlısı (%115 izlendi) → Shorts planlayıcıya "fiyat + neden" dersi, başlık/kapak istemine şifreli kapak dersi.

## 1.16.17 (19 Ekim 2026)

Yeni mimarinin (son okuma + ön izleme kapısı) ilk gerçek işi: Hürmüz'de mayına çarpan tankerler gündem videosu (konuyu gündem radarı seçti, 13 dk 45 sn + 2 Shorts). Ön izleme render'dan önce 2 tur, 170 kare bakıp 28 bulgu düzeltti; ama video yine iki kez render'a girdi ve iki sahnelik bir yama bütün videoyu yeniden çizdi. Sebepler:

- **Reddedilen fotoğraf geri gelmiyor**: Pixabay'in dosya adresi imzalı ve her aramada değişiyor (pixabay.com/get/<jeton>). "Gemi adı açıklanmadı" sahnesindeki EUROCHAMPION adlı tanker ön izlemede ve render sonrası iki kez reddedildi, ikisi de başka jetona yazıldığı için üçüncü jetonla yeniden seçildi — ikinci render bu yüzden. Ret artık tek fotoğraflık stok sayfasını (Pixabay, Pexels, Unsplash) da kaydeder; seçicinin "uygun değil" hafızası ve küme kararları da sayfayla tutulur (aynı adaylar yeniden ödenmez).
- **"Temiz resim" düzeltmesi gerçekten temizliyor**: önceki karenin üstündeki yazı sahnesinde (bg prev) bu düzeltme hiçbir şey yapmıyordu; kancadaki yazı iki ön izleme turundan ve render'dan sağ çıktı.
- **Ekrana çakılan kelimede tırnak yok**: "'mines cleared'" alıntısından kancada "CLEARED'" çakıldı. Kelime kenarındaki tek tırnak alıntı işaretidir, atılır; kelime içindeki kesme işareti (Enron'un, Iran's) kalır.
- **3 kapak**: istemin örnekleri satırları " / " ile ayırıyor ('IRAN–USA WAR / WHY SAUDI?'), doğrulayıcı "/" işaretini kelime saydı; 4 kelimelik yazı 5 sayılıp plan üç denemede reddedildi, paket tek kapaklı yedeğe düştü (kapak sahneleri boşa çizildi). Tek başına duran işaretler sayılmaz ve ekrana basılmaz; vurgulanan kelime yerinde kalır.
- **Yama yalnızca yamalanan sahneleri çizer**: ilk geçişte (props yok) atlanan eski tasarım kapısı yama/yeniden render'da ilk kez çalışıp onaylanmış videonun 14 sahnesini değiştiriyordu; iki sahnelik yama 8 parçanın hepsini yeniden çizdi (~50 dk). Ön izleme kapısının baktığı senaryoda tasarım kapısı artık çalışmaz.
- **Haber sesi izleyiciye ölçülü hitap ediyor** (kanal sahibi: "ekle"): Hürmüz senaryosu 100 kelimede 0,05 "you" (tutmuşlar ~1). Sakin haber sesi 100 kelimede ~0,5 "you" kullanır, yalnızca olayın izleyiciye dokunduğu ve neye bakacağının söylendiği yerde ("If you filled up a car this week…"); doldurma çağrı yok.
- **Üçlü izleyici çağrısı kancadan hemen sonra** (kanal sahibi: "ilk saniyelerde kanca girişinden sonra… like abone yorum 3'lü, animasyonla"): beğeni/abone ricası artık videonun ~1/3'ünde değil, 1. bölümde kanca ve vaat cümlesi biter bitmez (~15-45 sn), tek cümlede üçü birden ("Before we get into it: hit like, subscribe, and tell me in the comments what you think really happened."). Ekranda beğen (başparmak), abone ol (zil → Subscribed) ve yorum (balon) düğmeleri söylendikleri kelimede sırayla animasyonla çıkar. Kapanıştaki konuya özgü yorum sorusu yerinde kalır; salgın/felaket gibi hassas konularda yine hiç rica yok. Eleştirmen çağrının 8-90. saniyede olmasını bekler.
- Test: kaynak-kimligi, docu-rhetoric, uzun-video-elestirmen.

## 1.16.16 (14 Ekim 2026)

- **Tek render** (kanal sahibi, 18 Ekim: "tek seferde o video bitecek"): Hürmüz videosu ön izleme kapısından 2 turla geçtiği hâlde render sonrası kalite denetimi bir düzeltme turu daha açtı (2. render) ve 2 sahnelik yama bütün videoyu baştan çizdi (3. render). Ön izleme kapısından geçen video artık render'dan sonra bir daha render'a girmez: kalite denetimi yalnızca raporlar. (Eski davranış: docuAutoFix "always".)

Tutmuş kanalların kurgusu (kanal sahibi: "tüm tutmuş videolara bak, anlatımını ve videonun işleyişini araştır"): tarih/gündem/finans nişlerinde 18 tutmuş uzun video ve 3 Shorts'un ilk 60 saniyesi 2 saniyede bir kare kare incelendi (Business Casual, Zimbabwe hiperenflasyonu, Why Is Japan So Rich, Bronze Age Collapse, Year 536, Dollar Shave Club, KFC, Wendover, CaspianReport, PolyMatter…), 38 transkript okundu; kendi dört videomuz (El Niño, Hastings, Suudi–Husi, Macaristan 1956) aynı ölçümle karşılaştırıldı.

- **Dünyanın her yeri haritada**: dört videomuzda HİÇ harita yoktu; tutmuşlar ilk dakikada 1-3 harita gösteriyor. Sebep: motor yalnızca elle çizilmiş dört bölgeyi biliyordu; Suudi–Husi'de yazar Sana, Hudeyde, Cizan, Yanbu için 3 harita yazmış, üçü de "bilinmeyen harita bölgesi" diye atılmıştı. Artık region "world": Natural Earth verisiyle (kamu malı, docu-engine/lib/data) her ülke ve şehir; çerçeve yerlere göre gerçek şekilde kurulur, kıyılar, sınırlar ve anlatımda geçen ülkeler boyanıp etiketlenir, pin ve rota eskisi gibi. Elle çizilmiş bölgeye sığmayan yer kendiliğinden dünya haritasına geçer; anlatımda geçmeyen bir yer bütün haritayı değil yalnızca kendini düşürür. Ülke etiketi pinin üstüne binmez, boyalı ülkede kamera ülkeyi komşularıyla tutar (docu-engine/lib/world-map.mjs, src/geo.ts regionOf).
- **Haritalı anlatım sekmesi (Epik Tarih altında, "SON GÜNCELLEME")** — kanal sahibi: "sadece haritalı videolar üretmek tuhaf olabilir, tarih kanalının altında sekme olmalı". Sekme seçilince yazar her yeri haritaya koyar (ilk 90 sn'de en az bir, videoda 3-5) ve harita güvencesi çalışır; Klasik'te harita yalnızca yer hikâyenin parçasıysa gelir. Dünya haritası, tempo, yankı yazısı ve kurgu karnesi her videoda geçerli.
- **Harita güvencesi (yalnızca Haritalı anlatım)**: yazar ve yönetmen haritayı unutsa da videoda en az 2-3 harita olur — anlatımda ülke adı geçen sade bir sahne (kanca, isim kartı, cihaz değil) dünya haritasına döner, ülke boyanır; önce ilk 2 dakika, sonra bölümlere yayılır. Ad tuzakları elenir ("Michael Jordan", "turkey", "LET US GO").
- **Anlatım temposu**: tutmuşlar dakikada ~165 kelime konuşuyor, bizimkiler 106-124 (El Niño'da her satırın sonunda ~0,8 sn sessizlik). Ses kaydedildikten sonra (kayıtlı sesler de, yeniden ödenmez) satır içindeki 0,42 sn'den uzun duraklar 0,3 sn'ye iner, satır başı/sonu boşluğu kırpılır, hâlâ yavaş satır en çok 1,15x okunur (ses tonu korunur); kelime zamanları sesle birlikte kayar, sayaçlar ve kesmeler kelimesinde kalır. [slowly]/[whispers] gibi bilinçli yavaş satırlar hızlanmaz. Sahne süresi artık yazarın tahmininde değil sesinde biter (El Niño'da 34 sn ölü süre), satır sonu nefesleri kısaldı (bölüm sonu 1,4 sn kalır). Ayar: o.pace=false kapatır (docu-engine/lib/pace.mjs).
- **Ekran yazısı bilgidir**: tutmuşlarda yazı sayı etiketi, isim+unvan, yer, tarih, liste; bizde sahnelerin %24-30'u yazı kartıydı ("CHARTS", "CROWN"). Bilgi taşımayan yankı yazısı artık yalnızca zirvede (enerji 4-5) ve en az 30 sn arayla; kalanı temiz, tam ekran görüntü. Sanat yönetmeni modeli yankıyı geri açamaz.
- **Yazar dersleri** (growth-lessons.js editGrowthLines): yer = harita, yazı = bilgi, hikâyenin tamamı erken tek grafikte, gerçek kanıt, somut ve sayılı bölüm başlıkları ("The $4,500 Ad"), akıcı 12-20 kelimelik cümleler.
- **Kurgu karnesi**: render başlamadan günlüğe tempo, harita sayısı, yazı kartı ve küçük fotoğraf payı tutmuşların hedefleriyle yazılır (eski El Niño: 105 kelime/dk, 0 harita, %30 yazı kartı).
- **Kanal verisi (Studio, 15 Ekim) ve küçük kanal patlamaları**: aynı kanalda aynı kalitedeki videolar arasında 100 kat fark konu + kapakta. Kapak yazısı artık konuyu tek başına tanıtır ve tek merak bırakır ("IRAN–USA WAR / WHY SAUDI?" 172 bin; bizim "NO. THEN: WE MAY" 14 izlenme); şifreli parça yasak; ülkeler arası kriz = bayraklı harita, ünlü = yüzü, yer = sahnenin kendisi. Başlık istemi kendi verimizi görür (olayın adı + sayı %4,9; jargon sorusu %0,8). Her Short kendi etiketleriyle gelir (#shorts + kanal + konu; başka videonun etiketi atılır — El Niño Short'u veba etiketleriyle çıkmıştı). Karne 14 dk'yı aşan filmi uyarır (en iyi tutanlar 11-13 dk).
- **Kapak sahneleri (ChatGPT/OpenAI)** — kanal verisi: ana sayfa %1,3, önerilenler %2,9 tıklanıyor; önerilenlerden gelen izleyici 4:29 izliyor (içerik tutuyor, tıklanma tutmuyor). Paket planı her video için 2 kapak sahnesi tarifi yazar (hikâyenin en dramatik anı: mühürlü kapı ve bir insan, bayraklı kriz haritası, kritik andaki makine). OpenAI görsel kredisi varsa hemen çizilir ve kapaklar sahneyle kurulur; yoksa tarifler işin kapak-kutusu/LISTE.txt dosyasına yazılır — ChatGPT'de üretip 01.png/02.png olarak koy, iş kartındaki "🖼 Kapakları yenile" kapakları ve başlıkları o sahnelerle yeniden kurar (POST /api/jobs/:id/package). Yazıyı Nova basar.
- Test: tutmus-kurgu.

Küçük kanal patlamaları (16 Ekim, aynı sürüme eklendi; kanal sahibi: "hepsi .16'nın içinde olsun"). 100-10 bin aboneli kanalların bu ay 58 bin-3,5 milyon izlenen 18 videosu: 15 açılış transkripti kelime kelime, ilk 2 dakikaları indirilip 2 sn'de bir kare (quality-review/breakout-study-20261016). Sonuç: patlamayı kurgu tekniği açıklamıyor; görsel diller tamamen farklı (çöp adam çizgi film, hayvan alegorisi, 3D maket, siyah-beyaz arşiv, AI sinematik, sunucu+grafik), kesme hızı 2 dakikada 9-48 (ortanca ~29, bizimkiyle aynı bant). Ortak olan: konu + seri şablonu, açılış, kanal kimliği, bilgi taşıyan yazı, bayraklı harita, gerçek kanıt.

- **Seri şablonu**: patlayan küçük kanalların hepsi TEK bir başlık şablonunu seri olarak kullanıyor ("Myths That Turned Out To Be True" Kelevin 1.820 abone / 3,5 milyon; "All N Stereotypes Explained" Well. 87 abone / her videosu 117-619 bin) ve sık atıyor; 10-20 videoda biri patlıyor. Nova'nın konu fikirleri artık 2 seri × 4 bölüm gelir (her kartta "Seri: …"); "Bunu üret" seriyi forma taşır, formda elle de yazılır (Seri alanı). İşin serisi varsa yazar başlığı o kalıpta kurar, paket 5 başlıktan en az 2'sini şablonun birebir kalıbında yazar. Seri yoksa senaryo önbelleği eskisi gibi.
- **Açılış (yazar)**: sahnenin ortasında, şimdiki zamanda açılış ("The gun is deserted… Then an 18-year-old climbs up to that gun."); kanıt sesiyle açılış (gerçek alıntı + kaynağı); yaygın inanışı yıkmak ("Start with what you already know… Almost none of that is true."); 30-45 sn'de üç parçalı açık vaat ("By the end of this video, you'll know…"). Haberde: herkesin izlediği büyük hikâyeden küçük olaya ("America is fighting Iran. So why are missiles from Yemen heading towards Saudi Arabia?") + "First, a quick orientation"; taze ve tarihli ("On Thursday, the stock dropped 21%").
- **Gerçek haber görüntüsü**: manşet sahnesi araştırmadaki makaleyle (aynı gazete, başlık kelimeleri, yıl) eşleşirse Nova sayfayı görünmez bir pencerede açar, çerez/abonelik katmanlarını ve sabit çubukları kaldırır, sayfanın kendi başlığı manşetle örtüşüyorsa çeker; anlatımdaki sayı makalede geçiyorsa o cümle, geçmiyorsa başlık sarıyla vurgulanır; sahne o görüntünün tam ekran fotoğrafı olur, altında kaynak ve tarih. Denendi: Al Jazeera "Iran threatens Gulf data centres" makalesi, "More than 90 percent of data capacity… under the Red Sea" cümlesi vurgulu. Anlatım "Globes yazdı" derken Fortune'un makalesi gösterilmez (gazete eşleşmesi şart); açılmayan sayfa (CNBC robot engeli) çizilmiş manşetle kalır, bir daha denenmez. Görüntüler işin klasöründe saklanır; yama render eski videoyu değiştirmez. Yalnızca masaüstü uygulamada (src/pipeline/article-shots.js).
- **Bayraklı harita**: modern hikâyede (sahne ya da senaryo dönemi 1992 ve sonrası) boyanan ülke kendi bayrağıyla çizilir, ülke sınırına kırpılır (flag-icons 7.5.0, MIT, docu-engine/public/flags; işe yalnızca kullanılan bayraklar kopyalanır). 1066, 1942, 1956 gibi eski hikâyede renkle boyanır; Batı Sahra, Somaliland, K. Kıbrıs gibi tartışmalı yerlerde bayrak yok.
- **Büyük dikey/kare fotoğraf tam ekran**: son üç filmde (Kızıldeniz, AI balonu, Black Buck) 16-23 fotoğraf sahnesi bulanık zemin üstünde küçük kart oldu; çoğu küçük değildi (2160x2880, 2560x2528), yalnızca dikey olduğu için bütün gösteriliyordu. 16:9 kesimi en çok 1,35 kat büyütme isteyen dikey/kare fotoğraf artık öznesine odaklı tam ekran; küçükler, panorama, dikey klip ve belge/tarama bütün kalır.
- **Kanal köşe damgası**: Ayarlar → Kanal adları (Tarih/Gündem/Finans); ad videonun sağ üst köşesinde küçük ve yarı saydam, yalnızca resim sahnelerinde; harita, belge, grafik ve bölüm kartında kenara çekilir. Boş bırakılan kanalda damga yok; ad işe ilk render'da yazılır (sonraki render ve yama aynı damgayı kullanır, damgasız eski videoya eklenmez).
- **Okuma hızı**: Ayarlar → Okuma hızı (varsayılan 1,1x). Yeni sesler ElevenLabs'in kendi hızıyla okunur (anlatıcılarımız ~115-125 kelime/dk, patlamalar ~157 ortanca); önceden ödenmiş sesler yeniden ödenmez (hız önbellek anahtarında değil), tempo düzeltmesi onları hızlandırmaya devam eder; fısıltı/yavaş yönlendirmeli satır 1,0x; model hız ayarını kabul etmezse satır hızsız yeniden istenir.
- **Anlatım sesi** (15 patlamanın tam transkripti baştan sona, bizim son 8 senaryomuzla aynı ölçüyle). Patlamalar: cümle ortalaması 14,7 kelime, kısa cümle %29, dakikada 0,3 soru, izleyiciye "you" 100 kelimede 1,0. Biz: 8,9 kelime, kısa %48, 0,8 soru, "you" 0,2. Bizim anlatım kesik ve sürekli teaser soran bir "fragman sesi"ydi (Black Buck'ta "Whether it mattered was another question" 3 kez, "one code word" 5 kez geçiyor). Patlayanlar tek bir sesle konuşmuyor; beş farklı ses var:
  - **Belgesel hikâye:** Hidden History, Frontline, Last Life, Base Central.
  - **Sunuculu açıklayıcı:** Iron Circuit, Statrys, Nolan.
  - **Kanıt / soruşturma:** Wrongly Assumed, Militopia, Vlad.
  - **Sakin haber:** Inside Decoded.
  - **Esprili:** Kelevin, MonkeyExplains, Well.

  Hiçbiri bizim fragman sesimiz değil. Yazar artık:
  - Ortak kurallarla yazıyor:
    - Akan cümle (ortalama 11-16 kelime, aksiyonda kısa seri; yarım cümle ve yapay duraklama yok).
    - Videoda en çok 4-6 soru; aynı teaser kalıbı en çok bir kez.
    - Kişiyi tek akılda kalan ayrıntıyla tanıtmak.
    - Az ama tutulan sayı.
    - Her bölümde 1-2 gündelik benzetme.
    - Tema cümlesini erken ekip sonda ödemek.
    - Tartışmalı yerde iki tarafı vermek.
  - Kanalın kendi sesiyle yazıyor:
    - **Tarih:** belgesel hikâye ve kanıt. Üçüncü şahıs, ölçülü "you", kaynağın kendi sözü, tek vaka, itiraz.
    - **Gündem:** sakin haber. Her iddianın dayanağı ("That supports the fact of the strike. It does not prove…"), espri yok.
    - **Finans ve bilim:** sunuculu açıklayıcı. Sohbet eden "you", dürüst ayar (What's real / claimed / unknown), tipik kişiyle hesap, hakkını vermek, ölçülü "I".
  - Açık döngü ve bölüm sonu kuralları, yazarı her bölümü teaser sorusuyla bitirmeye itiyordu; yumuşatıldı.
  - Kurgu karnesi anlatımı ölçüyor. Hedef olan yalnızca bütün seslerin ortak paydası: cümle ortalaması ≥10,5 ve soru ≤0,9/dk. Gerçek metinlerde patlayanların 15/17'si temiz, bizim son 8 videonun 8'i hedef dışı. Kısa cümle oranı ve "you" sese bağlı olduğu için yalnızca yazılıyor.
- **Orta ve son** (15 patlamanın tam transkripti + 8'inin ortası ve son 2 dakikası kare kare, tarayıcıdan): 15'in 7'si sonda açılış sorusuna açıkça döndü. Yazar artık orta noktada vaadi bir kez hatırlatır ("And remember the question we started with? Here's where the story gets real."). Son bölüm cevabı işaretleyerek verir ("So, back to the question we started with…"), açılıştaki somut şeyi yeni anlamıyla tekrar eder, efsaneyi gerçekle tartar, yorum sorusunu iki seçenekli sorar. Haber ve finans "What to watch next" ile 2-3 tarihli işaretle biter, izleyici çağrısını o güncellemeye bağlar. Seride, serinin devam ettiği söylenir. Ortada karar anı seçenek şemasıyla (flow) verilir, bilinmeyen açıkça bilinmeyen kalır, tez bir kez ekranda yazılır.
- **Kapanış açılışa döner**: son sakin kapanış fotoğrafı, son satır açılışla bağlıysa ilk dakikadaki gerçek arşiv fotoğrafına döner ve künyesi de onunla gelir (Hidden History açılıştaki kadetle, Inside Decoded açılıştaki haritayla, Base Central açılıştaki videoyla bitiyor). Kalite denetimi bunu tekrar saymaz; yama eski videoyu değiştirmez.
- **Yazar dersleri**: bugünün ülkeler arası krizi bayraklı haritayla; küçük sayılabilir sayı nesneyle (icons: "FIVE SHELLS LEFT", "MORE THAN 300 MEN"); manşet sahnesi araştırmadaki makalenin kendi başlığı ve sitesiyle (ekran görüntüsü için).
- Test: patlayan-kanallar.

Kamera arkası yok (16 Ekim, kurulumdan sonra kurulu uygulamaya uygulandı; kanalın 1.16.15 videolarının Studio verisi ve transkriptleri):

- **Araştırma dosyası anlatıma sızmıyor:** Super El Niño'da anlatıcı izleyiciye "These figures were not in our original research file. They were flagged for checking before broadcast.", "The brief for this video names a 2026 Hormuz shock." okudu; ortalama izleme 22,5 sn (%2). Kızıldeniz'de "Our sources still cannot say." geçiyordu. Yazar artık kamera arkasını anlatmıyor ve doğrulanamayan bilgiyi hiç yazmıyor. Bu ifadeleri taşıyan yeni bölüm denetimden geçmiyor ve yeniden yazdırılıyor.
- **Ölçülü atıf:** Suudi–Husi'de cümlelerin %12'si kaynak atfıydı; patlayanlarda en çok %6,6, çoğunda %0-1,5. Gündem kuralı artık "her iddia atfedilir" demiyor: kaynak yalnızca merkezdeki tartışmalı iddiada söyleniyor (bölümde en çok 2 kez), tarih farkı ve kaynak çekişmesi anlatılmıyor.
- **Gündemde tarih en çok 60-90 saniye:** veba videosu 2. dakikada 1338'e gitti, izleyici tam orada çıktı. En çok bir emsal veriliyor, sonra bugüne dönülüyor.
- **Okunuş:** yeni bölümlerde kuruşlu para yazıyla açılıyor ("$109.29" → "109 dollars and 29 cents"; eskiden "$1929" okundu), kısaltılmış birim de ("21 mi" → "21 miles"; "$2bn" → "$2 billion"). Sayaç ve grafik sahnelerine dokunulmuyor; önbellekteki bölümler ve ödenmiş sesler değişmiyor. Yazara ayrıca yabancı yer adına iyelik eki eklememesi söyleniyor ("Ankara's" → "Anchora's" okunmuştu).
- **Karne:** kaynak atfı (hedef ≤%7) ve kamera arkası cümlesi (hedef 0) ölçülüyor. Gerçek senaryolarda El Niño (6 cümle), Suudi (%12) ve Kızıldeniz hedef dışı; Panama temiz.
- **Süre:** 19 dakikalık videolar "Detaylı" (12 dk) ayarıyla üretilmişti; fazla süre yavaş okumadan geliyordu. 1.16.16'nın tempo düzeltmesi ve 1,1x okuma hızı bunu çözüyor; karne 14 dakikayı aşınca uyarıyor.
- **Tarih az, bağlaç çok:** ikinci dış analiz ve ölçüm. Bizde dakikada 2,5-5,4 tarih geçiyordu (El Niño 4,8, Bakker 3,9: 14 dakikada 26 tarih), patlayanlarda 0-1,6. Videolarımızın yarısı ilk cümleye tarihle başlıyordu ("October fifth, 1989…"). Yazar artık dakikada en çok ~2 tarih kullanıyor, olayları bağlaçla bağlıyor ve ilk cümlede tarih kullanmıyor (yıl 2-3. cümlede). Gündem yapısındaki "saat saat" maddesi kaldırıldı. Karne tarih yoğunluğunu ve ilk cümleyi ölçüyor; patlayanların hiçbiri hedefi aşmıyor, Panama temiz.
- **Biyografi ve arka plan dökümü yok:** ilk 2 dakikada geçmiş en çok 20 saniye ve yalnızca ana olayı açıklıyorsa. Vaat edilen cevabın ilk parçası 30. saniyeden önce geliyor (Napolyon videosu 22. saniyede Tilsit Antlaşması'na gitmişti). Ana omurgaya hizmet etmeyen yan hayat ayrıntısı girmiyor.
- **Tarihte dramatik kesinlik:** Cannae videosu akademik makale gibiydi ("The surviving account does not let us measure…"). Olay artık sahnede ve insanlarla anlatılıyor; kaynağın sınırı videoda en çok bir kez ve tek cümle.
- **Bilinmeyen = gizem:** kesinleşmeyen şey "bilmiyoruz" diye frenlenmiyor, olgulardan kurulmuş açık bir soruya çevriliyor ("Moscow calls it pneumonia. So why lock sixty staff inside the building?"). Cevap uydurulmuyor.
- **Paketli uygulama açılış hatası:** ilk 1.16.16 kurulumu açılmıyordu, pencerede "Error" görünüyordu. `docu-edit-director.js` harita kodunu "../../docu-engine/…" yoluyla, app.asar'ın içinde arıyordu; oysa motor paketin dışında, resources/docu-engine altında duruyor. `docu-design-gate.js`'teki zaman çizelgesi içe aktarması da aynı hatayı taşıyordu. İkisi de artık paketli yolu önce deniyor. Test (paket-yollari) kaynakta motora göreli yoldan içe aktarma olursa kırılıyor. Ders: kurulumdan önce paketlenmiş uygulamanın sunucusu ayrıca denenmeli.
- Test: kamera-arkasi, paket-yollari.

Shorts kancası — ilk 3 saniye (16 Ekim, aynı sürüme eklendi; kanal sahibinin getirdiği ders: Shorts'larının ve başka kanalların ilk 3 saniyesini tek tek inceleyen, kalanların oranı %73,8'e çıkan bir üretici). Shorts'u kimse seçmez, akışta önüne çıkar; iş kaydıran parmağı durdurmak. Kanca iki parça: söylenen cümle ve ilk kare aynı anda vurur.

- **Beş açılış kalıbı** (planlayıcı her Short'ta birini seçer, opening.pattern; ikisi birleşebilir): sonuç başta + "How?", ters köşe (yalnızca videonun kanıtladığı), garip ama anlaşılır tek görüntü ve ona işaret eden cümle, izleyicinin sorusu (cevap saklanır ama mutlaka verilir), karşılaştırma (A'nın resmi, B'nin resmi, "Which one…?"). Konuyu söyleyen düz cümle kuralı (1.16.15, kanal verisi) her kalıpta geçerli.
- **Ekran yazısı kanıt verir**: opening.screen en çok 4 kelime, ilk kareden açılış sonuna kadar üstte; cümleyi tekrar ediyorsa ya da 4 kelimeyi aşıyorsa atılır ("söz merak ettirir, yazı kanıt verir": "None of these accounts are real." + "538K IN 7 DAYS").
- **Ters köşede "değil" çakılır**: kalıp ters köşe ise açılıştaki olumsuzluk kelimesi (ISN'T, NOT, NEVER…) söylendiği an ekrana çakılır.
- **İlk saniye hareket eder**: tek cümlelik açılışın resmi 2,5-3. saniye yerine 1,2. saniyede yakına kesilir (açılış resmi en az 2 sn ise); sonraki resimler eskisi gibi %55'te.
- **3-10. saniye ve yasaklar**: açılıştan sonraki ilk vuruş vaadin ilk parçasını verir; selam, logo, "in this video I'll show you" yok; ilk kare hikâyenin en çarpıcı gerçek görüntüsü.
- **Yeni Short başka kalıpla açılır**: aynı videonun önceki Short'larının kalıbı planlayıcıya söylenir.
- **🔁 Yalnızca açılışı değiştir** (Short kartı): Studio'da kaydırıp geçen oranı kötüyse içerik değil ilk 3 saniye değişir — aynı vuruşlar kelimesi kelimesine korunur (resimleri yeniden seçilir), yalnızca açılış başka kalıpla yeniden yazılır (POST /api/jobs/:id/shorts {"reopen": "short-…"}). Kartta açılış kalıbı ve ekran yazısı görünür.
- Test: shorts-kanca.

### Kanala özel ses (16 Ekim 2026, 36 kanallı otomasyon kanalcısının podcast'i: "Brian 40.000 kanalda")
- **Kendi seslerin listede**: ElevenLabs Voice Design / klon sesleri v4 doğrulaması taşımadığı için listede hiç görünmüyordu; artık en üstte ve kanalıyla: "🏛 Tarih kanalının sesi — The Last Entry · sana özel ses · başka hiçbir kanalda yok". v4'te okudukları denendi (etiketli satır, 1,1x, zaman damgası).
- **Ayarlar → KANAL SESLERİ**: tarih/gündem/finans için ses açılır listeden seçilir (★ sana özel önce); stüdyoda stil seçilince o ses kendiliğinden gelir. Yalnızca yeni işler; eski işin sesi değişmez.
- **Yaygın kütüphane sesine uyarı**: 20 binden çok klonlanan kütüphane anlatıcısının yanında "⚠ çok yaygın".
- Test: kanal-sesi.

### Grafik etiketi senaryoyu durdurmuyor (16 Ekim 2026, Ebola gündem videosu)
- Yazar kurallarında grafiğin from/to'su eksen etiketi ("Aug", "2014"), şemada sayıydı: yazar etiket yazınca bölüm üç denemede de reddedildi ve iş senaryoda durdu. Artık şema ikisini de kabul ediyor; grafikte etiket metin kalır, sayaçta "9,144" / "~4,400+" sayıya çevrilir, sayıya çevrilemeyen sayaç yazara düzeltme olarak döner.
- Test: sahne-uclari.

### Son okuma: Nova senaryoyu render'dan önce kendisi okuyor (17 Ekim 2026, Ebola gündem videosu)
Ebola senaryosunu render'dan önce elle okuyup 10 düzeltme yaptık; kullanıcı: "Nova bunları kendi de görebilmeli". Hepsi standart akışta:
- **Son okuma (editör)**: bölüm yazarı kendi bölümünü görür, bu okuma bütün videoyu. Hantal cümle, mantık hatası ("a vaccine needs nobody's trust"), adil olmayan kıyas (70.000 doz ↔ 5 milyon yerinden edilmiş), art arda anlatılan olgu (Kenya yolculuğu 3 kez), tek ikincil kaynakta geçen isim, yanlış kesinlik, boşta kalan "Until then", konuya uymayan ton. Model satır önerir, kod denetler: yeni sayı ve olgu eklenemez, harita/grafik/manşet/başlık değişmez, sayaç sayısını söylemeye devam eder, açılış ve kapanış silinmez, kelime hedefi korunur. Kayıt: iş klasöründe `son-okuma.json`; aynı senaryo yeniden kurulursa okuma bedava tekrarlanır. Okuma çökerse senaryo olduğu gibi devam eder.
- **Yaklaşık + kesin sayı**: "about 81,124" → "about 81,000" (more than → aşağı, nearly → yukarı; çok uzaksa "more than"); ekran yazısı da.
- **Hassas konu**: salgın, felaket, toplu ölüm konusunda beğeni/abone istenmez (yerinden edilmiş insanlardan hemen sonra "…a like helps" geldi); yazana geri döner, eleştirmen "çağrı yok" demez; kapanıştaki yorum sorusu kalır. Savaş tarihi bu kapsamda değil.
- **Aynı alıntı en çok iki kez**: açılış ve kapanış kalır, ortadaki tekrarlar çıkar (DSÖ cümlesi üç kez okunuyordu).
- **Yazı kartı ≤ %15**: fazlası varsa kendi resmi olan, sayı ve vurgu taşımayan açıklama kartları fotoğrafa çevrilir (Ebola %20'ydi; elle seçilen 9 karttan 8'ini aynı seçiyor).
- Yazar kurallarına: adil kıyas, isim yalnızca iyi kaynaklıysa, mantık ve bağlar, art arda tekrar yok.
- Test: son-okuma (+ docu-mode çağrı sayıları son okumayı içeriyor).

### Ön izleme kapısı: hatalar render'dan önce yakalanıp düzeltiliyor (17 Ekim 2026, Ebola ilk render'ı)
75 dakikalık render'dan sonra kalite denetimi 25 sorun buldu ve düzeltme bir saatlik ikinci render istedi. Kullanıcı: "görsel seçimi falan herşey önceden belli olsun, render kısmında bunlar fark edilmesin".
- **Yeni akış**: motor hazırlık modunda görselleri, sesi ve zamanlamayı hazırlar (render yok, hepsi render için önbellekte) → her sahnenin oturmuş anından bir kare çizilir → render sonrası denetimin AYNI görme denetimi (tek ortak fonksiyon, judgeFrames) → uymayan arşiv yeniden seçilir, uymayan AI görseli anlatımla güçlendirilmiş istemle yeniden üretilir, taşan yazı sadeleşir → en çok iki tur → tek render. Kareler ve raporlar iş klasöründe `on-izleme/`.
- **Tek son hazırlık**: elle sahne düzeltmeleri, izleyici düğmesi, açılış/doruk hareketi, makale görüntüsü, kapanış dönüşü ve kanal damgası artık ilk geçişte, ön izleme turlarında ve render sonrası düzeltmede aynı adımdan geçiyor (render sonrası düzeltme bunları atlıyordu; daha çok parça yeniden render ediliyordu).
- **Kare çizimi hızlı**: senaryo kare başına değil bir kez gönderiliyor, kompozisyon bir kez seçiliyor; haritaların bayrakları da karelere gidiyor.
- **Kök sebepler**:
  - Harita: yazarın "Democratic Republic of the Congo"su 28 karakter sınırına takılıp düşüyordu (açılış haritası Kongo'suz, Uganda ve Kenya bayraklı) — tam adla denetlenip "DR Congo" diye saklanıyor; tek başına "Congo" = DR Kongo (Brazzaville geçmiyorsa).
  - Sayaç: "9,144 confirmed cases and 4,410 deaths" → "9,144 CONFIRMED CASES AND" yazıyor, 4,410'u hiç göstermiyordu; "and" ile bağlanan iki rakam iki madde, etiket bağlaçla bitmez ("between 5 and 10" tek sayı kalır).
  - Arşiv seçici: karede okunan yazı (başka haber akan TV, "COVID" yazan şişe) ve görünen coğrafya (Orta Afrika anlatılırken Alp köyü) da kanıt; çelişen aday seçilmez.
- Test: on-izleme.

## 1.16.15 (14 Ekim 2026)

- **Tutmuş videoların açılış kalıbı yazarın içinde** (38 çıkıntı videonun altyazısı kelime kelime okundu): uzun video ilk cümlede TEK SOMUT ŞEYLE açılır ("This is a $100 trillion bank note from Zimbabwe"), 20 sn içinde çelişki, 30 sn içinde soru açıkça sorulur, her büyük sayı tanıdık ölçüye bağlanır ("closer to Chicago than to Moscow"), dil sade ve konuşur gibi; kutsal kitap ve 1. bölüm yazarı bunu görür. Shorts: özne + uç iddia + sayı, "So what happened?", sayılı 3-5 olgu ve mekanizma, ironik son (growth-lessons.js hookGrowthLines/shortGrowthLines). Test: shorts-acilis.

- **Nova tek başına** (kanal sahibi: "senin kredin bitince oradan video çıkaracağız"): (1) AI görsel kredisi bitince iş ChatGPT kutusunda beklemez — eksik görseller Wikimedia Commons'tan gerçek, serbest lisanslı fotoğrafla doldurulur: Claude anlatımdan aramalar yazar, lisans/boyut süzgeci, görme modeli satıra uyanı seçer ya da reddeder, atıf künyeye yazılır, motor yeniden çalışır (src/pipeline/inbox-commons.js). Kutuyu bilerek seçtiysen (docuImageProvider: manual) eskisi gibi bekler. (2) YouTube paketi çökerse 30 sn sonra bir kez daha denenir. (3) Video bitince docuAutoShorts kadar (varsayılan 2, 0-3) Short kendi kapağı ve başlığıyla, her biri farklı açıdan kendiliğinden üretilir. Test: nova-tek-basina.

- **Yama render** (El Niño haberi: 3:36'daki tek yanlış sayı kartı için motor değiştiği için 2 saatlik baştan render gerekecekti): bitmiş videoda hatalı sahneler POST /api/jobs/:id/patch {"scenes":[38]} ile düzeltilir — yalnızca o sahnelere dokunan parçalar yeni motorla çizilir, diğer parçalar ve ses son render'ın dosyalarından aynen alınır (içerik anahtarı motor kodundan bağımsız, chunks/last-render.json). Bu yüzden render parçaları artık temiz videoda da saklanır (keepChunks:false siler). Test: yama-render.
- **Ekrandaki sayılar render'dan önce günlükte**: her sayaç ve sayı dizisi basılacağı haliyle yazılır ("sahne 82: 110 million dollars · 4.9 million people"), yanlış bir sayı render beklenmeden görülür. Test: yama-render.

- **Sayı dizisi yanlış satırı sayı listesi sanmaz** (El Niño haberi, 3:36): "On 9 October … Niño 3.4 average of 29.70 degrees" satırı "9 OCTOBER / 3.4 AVERAGE OF 2970" oldu, sahnenin asıl sayısı 29,7 kayboldu. Artık ay adıyla söylenen gün (tarih) ve bir adın parçası olan sayı (Niño 3.4, Boeing 737) diziye girmez, etiket başka bir sayı taşımaz ve dizi ancak sahnenin kendi sayısı da içindeyse kullanılır; değilse normal sayaç. Test: sesle-uyum.

- **Büyüme dersleri Nova'nın içinde** (kanal sahibi: "tutmuşlar gibi çıkarmalıyız, kendi edit sistemimizle"): üç kanalımızın Studio verisi ve tarih/gündem/finans nişlerinde ~30 kanalın çıkıntı videoları (kanal ortancasının 2,5-68 katı) src/pipeline/growth-lessons.js'te. Formül: ÜNLÜ bir isim ya da yer + TEK şaşırtıcı, somut açı. Senaryo kutsal kitabı başlığı ve ilk 15 saniyeyi buna göre kurar (az bilinen konu ünlü bir şeye bağlanır); Nova'nın konu önerileri (/api/ideas) gerçek örneklerle bu formülde ve İngilizce başlıkla gelir, her fikir "neden tutar" diye gerekçelenir; paket ve Shorts başlıkları aynı örnekleri görür. Test: shorts-acilis.

- **Aynı videonun ikinci Shorts'u yeni açıdan** (kanal verisi: izlenmenin ~%80'i Shorts'tan): bir videodan yeni Shorts istenince önceki Shorts'ların başlığı ve açılış cümlesi planlayıcıya verilir; yeni olan başka bir an, kişi ya da sayı, başka bir açılış ve ilk resimle gelir. Test: shorts-acilis.
- **Başlıklar konunun aranan adını taşır** (uzun videolar izleniyor ama tıklanmıyor: Panama 5:54 ortalama, 1929 %64; net adlı başlıklar %5 CTR, belirsizler %1,3-2): 5 başlıktan en az 4'ü kişinin, yerin ya da olayın YouTube'da aranacak adını ilk 45 karakterde taşır; önerilen kapakla eşleşen başlık hikâyeyi hiç duymamış birine anlaşılır. Test: shorts-acilis.

- **Shorts açılışı konuyu açıkça söyler** (kanal verisi, 14 Ekim: Suudi–Husi Shorts'unda izleyicinin ~%40'ı ilk 12 sn'de gitti; kanal sahibi: "boş boş vuruculuk oluyor, adam konuyu anlamıyor, one death ne bilmiyor"): "One airport. Eight countries. And two words." gibi şifreli üçlü yerine açılış artık 10-20 kelimelik TEK düz cümle: kim/ne, nerede/ne zaman ve ne pahasına ("In 1066, England's king won the battle of his life, and nineteen days later he was dead."). Ekrana en fazla bir kelime çakılır: kilit sayı ya da isim. Test: shorts-acilis.

## 1.16.14 (14 Ekim 2026)

- **Sayılar sesle sırayla gelir** (kanal sahibi: "sayılar anlatılıyor, ardışık o anda ekranda adamın dediği gibi sıralanmalı, sesle uyumlu olmalı"): bir sayaç satırında iki ya da daha çok sayı söyleniyorsa ("324 targets. 100 aircraft.", "Four Saudis. Two Bangladeshis. One each from Jordan…") sayaç tek sayı yerine **sayı dizisi** olur: her sayı, ardından gelen kelimelerle (TARGETS, AIRCRAFT, SAUDIS…) tam söylendiği kelimede belirir, öncekiler ekranda soluk kalır; sahne ilk sayının söylendiği an başlar, sarsıntı/vuruş yoktur. Yıllar sayı dizisi sayılmaz. Bar grafikte her öğe söylenme SIRASIYLA bulunur ("one … one … one" artık üç ayrı "one"a düşer) ve etiketi kendi sözcüğü söylenmeden görünmez. Test: sesle-uyum.
- **Her yere vuruculuk kesildi** (kanal sahibi: "heryere vuruculuğu kesip tam uyumlu editler koymamız lazım"): slam kelime kartı ~3 dakikada bir, aralarında en az 90 sn (eskiden 1,5 dk / 45 sn); hikâye vuruş sesleri (bölüm kartı, slam, montaj kancası) birbirine 20 sn'den yakın çalmaz, bölüm kartı vuruşu daha yumuşak; ekranın vuruşta zıplaması, sarsılması ve renk ayrışması yarıya indi; anahtar kelime kartı artık neredeyse hiç sarsmaz; flaş/sarsıntı/zoom efekti video başına yarı yarıya (ağır konularda flaş 2, sarsıntı 1); yazar bölüm başına tek vurucu kalıp alır ve onu yalnızca gerçek bir dönüm noktası varsa kullanır. Test: sesle-uyum.
- **Shorts açılışı kaybolmaz** (Suudi–Husi Short): üç parçaya bölünmeyen açılış ("In September: no. In October: we may.") sesiyle birlikte sessizce atılıyordu; artık tek vuruş olarak kalır. Planlayıcının açılışa seçtiği GERÇEK fotoğraf, anlatımı konunun adını anan başka bir resimle değiştirilmez (Suudi jetleri yerine ABD donanma jeti geliyordu). Test: shorts-acilis.

- **Yazıyla yazılmış sayı sayı sayılır** (Banco Master): sayaç sahnesinin from/to alanları "41,000,000,000" gibi metin olarak geldi; şema reddetti, aynı bölüm 3 kez ücretli onarıma gitti (bir kez iş tamamen durdu). Şemanın yalnızca sayı istediği yerde net bir sayı metni (binlik virgülleri, tek ondalık nokta) sayıya çevrilir; "1,5", "R$ 41bn", "about 300" gibi belirsizler metin kalır ve hata vermeye devam eder. Test: gece-dersleri.
- **Ara planlar tek seferde istenir** (Suudi–Husi haberi): 6 sn'yi aşan satırın iki ara planından ikincisi ancak birincisi kutuya konunca isteniyordu — aynı satır işi iki kez durdurdu. ChatGPT kutusunda satırın bütün ara planları bir kerede listelenir; tahmini süre 4,5 sn'yi geçen satıra ikinci ara plan da baştan istenir (tahmin gerçek okumadan kısa kalıyordu: 5,4 sn sanılan satır 6,3 sn okundu). Test: ara-plan-kutusu.

## 1.16.13 (11 Ekim 2026)

- **AI tavanı yazara baştan söylenir** (Macar Devrimi): tavan yalnızca doğrulamadaydı; bölümler 10, 6, 4 AI sahnesiyle gelip her biri ayrı ücretli Opus onarım turu yedi. Bölüm istemi artık "bu bölümde EN FAZLA N sahne source ai" der. Banco Master işi bu yüzden durmuştu (bölüm 3 denemede de 4 AI sahnesiyle geldi). Test: gece-dersleri.
- **Commons katalogu konunun kendi kategorisini tarar** (Macar Devrimi): "Hungarian Revolution of 1956" kategorisinde 1.000'den fazla Fortepan fotoğrafı var, ama anahtar kelime araması anıtları ve bugünkü Budapeşte'yi getirdi, 39 sahne AI'a düştü (elle 42 sahneye gerçek 1956 fotoğrafı atandı: 57 → 99 gerçek görsel). Artık ilk sorguların Commons kategorisi bulunur ve deepcategory ile alt kategorileriyle taranır. Türkçe yazılmış araştırma dosyasından gelen bozuk sorgular ("DOĞRULANMAMIŞ", "Bölüm", "Sovyet", "Nagy'ın") ayıklanır. Katalog sürümü 3. Test: commons-dizi.

## 1.16.12 (11 Ekim 2026)

Hastings 1066 videosunun teslimi sırasında görülen her eksik.

- **Seçim kutusu** (arşiv seçicisinin kredisi bitince iş durmaz): seçici (OpenAI/Claude görme) kota/kredi hatası verince kalan aday kümeleri `secim-kutusu/kumeler/<küme>.jpg` kontak sayfaları olarak yazılır, `LISTE.txt` hangi sahne için olduklarını söyler, `SECIMLER.txt`'ye aday numarası yazılır ("= 3", hiçbiri için "= 0", video ızgarasında "= 3/2"), "Kaldığı yerden devam et" yanıtları okur. Bulunan görseller korunur, yanıtlanan küme bir daha ücretli seçiciye sorulmaz. Hastings'te bu iş elle betikle yapıldı (112 küme, 115 gerçek görsel). Ayar: docuManualPick=false kapatır. Test: docu-archive (seçim kutusu).
- **Kartlar "aynı kare" sayılmaz**: kalite denetiminin dHash tekrarı, aynı koyu zeminde kart olarak duran iki FARKLI fotoğrafı (British Museum Great Court / Aelfgyva paneli) eşleştirdi; sahte tekrar otomatik düzeltmeyi tetikledi ve bitmiş arşiv geçişi kaybedildi. Kart sunumlu ya da kare/şerit oranlı görseller dosyasıyla yargılanır. Test: gece-dersleri.
- **Açıklama 5.000 karakteri aşmaz**: 43 zorunlu atıf "yalnızca zorunlular" kipinde bile 20.197 karakter yapıyordu. Son kip: lisans başına tek satır ("CC BY-SA 3.0 (Wikimedia Commons): "Başlık" (yazar); …"), hiçbir zorunlu atıf düşmez; yazar alanına yazılmış uzun yeniden-kullanım notları yazarın adına iner. Hastings: 3.401 karakter. Test: gece-dersleri.
- **Dönem dışı nesne yok**: 1066 için üretilen "mum ışığında harita" görselinde pirinç bir dürbün vardı. Sahnenin dönemi artık o yıl henüz olmayan şeyleri görsel isteğine yazar (1608 öncesi dürbün, 1500 öncesi saat, 1450 öncesi basılı kitap/harita, 1290 öncesi gözlük, 1330 öncesi top/tüfek…). Yalnızca istek metninde — önbellek anahtarı değişmez, eski görseller korunur. ChatGPT görsel kutusu listesi de bunu taşır. Test: gece-dersleri.

- **Shorts kapağı** (kanal sahibi: "shortsların da kapaklarını yapmalısın"): her Short kendi dikey 1080x1920 kapağını alır — kanca fotoğrafı (hikâyenin gerçek görseli) öznesinden 9:16 kesilir, Short'un görünümünde (yazı tipi, ana renk) 2-3 kısa satır: ilk satır büyük ve renkli ("159,903", "7.7"), alt kısım koyulaşır. Satırları planlayıcı yazar (`cover`, satır başı ≤12 harf, korku kelimesi yok); yoksa kanca cümlesi ikiye bölünür. Kapak videonun **ilk karesi** de olur (1/30 sn, ses kaydırılır) — YouTube uygulamasında kapak olarak seçilebilir. Telefon kaydının siyah yan şeridi otomatik kırpılır, kaynak etiketi kalır. Kapak çizilemezse Short bozulmaz, yalnızca uyarı yazılır. `short-<zaman>-cover.jpg`, meta.cover.
- **Telefon görüntüsü ekrana sığar** (kanal sahibi, Panama Short: "bazı görüntüler ekrana sığmıyor telefon falan… ölçek önemli"): 428x854'lük görgü tanığı klipleri 9:16'ya kesilip 2,5 kat büyütülüyordu — kaynağın siyah şeritleri ve yuvarlak köşeleri görünüyor, "BAY VIEW" "Y VIEW" oluyor, görüntü yumuşuyordu. Artık görgü tanığı klibi, ekrandan dar dikey görsel (ekran görüntüsü) ve doldurunca 2,2 kattan fazla büyüyecek küçük dikey görsel **bütün olarak** gösterilir: kendi siyah şeritleri kırpılır (cropdetect, klibin kendi penceresinde), kart olarak üstten 70 px aşağıda durur (etiketi kanca yazısının üstünde kalır), arkasında kendi bulanık ve koyulaştırılmış kopyası. Yatay ve büyük görseller eskisi gibi ekranı doldurur. Test: telefon-olcek.
- **Commons dizisi** (Hastings): Bayeux Duvar Halısı'nın 58 sahnesi Commons'ta tek tek numarasıyla var, ama katalog konunun ilk 20 sonucunu alıyordu — senarist yalnızca 6 sahneyi adıyla yazabildi, kalan Halı sahnelerine seçici hep aynı 6 kareyi sundu (elle 39 panel atandı). Artık bir sorgunun sonuçlarında numaralı bir dizi görülünce ("Scene 23", "Plate 8", "folio 12") dizi ayrıca 50 sonuçla aranır ve katalog tavanını 60 parça aşabilir; senariste "her sahneye kendi numaralı parçası" kuralı verilir. 3,2:1'den uzun şeritler (64000x1464 panoramalar) katalogdan çıkar — 2560 px'e indirilince 16:9 karede bulanık bir şerit oluyorlardı. Katalog sürümü 2 (yeni işlerde yeniden taranır). Test: commons-dizi.
- **Başarısız düzeltme turu geri alınır** (Hastings): otomatik düzeltme 2 sahneyi yeniden seçmek için bitmiş arşiv geçişini sildi, seçici 0 kredide hemen durdu, çıkarken render parçaları da silindi — kanca düzeltmesi tam 2 saatlik render demek oldu. Artık tur başarısız olursa arşiv geçişi, seçici önbelleği ve düzeltme kaydı tur öncesine döner; render parçaları sonraki düzeltme için saklanır. Test: duzeltme-geri-al.
- **Ara planlar ChatGPT kutusunda unutulmaz** (Hastings): görseller kutudan gelirken ara planlar seslendirmeden SONRA planlanıyordu; 6 ara plan görseli kutuya yazıldı ama istenmedi, render onlarsız sürdü — kancada üç 5-7 sn'lik kare kesilmeden kaldı. Artık aynı satırlar tahmini sürelerle (dakikada ~156 kelime) ilk ChatGPT listesine girer; sesten sonra yine eksik kalan olursa render bekler (ses kayıtlı, yeniden ödenmez). Test: ara-plan-kutusu.

## 1.16.11 (10 Ekim 2026)

Kanalın gerçek YouTube verisi (kitle tutma, trafik kaynakları, YouTube'un önerileri), Bakker ve Panama videolarının kare kare incelenmesi. Bulunan her eksik kurala dönüştü.

- **Uzun video eleştirmeni** (kanal sahibi: "Nova benden iyi çıkarmalı"): Bakker'ı şaheser yapan v1→v2 incelemesi artık Nova'nın içinde.
  - *Zaman çizelgesi katmanı (ücretsiz, kare kaçırmaz)*: 10 dk altı video, kancada 5 sn'den uzun kesilmeyen kare, gerçek görselle açılmayan video, 15 sn'den uzun aynı kare (önceki-kare zinciri dahil), beğeni çağrısının yeri/sayısı, kapanış yorum sorusu, son 20 sn'de yazılı kart (bitiş ekranı), ilk 2 dakikada AI oranı, okunmadan kaybolan yazı.
  - *Göz katmanı (Opus 5.5)*: izleyicinin gittiği yere göre bakar — ilk 60 sn saniyede bir kare, 1-6. dakika her sahneden 2 kare, her bölüm geçişinin ilk saniyesi. Yeni hata türleri: yanlış yüz, kancada jenerik kare, yüzün üstünde yazı, göze batan AI görseli.
  - *Düzelt ve yeniden bak*: yeniden seçilebilen sahneler değiştirilir, yalnızca değişen parçalar render edilir, video yeniden denetlenir — en çok 2 tur (Ayarlar: docuAutoFixRounds).
  - *Uzun bekleyen kare*: 8 sn ve üstü sakin fotoğraf satırına da ara plan gelir (önce yalnızca doruk ve kanca satırlarına geliyordu).
- **Hastings dersleri (orta çağ, İngilizce)**: yazar artık bölüm başına AI görseli tavanını kendisi denetler (videoda ~15; tavanı aşan bölüm gerçek arşiv/stok/önceki-kare ile yeniden yazılır — motor fazlasını önceki fotoğrafa düşürüp uzun bekleyen kareler yaratıyordu). Kurgu yönetmeni büyük harfli İngilizce etiketleri ("WILLIAM", "TOSTIG") artık anlatımda bulur (I harfi Türkçe kuralla ı'ya dönüp her İngilizce pano/split/alıntı etiketini "senaryoda yok" diye reddettiriyordu). 1000-1099 yılları da yıl sayılır (1066'lı zaman çizelgesi hep reddediliyordu).
- **Opus her yerde**: bölüm metinleri (anlatımın kendisi) Opus 5.5 ile yazılır (Sonnet'ti); gerçek kişi/olay fotoğrafını Opus 5.5 seçer, stok görüntüyü Sonnet 5.5 (Haiku 4.5 kaldırıldı); OpenAI seçicisi fotoğrafları 512 px yerine tam çözünürlükte görür. Stok seçici, anlatılanı gösteren kareyi jenerik "atmosfer" karesine tercih eder.

- **Kanca**: ilk 3 sn videonun en çarpıcı GERÇEK görüntüsü + en sert cümlesi; ilk 10 sn'de fısıltı/yavaş açılış yok; ilk 30 sn'de her sahne tek kısa cümle. Kancadaki düşük çözünürlüklü gerçek görüntü küçük kutu yerine tam ekrana büyütülür.
- **İzleyici çağrısı**: beğeni/abone ricası videonun ~1/3'ünde, bir açığa çıkışın hemen ardından (asla ilk 60 sn'de değil); kapanışta tartışmalı tek bir yorum sorusu. Ekranda **animasyonlu düğme**: anlatıcı "like" dediği anda başparmak basılır, "subscribe" derse abone düğmesi SUBSCRIBED olur, "comments" deyince yorum balonu çıkar; ~2,4 sn sonra kaybolur. Shorts'ta bitiş kartının ardından LIKE • SUBSCRIBE etiketi.
- **YouTube'un önerileri**: açıklamanın ilk iki satırında aranan kavramlar (olayın adı, yıl, kişi/yer adları); paket kontrol listesi: 3 kapak "Test ve karşılaştır", Short'un "İlgili video"su, bitiş ekranı, oynatma listesi, kitle tutmayı reklam hariç ölç.
- **Sayılar**: ekranda "7.6" artık "76" olmaz (ondalık nokta ve binlik virgül korunur); "45×" ve "80+" gibi değerler dönen sayaca çevrilir (sayı kartı söylenene kadar boş kalmıyordu); sayaç kendi görüntüsünün üstüne çizilir (Panama'nın 7.7'si Kolombiya enkazının üstündeydi); uzun satırdaki sayaç açık kâğıt zemine düşmez.
- **Arşiv**: hikâyede geçmeyen ülkenin stok klibi elenir (Panama videosuna Hindistan bayraklı bir klip girmişti); senaryonun adıyla istediği Commons dosyası split ve sayaç sahnelerine de gelir (AI'a düşüyordu); "window" kelimesi artık Kling hareketini tetiklemez.
- **Render öncesi uyarılar**: aynı görselin uzak sahnelerde tekrarı ve aynı resmin art arda uzun süre (3+ sahne / 15+ sn) ekranda kalması kalite uyarısı olarak bildirilir.
- **Kapak yedeği**: isim kartı başka birini gösteren portre kapağa konmaz (Bakker kapağında Falwell'in yüzü vardı).
- **Shorts — kanca görseli konunun kendisi**: Short'un ilk karesi başlıktaki kişinin/yerin GERÇEK fotoğrafı; açılışın üç karesine, gerçeği varken AI ya da jenerik stok (para sayan eller, koridor) girmez (Bakker Short'u stok paralar ve AI otel kulesiyle açılıyordu). Planlayıcı her görselin kaynağını görür (REAL / STOCK / AI). Arşivde konunun gerçek fotoğrafı azsa Commons'tan adıyla aranır (lisans kontrollü). Short'ta görünen ve atıf isteyen (CC BY) her fotoğrafın künyesi Short açıklamasına yazılır (Tammy Faye'nin CC BY 2.0 fotoğrafı künyesiz çıkıyordu).
- **Shorts — gerçek fotoğraf kaybolmaz**: görüntü modeli bir fotoğrafı tanımlayamazsa gerçek fotoğraf Commons adıyla katalogda kalır (Bakker'da 11 gerçek fotoğraf sessizce düşmüştü). 720 px'ten kısa fotoğraf dikeyde lekeli olur, plana girmez. 1987 gibi renkli dönem hikâyesinde renkli fotoğraf artık "günümüz" sayılmaz (Tammy Faye ve Reagan–Falwell atılıyordu).
- **Shorts — görgü tanığı klibinin kaynak etiketi korunur**: dikey kırpma klibin en üstünden başlar (etiket kesilmez), üstteki konu etiketi de o klibin üstünde kaynak etiketinin altına iner (Panama Short'unda "PANAMA'S 7.7 EARTHQUAKE" Ada Monzon etiketinin üstüne biniyordu). ChatGPT görselleri (cg-) AI, elle eklenen gerçek klipler (real-) gerçek sayılır.
- **Shorts — yazı titremesi giderildi**: kesimler 30 fps kare ızgarasına oturur, çakılan kelime kendi görselinin ilk karesinde gelir ve bir sonraki görselden önce biter (FOREVER bir kare koridorda, bir kare NIGHTS'ın üstünde görünüp sonraki fotoğrafın üstünde sönüyordu). Üst etiket büyüyerek değil belirerek gelir (büyürken iki satıra kırılıp tek satıra zıplıyordu); rakam ve bitiş kartı satırları elle kırılır. Yüzün üstündeki çakma kelime alt üçte bire iner (gözlerin üstüne oturuyordu).

## 1.16.10 (6 Ekim 2026)

Beş büyük kanalın (MagnatesMedia, LEMMiNO, Johnny Harris, ColdFusion, Moon) kurgusu saniye saniye incelendi; bulunanlar.

- **Kanca geri geldi**: haber ve finans artık her seferinde düz "durum özeti"yle açılmıyor (o giriş "slam, gizem yok" diyordu ve kancaları köreltti). İlk aday çarpıcı ama net girişler arasında döner; yeni **fragman merdiveni** açılışı: gerçek bir an ya da söz → konu adıyla → "bu, X'in hikâyesi" → 2-3 büyüyen fragman. Hikâye bir insanla ve onu tanıtan tuhaf bir ayrıntıyla başlar.
- **Ekrandaki sayı = söylenen sayı**: anlatıcı "nearly two hundred" derken sayaç 189 göstermez; söylenen rakama eşitlenir ve o kelimeye oturur.
- **Açılış hızlı kesilir**: ilk 45 saniyedeki resim satırlarına da ara plan gelir (en çok 3) — büyük kanallar açılışta 1,5 saniyede bir kesiyor.
- **Doruk hareketi**: açılıştan sonra en gergin iki AI karesi de hareket eder (Kling 2.5 Turbo 720p, klip başı 1,5 birim; Ayarlar: docuClimaxMotionMax, 0 = kapalı).
- **Görsel ton**: Commons katalogu kanıt içindir (kişi, belge, olay); atmosfer satırları hikâyenin tonunda üretilir. Karanlık hikâyeye parlak turist fotoğrafı yok.
- **Shorts — zoom kesme**: 2,8 sn'den uzun fotoğraf ikiye bölünür, ikinci yarısı konuya yakın sert bir kesme; yeni görsel gerekmeden tempo neredeyse iki katı. Altyazı ve rakamlar kelimelerinde kalır.
- **Shorts planı**: gerçek fotoğraf kanıt için, ruh için tonunda atmosfer.

## 1.16.9 (6 Ekim 2026)

Yom Kippur videosunun yolu (kanal sahibi: "mükemmel olmuş") Nova'nın kendi yolu oldu.

- **Commons katalogu**: gerçek hikâyede senaryo yazılmadan önce konunun Wikimedia Commons arşivi taranır (araştırmadaki kişi, yer, operasyon adları; ücretsiz). Lisansı uygun, en az ~900 px dosyalar listelenir; her bölümün yazarı kendi konusuna en yakın dosyaları görür ve sahnelere ADIYLA seçer. Uydurma dosya adı yok, bulamadığı kareyi AI'a bırakmak yok.
- **Tarih belgeseli kalıbı** (Epik Tarih): saatiyle ve tarihiyle açılış ("Saat ikiyi gösterirken, 6 Ekim 1973'te…"), kişi ilk göründüğünde rolü ve yıllarıyla isim kartı, yeni yere/güne geçen fotoğrafa "YER · TARİH" basılı etiket, iki tarafın gücü ve bedel için bar grafik, kritik günler için zaman çizelgesi, bir gerçek alıntı, açılıştaki tarihe dönen kapanış.
- **Varsayılan süre 12 dk** (Detaylı): uzun video kısa çıkmasın; 8 dk altında reklam arası da konamıyordu.
- **İsim kartında yüz**: arşiv seçicisi kişinin yüzünün fotoğraftaki yerini bildirir, kamera oraya yönelir (Sadat'ın fotoğrafı başının üstüne kırpılmıştı).
- **Tek sayı = sayaç**: "22,325 tons" gibi tek sayılık kart boş zeminde kalmaz; söylendiği anda sayan sayaca döner, altına ilgili fotoğraf gelir.
- **Ara planlar kolaj görünümlerinde de görünür**: ara planlı satır tam kadraj çizilir; panoda kalacak küçük baskıya ara plan üretilmez (parası ödenip görünmüyordu).
- **Kalite denetimi**: aynı fotoğraf dosyası dakikalar arayla yeniden kullanılırsa yakalanır (Nvidia'da Nasdaq fotoğrafı beş kez); isim kartında yüzün kadrajda olup olmadığına da bakılır.
- **Kanal sesleri**: stil seçilince kanalın sesi gelir — Epik Tarih Brian, Gündem David Castlemore, Finans Michael C. Vincent (Ayarlar: docuStyleVoices). Gündem radarından gelen konu da haber sesini ve uzun süreyi alır.
- **Shorts hareketi**: Kling bir resmi (tank, silah) "risk control" diye reddederse hareket hakkı sıradaki uygun cümleye geçer; açılış hareketsiz kalmaz.
- **Reklam dostu kapak**: korku/salgın iddiası yok ("IT NEVER LEFT" reddedilmişti), tarafsız merak ("WHAT HAPPENED?", "100 IN. 7 OUT."); yazı resimle tutarlı.

## 1.16.8 (6 Ekim 2026)

Dört uzun video + dört Shorts'tan (Hürmüz, Irkutsk, Yom Kippur, Nvidia) öğrenilenler: önce gerçek görsel, temiz ekran, çeşitli vurgu.

- **Adıyla Commons**: senarist bir sahneye tam Wikimedia Commons dosya adını yazabilir (`commons: "File:..."`). Dosya arama ve ücretli seçici olmadan, lisansı kontrol edilerek doğrudan alınır; yoksa ya da lisansı uygun değilse sahne her zamanki aramasına döner. Güncel olaylarda (ABD Donanması/DVIDS, hükümet, ajans, NASA) ve ünlü tarihî fotoğraflarda doğru kare budur. Aynı dosya iki sahneye verilmez (Yom Kippur'da kanal geçişi fotoğrafı üç kez tekrar ediyordu).
- **Wikimedia indirmeleri**: eski User-Agent her upload.wikimedia.org isteğinde 429 alıyordu; artık başvuru adresli UA, 429'da site başına ortak soğuma, 5xx/ağ hatasında geri çekilerek yeniden deneme.
- **Görselsiz kart süresi**: grafik, sayı, açıklayıcı şema, arayüz kartı en fazla ~18 sn anlatım taşır. Daha uzun satırda kurgu yönetmeni cihazı reddeder, konu planı şemayı atlar; satır fotoğrafıyla kalır (Irkutsk'ta üç maddelik şema boş karede 28 sn durmuştu).
- **Finans görünümü**: ekranı tarayan sarı şerit, köşe çerçeveleri ve sahte REC/VOL göstergesi kaldırıldı; 1980 sonrası hikâyelerde dönem şeridi çıkmaz.
- **Açılış**: haber ve finans için "durum özeti" açılışı (konuyu ilk iki cümlede adıyla söyler, kanca konunun kendi en güçlü gerçeğidir) ilk aday; haber/finansta slam parçalı açılış önerilmez.
- **Vurgu çeşitliliği**: 69 vurgu cihazı (her bölüme 2, videodan videoya döner) ve izleyiciye **tek** çağrı (beğen/abone) — videoda yalnızca bir kez, başta ya da sonda; 50 farklı çağrı kalıbı.
- **Shorts: önce gerçek görsel**: planın en az üçte ikisi gerçek fotoğraf; AI oranı üçte biri aşarsa uyarı. Ledger görünümü neon yeşil yerine kehribar.
- **Shorts: keskin kare**: dikey kare görselin tam yüksekliğinden kesildiği için 720 px'ten kısa Commons dosyası kullanılmaz (550 px'lik 1973 taraması 6 kat büyüyordu); planlayıcıya ~1500 px dosya seçmesi söylenir.
- **Shorts: konuya yakın kesim**: büyük bir resimde küçük kalan konu (gece çekiminin altındaki Kremlin) tam yükseklik yerine konuya yakın kesilir, en az 1400 px (en çok ~1.4 kat büyütme). Üçte ikisi boş gökyüzü olan kareler bitti.
- **Shorts: yüzde rakam yok**: büyük rakam (1992, $96.2B) yakın portrede yüzün üstüne düşmesin diye planlayıcı o cümlede rakam yazmaz.

## 1.16.7 (6 Ekim 2026)

Model düzeni: kurgu Opus, araştırma GPT 6.1, görsel analiz gpt-6-luna.

- **Model düzeni**: yaratıcı iş (hikâye planı, konu kimliği, sanat ve kurgu yönetmeni, paket) **Opus 5.5**; araştırma, SEO ve gündem radarı **GPT 6.1** (gpt-6.1-sol); görsel analiz (arşiv fotoğrafı seçimi, dönem denetimi, kalite denetimi, tasarım kapısı, kapak kontrolü, Shorts resimleri) **gpt-6-luna**. OpenAI hata verirse ya da bakiye biterse iş Claude'a devredilir, video durmaz.
- **Senarist seçimi** (Ayarlar → SENARİST): Opus 5.5 (plan Opus, bölümler Sonnet) ya da GPT 6.1 (plan ve bölümler GPT).
- **Tek kare kuralı**: AI görselleri artık asla kolaj/ızgara olmaz (Kara Ölüm'de görsel dil cümlesi yüzünden 17 kare uydurma arşiv fotoğrafı kolajı çıkmıştı). Senarist de görsel dili tek bir karenin görünümü olarak yazar.
- **Açılış hareketi**: başlık sahnesi de canlanabilir; "snowy, foggy, cracks" gibi kelime türevleri tanınır (Kara Ölüm açılışı hiç hareket etmemişti).
- **Ses: kısık ton bütçesi**: anlatıcının varsayılan sesi net ve güçlü; kısık/fısıltı/yavaş tonlar satırların en fazla %15'inde (açılış, bölüm sonları, ifşa), asla art arda değil, fısıltı filmde bir kez. Kara Ölüm'de satırların %42'si kısık okunmuştu.
- **Giriş mantığı kataloğu**: 50 farklı giriş (sahne + vaat, tek soru, sondan başla, çelişki, kuru gerçek, belge, tanık, harita, slam...). Senarist konunun tonuna uyan, kanalda son kullanılmamış 6 aday arasından seçer; ciddi haber ve trajedide şok kelimeli giriş önerilmez. Bağımsız Shorts da girişini katalogdan döndürür.
- **ChatGPT görsel kutusu** (Ayarlar → AI GÖRSELLERİ → "ChatGPT'de elle"): API kredisi harcamadan; eksik görseller işin klasöründe gorsel-kutusu/LISTE.txt'e hazır ChatGPT mesajlarıyla yazılır, 01.png, 02.png… bırakılınca "Kaldığı yerden devam et" onları alır. OpenAI bakiyesi biterse kendiliğinden kutuya geçer.
- **Araştırma**: 2026 web arama aracında yanlış "kaynak alınamadı" uyarısı giderildi, kaynak kayıtları yazılır; haber araştırması ölçeği (izole/karantina sayıları, kapanan kurumların tam listesi) ve kurumların olaya özel açıklamalarını ister.

## 1.16.6 (5 Ekim 2026)

Kling 3 ile hareket, Gündem radarı, haber formatı.

- **Kling (doğrudan API)**: Ayarlar → KLING API. Anahtar varsa resimden video Replicate yerine doğrudan Kling'den. **Açılış Kling 3.0 1080p** (Shorts'un ilk cümleleri, belgeselin açılış sahneleri — izleyici orada kalır ya da kaydırır); açılış dışı hareket ucuz **Kling 2.5 Turbo 720p**. Saniye başı ödenir: klip cümle kadar istenir (3 sn'lik cümleye 3-4 sn). Test düğmesi kalan birimi gösterir. Bağlantı kopsa da ödenmiş klip kaybolmaz: aynı resim + tarif bir sonraki çalıştırmada Kling'de bulunur ve indirilir.
- **Gündem radarı** (yeni sayfa): Google'ın trend aramaları + manşetler; Claude kanallara uyan, büyük, taze ve kafa karıştıran konuları seçer (başlık, açı, "asla söyleme" satırı); ilgi Nepal sel videosunun ölçeğiyle karşılaştırılır.
- **Haber açıklayıcı formatı** (Gündem çipi): soğuk açılış, doğrulanmış/doğrulanmamış ayrımı, zorunlu web araştırması.
- **Dönem sahne sahne**: yüzyıllara yayılan ya da bugüne uzanan hikâyede (Kara Ölüm 1338–2026) arşiv seçici ve dönem denetimi her sahneyi kendi yılıyla, yoksa bölümünün dönemiyle yargılar. Eskiden tek ortanca yıl ("1911") 2026 laboratuvar fotoğraflarını "dönem dışı" diye eliyordu.
- **Filigran**: Openverse'ün rawpixel önizlemeleri (soluk "rawpixel" filigranlı) artık aday olmaz.
- **Shorts altyazısı** bir miktarı bölmez ("half | a dozen" tek başına "12 hastane" okunuyordu).

## 1.16.5 (5 Ekim 2026)

Anlatım yalnızca Eleven v4 ile.

- **Sadece v4**: model seçeneği Eleven v4 ve v4 Turbo; v3 ve Multilingual v2 kaldırıldı (eski bir ayar dosyasında kalmış olsa bile v4 kullanılır). v3 ile yapılmış eski videoların önbellekteki sesleri yeniden render'da korunur.
- **Sadece v4 sesleri + Brian**: hesaptaki v2 dönemi hazır seslerden yalnızca Brian kalır (kanalın anlatıcısı, varsayılan). Liste ElevenLabs Ses Kütüphanesi'nin **v4 için doğrulanmış** belgesel/eğitim anlatıcılarını en çok kullanılandan başlayarak gösterir (İngilizce: James, Michael C. Vincent, Adam Stone, Christopher, Arabella, Ian Cartwell — gerilim ve gizem, Jon, Frederick Surrey, Declan Sage, Jane, Max — belgesel...; Türkçe: Mert Aksoy - Storyteller). ▶ sesin kendi v4 örneğini çalar; seçince hesaba eklenir. Komik/karakter/çocuk sesleri ayıklanır.
- **v4 düğmesi**: bir belgesel cümlesi o sesle, ses yönetmeninin tonlamasıyla okunur (bir kez üretilir, saklanır).
- Bağımsız Shorts panelinde anlatıcı seçimi.

## 1.16.4 (5 Ekim 2026)

Anlatım: Eleven v4 ve ses yönetmeni.

- **Eleven v4** belgesel ve Shorts anlatımının varsayılanı (Ayarlar → Anlatım sesi; v4 Turbo, v3, Multilingual v2 seçilebilir). Kelime zamanları v4'te de gelir; altyazı ve "önce söyle, sonra göster" zamanlaması aynen çalışır.
- **Ses yönetmeni** (docu-engine/lib/voice-director.mjs): her satır işlevine göre tonlanır — film alçak ve sakin açılır; vurucu kısa cümle kararlı (fısıltı değil); soru merakla; ifşa son cümleciğinden önce nefes tutar ("..."); bölüm sonu yumuşak ve yavaş; sahnenin duygusu v4'ün tarif etiketleriyle ("[low, hushed voice]", "[quiet, tense]", "[slowly, with weight]"...). Aynı renk ardışık satırlarda bir kez söylenir (her satırda etiket yapay duyulur). Yazarın kendi yönlendirmesi her zaman önce gelir.
- **İnce kararlılık**: v4'te sürekli (v3: üç sabit değer) — tehdit 0,40, ifşa 0,38, gerilim 0,42, sakin 0,55, vurucu satır 0,58; 0,35'in altına inilmez (uzun okumada kayma).
- **Satırlar arası süreklilik**: v4'te her satır önceki ve sonraki satırı bağlam olarak alır — tonlama satırdan satıra kopmaz.
- Senaryo yazarı v4'e göre yönlendirme yazar (ses efekti etiketi asla). v3 ile yapılmış videoların sesleri önbellekte kalır (v3 eskisi gibi okunur).

## 1.16.3 (5 Ekim 2026)

Hareket: Shorts'ta yapay zekâ videosu, uzun videoda gerçek stok klip.

- **Shorts hareketi (Replicate)**: Shorts'un açılış cümleleri ve uygun sahneleri durağan resim yerine gerçek ~5 sn harekete döner (varsayılan Kling 2.5 Turbo Pro; Ayarlar'dan model ve Shorts başına sahne sayısı — varsayılan 4). Klipler Shorts'un kurgusundan geçer (görünümün rengi, greni, yazıları, sayıları, sesleri). Gerçek kişi fotoğrafı ve belge asla canlandırılmaz. Replicate bakiyesi biterse Shorts düşmez: yapılmış klipler kalır, gerisi durağan.
- **Bağımsız Shorts paneli**: Kütüphane → "📱 Bağımsız Shorts": konu yaz, açılış türü/format/başlık kalıbı/görünüm seç ya da otomatik (kanal tekdüzeleşmesin diye sırayla döner). Üretilenler oynatılır; başlık, alternatifler, açıklama ve künye tek tıkla kopyalanır.
- **Commons'tan doğrudan gerçek görsel**: plan bir Wikimedia Commons dosyasını adıyla isteyebilir; lisansı doğrulanarak indirilir (seçici gerekmez). Arşiv seçimi yapılamazsa o cümleler anonim AI görseline döner.
- **Uzun video: atmosfer sahneleri önce gerçek stok klip** (Pexels, Pixabay, arşiv) arar; bulunamazsa AI resmi kalır (modern stok fotoğrafına düşmez). 1950 öncesi hikâyede yalnızca insansız doğa.
- **Uzun video açılışı**: gerçek klibi olmayan, hareket eden bir şey gösteren en çok 2 açılış resmi resimden videoya çevrilir (uygunsa; her açılışta değil).
- **2.5D derinlik katmanları artık isteğe bağlı** (varsayılan kapalı): sahne başına ücretli Replicate çağrısıydı.
- Teaser Shorts da hareketli: filmin AI resimleri ve yeni dikey resimler canlanır.

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
