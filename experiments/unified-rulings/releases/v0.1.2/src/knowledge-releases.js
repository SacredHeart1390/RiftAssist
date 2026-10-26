const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {validateRules,loadRelease,digest,safeId}=require('./knowledge-provider');
const {normalizeCatalog}=require('./cards');

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

async function activateRelease(root,nextId,expectedId,{acknowledgeReview=false}={}) {
  if(!safeId(nextId)||typeof expectedId!=='string')throw new Error('An explicit expected version is required.');
  const folder=path.join(root,'knowledge-releases');await fs.mkdir(folder,{recursive:true});
  const lock=path.join(folder,'.activation-lock');
  await fs.mkdir(lock); // Existing lock is never stolen from another activation.
  try {
    let previous={releaseId:'legacy-unvalidated'};
    try{previous=JSON.parse(await fs.readFile(path.join(folder,'active.json'),'utf8'));}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(previous.releaseId!==expectedId)throw new Error('Active version changed; refresh before applying.');
    const next=await loadRelease(root,nextId);
    if(next.manifest.reviewRequired&&!acknowledgeReview)throw new Error('This release requires operator review.');
    const value={releaseId:nextId,previousReleaseId:previous.releaseId,activatedAt:new Date().toISOString()};
    const temporary=path.join(folder,`active.${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temporary,JSON.stringify(value));
    await fs.rename(temporary,path.join(folder,'active.json'));
    return value;
  } finally {await fs.rmdir(lock);}
}
module.exports={stageRelease,activateRelease};
