'use strict';
// Fixed single-service operations. Constructed only from root-owned reviewed inventory.
const fs=require('node:fs'),path=require('node:path');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const P=require('./protocol.cjs'),R=require('./replacement.cjs');
const {available}=require('./ubuntu-io.cjs');
function override(c){return '[Service]\nWorkingDirectory='+c.candidateData+'\nExecStart=\nExecStart='+c.node+' '+c.launcher+' '+P.within(c.root,'launch.json')+'\nTimeoutStopSec=115\nReadOnlyPaths='+c.candidateData+'/releases '+c.candidateData+'/knowledge-releases\n';}
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
  P.atomic(P.within(c.root,'launch.json'),{schemaVersion:1,purpose:'single-instance-replacement-launch',root:c.root,siteId:c.siteId,source:c.candidateCode,data:c.candidateData,ports:c.ports,commit:c.commit,candidateHash:c.candidateHash},0o644);
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);P.noLinks(file);if(e.isDirectory())walk(file);else fs.chownSync(file,c.uid,c.gid);}fs.chownSync(dir,c.uid,c.gid);};walk(c.candidateData);
}
class UbuntuReplacementIO {
  constructor(c){if(c.rehearsal)P.fail('production-adapter-scope');this.config=c;}
  async run(args){
    try{return(await execFile('/usr/bin/systemctl',args,{timeout:125000,maxBuffer:32768,env:{PATH:'/usr/bin:/bin',LANG:'C',SYSTEMD_PAGER:'cat'}})).stdout;}
    catch{P.fail('systemd-result-uncertain');}
  }
  async observed(service=this.config.service){
    if(![this.config.service,'riftassist-autostart.service'].includes(service))P.fail('service');
    const raw=await this.run(['show',service,'--no-pager','--property=LoadState,ActiveState,SubState,MainPID,ControlGroup,User,Group,UnitFileState,KillMode,WorkingDirectory,FragmentPath']);
    return Object.fromEntries(raw.trim().split('\n').filter(s=>s.includes('=')).map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
  }
  async preflight(version){
    const c=this.config,o=await this.observed(),helper=await this.observed('riftassist-autostart.service');
    if(o.LoadState!=='loaded'||o.ActiveState!=='active'||o.User!=='azureuser'||o.Group!=='azureuser'||o.KillMode!=='control-group'||o.FragmentPath!==c.unitFile||o.WorkingDirectory!==(version==='v0.1.7'?c.oldCode:c.candidateData)||o.ControlGroup!=='/system.slice/'+c.service)P.fail('topology-drift');
    try{const options={timeout:3000,maxBuffer:128,env:{PATH:'/usr/bin:/bin',LANG:'C'}};const uid=Number((await execFile('/usr/bin/id',['-u','azureuser'],options)).stdout.trim()),gid=Number((await execFile('/usr/bin/id',['-g','azureuser'],options)).stdout.trim());if(uid!==c.uid||gid!==c.gid)P.fail('service-identity');if(!/^v24\./.test((await execFile(c.node,['--version'],options)).stdout))P.fail('runtime-unverified');}catch(error){if(error.code==='runtime-unverified')throw error;P.fail('service-identity');}
    if(version==='v0.1.7'&&fs.existsSync(c.overrideFile))P.fail('override-already-exists');
    // Unknown/enabled autostart is a blocker, not silently disabled or treated as harmless.
    if(helper.LoadState!=='not-found'&&(!['masked','masked-runtime'].includes(helper.UnitFileState)||helper.ActiveState==='active'))P.fail('autostart-unresolved');
    await this.configurationUnchanged();
    if(R.legacyReceipt(c.oldCode).hash!==c.oldCodeHash)P.fail('rollback-code-drift');
    if(version==='v0.1.7'){
      require('./legacy-v017.cjs').assertCompatibleStore(c.candidateCode);
      if(knowledgeHash(c.candidateData).hash!==c.knowledgeHash)P.fail('knowledge-drift');
    }
    const disk=fs.statfsSync(c.root);if(disk.bavail*disk.bsize<512*1024*1024)P.fail('disk');return{singleService:true,caddyUnchanged:true};
  }
  async stop(){await this.run(['stop',this.config.service]);}
  async assertStopped(){
    const c=this.config,o=await this.observed();if(!['inactive','failed'].includes(o.ActiveState)||Number(o.MainPID)!==0)P.fail('stop-unconfirmed');
    const group='/sys/fs/cgroup/system.slice/'+c.service;
    const check=dir=>{if(!fs.existsSync(dir))return;P.noLinks(dir);const procs=path.join(dir,'cgroup.procs');if(fs.existsSync(procs)&&fs.readFileSync(procs,'utf8').trim())P.fail('writers-still-running');for(const e of fs.readdirSync(dir,{withFileTypes:true}))if(e.isDirectory())check(path.join(dir,e.name));};check(group);
    for(const port of c.ports)if(!await available(port))P.fail('ports-not-released');
  }
  async backupBudget(data){
    const c=this.config,file=path.join(data,'private/operations.sqlite');P.noLinks(file,true);const bytes=fs.statSync(file).size;
    const mem=/^MemAvailable:\s+(\d+) kB$/m.exec(fs.readFileSync('/proc/meminfo','utf8'));if(bytes>c.maxDbBytes||!mem||Number(mem[1])*1024<128*1024*1024+bytes*8)P.fail('backup-memory-budget');
  }
  async configurationSnapshot(){
    const c=this.config;await this.configurationUnchanged();
    return{unit:bounded(c.unitFile).toString('base64'),caddy:bounded(c.caddyFile).toString('base64'),override:fs.existsSync(c.overrideFile)?bounded(c.overrideFile).toString('base64'):null};
  }
  async configurationUnchanged(){const c=this.config;if(P.hash(bounded(c.unitFile))!==c.unitHash||P.hash(bounded(c.caddyFile))!==c.caddyHash)P.fail('configuration-drift');}
  async finalizeCandidate(){prepareWorker(this.config);}
  async select(version,snapshot){
    const c=this.config;await this.assertStopped();await this.configurationUnchanged();
    if(version==='v0.2.0'){
      if(fs.existsSync(c.overrideFile))P.fail('override-already-exists');fs.mkdirSync(path.dirname(c.overrideFile),{recursive:true,mode:0o755});P.atomic(c.overrideFile,override(c),0o644);
    } else if(version==='v0.1.7'){
      if(P.hash(bounded(c.overrideFile))!==P.hash(override(c))||!snapshot)P.fail('override-conflict');
      if(snapshot.override===null)fs.unlinkSync(c.overrideFile);else P.atomic(c.overrideFile,Buffer.from(snapshot.override,'base64').toString('utf8'),0o644);
    } else P.fail('version');
    await this.run(['daemon-reload']);
  }
  async restorePrevious(version,snapshot){
    const c=this.config;await this.assertStopped();await this.configurationUnchanged();if(!snapshot)P.fail('configuration-snapshot');
    const current=fs.existsSync(c.overrideFile)?bounded(c.overrideFile):null;
    const previous=snapshot.override===null?null:Buffer.from(snapshot.override,'base64');
    if((current?.toString('base64')||null)!==(previous?.toString('base64')||null)){
      if(version==='v0.1.7'&&current&&P.hash(current)!==P.hash(override(c)))P.fail('override-conflict');
      if(version==='v0.2.0'&&previous&&P.hash(previous)!==P.hash(override(c)))P.fail('override-conflict');
      if(previous)P.atomic(c.overrideFile,previous.toString('utf8'),0o644);else if(current)fs.unlinkSync(c.overrideFile);
    }
    await this.run(['daemon-reload']);
  }
  async start(version){if(!['v0.1.7','v0.2.0'].includes(version))P.fail('version');const c=this.config;if((version==='v0.1.7'?R.legacyReceipt(c.oldCode):R.codeReceipt(c.candidateCode)).hash!==(version==='v0.1.7'?c.oldCodeHash:c.candidateHash))P.fail('release-integrity');await this.assertStopped();await this.run(['start',this.config.service]);}
  async health(version){
    const c=this.config,deadline=Date.now()+35000;let ok=false;
    while(Date.now()<deadline){try{const r=await fetch('http://127.0.0.1:'+c.ports[1]+'/api/health',{signal:AbortSignal.timeout(2500)}),v=await r.json();if(r.status===200&&v.appReleaseId===version&&v.indexedRuleCount>0){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
    if(!ok)P.fail('application-health');
    // Original login/status is reused. Keys/cookies stay in process memory; never argv/logs.
    let key=fs.readFileSync(path.join(version==='v0.1.7'?c.oldData:c.candidateData,'private/manager.key'),'utf8').trim();
    try{
      if(!/^[a-f0-9]{64}$/i.test(key))P.fail('authentication');const origin='http://127.0.0.1:'+c.ports[0];
      const r=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(4000)});const cookie=r.headers.get('set-cookie')?.split(';')[0];if(r.status!==200||!cookie)P.fail('admin-authentication');
      const status=await fetch(origin+'/api/status',{headers:{Cookie:cookie},signal:AbortSignal.timeout(4000)});if(status.status!==200)P.fail('admin-health');const data=await status.json();if(data.appRunning!==true||data.appHost?.releaseId!==version||version==='v0.2.0'&&data.activeOrigin!=='https://riftassistant.app')P.fail('admin-health');
    }finally{key=null;}
    const https=await fetch('https://riftassistant.app/',{redirect:'manual',signal:AbortSignal.timeout(6000)});https.body?.cancel();if(https.status!==200)P.fail('https-health');
    return{version,localApplication:true,adminAuthenticated:true,https200:true,paidAiInvoked:false};
  }
}
module.exports={UbuntuReplacementIO,override,knowledgeHash,prepareWorker};
