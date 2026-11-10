'use strict';
// Disposable Ubuntu/CI rehearsal: actual apps share ports; exactly one app service at a time.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,execFileSync}=require('node:child_process');
const P=require('./protocol.cjs'),R=require('./replacement.cjs'),{fixture,FakeReplacementIO}=require('./replacement-fixture.cjs'),{health,proxyHealth,available}=require('./ubuntu-io.cjs');
class ActualIO extends FakeReplacementIO{
  constructor(s,controller,{systemd=false,tools=__dirname,unitFile=null}={}){super(s.c);this.s=s;this.controller=controller;this.systemd=systemd;this.tools=tools;this.unitFile=unitFile;this.child=null;this.running=null;this.selected='v0.1.7';this.activeMax=0;
    this.helper='riftassist-replacement-helper-test-'+s.c.siteId+'.service';this.helperUnit='/run/systemd/system/'+this.helper;this.helperDropIn=this.helperUnit+'.d/90-riftassist-maintenance.conf';this.helperMarker=path.join(s.c.oldData,'helper-started');
    if(systemd){
      this.prepareAutostart=async()=>{fs.mkdirSync(path.dirname(this.helperDropIn),{recursive:true});P.atomic(this.helperDropIn,require('./replacement-ubuntu.cjs').helperGuard,0o644);this.command(['daemon-reload']);return{syntheticHelperGuard:true};};
      this.finishMaintenance=async version=>{if(fs.existsSync(this.helperMarker))P.fail('helper-interfered');if(version==='v0.1.7'){fs.unlinkSync(this.helperDropIn);this.command(['daemon-reload']);}};
    }
  }
  command(args){if(!this.systemd)P.fail('fixture');return execFileSync('/usr/bin/systemctl',args,{stdio:'ignore'});}
  unitText(version){const slot=version==='v0.1.7'?'a':'b';return '[Unit]\nDescription=RiftAssist disposable single-service replacement\n'+(this.systemd?'Wants='+this.helper+'\n':'')+'[Service]\nType=simple\nEnvironmentFile='+path.join(this.s.temporary,'systemd-only.env')+'\nEnvironmentFile=\nUser='+this.c.uid+'\nGroup='+this.c.gid+'\nWorkingDirectory='+path.join(this.s.stage.root,'data',slot)+'\nExecStart='+this.c.node+' --require '+this.tools+'/mock-legacy.cjs '+this.tools+'/replacement-rehearsal-runner.cjs '+path.join(this.s.stage.root,'launch',slot+'.json')+'\nKillMode=control-group\nTimeoutStopSec=115\nRestart=no\n'+(this.systemd?require('./clean-rollback.cjs').isolation(this.c)+'BindReadOnlyPaths='+this.c.rollbackCode+':'+path.join(this.c.oldData,'releases/v0.1.7')+'\nInaccessiblePaths='+path.join(this.c.oldData,'releases/v0.1.7/scripts')+'\nExecStartPre='+this.c.node+' '+this.tools+'/namespace-proof.cjs '+this.s.temporary+' '+path.join(this.c.oldData,'namespace-proof.json')+' '+this.c.oldCode+' '+path.join(this.c.oldData,'releases/v0.1.7')+'\n':'')+(version==='v0.1.7'&&this.aiPaused?'Environment=RIFTASSIST_REHEARSAL_PAUSE_AI=true\n':'');}
  async preflight(_,{kind='replace'}={}){if(!this.running)P.fail('fixture-stopped');if(kind==='replace')require('./replacement-ubuntu.cjs').verifyLegacySource(this.c);await this.configurationUnchanged();}
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
  async finalizeCandidate(){require('./files.cjs').chownTree(this.s.stage,this.c.candidateData);}
  async verifyStoppedKnowledge(){await this.assertStopped();return require('./replacement-ubuntu.cjs').verifyLegacySource(this.c);}
  async select(version){await this.assertStopped();this.selected=version;this.aiPaused=version==='v0.1.7';if(this.systemd){P.atomic(this.unitFile,this.unitText(version),0o644);this.command(['daemon-reload']);}}
  async restorePrevious(version,snapshot,{pauseAi=false}={}){await this.select(version);this.aiPaused=version==='v0.1.7'&&pauseAi;if(this.systemd){P.atomic(this.unitFile,this.unitText(version),0o644);this.command(['daemon-reload']);}}
  async start(version){
    await this.assertStopped();if(this.selected!==version)P.fail('fixture-selector');this.calls.push('start:'+version);
    if(this.systemd)this.command(['start',this.c.service]);else{
      const slot=version==='v0.1.7'?'a':'b',c=this.s.stage;
      this.child=spawn(c.node,['--require',path.join(this.tools,'mock-legacy.cjs'),path.join(this.tools,'replacement-rehearsal-runner.cjs'),path.join(c.root,'launch',slot+'.json')],{env:{...this.controller.env(),...(this.aiPaused?{RIFTASSIST_REHEARSAL_PAUSE_AI:'true'}:{})},stdio:'ignore',...(process.geteuid()===0?{uid:c.appUid,gid:c.appGid}:{})});this.child.on('error',()=>{});
    }
    this.running=version;this.activeMax=Math.max(this.activeMax,1);
  }
  async health(version){const result=await health(this.s.stage,version==='v0.1.7'?'a':'b',{exercise:version==='v0.2.0'});await proxyHealth(this.s.stage,version);return{...result,httpsVerified:true};}
}
async function main({systemd=false}={}){
  const caddy=process.env.RIFTASSIST_TEST_CADDY;if(!caddy||!path.isAbsolute(caddy))P.fail('test-caddy-required');
  const s=await fixture({realLegacy:true,cleanRollback:systemd,caddy,uid:process.geteuid()===0?65534:process.geteuid(),gid:process.geteuid()===0?65534:process.getgid()}),{ProcessController}=require('./process-controller.cjs'),controller=new ProcessController(s.stage);
  // Change ONLY disposable synthetic knowledge; no production source is used.
  const legacy=await require('../../tests/helpers/legacy-knowledge.cjs').prepare(path.join(s.temporary,'legacy-source'),path.join(s.temporary,'legacy-candidate'),{commit:s.c.commit});
  for(const [target,source]of [[s.c.oldData,path.join(s.temporary,'legacy-source')],[s.c.candidateData,path.join(s.temporary,'legacy-candidate')]]){
    if(!target.startsWith(s.temporary+path.sep))P.fail('fixture-scope');
    fs.rmSync(path.join(target,'knowledge-releases'),{recursive:true});fs.cpSync(path.join(source,'knowledge-releases'),path.join(target,'knowledge-releases'),{recursive:true});require('./files.cjs').chownTree(s.stage,target);
  }
  s.raw.knowledgeHash=require('./replacement-ubuntu.cjs').knowledgeHash(s.c.candidateData).hash;s.c=R.config(s.raw,{rehearsal:true});P.atomic(path.join(s.c.root,'owner.json'),{purpose:'single-instance-replacement',siteId:s.c.siteId,inventoryHash:s.c.inventoryHash},0o644);
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
    if(systemd){for(const target of [s.c.oldCode,path.join(s.c.oldData,'releases/v0.1.7')]){fs.mkdirSync(path.join(target,'node_modules'),{mode:0o775});fs.chmodSync(path.join(target,'node_modules'),0o775);fs.writeFileSync(path.join(target,'package-lock.json'),'{}',{mode:0o664});fs.chmodSync(path.join(target,'package-lock.json'),0o664);}}
    io=new ActualIO(s,controller,{systemd,tools,unitFile});if(systemd){fs.writeFileSync(path.join(s.temporary,'systemd-only.env'),'RIFTASSIST_ENV_RESET_CANARY=unexpected\n',{mode:0o644});
      fs.writeFileSync(path.join(s.c.oldData,'.env'),'OPENAI_MODEL=synthetic-model\n',{mode:0o600});require('./files.cjs').chownTree(s.stage,s.c.oldData);
      fs.writeFileSync(unitFile,'[Service]\nExecStart=/usr/bin/true\nEnvironmentFile='+path.join(s.c.oldData,'.env')+'\n',{flag:'wx',mode:0o644});io.command(['daemon-reload']);
      const envMetadata=execFileSync('/usr/bin/systemctl',['show',s.c.service,'--property=EnvironmentFiles','--value'],{encoding:'utf8'}).trim();
      require('./runtime-config.cjs').environmentReferences({...s.c,evidence:{...s.c.evidence,configuration:{environmentFilesPolicy:'old-data-dotenv-only-reset'}}},envMetadata);
      fs.writeFileSync(io.helperUnit,'[Unit]\nRequires='+s.c.service+'\nAfter='+s.c.service+'\nPartOf='+s.c.service+'\n[Service]\nType=oneshot\nUser='+s.c.uid+'\nGroup='+s.c.gid+'\nExecStart=/usr/bin/touch '+io.helperMarker+'\nRestart=on-failure\n',{flag:'wx',mode:0o644});
      fs.writeFileSync(unitFile,io.unitText('v0.1.7'),{mode:0o644});io.command(['daemon-reload']);}
    await io.start('v0.1.7');await health(s.stage,'a');
    if(systemd){for(let n=0;n<100&&!fs.existsSync(io.helperMarker);n++)await new Promise(r=>setTimeout(r,20));if(!fs.existsSync(io.helperMarker))P.fail('initial-helper-not-invoked');fs.unlinkSync(io.helperMarker);}
    await controller.command('start','proxy');
    let tls=false;for(let n=0;n<150;n++){try{await proxyHealth(s.stage,'v0.1.7');tls=true;break;}catch{}await new Promise(r=>setTimeout(r,100));}if(!tls)P.fail('initial-tls');
    // The release path is direct replace: no independent qualification outage.
    const engine=R.createReplacement(s.raw,io,{rehearsal:true}),from=io.calls.length,p=engine.plan('replace',crypto.randomUUID()),deployed=await engine.execute(p,p.digest);if(deployed.state!=='completed')P.fail('rehearsal-'+deployed.state+'-'+deployed.failure);
    const deploymentCalls=io.calls.slice(from),deploymentStops=deploymentCalls.filter(c=>c==='stop').length;
    if(deploymentStops!==1||deploymentCalls.filter(c=>c.startsWith('start:')).join(',')!=='start:v0.2.0')P.fail('extra-deployment-outage');
    if(!deployed.probe?.integrity||deployed.probe.compatibility?.schemaHash!==s.c.schemaHash||!deployed.probe.keyNames?.includes('sessions.key'))P.fail('replace-backup-check-missing');
    if(engine.status().operations.some(o=>o.kind==='qualify-backup'))P.fail('unexpected-independent-qualification');
    const origin='http://127.0.0.1:'+s.c.ports[1],catalog=await(await fetch(origin+'/api/cards/search?browse=1')).json();
    if(catalog.total!==legacy.cards.cards.length||catalog.access?.mode!=='legacy-reviewed')P.fail('legacy-card-search');
    const session=await fetch(origin+'/api/health'),cookie=session.headers.get('set-cookie')?.split(';')[0];await session.json();
    const card=legacy.cards.cards[0],cardAnswer=await(await fetch(origin+'/api/ask',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({clientKey:crypto.randomUUID(),language:'ko',question:card.nameKo+' 같은 턴 같은 전장에서 두 번 득점하나요?',cardIds:[card.id]})})).json();
    if(cardAnswer.ai?.used!==true||!cardAnswer.cards?.some(c=>c.id===card.id))P.fail('legacy-card-ai');
    const dbfile=path.join(s.c.candidateData,'private/operations.sqlite');let db=new(require('node:sqlite').DatabaseSync)(dbfile,{readOnly:true}),reports;try{reports=db.prepare('SELECT count(*) n FROM reports').get().n;}finally{db.close();}if(reports<2)P.fail('reports-not-preserved');
    const rb=engine.plan('rollback',crypto.randomUUID(),deployed.id),rolled=await engine.execute(rb,rb.digest);if(rolled.state!=='rolled-back')P.fail('rehearsal-rollback');
    db=new(require('node:sqlite').DatabaseSync)(dbfile,{readOnly:true});try{if(db.prepare('SELECT count(*) n FROM reports').get().n!==reports)P.fail('new-record-loss');}finally{db.close();}
    db=new(require('node:sqlite').DatabaseSync)(path.join(s.c.oldData,'private/operations.sqlite'),{readOnly:true});try{if(db.prepare('SELECT count(*) n FROM reports').get().n!==1)P.fail('old-record-loss');}finally{db.close();}
    for(const key of ['storage.key','sessions.key','manager.key'])if(P.hash(fs.readFileSync(path.join(s.c.oldData,'private',key)))!==P.hash(fs.readFileSync(path.join(s.c.candidateData,'private',key))))P.fail('key-not-preserved');
    if(systemd){
      const envMetadata=execFileSync('/usr/bin/systemctl',['show',s.c.service,'--property=EnvironmentFiles','--value'],{encoding:'utf8'}).trim();if(envMetadata!=='')P.fail('environment-file-reset-unverified');
      await io.stop();await io.assertStopped();await io.start('v0.1.7');await io.health('v0.1.7');
      for(let n=0;n<100&&!fs.existsSync(io.helperMarker);n++)await new Promise(r=>setTimeout(r,20));if(!fs.existsSync(io.helperMarker))P.fail('legacy-helper-not-restored');
    }
    const oldHealth=await(await fetch('http://127.0.0.1:'+s.c.ports[1]+'/api/health')).json();if(oldHealth.aiEnabled!==false)P.fail('rollback-budget-not-paused');
    if(R.codeReceipt(s.c.candidateCode).manifest.ready!==false)P.fail('source-readiness-changed');
    if(P.hash(fs.readFileSync(s.c.caddyFile))!==configHash||P.hash(fs.readFileSync(path.join(s.stage.root,'proxy/route.caddy')))!==routeHash)P.fail('caddy-changed');
    if(systemd){const ns=JSON.parse(fs.readFileSync(path.join(s.c.oldData,'namespace-proof.json')));if(!ns.originalExtrasInvisible||!ns.collectorScriptsInaccessible||!fs.existsSync(path.join(s.c.oldCode,'node_modules')))P.fail('namespace-proof');for(const target of [s.c.oldCode,path.join(s.c.oldData,'releases/v0.1.7')])if((fs.statSync(path.join(target,'node_modules')).mode&0o777)!==0o775||(fs.statSync(path.join(target,'package-lock.json')).mode&0o777)!==0o664)P.fail('original-extra-mode-changed');}
    const proof={legacyCardsRetained:catalog.total,legacyCardSearchVerified:true,legacyCardMockAiVerified:true,independentQualificationUsed:false,deploymentStops,backupVerifiedInsideReplace:true,environmentFilesResetVerified:systemd,helperBlockedDuringReplacement:systemd,legacyHelperRestoredOnServiceRestart:systemd,cleanRollbackNamespaceVerified:systemd,originalExtrasPreserved:systemd,protocol:'riftassist-replacement-proof-1',mode:'single-instance-replacement',actualSystemd:systemd,appServiceUnits:systemd?1:0,actualV017ManagerGatewayWorker:true,legacyEphemeralPortsInjectedInMemory:true,actualV020ManagerGatewayWorker:true,samePortsReused:true,maxConcurrentVersions:io.activeMax,caddyConfigurationUnchanged:true,httpsVerified:true,encryptedBackupAndRestore:true,originalRecordsPreserved:true,postReplacementReportsRetained:reports,rolledBack:rolled.state==='rolled-back',additionalVmRequired:false,sourceReady:false,backupQualifiedWhileNotReady:false,rollbackGenerationPaused:oldHealth.aiEnabled===false,productionConnections:0,paidApiCalls:0};
    if(process.env.RIFTASSIST_REPLACEMENT_PROOF){fs.writeFileSync(process.env.RIFTASSIST_REPLACEMENT_PROOF,JSON.stringify(proof,null,2)+'\n',{flag:'wx',mode:0o644});fs.chmodSync(process.env.RIFTASSIST_REPLACEMENT_PROOF,0o644);}console.log(JSON.stringify(proof));return proof;
  }finally{if(io)await io.stop();await controller.close();if(systemd&&io){try{execFileSync('/usr/bin/systemctl',['stop',io.helper],{stdio:'ignore'});}catch{}if(fs.existsSync(io.helperUnit))fs.unlinkSync(io.helperUnit);fs.rmSync(path.dirname(io.helperDropIn),{recursive:true,force:true});}if(unitFile&&fs.existsSync(unitFile)){fs.unlinkSync(unitFile);execFileSync('/usr/bin/systemctl',['daemon-reload'],{stdio:'ignore'});}s.cleanup();}
}
if(require.main===module)main({systemd:process.argv.includes('--systemd')}).catch(e=>{console.error(e.code||'replacement-rehearsal-failed');process.exitCode=1;});
module.exports={main,ActualIO};
