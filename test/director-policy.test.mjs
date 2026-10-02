import test from 'node:test';
import assert from 'node:assert/strict';
const policy=await import('../src/pipeline/director-policy.js').catch(()=>({}));
const narration='The storage tank held 2.3 million US gallons of molasses above the streets of Boston.';
const overlay={value:'2.3 MILLION US GALLONS',label:'MOLASSES',anchorQuote:'2.3 million US gallons of molasses',position:'left'};

test('director factual overlays preserve the complete value, unit and exact narrative anchor',()=>{
 assert.equal(typeof policy.validateDirectorOverlay,'function');
 assert.deepEqual(policy.validateDirectorOverlay(overlay,narration),overlay);
 for(const patch of [{value:'3.2 MILLION US GALLONS'},{value:'2.3 MILLION'},{value:'2.3'},{value:'23 million US gallons'},{anchorQuote:'The tank exploded at midnight'},{label:'21 PEOPLE DIED'}]) assert.equal(policy.validateDirectorOverlay({...overlay,...patch},narration),null);
 assert.equal(policy.validateDirectorOverlay(null,narration),null);
});
test('grounded typography supports Turkish, portrait positions and simple factual dates without inventing data',()=>{
 const tr='Depoda 8,7 milyon litre pekmez vardı.';
 assert.equal(policy.validateDirectorOverlay({value:'8,7 MİLYON LİTRE',label:'PEKMEZ',anchorQuote:'8,7 milyon litre pekmez',position:'right'},tr)?.value,'8,7 MİLYON LİTRE');
 assert.equal(policy.validateDirectorOverlay({value:'1919',label:'Boston',anchorQuote:'In 1919 the tank stood in Boston.',position:'center'},'In 1919 the tank stood in Boston.')?.value,'1919');
 assert.equal(policy.validateDirectorOverlay({...overlay,position:'outside'},narration)?.position,'left');
 assert.equal(policy.validateDirectorOverlay({...overlay,value:'2.3\nMILLION US GALLONS'},narration),null);
 assert.equal(policy.validateDirectorOverlay({...overlay,value:'%{localtime}'},narration),null);
});
test('approved editorial lessons are versioned, included in actual prompts and explain rich scenes rather than primitive cards',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=1);
 assert.ok(Array.isArray(policy.DIRECTOR_LESSONS)&&policy.DIRECTOR_LESSONS.length>=5);
 const prompt=policy.directorPrompt({mediaKind:'director',theme:'belgesel',ratio:'9:16'});
 for(const lesson of policy.DIRECTOR_LESSONS) assert.ok(prompt.includes(lesson.rule),lesson.id);
 assert.match(prompt,/9:16/);assert.match(prompt,/belgesel/);assert.match(prompt,/negative space/i);
 assert.equal(policy.directorPrompt({mediaKind:'mixed'}),'');
});

test('documentary covers use verified people and context rather than invented historical faces',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=19);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='documentary-cover-evidence');
 assert.ok(lesson);
 for(const pattern of [/verified archival/i,/actual subject/i,/AI-generated face/i,/provenance/i,/native typography/i])assert.match(lesson.rule,pattern);
 assert.ok(policy.directorPrompt({mediaKind:'director',theme:'belgesel'}).includes(lesson.rule));
});

test('approved Cannae timing lesson carries exact narration anchors into the standard Director policy',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=3);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='verbatim-anchor-timing');
 assert.ok(lesson);
 assert.match(lesson.rule,/anchorQuote/);assert.match(lesson.rule,/sentence boundar/i);
 assert.match(lesson.rule,/minimum duration/i);assert.match(lesson.rule,/fallback/i);
 for(const planning of [true,false]) assert.ok(policy.directorPrompt({mediaKind:'director'},{planning}).includes(lesson.rule));
});
test('approved portrait caption lesson reaches script and planning prompts without changing long-form modes',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=4);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='portrait-caption-phrases');assert.ok(lesson);
 for(const pattern of [/semibold/i,/two lines/i,/77 percent/i,/Landscape, square/i,/word mode/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director'},{planning}).includes(lesson.rule));
});
test('approved crop lesson preserves audited off-center subjects and the complete document frame',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=5);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='subject-aware-crop');assert.ok(lesson);
 for(const pattern of [/media.odak/,/editorial.subjectPosition/,/centered fallback/,/Documents, maps/,/preserveFrame/])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director'},{planning}).includes(lesson.rule));
});
test('portrait archival footage keeps readable source context instead of enlarging SD crops',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=17);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='portrait-archive-framing');assert.ok(lesson);
 for(const pattern of [/4:3/i,/low-resolution/i,/9:16/,/preserveFrame/,/blurred/i,/first frame/i,/embedded text/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director',ratio:'9:16'},{planning}).includes(lesson.rule));
});
test('portrait source selection rejects tiny or garbled map labels despite motion value',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=9);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='portrait-source-labels');assert.ok(lesson);
 for(const pattern of [/portrait delivery/i,/landscape map/i,/embedded labels/i,/unreadable/i,/different excerpt/i,/native overlay/i,/invent replacement statistics/i,/video-motion target/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director',ratio:'9:16'},{planning}).includes(lesson.rule));
});
test('archival source captions must describe the spoken moment across the selected window',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=18);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='source-baked-copy');assert.ok(lesson);
 for(const pattern of [/first, middle and last/i,/baked captions/i,/later or different event/i,/text-free/i,/current narration/i,/do not crop/i,/source labels/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director',ratio:'16:9'},{planning}).includes(lesson.rule));
});
test('temporal state lesson prevents showing a later damaged carrier as an untouched one',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=10);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='temporal-state-match');assert.ok(lesson);
 for(const pattern of [/before, during or after/i,/untouched/i,/not yet hit/i,/later burning/i,/chosen timecode/i,/throughout the planned shot/i,/misleading excerpt/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director',ratio:'16:9'},{planning}).includes(lesson.rule));
});
test('opening shots show the named subject before a long empty source lead-in',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=11);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='subject-on-time');assert.ok(lesson);
 for(const pattern of [/opening hook/i,/first, middle and last/i,/empty map/i,/named subject/i,/better timecode/i,/verified historical still/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director',ratio:'16:9'},{planning}).includes(lesson.rule));
});

