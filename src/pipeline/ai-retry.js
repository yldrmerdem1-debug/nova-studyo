import fs from 'node:fs';
import path from 'node:path';
import {writeJson} from '../util.js';

const RETRYABLE=new Set(['failed','uncertain','rejected','budget']);
/** Prepare without writes, so invalid combined editor patches cannot reset paid history. */
export function prepareAiFailureRetry(dir) {
 const file=path.join(dir,'automatic-editor','generation-ledger.json');
 if(!fs.existsSync(file))return {count:0,commit(){}};
 const ledger=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!ledger||typeof ledger.entries!=='object'||Array.isArray(ledger.entries)||!Number.isFinite(ledger.estimatedReservedUsd))throw Error('AI üretim günlüğü geçersiz; geçmiş rezervler korunarak kontrol edilmeli.');
 let count=0;
 for(const entries of [ledger.entries,ledger.legacyByBeat||{}])for(const entry of Object.values(entries)) {
  if(!entry||!RETRYABLE.has(entry.status))continue;
  const last=entry.attempts?.at(-1),candidate=entry.media||last?.media;
  // A completed candidate can safely resume its audit without paying to regenerate it.
  if(candidate?.file&&fs.existsSync(candidate.file)&&last?.status!=='rejected'&&entry.status!=='rejected')continue;
  const {history=[],...prior}=entry;
  entry.history=[...history,{...structuredClone(prior),retriedAt:new Date().toISOString()}];
  entry.retryGeneration=(Number(entry.retryGeneration)||0)+1;
  entry.status='planned';entry.attempts=[];
  delete entry.media;delete entry.auditKey;
  count++;
 }
 return {count,commit(){if(count)writeJson(file,ledger);}};
}
