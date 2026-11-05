'use strict';
// Offline, code-only preparation. No SSH, DB, keys, systemd or operational filesystem access.
const fs=require('node:fs'),path=require('node:path'),P=require('./protocol.cjs'),R=require('./replacement.cjs');
const modules=['replacement.cjs','replacement-ubuntu.cjs','replacement-launch.cjs','replacement-serve.cjs','protocol.cjs','files.cjs','vault.cjs','restore-probe.cjs','broker.cjs','legacy-v017.cjs','legacy-v017-baseline.json','ubuntu-io.cjs','data-compatibility.cjs'];
function prepare(release,destination,{siteId,commit}){
  if(!P.uuid(siteId)||!(/^[a-f0-9]{40}$/.test(commit||'')))P.fail('package-identity');P.noLinks(destination);if(fs.existsSync(destination))P.fail('exists');
  const receipt=R.codeReceipt(release),root='/var/lib/riftassist-replacement/'+siteId,files={};
  const add=(target,bytes,mode=0o644)=>{if(files[target])P.fail('package-collision');if(bytes.length>16*1024*1024)P.fail('package-size');
    if(/\b(?:RGAPI-[A-Za-z0-9-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{20,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(bytes.toString().replaceAll('sk-regression-dummy-not-a-real-key','synthetic-fixture')))P.fail('sensitive-package');
    files[target]={bytes,mode};};
  for(const name of ['app-release.json',...Object.keys(receipt.manifest.hashes)]){const file=P.within(release,name);P.noLinks(file,true);add('candidate/'+name,fs.readFileSync(file));}
  for(const name of modules){const file=P.within(__dirname,name);P.noLinks(file,true);add('broker/staging/'+name,fs.readFileSync(file));add('site/tools/'+name,fs.readFileSync(file));}
  const lab=fs.readFileSync(P.within(path.resolve(__dirname,'..'),'deployment/lab.cjs'));add('broker/deployment/lab.cjs',lab);add('site/deployment/lab.cjs',lab);
  add('broker/riftassist-replacement-broker',Buffer.from(require('./templates.cjs').replacementWrapper),0o755);
  const hashes=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,'en')).map(([n,v])=>[n,P.hash(v.bytes)]));
  const plan={protocol:'riftassist-replacement-installation-plan-1',siteId,commit,candidateHash:receipt.hash,sourceReady:receipt.manifest.ready===true,installationApproved:false,authorizedToDeploy:false,
    targets:{candidate:root+'/releases/v0.2.0',siteTools:root+'/tools',siteDependency:root+'/deployment/lab.cjs',broker:'/usr/local/lib/riftassist-replacement',wrapper:'/usr/local/libexec/riftassist-replacement-broker',inventory:'/etc/riftassist-replacement/inventory.json',newData:root+'/data/v0.2.0'},
    constraints:{existingPathsMustBeAbsent:true,rootOwnedCode:true,separateUserOwnedData:true,serviceChangesDuringInstallation:false,dbAndKeysIncluded:false,knowledgeIncluded:false,caddyChanges:false,additionalVm:false},
    blockers:['review-actual-topology-and-autostart','pin-unit-caddy-identity-runtime','approved-knowledge-rights-and-privacy','review-inventory-and-backup-policy','separate-inactive-installation-approval','separate-offline-backup-qualification','release-readiness-decision','separate-replacement-approval'],files:hashes};
  // All source/hash/secret checks complete before creating any destination.
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  for(const [name,v]of Object.entries(files)){const file=P.within(destination,name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o755});fs.writeFileSync(file,v.bytes,{flag:'wx',mode:v.mode});}
  P.atomic(P.within(destination,'INSTALLATION-PLAN.json'),plan);return verify(destination);
}
function verify(directory,{expectedPlanHash}={}){
  const planSha256=P.hash(fs.readFileSync(P.within(directory,'INSTALLATION-PLAN.json')));if(expectedPlanHash!==undefined&&expectedPlanHash!==planSha256)P.fail('installation-plan-pin');
  const plan=P.readJSON(P.within(directory,'INSTALLATION-PLAN.json'));
  if(plan.protocol!=='riftassist-replacement-installation-plan-1'||plan.installationApproved!==false||plan.authorizedToDeploy!==false||!P.uuid(plan.siteId))P.fail('installation-plan');
  const expected=new Set(['INSTALLATION-PLAN.json',...Object.keys(plan.files||{})]);let count=0;
  const walk=(folder,relative='')=>{for(const e of fs.readdirSync(folder,{withFileTypes:true})){const n=relative?relative+'/'+e.name:e.name,file=P.within(directory,n);P.noLinks(file,e.isFile());if(e.isDirectory()){if(![...expected].some(k=>k.startsWith(n+'/')))P.fail('unapproved-code-file');walk(file,n);}else{if(!e.isFile()||!expected.has(n))P.fail('unapproved-code-file');if(n!=='INSTALLATION-PLAN.json'){if(!P.sha(plan.files[n])||P.hash(fs.readFileSync(file))!==plan.files[n])P.fail('package-integrity');count++;}}}};walk(directory);
  if(count!==Object.keys(plan.files).length||R.codeReceipt(path.join(directory,'candidate')).hash!==plan.candidateHash)P.fail('package-integrity');
  return{protocol:plan.protocol,commit:plan.commit,filesVerified:count,planSha256,candidateHash:plan.candidateHash,installationApproved:false,authorizedToDeploy:false,operationalDataIncluded:false};
}
module.exports={prepare,verify};
