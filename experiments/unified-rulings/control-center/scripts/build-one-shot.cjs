'use strict';
// Assemble existing code capsule and public review evidence, never operating data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const client=require('./one-shot-release.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function build({capsule,inventory,knowledge,policy,node,license,destination,ci}){
  if(fs.existsSync(destination))throw Error('Choose a new kit directory.');
  const proof=require('../staging/replacement-package.cjs').verify(capsule),raw=JSON.parse(fs.readFileSync(inventory,'utf8'));
  const plan=JSON.parse(fs.readFileSync(path.join(capsule,'INSTALLATION-PLAN.json'),'utf8'));
  if(raw.commit!==proof.commit||raw.siteId!==plan.siteId||ci.commit!==raw.commit)throw Error('Commit/site mismatch.');
  if(Object.keys(client.files(capsule)).some(n=>/^(?:private|\.ssh|\.env)(?:\/|$)/.test(n)))throw Error('Only code is accepted.');
  fs.mkdirSync(destination,{recursive:true});
  fs.cpSync(capsule,path.join(destination,'capsule'),{recursive:true,errorOnExist:true});
  fs.copyFileSync(inventory,path.join(destination,'inventory.json'));
  fs.mkdirSync(path.join(destination,'runtime'));
  fs.copyFileSync(node,path.join(destination,'runtime/node.exe'));fs.copyFileSync(license,path.join(destination,'runtime/NODE-LICENSE.txt'));
  for(const n of ['one-shot-release.cjs','one-shot-install.py'])fs.copyFileSync(path.join(__dirname,n),path.join(destination,n));
  fs.writeFileSync(path.join(destination,'launch-policy.json'),JSON.stringify(policy,null,2)+'\n');
  fs.mkdirSync(path.join(destination,'knowledge'));
  if(knowledge){
    const list=client.files(knowledge);
    // Exact active pointer plus one release; no keys, database, caches or old data.
    if(Object.keys(list).length!==5||!list['knowledge-releases/active.json']||Object.keys(list).some(n=>!/^knowledge-releases\/(?:active\.json|[a-zA-Z0-9_.-]+\/(?:manifest|rules|cards|judge-cases)\.json)$/.test(n)))throw Error('Only reviewed knowledge files may be included.');
    fs.cpSync(path.join(knowledge,'knowledge-releases'),path.join(destination,'knowledge/knowledge-releases'),{recursive:true});
  }
  fs.writeFileSync(path.join(destination,'START-RELEASE.cmd'),'@echo off\r\nsetlocal\r\ncd /d "%~dp0"\r\nset "NODE_OPTIONS="\r\nset "NODE_PATH="\r\nset "NODE_TLS_REJECT_UNAUTHORIZED=1"\r\n"%~dp0runtime\\node.exe" --disable-proto=throw "%~dp0one-shot-release.cjs"\r\nset "RIFT_EXIT=%ERRORLEVEL%"\r\necho.\r\necho Keep the operation ID. Failed writes are NEVER automatically retried.\r\npause\r\nexit /b %RIFT_EXIT%\r\n');
  fs.copyFileSync(path.join(__dirname,'../ONE-SHOT-LAUNCH.md'),path.join(destination,'READ-ME.md'));
  fs.copyFileSync(path.join(__dirname,'../LEGACY-CARD-LAUNCH.md'),path.join(destination,'LEGACY-CARD-LAUNCH.md'));
  const manifest={protocol:'riftassist-one-shot-1',target:'azureuser@20.222.152.195',commit:raw.commit,siteId:raw.siteId,
    inventoryHash:hash(JSON.stringify(raw)),inventoryFileSha256:hash(fs.readFileSync(inventory)),planSha256:proof.planSha256,
    ci,knowledgeFiles:client.files(path.join(destination,'knowledge')),files:client.files(destination)};
  fs.writeFileSync(path.join(destination,'KIT-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
  const checked=client.inspect(destination);
  return{commit:raw.commit,siteId:raw.siteId,inventoryHash:manifest.inventoryHash,kitManifestSha256:hash(fs.readFileSync(path.join(destination,'KIT-MANIFEST.json'))),
    filesVerified:Object.keys(manifest.files).length,deployable:checked.blockers.length===0,blockers:checked.blockers,azureContacted:false};
}
function reviewPolicy(commit){
  const status={status:'unverified',commit,reference:''};
  return{sourceMode:'licensed-legacy',legalReview:{...status},rulesRights:{...status},rollbackRights:{...status},privacy:{...status},backupCustody:{...status},sourceReadyApproval:{...status},
    controllerName:'',privacyEmail:'',privacyLegalReference:'',backupRetentionDays:30,backupAccessPersons:1,
    externalBackupLocation:'',separateRecoveryKeyCustody:'',aiTransfersApproved:false};
}
if(require.main===module){const [capsule,inventory,node,license,destination,controlRunId,rulesRunId]=process.argv.slice(2),raw=JSON.parse(fs.readFileSync(inventory));
  console.log(JSON.stringify(build({capsule,inventory,node,license,destination,policy:reviewPolicy(raw.commit),ci:{commit:raw.commit,controlRunId:Number(controlRunId),rulesRunId:Number(rulesRunId),requiredJobsSucceeded:true}})));}
module.exports={build,reviewPolicy};
