// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası 20261024-950730): teslim edilen "Baslik ve Aciklama.md" (package.md)
// kopyala-yapıştır bloğunu 5 "Permission not verified: <klip adı>" satırıyla bitirdi. 1. tur bu notları seo.md'de bloğun
// altına, "**Yayın öncesi kontrol (görsel):**" başlığına taşıdı; ama package.md seo.md'den yalnızca bloğu kopyalıyor
// (publishedDescription): görsel ve müzik notları kullanıcının açtığı dosyadan tamamen düşüyordu. Notlar package.md'ye
// bloğun DIŞINDA, ayrı "## Yayın öncesi kontrol" bölümüyle geçer.
// Ağ, model ve motor YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.NOVA_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-paket-kontrol-"));
globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const { renderSeoMarkdown } = await import("../src/pipeline/seo.js");
const P = await import("../src/pipeline/docu-package.js");

// Kartal Yuvası'nın kaynak klibi (source-clips.js künye kaydı) ve bir CC BY arşiv fotoğrafı.
const media = {
  "scene-0": { provider: "youtube", eser: "Kehlsteinhaus - Eagle's Nest from above || Drone", kanal: "Billy Cosgrave", url: "https://www.youtube.com/watch?v=nOmymsR6H9c", sayfa: "https://www.youtube.com/watch?v=nOmymsR6H9c", file: "build/20261024-950730/src/src-84d564d9c6.mp4", type: "video", lisans: "YouTube — kısa alıntı (kaynak belirtilerek)" },
  "scene-116": { file: "build/x/arch-01070488eb92.jpg", provider: "wikipedia", lisans: "CC BY 4.0", sahip: "Anil Öztas", eser: "Berchtesgaden (DE), Dokumentation Obersalzberg -- 2024 -- 0411.jpg", sayfa: "https://commons.wikimedia.org/wiki/File:Berchtesgaden_(DE),_Dokumentation_Obersalzberg_--_2024_--_0411.jpg", lisansUrl: "https://creativecommons.org/licenses/by/4.0", modifications: "Video düzeninde kadraj ve yeniden boyutlandırma; kamera hareketi, renk tonlama (duotone), film greni ve üst yazı eklendi." },
};
const jobDir = (seoMd) => {
  const dir = fs.mkdtempSync(path.join(process.env.NOVA_HOME, "job-"));
  if (seoMd != null) fs.writeFileSync(path.join(dir, "seo.md"), seoMd, "utf8");
  return dir;
};
const seoMd = (m, muzikler) => renderSeoMarkdown({ language: "en", topic: "Eagle's Nest" }, { title: "Eagle's Nest" }, { description: "The Eagle's Nest burned.\n\n{BOLUMLER}", titles: ["Eagle's Nest"], tags: ["Eagle's Nest"] }, [{ start: 0, title: "Spared by a World War" }], 767, m, muzikler);
const pkg = (description, checks) => P.renderPackageMarkdown({ titles: [{ text: "Hitler's Eagle's Nest Survived WWII. Then It Burned", chars: 51 }], thumbs: [], recommended: 0, seo: { tags: ["Eagle's Nest"] }, description, checks, mode: "llm", cost: null });

test("the image and music checks of seo.md reach package.md, outside the copy-paste block", () => {
  const md = seoMd(media, ["yatak-ilham-sunrise--ada.mp3"]);
  const block = md.match(/## Açıklama[^\n]*\n```\n([\s\S]*?)\n```/)[1];
  const checks = P.publisherChecks(jobDir(md));
  assert.deepEqual(checks, [
    "Görsel: Permission not verified: Kehlsteinhaus - Eagle's Nest from above || Drone. Complete provenance before publishing.",
    "Müzik: \"Sunrise\" — Ada: origin/license not verified; names may be derived from filename",
  ]);
  const out = pkg(block, checks);
  const copy = out.match(/## Açıklama \(kopyala-yapıştır\)\n```\n([\s\S]*?)\n```/)[1];
  assert.doesNotMatch(copy, /not verified|Yayın öncesi/, "never inside the block the viewer gets");
  assert.match(copy, /Billy Cosgrave on YouTube/);
  const after = out.slice(out.indexOf(copy) + copy.length);
  assert.match(after, /\n## Yayın öncesi kontrol\n[^\n]*\n- Görsel: Permission not verified: Kehlsteinhaus - Eagle's Nest from above \|\| Drone\. Complete provenance before publishing\.\n- Müzik: "Sunrise" — Ada: origin\/license not verified/);
  assert.ok(after.indexOf("## Yayın öncesi kontrol") < after.indexOf("## Etiketler"), "right below the block, as in seo.md");
});

test("the 5,000-character warning comes along; text inside a fenced block is never read as a note; no notes, no section", () => {
  const long = "# t\n\n## Açıklama (kopyala-yapıştır)\n**Uyarı:** Gerekli atıflarla birlikte açıklama 5210 karakter; YouTube'un 5.000 karakter sınırı için yayın öncesi düzenleyin.\n\n```\nA story.\n**Yayın öncesi kontrol (görsel):**\n- not a note\n```\n\n## Etiketler\n```\nx\n```\n";
  assert.deepEqual(P.publisherChecks(jobDir(long)), ["Açıklama: Gerekli atıflarla birlikte açıklama 5210 karakter; YouTube'un 5.000 karakter sınırı için yayın öncesi düzenleyin."]);
  // seo.md saved again by hand on Windows (CRLF) still gives its notes.
  const crlf = seoMd(media, null).replace(/\n/g, "\r\n");
  assert.deepEqual(P.publisherChecks(jobDir(crlf)), ["Görsel: Permission not verified: Kehlsteinhaus - Eagle's Nest from above || Drone. Complete provenance before publishing."]);
  const clean = seoMd({ "scene-116": media["scene-116"] }, null);
  assert.deepEqual(P.publisherChecks(jobDir(clean)), []);
  assert.deepEqual(P.publisherChecks(jobDir(null)), [], "no seo.md: nothing to carry");
  assert.doesNotMatch(pkg("A story.", []), /Yayın öncesi kontrol/);
  assert.doesNotMatch(pkg("A story."), /Yayın öncesi kontrol/, "older callers without checks");
});

test("the copy-paste block of a CRLF seo.md is read too, never swapped for seo.json's bare description", () => {
  // İnceleme (25 Ekim 2026): notlar CRLF'de okunuyordu, blok okunmuyordu — paket seo.json'un bölümsüz, künyesiz metnine düştü.
  const md = seoMd(media, null);
  const block = md.match(/## Açıklama[^\n]*\n```\n([\s\S]*?)\n```/)[1].trim();
  const seo = { description: "The Eagle's Nest burned.\n\n{BOLUMLER}" };
  assert.equal(P.publishedDescription(jobDir(md), seo), block);
  const crlf = P.publishedDescription(jobDir(md.replace(/\n/g, "\r\n")), seo);
  assert.equal(crlf, block);
  assert.match(crlf, /0:00 Spared by a World War/);
  assert.match(crlf, /Billy Cosgrave on YouTube/);
  assert.equal(P.publishedDescription(jobDir(null), seo), "The Eagle's Nest burned.", "no seo.md: seo.json's own text");
});

test("runDocuPackage writes package.md with the checks of the job's seo.md", () => {
  const src = fs.readFileSync(new URL("../src/pipeline/docu-package.js", import.meta.url), "utf8");
  assert.match(src, /"package\.md"\), renderPackageMarkdown\(\{[^}]*description: publishedDescription\(jobDir, seo\), checks: publisherChecks\(jobDir\)/);
});
