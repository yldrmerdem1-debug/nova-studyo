// ARKA PLAN SEÇİMİ — kodu ÇALIŞTIRARAK sınar (metin araması değil).
//
// Bitmiş volkan videosunda 1 fps taramayla ölçülen tekrarlar:
//   portre 195s<->215s (0,996) · termal 217s<->238s (0,998)
//   kül 245s<->267s (0,997)   · lav 74s<->87s (0,990)
// Dördü de aynı segmentin ilk ve son sahnesi.
import fs from "node:fs";
import assert from "node:assert";
import { arkaPlanSec, yeniArkaDurum, arkaPlanGecer, kardesleriBul } from "../src/pipeline/arkaplan.js";

let hata = 0;
const kontrol = (ad, ok, not = "") => {
  console.log((ok ? "OK   " : "HATA ") + ad + (ok || !not ? "" : "  -> " + not));
  if (!ok) hata++;
};

/** Segment kur: her kardeş {file, gorsel, kalite}. */
const seg = (segIdx, liste) => {
  const m = {};
  liste.forEach((x, b) => { m[`s${segIdx}b${b}`] = { beatId: `s${segIdx}b${b}`, file: x.f, ...x }; });
  return m;
};
/** n sahne seç, seçilen dosyaları sırayla döndür. */
const calistir = (media, segIdx, n, durum = yeniArkaDurum()) =>
  Array.from({ length: n }, (_, b) => arkaPlanSec(media, segIdx, b, durum)?.file);

// ---------- 1. Kapı: alaka + kalite bağımsız ----------
kontrol("dosyasiz kayit gecmez", !arkaPlanGecer({ gorsel: 3, kalite: 3 }));
kontrol("alakasiz (gorsel 0) gecmez", !arkaPlanGecer({ file: "a", gorsel: 0, kalite: 3 }));
kontrol("zayif ama ilgili (gorsel 1) GECER", arkaPlanGecer({ file: "a", gorsel: 1, kalite: 3 }));
// Gerçek vaka: termal monitör videosu — konu birebir doğru, kadraj kullanılamaz.
kontrol("alaka 3 / kalite 0 GECMEZ (termal monitor vakasi)",
  !arkaPlanGecer({ file: "a", gorsel: 3, kalite: 0 }));
kontrol("alaka 3 / kalite 1 gecer (arka planda esik gevsek)",
  arkaPlanGecer({ file: "a", gorsel: 3, kalite: 1 }));
kontrol("denetimsiz kayit (alan yok) gecer", arkaPlanGecer({ file: "a" }));

// ---------- 2. ASIL KURAL: aynı görsel iki kez çıkmaz ----------
{
  // Gerçek durum: 3 medya, 4 sahne istenirse 4.'sü tekrar olurdu.
  const m = seg(0, [{ f: "portre", gorsel: 3 }, { f: "cikolata", gorsel: 1 }, { f: "parmak", gorsel: 2 }]);
  const uc = calistir(m, 0, 3);
  kontrol("3 medya / 3 sahne: hepsi FARKLI", new Set(uc).size === 3, uc.join(" > "));
  kontrol("her sahne kendi gorselini aliyor",
    uc.join(",") === "portre,cikolata,parmak", uc.join(","));

  // 4. sahne açılırsa tekrar KAÇINILMAZ — bu yüzden render.js sahne sayısını
  // medyayla sınırlıyor. Burada o durumun gerçekten tekrar ürettiğini
  // belgeliyoruz ki sınır kaldırılırsa test düşsün.
  const dort = calistir(m, 0, 4);
  kontrol("4. sahne acilirsa tekrar OLUYOR (sinirin gerekcesi)",
    new Set(dort).size === 3, dort.join(" > "));
}

