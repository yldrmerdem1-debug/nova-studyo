# Editoryal kurgu uygulama planı

> İş akışı: superpowers:subagent-driven-development. Kullanıcının önceki tüm kurgu düzeltmelerini uygulama yetkisi sürüyor; yeni geri bildirim görüntülerin hâlâ slayt gibi olması. Tasarım aynı hedefi somutlaştırır. Kaynak Git deposu değildir; önceki sürüm dosya yedeği alındı.

**Hedef:** Konuya ve seslendirmeye bağlı, belirgin biçimde kurgulanmış bir video dili üretmek; yalnız fotoğraf yakınlaştırma ve altyazıyla yetinmemek.

**Mimari:** Yeni `editorial` görsel dili mevcut zamanlama, medya eşleme ve ses hattını kullanır. Ayrı `editorial-motion.js` sahne planını ve FFmpeg kompozisyonunu kurar. Tema paleti/yoğunluğu değiştirir; tarih/sayı vurguları yalnız sahnenin gerçek kelimelerinden alınır. Hareket olayları ses planına aktarılır. Mevcut işin stilini editörden değiştirmek ses/metni yeniden üretmez.

**Teknoloji:** Mevcut Node/FFmpeg. Yeni ücretli sağlayıcı veya bağımlılık yok.

## Sınırlar

- Gerçek metin, anlatım ve arşiv kaynakları korunur; yeni ücretli istek yok.
- Her sahne grafik kartına dönüşmez. Açılış, belge/veri kompozisyonu ve tam ekran görüntü dengelenir.
- Altyazı alt güvenli alanı açık kalır; metinler kanvasa sığdırılır. 16:9, 9:16, 1:1 desteklenir.
- SFX kapalı/0 ayarı geçerlidir. Kısa ses geçişleri seçili hareket olaylarına bağlıdır; sürekli uğultu eklenmez.
- Eski çıktı ilk inceleme için korunur. Gerçek pilot ve yeni videolar yeni stili seçebilir.
- Görsel kalite iddiası test sayısıyla kanıtlanmaz; yeni gerçek örnek kareleri incelenir ve video sunulur.

## Görevler

- [x] Root: `src/pipeline/editorial-motion.js`: `planEditorialScene({beat,text,words,title,index,profile,canvas})` saf plan ve `renderEditorialScene({st,canvas,media,plan,frames,outFile,killer,crf,gradeF})` gerçek kompozisyon. Açılışta tipografi + ayrı hareket eden görsel; belge düzeninde geniş görsel ve ince bilgi bandı; içerikte geçen sayı/tarih vurgu paneli; diğer sahnelerde tam ekran sakin görüntü. Başlık/alıntı metni uydurulmaz. Filtre kaçışları, metin sığması, kelime zamanı ve tam kare süresi test edilir.
- [x] Root: `src/config.js` yeni `editorial` stilini tanımlar; `src/pipeline/render.js` yeni dalı mevcut cümle hizasında çalıştırır ve `edit-plan.json` içine kompozisyon/olayları yazar. Yeni sahne başlangıcına ait kelime zamanları kullanılır; negatif/taşan zamanlar kırpılır. Eski modların yolu korunur.
- [x] Ses görevi: `src/pipeline/sound-design.js` için `options.editorialEvents` sözleşmesi. Olay `{beatId,event:'reveal'|'accent'|'section',start:number}`. Sınırlı, birbirine binmeyen, türe uygun yeni kısa sweep/impact sesleri; gerçek görsel olaya hizalı ve güvenli genlikte. Eski mod davranışı korunur. Gerçek WAV/FFmpeg doğrulaması.
- [x] Editör görevi: `src/pipeline/editor.js`, `public/studio-editor.js`, `public/app.js`: `visualStyle` geçerli katalog anahtarı olarak editör PATCH'e eklenir; yalnız render revizyonunu geçersizleştirir. Mevcut işte stil seçimi + kaydetme ve videoya işleme. Yeni form varsayılanı editorial; kalıcı kullanıcı form seçimi korunur. Bütçe/metin/kapak kontrolleri korunur. Hatalı/aktif iş PATCH testleri.
- [x] Root: İlk 12 saniyeyi gerçek kaynak ve sesle izole dizinde üret, yeni kompozisyonların farklı anlarını incele; taşma/çakışma varsa düzelt. Dışarıdan referans gelirse bu örneğe uygula.
- [x] Root: Tam pilot yeniden render; yeni dalı kapsayan testler ve mevcut kalite testleri; bağımsız inceleme. 1.3.0 paketle, source/asar karşılaştır, kur ve kurulu uygulamayı aç. Çıktıyı ve sınırları kullanıcıya sun.

## Kabul kanıtı

`node --test test/editorial-motion.test.mjs` gerçek FFmpeg klipleriyle plan zamanlarını ve görsel değişimi doğrular. `npm run test:quality` yeni bağımsız testleri de izole evde çalıştırır. Tam örnekte konuşma korunur, süre farkı 0,1 sn altında kalır; en az üç farklı kompozisyon kullanılır, örnek karelerde alt yazı alanı ve başlık taşması incelenir. Harici model faturası veya gerçek izleyici verisi olmadan yeni izlenme iddiası verilmez.


## Tamamlanma kaydı

7 Eylül 2026: 129/129 kalite testi; son düzeltmelerden sonra 7/7 hareket ve 1/1 üretim dalı testi. Pilot 57,4 saniye, 11 sahne, 4 düzen ve 6 ses işareti. Final SHA-256 ca8c768a83f3594dd65034927c6c7c0551f50eaede927c5d6d96ec0779c8ff71. Paket 60 dosyada kaynakla aynı; 1.3.0.0 kuruldu ve kurulu uygulama FFmpeg/4545 portu/veri eviyle doğrulandı. Teslim raporu ve kullanım kılavuzu çalışma klasöründe. Ayrıntılı ses kanıtı ../reports/live-audio-check.md.

