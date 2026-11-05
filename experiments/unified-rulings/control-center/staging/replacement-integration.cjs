'use strict';
// Disposable Ubuntu/CI rehearsal: actual apps share ports; exactly one app service at a time.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const P=require('./protocol.cjs'),R=require('./replacement.cjs'),{fixture,FakeReplacementIO}=require('./replacement-fixture.cjs'),{health,proxyHealth,available}=require('./ubuntu-io.cjs');
class ActualIO extends FakeReplacementIO{
  constructor(s,controller,{systemd=false,tools=__dirname,unitFile=null}={}){super(s.c);this.s=s;this.controller=controller;this.systemd=systemd;this.tools=tools;this.unitFile=unitFile;this.child=null;this.running=null;this.selected='v0.1.7';this.activeMax=0;}
  command(args){if(!this.systemd)P.fail('fixture');return execFileSync('/usr/bin/systemctl',args,{stdio:'ignore'});}
  unitText(version){const slot=version==='v0.1.7'?'a':'b';return '[Unit]\nDescription=RiftAssist disposable single-service replacement\n[Service]\nType=simple\nUser='+this.c.uid+'\nGroup='+this.c.gid+'\nWorkingDirectory='+path.join(this.s.stage.root,'data',slot)+'\nExecStart='+this.c.node+' --require '+this.tools+'/mock-legacy.cjs '+this.tools+'/replacement-rehearsal-runner.cjs '+path.join(this.s.stage.root,'launch',slot+'.json')+'\nKillMode=control-group\nTimeoutStopSec=115\nRestart=no\n';}
  async preflight(){if(!this.running)P.fail('fixture-stopped');await this.configurationUnchanged();}
  async stop(){
    this.calls.push('stop');if(this.systemd)this.command(['stop',this.c.service]);
    else if(this.child&&this.child.exitCode===null){const child=this.child;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('fixture-stop-timeout')),110000);child.once('exit',()=>{clearTimeout(timer);resolve();});child.kill('SIGTERM');});}
    this.child=null;this.running=null;
  }
  async assertStopped(){
    if(this.running)P.fail('concurrent-version');if(this.systemd){const o=execFileSync('/usr/bin/systemctl',['show',this.c.service,'--property=MainPID,ActiveState'],{encoding:'utf8'});if(!o.includes('MainPID=0')||o.includes('ActiveState=active'))P.fail('stop-unconfirmed');}
    for(const port of this.c.ports)if(!await available(port))P.fail('ports-not-released');
  }
  async backupBudget(){/* bounded synthetic SQLite only */}
  async configurationSnapshot(){await this.configurationUnchanged();return{selected:this.selected};}
  async finalizeCandidate(){require('./files.cjs').chownTree(this.s.stage,path.join(this.c.candidateData,'private'));}
  async select(version){await this.assertStopped();this.selected=version;if(this.systemd){P.atomic(this.unitFile,this.unitText(version),0o644);this.command(['daemon-reload']);}}
  async restorePrevious(version){await this.select(version);}
  async start(version){
    await this.assertStopped();if(this.selected!==version)P.fail('fixture-selector');this.calls.push('start:'+version);
    if(this.systemd)this.command(['start',this.c.service]);else{
      const slot=version==='v0.1.7'?'a':'b',c=this.s.stage;
      this.child=spawn(c.node,['--require',path.join(this.tools,'mock-legacy.cjs'),path.join(this.tools,'replacement-rehearsal-runner.cjs'),path.join(c.root,'launch',slot+'.json')],{env:this.controller.env(),stdio:'ignore',...(process.geteuid()===0?{uid:c.appUid,gid:c.appGid}:{})});this.child.on('error',()=>{});
    }
    this.running=version;this.activeMax=Math.max(this.activeMax,1);
  }
  async health(version){const result=await health(this.s.stage,version==='v0.1.7'?'a':'b',{exercise:version==='v0.2.0'});await proxyHealth(this.s.stage,version);return{...result,httpsVerified:true};}
}
async function main({systemd=false}={}){
  const caddy=process.env.RIFTASSIST_TEST_CADDY;if(!caddy||!path.isAbsolute(caddy))P.fail('test-caddy-required');
  const s=await fixture({realLegacy:true,caddy,uid:process.geteuid()===0?65534:process.geteuid(),gid:process.geteuid()===0?65534:process.getgid()}),{ProcessController}=require('./process-controller.cjs'),controller=new ProcessController(s.stage);
  let io,unitFile=null;const configHash=P.hash(fs.readFileSync(s.c.caddyFile)),routeHash=P.hash(fs.readFileSync(path.join(s.stage.root,'proxy/route.caddy')));
  try{
    let tools=__dirname;
    if(systemd){
      if(process.geteuid()!==0||fs.readFileSync('/proc/1/comm','utf8').trim()!=='systemd')P.fail('disposable-systemd-required');
      tools=path.join(s.temporary,'tools/staging');fs.mkdirSync(tools,{recursive:true,mode:0o755});fs.mkdirSync(path.join(s.temporary,'tools/deployment'),{mode:0o755});
      const testCaddy=path.join(s.temporary,'tools/caddy');fs.copyFileSync(s.stage.caddy,testCaddy);fs.chmodSync(testCaddy,0o755);s.stage.caddy=testCaddy;
      for(const name of fs.readdirSync(__dirname).filter(n=>n.endsWith('.cjs')))fs.copyFileSync(path.join(__dirname,name),path.join(tools,name));
      fs.copyFileSync(path.join(__dirname,'legacy-v017-baseline.json'),path.join(tools,'legacy-v017-baseline.json'));
      fs.copyFileSync(path.resolve(__dirname,'../deployment/lab.cjs'),path.join(s.temporary,'tools/deployment/lab.cjs'));fs.copyFileSync(path.resolve(__dirname,'../../releases/v0.2.0/src/external-services.js'),path.join(tools,'mock-services.cjs'));
      unitFile='/run/systemd/system/'+s.c.service;if(fs.existsSync(unitFile))P.fail('existing-unit');
    }
    io=new ActualIO(s,controller,{systemd,tools,unitFile});if(systemd){fs.writeFileSync(unitFile,io.unitText('v0.1.7'),{flag:'wx',mode:0o644});io.command(['daemon-reload']);}
    await io.start('v0.1.7');await health(s.stage,'a');await controller.command('start','proxy');
    let tls=false;for(let n=0;n<150;n++){try{await proxyHealth(s.stage,'v0.1.7');tls=true;break;}catch{}await new Promise(r=>setTimeout(r,100));}if(!tls)P.fail('initial-tls');
    const engine=R.createReplacement(s.raw,io,{rehearsal:true}),p=engine.plan('replace',crypto.randomUUID()),deployed=await engine.execute(p,p.digest);if(deployed.state!=='completed')P.fail('rehearsal-'+deployed.state+'-'+deployed.failure);
    const dbfile=path.join(s.c.candidateData,'private/operations.sqlite');let db=new(require('node:sqlite').DatabaseSync)(dbfile,{readOnly:true}),reports;try{reports=db.prepare('SELECT count(*) n FROM reports').get().n;}finally{db.close();}if(reports<2)P.fail('reports-not-preserved');
    const rb=engine.plan('rollback',crypto.randomUUID(),deployed.id),rolled=await engine.execute(rb,rb.digest);if(rolled.state!=='rolled-back')P.fail('rehearsal-rollback');
    db=new(require('node:sqlite').DatabaseSync)(dbfile,{readOnly:true});try{if(db.prepare('SELECT count(*) n FROM reports').get().n!==reports)P.fail('new-record-loss');}finally{db.close();}
    db=new(require('node:sqlite').DatabaseSync)(path.join(s.c.oldData,'private/operations.sqlite'),{readOnly:true});try{if(db.prepare('SELECT count(*) n FROM reports').get().n!==1)P.fail('old-record-loss');}finally{db.close();}
    for(const key of ['storage.key','sessions.key','manager.key'])if(P.hash(fs.readFileSync(path.join(s.c.oldData,'private',key)))!==P.hash(fs.readFileSync(path.join(s.c.candidateData,'private',key))))P.fail('key-not-preserved');
    if(R.codeReceipt(s.c.candidateCode).manifest.ready!==false)P.fail('source-readiness-changed');
    if(P.hash(fs.readFileSync(s.c.caddyFile))!==configHash||P.hash(fs.readFileSync(path.join(s.stage.root,'proxy/route.caddy')))!==routeHash)P.fail('caddy-changed');
    const proof={protocol:'riftassist-replacement-proof-1',mode:'single-instance-replacement',actualSystemd:systemd,appServiceUnits:systemd?1:0,actualV017ManagerGatewayWorker:true,legacyEphemeralPortsInjectedInMemory:true,actualV020ManagerGatewayWorker:true,samePortsReused:true,maxConcurrentVersions:io.activeMax,caddyConfigurationUnchanged:true,httpsVerified:true,encryptedBackupAndRestore:true,originalRecordsPreserved:true,postReplacementReportsRetained:reports,rolledBack:rolled.state==='rolled-back',additionalVmRequired:false,sourceReady:false,productionConnections:0,paidApiCalls:0};
    if(process.env.RIFTASSIST_REPLACEMENT_PROOF){fs.writeFileSync(process.env.RIFTASSIST_REPLACEMENT_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o644});fs.chmodSync(process.env.RIFTASSIST_REPLACEMENT_PROOF,0o644);}console.log(JSON.stringify(proof));return proof;
  }finally{if(io)await io.stop();await controller.close();if(unitFile&&fs.existsSync(unitFile)){fs.unlinkSync(unitFile);execFileSync('/usr/bin/systemctl',['daemon-reload'],{stdio:'ignore'});}s.cleanup();}
}
if(require.main===module)main({systemd:process.argv.includes('--systemd')}).catch(e=>{console.error(e.code||'replacement-rehearsal-failed');process.exitCode=1;});
module.exports={main,ActualIO};
