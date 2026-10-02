import { safeSourceUrl, permissionUsable } from "./provenance.js";
import path from "node:path";
// GÖRSEL KÜNYESİ — videoda kullanılan eserlerin atıf listesi.
//
// NEDEN VAR:
// Wikimedia Commons ve Openverse'ten gelen görsellerin çoğu CC-BY / CC-BY-SA
// lisanslı: kullanmak serbest, ticari kullanım dahil — AMA eser sahibinin adı
// ve lisans yazılmak ZORUNDA. Uygulama bu bilgiyi hiç kaydetmiyordu, dolayısıyla
// yayınlanan her video atıfsız CC-BY görsel taşıyor olabiliyordu. Kendi kanalın
// için telif şikâyeti riski; aracı başkasına satarsan doğrudan sorumluluk.
//
// Künye EKRANA basılmaz — YouTube açıklamasına girer. Ekrana kart koymak
// izlenme süresini düşürür ve atıf için açıklama zaten yeterli sayılıyor.

// LİSANS SINIFLAMASI.
//
// Sağlayıcılar aynı lisansı farklı yazıyor: Wikimedia "CC BY 2.0" derken
// Openverse yalnızca "BY 2.0" döndürüyor (kod alanı "by"). Önce "CC" arayan
// bir desen Openverse'ün CC-BY eserlerini kaçırıyor ve onları atıfsız toplu
// satıra düşürüyordu — yani kapatmaya çalıştığım açığın ta kendisi.
// Bu yüzden ÖNCE kamu malı elenir, kalanda çıplak "BY" de atıf sayılır.

/** Atıf GEREKTİRMEYEN: kamu malı ve eşdeğerleri. */
const KAMU_MALI = /\bCC0\b|\bPDM\b|public\s*domain|kamu\s*mal/i;
/** Atıf ZORUNLU olan lisanslar — künyede tek tek anılırlar. */
const ATIF_ISTER = /\bBY\b|\bGFDL\b|\bFAL\b/i;
/** Atıf gerektirmeyen, künyede TEK SATIRDA toplanan kaynaklar. */
const TOPLU = new Set(["pexels", "pixabay", "unsplash"]);

const SAGLAYICI_ADI = {
  wikimedia: "Wikimedia Commons",
  openverse: "Openverse",
  pexels: "Pexels",
  pixabay: "Pixabay",
  unsplash: "Unsplash",
  archive: "Archive.org",
  ai: "yapay zekâ ile üretildi",
  yerel: "kendi arşivi",
};

/**
 * media.json'dan atıf listesi üret.
 *
 * @param media  beatId -> { provider, lisans, sahip, eser, sayfa, file }
 * @returns { metin, zorunlu, toplam }  metin = açıklamaya yapıştırılacak blok
 */
export function kunyeUret(media, { dil = "tr", compact = false, mandatoryOnly = false } = {}) {
  const tr = dil !== 'en';
  const records = Object.values(media || {}).filter(m => m?.file);
  const seen = new Set(), lines = [], warnings = [];
  let aiShown = false;
  let mandatory = 0;
  for (const m of records) {
    if (m.provider === 'ai') {
      if (!aiShown) lines.push(m.all
        ? (tr ? '• Tüm görseller yapay zekâ ile üretilmiştir.' : '• All visuals were generated with AI.')
        : (tr ? '• Bazı sahneler yapay zekâ ile üretilmiştir.' : '• Some scenes were generated with AI.'));
      aiShown = true;
      continue;
    }
    const key = m.sayfa || m.sourceUrl || [m.provider,m.sahip,m.eser,m.lisans].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const license = m.lisans || (tr ? 'Kullanım izni doğrulanamadı' : 'Permission not verified');
    const author = m.sahip || (tr ? 'eser sahibi belirtilmemiş' : 'author unspecified');
    const provider = SAGLAYICI_ADI[m.provider] || m.provider || '';
    const source = safeSourceUrl(m.sayfa || m.sourceUrl), licenseUrl = safeSourceUrl(m.lisansUrl), authorUrl = safeSourceUrl(m.sahipUrl);
    const publicDomain = KAMU_MALI.test(license);
    const required = ATIF_ISTER.test(license) && !publicDomain;
    const usable = permissionUsable(m);
    if (required) mandatory++;
    if (!usable) warnings.push(tr ? 'Kullanım izni doğrulanamadı: ' + (m.eser || provider) + '. Yayından önce kaynak kaydını tamamlayın.' : 'Permission not verified: ' + (m.eser || provider) + '. Complete provenance before publishing.');
    if (mandatoryOnly && !required && usable) continue;
    if (compact && publicDomain) {
      lines.push('• ' + author + ', ' + license + (source ? ': ' + source : ': ' + (m.eser || provider)));
      continue;
    }
    lines.push('• "' + (m.eser || (tr ? 'Başlıksız eser' : 'Untitled work')) + '" — ' + author + ', ' + license + ' (' + provider + ')');
    if (source) lines.push('  ' + (tr ? 'Kaynak: ' : 'Source: ') + source);
    if (licenseUrl) lines.push('  ' + (tr ? 'Lisans: ' : 'License: ') + licenseUrl);
    if (authorUrl) lines.push('  ' + (tr ? 'Eser sahibi: ' : 'Creator: ') + authorUrl);
    if (m.attribution) lines.push('  ' + m.attribution);
    if (m.modifications) lines.push('  ' + (tr ? 'Düzenleme: ' : 'Changes: ') + m.modifications);
    else lines.push('  ' + (tr ? 'Düzenleme kaydı bulunamadı; yayın öncesi kadraj/renk değişikliklerini belirtin.' : 'Changes not recorded; document crop/color edits before publication.'));
  }
  if (!lines.length) return {metin:'',zorunlu:0,toplam:records.length,warnings};
  return {metin:(tr?'Görsel kaynakları:':'Image credits:') + '\n' + lines.join('\n') + (warnings.length?'\n'+warnings.join('\n'):''),zorunlu:mandatory,toplam:records.length,warnings};
}

