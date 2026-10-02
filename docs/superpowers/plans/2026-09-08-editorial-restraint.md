# Görüntü ağırlıklı kurgu uygulama planı

Kullanıcı 1.3.0 örneğindeki yinelenen yan yazı/çerçeve/yakınlaştırma düzenini reddetti; daha fazla görüntü ve sade, özenli yazı istiyor. Önceki uygulama/kurulum yetkisi sürüyor. Aynı kurgu hedefinin düzeltmesidir. Kaynak Git deposu değil; dosya yedeği alınır.

**Hedef:** Yan yazı şablonlarını kaldırmak, kaynak görüntüyü öne çıkarmak, vurgu gerektiğinde kısa metin göstermek.

**Mimari:** Yeni `editorial-shots.js` içindeki `planEditorialSequence(inputs)` tüm sahnelerin metin sıklığı ve kamera çeşitliliğini birlikte seçer. `planEditorialShot(input)` tek sahne için güvenli varsayılan sağlar. `renderEditorialShot` tam kanvas kaynak ve süreli tipografiyi işler. Eski `editorial-motion.js` v1 yardımcıları eski test/araçlar için korunur; üretim v2 modülünü kullanır. Geçiş ve seslendirme süreleri korunur; SFX yalnız kalan görsel olaylardan üretilir. Render önbelleği v2 kimliğini içerir, güncelleme eski çıktıyı yanlışlıkla geri kullanmaz.

**Teknoloji:** Node + mevcut FFmpeg; yeni bağımlılık veya ücretli üretim yok.

**Tasarım:** Her sahneyi yeni bir kart şablonuyla çeşitlendirmek tekrar hissini gidermez; tüm metni kaldırmak da anlamlı tarih vurgularını kaybettirir. Seçilen yaklaşım görüntü ağırlıklı kurgu ve seyrek, gerçek konuşmaya bağlı vurgudur. Yazı taşıyan sahneler tüm dizinin en fazla dörtte biri (yuvarlama yukarı, kısa dizide en az bir). İki yazı başlangıcı arasında en az 12 saniye. Aynı tarih/sayı tekrar gösterilmez. Giriş başlığı kısa bölüm başlığından alınır; 10 kelimeden uzun başlık sessizce parçalanmaz, atlanır. Tüm tipografi 3 saniye içinde çıkar; senaryo cümleleri dekoratif alıntıya dönüşmez. Normal sahnelerde bölüm bandı yok. Alt yazı seçimi korunur.

## Görevler

- [x] `test/editorial-restraint.test.mjs`: konuşma zamanı, 25% metin bütçesi/12 sn aralık/tekrar etmeyen sayı, tam kanvas, video hareketini koruma, belge sabit kadrajı, farklı fotoğraf hareketleri ve süreli başlık için başarısız testler yazıldı; uygulamadan sonra 8/8 geçti. Eski v1 yardımcı testleri ayrıca korunur.
- [x] `src/pipeline/editorial-shots.js`: plan ve FFmpeg kompozisyonu sadeleştirildi. Kamera seçenekleri hold/push/pull/pan-left/pan-right. Hareketli kaynak video için camera=source. Belge/harita/grafikte hold ve contain. Fotoğraflarda küçük hareket, komşu sahnede aynı otomatik hareket yok. Başlık ve sayı en fazla iki satır, alt yazı güvenli alanının üstünde; ince gölge ve kısa açılma/kapanma. Geniş siyah şerit bağımsız inceleme ardından kaldırıldı; gruplanmış tarihler aynı yıl anahtarıyla tekilleştirildi.
- [x] `src/pipeline/render.js`: sahne girdileri toplu planlayıcıya geçirildi, mevcut geçiş lead-in süresi korundu. `src/config.js` açıklaması güncellendi. `test/editorial-render.test.mjs` tam üretim dalındaki yeni planı kontrol eder; `test/render-editorial-preview.mjs` toplu planı kullanır. `index.js` önbelleğe motor sürümünü ekler. 137/137 kalite testi geçti; bağımlılık değişmedi.
- [x] Gerçek pilot kaynak/sesleriyle tam çıktı üret. Yazı kaplandıktan sonra temiz görüntü, harita/etiket kırpılması, kapanış ve alt yazı karelerini incele. Hareket ve üretim testleri, ardından kalite paketi. Bağımsız incelemedeki somut sorunları düzelt.
- [x] 1.3.1 paketle; kaynak/paket/kurulu dosya hash karşılaştırmasını yap. Kurulu uygulama ve veri evini doğrula. Önceki video ve kaynak yedeği korunsun. Yeni video ve kısa kullanım notunu teslim et.

## Kabul kanıtı

Plan testi sahne zamanına bağlı overlay bütçesini sayar; gerçek FFmpeg karesinde yazı bittikten sonra dört köşe kaynak görüntüsüdür. Etiketli belge testinde görüntü kırpılmaz. Gerçek ses/görüntü akış süre farkı 0,1 sn altında kalır. İnsan beğenisi ve izlenme sonucu test sayısından çıkarılmaz.

