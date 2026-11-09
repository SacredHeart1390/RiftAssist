'use strict';
// Approved root-only code installation. No systemctl, Caddy, DB, existing keys or .env.
const fs=require('node:fs'),path=require('node:path'),P=require('./protocol.cjs'),R=require('./replacement.cjs'),M=require('./replacement-package.cjs'),C=require('./clean-rollback.cjs');
function protectedCode(folder){
  P.noLinks(folder);const s=fs.lstatSync(folder);if(s.uid!==0||(s.mode&0o022))P.fail('code-permissions');
  if(s.isDirectory())for(const e of fs.readdirSync(folder))protectedCode(path.join(folder,e));else if(!s.isFile()||s.nlink!==1)P.fail('code-shape');
}
function install(capsule,raw,planHash,{rehearsal=false}={}){
  const c=R.config(raw,{rehearsal}),p=M.verify(capsule,{expectedPlanHash:planHash});
  const plan=P.readJSON(path.join(capsule,'INSTALLATION-PLAN.json'));
  if(plan.siteId!==c.siteId||p.commit!==c.commit||p.candidateHash!==c.candidateHash||p.rollbackReferenceHash!==c.oldCodeHash||!c.rollbackCode)P.fail('installation-binding');
  if(!rehearsal){if(process.platform!=='linux'||process.geteuid()!==0||capsule!=='/var/lib/riftassist-replacement-upload/'+c.siteId+'/code')P.fail('installation-not-approved');protectedCode(capsule);for(let dir=path.dirname(capsule);;dir=path.dirname(dir)){P.noLinks(dir);const s=fs.statSync(dir);if(s.uid!==0||(s.mode&0o022))P.fail('code-permissions');if(dir==='/var/lib/riftassist-replacement-upload')break;}}
  if(fs.existsSync(c.root))P.fail('exists');
  const existingReference=fs.existsSync(c.rollbackCode);
  if(existingReference&&C.receipt(c).hash!==c.oldCodeHash)P.fail('rollback-reference-drift');
  R.initialize(c);
  if(!existingReference){C.prepare(path.join(capsule,'rollback/v0.1.7'),c.rollbackCode);if(C.receipt(c).hash!==c.oldCodeHash)P.fail('rollback-reference-drift');}
  fs.cpSync(path.join(capsule,'candidate'),c.candidateCode,{recursive:true,errorOnExist:true,force:false});
  for(const name of fs.readdirSync(path.join(capsule,'site/tools')))fs.copyFileSync(path.join(capsule,'site/tools',name),path.join(c.root,'tools',name),fs.constants.COPYFILE_EXCL);
  fs.mkdirSync(path.join(c.root,'deployment'),{mode:0o755});fs.copyFileSync(path.join(capsule,'site/deployment/lab.cjs'),path.join(c.root,'deployment/lab.cjs'),fs.constants.COPYFILE_EXCL);
  fs.mkdirSync(c.candidateData,{mode:0o700});
  return{siteId:c.siteId,inventoryHash:c.inventoryHash,rollbackReferenceHash:c.oldCodeHash,codeOnlyInstalled:true,sourceReady:R.codeReceipt(c.candidateCode).manifest.ready,
    serviceChanged:false,caddyChanged:false,operationalDataRead:false,activePointerChanged:false,authorizedToDeploy:false};
}
function cli(){
  if(process.platform!=='linux'||process.geteuid()!==0||process.argv.length!==3||!P.sha(process.argv[2]))P.fail('installation-not-approved');
  const file='/etc/riftassist-replacement/inventory.json';P.noLinks(file,true);const stat=fs.statSync(file);if(stat.uid!==0||(stat.mode&0o022))P.fail('inventory-permissions');
  const directory=fs.statSync('/etc/riftassist-replacement');if(directory.uid!==0||(directory.mode&0o022))P.fail('inventory-permissions');
  return install(path.resolve(__dirname,'../..'),P.readJSON(file,32768),process.argv[2]);
}
if(require.main===module)try{process.stdout.write(JSON.stringify(cli())+'\n');}catch{process.stderr.write('code-installation-rejected-no-automatic-retry\n');process.exitCode=1;}
module.exports={install};
