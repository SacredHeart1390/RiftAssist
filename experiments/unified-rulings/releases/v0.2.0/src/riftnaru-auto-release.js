// A signed, field-limited data capability. This is not a rights/license approval.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {normalizeCatalog}=require('./cards');
const ordered=v=>v&&typeof v==='object'?Array.isArray(v)?v.map(ordered):Object.fromEntries(Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>[k,ordered(v[k])])):v;
const canonical=v=>JSON.stringify(ordered(v));
const hash=v=>crypto.createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:canonical(v)).digest('hex');
const grants=new WeakMap(),files=['rules.json','cards.json','judge-cases.json'];
function regular(file,max=32*1024*1024){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>max)throw Error('sync-file-invalid');return fs.readFileSync(file);}
function readPolicy(root){
 const file=process.env.RIFTASSI_RIFTNARU_POLICY,pin=process.env.RIFTASSI_RIFTNARU_POLICY_SHA256;
 if(!file||!/^([a-f0-9]{64})$/u.test(pin||''))throw Error('sync-policy-not-pinned');
 const bytes=regular(file,32768),p=JSON.parse(bytes),st=fs.statSync(file);
 if(hash(bytes)!==pin||p.schemaVersion!==1||!p.roots?.includes(path.resolve(root))||p.sourceOrigin!=='https://www.riftnaru.com'
   ||!Number.isInteger(p.uid)||p.limits?.maxChanged<1||p.limits.maxChanged>100||p.limits.maxNew<0||p.limits.maxNew>20
   ||p.limits.maxChangeRatio<=0||p.limits.maxChangeRatio>0.1||!p.baseline?.hashes?.['cards.json']
   ||p.baseline.manifestSha256!==process.env.RIFTASSI_LEGACY_BASELINE_SHA256
   ||process.platform!=='win32'&&((st.mode&0o022)||st.uid!==0&&st.uid!==process.getuid()))throw Error('sync-policy-invalid');
 if(crypto.createPublicKey(p.publicKey).asymmetricKeyType!=='ed25519')throw Error('sync-policy-key');return p;
}
function unsigned(manifest){const m=structuredClone(manifest);delete m.sources.riftnaruAuto.signature;return m;}
function verifySignature(manifest,policy){const a=manifest.sources?.riftnaruAuto;if(!a||a.policyId!==policy.id||a.baselineManifestSha256!==policy.baseline.manifestSha256||!a.signature
 ||!crypto.verify(null,Buffer.from(canonical(unsigned(manifest))),policy.publicKey,Buffer.from(a.signature,'base64')))throw Error('sync-signature-invalid');}
