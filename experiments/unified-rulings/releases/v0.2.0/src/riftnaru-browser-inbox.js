// Public browser exports are a transport, never a rights or activation approval.
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const A=require('./riftnaru-auto-release'),S=require('./riftnaru-source');
const ttl=48*3600000;
function makePlan(state,current,policy,at=new Date().toISOString()){
 const known=Object.fromEntries(Object.entries(state.cards).map(([id,c])=>[id,{lastGood:c.lastGood,publishedHash:c.publishedHash,failure:c.failure||null}]));
 const data={schemaVersion:1,transport:'public-browser',baseReleaseId:current.manifest.releaseId,cursor:state.cursor||0,known,detailLimit:policy.detailLimit||220,limits:policy.limits};
 return {...data,planId:A.hash(data),issuedAt:at,expiresAt:new Date(Date.parse(at)+ttl).toISOString()};
}
async function writePlan(root,state,current,policy){
 const file=path.join(root,'knowledge-releases/riftnaru-browser-plan.json');let plan=makePlan(state,current,policy);
 try{const old=JSON.parse(A.regular(file,16*1024*1024));if(old.planId===plan.planId&&Date.parse(old.expiresAt)>Date.now())plan=old;}catch(e){if(e.code!=='ENOENT')throw e;}
 await require('./riftnaru-sync').atomic(file,plan);return plan;
}
function validatePlan(plan){
 const {planId,issuedAt,expiresAt,...data}=plan;
 if(data.schemaVersion!==1||data.transport!=='public-browser'||A.hash(data)!==planId||!data.baseReleaseId||!data.known||!Number.isInteger(data.cursor)||!Number.isInteger(data.detailLimit)||data.detailLimit<1||data.detailLimit>220||!Number.isFinite(Date.parse(issuedAt))||Date.parse(issuedAt)>Date.now()+300000||Date.parse(expiresAt)<Date.now()||Date.parse(expiresAt)-Date.parse(issuedAt)!==ttl)throw Error('browser-plan-invalid');return plan;
}
function validateBundle(bundle,plan){
 validatePlan(plan);
 if(bundle.schemaVersion!==1||bundle.transport!=='public-browser'||bundle.complete!==true||bundle.planId!==plan.planId||bundle.baseReleaseId!==plan.baseReleaseId||!Number.isFinite(Date.parse(bundle.capturedAt))||Date.parse(bundle.capturedAt)<Date.parse(plan.issuedAt)-300000||Date.parse(bundle.capturedAt)>Date.now()+300000||Date.now()-Date.parse(bundle.capturedAt)>ttl||!bundle.index||!Array.isArray(bundle.cards)||bundle.cards.length>220)throw Error('browser-export-invalid');
 const index=bundle.index;
 if(!Array.isArray(index.cards)||index.cards.length<1||index.cards.length>20000||new Set(index.cards.map(c=>c.id)).size!==index.cards.length||new Set(index.cards.map(c=>c.printingId)).size!==index.cards.length||index.hash!==A.hash(index.cards.map(S.fingerprint))||!Number.isFinite(Date.parse(index.checkedAt)))throw Error('browser-index-invalid');
 for(const c of index.cards){if(!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(c.id)||c.sourceUrl!=='https://www.riftnaru.com/cards/'+c.id||!c.cardId||!c.printingId||typeof c.nameEn!=='string'||!c.nameEn||typeof c.textEn!=='string'||typeof c.textKo!=='string')throw Error('browser-index-invalid');const old=plan.known[c.id]?.lastGood;if(old&&(old.printingId!==c.printingId||old.cardId!==c.cardId))throw Error('source-printing-collision');}
 const expected=require('./riftnaru-sync').planRotation({cursor:plan.cursor,cards:plan.known},index.cards,plan.detailLimit).map(x=>x.id);
 if(A.canonical([...bundle.cards.map(c=>c.id)].sort())!==A.canonical([...expected].sort()))throw Error('browser-details-incomplete');
 const byId=new Map(index.cards.map(c=>[c.id,c]));
 for(const c of bundle.cards){const listing=byId.get(c.id);if(!listing||S.fingerprint(c)!==S.fingerprint(listing)||c.publiclyObserved!==true||typeof c.errata!=='string'||!Number.isFinite(Date.parse(c.fetchedAt))||Date.parse(c.fetchedAt)<Date.parse(plan.issuedAt)-300000||Date.parse(c.fetchedAt)>Date.parse(bundle.capturedAt)||c.cardId!==listing.cardId||c.printingId!==listing.printingId)throw Error('browser-detail-invalid');}
 return bundle;
}
function bundleSource(bundle,plan,http){validateBundle(bundle,plan);const details=new Map(bundle.cards.map(c=>[c.id,c]));return {async list(){return bundle.index;},async detail(c){const item=details.get(c.id);if(!item)throw Error('browser-detail-unavailable');return item;},async verifyImage(url){await http.request(url,{image:true});return true;},stats:()=>http.stats(),transport:'windows-browser'};}
async function readInbox(stateDir,plan,http){const file=path.join(stateDir,'browser-export.json');let bytes;try{bytes=A.regular(file,16*1024*1024);}catch(e){if(e.code==='ENOENT')return null;throw e;}const inbox={file,digest:A.hash(bytes)};try{return {...inbox,source:bundleSource(JSON.parse(bytes),plan,http)};}catch(e){await archiveInbox(stateDir,inbox,'invalid');throw e;}}
async function archiveInbox(stateDir,inbox,status){if(!inbox)return;const target=path.join(stateDir,['unchanged','activated','checked-read-only'].includes(status)?'browser-archive':'browser-review');await fsp.mkdir(target,{recursive:true,mode:0o750});const file=path.join(target,inbox.digest+'.json');try{await fsp.copyFile(inbox.file,file,fs.constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;if(A.hash(A.regular(file))!==inbox.digest)throw Error('browser-archive-drift');}if(A.hash(A.regular(inbox.file))!==inbox.digest)throw Error('browser-inbox-drift');await fsp.unlink(inbox.file);}
module.exports={makePlan,writePlan,validatePlan,validateBundle,bundleSource,readInbox,archiveInbox};
