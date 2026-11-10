// No provider calls or bundle build. Render the real component from an explicitly supplied bundle.
// Example: node scripts/ui-card-regression.mjs --bundle-dir build/bundle --output-dir ../../../quality-review/ui-card-green
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { selectComposition, renderStill } from '@remotion/renderer';

const engine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = key => { const i = args.indexOf(key); return i >= 0 ? args[i+1] : null; };
if (!arg('--bundle-dir') || !arg('--output-dir')) throw new Error('Supply --bundle-dir and --output-dir. No build, download or provider access is performed.');
const bundle = path.resolve(arg('--bundle-dir'));
const out = path.resolve(arg('--output-dir'));
const publicDir = path.resolve(arg('--public-dir') || path.join(engine, 'public'));
if (!fs.existsSync(path.join(bundle,'index.html'))) throw new Error('Existing bundle not found.');
const walk = d => fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
const browserExecutable = arg('--browser-executable') || walk(path.join(engine,'node_modules/.remotion/chrome-headless-shell')).find(f=>f.endsWith('chrome-headless-shell.exe'));
if (!browserExecutable || !fs.existsSync(browserExecutable)) throw new Error('Existing browser not found; downloads are disabled for this test.');
fs.mkdirSync(out,{recursive:true});
// Copy code into a QA-owned site so native cleanup or future build swaps cannot change it mid-test.
const site = fs.mkdtempSync(path.join(out,'site-'));
for (const f of fs.readdirSync(bundle)) if (f !== 'public') fs.cpSync(path.join(bundle,f),path.join(site,f),{recursive:true});
fs.symlinkSync(publicDir,path.join(site,'public'),process.platform==='win32'?'junction':'dir');
const base = {type:'ui-card',kind:'form',title:'UNKNOWN SCORE 0-9',sub:'Editorial scale',dur:4,
  rows:[{label:'Remains'},{label:'Search area'},{label:'Official cause'},{label:'Witnesses'},{label:'Failed searches'}]};
const fixtures = [{name:'missing-highlight',scene:base},{name:'invalid-highlight',scene:{...base,highlight:99}},
  {name:'valid-highlight-zero',scene:{...base,highlight:0}}];
const results=[];
for (const fixture of fixtures) {
  const inputProps={script:{id:'ui-card-highlight-regression',genre:'documentary',locale:'en-US',
    topic:{motif:'case-file',params:{}},look:{variant:'newsprint-paper'},scenes:[fixture.scene]}};
  const output=path.join(out,fixture.name+'.png');
  try {
    const options={serveUrl:site,inputProps,browserExecutable,chromiumOptions:{gl:null},logLevel:'error'};
    const composition=await selectComposition({...options,id:'video'});
    await renderStill({...options,composition,frame:60,output,overwrite:true});
    const bytes=fs.readFileSync(output);
    if (bytes.length < 1000) throw new Error('Rendered frame is unexpectedly empty.');
    results.push({name:fixture.name,pass:true,output,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  } catch (e) {
    results.push({name:fixture.name,pass:false,message:e.message,stack:e.stack});
  }
  console.log(JSON.stringify({name:fixture.name,pass:results.at(-1).pass,message:results.at(-1).message}));
}
const report={measuredAt:new Date().toISOString(),bundle,site,publicDir,browserExecutable,
  providerCalls:false,sourceMutation:false,fixtureFrame:60,results,passed:results.every(r=>r.pass)};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
if (!report.passed) process.exitCode=1;
