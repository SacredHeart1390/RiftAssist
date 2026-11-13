const fs=require('node:fs/promises'),syncFs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {mergeRiftnaruCatalog,imageIdentity}=require('./riftnaru-refresh');
const A=require('./riftnaru-auto-release'),S=require('./riftnaru-source'),{createHttp,SourceError}=require('./riftnaru-http');
async function atomic(file,value){const temp=file+'.'+crypto.randomUUID()+'.pending',fd=await fs.open(temp,'wx',0o640);try{await fd.writeFile(JSON.stringify(value));await fd.sync();}finally{await fd.close();}await fs.rename(temp,file);}
async function lock(directory){const folder=path.join(directory,'.run-lock'),owner=path.join(folder,'owner.json');try{await fs.mkdir(folder);}catch(e){if(e.code!=='EEXIST')throw e;let previous;try{previous=JSON.parse(await fs.readFile(owner));}catch{throw Error('sync-lock-needs-inspection');}try{process.kill(previous.pid,0);return null;}catch(e){if(e.code!=='ESRCH')return null;}const bytes=await fs.readFile(owner);if(A.hash(bytes)!==A.hash(JSON.stringify(previous)))throw Error('sync-lock-owner-drift');const claim=await fs.open(path.join(folder,'recovery'),'wx');await claim.close();await fs.unlink(owner);await fs.unlink(path.join(folder,'recovery'));await fs.rmdir(folder);await fs.mkdir(folder);}
 const token={pid:process.pid,nonce:crypto.randomUUID()};await fs.writeFile(owner,JSON.stringify(token),{flag:'wx',mode:0o600});return async()=>{if(A.canonical(JSON.parse(await fs.readFile(owner)))!==A.canonical(token))throw Error('sync-lock-owner-drift');await fs.unlink(owner);await fs.rmdir(folder);};}
