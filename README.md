# Nova Stüdyo

YouTube için uzun video ve Shorts fabrikası (Windows masaüstü uygulaması, Electron). Konu seçiminden yüklemeye hazır pakete kadar tek akış:

**araştırma → senaryo → görsel/arşiv → seslendirme → kurgu (belgesel motoru) → altyazı → render → kapak + başlık + açıklama**

Sürüm: **1.16.29**

## Neler yapar

- **Uzun belgesel videolar** (tarih, haber, finans): bölümlü senaryo, gerçek arşiv fotoğrafları (Commons vb.), harita, sayaç, zaman çizelgesi, alıntı kartları, dönem müziği.
- **Shorts**: uzun videonun teaser'ı, dikey kurgu, kendi kapağı.
- **Belgesel motoru** (`docu-engine/`): Remotion tabanlı kurgu; görünüm (look) çeşitleri, açılış türleri, ses yönetmeni, kurgu eleştirmeni.
- **Paketleme**: kapak (ChatGPT/OpenAI), başlık, açıklama, etiketler.

## Klasörler

| Klasör | İçerik |
|---|---|
| `src/` | Uygulama ve iş akışı (pipeline) kodu |
| `docu-engine/` | Belgesel kurgu/render motoru (Remotion) |
| `electron/` | Masaüstü pencere |
| `server.js` | Yerel sunucu ve API (`/api/jobs/...`) |
| `test/` | Testler (`npm test`) |
| `docs/` | Tasarım notları |
| `SURUM-NOTLARI.md` | Sürüm geçmişi |

## Kullandığı servisler (anahtarlar Ayarlar'dan girilir)

Anthropic (Claude), OpenAI (görsel), ElevenLabs (seslendirme), Kling (hareketli çekim), Replicate, fal, Higgsfield, Pexels, Pixabay, Unsplash, Europeana. Anahtarlar `data/settings.json`'da tutulur ve **asla depoya konmaz**.

## Kurulum

- **Hazır kurulum + kullanıcı verisi:** Releases sayfasındaki en yeni `yedek-...` sürümü.
- **Adım adım geri kurma:** [GERI-YUKLEME.md](GERI-YUKLEME.md)

Kaynaktan çalıştırma:

```bash
npm install
cd docu-engine && npm install && cd ..
npm start          # uygulamayı aç
npm test           # testler
npm run dist       # Windows kurulum dosyası → dist/
```
