// Synthetic legacy-shaped fixture only; not a real RiftNaru capture or permission.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {fixture,release}=require('./isolated-server.cjs');
const L=require(path.join(release,'src/legacy-card-release'));
function data(){
  const version=fixture.rules.find(r=>r.documentId==='tournament-rules')?.version||'synthetic';
  const rules=[...fixture.rules,...['703.4.a.5','703.4.c.5'].map(ruleId=>({id:'tournament-rules:'+ruleId,ruleId,documentId:'tournament-rules',version,officialTextEn:'Synthetic deck box fixture 703.4.a.5 context; not an official rule.'}))];
  const cards={...fixture.cards,cards:fixture.cards.cards.map((c,i)=>({...c,textVerified:false,translationStatus:'unofficial-riftnaru',permissions:{display:false,modelInput:false},prototypeUse:{enabled:true,modelInput:true,rightsConfirmed:false,redistribution:false},status:'source-observed',source:{kind:'riftnaru-public',url:'https://www.riftnaru.com/cards/synthetic-'+i,version:'synthetic-legacy-1',fetchedAt:'2026-01-01T00:00:00Z',verification:'observed-public-page'}}))};
  return{rules,cards,judgeCases:[]};
}
function review(hashes,commit='c'.repeat(40),overrides={}){
  const grants=Object.fromEntries(L.flags.map(n=>[n,!['externalJudge','sourceTranslations'].includes(n)]));Object.assign(grants,overrides);
  return{status:'verified',commit,reference:'synthetic test rights attestation only, not a license',hashes,grants,references:Object.fromEntries(L.flags.map(n=>[n,'synthetic test scope only']))};
}
async function prepare(source,destination,{commit='c'.repeat(40),grants={}}={}){
  const input=data(),m=await require(path.join(release,'src/knowledge-releases')).stageRelease(source,{...input,sources:{riftjudge:{coverage:'complete'},syntheticTestOnly:true}});
  await fs.writeFile(path.join(source,'knowledge-releases/active.json'),JSON.stringify({releaseId:m.releaseId}));
  const r=review(m.hashes,commit,grants);const result=await L.prepareLegacyKnowledge(source,destination,r);return{...input,review:r,result,sourceId:m.releaseId};
}
module.exports={data,review,prepare};