function planRotation(state,index,limit){
 const sorted=[...index].sort((a,b)=>a.id.localeCompare(b.id));const priority=sorted.filter(c=>!state.cards[c.id]||state.cards[c.id].failure||state.cards[c.id].publishedHash!==S.fingerprint(c));const plan=[],seen=new Set();
 for(const c of priority.slice(0,limit)){plan.push({id:c.id,cursor:state.cursor||0});seen.add(c.id);}
 let cursor=(state.cursor||0)%sorted.length,scanned=0;while(plan.length<Math.min(limit,sorted.length)&&scanned<sorted.length){const c=sorted[cursor];cursor=(cursor+1)%sorted.length;scanned++;if(!seen.has(c.id)){plan.push({id:c.id,cursor});seen.add(c.id);}}
 return plan;
}
async function backupRelease(root,stateDir,id){const release=A.readReleaseFiles(root,id),directory=path.join(stateDir,'backups',id),destination=path.join(directory,'knowledge-releases',id);await fs.mkdir(destination,{recursive:true,mode:0o750});
 for(const name of ['manifest.json','cards.json','rules.json','judge-cases.json']){const source=path.join(release.dir,name),target=path.join(destination,name);try{await fs.copyFile(source,target,syncFs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}if(A.hash(A.regular(source))!==A.hash(A.regular(target)))throw Error('sync-backup-hash');}
 const restored=A.readReleaseFiles(directory,id);if(restored.manifestHash!==release.manifestHash)throw Error('sync-backup-validation');require('./cards').normalizeCatalog(restored.cards);await atomic(path.join(directory,'active.json'),{releaseId:id});return directory;
}
async function runSync({root,stateDir,seedFile,source=null,now=()=>new Date(),readOnly=false,reloadCheck=null}={}){
 const policy=A.readPolicy(root);if(process.getuid?.()!==policy.uid)throw Error('sync-process-identity');await fs.mkdir(stateDir,{recursive:true,mode:0o750});const unlock=await lock(stateDir);if(!unlock)return {status:'busy',checked:0};
 let state,checked=0;const stateFile=path.join(stateDir,'state.json'),started=now().toISOString(),pointer=()=>JSON.parse(A.regular(path.join(root,'knowledge-releases/active.json'))),active=()=>A.readReleaseFiles(root,pointer().releaseId);
 const save=()=>atomic(stateFile,state);
 async function confirmReload(id){if(reloadCheck){if(!await reloadCheck(id))throw Error('sync-app-reload-failed');return;}let cookie='';for(let n=0;n<8;n++){await new Promise(ok=>setTimeout(ok,10000));try{const r=await fetch(policy.healthUrl,{signal:AbortSignal.timeout(4000),redirect:'error',headers:cookie?{Cookie:cookie}:{}});if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];if(r.ok){const h=await r.json();if(h.knowledge?.releaseId===id&&!h.knowledge.lastError)return;}}catch{}}throw Error('sync-app-reload-failed');}
 async function finish(status,extra={}){const result={schemaVersion:1,status,startedAt:started,finishedAt:now().toISOString(),checked,changed:0,requests:source?.stats?.().requests||0,activeReleaseId:pointer().releaseId,...extra};await atomic(path.join(root,'knowledge-releases/riftnaru-sync-status.json'),result);await fs.appendFile(path.join(stateDir,'events.jsonl'),JSON.stringify(result)+'\n',{mode:0o600});return result;}
 try{
  try{state=JSON.parse(await fs.readFile(stateFile));if(state.schemaVersion!==1)throw Error('sync-state-schema');}catch(e){if(e.code!=='ENOENT')throw e;
   const bytes=A.regular(seedFile);if(A.hash(bytes)!==policy.seedSha256)throw Error('sync-seed-hash');const seed=JSON.parse(bytes),current=active();if(seed.cards.length!==current.cards.cards.length)throw Error('sync-seed-count');const ids=new Set(current.cards.cards.map(c=>c.id));state={schemaVersion:1,cursor:0,cards:{},httpCache:{},nextEligibleAt:policy.initialCooldownUntil||null,sourceBlocked:!!policy.initialCooldownUntil};
   for(const card of seed.cards){if(!ids.has('riftnaru:'+card.id)||state.cards[card.id])throw Error('sync-seed-identity');state.cards[card.id]={lastGood:{...card,fetchedAt:card.fetchedAt||seed.capturedAt},lastGoodAt:seed.capturedAt,lastDetailCheckedAt:null,publishedHash:S.fingerprint(card),failure:null};}await save();
  }
  if(state.intent){const p=pointer();if(p.releaseId===state.intent.releaseId){try{await require('./knowledge-provider').loadRelease(root,p.releaseId);await confirmReload(p.releaseId);const published=A.readReleaseFiles(root,p.releaseId);for(const c of published.cards.cards){const row=state.cards[c.id.slice(9)];if(row?.lastGood)row.publishedHash=S.fingerprint({...row.lastGood,...c,id:c.id.slice(9),cardId:row.lastGood.cardId,printingId:row.lastGood.printingId});}state.batch=null;}catch{await A.activateAutomatic(root,state.intent.previousReleaseId,p.releaseId,{rollback:true,authorizedManifest:state.intent.manifest});state.sourceBlocked=true;state.intent=null;await save();return finish('rolled-back',{error:'sync-interrupted-release-invalid'});}}state.intent=null;await save();}
  if(state.nextEligibleAt&&Date.parse(state.nextEligibleAt)>now().getTime())return finish('source-blocked',{error:'source-cooldown',nextEligibleAt:state.nextEligibleAt});
  if(!source){const cacheDir=path.join(stateDir,'http-cache');await fs.mkdir(cacheDir,{recursive:true,mode:0o750});const cache={async get(url){try{return JSON.parse(await fs.readFile(path.join(cacheDir,A.hash(url)+'.json')));}catch(e){if(e.code==='ENOENT')return null;throw e;}},async set(url,value){await atomic(path.join(cacheDir,A.hash(url)+'.json'),value);}};const http=createHttp({intervalMs:policy.intervalMs||4000,timeoutMs:policy.timeoutMs||20000,onCooldown:async(until,status)=>{state.nextEligibleAt=new Date(until).toISOString();state.sourceBlocked=true;state.lastHttpStatus=status;await save();}});source=S.createSource(http,{cache});}
  const current=active(),index=await source.list(state.cards),byId=new Map(index.cards.map(c=>[c.id,c]));
  if(index.cards.length!==byId.size||new Set(index.cards.map(c=>c.printingId)).size!==index.cards.length)throw Error('source-printing-collision');
  const existing=new Set(current.cards.cards.map(c=>c.id.slice(9))),missing=[...existing].filter(id=>!byId.has(id)),newCards=index.cards.filter(c=>!existing.has(c.id));
  const suspected=index.cards.filter(c=>!state.cards[c.id]||state.cards[c.id].publishedHash!==S.fingerprint(c));state.lastIndex={checkedAt:index.checkedAt,hash:index.hash,total:index.cards.length};
  if(missing.length){state.batch=null;await save();return finish('review-required',{error:'source-missing-suspected',missing:missing.length});}
  if(suspected.length>policy.limits.maxChanged||newCards.length>policy.limits.maxNew||suspected.length/Math.max(existing.size,1)>policy.limits.maxChangeRatio){state.riskHold={reason:'sync-mass-change',indexHash:index.hash,at:started};await save();return finish('review-required',{error:'sync-mass-change',suspected:suspected.length});}
  if(state.riskHold)return finish('review-required',{error:state.riskHold.reason});
  if(!state.batch||state.batch.indexHash!==index.hash||state.batch.baseReleaseId!==current.manifest.releaseId)state.batch={indexHash:index.hash,baseReleaseId:current.manifest.releaseId,plan:planRotation(state,index.cards,policy.detailLimit||220),position:0};
  while(state.batch.position<state.batch.plan.length&&checked<(policy.detailLimit||220)){
   const step=state.batch.plan[state.batch.position],listing=byId.get(step.id),old=state.cards[step.id];
   try{const snapshot=await source.detail({...listing,errata:old?.lastGood.errata||''},now().toISOString());if(snapshot.id!==listing.id||snapshot.printingId!==listing.printingId||snapshot.cardId!==listing.cardId||snapshot.publiclyObserved!==true)throw Error('source-detail-identity');
    const oldCard=current.cards.cards.find(c=>c.id==='riftnaru:'+listing.id);if(oldCard?.textEn&&!snapshot.textEn||oldCard?.textKo&&!snapshot.textKo)throw Error('sync-empty-field');
    if(oldCard?.errata&&!snapshot.errata)throw Error('sync-errata-missing');
    if(snapshot.imageUrl&&imageIdentity(snapshot.imageUrl)!==imageIdentity(oldCard?.imageUrl||'')){if(!await source.verifyImage(snapshot.imageUrl))throw Error('source-image-invalid');snapshot.imageVerified=true;}else snapshot.imageVerified=true;
    state.cards[step.id]={...old,lastGood:snapshot,lastGoodAt:snapshot.fetchedAt,lastDetailCheckedAt:now().toISOString(),lastSourceHash:S.fingerprint(snapshot),validation:'valid',failure:null,suspected:false};state.cursor=step.cursor;state.batch.position++;checked++;await save();
   }catch(e){state.cards[step.id]={...old,failure:{code:e.code||e.message||'source-detail-error',at:now().toISOString()},lastDetailCheckedAt:now().toISOString(),validation:'failed',suspected:true};await save();throw e;}
  }
  const rows=index.cards.map(c=>state.cards[c.id]?.lastGood);if(rows.some(c=>!c))throw Error('sync-detail-incomplete');
  if(rows.some(c=>S.fingerprint(c)!==S.fingerprint(byId.get(c.id))))throw Error('sync-detail-stale');
  const observation={schemaVersion:1,complete:true,capturedAt:now().toISOString(),sourceSyncedAt:index.sourceSyncedAt,coverage:`all-${rows.length}-artwork-listings-observed-public-page`,cards:rows};
  const merged=mergeRiftnaruCatalog(current.cards,observation);
  if(merged.report.held.length)throw Error('sync-manual-or-validation-conflict');
  const delta=A.validateDelta(current.cards,merged.catalog,policy);
  state.sourceBlocked=false;state.nextEligibleAt=null;
  if(readOnly){state.batch=null;await save();return finish('checked-read-only',{wouldChange:delta.changed,total:index.cards.length});}
  if(!delta.changed){for(const row of rows)state.cards[row.id].publishedHash=S.fingerprint(row);state.batch=null;await save();return finish('unchanged',{total:index.cards.length});}
  const disk=await fs.statfs(stateDir);if(Number(disk.bavail)*Number(disk.bsize)<(policy.minFreeBytes||1024*1024*1024))throw Error('sync-disk-budget');
  await backupRelease(root,stateDir,current.manifest.releaseId);
  const staged=await A.stageAutomatic(root,merged.catalog,A.hash(observation),A.regular(policy.signingKeyFile,32768));state.intent=staged;await save();
  try{
   await A.activateAutomatic(root,staged.releaseId,staged.previousReleaseId);
   await confirmReload(staged.releaseId);
  }catch(e){if(pointer().releaseId!==staged.releaseId){state.intent=null;await save();throw e;}await A.activateAutomatic(root,staged.previousReleaseId,staged.releaseId,{rollback:true,authorizedManifest:staged.manifest});state.intent=null;await save();return finish('rolled-back',{error:'sync-activation-or-reload-failed'});}
  for(const row of rows)state.cards[row.id].publishedHash=S.fingerprint(row);state.intent=null;state.batch=null;await save();return finish('activated',{changed:delta.changed,added:delta.added,total:index.cards.length,previousReleaseId:staged.previousReleaseId});
 }catch(e){if(state){if(e.retryAt)state.nextEligibleAt=new Date(e.retryAt).toISOString();state.sourceBlocked=true;if((e.code||e.message||'').includes('mass-change'))state.riskHold={reason:'sync-mass-change',at:started};await save();}return finish(e.status===403||e.status===401||e.status===429||e.retryAt?'source-blocked':'failed',{error:/^[a-z][a-z0-9-]{2,100}$/u.test(e.code||e.message||'')?(e.code||e.message):'sync-validation-or-network-error',...(state?.nextEligibleAt?{nextEligibleAt:state.nextEligibleAt}:{})});
 }finally{await unlock();}
}
module.exports={runSync,planRotation,atomic,lock,backupRelease};