test('portrait Shorts opening lesson requires distinct early visuals and immediate readable typography',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=14);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='portrait-short-hook');assert.ok(lesson);
 for(const pattern of [/9:16/,/under 90 seconds/i,/first frame/i,/spoken sentence/i,/verified distinct/i,/shorter than 1.15 seconds/i,/long-form/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director',ratio:'9:16'},{planning}).includes(lesson.rule));
});

test('named forces and casualties match their own source window with complete labels',()=>{
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='named-side-window');
 assert.ok(lesson);
 for(const pattern of [/named force/i,/exact narration anchor/i,/first, middle and last/i,/embedded label/i,/occluded/i,/unrelated wreckage/i])assert.match(lesson.rule,pattern);
 assert.match(policy.directorPrompt({mediaKind:'director'}),/named force/i);
});

test('archival loss coda anchors to the narrated human cost instead of an earlier strike',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=13);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='aftermath-coda-anchor');
 assert.ok(lesson);
 for(const pattern of [/verified aftermath/i,/burial footage/i,/verbatim loss or consequence clause/i,/not an earlier attack clause/i,/editorial.reason/i,/never imply aftermath footage depicts the strike/i,/first, middle and last/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director'},{planning}).includes(lesson.rule));
});
test('action lessons reject posed tableaux and split overloaded claims into readable shots',()=>{
 assert.ok(policy.DIRECTOR_POLICY_VERSION>=7);
 const lesson=policy.DIRECTOR_LESSONS.find(x=>x.id==='visible-action');assert.ok(lesson);
 for(const pattern of [/body orientation/i,/object state/i,/posed face-off/i,/completed aftermath/i,/manageable number/i,/multi-sector/i,/separate shots/i])assert.match(lesson.rule,pattern);
 for(const planning of [true,false])assert.ok(policy.directorPrompt({mediaKind:'director'},{planning}).includes(lesson.rule));
});
test('numeric fragments and units omitted from either anchor or display cannot become factual overlays',()=>{
 const n='The tank held 2.3 million litres of molasses.';
 for(const value of ['3 million litres','2','2.3 million']) assert.equal(policy.validateDirectorOverlay({value,label:'molasses',anchorQuote:n,position:'left'},n),null,value);
 assert.equal(policy.validateDirectorOverlay({value:'2.3 million',label:'molasses',anchorQuote:'The tank held 2.3 million',position:'left'},n),null);
 const tr='Depo 50 santimetre yüksekliğindeydi.';
 assert.equal(policy.validateDirectorOverlay({value:'50',label:'Depo',anchorQuote:tr,position:'left'},tr),null);
 assert.equal(policy.validateDirectorOverlay({value:'50 santimetre',label:'Depo',anchorQuote:tr,position:'left'},tr)?.value,'50 santimetre');
 for(const sign of ['-','−','+','±']){
  const signed=`The temperature fell to ${sign}5 degrees Celsius overnight.`;
  assert.equal(policy.validateDirectorOverlay({value:'5 degrees Celsius',label:'temperature',anchorQuote:signed,position:'left'},signed),null);
  assert.equal(policy.validateDirectorOverlay({value:`${sign}5 degrees Celsius`,label:'temperature',anchorQuote:signed,position:'left'},signed)?.value,`${sign}5 degrees Celsius`);
 }
});
