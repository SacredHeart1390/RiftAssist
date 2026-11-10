'use strict';
// Fixed Windows SSH orchestration only. No keys, API calls to AI, generic shell,
// migrations, unreviewed ready changes, automatic retries or new server service.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const fail=code=>{throw Object.assign(Error(code),{code});};
const target='azureuser@20.222.152.195';
const useful=s=>typeof s==='string'&&s.trim().length>=3&&s.length<=500&&!/\[[^\]]+\]|<[^>]+>|확인 필요|미확정|placeholder|unverified|pending/i.test(s);
function files(root){
  const out={};
  const walk=(dir,relative='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const name=relative?relative+'/'+e.name:e.name,s=fs.lstatSync(path.join(dir,e.name));
    if(s.isSymbolicLink()||!s.isDirectory()&&(!s.isFile()||s.nlink!==1)||s.size>128*1024*1024)fail('kit-shape');
    if(s.isDirectory())walk(path.join(dir,e.name),name);else out[name]=hash(fs.readFileSync(path.join(dir,e.name)));
  }};walk(root);return out;
}
function json(root,name){return JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));}
function inspect(root){
  const actual=files(root),m=json(root,'KIT-MANIFEST.json');
  if(m.protocol!=='riftassist-one-shot-1'||m.target!==target||!uuid(m.siteId)||!sha(m.inventoryHash)||!/^([a-f0-9]{40})$/.test(m.commit))fail('kit-manifest');
  delete actual['KIT-MANIFEST.json'];
  if(JSON.stringify(Object.keys(actual).sort())!==JSON.stringify(Object.keys(m.files).sort())||Object.entries(m.files).some(([n,h])=>!sha(h)||actual[n]!==h))fail('kit-integrity');
  const raw=json(root,'inventory.json'),plan=json(root,'capsule/INSTALLATION-PLAN.json'),policy=json(root,'launch-policy.json'),source=json(root,'capsule/candidate/app-release.json');
  if(hash(JSON.stringify(raw))!==m.inventoryHash||hash(fs.readFileSync(path.join(root,'inventory.json')))!==m.inventoryFileSha256||hash(fs.readFileSync(path.join(root,'capsule/INSTALLATION-PLAN.json')))!==m.planSha256)fail('kit-binding');
  if(plan.siteId!==m.siteId||raw.siteId!==m.siteId||raw.commit!==m.commit||plan.commit!==m.commit||raw.candidateHash!==plan.candidateHash||raw.oldCodeHash!==plan.rollbackReferenceHash||raw.root!=='/var/lib/riftassist-replacement/'+m.siteId||raw.candidateData!==raw.root+'/data/v0.2.0')fail('kit-binding');
  const packageVerifier=require(path.join(root,'capsule/site/tools/replacement-package.cjs'));
  packageVerifier.verify(path.join(root,'capsule'),{expectedPlanHash:m.planSha256});
  const blockers=[];
  if(source.ready!==true||source.developmentOnly!==false||plan.sourceReady!==true)blockers.push('source-not-ready');
  if(raw.installationApproved!==true||raw.inventoryVerified!==true)blockers.push('inventory-not-final');
  const attested=v=>v?.status==='verified'&&v.commit===m.commit&&useful(v.reference);
  for(const n of ['topology','autostart','rights','privacy','backupPolicy','resources','configuration','compatibility','rehearsal','rollbackIsolation'])if(!attested(raw.evidence?.[n]))blockers.push(n+'-not-verified');
  for(const n of ['appAuthorization','rulesRights','rollbackRights','privacy','backupCustody','sourceReadyApproval'])if(!attested(policy[n]))blockers.push(n+'-not-verified');
  if(!['written-license','approved-app-specific-api-key'].includes(policy.appAuthorization?.kind))blockers.push('riot-app-authorization-required');
  if(!useful(policy.controllerName)||!useful(policy.privacyEmail)||!/^\S+@\S+\.\S+$/.test(policy.privacyEmail)||!useful(policy.privacyLegalReference))blockers.push('privacy-details-missing');
  if(policy.backupRetentionDays!==30||policy.backupAccessPersons!==1||!useful(policy.externalBackupLocation)||!useful(policy.separateRecoveryKeyCustody))blockers.push('backup-custody-missing');
  const cfg=raw.evidence?.configuration;
  if(policy.aiTransfersApproved!==true&&(cfg?.liveProviderApproved!==false||cfg?.generationEnabled!==false))blockers.push('unapproved-ai-must-be-off');
  if(!Number.isSafeInteger(m.ci?.controlRunId)||!Number.isSafeInteger(m.ci?.rulesRunId)||m.ci?.commit!==m.commit||m.ci?.requiredJobsSucceeded!==true)blockers.push('exact-ci-missing');
  if(!m.knowledgeFiles||Object.keys(m.knowledgeFiles).length!==5)blockers.push('approved-rules-missing');
  else{
    const k=require(path.join(root,'capsule/site/tools/replacement-ubuntu.cjs')).knowledgeHash(path.join(root,'knowledge'));
    const manifest=json(k.directory,'manifest.json'),cards=json(k.directory,'cards.json'),cases=json(k.directory,'judge-cases.json'),review=manifest.sources?.minimumRelease;
    if(k.hash!==raw.knowledgeHash||review?.mode!=='approved-rules-only'||review.reviewCommit!==m.commit||review.rulesSha256!==hash(fs.readFileSync(path.join(k.directory,'rules.json')))||cards.cards?.length!==0||cases.length!==0||!useful(review.reviewReference))blockers.push('knowledge-scope');
    if(Object.entries(m.knowledgeFiles).some(([n,h])=>actual['knowledge/'+n]!==h))fail('knowledge-binding');
  }
  return{m,raw,blockers:[...new Set(blockers)]};
}
function sshArgs(home){return['-F','NUL','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','UpdateHostKeys=no','-o','ForwardAgent=no','-o','ClearAllForwardings=yes','-o','ConnectionAttempts=1','-o','ConnectTimeout=10','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=2','-o','UserKnownHostsFile="'+path.join(home,'.ssh','known_hosts').replaceAll('\\','/')+'"','-i',path.join(home,'.ssh','riftassistant-key.pem')];}
function native(file,args,input='',timeout=30000){return new Promise((resolve,reject)=>{
  const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_PATH;delete env.NODE_TEST_CONTEXT;
  let child;try{child=require('node:child_process').spawn(file,args,{shell:false,windowsHide:true,env,stdio:['pipe','pipe','pipe']});}catch{return reject(Error('native-start-failed'));}
  let out='',size=0,settled=false;const finish=(err,value)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve(value);};
  const timer=setTimeout(()=>{child.kill();finish(Error('native-timeout-result-uncertain'));},timeout);
  child.stdout.on('data',b=>{size+=b.length;if(size>1024*1024){child.kill();finish(Error('response-size-result-uncertain'));}else out+=b.toString('utf8');});
  child.stderr.on('data',()=>{}); // Never display or persist potentially sensitive native stderr.
  child.on('error',()=>finish(Error('native-start-failed')));child.on('close',code=>finish(code===0?null:Error('native-failed-result-uncertain'),out));
  child.stdin.on('error',()=>{});child.stdin.end(input);
});}
function adapter(home,root,m){
  const directory=path.join(process.env.SystemRoot||'C:\\Windows','System32','OpenSSH'),ssh=path.join(directory,'ssh.exe'),scp=path.join(directory,'scp.exe'),args=sshArgs(home);
  for(const f of [ssh,scp,path.join(home,'.ssh','known_hosts'),path.join(home,'.ssh','riftassistant-key.pem')])if(!fs.statSync(f).isFile())fail('windows-ssh-configuration-missing');
  const remote=command=>native(ssh,[...args,target,command]);
  const endpoint='/usr/bin/sudo -n -- /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw '+m.root+'/tools/replacement-serve.cjs';
  return{
    reserve:()=>remote('umask 077; mkdir /home/azureuser/riftassist-code-'+m.siteId),
    upload:()=>native(scp,[...args.filter(a=>a!=='-T'),'-r',path.join(root,'capsule'),path.join(root,'inventory.json'),path.join(root,'knowledge'),target+':/home/azureuser/riftassist-code-'+m.siteId+'/'],'',180000),
    install:()=>native(ssh,[...args,target,'/usr/bin/sudo -n -- /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/python3 -I -'],
      'INPUT = '+JSON.stringify({siteId:m.siteId,capsuleFiles:Object.fromEntries(Object.entries(m.files).filter(([n])=>n.startsWith('capsule/')).map(([n,h])=>[n.slice(8),h])),knowledgeFiles:m.knowledgeFiles,inventoryHash:m.inventoryHash,inventoryFileSha256:m.inventoryFileSha256,planSha256:m.planSha256})+'\n'+fs.readFileSync(path.join(root,'one-shot-install.py'),'utf8'),240000).then(JSON.parse),
    query:(method,operationId)=>native(ssh,[...args,target,endpoint],JSON.stringify({protocol:'riftassist-replacement-1',requestId:crypto.randomUUID(),inventoryHash:m.inventoryHash,method,payload:method==='inspect'?{operationId}:{}})+'\n').then(JSON.parse),
    replace:id=>native(ssh,[...args,target,endpoint+' --approved-replace '+m.inventoryHash+' '+id],'',720000).then(JSON.parse),
    publicVersion:()=>publicVersion(),
  };
}
function publicVersion(){return new Promise((resolve,reject)=>{
  const req=require('node:https').get('https://riftassistant.app/api/release',{rejectUnauthorized:true,headers:{'Cache-Control':'no-cache'},timeout:6000},res=>{let b='';res.on('data',s=>{b+=s;if(b.length>65536)res.destroy(Error('response-limit'));});res.on('error',()=>reject(Error('https-verification-failed')));res.on('end',()=>{try{if(res.statusCode!==200||JSON.parse(b).releaseId!=='v0.2.0')throw Error();resolve('v0.2.0');}catch{reject(Error('https-version-not-confirmed'));}});});req.on('error',()=>reject(Error('https-verification-failed')));req.on('timeout',()=>req.destroy());
});}
function cleanResult(r,id){
  if(r?.protocol!=='riftassist-replacement-1'||r.ok!==true||r.result?.id!==id||!['completed','rolled-back','qualified','failed-stable','recovery-required','preflight','stop-intent','stopped','backup','backup-verified','configuration-intent','start-intent','health','recovery-stop'].includes(r.result.state))fail('operation-response-uncertain');
  return{operationId:id,state:r.result.state,...(/^[a-z0-9-]{1,100}$/.test(r.result.failure||'')?{failure:r.result.failure}:{})};
}
async function run(root,{journal,confirm,io,show=()=>{}}){
  const info=inspect(root),{m,raw,blockers}=info;
  if(blockers.length){show('BLOCKED: '+blockers.join(', '));return{state:'blocked',blockers};}
  let old;try{old=JSON.parse(fs.readFileSync(journal,'utf8'));}catch(e){if(e.code!=='ENOENT')fail('local-receipt-invalid');}
  io=io||adapter(process.env.USERPROFILE,root,{...m,root:raw.root});
  if(old){
    if(old.inventoryHash!==m.inventoryHash||!uuid(old.operationId))fail('local-receipt-invalid');
    show('Existing operation '+old.operationId+'; READ-ONLY recovery. No writes are retried.');
    try{const response=await io.query('inspect',old.operationId);if(response.inventoryHash!==m.inventoryHash)fail('response-binding');const result=cleanResult(response,old.operationId);show(JSON.stringify(result));if(result.state==='completed')return{...result,publicVersion:await io.publicVersion()};return result;}catch{try{await io.query('reconcile');show('Server status checked; installation/operation outcome still requires review.');}catch{show('Server status unavailable; preserve the receipt and do not repeat writes.');}return{state:'uncertain',operationId:old.operationId};}
  }
  show('Target '+target+' / riftassist.service / https://riftassistant.app');
  show('Source '+m.commit+'; site '+m.siteId+'; inventory '+m.inventoryHash);
  show('CI https://github.com/SacredHeart1390/RiftAssist/actions/runs/'+m.ci.controlRunId+' and '+m.ci.rulesRunId);
  show('Approve A code/rules installation and C NOW: stop service once, encrypted DB/WAL/keys/env backup, independent restore/decryption checks, switch and conditional clean v0.1.7 recovery. Caddy unchanged. Downtime may exceed the proposed 10-minute window. Unknown/corrupt recovery stops safely. No paid health calls.');
  if(!await confirm())return{state:'cancelled'};
  const record={protocol:'riftassist-launch-receipt-1',inventoryHash:m.inventoryHash,commit:m.commit,siteId:m.siteId,operationId:crypto.randomUUID(),phase:'approved',createdAt:new Date().toISOString()};
  fs.mkdirSync(path.dirname(journal),{recursive:true,mode:0o700});fs.writeFileSync(journal,JSON.stringify(record)+'\n',{flag:'wx',mode:0o600});
  const save=phase=>{record.phase=phase;const temp=journal+'.tmp';fs.writeFileSync(temp,JSON.stringify(record)+'\n',{flag:'wx',mode:0o600});fs.renameSync(temp,journal);show(phase+' / operation '+record.operationId);};
  try{
    save('A-upload-intent');await io.reserve();await io.upload();
    save('A-install-intent');const receipt=await io.install();
    if(receipt.siteId!==m.siteId||receipt.inventoryHash!==m.inventoryHash||receipt.rollbackReferenceHash!==raw.oldCodeHash||receipt.sourceReady!==true||receipt.codeOnlyInstalled!==true||['serviceChanged','caddyChanged','operationalDataRead','activePointerChanged'].some(k=>receipt[k]!==false))fail('installation-receipt-rejected');
    const preflight=await io.query('preflight');if(preflight?.ok!==true||preflight.inventoryHash!==m.inventoryHash||preflight.result?.readyForApprovedExecution!==true||preflight.result?.blockers?.length!==0)fail('preflight-rejected');
    save('C-replace-intent');const response=await io.replace(record.operationId),result=cleanResult(response,record.operationId);
    if(response.inventoryHash!==m.inventoryHash)fail('operation-response-uncertain');save(result.state);
    if(result.state!=='completed')return result;
    if(await io.publicVersion()!=='v0.2.0')fail('https-version-not-confirmed');save('completed-public-version-verified');
    return{...result,publicVersion:'v0.2.0'};
  }catch{
    // May have committed on the server: never resend installation or replace.
    show('Outcome uncertain or rejected. No automatic write retry. Checking the SAME operation.');
    try{const response=await io.query('inspect',record.operationId);if(response.inventoryHash!==m.inventoryHash)fail('response-binding');const result=cleanResult(response,record.operationId);show(JSON.stringify(result));return{...result,publicVersionVerified:false};}catch{try{await io.query('reconcile');}catch{}return{state:'uncertain',operationId:record.operationId};}
  }
}
async function main(){
  if(process.platform!=='win32')fail('windows-only');
  const root=__dirname,info=inspect(root);if(info.blockers.length){console.log('NOT DEPLOYABLE: '+info.blockers.join(', '));process.exitCode=2;return;}
  const readline=require('node:readline/promises'),rl=readline.createInterface({input:process.stdin,output:process.stdout});
  try{const journal=path.join(process.env.LOCALAPPDATA,'RiftAssist','Release',info.m.inventoryHash+'.json');const result=await run(root,{journal,show:console.log,confirm:async()=>/^(y|yes)$/i.test((await rl.question('Execute the displayed A + C NOW? [y/N] ')).trim())});console.log(JSON.stringify(result));if(result.state!=='completed'||result.publicVersion!=='v0.2.0')process.exitCode=2;}finally{rl.close();}
}
if(require.main===module)main().catch(()=>{console.error('Release blocked or result uncertain. No secrets displayed; do not repeat writes.');process.exitCode=1;});
module.exports={files,inspect,sshArgs,native,run,cleanResult};
