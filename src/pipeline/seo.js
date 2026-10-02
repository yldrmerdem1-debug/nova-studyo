import { scriptBrief, engagementInstructions, publicationAudit, validateSeoGrounding } from "./engagement.js";
import { callJSON } from "../llm.js";
import { demoSeo } from "../demo.js";
import { fmtTime } from "../util.js";
import { kunyeUret, muzikKunyesi } from "./kunye.js";

const SEO_SCHEMA = {
  type: "object",
  properties: {
    titles: { type: "array", minItems:3, maxItems:5, uniqueItems:true, items: { type: "string", minLength:8, maxLength:70 }, description: "3-5 tıklanabilir başlık önerisi, 60 karakter altı" },
    description: { type: "string", minLength:30, description: "YouTube açıklaması. İlk 2 satır kancayı atsın. {BOLUMLER} yazan yere bölüm zaman damgaları eklenecek. Sonda 3-5 hashtag." },
    tags: { type: "array", minItems:5, items: { type: "string", minLength:1 }, description: "12-20 etiket" },
    thumbnailText: { type: "string", minLength:2, description: "Thumbnail üzerine yazılacak 2-4 kelimelik vurucu ifade" },
    pinnedComment: { type: "string", minLength:15, pattern:"[?？]", description: "Sabitlenecek yorum: etkileşim sorusu" },
    evidence: {type:"array",minItems:3,items:{type:"object",properties:{titleIndex:{type:"integer",minimum:0,maximum:4},segId:{type:"string"},quote:{type:"string",minLength:12}},required:["titleIndex","segId","quote"],additionalProperties:false}},
  },
  required: ["titles", "description", "tags", "thumbnailText", "pinnedComment", "evidence"],
  additionalProperties: false,
};

