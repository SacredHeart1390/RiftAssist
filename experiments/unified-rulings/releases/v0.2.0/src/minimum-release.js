// Offline candidate only. Review references are operator attestations, not licenses.
const fs=require('node:fs/promises'),path=require('node:path');
const {stageRelease}=require('./knowledge-releases'),{digest,loadRelease}=require('./knowledge-provider');
const mode='approved-rules-only';
function restricted(snapshot){return snapshot?.manifest?.sources?.minimumRelease?.mode===mode;}
function inspect(snapshot){return{mode:restricted(snapshot)?mode:'existing-policy',rules:snapshot.evidence.length,cards:snapshot.cardCatalog.cards.length,judgeCases:snapshot.judgeCases.length,externalJudge:!restricted(snapshot),sourceTranslation:!restricted(snapshot),rightsIndependentlyVerified:false,authorizedToDeploy:false};}
async function stageMinimumRules(root,input){
  if(!input||Object.keys(input).some(n=>!['rules','review'].includes(n)))throw Error('Only reviewed rules are accepted.');
  const {rules,review}=input,hash=digest(Buffer.from(JSON.stringify(rules)));
  if(!review||review.status!=='verified'||review.rulesSha256!==hash||!/^([a-f0-9]{40})$/.test(review.commit||'')||typeof review.reference!=='string'||review.reference.trim().length<3||review.reference.length>300||review.display!==true||review.modelInput!==true)throw Error('Explicit matching display/model-input review is required.');
  // No existing data directory, pointer, user DB or secret may be reused by this exporter.
  for(let p=path.resolve(root);;p=path.dirname(p)){try{if((await fs.lstat(p)).isSymbolicLink())throw Error('Links are not permitted.');}catch(e){if(e.code!=='ENOENT')throw e;}if(path.dirname(p)===p)break;}
  try{await fs.lstat(root);throw Error('Choose a new candidate directory.');}catch(e){if(e.code!=='ENOENT')throw e;}
  const manifest=await stageRelease(root,{rules,cards:{schemaVersion:1,version:'no-card-data',cards:[]},judgeCases:[],reviewRequired:true,parserVersion:'reviewed-rules-only-1',sources:{minimumRelease:{mode,reviewReference:review.reference,reviewCommit:review.commit,rulesSha256:hash,attestationOnly:true},riftjudge:{coverage:'disabled-by-rights-policy'}}});
  const candidate=await loadRelease(root,manifest.releaseId);
  return{manifest,scope:inspect(candidate),activePointerChanged:false,productionDataRead:false};
}
module.exports={mode,restricted,inspect,stageMinimumRules};
