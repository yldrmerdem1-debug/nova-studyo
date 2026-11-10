# Nova Studyo'yu sıfırdan geri kurma

Bu depo Nova Studyo'nun bütün kaynak kodudur. Büyük kullanıcı verisi (ses kütüphanesi, ayarlar, geçmiş dosyaları) ve hazır kurulum dosyası depoya değil, GitHub'daki **Releases** sayfasına konur (`yedek-...` sürümü).

## En kolay yol: hazır kurulum

1. GitHub → bu depo → **Releases** → en yeni `yedek-...` sürümü.
2. `Nova.Studyo.Setup.X.exe` dosyasını indir ve kur. Yer olarak `D:\Nova Studyo\Uygulama` seç (ya da sessiz kurulum: `"Nova Studyo Setup X.exe" /S /D=D:\Nova Studyo\Uygulama`).
3. Aynı sürümdeki `nova-veri-*.zip` parçalarını indir, `D:\Nova Studyo\data` klasörüne aç (içinde `audio-library`, `tools`, geçmiş json'ları, `settings.json` var).
4. Nova'yı aç, **Ayarlar**'dan API anahtarlarını yeniden gir (Anthropic, OpenAI, ElevenLabs, Kling, Replicate, Pexels, Pixabay, Unsplash, Europeana, Higgsfield, fal). Yedekteki `settings.json`'da anahtarlar güvenlik için boşaltıldı; diğer bütün tercihler duruyor.

## Kaynaktan kurma

Gerekenler: Node.js 22+, Git, ffmpeg (PATH'te).

```bash
git clone https://github.com/yldrmerdem1-debug/nova-studyo.git "D:/Nova Studyo/source/nova-studio"
cd "D:/Nova Studyo/source/nova-studio"
npm install
cd docu-engine && npm install && cd ..
npm test
npm run dist        # kurulum dosyası dist/ klasörüne çıkar
```

Kurulumdan sonra yukarıdaki 3. ve 4. adımlar (veri zip'i + API anahtarları) aynıdır.

## Depoda olmayanlar (kasıtlı)

- `data/jobs`, `data/shorts`, `Ciktilar`: bitmiş videolar ve iş klasörleri (yüzlerce GB). GitHub'a sığmaz.
- `data/docu-cache`: görsel/ses önbelleği; Nova gerekince yeniden üretir ya da indirir.
- `data/docu-runtime`: Remotion'un indirdiği Chrome; ilk render'da kendiliğinden iner.
- `node_modules`, `dist`: `npm install` / `npm run dist` yeniden üretir.
- API anahtarları: hiçbir zaman GitHub'a konmaz.