export async function runSeo(job, script, usage, logFn, options = {}) {
  // options.model: belgesel SEO'yu ucuz/hızlı modelle yazar (kısa, net iş).
  const seoModel = options.model;
  if (job.demo) return demoSeo(job.topic, job.language);
  logFn("SEO paketi hazırlanıyor (başlık, açıklama, etiketler)...");
  const brief = scriptBrief(script);
  const out = await callJSON({
    ...(seoModel ? { model: seoModel } : {}),
    system: `Sen YouTube SEO uzmanısın. Video dili ${job.language === "tr" ? "Türkçe" : "İngilizce"} — başlık/açıklama/etiketler de o dilde olsun. Tıklanabilir ama clickbait-dürüst dengesi kur.`,
    user: [
      `Video başlığı (taslak): ${script.title}`,
      `Konu: ${job.topic}`,
      `Tüm bölümlerin özeti (açılış, her sahne ve sonuç):\n${brief}`,
      engagementInstructions(job),
      `Başlık, kapak ve sabit yorum AYNI somut soruya bağlansın. İzleyicinin videoda alamayacağı bir cevap, sayı veya kesinlik vaat etme.`,
      `Her başlık için evidence içine titleIndex (0 tabanlı), segId (s0g0 gibi) ve o sahneden BİREBİR destekleyici kısa quote ekle. Alıntılar başlık vaadini gerçekten desteklemeli.`,
      `Sabit yorum videodaki belirli bir örnek/kanıt/karar hakkında cevaplanabilir TEK soru olsun; genel görüş veya abone isteği olmasın.`,
      ``,
      `Bu video için SEO paketi üret. description içinde tam olarak "{BOLUMLER}" yer tutucusunu bölümlerin geleceği satıra koy.`,
      `thumbnailText: kapağa basılacak EN FAZLA 4 KELİME. Başlığın kısaltılmışı DEĞİL,`,
      `merak uyandıran bir vuruş olsun ("30 YIL SONRA", "KİM YAZIYOR?", "TEK BİR SATIR YOK").`,
    ].join("\n"),
    schema: SEO_SCHEMA,
    validate: out => validateSeoGrounding(out,script),
    ...(options.request ? {request:options.request} : {}),
    // Tavan AÇIKÇA veriliyor. Çıktı küçük (başlık, açıklama, etiketler) ama
    // düşünme de aynı bütçeden yiyor ve varsayılana güvenmek senaryo hattında
    // bir işi öldürmüştü (bkz. test/token-tavani.test.mjs).
    maxTokens: 8000,
    usage,
    logFn,
  });

  // KAPAK METNİ GARANTİ ALTINA ALINIYOR.
  //
  // Ölçüldü (20260809-c03c63): şemada zorunlu olmasına rağmen `thumbnailText`
  // undefined döndü (bu hesapta yapılandırılmış çıktı zorlanmıyor). Kapak
  // üreticisi de uzun BAŞLIĞA düşüp onu kadraja sığdıramadı; üç kapağın
  // ikisinde yazı ortadan kesildi ("BULGAR KÂHİNİN GE").
  //
  // Alan adı esnek okunur; hiç yoksa başlığın İLK ÖBEĞİNDEN kısa bir vuruş
  // türetilir — uzun başlığı kapağa basmaktansa 2-3 kelime basmak yeğdir.
  const ham = String(out?.thumbnailText || out?.thumbnail_text || out?.kapakMetni || "").trim();
  if (!ham) {
    const bas = String(out?.title || script.title || job.topic || "");
    // Başlıktaki ilk anlamlı öbek: iki nokta / tire / soru işaretinden önce.
    const obek = bas.split(/[:\-–—?!]/)[0].trim() || bas;
    out.thumbnailText = obek.split(/\s+/).slice(0, 4).join(" ");
    logFn?.(`Kapak metni modelden gelmedi — başlıktan türetildi: "${out.thumbnailText}"`);
  } else {
    out.thumbnailText = ham.split(/\s+/).slice(0, 4).join(" ");
  }

  // ZORUNLU ALANLARIN GERİ KALANI DA GARANTİ ALTINA ALINIYOR.
  //
  // ÖLÇÜLEN KUSUR (20260817-b05a7a): şemada `titles` ve `pinnedComment`
  // required olduğu hâlde model ikisini de HİÇ döndürmedi (seo.json'da yalnızca
  // title, description, tags, thumbnailText vardı). Hiçbir doğrulama
  // tetiklenmedi, günlükte tek uyarı satırı yok. Sonuç: kullanıcı yayına
  // çıkarken seo.md'de iki BOŞ bölüm buluyor — hangi başlıkla yayınlayacağına
  // dair öneri yok, ilk yorumda sabitleyeceği soru yok. İkisi de ilk 24
  // saatteki tıklanma ve yorum oranını doğrudan belirleyen alanlar.
  //
  // Kapak metninde (yukarıda) yapılanın genelleştirilmiş hâli: alan adı esnek
  // okunur, yoksa elde olandan türetilir ve DURUM GÜNLÜĞE YAZILIR. Sessizce
  // boş geçmek bu kusurun görünmez kalmasının tek sebebiydi.
  const basliklar = out?.titles || out?.baslikOnerileri || out?.titleOptions;
  if (!Array.isArray(basliklar) || !basliklar.filter(Boolean).length) {
    // Modelin döndürdüğü tekil başlık varsa o kullanılır; yoksa senaryonunki.
    const tek = String(out?.title || script.title || job.topic || "").trim();
    out.titles = tek ? [tek] : [];
    logFn?.(out.titles.length
      ? `Başlık önerileri modelden gelmedi — tek başlık kullanılıyor: "${out.titles[0]}"`
      : `DİKKAT: başlık önerisi üretilemedi, seo.md'de başlık bölümü boş kalacak.`);
  } else {
    out.titles = basliklar.filter(Boolean).map((t) => String(t).trim()).slice(0, 5);
  }

  const yorum = String(out?.pinnedComment || out?.pinned_comment || out?.sabitYorum || "").trim();
  if (!yorum) {
    logFn?.(`Sabitlenecek yorum modelden gelmedi — seo.md'de o bölüm hiç basılmayacak.`);
    out.pinnedComment = "";
  } else {
    out.pinnedComment = yorum;
  }
  out.publicationAudit = publicationAudit(script,out);
  return out;
}

