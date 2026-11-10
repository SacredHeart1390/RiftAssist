'use strict';
// Fixed single-service operations. Constructed only from root-owned reviewed inventory.
const fs=require('node:fs'),path=require('node:path');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const P=require('./protocol.cjs'),R=require('./replacement.cjs');
const {available}=require('./ubuntu-io.cjs');
const HELPER='riftassist-autostart.service',HELPER_GUARD='/etc/systemd/system/'+HELPER+'.d/90-riftassist-maintenance.conf',HELPER_SENTINEL='/var/lib/riftassist-replacement/autostart-enabled';
const helperGuard='[Unit]\n# Owned RiftAssist maintenance guard; remove only after verified legacy recovery.\nConditionPathExists='+HELPER_SENTINEL+'\n';
function override(c){return '[Unit]\nStartLimitIntervalSec=300\nStartLimitBurst=3\n[Service]\nEnvironment=\nEnvironmentFile=\nRestartSec=5\nWorkingDirectory='+c.candidateData+'\nExecStart=\nExecStart='+c.node+' '+c.launcher+' '+P.within(c.root,'launch.json')+'\nTimeoutStopSec=115\nReadOnlyPaths='+c.candidateData+'/releases '+c.candidateData+'/knowledge-releases\n'+require('./clean-rollback.cjs').isolation(c);}
function budgetGuard(c){return '# RiftAssist '+(c.rollbackCode?c.oldCodeHash:c.siteId)+' rollback budget guard\n[Service]\nEnvironmentFile=\nEnvironment=OPENAI_GENERATION_ENABLED=false\n'+(c.rollbackCode?'ExecStart=\nExecStart='+c.node+' '+c.oldCode+'/src/manager.js\n':'')+require('./clean-rollback.cjs').isolation(c);}
function bounded(file){P.noLinks(file,true);if(fs.statSync(file).size>65536)P.fail('configuration-size');return fs.readFileSync(file);}
function knowledgeHash(root){
  const active=P.readJSON(path.join(root,'knowledge-releases','active.json'),4096);if(!/^[a-zA-Z0-9_.-]{1,100}$/.test(active.releaseId)||['.','..'].includes(active.releaseId))P.fail('knowledge');
  const dir=P.within(root,'knowledge-releases',active.releaseId),m=P.readJSON(path.join(dir,'manifest.json'));if(m.validationStatus!=='validated'||m.compatibleSchema!==2)P.fail('knowledge');
  for(const name of ['rules.json','cards.json','judge-cases.json']){const file=path.join(dir,name);P.noLinks(file,true);if(P.hash(fs.readFileSync(file))!==m.hashes?.[name])P.fail('knowledge-integrity');}
  return{hash:P.digest({active,manifest:m}),directory:dir};
}
function prepareWorker(c){
  if(R.codeReceipt(c.candidateCode).hash!==c.candidateHash)P.fail('candidate-drift');
  // The separately reviewed knowledge candidate is supplied before downtime; no legacy import.
  if(knowledgeHash(c.candidateData).hash!==c.knowledgeHash)P.fail('knowledge-drift');
  const worker=P.within(c.candidateData,'releases','v0.2.0');if(fs.existsSync(worker))P.fail('retained-release');
  fs.mkdirSync(path.dirname(worker),{recursive:true,mode:0o700});fs.cpSync(c.candidateCode,worker,{recursive:true,errorOnExist:true,force:false});
  P.atomic(path.join(c.candidateData,'.riftassist-environment.json'),{releaseFamily:'v0.2.0',environment:'production'});
  P.atomic(P.within(c.root,'launch.json'),{schemaVersion:1,purpose:'single-instance-replacement-launch',root:c.root,siteId:c.siteId,source:c.candidateCode,data:c.candidateData,ports:c.ports,commit:c.commit,candidateHash:c.candidateHash,liveProviderApproved:c.evidence.configuration?.liveProviderApproved===true,generationEnabled:c.evidence.configuration?.generationEnabled??null},0o644);
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);P.noLinks(file);if(e.isDirectory())walk(file);else fs.chownSync(file,c.uid,c.gid);}fs.chownSync(dir,c.uid,c.gid);};walk(c.candidateData);
}
class UbuntuReplacementIO {
  constructor(c){if(c.rehearsal)P.fail('production-adapter-scope');this.config=c;}
  async run(args){
    try{return(await execFile('/usr/bin/systemctl',args,{timeout:125000,maxBuffer:32768,env:{PATH:'/usr/bin:/bin',LANG:'C',SYSTEMD_PAGER:'cat'}})).stdout;}
    catch{P.fail('systemd-result-uncertain');}
  }
  helperPaths(){return{service:HELPER,guard:HELPER_GUARD,sentinel:HELPER_SENTINEL};}
  helperScriptHash(){return P.hash(bounded(this.config.evidence.autostart.scriptPath));}
  async observed(service=this.config.service){
    if(![this.config.service,this.helperPaths().service].includes(service))P.fail('service');
    const raw=await this.run(['show',service,'--no-pager','--property=LoadState,ActiveState,SubState,MainPID,ControlGroup,User,Group,UnitFileState,KillMode,WorkingDirectory,FragmentPath,Job,DropInPaths,Type,Restart,Requires,Wants,After,PartOf,BindsTo,RootDirectory,RootImage,BindPaths,BindReadOnlyPaths,InaccessiblePaths,PrivateMounts,NoNewPrivileges,EnvironmentFiles']);
    return Object.fromEntries(raw.trim().split('\n').filter(s=>s.includes('=')).map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
  }
  async preflight(version,{kind='replace'}={}){
    const c=this.config,o=await this.observed();await this.assertAutostartQuiescent();
    if(o.LoadState!=='loaded'||o.ActiveState!=='active'||o.User!=='azureuser'||!['','azureuser'].includes(o.Group)||o.KillMode!=='control-group'||o.FragmentPath!==c.unitFile||o.WorkingDirectory!==(version==='v0.1.7'?c.oldCode:c.candidateData)||o.ControlGroup!=='/system.slice/'+c.service)P.fail('topology-drift');
    require('./clean-rollback.cjs').assertNamespace(c,o,{installed:fs.existsSync(c.overrideFile)});
    this.assertMainServiceShape(o);
    this.assertReviewedDropIns(o);
    await this.assertRuntimeIdentity();
    if(version==='v0.1.7'&&fs.existsSync(c.overrideFile)&&P.hash(bounded(c.overrideFile))!==P.hash(budgetGuard(c)))P.fail('override-already-exists');
    this.assertRuntimeConfigurationApproved(version);
    await this.configurationUnchanged();
    if(R.rollbackReceipt(c).hash!==c.oldCodeHash)P.fail('rollback-code-drift');
    if(version==='v0.1.7'){
      require('./legacy-v017.cjs').assertCompatibleStore(c.candidateCode);
      if(kind!=='qualify-backup'&&knowledgeHash(c.candidateData).hash!==c.knowledgeHash)P.fail('knowledge-drift');
    }
    const budget=await this.backupBudget(version==='v0.1.7'?c.oldData:c.candidateData);return{singleService:true,caddyUnchanged:true,backupBudget:budget};
  }
  assertMainServiceShape(o){
    if(o.Type!=='simple'||o.Restart!=='on-failure'||typeof o.Wants!=='string'||!o.Wants.split(/\s+/).includes(this.helperPaths().service)||['Requires','BindsTo'].some(k=>typeof o[k]!=='string'||o[k].split(/\s+/).includes(this.helperPaths().service)))P.fail('main-service-shape-unverified');
  }
  readReviewedDropIn(file){return bounded(file);}
  assertReviewedDropIns(observed){
    const c=this.config,pins=c.evidence.configuration?.dropInHashes||{};
    if(!pins||typeof pins!=='object'||Array.isArray(pins)||typeof observed.DropInPaths!=='string')P.fail('drop-ins-unverified');
    const current=observed.DropInPaths.trim()?observed.DropInPaths.trim().split(/\s+/):[];
    for(const [file,hash] of Object.entries(pins)){
      if(!/^\/(?:etc|run|usr\/lib)\/systemd\/system\/riftassist\.service\.d\/[A-Za-z0-9_.-]+\.conf$/.test(file)||file===c.overrideFile||!P.sha(hash)||!current.includes(file))P.fail('drop-ins-unverified');
      if(P.hash(this.readReviewedDropIn(file))!==hash)P.fail('drop-in-drift');
    }
    for(const file of current){if(Object.hasOwn(pins,file))continue;if(file!==c.overrideFile)P.fail('drop-ins-unverified');const hash=P.hash(bounded(file));if(![P.hash(override(c)),P.hash(budgetGuard(c))].includes(hash))P.fail('override-conflict');}
  }
  assertRuntimeConfigurationApproved(version){
    if(!['v0.1.7','v0.2.0'].includes(version))P.fail('version');
    const c=this.config,data=version==='v0.1.7'?c.oldData:c.candidateData;
    if(fs.existsSync(path.join(data,'.env'))&&c.evidence.configuration?.runtimeEnvBackupApproved!==true)P.fail('runtime-config-approval-required');
  }
  async runtimeIdentity(){
    const options={timeout:3000,maxBuffer:128,env:{PATH:'/usr/bin:/bin',LANG:'C'}};
    const uid=Number((await execFile('/usr/bin/id',['-u','azureuser'],options)).stdout.trim()),gid=Number((await execFile('/usr/bin/id',['-g','azureuser'],options)).stdout.trim());
    return{uid,gid,version:(await execFile(this.config.node,['--version'],options)).stdout.trim()};
  }
  async assertRuntimeIdentity(){
    let r;try{r=await this.runtimeIdentity();}catch{P.fail('service-identity');}
    if(r.uid!==this.config.uid||r.gid!==this.config.gid)P.fail('service-identity');
    if(r.version!==this.config.nodeVersion)P.fail('runtime-unverified');
  }
  async assertAutostartQuiescent(){
    const h=await this.observed(this.helperPaths().service);
    const absent=h.LoadState==='not-found',masked=h.LoadState==='masked'&&['masked','masked-runtime'].includes(h.UnitFileState);
    const guarded=h.LoadState==='loaded'&&h.DropInPaths===this.helperPaths().guard&&this.helperGuardPresent();
    if((!absent&&!masked&&!guarded)||!['inactive','failed'].includes(h.ActiveState)||Number(h.MainPID)!==0||!['','0'].includes(h.Job??'missing'))P.fail('autostart-unresolved');
    try{this.assertEmptyControlGroup(this.helperPaths().service);}catch{P.fail('autostart-unresolved');}
    return{absent,masked,guarded,quiescent:true};
  }
  helperGuardPresent(){
    const {guard,sentinel}=this.helperPaths();
    P.noLinks(sentinel);const base=path.dirname(sentinel);P.noLinks(base);const parent=fs.statSync(base);if(parent.uid!==0||(parent.mode&0o022))P.fail('autostart-guard-permissions');
    if(fs.existsSync(sentinel))P.fail('autostart-sentinel-conflict');
    if(!fs.existsSync(guard))return false;
    for(const file of [guard,path.dirname(guard)]){P.noLinks(file,file===guard);const s=fs.statSync(file);if(s.uid!==0||(s.mode&0o022))P.fail('autostart-guard-permissions');}
    if(!bounded(guard).equals(Buffer.from(helperGuard)))P.fail('autostart-guard-conflict');
    return true;
  }
  async prepareAutostart(){
    // Called only inside a separately approved mutating replacement transaction.
    const c=this.config,{guard}=this.helperPaths();await this.configurationUnchanged();const main=await this.observed();this.assertMainServiceShape(main);
    const a=c.evidence.autostart;
    if(a?.policy!=='condition-guard-restore-on-legacy'||a.scriptPath!=='/home/azureuser/riftassist-autostart.py'||!P.sha(a.scriptSha256))P.fail('autostart-policy-unapproved');
    if(this.helperScriptHash()!==a.scriptSha256)P.fail('autostart-source-drift');
    const h=await this.observed(this.helperPaths().service);this.assertHelperShape(h);
    const exists=this.helperGuardPresent();
    if(h.DropInPaths!==(exists?guard:''))P.fail('autostart-drop-ins-unverified');
    if(!['inactive','failed'].includes(h.ActiveState)||Number(h.MainPID)!==0||!['','0'].includes(h.Job??'missing'))P.fail('autostart-state-drift');
    let mutation=false;
    try{
      if(!exists){mutation=true;fs.mkdirSync(path.dirname(guard),{recursive:true,mode:0o755});P.noLinks(path.dirname(guard));const parent=fs.statSync(path.dirname(guard));if(parent.uid!==0||(parent.mode&0o022))P.fail('autostart-guard-permissions');P.atomic(guard,helperGuard,0o644);}
      mutation=true;await this.run(['daemon-reload']);await this.assertAutostartQuiescent();
      return{policy:a.policy,guarded:true,originalEnabledStatePreserved:true};
    }catch(e){if(mutation)P.fail('autostart-guard-uncertain');throw e;}
  }
  assertHelperShape(h){
    if(h.LoadState!=='loaded'||h.UnitFileState!=='enabled'||h.Type!=='oneshot'||h.Restart!=='on-failure'||['Requires','After','PartOf'].some(k=>typeof h[k]!=='string'||!h[k].split(/\s+/).includes(this.config.service)))P.fail('autostart-topology-drift');
  }
  async finishMaintenance(version){
    const {guard}=this.helperPaths();if(version==='v0.2.0'){await this.assertAutostartQuiescent();return;}
    if(version!=='v0.1.7')P.fail('version');
    await this.configurationUnchanged();await this.assertAutostartQuiescent();const h=await this.observed(this.helperPaths().service);this.assertHelperShape(h);
    if(this.helperScriptHash()!==this.config.evidence.autostart.scriptSha256)P.fail('autostart-source-drift');
    if(!this.helperGuardPresent())P.fail('autostart-guard-conflict');
    try{fs.unlinkSync(guard);await this.run(['daemon-reload']);const after=await this.observed(this.helperPaths().service);this.assertHelperShape(after);if(after.DropInPaths!=='')P.fail('autostart-drop-ins-unverified');}
    catch{P.fail('autostart-restoration-uncertain');}
    // No /api/start replay: original Wants relationship is restored for the next boot.
  }
  async stop(){await this.assertAutostartQuiescent();await this.run(['stop',this.config.service]);}
  async assertStopped(){
    await this.assertAutostartQuiescent();
    const c=this.config,o=await this.observed();if(!['inactive','failed'].includes(o.ActiveState)||Number(o.MainPID)!==0)P.fail('stop-unconfirmed');
    this.assertEmptyControlGroup(c.service);
    for(const port of c.ports)if(!await available(port))P.fail('ports-not-released');
  }
  assertEmptyControlGroup(service){
    if(![this.config.service,this.helperPaths().service].includes(service))P.fail('service');
    const group='/sys/fs/cgroup/system.slice/'+service;let visited=0;
    const check=(dir,depth=0)=>{if(!fs.existsSync(dir))return;if(++visited>256||depth>16)P.fail('cgroup-budget');P.noLinks(dir);
      const procs=path.join(dir,'cgroup.procs');if(fs.existsSync(procs)&&fs.readFileSync(procs,'utf8').trim())P.fail('writers-still-running');
      for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isDirectory())check(path.join(dir,e.name),depth+1);
    };check(group);
  }
  async backupBudget(data){
    const B=require('./backup-budget.cjs');return B.assertFits(B.metadata(data,this.config.maxDbBytes),this.resources());
  }
  resources(){const disk=fs.statfsSync(this.config.root),mem=/^MemAvailable:\s+(\d+) kB$/m.exec(fs.readFileSync('/proc/meminfo','utf8'));return{freeDisk:disk.bavail*disk.bsize,availableMemory:mem?Number(mem[1])*1024:0};}
  async configurationSnapshot(){
    const c=this.config;await this.configurationUnchanged();
    if(c.evidence.configuration?.runtimeEnvBackupApproved!==true)P.fail('runtime-config-approval-required');
    const o=await this.observed(),refs=require('./runtime-config.cjs').environmentReferences(c,o.EnvironmentFiles,{installed:fs.existsSync(c.overrideFile)});
    const raw=await this.run(['show',c.service,'--no-pager','--property=Environment','--value']);
    return{unit:bounded(c.unitFile).toString('base64'),caddy:bounded(c.caddyFile).toString('base64'),override:fs.existsSync(c.overrideFile)?bounded(c.overrideFile).toString('base64'):null,unitEnvironment:Buffer.from(raw).toString('base64'),environmentFileUsed:refs.references===1};
  }
  async configurationUnchanged(){const c=this.config;if(P.hash(bounded(c.unitFile))!==c.unitHash||P.hash(bounded(c.caddyFile))!==c.caddyHash)P.fail('configuration-drift');}
  async finalizeCandidate(){prepareWorker(this.config);}
  async select(version,snapshot){
    const c=this.config;await this.assertStopped();await this.configurationUnchanged();
    if(version==='v0.2.0'){
      if(fs.existsSync(c.overrideFile)&&P.hash(bounded(c.overrideFile))!==P.hash(budgetGuard(c)))P.fail('override-already-exists');fs.mkdirSync(path.dirname(c.overrideFile),{recursive:true,mode:0o755});P.atomic(c.overrideFile,override(c),0o644);
    } else if(version==='v0.1.7'){
      if(P.hash(bounded(c.overrideFile))!==P.hash(override(c))||!snapshot)P.fail('override-conflict');
      // Retained new-version calls are not merged into the old daily counters.
      // Pause paid generation without changing the old DB until budgets are reconciled.
      P.atomic(c.overrideFile,budgetGuard(c),0o644);
    } else P.fail('version');
    await this.run(['daemon-reload']);
  }
  async restorePrevious(version,snapshot,{pauseAi=false}={}){
    const c=this.config;await this.assertStopped();await this.configurationUnchanged();if(!snapshot)P.fail('configuration-snapshot');
    const current=fs.existsSync(c.overrideFile)?bounded(c.overrideFile):null;
    const previous=version==='v0.1.7'&&(pauseAi||c.rollbackCode)?Buffer.from(budgetGuard(c)):snapshot.override===null?null:Buffer.from(snapshot.override,'base64');
    if((current?.toString('base64')||null)!==(previous?.toString('base64')||null)){
      if(current&&![P.hash(override(c)),P.hash(budgetGuard(c))].includes(P.hash(current)))P.fail('override-conflict');
      if(version==='v0.1.7'&&current&&![P.hash(override(c)),P.hash(budgetGuard(c))].includes(P.hash(current)))P.fail('override-conflict');
      if(version==='v0.2.0'&&previous&&P.hash(previous)!==P.hash(override(c)))P.fail('override-conflict');
      if(previous)P.atomic(c.overrideFile,previous.toString('utf8'),0o644);else if(current)fs.unlinkSync(c.overrideFile);
    }
    await this.run(['daemon-reload']);
  }
  async start(version){
    if(!['v0.1.7','v0.2.0'].includes(version))P.fail('version');const c=this.config;
    if((version==='v0.1.7'?R.rollbackReceipt(c):R.codeReceipt(c.candidateCode)).hash!==(version==='v0.1.7'?c.oldCodeHash:c.candidateHash))P.fail('release-integrity');
    const root=version==='v0.1.7'?c.oldData:c.candidateData;
    try{for(const name of ['storage.key','manager.key','sessions.key']){const file=path.join(root,'private',name);P.noLinks(file,true);const size=fs.statSync(file).size;if(name==='storage.key'?size!==32:!(/^[a-f0-9]{64}\s*$/i.test(bounded(file).toString())))P.fail('restart-keyset-unverified');}}catch{P.fail('restart-keyset-unverified');}
    await this.assertStopped();
    if(version==='v0.1.7'&&c.rollbackCode){
      if(fs.existsSync(c.overrideFile)&&![P.hash(override(c)),P.hash(budgetGuard(c))].includes(P.hash(bounded(c.overrideFile))))P.fail('override-conflict');
      fs.mkdirSync(path.dirname(c.overrideFile),{recursive:true,mode:0o755});P.atomic(c.overrideFile,budgetGuard(c),0o644);await this.run(['daemon-reload']);
    }
    const selected=await this.observed();this.assertReviewedDropIns(selected);require('./clean-rollback.cjs').assertNamespace(c,selected,{installed:true});await this.assertRuntimeIdentity();await this.run(['start',c.service]);
    if(version==='v0.1.7')await this.startOriginalApp();
  }
  async managerStatus(version){
    const c=this.config,origin='http://127.0.0.1:'+c.ports[0];let key=fs.readFileSync(path.join(version==='v0.1.7'?c.oldData:c.candidateData,'private/manager.key'),'utf8').trim();
    try{if(!/^[a-f0-9]{64}$/i.test(key))P.fail('admin-authentication');
      const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(4000)}),cookie=login.headers.get('set-cookie')?.split(';')[0];if(login.status!==200||!cookie)P.fail('admin-authentication');
      const response=await fetch(origin+'/api/status',{headers:{Cookie:cookie},signal:AbortSignal.timeout(4000)});if(response.status!==200)P.fail('admin-health');
      return{origin,cookie,data:await response.json()};
    }finally{key=null;}
  }
  async startOriginalApp(){
    const origin='http://127.0.0.1:'+this.config.ports[0],deadline=Date.now()+20000;let ready=false;
    while(Date.now()<deadline){try{const r=await fetch(origin+'/',{signal:AbortSignal.timeout(1500)});r.body?.cancel();if(r.status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,150));}
    if(!ready)P.fail('original-manager-unavailable');const session=await this.managerStatus('v0.1.7'),s=session.data;
    if(s.appRunning===true){if(s.appHost?.releaseId!=='v0.1.7')P.fail('original-version-unverified');return;}
    if(s.changing||s.appHost?.changing||s.appHost?.draining>0)P.fail('original-start-uncertain');
    if(!['none','external'].includes(s.hosting?.provider)||s.hosting?.publicOrigin!=='https://riftassistant.app')P.fail('original-hosting-unverified');
    const r=await fetch(session.origin+'/api/start',{method:'POST',headers:{Origin:session.origin,Cookie:session.cookie,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(35000)});r.body?.cancel();if(r.status!==200)P.fail('original-start-uncertain');
  }
  async observe(){
    const c=this.config,o=await this.observed();let target='unknown';
    if(!fs.existsSync(c.overrideFile))target='v0.1.7';else if(P.hash(bounded(c.overrideFile))===P.hash(override(c)))target='v0.2.0';else if(P.hash(bounded(c.overrideFile))===P.hash(budgetGuard(c)))target='v0.1.7';
    return{serviceActive:o.ActiveState==='active',configurationTarget:target,managerPidPresent:Number(o.MainPID)>0,aiPauseConfigured:fs.existsSync(c.overrideFile)&&P.hash(bounded(c.overrideFile))===P.hash(budgetGuard(c))};
  }
  async health(version){
    const c=this.config,deadline=Date.now()+35000;let ok=false;
    const paused=version==='v0.1.7'&&fs.existsSync(c.overrideFile)&&P.hash(bounded(c.overrideFile))===P.hash(budgetGuard(c));
    while(Date.now()<deadline){try{const r=await fetch('http://127.0.0.1:'+c.ports[1]+'/api/health',{signal:AbortSignal.timeout(2500)}),v=await r.json();if(r.status===200&&v.appReleaseId===version&&v.indexedRuleCount>0&&(!paused||v.aiEnabled===false)){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
    if(!ok)P.fail('application-health');
    // Original login/status is reused. Keys/cookies stay in process memory; never argv/logs.
    let key=fs.readFileSync(path.join(version==='v0.1.7'?c.oldData:c.candidateData,'private/manager.key'),'utf8').trim();
    try{
      if(!/^[a-f0-9]{64}$/i.test(key))P.fail('authentication');const origin='http://127.0.0.1:'+c.ports[0];
      const r=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(4000)});const cookie=r.headers.get('set-cookie')?.split(';')[0];if(r.status!==200||!cookie)P.fail('admin-authentication');
      const status=await fetch(origin+'/api/status',{headers:{Cookie:cookie},signal:AbortSignal.timeout(4000)});if(status.status!==200)P.fail('admin-health');const data=await status.json();if(data.appRunning!==true||data.appHost?.releaseId!==version||version==='v0.2.0'&&data.activeOrigin!=='https://riftassistant.app')P.fail('admin-health');
    }finally{key=null;}
    const https=await fetch('https://riftassistant.app/',{redirect:'manual',signal:AbortSignal.timeout(6000)});https.body?.cancel();if(https.status!==200)P.fail('https-health');
    if(version==='v0.2.0'){const metadata=await fetch('https://riftassistant.app/api/release',{redirect:'manual',headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(6000)});if(metadata.status!==200||(await metadata.json()).releaseId!==version)P.fail('https-version');}
    return{version,localApplication:true,adminAuthenticated:true,https200:true,paidAiInvoked:false,aiPausedForBudgetReconciliation:paused};
  }
}
module.exports={UbuntuReplacementIO,override,budgetGuard,knowledgeHash,prepareWorker,helperGuard};