// ---------------------------------------------------------------------------
// MÜZİK KÜNYESİ
// ---------------------------------------------------------------------------
//
// NEDEN VAR: görsel künyesi vardı, MÜZİK künyesi hiç yoktu. YouTube Audio
// Library parçalarının bir bölümü atıf istiyor (sanatçı adı + parça adı) ve
// bu bilgi hiçbir yere yazılmıyordu — yani yayınlanan videolar atıf isteyen
// müziği atıfsız taşıyor olabilirdi. Görsel tarafında kapatılan açığın aynısı.
//
// KAYNAK DOSYA ADI. Parçalarda ID3 etiketi yok (ffprobe ile bakıldı: title,
// artist, album üçü de boş). O yüzden ad şu biçimde tutuluyor:
//
//     yatak-<rol>-<parça-adı>--<sanatçı>.mp3
//
// Çift tire BİLEREK ayırıcı: tek tire hem başlıkta hem sanatçı adında geçiyor
// ("i-need-you-dyalla" nerede bölünecek belli değil). Ayırıcı yoksa sanatçı
// UYDURULMAZ — yalnızca parça adı yazılır. Yanlış atıf, eksik atıftan kötüdür.

/** "a-dream-within-a-dream" → "A Dream Within A Dream" */
function baslikYap(slug) {
  return String(slug || "")
    .split("-").filter(Boolean)
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1))
    .join(" ");
}

/**
 * Bir yatak dosyasının adından parça ve sanatçı bilgisini çıkar.
 * @returns { parca, sanatci }  sanatci ayırıcı yoksa boş string
 */
export function muzikAdiCoz(dosya) {
  const ad = path.win32.parse(String(dosya || "")).name;
  // Baştaki "yatak-<rol>-" önekini at.
  const govde = ad.replace(/^yatak-(gerilim|notr|derin|ilham)-?/i, "");
  if (!govde) return { parca: "", sanatci: "" };
  const i = govde.indexOf("--");
  if (i < 0) return { parca: baslikYap(govde), sanatci: "" };
  return { parca: baslikYap(govde.slice(0, i)), sanatci: baslikYap(govde.slice(i + 2)) };
}

/**
 * Videoda KULLANILAN yatak parçaları için atıf bloğu üret.
 *
 * @param dosyalar kullanılan dosya adları (yinelenenler ayıklanır)
 * @returns { metin, sayi }
 */
export function muzikKunyesi(dosyalar, { dil = "tr" } = {}) {
  const tr = dil !== 'en', seen = new Set(), lines = [];
  for (const item of dosyalar || []) {
    if (!item) continue;
    const info = typeof item === 'object' ? item : {file:item};
    const filename = path.win32.basename(String(info.file || info.path || ''));
    if (!filename || seen.has(filename) || /^yatak-(gerilim|notr|derin|ilham)\.[^.]+$/i.test(filename)) continue;
    seen.add(filename);
    const guessed = muzikAdiCoz(filename);
    const title = info.title || guessed.parca, author = info.artist || guessed.sanatci;
    if (!title) continue;
    const source = safeSourceUrl(info.sourceUrl), license = safeSourceUrl(info.licenseUrl);
    lines.push('• "' + title + '"' + (author ? ' — ' + author : '') + (source ? '\n  ' + source : '\n  ' + (tr ? 'Kaynak/lisans doğrulanamadı; ad bilgisi dosya adından çıkarılmış olabilir.' : 'Origin/license not verified; names may be derived from filename.')) + (info.license ? '\n  ' + info.license : '') + (license ? '\n  ' + license : ''));
  }
  return {metin:lines.length ? (tr?'Müzik:':'Music:')+'\n'+lines.sort().join('\n') : '',sayi:lines.length};
}
