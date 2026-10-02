const SAFE_FILES=new Set([
 'output.mp4','thumbnail.jpg','thumb_a.jpg','thumb_b.jpg','thumb_c.jpg',
 'seo.md','subs.srt','script.json','research.md','job.log',
 'edit-plan.json','sound-plan.json','publication.json','cover.json',
 'postflight.json','editor-review.json','director-shot-review.json',
 'package.md','titles.json',
]);

export function safeJobFileName(name){
 return typeof name==='string'&&(SAFE_FILES.has(name)||/^director-shot-\d{4}(?:-(?:first|last))?\.jpg$/.test(name));
}
