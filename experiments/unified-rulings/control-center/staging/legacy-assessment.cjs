'use strict';
// Diagnostic only. Never authorizes rollback or accepts extra files as trusted code.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),P=require('./protocol.cjs');
const labels=new Set(['.git','.DS_Store','Thumbs.db','__pycache__','node_modules','logs','log','tmp','temp','cache','backups','backup','private','.env']);
function assess(folder){
  const ref=require('./legacy-v017.cjs').verifyReference(fs.readFileSync(path.join(__dirname,'legacy-v017-baseline.json'))),expected=new Set(Object.keys(ref.files)),dirs=new Set(['']),issues=[],extra=[],actual={},nonce=crypto.randomBytes(32);let entries=0,complete=true;
  for(const file of expected){let dir=path.posix.dirname(file);while(dir!=='.'){dirs.add(dir);dir=path.posix.dirname(dir);}}
  const token=n=>crypto.createHash('sha256').update(nonce).update(n).digest('hex').slice(0,24);
  P.noLinks(folder);
  function walk(relative=''){
    const dir=relative?P.within(folder,relative):folder;P.noLinks(dir);const before=fs.lstatSync(dir);if(!before.isDirectory())P.fail('legacy-path');
    for(const e of fs.readdirSync(dir,{withFileTypes:true})){
      if(++entries>1000){complete=false;issues.push('entry-budget');break;}
      const n=relative?relative+'/'+e.name:e.name,file=path.join(dir,e.name);
      if(expected.has(n))continue;
      const s=fs.lstatSync(file);
      if(dirs.has(n)&&s.isDirectory()&&!s.isSymbolicLink()){walk(n);continue;}
      const kind=s.isSymbolicLink()?'link':s.isDirectory()?'directory':s.isFile()?'file':'special';
      const category=kind==='link'?'link-unreviewed':relative==='public'?'public-exposure-risk':/\.(?:sqlite(?:-wal|-shm)?|db|key|pem|pfx)$/i.test(e.name)||e.name==='.env'||e.name==='private'?'sensitive-metadata-only':e.name==='node_modules'?'dependency-execution-risk':/\.(?:js|cjs|mjs|sh|json|node)$/i.test(e.name)?'execution-or-configuration-risk':['.DS_Store','Thumbs.db','__pycache__'].includes(e.name)?'generated-artifact-candidate':'unclassified';
      if(extra.length<200)extra.push({id:token(n),parent:relative||'release-root',label:labels.has(e.name)?e.name:'redacted',kind,category,contentRead:false});else complete=false;
    }
    const after=fs.lstatSync(dir);if(before.dev!==after.dev||before.ino!==after.ino||before.mtimeMs!==after.mtimeMs){complete=false;issues.push('layout-changed');}
  }
  walk();
  for(const name of expected){
    const file=P.within(folder,name);let fd;
    try{P.noLinks(file,true);const s=fs.lstatSync(file),variants=ref.files[name].variants;
      if(!s.isFile()||s.nlink!==1||!variants.some(v=>v.bytes===s.size))throw Error();
      fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0)|(fs.constants.O_NONBLOCK||0));const b=fs.fstatSync(fd);
      if(s.dev!==b.dev||s.ino!==b.ino)throw Error();const digest=P.hash(fs.readFileSync(fd)),a=fs.fstatSync(fd);
      if(b.size!==a.size||b.mtimeMs!==a.mtimeMs||b.ctimeMs!==a.ctimeMs||!variants.some(v=>v.sha256===digest))throw Error();actual[name]=digest;
    }catch{issues.push(name+':unverified');}finally{if(fd!==undefined)fs.closeSync(fd);}
  }
  const baselineCodeVerified=Object.keys(actual).length===65,layoutVerified=complete&&extra.length===0&&issues.length===0;
  return{baselineCodeFilesMatched:Object.keys(actual).length,baselineCodeVerified,layoutVerified,additionalPaths:extra,issues,assessmentComplete:complete,
    verifiedCodeHash:baselineCodeVerified?P.digest(Object.fromEntries(Object.entries(actual).sort(([a],[b])=>a<b?-1:a>b?1:0))):null,
    deploymentReferenceVerified:baselineCodeVerified&&layoutVerified,authorizedToDeploy:false,extraContentsRead:false};
}
module.exports={assess};
