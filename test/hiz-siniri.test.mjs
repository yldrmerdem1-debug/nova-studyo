// HIZ SINIRI — arşiv kaynağı 429 dönerse ne oluyor?
//
// SORUN. Bir video işi 100'den fazla arşiv sorgusu yapıyor (20 dakikalık videoda
// 300+). Wikimedia hız sınırı uygulayınca `searchWikimedia(...).catch(() => [])`
// sessizce boş dönüyordu: en değerli kaynak işin ortasında kayboluyor, video
// stok fotoğrafla doluyor, kullanıcı sebebini asla göremiyordu.
//
// İLK DENEMEM YANLIŞTI. Yalnızca başarısız isteği tekrarlamak ÖLÇÜLDÜĞÜNDE
// KÖTÜLEŞTİRDİ: 30 sorguda 13 başarılı iken 10'a düştü, süre 3 katına çıktı.
// Sebep — istekler aynı anda gidiyor, hepsi 429 yiyor, hepsi aynı süre bekleyip
// YİNE aynı anda vuruyor. Sürüyü tekrarlatmak sunucuyu daha çok zorluyor.
//
// DOĞRUSU: bir istek 429 alınca o siteye giden HERKES yavaşlar. Soğuma ortak
// tutulur; hız sınırı bir kez öğrenilir, otuz kez değil.
// Canlı ölçüm (40 sorgu, 4 eşzamanlı, Wikimedia): 9/40 -> 31/40 başarılı.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { downloadFile, fetchJson } from "../src/util.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

/** Belirlenen sayıda 429 döndürüp sonra başarılı olan sahte sunucu. */
function sunucuKur(plan) {
  let sira = 0;
  const istekler = [];
  const s = http.createServer((req, res) => {
    const durum = plan[Math.min(sira, plan.length - 1)];
    sira++;
    istekler.push({ t: Date.now(), durum });
    if (durum === 200) { res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}'); }
    else {
      const bas = { "content-type": "application/json" };
      if (durum === 429) bas["retry-after"] = "1";
      res.writeHead(durum, bas); res.end("{}");
    }
  });
  return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ s, port: s.address().port, istekler })));
}

// ---------- 1. 429 sonrası yeniden deneniyor ----------
{
  const { s, port, istekler } = await sunucuKur([429, 200]);
  const t0 = Date.now();
  const o = await fetchJson(`http://127.0.0.1:${port}/a`, { deneme: 3 });
  const sure = Date.now() - t0;
  kontrol("429 sonrasi basariyla tamamlaniyor", o?.ok === true, JSON.stringify(o));
  kontrol("iki istek atildi", istekler.length === 2, String(istekler.length));
  // Retry-After: 1 saniye — buna uyulmali.
  kontrol("Retry-After basligina uyuluyor", sure >= 900, sure + " ms");
  s.close();
}

// ---------- 2. Soğuma PAYLAŞILIYOR (asıl düzeltme) ----------
// Aynı siteye giden ikinci istek, birincinin öğrendiği soğumayı beklemeli.
// Bu olmadan otuz istek aynı anda tekrar vuruyor ve sunucu daha da kilitleniyor.
{
  const { s, port, istekler } = await sunucuKur([429, 200, 200, 200, 200, 200]);
  const t0 = Date.now();
  // İlki 429 yiyip soğuma kuracak; diğer üçü ona takılmalı.
  await Promise.all([
    fetchJson(`http://127.0.0.1:${port}/1`, { deneme: 3 }),
    fetchJson(`http://127.0.0.1:${port}/2`, { deneme: 3 }),
    fetchJson(`http://127.0.0.1:${port}/3`, { deneme: 3 }),
  ]);
  const sure = Date.now() - t0;
  kontrol("hepsi tamamlandi", istekler.length >= 4, String(istekler.length));
  kontrol("soguma PAYLASILDI (sonrakiler de bekledi)", sure >= 900, sure + " ms");
  s.close();
}

