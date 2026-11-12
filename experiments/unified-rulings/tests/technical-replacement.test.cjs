const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const base=path.resolve(__dirname,'../releases/v0.2.0');
const env=require(path.join(base,'src/environment'));
const legacy=require(path.join(base,'src/legacy-card-release'));
const {createCardAccess}=require(path.join(base,'src/card-access'));
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function scope(t){
  const names=['RIFTASSI_PUBLICATION_MODE','RIFTASSI_LEGACY_BASELINE_SHA256','RIFTASSI_CARD_POLICY'];
  const old=Object.fromEntries(names.map(n=>[n,process.env[n]]));
  t.after(()=>{for(const n of names)if(old[n]===undefined)delete process.env[n];else process.env[n]=old[n];});
  const manifest={hashes:Object.fromEntries(['rules.json','cards.json','judge-cases.json'].map(n=>[n,digest(n)])),sources:{}};
  process.env.RIFTASSI_PUBLICATION_MODE='preserve-existing';
  process.env.RIFTASSI_CARD_POLICY='preserve-existing';
  const pin=digest(JSON.stringify(manifest));process.env.RIFTASSI_LEGACY_BASELINE_SHA256=pin;
  return{manifest,pin};
}
test('technical replacement never changes global publication readiness',t=>{
  scope(t);const m=JSON.parse(fs.readFileSync(path.join(base,'app-release.json')));
  assert.equal(m.ready,false);assert.equal(m.deployment.publicationApproval,false);
  assert.equal(env.technicalReplacement(m),true);
  assert.equal(env.technicalReplacement({...m,deployment:{...m.deployment,ready:false}}),false);
  delete process.env.RIFTASSI_LEGACY_BASELINE_SHA256;
  assert.equal(env.technicalReplacement(m),false);
});
test('continuity requires the exact baseline and cannot attest or expand rights',t=>{
  const {manifest,pin}=scope(t),before=JSON.stringify(manifest);
  const s=legacy.preservedScope(manifest,pin);
  assert.equal(s.rightsVerified,false);assert.equal(s.basis,'existing-deployment-ceiling');
  for(const n of ['images','externalJudge','sourceTranslations'])assert.equal(s[n],false);
  assert.equal(JSON.stringify(manifest),before);
  assert.throws(()=>legacy.preservedScope(manifest,'0'.repeat(64)),/baseline/);
  assert.throws(()=>legacy.preservedScope({...manifest,sources:{legacyRelease:{}}},pin),/baseline/);
});
test('runtime card views preserve originals and restrict new publication features',t=>{
  const {manifest,pin}=scope(t),s=legacy.preservedScope(manifest,pin);
  const card={id:'synthetic',status:'released',source:{kind:'riftnaru-public',url:'https://example.invalid/card',version:'old'},
    permissions:{display:false,modelInput:false,image:false,translation:false},textVerified:false,modelReady:true,
    nameEn:'Synthetic',nameKo:'합성',textEn:'Fixture only',textKo:'합성 자료',imageUrl:'https://example.invalid/image',
    translationStatus:'unofficial-riftnaru',contentHash:'fixture'};
  const original={releaseId:'old',cardCatalog:{cards:[card]},legacyReview:s};
  const before=JSON.stringify(original),a=createCardAccess('preserve-existing'),view=a.snapshot(original);
  assert.equal(view.cardCatalog.cards.length,1);assert.equal(view.cardCatalog.cards[0].imageUrl,'');
  assert.equal(view.cardCatalog.cards[0].permissions.display,false);
  assert.equal(JSON.stringify(original),before);
  assert.throws(()=>a.snapshot({...original,legacyReview:null}),/scope/);
  assert.equal(createCardAccess().snapshot(original).cardCatalog.cards.length,0);
});
test('technical readiness does not bypass data isolation or explicit production start',t=>{
  scope(t);const root=fs.mkdtempSync(path.join(os.tmpdir(),'rift-technical-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'.riftassist-environment.json'),JSON.stringify({releaseFamily:'v0.2.0',environment:'production'}));
  const old=process.env.RIFTASSI_ALLOW_PRODUCTION_START;delete process.env.RIFTASSI_ALLOW_PRODUCTION_START;
  try{assert.throws(()=>env.assertEnvironment(root),/explicit deployment/);}finally{if(old!==undefined)process.env.RIFTASSI_ALLOW_PRODUCTION_START=old;}
  fs.mkdirSync(path.join(root,'releases/v0.1.7/src'),{recursive:true});fs.writeFileSync(path.join(root,'releases/v0.1.7/src/server.js'),'');
  assert.throws(()=>env.assertEnvironment(root),/shared production/);
});
