// Pure, deterministic genre policy. Intensity scales density, never timing.
const genres = {
  belgesel: ['Belgesel','Gözlemci kamera, sakin bölüm çözülmeleri, geniş müzik nefesi.','Somut bir ayrıntıyla aç; neden önemli olduğunu göster, kaynakla karşılığını ver.',.65,'smooth',.32,18,'soft-hit','bell',[0,-2,1,-2],.85],
  hikaye: ['Hikâye','Yumuşak yaklaşma, karaktere alan ve seyrek dramatik işaret.','Karakteri ve geri dönülmez seçimini açılışta göster; sonucu dürüstçe hikâyede tamamla.',.78,'smooth',.40,16,'soft-hit','bell',[1,-2,2,-3],1],
  haber: ['Haber','Kısa kesmeler, tarafsız ses yatağı ve çok az efekt.','Doğrulanmış gelişmeyi, yeri ve etkisini ilk cümlede ver; bilinmeyeni açıkça ayır.',.38,'linear',.16,30,'tick','tick',[-3,-4,-3,-4],.55],
  analiz: ['Analiz','Okunabilir grafikler, ölçülü kamera ve veri işaretleri.','Sınanabilir soruyu ve kıyas ölçütünü sun; sonucu verilerle destekle.',.48,'smooth',.25,22,'tick','soft-hit',[-2,-3,0,-3],.65],
  egitim: ['Eğitim','Adım değişimlerinde net işaret, belgelerde sakin kamera.','İzleyicinin öğreneceği somut beceriyi ve küçük bir örneği hemen göster.',.43,'smooth',.30,20,'bell','tick',[-2,-3,-1,-2],.65],
  top5: ['Top 5','Madde başlangıçlarında ritim, kısa temiz geçiş ve kontrollü vurgu.','Listenin ölçütünü ve ilk güçlü örneği ver; sıralamayı uydurma gizemle geciktirme.',1.02,'linear',.58,9,'pop','tick',[1,-1,2,0],.95],
  vox: ['Görsel açıklama','Görsel kıyaslar, yönlü geçişler ve kısa veri vurguları.','Gündelik bir gözlemden şaşırtıcı ama doğrulanmış soruya geç; görselle açıkla.',.88,'smooth',.50,12,'pop','bell',[0,-2,1,-1],.85],
};
export function getStyleProfile(theme, intensity='balanced') {
  const id = Object.hasOwn(genres,theme) ? theme : 'belgesel';
  const [name,description,hookGuidance,speed,easing,density,spacing,chapter,emphasis,stages,level] = genres[id];
  const aliases = {subtle:'restrained',energetic:'dynamic'};
  const requested = aliases[intensity] || intensity;
  const mode = ['restrained','balanced','dynamic'].includes(requested) ? requested : 'balanced';
  const multiplier = {restrained:.7,balanced:1,dynamic:1.2}[mode];
  return {id,name,description,hookGuidance,intensity:mode,
    camera:{speed:speed*multiplier,easing},
    transitions:{density:Math.min(.75,density*multiplier),duration:mode==='restrained'?.8:1},
    music:{stageGain:stages,level},
    sound:{minSpacing:spacing/multiplier,chapter,emphasis,gain:mode==='dynamic'?1:.85},
  };
}