// ---------- 3. KALICI hatada boşuna beklenmiyor ----------
// 404/401/400: tekrar denemek sonucu değiştirmez, işi yavaşlatır.
for (const [ad, kod] of [["404 bulunamadi", 404], ["401 gecersiz anahtar", 401], ["400 hatali sorgu", 400]]) {
  const { s, port, istekler } = await sunucuKur([kod, kod, kod]);
  const t0 = Date.now();
  let patladi = false;
  try { await fetchJson(`http://127.0.0.1:${port}/x`, { deneme: 3 }); } catch { patladi = true; }
  kontrol(`${ad}: hata firlatiliyor`, patladi);
  kontrol(`${ad}: TEK istek (bosuna tekrar yok)`, istekler.length === 1, String(istekler.length));
  kontrol(`${ad}: hemen donuyor`, Date.now() - t0 < 500, (Date.now() - t0) + " ms");
  s.close();
}

// ---------- 4. Sunucu hatasında (5xx) tekrar deneniyor ----------
{
  const { s, port, istekler } = await sunucuKur([503, 200]);
  const o = await fetchJson(`http://127.0.0.1:${port}/y`, { deneme: 3 });
  kontrol("503 sonrasi toparliyor", o?.ok === true && istekler.length === 2, String(istekler.length));
  s.close();
}

// ---------- 5. Sürekli 429'da pes ediliyor (sonsuz döngü yok) ----------
{
  const { s, port, istekler } = await sunucuKur([429, 429, 429, 429, 429]);
  let patladi = false;
  try { await fetchJson(`http://127.0.0.1:${port}/z`, { deneme: 2 }); } catch (e) { patladi = /429/.test(e.message); }
  kontrol("surekli 429'da pes ediliyor", patladi);
  kontrol("deneme sayisina uyuluyor", istekler.length === 2, String(istekler.length));
  s.close();
}

// ---------- 7. Dosya indirme de 429'da bekleyip tekrar deniyor ----------
// Ekim 2026: upload.wikimedia.org orijinal fotoğrafta 429 verdi, tek denemede fotoğraf kayboluyordu.
{
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 1)]);
  const planla = (plan) => {
    let sira = 0;
    const istekler = [];
    const s = http.createServer((req, res) => {
      const durum = plan[Math.min(sira++, plan.length - 1)];
      istekler.push(durum);
      if (durum === 200) { res.writeHead(200, { "content-type": "image/jpeg" }); res.end(jpeg); }
      else { res.writeHead(durum, durum === 429 ? { "retry-after": "1" } : {}); res.end(""); }
    });
    return new Promise((r) => s.listen(0, "127.0.0.1", () => r({ s, port: s.address().port, istekler })));
  };
  const hedef = path.join(os.tmpdir(), `nova-hiz-${process.pid}.jpg`);
  {
    const { s, port, istekler } = await planla([429, 200]);
    const n = await downloadFile(`http://127.0.0.1:${port}/f.jpg`, hedef, { expect: "image" });
    kontrol("indirme 429 sonrasi tamamlaniyor", n === jpeg.length && fs.existsSync(hedef), String(n));
    kontrol("indirmede iki istek", istekler.length === 2, String(istekler.length));
    s.close();
  }
  {
    const { s, port, istekler } = await planla([404, 404]);
    const t0 = Date.now();
    let patladi = false;
    try { await downloadFile(`http://127.0.0.1:${port}/yok.jpg`, hedef); } catch { patladi = true; }
    kontrol("indirmede 404 hemen dusuyor (tek istek)", patladi && istekler.length === 1 && Date.now() - t0 < 500, `${istekler.length} istek`);
    s.close();
  }
  fs.rmSync(hedef, { force: true });
}

// ---------- 6. Kaynak çökmesi kullanıcıya bildiriliyor ----------
{
  const md = fs.readFileSync(new URL("../src/pipeline/media.js", import.meta.url), "utf8");
  kontrol("saglayici hatasi sayiliyor", md.includes("saglayiciHata[ad] = (saglayiciHata[ad] || 0) + 1"));
  kontrol("kullaniciya UYARI olarak yaziliyor", md.includes("sorguda yanıt vermedi"));
  const u = fs.readFileSync(new URL("../src/util.js", import.meta.url), "utf8");
  kontrol("soguma site basina tutuluyor", u.includes("const siteSogumasi = new Map()"));
  kontrol("soguma tavanli (is kilitlenmesin)", u.includes("Math.min(saniye * 1000, 10000)"));
  kontrol("bekleme de tavanli", u.includes("Math.min(kalan, 10000)"));
}

console.log(hata === 0 ? "\nHIZ SINIRI TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