export function renderSeoMarkdown(job, script, seo, sectionTimes, durationSec, media = null, muzikler = null) {
  const chapters = sectionTimes.map((s) => `${fmtTime(s.start)} ${s.title}`).join("\n");
  const baseDescription = (seo.description || "").includes("{BOLUMLER}")
    ? seo.description.replace("{BOLUMLER}", chapters)
    : `${seo.description || ""}\n\n${chapters}`;

  // GÖRSEL KÜNYESİ açıklamanın SONUNA eklenir. Wikimedia/Openverse'ten gelen
  // CC-BY eserler için atıf ZORUNLU; ekrana kart koymak yerine açıklamaya
  // yazmak hem yeterli hem izlenme süresini düşürmüyor.
  const kunye = media ? kunyeUret(media, { dil: job.language }) : { metin: "" };

  // MÜZİK KÜNYESİ. Görsel künyesi vardı, müzik künyesi hiç yoktu — YouTube
  // Audio Library parçalarının bir bölümü atıf istiyor (sanatçı + parça adı)
  // ve bu bilgi hiçbir yere yazılmıyordu. Kurulumla gelen yer tutucu yataklar
  // üretilmiş drone oldukları için künyeye girmez (bkz. kunye.js).
  const mk = muzikler ? muzikKunyesi(muzikler, { dil: job.language }) : { metin: "" };
  const assemble = credits => [baseDescription.trim(),credits?.metin,mk.metin].filter(Boolean).join('\n\n');
  let description=assemble(kunye),creditsCompacted=false;
  // YouTube descriptions stop at 5,000 characters. Keep every required
  // attribution and music license; shorten or omit optional public-domain
  // item lines only in the copy-paste block. Full provenance remains below.
  if(description.length>5000&&media){
    description=assemble(kunyeUret(media,{dil:job.language,compact:true}));
    creditsCompacted=true;
  }
  if(description.length>5000&&media)description=assemble(kunyeUret(media,{dil:job.language,mandatoryOnly:true}));
  const tooLong=description.length>5000;
  return [
    `# ${script.title}`,
    ``,
    `**Süre:** ${fmtTime(durationSec)}  |  **Konu:** ${job.topic}`,
    ``,
    // BOŞ BÖLÜM BASILMAZ. Kullanıcı belgeyi açıp başlıksız bir "## Başlık
    // önerileri" başlığı bulmasın — yokluk, boş başlıktan daha dürüst.
    ...((seo.titles || []).filter(Boolean).length
      ? [`## Başlık önerileri`, ...(seo.titles || []).filter(Boolean).map((t, i) => `${i + 1}. ${t}`), ``]
      : []),
    `## Açıklama (kopyala-yapıştır)`,
    ...(tooLong?[`**Uyarı:** Gerekli atıflarla birlikte açıklama ${description.length} karakter; YouTube'un 5.000 karakter sınırı için yayın öncesi düzenleyin.`,``]:[]),
    "```",
    description.trim(),
    "```",
    ``,
    `## Etiketler`,
    "```",
    (seo.tags || []).join(", "),
    "```",
    ``,
    ...(String(seo.pinnedComment || "").trim()
      ? [`## Sabitlenecek yorum`, `> ${seo.pinnedComment}`, ``]
      : []),
    `## Thumbnail yazısı`,
    `> ${seo.thumbnailText || ""}`,
    ...(creditsCompacted&&kunye.metin?[``,`## Ayrıntılı görsel kaynakları (açıklama dışı)`,kunye.metin]:[]),
  ].join("\n");
}