function recentUpdates(previous,at,delta,policy){const stamp=Date.parse(at);if(!Number.isFinite(stamp)||stamp>Date.now()+300000||stamp<Date.parse(previous.createdAt||0))throw Error('sync-release-time');const updates=[...(previous.sources?.riftnaruAuto?.recentUpdates||[]).filter(x=>Date.parse(x.at)>stamp-7*86400000),{at,...delta}];if(updates.reduce((n,x)=>n+x.changed,0)>(policy.limits.max7DayChanged||75)||updates.reduce((n,x)=>n+x.added,0)>(policy.limits.max7DayNew||20))throw Error('sync-mass-change');return updates;}
const mutable=new Set(['nameKo','nameEn','type','domains','textEn','textKo','stats','imageUrl','errata','source','contentHash','modelReady','authority','sourceKorean','translationStatus']);
function validateDelta(previous,next,policy){
 normalizeCatalog(previous);normalizeCatalog(next);const old=new Map(previous.cards.map(c=>[c.id,c])),after=new Map(next.cards.map(c=>[c.id,c]));
 if([...old.keys()].some(id=>!after.has(id)))throw Error('sync-missing-card');
 let changed=0,added=0;
 for(const c of next.cards){const b=old.get(c.id);if(b&&canonical(b)===canonical(c))continue;changed++;if(!b)added++;
  if(!/^riftnaru:[a-z0-9][a-z0-9-]{0,99}$/u.test(c.id)||c.source?.kind!=='riftnaru-public'
    ||c.source.url!==`${policy.sourceOrigin}/cards/${c.id.slice(9)}`||c.source.verification!=='observed-public-page'
    ||!Number.isFinite(Date.parse(c.source.fetchedAt))||!c.source.cardId||!c.source.cardVersion
    ||c.status!=='source-observed'||c.textVerified||Object.values(c.permissions||{}).some(Boolean)
    ||c.prototypeUse?.enabled!==true||c.prototypeUse.rightsConfirmed||c.prototypeUse.redistribution)throw Error('sync-access-expansion');
  if(b){
   for(const k of new Set([...Object.keys(b),...Object.keys(c)]))if(!mutable.has(k)&&canonical(b[k]??null)!==canonical(c[k]??null))throw Error('sync-immutable-field');
   if(b.source.kind!==c.source.kind||b.source.url!==c.source.url||b.textVerified||b.translationRecord||b.translationProposal||b.translationHistory?.length||Object.values(b.permissions||{}).some(Boolean)||b.status!=='source-observed')throw Error('sync-manual-conflict');
   if(b.textEn&&!c.textEn||b.textKo&&!c.textKo&&c.translationStatus!=='translation-review-pending'||b.imageUrl&&!c.imageUrl)throw Error('sync-empty-field');
   if(b.textEn!==c.textEn&&b.textKo&&b.textKo===c.textKo)throw Error('sync-stale-translation');
  }
  if(c.imageUrl){const u=new URL(c.imageUrl);if(u.protocol!=='https:'||u.username||u.password||!policy.imageHosts.includes(u.hostname))throw Error('sync-image-source');}
 }
 if(changed>policy.limits.maxChanged||added>policy.limits.maxNew||changed/Math.max(old.size,1)>policy.limits.maxChangeRatio)throw Error('sync-mass-change');
 return {changed,added};
}
function readReleaseFiles(root,id){if(!/^[a-z0-9][a-z0-9._-]{0,95}$/u.test(id))throw Error('sync-release-id');const dir=path.join(root,'knowledge-releases',id);if(fs.lstatSync(dir).isSymbolicLink())throw Error('sync-release-link');const bytes=regular(path.join(dir,'manifest.json')),manifest=JSON.parse(bytes);if(manifest.releaseId!==id)throw Error('sync-release-id');const data={};for(const n of files){const b=regular(path.join(dir,n));if(hash(b)!==manifest.hashes?.[n])throw Error('sync-release-hash');data[n]=JSON.parse(b);}return {dir,manifest,manifestHash:hash(bytes),cards:data['cards.json']};}
function verifyAutomaticRelease(root,id,manifest,cards,manifestHash){
 const policy=readPolicy(root);verifySignature(manifest,policy);const a=manifest.sources.riftnaruAuto;
 if(a.previousReleaseId===id||manifest.reviewRequired||manifest.validationStatus!=='validated'||manifest.compatibleSchema!==2)throw Error('sync-manifest-invalid');
 for(const n of ['rules.json','judge-cases.json'])if(manifest.hashes[n]!==policy.baseline.hashes[n])throw Error('sync-unrelated-knowledge');
 const baseline=readReleaseFiles(root,policy.baseline.releaseId);if(baseline.manifestHash!==policy.baseline.manifestSha256||canonical(baseline.manifest.hashes)!==canonical(policy.baseline.hashes))throw Error('sync-baseline-drift');
 const previous=readReleaseFiles(root,a.previousReleaseId);if(previous.manifestHash!==a.previousManifestSha256)throw Error('sync-parent-drift');
 if(previous.manifestHash!==policy.baseline.manifestSha256)verifySignature(previous.manifest,policy);
 const expectedSources=structuredClone(previous.manifest.sources);delete expectedSources.riftnaruAuto;
 const actualSources=structuredClone(manifest.sources);delete actualSources.riftnaruAuto;
 // Only the catalog's source version/collection metadata may advance.
 delete expectedSources.riftnaru;delete actualSources.riftnaru;
 if(canonical(expectedSources)!==canonical(actualSources))throw Error('sync-unrelated-sources');
 const baselineSources=structuredClone(baseline.manifest.sources);delete baselineSources.riftnaru;
 if(canonical(actualSources)!==canonical(baselineSources))throw Error('sync-baseline-sources-drift');
 for(const k of new Set([...Object.keys(previous.manifest),...Object.keys(manifest)]))if(!['releaseId','createdAt','sources','hashes','counts'].includes(k)&&canonical(previous.manifest[k]??null)!==canonical(manifest[k]??null))throw Error('sync-unrelated-manifest');
 if(canonical(manifest.counts)!==canonical({...previous.manifest.counts,cards:cards.cards.length}))throw Error('sync-manifest-counts');
 for(const k of ['rules','judgeCases'])if(manifest.counts[k]!==baseline.manifest.counts[k])throw Error('sync-unrelated-counts');
 const delta=validateDelta(previous.cards,cards,policy);if(delta.changed<1||canonical(delta)!==canonical(a.delta))throw Error('sync-diff-mismatch');
 if(canonical(a.recentUpdates)!==canonical(recentUpdates(previous.manifest,manifest.createdAt,delta,policy)))throw Error('sync-window-mismatch');
 // Rights and immutable fields remain bounded by the original deployment, too.
 const currentById=new Map(cards.cards.map(c=>[c.id,c]));
 for(const b of baseline.cards.cards){const c=currentById.get(b.id);if(!c)throw Error('sync-baseline-card-missing');for(const k of ['id','code','set','permissions','prototypeUse','textVerified','aliases','status','translationRecord','translationProposal','translationHistory'])if(canonical(b[k]??null)!==canonical(c[k]??null))throw Error('sync-baseline-access-drift');}
 return {policy,manifestHash,delta};
}
function checkAutoAuthorization(value,root,nextId,expectedId,digest){const v=value&&grants.get(value);return v&&v.root===path.resolve(root)&&v.nextId===nextId&&v.expectedId===expectedId&&v.digest===digest?v.action:null;}
async function activateAutomatic(root,nextId,expectedId,{rollback=false,authorizedManifest=null}={}){
 const policy=readPolicy(root);if(typeof process.getuid!=='function'||process.getuid()!==policy.uid)throw Error('sync-process-identity');
 const next=readReleaseFiles(root,nextId);
 if(rollback){const manifest=authorizedManifest||JSON.parse(regular(path.join(root,'knowledge-releases',expectedId,'manifest.json')));verifySignature(manifest,policy);if(manifest.releaseId!==expectedId||manifest.sources.riftnaruAuto.previousReleaseId!==nextId||manifest.sources.riftnaruAuto.previousManifestSha256!==next.manifestHash)throw Error('sync-rollback-target');if(next.manifestHash!==policy.baseline.manifestSha256)verifyAutomaticRelease(root,nextId,next.manifest,next.cards,next.manifestHash);}
 else {verifyAutomaticRelease(root,nextId,next.manifest,next.cards,next.manifestHash);if(next.manifest.sources.riftnaruAuto.previousReleaseId!==expectedId)throw Error('sync-stale-candidate');}
 const grant=Object.freeze({});grants.set(grant,{root:path.resolve(root),nextId,expectedId,digest:require('./card-translation-core').hash(next.manifest),action:rollback?'rollback':'activate'});
 return require('./knowledge-releases').activateRelease(root,nextId,expectedId,{autoAuthorization:grant});
}
async function stageAutomatic(root,catalog,observationHash,privateKey){
 const policy=readPolicy(root);if(process.getuid?.()!==policy.uid)throw Error('sync-process-identity');const pointer=JSON.parse(regular(path.join(root,'knowledge-releases/active.json'))),previous=readReleaseFiles(root,pointer.releaseId),delta=validateDelta(previous.cards,catalog,policy);if(!delta.changed)return null;
 const bytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n'),id='riftnaru-auto-'+hash(bytes).slice(0,24),dir=path.join(root,'knowledge-releases',id);
 const manifest=structuredClone(previous.manifest);manifest.releaseId=id;manifest.createdAt=new Date().toISOString();manifest.hashes['cards.json']=hash(bytes);manifest.reviewRequired=false;
 manifest.counts={...manifest.counts,cards:catalog.cards.length};
 manifest.sources.riftnaru={version:catalog.version,capturedAt:catalog.updatedAt,coverage:catalog.coverage,url:policy.sourceOrigin+'/cards'};
 manifest.sources.riftnaruAuto={policyId:policy.id,baselineManifestSha256:policy.baseline.manifestSha256,previousReleaseId:pointer.releaseId,previousManifestSha256:previous.manifestHash,observationHash,delta,signature:''};
 manifest.sources.riftnaruAuto.recentUpdates=recentUpdates(previous.manifest,manifest.createdAt,delta,policy);
 manifest.sources.riftnaruAuto.signature=crypto.sign(null,Buffer.from(canonical(unsigned(manifest))),privateKey).toString('base64');
 await fsp.mkdir(dir,{mode:0o750});for(const n of ['rules.json','judge-cases.json'])await fsp.copyFile(path.join(previous.dir,n),path.join(dir,n),fs.constants.COPYFILE_EXCL);
 await fsp.writeFile(path.join(dir,'cards.json'),bytes,{flag:'wx',mode:0o640});await fsp.writeFile(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o640});
 for(const name of [...files,'manifest.json']){const fd=await fsp.open(path.join(dir,name),'r+');try{await fd.sync();}finally{await fd.close();}}
 if(process.platform!=='win32'){const fd=await fsp.open(dir,'r');try{await fd.sync();}finally{await fd.close();}}
 await require('./knowledge-provider').loadRelease(root,id);return {releaseId:id,previousReleaseId:pointer.releaseId,manifestHash:hash(regular(path.join(dir,'manifest.json'))),manifest,delta};
}
module.exports={canonical,hash,regular,readPolicy,readReleaseFiles,validateDelta,verifyAutomaticRelease,checkAutoAuthorization,activateAutomatic,stageAutomatic};
