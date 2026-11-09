'use strict';
// Single-instance stop/backup/replace/recover engine. No Azure invocation or installation here.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./protocol.cjs'),V=require('./vault.cjs'),A=require('./legacy-assessment.cjs');
const PROTOCOL='riftassist-replacement-1',terminal=new Set(['completed','rolled-back','qualified','failed-stable']);
function config(raw,{rehearsal=false}={}) {
  P.exact(raw,['schemaVersion','siteId','mode','installationApproved','inventoryVerified','root','node','nodeVersion','service','unitFile','unitHash','caddyFile','caddyHash','overrideFile','oldData','oldCode','rollbackCode','oldCodeHash','candidateData','candidateCode','candidateHash','commit','schemaHash','ports','uid','gid','launcher','knowledgeHash','evidence']);
  if(raw.schemaVersion!==1||raw.mode!=='single-instance-replacement'||!P.uuid(raw.siteId)||raw.installationApproved!==true||raw.inventoryVerified!==true)P.fail('inventory-not-approved');
  if(typeof raw.nodeVersion!=='string'||!/^v24\.\d+\.\d+$/.test(raw.nodeVersion))P.fail('runtime-pin-required');
  if(!/^[a-f0-9]{40}$/.test(raw.commit)||!['unitHash','caddyHash','oldCodeHash','candidateHash','schemaHash','knowledgeHash'].every(k=>P.sha(raw[k])))P.fail('inventory');
  for(const name of ['root','node','unitFile','caddyFile','overrideFile','oldData','oldCode','candidateData','candidateCode','launcher']){
    if(typeof raw[name]!=='string'||!path.isAbsolute(raw[name])||/[\r\n\0"]/.test(raw[name])||!rehearsal&&(/[\\%$]/.test(raw[name])||raw[name].includes(' ')))P.fail('inventory-path');P.noLinks(raw[name]);
  }
  if(raw.rollbackCode!==undefined){if(raw.rollbackCode!==(rehearsal?path.join(raw.root,'rollback','v0.1.7'):'/var/lib/riftassist-rollback/'+raw.oldCodeHash+'/v0.1.7'))P.fail('rollback-reference-path');P.noLinks(raw.rollbackCode);}
  if(raw.root===raw.oldData||raw.oldData.startsWith(raw.root+path.sep)||raw.root.startsWith(raw.oldData+path.sep))P.fail('data-overlap');
  if((!rehearsal&&(raw.candidateData!==path.join(raw.root,'data','v0.2.0')||raw.candidateCode!==path.join(raw.root,'releases','v0.2.0')))||raw.launcher!==path.join(raw.root,'tools','replacement-launch.cjs'))P.fail('inventory-path');
  if(!Array.isArray(raw.ports)||raw.ports.length!==4||new Set(raw.ports).size!==4||raw.ports.some(p=>!Number.isInteger(p)||p<1024||p>65535))P.fail('ports');
  if(![raw.uid,raw.gid].every(v=>Number.isInteger(v)&&v>=0))P.fail('inventory');
  if(rehearsal){
    const os=require('node:os'),temp=fs.realpathSync(os.tmpdir());
    if(!['root','oldData','oldCode','candidateData','candidateCode','unitFile','caddyFile','overrideFile'].every(k=>raw[k].startsWith(temp+path.sep))||!/^riftassist-replacement-test-[a-f0-9-]{36}\.service$/.test(raw.service))P.fail('rehearsal-scope');
  } else {
    const observedData='/home/azureuser/RiftAssist/experiments/unified-rulings';
    if(raw.root!=='/var/lib/riftassist-replacement/'+raw.siteId||raw.node!=='/usr/bin/node'||raw.oldData!==observedData||raw.oldCode!==observedData+'/releases/v0.1.7'||raw.service!=='riftassist.service'||raw.overrideFile!=='/etc/systemd/system/riftassist.service.d/90-riftassist-release.conf'||raw.unitFile!=='/etc/systemd/system/riftassist.service'||raw.caddyFile!=='/etc/caddy/Caddyfile'||raw.ports.join(',')!=='3100,3001,3011,3012'||raw.uid===0)P.fail('verified-topology-required');
  }
  return Object.freeze({...raw,rehearsal,maxDbBytes:16*1024*1024,inventoryHash:P.digest(raw)});
}
function owner(c){const o=P.readJSON(P.within(c.root,'owner.json'),4096);if(o.purpose!=='single-instance-replacement'||o.siteId!==c.siteId||o.inventoryHash!==c.inventoryHash)P.fail('owner');}
// Installer-only, no remote RPC; never overwrites any existing installation/data.
function initialize(c){
  if(fs.existsSync(c.root))P.fail('exists');fs.mkdirSync(c.root,{recursive:true,mode:0o755});fs.chmodSync(c.root,0o755);
  for(const name of ['private','operations','backups','data','releases','tools']){const d=P.within(c.root,name),mode=['data','releases','tools'].includes(name)?0o755:0o700;fs.mkdirSync(d,{mode});fs.chmodSync(d,mode);}
  P.atomic(P.within(c.root,'owner.json'),{purpose:'single-instance-replacement',siteId:c.siteId,inventoryHash:c.inventoryHash},0o644);
  fs.writeFileSync(P.within(c.root,'private','vault.key'),crypto.randomBytes(32),{flag:'wx',mode:0o600});
  P.atomic(P.within(c.root,'state.json'),{generation:1,version:'v0.1.7'});
}
const {schemaHash}=require('./data-compatibility.cjs');
function requireCompatible(c,probe,version){
  const r=probe.compatibility;
  if(r?.schemaHash!==c.schemaHash)P.fail('schema-unverified');
  if(!r.limitsValid||!r.aiSettingValid||r.appRelease!==version)P.fail('settings-incompatible');
  if(!['storage.key','manager.key','sessions.key'].every(k=>probe.keyNames?.includes(k)))P.fail('backup-key');
  if(!c.rehearsal&&!r.hostingCompatible)P.fail('public-origin-unverified');
}
function readArchive(c,id){
  if(!P.uuid(id))P.fail('backup');const meta=P.readJSON(P.within(c.root,'backups',id+'.json')),sealed=fs.readFileSync(P.within(c.root,'backups',id+'.sealed'));
  if(P.hash(sealed)!==meta.sha256)P.fail('backup-integrity');const key=fs.readFileSync(P.within(c.root,'private','vault.key'));let bytes;
  try{bytes=V.open(sealed,key);return JSON.parse(bytes);}finally{key.fill(0);bytes?.fill(0);}
}
async function cloneBackup(c,id){
  await V.verifyBackup(c,id);const archived=readArchive(c,id);if(archived.id!==id||archived.slot!=='a')P.fail('backup');
  const privateRoot=path.join(c.candidateData,'private');P.noLinks(privateRoot);if(fs.existsSync(privateRoot))P.fail('retained-data');
  fs.mkdirSync(privateRoot,{mode:0o700});let bytes=Buffer.from(archived.database,'base64');
  const write=(name,value)=>{const fd=fs.openSync(path.join(privateRoot,name),'wx',0o600);try{fs.writeFileSync(fd,value);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
  write('operations.sqlite',bytes);bytes.fill(0);
  for(const [name,value]of Object.entries(archived.keys)){
    if(!['storage.key','manager.key','sessions.key','session.key'].includes(name))P.fail('backup-key');bytes=Buffer.from(value,'base64');write(name,bytes);bytes.fill(0);
  }
  const db=new(require('node:sqlite').DatabaseSync)(path.join(privateRoot,'operations.sqlite'));
  try {
    if(schemaHash(db)!==c.schemaHash)P.fail('schema-unverified');
    // Only the independent copy is adapted; there is no schema migration or source UPDATE.
    const hosting=db.prepare("SELECT value FROM settings WHERE name='hosting'").get();
    if(hosting&&!['none','external'].includes(JSON.parse(hosting.value).provider))P.fail('hosting-incompatible');
    if(!c.rehearsal&&(!hosting||!['external','none'].includes(JSON.parse(hosting.value).provider)||JSON.parse(hosting.value).publicOrigin!=='https://riftassistant.app'))P.fail('public-origin-unverified');
    db.prepare("INSERT INTO settings(name,value) VALUES ('appRelease',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").run(JSON.stringify('v0.2.0'));
    if(schemaHash(db)!==c.schemaHash)P.fail('schema-changed');
  } finally {db.close();}
  if(process.platform!=='win32'){const fd=fs.openSync(privateRoot,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  const runtimeConfig=require('./runtime-config.cjs').restore(c.candidateData,archived.configurationFiles?.['.env']);
  return{sourceUnchanged:true,schemaUnchanged:true,settingsPreserved:true,releasePointerAdjusted:true,runtimeConfig};
}
function codeReceipt(folder,version='v0.2.0'){
  const m=P.readJSON(path.join(folder,'app-release.json')),files={};
  const rootNames=new Set(['.gitattributes','README.md','package.json','riot.config.example.json',...['review','sync','translation'].flatMap(n=>['card-'+n+'.md','card-'+n+'.config.example.json'])]);
  for(const name of Object.keys(m.hashes||{}))if((!rootNames.has(name)&&!/^(src|public|manager-ui|dev-fixtures|scripts)\/[A-Za-z0-9_./-]+\.(js|cjs|mjs|json|html|css|svg|ico|png|webmanifest|ps1)$/.test(name))||name.split('/').some(p=>['.','..','private','node_modules'].includes(p)))P.fail('release-path');
  const allowed=new Set(['app-release.json',...Object.keys(m.hashes||{})]);
  const walk=(relative='')=>{for(const e of fs.readdirSync(relative?P.within(folder,relative):folder,{withFileTypes:true})){
    const name=relative?relative+'/'+e.name:e.name,file=P.within(folder,name);P.noLinks(file,e.isFile());
    if(e.isDirectory()){if(![...allowed].some(n=>n.startsWith(name+'/')))P.fail('unapproved-code-file');walk(name);}
    else {if(!e.isFile()||!allowed.has(name))P.fail('unapproved-code-file');if(name!=='app-release.json'&&P.hash(fs.readFileSync(file))!==m.hashes[name])P.fail('release-integrity');}
  }};walk();
  for(const [name,sha]of Object.entries(m.hashes||{}).filter(([name])=>/^(src|public|manager-ui|dev-fixtures)\//.test(name))){
    if(name.split('/').some(p=>['..','.','private','node_modules'].includes(p))||!P.sha(sha))P.fail('release-path');
    const file=P.within(folder,name);P.noLinks(file,true);if(P.hash(fs.readFileSync(file))!==sha)P.fail('release-integrity');files[name]=sha;
  }
  const required=['src/server.js','src/manager.js','src/operations-store.js',...(version==='v0.2.0'?['src/environment.js']:[])];
  if(!['v0.1.7','v0.2.0'].includes(version)||Object.keys(files).length<20||!required.every(n=>files[n])||m.releaseId!==version||m.dataSchema!==2)P.fail('release-incomplete');
  return{manifest:m,hash:P.digest({manifest:P.hash(fs.readFileSync(path.join(folder,'app-release.json'))),files})};
}
function legacyReceipt(folder){return require('./legacy-v017.cjs').receipt(folder);}
function rollbackReceipt(c){return require('./clean-rollback.cjs').receipt(c);}

function gates(c){
  owner(c);const blockers=[],r=codeReceipt(c.candidateCode);if(r.hash!==c.candidateHash)blockers.push('candidate-drift');
  let rollbackSourceAssessment=null,rollbackExecutionReference=null;
  if(!c.rehearsal){try{rollbackSourceAssessment=A.assess(c.oldCode);if(c.rollbackCode?!rollbackSourceAssessment.baselineCodeVerified:!rollbackSourceAssessment.layoutVerified)blockers.push(c.rollbackCode?'original-baseline-unverified':'rollback-layout-unreviewed');}catch{blockers.push('rollback-assessment-unavailable');}}
  if(!c.rehearsal)try{const legacy=rollbackReceipt(c);rollbackExecutionReference={kind:c.rollbackCode?'clean-code-namespace':'original-code',referenceVerified:legacy.referenceVerified,hash:legacy.hash,originalDirectoryTrusted:!c.rollbackCode,collectorPaused:Boolean(c.rollbackCode),generationPaused:Boolean(c.rollbackCode)};if(legacy.hash!==c.oldCodeHash)blockers.push('rollback-reference-drift');}catch{blockers.push('rollback-reference-unverified');}
  for(const [file,digest]of [[c.unitFile,c.unitHash],[c.caddyFile,c.caddyHash]]){P.noLinks(file,true);if(P.hash(fs.readFileSync(file))!==digest)blockers.push('configuration-drift');}
  const e=c.evidence||{},attested=v=>v?.status==='verified'&&v.commit===c.commit&&typeof v.reference==='string'&&v.reference.length>=3;
  for(const name of ['topology','autostart','rights','privacy','backupPolicy','resources','configuration','compatibility','rehearsal'])if(!attested(e[name]))blockers.push(name+'-not-verified');
  if(c.rollbackCode&&!c.rehearsal&&(!attested(e.rollbackIsolation)||e.rollbackIsolation.method!=='systemd-readonly-bind'||e.rollbackIsolation.collectorPaused!==true||e.rollbackIsolation.generationPaused!==true))blockers.push('rollback-isolation-not-verified');
  if(!c.rehearsal&&(r.manifest.ready!==true||r.manifest.developmentOnly!==false))blockers.push('release-not-ready');
  if(e.rehearsal?.mode!=='single-instance-replacement'||e.rehearsal?.actualApplicationStarted!==true||e.rehearsal?.maxConcurrentVersions!==1)blockers.push('single-instance-rehearsal-required');
  return{mode:'single-instance-replacement',blockers,rollbackSourceAssessment,rollbackExecutionReference,readyForApprovedExecution:blockers.length===0,authorizedToDeploy:false,additionalVmRequired:false,maxConcurrentVersions:1};
}
function createReplacement(raw,io,{rehearsal=false,now=()=>Date.now()}={}) {
  const c=config(raw,{rehearsal});owner(c);const {audit}=require('./broker.cjs');audit(c,null);
  const file=id=>{if(!P.uuid(id))P.fail('operation-id');return P.within(c.root,'operations',id+'.json');};
  const current=()=>{const s=P.readJSON(P.within(c.root,'state.json'),4096);if(!Number.isSafeInteger(s.generation)||s.generation<1||!['v0.1.7','v0.2.0'].includes(s.version))P.fail('state-drift');return s;};
  function signature(body){const k=fs.readFileSync(P.within(c.root,'private','vault.key'));try{return crypto.createHmac('sha256',k).update(PROTOCOL+'\n'+JSON.stringify(body)).digest('hex');}finally{k.fill(0);}}
  function save(op,state,code){op.state=state;if(code)op.failure=/^[a-z0-9-]{1,60}$/.test(code)?code:'replacement-failed';op.updatedAt=new Date(now()).toISOString();P.atomic(file(op.id),op);
    audit(c,op.id,state,op.failure||'');
  }
  function status(){audit(c,null);const operations=fs.readdirSync(P.within(c.root,'operations')).filter(n=>/^[a-f0-9-]{36}\.json$/.test(n)).map(n=>P.readJSON(P.within(c.root,'operations',n)));return{protocol:PROTOCOL,mode:c.mode,inventoryHash:c.inventoryHash,state:current(),locked:fs.existsSync(P.within(c.root,'operation.lock')),uncertain:operations.some(o=>!terminal.has(o.state)),operations,additionalVmRequired:false};}
  function plan(kind,id,deploymentId){
    if(!P.uuid(id)||!['replace','rollback','qualify-backup'].includes(kind))P.fail('protocol');if(status().locked||status().uncertain)P.fail('busy');
    const previous=current();if(kind!=='rollback'&&previous.version!=='v0.1.7'||kind==='rollback'&&previous.version!=='v0.2.0')P.fail('stale');
    if(kind==='qualify-backup'&&!c.rehearsal){const report=gates(c);if(report.blockers.some(v=>!['release-not-ready','rights-not-verified','rehearsal-not-verified','compatibility-not-verified'].includes(v)))P.fail('qualification-blocked');}
    if(kind==='replace'){if(!gates(c).readyForApprovedExecution)P.fail('release-blocked');if(fs.existsSync(path.join(c.candidateData,'private')))P.fail('retained-data');}
    else if(kind==='rollback'){const old=P.readJSON(file(deploymentId));if(old.kind!=='replace'||old.state!=='completed')P.fail('rollback-target');if(!c.rehearsal&&rollbackReceipt(c).hash!==c.oldCodeHash)P.fail('rollback-reference-drift');}
    const body={protocol:PROTOCOL,id,kind,siteId:c.siteId,inventoryHash:c.inventoryHash,commit:c.commit,previous,expiresAt:now()+600000,deploymentId:deploymentId||null,impact:'brief-outage-single-service',target:kind==='replace'?'v0.2.0':'v0.1.7'};
    return{...body,digest:signature(body)};
  }
  function validate(p,approval){const{digest,...body}=p||{};if(!P.uuid(p?.id)||p.inventoryHash!==c.inventoryHash||p.siteId!==c.siteId||p.protocol!==PROTOCOL||p.commit!==c.commit||digest!==signature(body)||approval!==digest||p.expiresAt<now()||p.expiresAt>now()+600000)P.fail('approval');if(JSON.stringify(current())!==JSON.stringify(p.previous))P.fail('stale');}
  async function execute(p,approval){
    if(!P.uuid(p?.id))P.fail('operation-id');if(fs.existsSync(file(p.id))){const old=P.readJSON(file(p.id));if(old.digest!==p.digest)P.fail('idempotency-conflict');return old;}
    validate(p,approval);let fd;try{fd=fs.openSync(P.within(c.root,'operation.lock'),'wx',0o600);}catch{P.fail('busy');}const lockToken=crypto.randomUUID();fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token:lockToken}));fs.fsyncSync(fd);fs.closeSync(fd);
    let op={id:p.id,kind:p.kind,digest:p.digest,previous:p.previous,target:p.target,backupId:null},stopped=false,stopConfirmed=false,startAttempted=false,changed=false;
    try {
      validate(p,approval);save(op,'preflight');if(p.kind==='replace'&&!gates(c).readyForApprovedExecution)P.fail('release-blocked');await io.preflight(p.previous.version);
      save(op,'stop-intent');stopped=true;await io.stop();await io.assertStopped();stopConfirmed=true;save(op,'stopped');
      // Only now, with all app/manager/worker writers stopped, are DB/keys/config read.
      await io.backupBudget(p.kind==='rollback'?c.candidateData:c.oldData);const settings=await io.configurationSnapshot();
      const sourceIsOld=p.kind!=='rollback';
      save(op,'backup');const b=await V.createPrivateBackup(c,sourceIsOld?'a':'b',p.id,path.join(sourceIsOld?c.oldData:c.candidateData,'private'),{version:p.previous.version,settings},{captureRuntimeConfig:true});op.backupId=b.id;
      op.probe=await V.verifyBackup(c,b.id);requireCompatible(c,op.probe,p.previous.version);
      save(op,'backup-verified');
      if(p.kind==='qualify-backup'){
        save(op,'restart-original-intent');startAttempted=true;await io.start('v0.1.7');op.health=await io.health('v0.1.7');await io.configurationUnchanged();
        P.atomic(P.within(c.root,'state.json'),{generation:p.previous.generation+1,version:'v0.1.7'});save(op,'qualified');return op;
      }
      if(p.kind==='replace'){op.clone=await cloneBackup(c,p.id);await io.finalizeCandidate();}
      else {const d=P.readJSON(file(p.deploymentId));await V.verifyBackup(c,d.backupId);}
      save(op,'configuration-intent');changed=true;
      await io.select(p.target,p.kind==='rollback'?readArchive(c,P.readJSON(file(p.deploymentId)).backupId).release.settings:null);op.aiPauseOnRollback=p.kind==='rollback';save(op,'start-intent');
      startAttempted=true;await io.start(p.target);save(op,'health');op.health=await io.health(p.target);await io.configurationUnchanged();
      P.atomic(P.within(c.root,'state.json'),{generation:p.previous.generation+1,version:p.target});save(op,p.kind==='replace'?'completed':'rolled-back');return op;
    } catch(error){
      const failure=error.code||'replacement-failed';
      if(stopped&&failure==='backup-integrity'){save(op,'recovery-required',failure);return op;}
      // Unknown stop/config/start outcomes are observed first. Never restart while a writer may live.
      if(stopped)try{
        save(op,'recovery-stop',failure);
        if(p.kind==='qualify-backup'&&startAttempted){await io.health(p.previous.version);} // Observe a lost restart; never resend it.
        else {if(stopConfirmed&&startAttempted)await io.stop();await io.assertStopped();if(changed)await io.restorePrevious(p.previous.version,op.backupId?readArchive(c,op.backupId).release.settings:null,{pauseAi:startAttempted});await io.start(p.previous.version);await io.health(p.previous.version);}
        await io.configurationUnchanged();
        const s=current();if(JSON.stringify(s)!==JSON.stringify(p.previous)){
          if(s.generation!==p.previous.generation+1||s.version!==p.target)P.fail('state-drift');
          P.atomic(P.within(c.root,'state.json'),{generation:p.previous.generation+2,version:p.previous.version});
        }
        save(op,'failed-stable',failure);
      }catch{save(op,'recovery-required',failure);}
      else save(op,'failed-stable',failure);return op;
    } finally {const lock=P.within(c.root,'operation.lock');if(P.readJSON(lock,4096).token!==lockToken)P.fail('lock-conflict');fs.unlinkSync(lock);}
  }
  async function reconcile(){const s=status(),observed=await io.observe();return{...s,observed,uncertain:s.uncertain||s.locked||observed.configurationTarget!==s.state.version||observed.serviceActive!==true};}
  return{config:c,status,reconcile,gates:()=>gates(c),plan,execute,inspect:id=>P.readJSON(file(id))};
}
module.exports={PROTOCOL,config,initialize,schemaHash,codeReceipt,legacyReceipt,rollbackReceipt,gates,createReplacement,cloneBackup,readArchive};
