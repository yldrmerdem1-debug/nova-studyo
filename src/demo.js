// Demo modu: API anahtarı olmadan pipeline'ı uçtan uca test etmek için
// şablon tabanlı senaryo üretir. Gerçek kalite için Anthropic anahtarı gerekir.

export function demoResearch(topic, lang) {
  return lang === "tr"
    ? `# ${topic} — demo araştırma notları\nBu demo modudur; gerçek araştırma için Ayarlar'dan Anthropic API anahtarı ekleyin.`
    : `# ${topic} — demo research notes\nThis is demo mode; add an Anthropic API key in Settings for real research.`;
}

export function demoScript(topic, lang, minutes, beats = 1, graphics = false) {
  const tr = lang === "tr";
  // Hedef süreyi tuttur: gerçek modla aynı segment sayısını üret ki yük testi anlamlı olsun
  const wpm = tr ? 140 : 155;
  const totalSegments = Math.max(4, Math.round((minutes * wpm) / 30)); // demo cümleleri ~30 kelime
  const sectionCount = Math.max(2, Math.min(14, Math.round(minutes / 2.4)));
  const perSection = Math.max(2, Math.round(totalSegments / sectionCount));
  const queries = [topic, `${topic} history`, `${topic} archive`, `${topic} portrait`,
                   `${topic} map`, `${topic} architecture`, `${topic} art`, `${topic} museum`];
  const sections = [];
  for (let s = 0; s < sectionCount; s++) {
    const title = tr ? `Bölüm ${s + 1}: ${topic}` : `Chapter ${s + 1}: ${topic}`;
    const segs = [];
    for (let i = 0; i < perSection; i++) {
      const text = tr
        ? s === 0 && i === 0
          ? `${topic} hakkında bildiğinizi sandığınız her şeyi bir kenara bırakın. Önümüzdeki dakikalarda bu hikâyenin bilinmeyen yüzünü keşfedeceğiz.`
          : `Bu, ${topic} hikâyesinin ${s + 1}. bölümünün ${i + 1}. sahnesi. Demo modunda gerçekçi bir senaryo yerine bu örnek metin seslendirilir ve tüm sistem uçtan uca test edilir.`
        : s === 0 && i === 0
          ? `Forget everything you think you know about ${topic}. Over the next few minutes, we are going to uncover the untold side of this story.`
          : `This is scene ${i + 1} of chapter ${s + 1} in the story of ${topic}. In demo mode this placeholder narration is voiced so the whole system can be tested end to end.`;
      const visuals = Array.from({ length: Math.max(1, beats) }, (_, b) => ({
        query: queries[(s * 3 + i + b) % queries.length],
        type: (i + b) % 3 === 2 ? "video" : "image",
        kind: "generic",
        prompt: "",
      }));
      let emphasis = { type: "none", value: "", label: "", items: [] };
      if (graphics) {
        if (i === 1) emphasis = { type: "stat", value: `${(s + 1) * 47} milyon`, label: tr ? "demo veri noktası" : "demo data points", items: [] };
        else if (i === 2) emphasis = { type: "keyword", value: tr ? "BÜYÜK KIRILMA" : "THE BIG SHIFT", label: "", items: [] };
        else if (i === 3) emphasis = {
          type: "compare", value: "", label: "",
          items: [{ label: tr ? "Önce" : "Before", value: 34 }, { label: tr ? "Sonra" : "After", value: 78 }],
        };
      }
      segs.push({ text, visuals, emphasis });
    }
    sections.push({ title, segments: segs });
  }
  return {
    title: tr ? `${topic}: Bilinmeyen Hikâye (Demo)` : `${topic}: The Untold Story (Demo)`,
    sections,
  };
}

export function demoSeo(topic, lang) {
  const tr = lang === "tr";
  return {
    titles: [
      tr ? `${topic}: Bilinmeyen Hikâye` : `${topic}: The Untold Story`,
      tr ? `${topic} Hakkında Her Şey` : `Everything About ${topic}`,
      tr ? `${topic} Belgeseli` : `The ${topic} Documentary`,
    ],
    description: tr
      ? `${topic} hakkında kapsamlı bir video. (Demo modu çıktısı)`
      : `A deep dive into ${topic}. (Demo mode output)`,
    tags: [topic, "belgesel", "documentary", "history"],
    thumbnailText: tr ? "BİLİNMEYEN HİKÂYE" : "THE UNTOLD STORY",
    pinnedComment: tr ? "Bu konuda ne düşünüyorsunuz? Yorumlara yazın!" : "What do you think? Tell us in the comments!",
  };
}
