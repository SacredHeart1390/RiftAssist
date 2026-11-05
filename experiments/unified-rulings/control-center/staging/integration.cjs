'use strict';
// Run ONLY on a disposable Linux test host/container. No Azure credentials or real data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./protocol.cjs'),{site}=require('./fixture.cjs'),{createBroker}=require('./broker.cjs'),{UbuntuIO,SystemdController,proxyHealth}=require('./ubuntu-io.cjs');
async function main({systemd=false}={}) {
  const caddy=process.env.RIFTASSIST_TEST_CADDY;if(!caddy||!path.isAbsolute(caddy))throw Error('An explicit test Caddy executable is required.');
  const s=await site({caddy,realLegacy:true,appUid:process.geteuid()===0?65534:process.geteuid(),appGid:process.geteuid()===0?65534:process.getgid()});
  let config=s.config,raw=s.raw,controller,installed=[];let ownsSystemRoot=false;
  try {
    if(systemd){
      if(process.platform!=='linux'||process.geteuid()!==0||fs.readFileSync('/proc/1/comm','utf8').trim()!=='systemd')throw Error('Disposable native systemd runner with root is required.');
      const destination='/var/lib/riftassist-staging/'+s.config.siteId;
      if(fs.existsSync(destination))throw Error('Existing test site will not be overwritten.');
      fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o755});fs.cpSync(s.config.root,destination,{recursive:true});ownsSystemRoot=true;
      fs.mkdirSync(path.join(destination,'tools'),{recursive:true,mode:0o755});const testCaddy=path.join(destination,'tools/caddy');fs.copyFileSync(s.raw.caddy,testCaddy);fs.chmodSync(testCaddy,0o755);
      raw={...s.raw,root:destination,caddy:testCaddy};config=P.inventory(raw,{fixture:true});
      P.atomic(path.join(destination,'owner.json'),{schemaVersion:1,purpose:'isolated-staging',siteId:config.siteId,inventoryHash:config.inventoryHash},0o644);
      for(const slot of ['a']){const file=path.join(destination,'launch',slot+'.json'),old=P.readJSON(file);P.atomic(file,{...old,root:path.join(destination,'data',slot),source:path.join(destination,'releases',slot,'code')},0o644);}
      let text=fs.readFileSync(path.join(destination,'proxy/Caddyfile'),'utf8').replaceAll(s.config.root,destination);P.atomic(path.join(destination,'proxy/Caddyfile'),text,0o644);P.atomic(path.join(destination,'proxy/config-receipt.json'),{sha256:P.hash(text)});
      // cp does not promise to retain ownership: only these test-owned data/config trees are changed.
      const {chownTree}=require('./files.cjs');chownTree(config,path.join(destination,'data/a'));chownTree(config,path.join(destination,'proxy/data'));chownTree(config,path.join(destination,'proxy/config'));
      const tools=P.within(destination,'tools'),stage=path.join(tools,'staging');fs.mkdirSync(stage,{recursive:true,mode:0o755});fs.mkdirSync(path.join(tools,'deployment'),{mode:0o755});
      for(const name of fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs')))fs.copyFileSync(path.join(__dirname,name),path.join(stage,name));
      fs.copyFileSync(path.resolve(__dirname,'../deployment/lab.cjs'),path.join(tools,'deployment/lab.cjs'));
      fs.copyFileSync(path.resolve(__dirname,'../../releases/v0.2.0/src/external-services.js'),path.join(stage,'mock-services.cjs'));
      const units=require('./templates.cjs').systemdUnits(config,stage);
      for(const [name,content]of Object.entries(units)){const file='/run/systemd/system/'+name;if(fs.existsSync(file))throw Error('Existing unit will not be replaced.');fs.writeFileSync(file,content,{flag:'wx',mode:0o644});installed.push(file);}
      const{execFileSync}=require('node:child_process');execFileSync('/usr/bin/systemctl',['daemon-reload'],{stdio:'ignore'});controller=new SystemdController(config);
    } else controller=new(require('./process-controller.cjs').ProcessController)(config);
    const io=new UbuntuIO(config,controller),broker=createBroker(raw,io,{fixture:true});
    const q=(method,payload={})=>({protocol:P.PROTOCOL,requestId:crypto.randomUUID(),siteId:config.siteId,inventoryHash:config.inventoryHash,method,payload});
    await io.start('a');await io.health('a',{exercise:false});await io.start('proxy');
    let tls=false;const tlsDeadline=Date.now()+30000;for(let i=0;i<200&&Date.now()<tlsDeadline;i++){try{await proxyHealth(config,'v0.1.7');tls=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}if(!tls)throw Error('Initial isolated TLS probe failed.');
    const plan=await broker.handle(q('plan',{operationId:crypto.randomUUID()}));
    const deployed=await broker.handle(q('deploy',{plan,package:s.packet,approval:plan.digest}));
    if(deployed.state!=='completed')throw Error('Actual selected v020 app failed: '+deployed.state+'/'+deployed.failure);
    const backup=await broker.handle(q('verify-backup',{backupId:deployed.backupId}));
    const rb=await broker.handle(q('rollback-plan',{operationId:crypto.randomUUID(),deploymentId:deployed.id}));
    const rolled=await broker.handle(q('rollback',{plan:rb,approval:rb.digest}));
    if(rolled.state!=='rolled-back')throw Error('Isolated v017 rollback failed: '+rolled.state+'/'+rolled.failure);
    const db=new(require('node:sqlite').DatabaseSync)(path.join(config.root,'data/b/private/operations.sqlite'),{readOnly:true});let reports;try{reports=db.prepare('SELECT count(*) n FROM reports').get().n;}finally{db.close();}
    if(reports<1)throw Error('Synthetic post-deployment report was lost.');
    const status=await broker.handle(q('status'));
    const candidateReady=P.readJSON(path.join(config.root,'data/b/releases/v0.2.0/app-release.json')).ready;if(candidateReady!==false)throw Error('Candidate readiness was changed.');
    const result={protocol:'riftassist-staging-proof-1',actualSelectedV020App:true,legacyV017:'actual-server-source/isolated-direct-worker-fixture',actualCaddy:true,tlsVerified:true,actualSystemd:systemd,encryptedRestoreVerified:backup.verified,newReportsPreserved:reports,rolledBack:rolled.state==='rolled-back',sourceV020Ready:candidateReady,productionConnections:0,paidApiCalls:0,finalRoute:status.observed.slot};
    if(process.env.RIFTASSIST_STAGING_PROOF)fs.writeFileSync(process.env.RIFTASSIST_STAGING_PROOF,JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));return result;
  } catch(error){if(controller?.children)error.message+=' '+JSON.stringify(Object.fromEntries([...controller.children].map(([slot,p])=>[slot,{exit:p.exitCode,signal:p.signalCode}])));throw error;
  } finally {
    if(controller)for(const slot of ['proxy','b','a'])try{await controller.command('stop',slot);}catch{}
    if(systemd&&installed.length){const{execFileSync}=require('node:child_process');for(const file of installed)fs.unlinkSync(file);execFileSync('/usr/bin/systemctl',['daemon-reload'],{stdio:'ignore'});}
    if(ownsSystemRoot)fs.rmSync(config.root,{recursive:true,force:true});s.cleanup();
  }
}
if(require.main===module)main({systemd:process.argv.includes('--systemd')}).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
