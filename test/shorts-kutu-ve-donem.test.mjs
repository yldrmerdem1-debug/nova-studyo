// SHORT KÜNYESİ KUTUDA OLMAYAN FOTOĞRAFI ANMAZ; TARİH SHORT'U DÖNEM SATIRINI KORUR (Kartal Yuvası 20261024-950730).
//
// ÖLÇÜLEN KUSUR (25 Ekim 2026, Kartal Yuvası 20261024-950730 — 1. tur düzeltmesinin B incelemesi): (1) pictureAssets
//   gorsel-kutusu/KUNYE.txt satırını fotoğrafın kutuya konup konmadığına bakmadan künyeye çevirdi. needed.json'daki
//   dosya AI görselinin gerçek adı (build/…/img-N.jpg): satırı yazılmış ama 01.jpg'si hiç konmamış slotu AI sonradan
//   doldurunca Short o AI görselini Commons yazarına ("Michael Lucan, CC BY-SA 3.0 de") atfederdi. docu.js
//   withInboxCredits ve inbox-commons.js inboxCredits buna bakıyordu, Short bakmıyordu. (2) Short künyesi kunye.js
//   kurallarının yerel kopyalarını taşıyordu (NO_CREDIT_PROVIDER/NO_CREDIT_LICENSE, OWES_CREDIT = ATIF_ISTER, creditTitle
//   içinde cut). (3) Kartal düzeltmesinden sonra planlayıcının "no present-day photos" satırı year null olunca hep
//   düştü: anlatımında yıl geçmeyen bir TARİH işi de (storyYear null) bu satırı kaybetti; eskiden yılsız hâli gidiyordu.
// Kural: kutu satırı yalnızca fotoğrafı kutudaysa (NN.png/.jpg/.jpeg/.webp) künye olur; stok/atıf/kesme kuralları
//   kunye.js'den (TOPLU, ATIF_ISTER, cut) gelir, davranış aynı; planlayıcı satırı `newsStory` ile düşer, `newsStory: false` ve
//   yılsız iş yılsız satırı alır, `newsStory` söylenmezse year null haber sayılır (1. turdaki gibi). Ağ YOK, model YOK.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

globalThis.fetch = async () => { throw Error("Unstubbed network forbidden"); };
const P = await import("../src/pipeline/docu-shorts-pictures.js");
const { cut } = await import("../src/pipeline/kunye.js");

test("Kartal: a KUNYE.txt line whose photo never went into the inbox credits nothing (the AI made that still later)", () => {
  const jobDir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-short-kutu-yok-"));
  const pub = path.join(jobDir, "docu", "public", "build", "j");
  fs.mkdirSync(pub, { recursive: true });
  const kutu = path.join(jobDir, "gorsel-kutusu");
  fs.mkdirSync(kutu);
  for (const f of ["img-1.jpg", "img-2.jpg", "img-3.jpg"]) fs.writeFileSync(path.join(pub, f), "x");
  fs.writeFileSync(path.join(jobDir, "docu", "j.props.json"), JSON.stringify({ script: { scenes: [
    { say: "Bavaria's interior minister came to the scene.", image: "build/j/img-1.jpg" },
    { say: "The house on the Kehlstein.", image: "build/j/img-2.jpg" },
    { say: "Police closed the road.", image: "build/j/img-3.jpg" },
  ] } }));
  fs.writeFileSync(path.join(kutu, "needed.json"), JSON.stringify({ items: [1, 2, 3].map((n) => ({ n, file: `build/j/img-${n}.jpg`, prompt: "x" })) }));
  fs.writeFileSync(path.join(kutu, "KUNYE.txt"), [
    "01 Michael Lucan / Wikimedia Commons, CC BY-SA 3.0 de — https://commons.wikimedia.org/wiki/File:2016-02-02_Joachim_Herrmann_0617.JPG",
    "02 Wolfgang Manousek from Dormagen, Germany / Wikimedia Commons, CC BY 2.0 — https://commons.wikimedia.org/wiki/File:Kehlsteinhaus_Obersalzberg_Bavaria_Germany_2004.jpg",
  ].join("\r\n"));
  // 01 was never dropped in (img-1.jpg is the AI still); 02 was, with a capital extension; 03 is ChatGPT's.
  for (const f of ["02.JPG", "03.png", "LISTE.txt"]) fs.writeFileSync(path.join(kutu, f), "x");
  const assets = P.pictureAssets(jobDir);
  assert.equal(assets.find((a) => a.rel === "build/j/img-1.jpg")?.credit, undefined, "the AI still is not Michael Lucan's photo");
  assert.equal(assets.find((a) => a.rel === "build/j/img-2.jpg")?.credit?.sahip, "Wolfgang Manousek from Dormagen, Germany");
  assert.equal(P.shortCredits(assets), "Photos: Kehlsteinhaus Obersalzberg Bavaria Germany 2004, Wolfgang Manousek from Dormagen, Germany, CC BY 2.0, Wikimedia Commons");
  // The photo dropped in afterwards: now it is credited.
  fs.writeFileSync(path.join(kutu, "01.jpg"), "x");
  assert.equal(P.pictureAssets(jobDir).find((a) => a.rel === "build/j/img-1.jpg")?.credit?.sahip, "Michael Lucan");
  fs.rmSync(jobDir, { recursive: true, force: true });
});

