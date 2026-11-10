// SEÇİM KUTUSU — arşiv seçicisinin kredisi bitince fotoğraf seçimi elle (Hastings, Ekim 2026).
//
// Görme modelinin kredisi (OpenAI/Anthropic) bitince arşiv adımı duruyor, iş "kredi yükleyin" diye kalıyordu. Hastings
// videosunda 112 aday kümesine kontak sayfalarından elle bakılıp seçildi (115 gerçek görsel) — bu modül o yolu Nova'nın
// içine koyar, tıpkı ChatGPT görsel kutusu gibi:
//   <iş>/secim-kutusu/kumeler/<küme>.jpg   her kümenin adayları numaralı tek sayfada
//   <iş>/secim-kutusu/LISTE.txt            hangi sahne, hangi arama, ne anlatılıyor
//   <iş>/secim-kutusu/SECIMLER.txt         "<küme> = 3" (0 = hiçbiri uygun değil; video ızgarasında "3/2" = aday 3, kare 2)
// Seçimler yazılıp "Kaldığı yerden devam et" denince yanıtlar okunur; bulunan fotoğraflar zaten kayıtlı, yeniden aranmaz.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const hash = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);

/** A candidate set's key: the same scene and the same candidates give the same key on every run. */
export function pickKey(scene, { titles = [], sizes = [], video = null } = {}) {
  return hash(JSON.stringify([video ? "v" : "p", scene?.search || "", scene?.say || "", titles.map((t) => String(t || "").slice(0, 140)), sizes]));
}

/** SECIMLER.txt → { key: { choice, segment } } ("abc123def456 = 3", "= 0", "= 3/2"); other lines are ignored. */
export function parseAnswers(text) {
  const out = {};
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^\s*([0-9a-f]{12})\s*=\s*(\d+)(?:\s*\/\s*(\d+))?/.exec(line);
    if (m) out[m[1]] = { choice: Number(m[2]), segment: m[3] ? Number(m[3]) : 1 };
  }
  return out;
}

