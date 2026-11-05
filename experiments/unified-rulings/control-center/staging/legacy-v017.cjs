'use strict';
// Exact source reference, not an observational fingerprint or a production approval.
const fs=require('node:fs'),path=require('node:path'),P=require('./protocol.cjs');
const REFERENCE_SHA256='3a956500a3216719f0a42f86b22f06ea4f6ac3d718428b81a0a5605802c33f36';
function verifyReference(bytes){
  if(P.hash(bytes)!==REFERENCE_SHA256)P.fail('legacy-reference-unverified');
  const value=JSON.parse(bytes);if(value.purpose!=='reviewed-v017-code-baseline'||value.baselineCommit!=='289aee4504a8abfaa4b8ebd7e3dff7fc3648ab80'||value.gitTree!=='7f25baaaa9e2d1898d54c99386fd24adce929a0f'||value.fileCount!==65)P.fail('legacy-reference-unverified');return value;
}
function reference(){const file=path.join(__dirname,'legacy-v017-baseline.json');P.noLinks(file,true);try{return verifyReference(fs.readFileSync(file));}catch{P.fail('legacy-reference-unverified');}}
function assertCompatibleStore(candidateCode){const ref=reference(),file=P.within(candidateCode,'src/operations-store.js');P.noLinks(file,true);if(!ref.files['src/operations-store.js'].variants.some(v=>v.sha256===P.hash(fs.readFileSync(file))))P.fail('store-code-incompatible');return true;}
function receipt(folder){
  const ref=reference();
  const expected=new Set(Object.keys(ref.files)),found=new Set(),actual={};
  function walk(relative=''){
    for(const e of fs.readdirSync(relative?P.within(folder,relative):folder,{withFileTypes:true})){
      const name=relative?relative+'/'+e.name:e.name,file=P.within(folder,name);P.noLinks(file,e.isFile());
      if(e.isDirectory()){if(!['src','public','manager-ui','scripts'].includes(name.split('/')[0]))P.fail('legacy-unexpected-file');walk(name);}
      else {if(!e.isFile()||!expected.has(name))P.fail('legacy-unexpected-file');const allowed=ref.files[name].variants;if(!allowed.some(v=>v.bytes===fs.statSync(file).size))P.fail('legacy-baseline-mismatch');const digest=P.hash(fs.readFileSync(file));if(!allowed.some(v=>v.sha256===digest))P.fail('legacy-baseline-mismatch');actual[name]=digest;found.add(name);}
    }
  }
  P.noLinks(folder);walk();if(found.size!==expected.size)P.fail('legacy-incomplete');
  return{hash:P.digest(Object.fromEntries(Object.entries(actual).sort(([a],[b])=>a<b?-1:a>b?1:0))),referenceVerified:true,baselineCommit:ref.baselineCommit,referenceSha256:REFERENCE_SHA256,declaredManifestIsNotDeploymentProof:true};
}
module.exports={receipt,verifyReference,assertCompatibleStore,REFERENCE_SHA256};
