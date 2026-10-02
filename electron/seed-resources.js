import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const CATALOG='music-provenance.json';
const stat=file=>{try{return fs.lstatSync(file);}catch(e){if(e.code==='ENOENT')return null;throw e;}};
function noLinks(file) {
  const absolute=path.resolve(file),root=path.parse(absolute).root;
  let current=root;
  for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    if(stat(current)?.isSymbolicLink())return false;
  }
  return true;
}
function catalogName(record) {
  if(typeof record?.file!=='string'||record.file.split(/[\\/]/).includes('..'))return null;
  const name=path.win32.basename(record.file);
  return name && name!=='.' && !/[<>:"|?*\x00-\x1f]/.test(name) ? name : null;
}
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function readCatalog(file) {
  const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  if(!Array.isArray(data))throw new Error('Provenance catalog must be an array');
  return data;
}

/** Seed upgrades additively: existing audio and user metadata always win. */
export function seedBundledResources(resourcesDir,homeDir) {
  const warnings=[];
  const attempt=fn=>{try{fn();}catch(e){warnings.push(e.message);}};
  function copyMissing(source,dest) {
    if(!noLinks(source)||!noLinks(dest))return;
    const sourceStat=stat(source),destStat=stat(dest);
    if(!sourceStat)return;
    if(sourceStat.isDirectory()) {
      if(destStat&&!destStat.isDirectory())return;
      if(!destStat)fs.mkdirSync(dest,{recursive:true});
      for(const entry of fs.readdirSync(source,{withFileTypes:true})) {
        if(entry.isSymbolicLink()||entry.name===CATALOG)continue;
        attempt(()=>copyMissing(path.join(source,entry.name),path.join(dest,entry.name)));
      }
    }else if(sourceStat.isFile()&&!destStat) {
      fs.copyFileSync(source,dest,fs.constants.COPYFILE_EXCL);
    }
  }
  for(const name of ['music','assets']) attempt(()=>copyMissing(path.join(resourcesDir,name),path.join(homeDir,name)));

  attempt(()=>{
    const source=path.join(resourcesDir,'music'),dest=path.join(homeDir,'music');
    const sourceCatalog=path.join(source,CATALOG),destCatalog=path.join(dest,CATALOG);
    if(!noLinks(sourceCatalog)||!noLinks(destCatalog)||!stat(sourceCatalog)?.isFile()||!stat(dest)?.isDirectory())return;
    const existing=stat(destCatalog);
    if(existing&&!existing.isFile())return;
    const records=existing?readCatalog(destCatalog):[];
    const known=new Set(records.map(catalogName).filter(Boolean).map(n=>n.toLowerCase()));
    const added=[];
    for(const record of readCatalog(sourceCatalog)) {
      const name=catalogName(record);
      if(!name||known.has(name.toLowerCase()))continue;
      const bundled=path.join(source,name),installed=path.join(dest,name);
      if(!noLinks(bundled)||!noLinks(installed)||!stat(bundled)?.isFile()||!stat(installed)?.isFile())continue;
      // A same-named user replacement must not receive the bundled track's credit.
      if(hash(bundled)!==hash(installed))continue;
      added.push({...record,file:name});known.add(name.toLowerCase());
    }
    if(added.length||!existing) {
      // Preserve the original before updating metadata; never overwrite a backup.
      if(existing) {
        const backup=destCatalog+'.before-seed';
        if(!stat(backup))fs.copyFileSync(destCatalog,backup,fs.constants.COPYFILE_EXCL);
      }
      fs.writeFileSync(destCatalog,JSON.stringify([...records,...added],null,2)+'\n',{flag:existing?'w':'wx'});
    }
  });
  return {warnings};
}
