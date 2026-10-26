// Builds a candidate release only. Never writes the live evidence.json or active pointer.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {extractRules,PARSER_VERSION} from '../src/pdf-rules.mjs';
const require=createRequire(import.meta.url);
const {DATA_ROOT}=require('../src/paths');
const {stageRelease}=require('../src/knowledge-releases');
const arg=(name)=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const pdfDirectory=arg('--pdf-dir'),modulePath=arg('--pdfjs');
if(!pdfDirectory||!modulePath)throw new Error('Provide --pdf-dir and --pdfjs; this command only stages data.');
const pdfjs=await import(pathToFileURL(path.resolve(modulePath)).href);
const old=JSON.parse(await fs.readFile(path.join(DATA_ROOT,'knowledge/evidence.json'),'utf8'));
const cards=JSON.parse(await fs.readFile(path.join(DATA_ROOT,'knowledge/cards.json'),'utf8'));
const rules=old.filter(i=>!['core-rules','tournament-rules'].includes(i.documentId));
const summary=[];
for(const [id,prefix] of [['core-rules','core'],['tournament-rules','tournament']]) {
  const previous=old.filter(i=>i.documentId===id);
  const base=previous[0];
  if(!base)throw new Error(`Missing source metadata for ${id}`);
  const [en,ko]=await Promise.all(['en','ko'].map(lang=>extractRules(pdfjs,path.join(pdfDirectory,`${prefix}-${lang}.pdf`))));
  // The input files must be the already downloaded October 9 originals, not arbitrary renamed PDFs.
  const pageOne=await pdfjs.getDocument({data:new Uint8Array(await fs.readFile(path.join(pdfDirectory,`${prefix}-en.pdf`)))}).promise;
  const header=(await (await pageOne.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');
  await pageOne.destroy();
  if(!/(?:October\s+9,?\s+2026|2026-10-09)/iu.test(header))throw new Error('Local PDF version does not match recorded metadata.');
  for(const ruleId of new Set([...en.rules.keys(),...ko.rules.keys()])) {
    const e=en.rules.get(ruleId),k=ko.rules.get(ruleId);
    rules.push({...base,id:`${id}:${ruleId}`,ruleId,title:`${base.sourceName} · ${ruleId}`,
      officialTextEn:e?.text||'',officialTextKo:k?.text||'',pageEn:e?.page||null,pageKo:k?.page||null,
      parentId:e?.parentId||k?.parentId||null,parserVersion:PARSER_VERSION,
      url:base.url.replace(/#.*$/u,`#r-${ruleId}`),
      pdfUrlEn:base.pdfUrlEn.split('#')[0]+(e?`#page=${e.page}`:''),
      pdfUrlKo:base.pdfUrlKo.split('#')[0]+(k?`#page=${k.page}`:''),
      retrievedAt:base.retrievedAt,reindexedAt:new Date().toISOString()});
  }
  summary.push({id,old:previous.length,en:en.rules.size,ko:ko.rules.size});
}
const manifest=await stageRelease(DATA_ROOT,{rules,cards,parserVersion:PARSER_VERSION,reviewRequired:true,
  sources:{core:{version:'2026-10-09',reindexed:true},tournament:{version:'2026-10-09',reindexed:true},
    supplements:{preserved:true},riftnaru:{version:cards.version},riftjudge:{coverage:'live-search-only'}}});
console.log(JSON.stringify({staged:manifest.releaseId,activeChanged:false,summary,counts:manifest.counts}));
