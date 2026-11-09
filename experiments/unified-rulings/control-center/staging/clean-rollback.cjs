'use strict';
// A separate strict 65-file reference. Never trusts, edits or copies the extra tree.
const fs=require('node:fs'),path=require('node:path'),P=require('./protocol.cjs'),L=require('./legacy-v017.cjs');
function prepare(source,destination){
  P.noLinks(destination);if(fs.existsSync(destination))P.fail('exists');
  const ref=L.verifyReference(fs.readFileSync(path.join(__dirname,'legacy-v017-baseline.json'))),files={};
  for(const [name,entry]of Object.entries(ref.files)){
    const file=P.within(source,name);P.noLinks(file,true);const s=fs.statSync(file);if(!entry.variants.some(v=>v.bytes===s.size))P.fail('legacy-baseline-mismatch');
    const bytes=fs.readFileSync(file);if(!entry.variants.some(v=>v.sha256===P.hash(bytes)))P.fail('legacy-baseline-mismatch');files[name]=bytes;
  }
  const mkdir=dir=>{const missing=[];for(let p=dir;!fs.existsSync(p);p=path.dirname(p))missing.push(p);for(const p of missing.reverse()){fs.mkdirSync(p,{mode:0o755});fs.chmodSync(p,0o755);}};
  mkdir(destination);
  for(const [name,bytes]of Object.entries(files)){const file=P.within(destination,name);mkdir(path.dirname(file));const fd=fs.openSync(file,'wx',0o644);try{fs.writeFileSync(fd,bytes);fs.fchmodSync(fd,0o644);}finally{fs.closeSync(fd);}}
  return{...L.receipt(destination),sourceDirectoryTrusted:false,sourceExtrasCopied:false,operationalDataIncluded:false,authorizedToDeploy:false};
}
function receipt(c){
  if(c.rollbackCode&&![path.join(c.root,'rollback','v0.1.7'),'/var/lib/riftassist-rollback/'+c.oldCodeHash+'/v0.1.7'].includes(c.rollbackCode))P.fail('rollback-reference-path');
  const folder=c.rollbackCode||c.oldCode,r=L.receipt(folder);
  if(c.rollbackCode&&!c.rehearsal&&process.platform==='linux'){
    const base=folder===path.join(c.root,'rollback','v0.1.7')?c.root:'/var/lib/riftassist-rollback';
    for(let dir=folder;;dir=path.dirname(dir)){const s=fs.lstatSync(dir);if(s.uid!==0||(s.mode&0o022))P.fail('rollback-reference-permissions');if(dir===base)break;}
    const walk=dir=>{const s=fs.lstatSync(dir);if(s.uid!==0||(s.mode&0o022))P.fail('rollback-reference-permissions');if(s.isDirectory())for(const e of fs.readdirSync(dir))walk(path.join(dir,e));};walk(folder);
  }
  return r;
}
function isolation(c){return c.rollbackCode?'PrivateMounts=yes\nBindReadOnlyPaths='+c.rollbackCode+':'+c.oldCode+'\nInaccessiblePaths='+c.oldCode+'/scripts\nNoNewPrivileges=yes\nEnvironment="NODE_OPTIONS=" "NODE_PATH=" "PDFJS_MODULE=" "RIFTASSI_PDFJS_PATH="\n':'';}
function assertNamespace(c,o,{installed=false}={}){
  if(!c.rollbackCode)return;
  for(const name of ['RootDirectory','RootImage','BindPaths','BindReadOnlyPaths','InaccessiblePaths','EnvironmentFiles'])if(typeof o[name]!=='string')P.fail('rollback-namespace-unverified');
  if(o.RootDirectory||o.RootImage||o.BindPaths||o.EnvironmentFiles)P.fail('rollback-namespace-conflict');
  if(!installed){if(o.BindReadOnlyPaths||o.InaccessiblePaths)P.fail('rollback-namespace-conflict');return;}
  const target=c.rollbackCode+':'+c.oldCode;
  if(![target,target+':rbind',target+':norbind'].includes(o.BindReadOnlyPaths)||o.InaccessiblePaths!==c.oldCode+'/scripts'||o.PrivateMounts!=='yes'||o.NoNewPrivileges!=='yes')P.fail('rollback-namespace-unverified');
}
module.exports={prepare,receipt,isolation,assertNamespace};