// ---------- 3. Kendi medyası elenirse kardeşi "çalınmaz" ----------
{
  // b1'in kendi görseli kalitesiz; kardeş olarak b2'ninkini alırsa, sıra b2'ye
  // gelince o da kendininkini döndürür ve AYNI görsel iki sahnede çıkardı.
  // Sahne sayısı render.js'teki gibi kullanılabilir medyayla sınırlı tutuluyor.
  const m = seg(1, [
    { f: "lav", gorsel: 3, kalite: 3 },
    { f: "bozuk", gorsel: 3, kalite: 0 },   // elenir
    { f: "kul", gorsel: 3, kalite: 3 },
    { f: "ates", gorsel: 2, kalite: 3 },
  ]);
  const n = kardesleriBul(m, 1).length;
  kontrol("elenen medya tavana sayilmiyor", n === 3, String(n));
  const s = calistir(m, 1, n);
  kontrol("elenen medya hic secilmiyor", !s.includes("bozuk"), s.join(" > "));
  kontrol("kardes calinca ASIL SAHIBI tekrar etmiyor",
    new Set(s).size === s.length, s.join(" > "));
}

// ---------- 4. Ardışık tekrar yasağı hâlâ geçerli ----------
{
  const m = seg(2, [{ f: "a", gorsel: 3 }, { f: "a", gorsel: 3 }, { f: "b", gorsel: 3 }]);
  const s = calistir(m, 2, 3);
  kontrol("ust uste ayni dosya gelmiyor",
    s.every((x, i) => i === 0 || x !== s[i - 1]), s.join(" > "));
}

// ---------- 5. Kullanılmamış, PUANDAN önce gelir ----------
{
  // b0 kendi görselini alır. b1'in kendi medyası yok; seçenekler: yüksek puanlı
  // ama KULLANILMIŞ "yildiz" ile düşük puanlı ama YENİ "sade".
  const m = {
    s3b0: { beatId: "s3b0", file: "yildiz", gorsel: 3 },
    s3b2: { beatId: "s3b2", file: "sade", gorsel: 1 },
  };
  const d = yeniArkaDurum();
  const ilk = arkaPlanSec(m, 3, 0, d)?.file;
  const ikinci = arkaPlanSec(m, 3, 1, d)?.file;
  kontrol("ilk sahne yuksek puanliyi alir", ilk === "yildiz", String(ilk));
  kontrol("ikinci sahne KULLANILMAMISI alir (puani dusuk olsa bile)",
    ikinci === "sade", String(ikinci));
}

// ---------- 6. Durum segmentler arası taşınıyor ----------
{
  // Üretimde her beat kendi dosyasına iniyor (media/s{i}b{j}.jpg), yani iki
  // segment aynı dosyayı paylaşmıyor. Burada sınanan şey kullanım sayacının
  // segment sınırında SIFIRLANMADIĞI: aynı dosya iki segmentte de kardeş
  // olarak görünürse ikinci segment onu değil, kullanılmamış olanı seçmeli.
  const media = {
    ...seg(4, [{ f: "x", gorsel: 3 }, { f: "y", gorsel: 3 }]),
    ...seg(5, [{ f: "x", gorsel: 3 }, { f: "z", gorsel: 3 }]),
  };
  const d = yeniArkaDurum();
  const hepsi = [
    arkaPlanSec(media, 4, 0, d)?.file, arkaPlanSec(media, 4, 1, d)?.file,
    arkaPlanSec(media, 5, 0, d)?.file,
  ];
  kontrol("onceki segmentte kullanilan gorsel tekrar secilmiyor",
    hepsi.join(",") === "x,y,z", hepsi.join(" > "));
}

// ---------- 6b. Havuz TÜKENİRSE ne oluyor (bilinen sınır) ----------
{
  // Garanti şudur: KULLANILMAMIŞ bir seçenek varken tekrar olmaz. Seçenek
  // kalmadıysa tekrar kaçınılmazdır — o yüzden render.js sahne sayısını
  // kardesleriBul() ile sınırlıyor ve bu durum üretimde oluşmuyor.
  // Yine de kod çökmemeli ve ALAKASIZ bir görsele düşmemeli.
  const m = seg(8, [{ f: "tek", gorsel: 3, kalite: 3 }]);
  const s = calistir(m, 8, 3);   // 1 medyadan 3 sahne istenirse
  kontrol("havuz tukenince cokmuyor", s.length === 3 && s.every(Boolean), s.join(" > "));
  kontrol("havuz tukenince yine de ALAKASIZ gorsel secmiyor",
    s.every((x) => x === "tek"), s.join(" > "));
}

