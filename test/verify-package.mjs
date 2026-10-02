import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import asar from '@electron/asar';
const archive=path.resolve('dist/win-unpacked/resources/app.asar');
const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else files.push(p);}}
for(const dir of ['src','public','electron'])walk(dir);
files.push('server.js');
const mismatches=[];const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const file of files){try{if(hash(fs.readFileSync(file))!==hash(asar.extractFile(archive,path.normalize(file))))mismatches.push(file);}catch{mismatches.push(file);}}
const packagePaths=asar.listPackage(archive);
const packedPackage=JSON.parse(asar.extractFile(archive,'package.json')),sourcePackage=JSON.parse(fs.readFileSync('package.json','utf8'));
// electron-builder intentionally removes scripts, devDependencies and build config.
for(const key of Object.keys(packedPackage))if(JSON.stringify(packedPackage[key])!==JSON.stringify(sourcePackage[key]))mismatches.push('package.json:'+key);
const dataFiles=packagePaths.filter(p=>/^[/\\]data[/\\]/.test(p));
const result={version:JSON.parse(asar.extractFile(archive,'package.json')).version,checkedFiles:files.length,mismatches,dataFiles,checkedAt:new Date().toISOString()};
fs.writeFileSync('docs/superpowers/reports/package-verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));if(mismatches.length||dataFiles.length)process.exitCode=1;