export function pickInbox(dir, { ffmpeg = "ffmpeg", fontFile = "C\\:/Windows/Fonts/arialbd.ttf" } = {}) {
  const root = path.join(dir, "secim-kutusu");
  const sheets = path.join(root, "kumeler");
  const answersFile = path.join(root, "SECIMLER.txt");
  const listFile = path.join(root, "LISTE.txt");
  const pendingFile = path.join(root, "bekleyen.json");
  const read = () => { try { return parseAnswers(fs.readFileSync(answersFile, "utf8")); } catch { return {}; } };
  const answers = read();
  const pending = new Map();

  function sheet(key, thumbs, labels) {
    fs.mkdirSync(sheets, { recursive: true });
    const tmp = fs.mkdtempSync(path.join(sheets, ".t-"));
    try {
      const ins = [];
      const f = [];
      thumbs.forEach((b, i) => {
        const p = path.join(tmp, `${i + 1}.jpg`);
        fs.writeFileSync(p, b);
        ins.push("-i", p);
        const lab = String(labels[i] || "").replace(/[:'\\%,;[\]]/g, " ").slice(0, 60);
        f.push(`[${i}:v]scale=480:360:force_original_aspect_ratio=decrease,pad=480:400:(ow-iw)/2:40:color=0x202020,drawtext=fontfile='${fontFile}':text='${lab}':x=8:y=10:fontsize=20:fontcolor=yellow[t${i}]`);
      });
      const n = thumbs.length;
      const cols = Math.min(4, n);
      const layout = Array.from({ length: n }, (_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 400}`).join("|");
      const fc = n === 1 ? f[0].replace(/\[t0\]$/, "[o]") : `${f.join(";")};${thumbs.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${n}:layout=${layout}:fill=0x000000[o]`;
      // spawnSync holds the app's whole event loop: capped at 60 s, killed (SIGKILL) and a cut-off sheet removed
      // (25 Ekim 2026, ana süreç donması).
      const out = path.join(sheets, `${key}.jpg`);
      const r = spawnSync(ffmpeg, ["-nostdin", "-y", "-hide_banner", "-loglevel", "error", ...ins, "-filter_complex", fc, "-map", "[o]", "-frames:v", "1", "-q:v", "4", out], { encoding: "utf8", windowsHide: true, timeout: 60000, killSignal: "SIGKILL" });
      if (r.error) fs.rmSync(out, { force: true });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }

  return {
    dir: root,
    keyOf: pickKey,
    answered: (key) => key in answers,
    /** The pick in the picker's own shape. */
    answer: (key) => ({ choice: answers[key].choice, reason: "elle seçildi (seçim kutusu)", namedPersonIsMainSubject: true, faceX: 0.5, faceY: 0.35, segment: answers[key].segment || 1 }),
    /** A set nobody has answered yet: its contact sheet, remembered for the list. */
    ask(key, scene, thumbs, { titles = [], sizes = [], video = null } = {}) {
      if (pending.has(key)) return;
      const labels = thumbs.map((_, i) => `${i + 1}  ${sizes[i]?.[0] || "?"}x${sizes[i]?.[1] || "?"}${video ? ` ${Math.round(video.durations?.[i] || 0)}s` : ""}  ${titles[i] || ""}`);
      try { sheet(key, thumbs, labels); } catch {}
      pending.set(key, { video: !!video, search: scene?.search || "", say: scene?.say || "", source: scene?.source || "", name: scene?.name || null, n: thumbs.length, grids: video?.grids || null });
    },
    pendingCount: () => pending.size,
    /** LISTE.txt (what each set is for) and SECIMLER.txt (answers kept, new sets added empty). Returns the count. */
    writeList() {
      fs.mkdirSync(root, { recursive: true });
      const items = [...pending.entries()];
      fs.writeFileSync(pendingFile, JSON.stringify(Object.fromEntries(items), null, 1));
      const list = [
        `SEÇİM KUTUSU — ${items.length} aday kümesi seçim bekliyor (arşiv seçicisinin kredisi yok).`,
        `Her kümenin adayları numaralı olarak kumeler/<küme>.jpg sayfasında. Sahneyi en doğru gösteren adayın numarasını`,
        `SECIMLER.txt içinde o kümenin satırına yaz ("= 3"). Hiçbiri uymuyorsa 0 (sahne AI görseline kalır).`,
        `Video ızgarasında (VIDEO) en uygun kareyi de yazabilirsin: "= 3/2". Sonra Nova'da "Kaldığı yerden devam et".`,
        "",
        ...items.map(([k, p]) => `${k}  ${p.video ? "VIDEO" : String(p.source || "foto").toUpperCase()}${p.name ? ` · kişi: ${p.name}` : ""} · arama: ${p.search}\n    anlatım: ${String(p.say).replace(/\[[^\]]*\]\s*/g, "").slice(0, 160)}\n    sayfa: kumeler/${k}.jpg (${p.n} aday)`),
      ].join("\n");
      fs.writeFileSync(listFile, list, "utf8");
      let have = "";
      try { have = fs.readFileSync(answersFile, "utf8"); } catch {}
      const known = parseAnswers(have);
      const head = have.trim() ? "" : "# küme = aday numarası (0 = hiçbiri). Görseller: kumeler/<küme>.jpg, açıklamalar: LISTE.txt\n";
      const add = items.filter(([k]) => !(k in known) && !new RegExp(`^\\s*${k}\\s*=`, "m").test(have)).map(([k]) => `${k} = `).join("\n");
      fs.writeFileSync(answersFile, `${head}${have.replace(/\s*$/, "")}${have.trim() && add ? "\n" : ""}${add}\n`, "utf8");
      return items.length;
    },
    files: { list: listFile, answers: answersFile, sheets },
  };
}
