'use strict';
// Local synthetic records only. Never construct this from operational inventory.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./protocol.cjs'),F=require('./files.cjs'),R=require('./replacement.cjs');
async function fixture({realLegacy=false,cleanRollback=false,caddy=process.execPath,uid=process.getuid?.()||0,gid=process.getgid?.()||0}={}){
  const s=await require('./fixture.cjs').site({realLegacy,caddy,appUid:uid,appGid:gid}),st=s.config;
  if(realLegacy){for(const name of ['scripts','package.json'])fs.cpSync(path.resolve(__dirname,'../../releases/v0.1.7',name),path.join(st.root,'releases/a/code',name),{recursive:true,errorOnExist:true,force:false});}
  const baseline=require('../../releases/v0.2.0/src/operations-store.js').createStore(path.join(st.root,'data/a'));try{baseline.setSetting('appRelease','v0.1.7');baseline.setSetting('hosting',{provider:'none',publicOrigin:'https://localhost:'+st.proxyPort});}finally{baseline.close();}
  for(const name of ['manager.key','sessions.key'])require('../../releases/v0.2.0/src/access-control.js').localSecret(path.join(st.root,'data/a/private'),name);
  F.chownTree(st,path.join(st.root,'data/a'));
  // a and b reuse exactly the same four ports, never run concurrently.
  const stage={...st,ports:{a:st.ports.a,b:st.ports.a}};
  F.writeCode(stage,'b',s.packet.files,'v0.2.0',s.packet.commit,s.packet.digest);
  const rules=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../releases/v0.2.0/dev-fixtures/rules.json')));
  F.prepareData(stage,'b','v0.2.0',rules);
  const root=path.join(s.temporary,'replacement',st.siteId),unitFile=path.join(s.temporary,'fixture.service'),overrideFile=path.join(s.temporary,'override.conf'),caddyFile=path.join(st.root,'proxy/Caddyfile');
  fs.writeFileSync(unitFile,'synthetic unit only\n',{mode:0o644});
  const db=new(require('node:sqlite').DatabaseSync)(path.join(st.root,'data/a/private/operations.sqlite'),{readOnly:true});let schema;try{schema=R.schemaHash(db);}finally{db.close();}
  const evidence={};for(const name of ['topology','autostart','rights','privacy','backupPolicy','resources','configuration','compatibility','rehearsal'])evidence[name]={status:'verified',commit:s.packet.commit,reference:'synthetic fixture, not production evidence'};
  Object.assign(evidence.rehearsal,{mode:'single-instance-replacement',actualApplicationStarted:true,maxConcurrentVersions:1});
  const raw={schemaVersion:1,siteId:st.siteId,mode:'single-instance-replacement',installationApproved:true,inventoryVerified:true,root,node:process.execPath,nodeVersion:process.version,service:'riftassist-replacement-test-'+st.siteId+'.service',unitFile,unitHash:P.hash(fs.readFileSync(unitFile)),caddyFile,caddyHash:P.hash(fs.readFileSync(caddyFile)),overrideFile,oldData:path.join(st.root,'data/a'),oldCode:path.join(st.root,'releases/a/code'),candidateData:path.join(st.root,'data/b'),candidateCode:path.join(st.root,'releases/b/code'),candidateHash:R.codeReceipt(path.join(st.root,'releases/b/code')).hash,commit:s.packet.commit,schemaHash:schema,ports:st.ports.a,uid,gid,launcher:path.join(root,'tools/replacement-launch.cjs'),knowledgeHash:require('./replacement-ubuntu.cjs').knowledgeHash(path.join(st.root,'data/b')).hash,evidence};
  raw.oldCodeHash=realLegacy?R.legacyReceipt(raw.oldCode).hash:P.hash(fs.readFileSync(path.join(raw.oldCode,'app-release.json')));
  if(cleanRollback){if(!realLegacy)P.fail('fixture');raw.rollbackCode=path.join(root,'rollback/v0.1.7');}
  const c=R.config(raw,{rehearsal:true});R.initialize(c);if(cleanRollback)require('./clean-rollback.cjs').prepare(raw.oldCode,raw.rollbackCode);return{...s,stage,raw,c};
}
class FakeReplacementIO{
  constructor(c){this.c=c;this.running='v0.1.7';this.selected='v0.1.7';this.fault='none';this.calls=[];this.maxConcurrentVersions=1;}
  at(name){this.calls.push(name);if(this.fault===name)P.fail('injected-'+name);}
  async preflight(){this.at('preflight');}
  async stop(){this.at('stop');this.running=null;}
  async assertStopped(){this.at('quiescence');if(this.running!==null)P.fail('writers-still-running');}
  async backupBudget(){this.at('budget');}
  async configurationSnapshot(){this.at('snapshot');return{selected:this.selected,unit:fs.readFileSync(this.c.unitFile).toString('base64'),caddy:fs.readFileSync(this.c.caddyFile).toString('base64')};}
  async finalizeCandidate(){this.at('copy');}
  async select(version){this.at('select');this.selected=version;this.aiPaused=version==='v0.1.7';}
  async restorePrevious(version,snapshot,{pauseAi=false}={}){this.at('restore');this.selected=version;this.aiPaused=version==='v0.1.7'&&pauseAi;}
  async start(version){this.at('start');if(this.running!==null)P.fail('concurrent-version');this.running=version;}
  async health(version){this.at(version==='v0.2.0'?'health':'old-health');if(this.running!==version)P.fail('health');return{version,synthetic:true};}
  async configurationUnchanged(){this.at('caddy');if(P.hash(fs.readFileSync(this.c.caddyFile))!==this.c.caddyHash)P.fail('caddy-drift');}
  async observe(){return{serviceActive:this.running!==null,configurationTarget:this.selected};}
}
module.exports={fixture,FakeReplacementIO};