test("the Short's credit line uses kunye.js's rules (TOPLU, ATIF_ISTER, cut), with no local copies, and says the same", () => {
  const src = fs.readFileSync(new URL("../src/pipeline/docu-shorts-pictures.js", import.meta.url), "utf8");
  for (const local of ["NO_CREDIT_PROVIDER", "NO_CREDIT_LICENSE", "OWES_CREDIT"]) assert.doesNotMatch(src, new RegExp(`\\b${local}\\b`), local);
  const imp = src.match(/import \{([^}]*)\} from "\.\/kunye\.js";/)?.[1] || "";
  for (const name of ["ATIF_ISTER", "TOPLU", "cut"]) assert.match(imp, new RegExp(`\\b${name}\\b`), `${name} from kunye.js`);
  // Stock asks for no credit by its provider (any case) or by a licence named after it, even with a "by" in it.
  const stock = [
    { rel: "a", credit: { provider: "Pexels", eser: "a burning wood", sahip: "Lay-Z Owl", lisans: "Free to use, photo by Lay-Z Owl" } },
    { rel: "b", credit: { provider: "yerel", eser: "a mountain road", sahip: "X", lisans: "Pexels License — photo by X" } },
    { rel: "c", credit: { provider: "mixkit", eser: "alps", sahip: "Mixkit", lisans: "Free licence by Mixkit" } },
    { rel: "d", credit: { provider: "archive", eser: "pines", sahip: "Y", lisans: "Mixkit-License by Y" } },
  ];
  assert.equal(P.shortCredits(stock), "");
  // A licence that only starts like a stock name is not stock; Openverse's bare "BY", GFDL and FAL ask for the name.
  assert.equal(
    P.shortCredits([
      { rel: "e", credit: { provider: "openverse", eser: "100 euro bill", sahip: "k", lisans: "BY 2.0" } },
      { rel: "f", credit: { provider: "wikimedia", eser: "Map.svg", sahip: "M", lisans: "GFDL" } },
      { rel: "g", credit: { provider: "wikimedia", eser: "Pexelsfield.jpg", sahip: "N", lisans: "Pexelsfoo BY 4.0" } },
      { rel: "h", credit: { provider: "wikimedia", eser: "Old.jpg", sahip: "O", lisans: "PD-US, by O" } },
    ]),
    "Photos: 100 euro bill, k, CC BY 2.0, Openverse; Map, M, GFDL, Wikimedia Commons; Pexelsfield, N, Pexelsfoo BY 4.0, Wikimedia Commons",
  );
  // The title is cut where kunye.js cuts it, at both lengths the Short uses.
  const long = "File:Stunning_capture of the Palais Bourbon by the Seine River in Paris, showing the bridge.jpg";
  const clean = "Stunning capture of the Palais Bourbon by the Seine River in Paris, showing the bridge";
  assert.equal(P.creditTitle(long), cut(clean));
  assert.equal(P.creditTitle(long, 72), cut(clean, 72));
  assert.equal(P.creditTitle("Kehlsteinhaus zepředu.jpg"), "Kehlsteinhaus zepředu");
});

test("the planner keeps the yearless 'no present-day photos' line for a history story with no year; a news story is not told it", async () => {
  const pic = (id, what) => ({ id, rel: `build/j/${id}.jpg`, kind: "still", source: "real", quality: 4, textHeavy: false, what });
  const catalog = [
    pic("p1", "Black-and-white photo of the house under construction"),
    pic("p2", "Black-and-white photo of workers on the road"),
    pic("p3", "Black-and-white photo of a tunnel entrance"),
    pic("p4", "Black-and-white photo of the finished house"),
  ];
  let prompt = "";
  const llm = async ({ user }) => {
    prompt = user;
    return {
      hook: "THE HOUSE ON THE MOUNTAIN", title: "t", description: "d", hashtags: [], cover: [],
      opening: { say: "The house on the mountain took thirteen months to build.", words: [], pictures: ["p1"], pattern: "result", screen: "" },
      beats: ["p2", "p3", "p4"].map((p) => ({ say: `Line over ${p}.`, picture: p, newPrompt: "", person: "", figure: "", figureWord: "" })),
    };
  };
  const plan = (o) => P.planPictureTeaser({ cues: [{ t: "The house on the mountain was built in thirteen months." }], title: "The house", catalog, llm, ...o });
  const LINE = /- every picture must belong to the story's time: no present-day photos or footage/;
  await plan({ year: null, newsStory: false });
  assert.match(prompt, LINE, "a history story whose narration names no year keeps the line, without a year");
  await plan({ year: null, newsStory: true });
  assert.doesNotMatch(prompt, /no present-day photos/, "news: told today");
  await plan({ year: null });
  assert.doesNotMatch(prompt, /no present-day photos/, "a caller that does not say: year null is news, as in round 1");
  await plan({ year: 1938 });
  assert.match(prompt, /- every picture must belong to the story's time \(1938\): no present-day photos or footage/);
  await plan({ year: -480, newsStory: false });
  assert.match(prompt, /story's time \(480 BC\): no present-day photos/);
});