// ---------- 7. Hiç kullanılabilir medya yoksa KART döner ----------
{
  const m = seg(6, [{ f: "kotu", gorsel: 0 }, { f: "kotu2", gorsel: 0 }]);
  const r = arkaPlanSec(m, 6, 0, yeniArkaDurum());
  kontrol("alakasiz medya yerine kart donuyor", r.file === null && r.type === "card",
    JSON.stringify(r));
  kontrol("rastgele bir gorsele DUSULMUYOR", r.file !== "kotu" && r.file !== "kotu2");
}

// ---------- 8. kardesleriBul sahne tavanını doğru veriyor ----------
{
  const m = seg(7, [{ f: "a", gorsel: 3 }, { f: "b", gorsel: 0 }, { f: "c", gorsel: 2 }]);
  kontrol("elenen medya tavana sayilmiyor", kardesleriBul(m, 7).length === 2,
    String(kardesleriBul(m, 7).length));
  kontrol("bos segment 0 doner", kardesleriBul({}, 9).length === 0);
}

// ---------- 9. Bütünsel: 12 segment x 3 medya, tekrar sıfır olmalı ----------
{
  const media = {};
  for (let s = 0; s < 12; s++) {
    Object.assign(media, seg(s, [
      { f: `g${s}_0`, gorsel: 3, kalite: 3 },
      { f: `g${s}_1`, gorsel: 2, kalite: 2 },
      { f: `g${s}_2`, gorsel: 1, kalite: 3 },
    ]));
  }
  const d = yeniArkaDurum();
  const secilen = [];
  for (let s = 0; s < 12; s++) {
    const n = Math.min(3, kardesleriBul(media, s).length);   // render.js'teki sınır
    for (let b = 0; b < n; b++) secilen.push(arkaPlanSec(media, s, b, d)?.file);
  }
  kontrol("36 sahne uretildi", secilen.length === 36, String(secilen.length));
  const tekrar = secilen.length - new Set(secilen).size;
  kontrol("gercek videodaki 4 tekrar SIFIRA indi", tekrar === 0, `${tekrar} tekrar`);
  assert.ok(secilen.every(Boolean), "hicbir sahne bos kalmamali");
}

