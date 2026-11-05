'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./protocol.cjs'),F=require('./files.cjs'),V=require('./vault.cjs');
const TERMINAL=new Set(['completed','rolled-back','failed-stable','recovery-required','uncertain']);
function lock(config) {
  const file=P.within(config.root,'operation.lock');let fd;
  try{fd=fs.openSync(file,'wx',0o600);}catch{P.fail('busy');}
  const token=crypto.randomUUID();fs.writeFileSync(fd,JSON.stringify({pid:process.pid,token}));fs.fsyncSync(fd);fs.closeSync(fd);
  return()=>{if(P.readJSON(file,4096).token!==token)P.fail('lock-conflict');fs.unlinkSync(file);};
}
function audit(config,id,state,code='') {
  const file=P.within(config.root,'operations','audit.jsonl');P.noLinks(file,true);
  const lines=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean):[];
  if(lines.length>10000)P.fail('audit-limit');let previous=null;
  for(const line of lines){const row=JSON.parse(line),{hash,...body}=row;if(body.previous!==previous||P.digest(body)!==hash)P.fail('audit-integrity');previous=hash;}
  if(id===null)return;
  const body={sequence:lines.length+1,previous,operationId:id,state,code,at:new Date().toISOString()};
  const fd=fs.openSync(file,'a',0o600);try{fs.writeSync(fd,JSON.stringify({...body,hash:P.digest(body)})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function createBroker(rawConfig,io,{fixture=false,now=()=>Date.now()}={}) {
  const config=P.inventory(rawConfig,{fixture});
  function sign(value){const file=P.within(config.root,'private','vault.key');P.noLinks(file,true);const key=fs.readFileSync(file);try{return crypto.createHmac('sha256',key).update('riftassist-staging-plan-1\n').update(JSON.stringify(value)).digest('hex');}finally{key.fill(0);}}
  function opFile(id){if(!P.uuid(id))P.fail('operation-id');return P.within(config.root,'operations',id+'.json');}
  function state(){const s=P.readJSON(P.within(config.root,'route.json'),4096);if(!Number.isInteger(s.generation)||s.generation<1||!['a','b'].includes(s.slot)||!['v0.1.7','v0.2.0'].includes(s.version))P.fail('route-drift');return s;}
  function save(op,status,code=''){op.state=status;if(code)op.failure=code;op.updatedAt=new Date(now()).toISOString();P.atomic(opFile(op.id),op);audit(config,op.id,status,code);}
  function status(){
    const planned=state(),observed=io.route(),operations=fs.readdirSync(P.within(config.root,'operations')).filter(n=>P.uuid(n.slice(0,-5))&&n.endsWith('.json')).slice(-20).map(n=>P.readJSON(P.within(config.root,'operations',n)));
    let lockState='none';if(fs.existsSync(P.within(config.root,'operation.lock'))){const l=P.readJSON(P.within(config.root,'operation.lock'),4096);try{process.kill(l.pid,0);lockState='owner-alive-or-pid-reused';}catch{lockState='interruption-review-required';}}
    return{environment:'isolated-staging',productionEnabled:false,siteId:config.siteId,inventoryHash:config.inventoryHash,planned,observed,uncertain:observed.slot!==planned.slot||lockState!=='none'||operations.some(o=>!TERMINAL.has(o.state)),lock:lockState,operations};
  }
  function plan(kind,id,deploymentId) {
    if(!P.uuid(id))P.fail('operation-id');if(fs.existsSync(P.within(config.root,'operation.lock')))P.fail('busy');
    const previous=state(),observed=io.route();if(previous.slot!==observed.slot)P.fail('route-drift');
    const p={schemaVersion:1,id,kind,siteId:config.siteId,target:'isolated-staging',inventoryHash:config.inventoryHash,previous,expectedRouteHash:observed.hash,expiresAt:now()+10*60000,commit:config.approvedCommit,packageDigest:config.approvedPackageDigest};
    if(kind==='deploy') {if(previous.slot!=='a'||fs.existsSync(P.within(config.root,'releases','b'))||fs.existsSync(P.within(config.root,'data','b')))P.fail('retained-release');p.destination={slot:'b',version:'v0.2.0'};}
    else {const deployment=P.readJSON(opFile(deploymentId));if(previous.slot!=='b'||deployment.kind!=='deploy'||!deployment.backupId||!['completed','uncertain','recovery-required'].includes(deployment.state))P.fail('rollback-target');p.destination={slot:'a',version:'v0.1.7'};p.backupId=deployment.backupId;p.deploymentId=deploymentId;}
    return{...p,digest:sign(p)};
  }
  function approved(p,approval) {
    const{digest,...body}=p||{};
    P.exact(p,['schemaVersion','id','kind','siteId','target','inventoryHash','previous','expectedRouteHash','expiresAt','commit','packageDigest','destination','backupId','deploymentId','digest']);
    if(p.schemaVersion!==1||!['deploy','rollback'].includes(p.kind)||p.destination?.slot!==(p.kind==='deploy'?'b':'a')||p.destination?.version!==(p.kind==='deploy'?'v0.2.0':'v0.1.7'))P.fail('approval');
    if(!P.uuid(p?.id)||p.target!=='isolated-staging'||p.siteId!==config.siteId||p.inventoryHash!==config.inventoryHash||digest!==sign(body)||approval!==digest
       ||p.commit!==config.approvedCommit||p.packageDigest!==config.approvedPackageDigest)P.fail('approval');
    if(p.expiresAt<now()||p.expiresAt>now()+10*60000)P.fail('expired-plan');
    if(JSON.stringify(p.previous)!==JSON.stringify(state())||p.expectedRouteHash!==io.route().hash)P.fail('stale');
  }
  function replay(p,kind){if(!P.uuid(p?.id))P.fail('operation-id');const file=opFile(p.id);if(!fs.existsSync(file))return null;const old=P.readJSON(file);if(old.planDigest!==p.digest||old.kind!==kind)P.fail('idempotency-conflict');return old;}
  async function execute(kind,p,pkg,approval) {
    if(p?.kind!==kind)P.fail('protocol');const existing=replay(p,kind);if(existing)return existing;
    approved(p,approval);if(kind==='deploy')P.verifyPacket(config,pkg,{fixture});const unlock=lock(config);let op;
    try {
      approved(p,approval);op={id:p.id,kind,planDigest:p.digest,siteId:config.siteId,inventoryHash:config.inventoryHash,commit:p.commit,packageDigest:p.packageDigest,previous:p.previous,destination:p.destination,backupId:p.backupId||null};
      save(op,'precheck');
      if(F.verifyRelease(config,p.previous.slot).version!==p.previous.version)P.fail('version-conflict');
      const baselineHealth=await io.health(p.previous.slot,{exercise:false});if(baselineHealth.version!==p.previous.version)P.fail('version-conflict');if(kind==='deploy')await io.preflight();
      const disk=fs.statfsSync(config.root), dbFile=P.within(config.root,'data',p.previous.slot,'private','operations.sqlite');P.noLinks(dbFile,true);
      const wal=dbFile+'-wal';if(fs.existsSync(wal))P.noLinks(wal,true);const sourceBytes=fs.statSync(dbFile).size+(fs.existsSync(wal)?fs.statSync(wal).size:0);
      if(disk.bavail*disk.bsize<Math.max(64*1024*1024,sourceBytes*8+JSON.stringify(pkg||{}).length*5))P.fail('disk');
      if(kind==='deploy') {
        save(op,'backup');const b=await V.createBackup(config,p.previous.slot,p.id);op.backupId=b.id;save(op,'backup-verified');
        save(op,'transfer');F.writeCode(config,'b',pkg.files,'v0.2.0',pkg.commit,pkg.digest);
        F.prepareData(config,'b','v0.2.0',JSON.parse(Buffer.from(pkg.files['dev-fixtures/rules.json'].content,'base64')));
        F.verifyRelease(config,'b');save(op,'start');await io.start('b');save(op,'health');op.health=await io.health('b',{exercise:true});
      } else {save(op,'rollback-check');await V.verifyBackup(config,p.backupId);F.verifyRelease(config,'a');await io.start('a');op.health=await io.health('a',{exercise:false});}
      await V.verifyBackup(config,op.backupId);save(op,'route-intent');
      const switched=await io.switchRoute(p.expectedRouteHash,p.destination.slot);op.switched=switched;
      P.atomic(P.within(config.root,'route.json'),{generation:p.previous.generation+1,...p.destination});save(op,'post-health');
      op.proxy=await io.proxyHealth(p.destination.version);
      if(kind==='rollback'){save(op,'drain');await io.stop('b');}
      save(op,kind==='rollback'?'rolled-back':'completed');return op;
    } catch(error) {
      if(!op)throw error;
      const code=/^[a-z0-9-]{1,64}$/.test(error.code||'')?error.code:'operation-failed';
      try {
        const observed=io.route();
        const ownedNext=P.hash('reverse_proxy 127.0.0.1:'+config.ports[p.destination.slot][1]+'\n');
        if(observed.slot===p.destination.slot&&observed.hash===ownedNext) {
          save(op,'restore-route',code);await io.switchRoute(ownedNext,p.previous.slot);await io.proxyHealth(p.previous.version);
          P.atomic(P.within(config.root,'route.json'),{...p.previous,generation:p.previous.generation+2});
        } else if(observed.slot!==p.previous.slot)P.fail('recovery-required');
        if(kind==='deploy'&&fs.existsSync(P.within(config.root,'launch','b.json')))await io.stop('b');
        save(op,kind==='rollback'?'recovery-required':'failed-stable',code);
      } catch {save(op,'recovery-required',code);}
      return op;
    } finally {unlock();}
  }
  async function handle(q) {
    P.request(q);if(q.siteId!==config.siteId||q.inventoryHash!==config.inventoryHash)P.fail('inventory-conflict');P.owner(config);audit(config,null);
    const p=q.payload;
    switch(q.method) {
      case 'status':return status();
      case 'preflight':return await io.preflight();
      case 'inspect':return P.readJSON(opFile(p.operationId));
      case 'plan':return plan('deploy',p.operationId);
      case 'deploy':return await execute('deploy',p.plan,p.package,p.approval);
      case 'rollback-plan':return plan('rollback',p.operationId,p.deploymentId);
      case 'rollback':return await execute('rollback',p.plan,null,p.approval);
      case 'verify-backup':return await V.verifyBackup(config,p.backupId);
      default:P.fail('method');
    }
  }
  return{handle,config,status};
}
module.exports={createBroker,audit};
