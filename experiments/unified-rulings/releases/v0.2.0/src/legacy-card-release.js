// Legacy format, separate reviewed access. No Riot adapter, source rewrite or activation.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const names=['rules.json','cards.json','judge-cases.json'];
const mode='reviewed-legacy-cards';
const flags=['rulesDisplay','rulesModelInput','cardsDisplay','cardsModelInput','koreanDisplay','koreanModelInput','images','judgeCases','externalJudge','sourceTranslations'];
function reference(v){return typeof v==='string'&&v.trim().length>=3&&v.length<=500&&!/\[[^\]]+\]|<[^>]+>|unverified|pending|미확정/i.test(v);}
function reviewScope(manifest){
  const entry=manifest?.sources?.legacyRelease;if(!entry)return null;
  const r=entry.review;
  if(entry.mode!==mode||r?.status!=='verified'||!reference(r.reference)||!/^[a-f0-9]{40}$/.test(r.commit||'')||!names.every(n=>/^[a-f0-9]{64}$/.test(r.hashes?.[n]||'')&&r.hashes[n]===manifest.hashes?.[n])||!flags.every(n=>typeof r.grants?.[n]==='boolean')||r.grants.rulesDisplay!==true||r.grants.cardsDisplay!==true||flags.some(n=>r.grants[n]&&!reference(r.references?.[n])))throw Error('Legacy access review is missing, stale or incomplete.');
  if(r.grants.koreanModelInput&&!r.grants.koreanDisplay||r.grants.cardsModelInput&&!r.grants.rulesModelInput)throw Error('Legacy model/display grants conflict.');
  return Object.freeze({...r.grants,reference:r.reference,commit:r.commit,reviewHash:hash(JSON.stringify(r))});
}
function noLinks(file){for(let p=path.resolve(file);;p=path.dirname(p)){try{const s=fs.lstatSync(p);if(s.isSymbolicLink())throw Error('Knowledge paths must not be links.');}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(p)===p)break;}}
function read(file){noLinks(file);const s=fs.statSync(file);if(!s.isFile()||s.nlink!==1||s.size>32*1024*1024)throw Error('Invalid public knowledge file.');return fs.readFileSync(file);}
async function prepareLegacyKnowledge(sourceRoot,destination,review){
  const src=path.resolve(sourceRoot),dst=path.resolve(destination);if(src===dst||dst.startsWith(src+path.sep)||src.startsWith(dst+path.sep))throw Error('Source and candidate must be separate.');
  noLinks(destination);if(fs.existsSync(destination))throw Error('Choose a fresh candidate; existing data is never overwritten.');
  const pointerBytes=read(path.join(sourceRoot,'knowledge-releases/active.json')),pointer=JSON.parse(pointerBytes);
  if(!require('./knowledge-provider').safeId(pointer.releaseId))throw Error('Invalid source pointer.');
  const source=path.join(sourceRoot,'knowledge-releases',pointer.releaseId),manifestBytes=read(path.join(source,'manifest.json')),old=JSON.parse(manifestBytes);
  if(old.sources?.minimumRelease||old.sources?.development?.syntheticCards)throw Error('A rules-only or synthetic replacement is not a legacy source.');
  // Validate the old manifest, IDs, hashes, versioned rules and full card format.
  await require('./knowledge-provider').loadRelease(sourceRoot,pointer.releaseId);
  const bytes=Object.fromEntries(names.map(n=>[n,read(path.join(source,n))])),hashes=Object.fromEntries(names.map(n=>[n,hash(bytes[n])]));
  if(names.some(n=>hashes[n]!==old.hashes?.[n]))throw Error('Source changed during candidate preparation.');
  const cards=JSON.parse(bytes['cards.json']);if(!cards.cards.length)throw Error('The v0.2.0 legacy release must retain cards.');
  const releaseId='legacy-'+hash(JSON.stringify({hashes,review})).slice(0,24);
  const manifest={...old,releaseId,reviewRequired:true,sources:{...old.sources,legacyRelease:{mode,
    source:{releaseId:pointer.releaseId,pointerSha256:hash(pointerBytes),manifestSha256:hash(manifestBytes),catalogVersion:cards.version},review}}};
  const access=reviewScope(manifest);
  if(hash(read(path.join(sourceRoot,'knowledge-releases/active.json')))!==hash(pointerBytes)||hash(read(path.join(source,'manifest.json')))!==hash(manifestBytes))throw Error('Source pointer/manifest changed.');
  fs.mkdirSync(destination,{mode:0o700});
  const dir=path.join(destination,'knowledge-releases',releaseId);fs.mkdirSync(dir,{recursive:true,mode:0o700});
  for(const n of names)fs.writeFileSync(path.join(dir,n),bytes[n],{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o600});
  fs.writeFileSync(path.join(destination,'knowledge-releases/active.json'),JSON.stringify({releaseId})+'\n',{flag:'wx',mode:0o600});
  return{releaseId,cards:cards.cards.length,catalogVersion:cards.version,hashes,access,
    rawDatasetBytesPreserved:true,sourcePointerChanged:false,sourceDataChanged:false,userDataRead:false,authorizedToDeploy:false};
}
// Existing exposure ceiling, not a license or a verified rights review.
function preservedScope(manifest, manifestSha256) {
  if(process.env.RIFTASSI_PUBLICATION_MODE!=='preserve-existing')return null;
  const pin=process.env.RIFTASSI_LEGACY_BASELINE_SHA256;
  if(!/^[a-f0-9]{64}$/.test(pin||'')||manifestSha256!==pin||manifest.sources?.legacyRelease
    ||manifest.sources?.minimumRelease||manifest.sources?.development
    ||!names.every(n=>/^[a-f0-9]{64}$/.test(manifest.hashes?.[n]||'')))
    throw Error('Existing deployment dataset does not match the pinned baseline.');
  return Object.freeze({rulesDisplay:true,rulesModelInput:true,cardsDisplay:true,cardsModelInput:true,
    koreanDisplay:true,koreanModelInput:true,images:false,judgeCases:true,externalJudge:false,sourceTranslations:false,
    basis:'existing-deployment-ceiling',imagePolicy:'v0.1.7-pinned-catalog',rightsVerified:false,reviewHash:pin});
}
module.exports={mode,flags,reviewScope,prepareLegacyKnowledge,preservedScope};
