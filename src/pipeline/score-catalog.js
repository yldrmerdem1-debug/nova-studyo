import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {MUSIC_DIR} from '../util.js';

const CATALOG_FILE=path.join(MUSIC_DIR,'music-provenance.json');
const catalogCache=new Map();
const hashCache=new Map();

export function getScoreCatalog(catalogFile=CATALOG_FILE) {
  try {
    const stat=fs.statSync(catalogFile),signature=`${stat.size}:${stat.mtimeMs}`;
    const previous=catalogCache.get(catalogFile);
    if(previous?.signature===signature) return previous.records;
    const raw=JSON.parse(fs.readFileSync(catalogFile,'utf8').replace(/^\uFEFF/,''));
    const records=raw.filter(x=>x && x.file && x.title && x.artist && x.sourceUrl && x.licenseUrl)
      .map(x=>Object.freeze({...x,file:path.basename(x.file)}));
    catalogCache.set(catalogFile,{signature,records});
    return records;
  } catch { return []; }
}

function verifiedHash(file,expected) {
  if(!expected) return true;
  try {
    const stat=fs.statSync(file),signature=`${stat.size}:${stat.mtimeMs}`;
    const previous=hashCache.get(file);
    const actual=previous?.signature===signature ? previous.hash : crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    hashCache.set(file,{signature,hash:actual});
    return actual.toLowerCase()===String(expected).toLowerCase();
  } catch { return false; }
}

export function scoreProvenanceForFile(file,{catalogFile=CATALOG_FILE}={}) {
  const name=path.basename(String(file||'')).toLowerCase();
  const record=getScoreCatalog(catalogFile).find(x=>x.file.toLowerCase()===name);
  if(!record) return null;
  const actualPath=path.isAbsolute(String(file||'')) ? String(file) : path.join(path.dirname(catalogFile),record.file);
  return verifiedHash(actualPath,record.sha256) ? record : null;
}

export function scoreMoodForSection(job,index) {
  const plan=job?.editorialPlan;
  const sections=Array.isArray(plan?.sections)?plan.sections:Array.isArray(plan)?plan:[];
  const indexed=sections.some(s=>Number.isInteger(s?.index));
  const section=indexed ? sections.find(s=>s?.index===index) : sections[index];
  return [section?.scoreMood,section?.musicMood,section?.mood,section?.title,section?.text,section?.reason]
    .filter(Boolean).join(' ').trim().toLowerCase();
}