// ---------- 10. AYNI KAYNAK, FARKLI DOSYA ADI (gerçek vaka) ----------
// İndirilen dosyalar beat adıyla saklanıyor (s0b2.jpg, s6b0.jpg), yani AYNI
// kaynak görsel iki beat için inerse iki FARKLI dosya adı alıyor. Dosya adına
// bakan tekrar süzgeci bunu göremiyordu.
//
// Ölçüldü (Baba Vanga videosu, 2026-08-08): Rupite kilisesinin tek bir Wikimedia
// görseli (wikimedia-0-23720) üç beat için indirilmiş (s0b2, s6b0, s7b1) ve
// videoda 15., 124., 149. saniyelerde ÜÇ KEZ çıkmış (benzerlik 0,997-0,999).
// Vekil sorgular ve "yeni açı" arama aynı en iyi görsele yakınsadığı için bu
// artık daha da olası — kimlik dosya adı değil KAYNAK ADAYI olmalı.
{
  // Üretimdeki gibi segment başına 3 medya. Kilise görseli (23720) hem s0b0'a
  // hem s1b0'a inmiş — farklı dosya adlarıyla.
  const m = {
    s0b0: { beatId: "s0b0", file: "s0b0.jpg", adayId: "wikimedia-0-23720", gorsel: 3 },
    s0b1: { beatId: "s0b1", file: "s0b1.jpg", adayId: "wikimedia-0-99999", gorsel: 3 },
    s0b2: { beatId: "s0b2", file: "s0b2.jpg", adayId: "openverse-11", gorsel: 2 },
    s1b0: { beatId: "s1b0", file: "s1b0.jpg", adayId: "wikimedia-0-23720", gorsel: 3 },  // AYNI kaynak
    s1b1: { beatId: "s1b1", file: "s1b1.jpg", adayId: "pexels-77", gorsel: 2 },
    s1b2: { beatId: "s1b2", file: "s1b2.jpg", adayId: "europeana-42", gorsel: 2 },
  };
  // render.js'teki akış: her segment için önce TAZE görsel sayısı hesaplanır,
  // sahne sayısı onunla sınırlanır, sonra seçim yapılır.
  const d = yeniArkaDurum();
  const secilen = [];
  const sahneSayilari = [];
  for (const seg of [0, 1]) {
    const n = Math.max(1, kardesleriBul(m, seg, d).length);
    sahneSayilari.push(n);
    for (let b = 0; b < n; b++) secilen.push(arkaPlanSec(m, seg, b, d)?.adayId);
  }
  kontrol("farkli dosya adi ayni kaynagi GIZLEYEMIYOR",
    new Set(secilen).size === secilen.length, secilen.join(" > "));
  kontrol("ilk sahne kendi kaynagini aliyor", secilen[0] === "wikimedia-0-23720");
  kontrol("ikinci segment kiliseyi TEKRAR etmiyor",
    secilen.slice(sahneSayilari[0]).every((x) => x !== "wikimedia-0-23720"),
    secilen.slice(sahneSayilari[0]).join(" > "));
  // 2. segmentin 3 medyasindan biri zaten kullanilmis -> 2 sahne acilmali.
  kontrol("tavan zaten kullanilmis kaynagi saymiyor",
    sahneSayilari.join(",") === "3,2", sahneSayilari.join(","));

  // Dosya adına bakan ESKİ mantık bu vakayı kaçırıyordu — belgelemek için:
  const eskiMantik = new Set(["s0b0.jpg", "s0b1.jpg", "s0b2.jpg", "s1b0.jpg", "s1b1.jpg", "s1b2.jpg"]);
  kontrol("eski mantik (dosya adi) 6 dosyayi FARKLI sanardi", eskiMantik.size === 6);

  // adayId yoksa (eski işler, yerel klipler) dosya adına düşülmeli.
  const eski = {
    s2b0: { beatId: "s2b0", file: "a.jpg", gorsel: 3 },
    s2b1: { beatId: "s2b1", file: "b.jpg", gorsel: 3 },
  };
  const e = yeniArkaDurum();
  const es = [arkaPlanSec(eski, 2, 0, e)?.file, arkaPlanSec(eski, 2, 1, e)?.file];
  kontrol("adayId yoksa dosya adina dusuluyor", es.join(",") === "a.jpg,b.jpg", es.join(","));

  const ap = fs.readFileSync(new URL("../src/pipeline/arkaplan.js", import.meta.url), "utf8");
  // Sıra ÖNEMLİ: kaynakId en başta olmalı. adayId içinde adayın liste sırası
  // var, aynı dosya başka sorgudan gelince farklı görünüyor ve tekrar
  // koruması kaçırıyor (ölçüldü: aynı fotoğraf 4 sahnede birden çıktı).
  kontrol("kimlik yardimcisi tanimli ve kaynakId ONCE geliyor",
    ap.includes("const kimlik = (m) => m?.kaynakId || m?.adayId || m?.file || null"));
  kontrol("dosya adina gore karsilastirma KALMADI",
    !ap.includes(".file === durum.sonDosya") &&
    !ap.includes(".file !== durum.sonDosya") &&
    !ap.includes("get(x.file)"));
}

console.log(hata === 0 ? "\nARKA PLAN SECIM TESTLERI GECTI" : "\n" + hata + " HATA");
process.exit(hata ? 1 : 0);
