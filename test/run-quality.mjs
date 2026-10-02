import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Every standard quality run gets fresh storage, regardless of the caller's
// current NOVA_HOME. Real projects, credentials and music never enter fixtures.
const home=fs.mkdtempSync(path.join(os.tmpdir(),'nova-quality-review-'));
const suites=[
 'director-mode','director-policy','short-hook','director-editor','director-picks','director-shot-review','director-shot-review-ui','director-provenance-transition','director-render','director-output','portrait-subtitles','subject-aware-crop',
 'automatic-editor','editorial-audit','editorial-coverage','automatic-score','encoded-peak','grade-archive','seed-resources',
 'settings-contract','studio-api','studio-timing','studio-publication',
 'editorial-llm','editorial-budget-editor','editorial-engagement','editorial-provenance',
 'recovery-backend','recovery-cache','recovery-provider-snapshot','openai-images','openai-vision-review','portrait-thumbnail',
 'pro-style','pro-edit-cache','pro-audio-motion','pro-render','kurgu-masasi','akilli-render','plan-onizleme',
 'postflight','audience','speech-check','review-record','script-proofread-language','eleven-errors','cumle-hizasi',
 'editorial-motion','editorial-restraint','editorial-controls','editorial-audio','editorial-render','production-modes','production-modes-render',
 'video-first-longform','motion-direction','video-audit-contact-sheet','video-consistency-background'
];
const child=spawn(process.execPath,['--test','--test-concurrency=1',...suites.map(s=>`test/${s}.test.mjs`)],{
 cwd:fileURLToPath(new URL('..',import.meta.url)),
 env:{...process.env,NOVA_HOME:home,TEMP:home,TMP:home},stdio:'inherit',windowsHide:true
});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',(code)=>{console.log(`Quality fixtures: ${home}`);process.exitCode=code??1;});
