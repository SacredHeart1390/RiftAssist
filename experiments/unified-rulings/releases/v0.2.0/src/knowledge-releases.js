const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {validateRules,loadRelease,digest,safeId}=require('./knowledge-provider');
const {normalizeCatalog}=require('./cards');
const {checkReviewAuthorization}=require('./card-review-authorization');
const {hash}=require('./card-translation-core');

async function stageRelease(root,{rules,cards,judgeCases=[],sources={},effectiveFrom=null,parserVersion='unknown',reviewRequired=false}) {
  validateRules(rules);normalizeCatalog(cards);
  if(!Array.isArray(judgeCases))throw new Error('Q&A must be an array.');
  const ids=new Set();
  for(const item of judgeCases) {
    if(!item.id||ids.has(String(item.id))||typeof item.question!=='string'||typeof item.answer!=='string')throw new Error('Invalid or duplicate Q&A.');
    ids.add(String(item.id));
  }
  const ruleMap=new Map(rules.map(i=>[i.id,i]));
  const copyLimit=ruleMap.get('core-rules:103.3.b');
  if(!copyLimit||!/(?:same named|같은 이름)/iu.test((copyLimit.officialTextEn||'')+' '+(copyLimit.officialTextKo||'')))throw new Error('Deck-limit sentinel requires mapping review.');
  const box=ruleMap.get('tournament-rules:703.4.a.5'),profession=ruleMap.get('tournament-rules:703.4.c.5');
  if(!box||!/deck box/iu.test(box.officialTextEn)||!profession||!/703\.4\.a\.5/iu.test(profession.officialTextEn))throw new Error('Tournament rule context is incomplete; rebuild PDF extraction.');
  const id=`${new Date().toISOString().slice(0,10)}-${crypto.randomBytes(6).toString('hex')}`;
  const directory=path.join(root,'knowledge-releases',id);
  await fs.mkdir(directory,{recursive:true});
  const files={'rules.json':rules,'cards.json':cards,'judge-cases.json':judgeCases},hashes={};
  for(const [name,data] of Object.entries(files)) {
    const bytes=Buffer.from(JSON.stringify(data));
    await fs.writeFile(path.join(directory,name),bytes,{flag:'wx'});hashes[name]=digest(bytes);
  }
  const manifest={schemaVersion:1,compatibleSchema:2,releaseId:id,createdAt:new Date().toISOString(),effectiveFrom,
    parserVersion,validationStatus:'validated',reviewRequired,sources,hashes,
    counts:{rules:rules.length,cards:cards.cards.length,judgeCases:judgeCases.length}};
  await fs.writeFile(path.join(directory,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx'});
  return manifest;
}

async function activateRelease(root,nextId,expectedId,{acknowledgeReview=false,reviewAuthorization=null,autoAuthorization=null}={}) {
  if(!safeId(nextId)||typeof expectedId!=='string')throw new Error('An explicit expected version is required.');
  const folder=path.join(root,'knowledge-releases');await fs.mkdir(folder,{recursive:true});
  const lock=path.join(folder,'.activation-lock');
  try { await fs.mkdir(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8')); } catch { throw new Error('Activation lock needs inspection.'); }
    let alive = true;
    try { process.kill(owner.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
    if (alive || !Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error('Another activation is in progress.');
    // Atomically claim cleanup, so two recovery attempts cannot delete a new owner's lock.
    const recovery = await fs.open(path.join(lock, 'recovery'), 'wx'); await recovery.close();
    await fs.unlink(path.join(lock, 'owner.json')); await fs.unlink(path.join(lock, 'recovery')); await fs.rmdir(lock);
    await fs.mkdir(lock);
  }
  await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
  try {
    let previous={releaseId:'legacy-unvalidated'};
    try{previous=JSON.parse(await fs.readFile(path.join(folder,'active.json'),'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(previous.releaseId!==expectedId)throw new Error('Active version changed; refresh before applying.');
    const next=await loadRelease(root,nextId);
    const reviewAction=checkReviewAuthorization(reviewAuthorization,root,nextId,expectedId,hash(next.manifest));
    const autoAction=require('./riftnaru-auto-release').checkAutoAuthorization(autoAuthorization,root,nextId,expectedId,hash(next.manifest));
    if(reviewAction!=='rollback' && next.manifest.sources?.cardTranslation?.baseReleaseId && next.manifest.sources.cardTranslation.baseReleaseId!==previous.releaseId)throw new Error('Translation candidate base changed; rebuild and review it.');
    if(next.manifest.reviewRequired&&!acknowledgeReview)throw new Error('This release requires operator review.');
    const marked=await fs.stat(path.join(root,'.riftassist-environment.json')).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
    let cardChange=false;
    if(marked) {
      if(autoAction==='rollback')cardChange=true;
      else if(previous.releaseId==='legacy-unvalidated')cardChange=next.cardCatalog.cards.length>0;
      else {
        const current=await loadRelease(root,previous.releaseId);
        cardChange=digest(JSON.stringify(current.cardCatalog.cards))!==digest(JSON.stringify(next.cardCatalog.cards));
      }
    }
    if((cardChange || next.manifest.sources?.cardTranslation || next.manifest.sources?.cardSync || next.manifest.sources?.cardReview || /^review-[a-f0-9]{64}$/u.test(previous.releaseId)) && !reviewAction&&!autoAction)throw new Error('Card candidates require the authenticated final review interface.');
    const value={releaseId:nextId,previousReleaseId:previous.releaseId,activatedAt:new Date().toISOString()};
    const temporary=path.join(folder,`active.${crypto.randomUUID()}.tmp`);
    try {
      const fd=await fs.open(temporary,'wx',0o640);
      try {await fd.writeFile(JSON.stringify(value));await fd.sync();} finally {await fd.close();}
      await fs.rename(temporary,path.join(folder,'active.json'));
      if(process.platform!=='win32'){const dir=await fs.open(folder,'r');try{await dir.sync();}finally{await dir.close();}}
    } finally {await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    return value;
  } finally {await fs.unlink(path.join(lock,'owner.json')); await fs.rmdir(lock);}
}
module.exports={stageRelease,activateRelease};
