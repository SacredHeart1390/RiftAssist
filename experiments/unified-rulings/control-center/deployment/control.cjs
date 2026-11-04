'use strict';
// Finite stdin protocol; output never contains database rows, keys or raw exception strings.
const fs=require('node:fs'),lab=require('./lab.cjs');
async function run(q){
 if(!q||q.protocol!=='riftassist-deployment-1'||q.target!=='synthetic-only')throw Error('production-disabled');
 switch(q.method){
 case 'init':return lab.init(q.root);
 case 'status':return lab.status(q.root);
 case 'reconcile':return lab.reconcile(q.root);
 case 'plan':return lab.plan(q.root,q.package,q.fault||'none');
 case 'deploy':return lab.deploy(q.root,q.plan,q.package,q.approval,phase=>console.log(JSON.stringify({type:'phase',phase})));
 case 'rollback-plan':return lab.rollbackPlan(q.root,q.operationId);
 case 'rollback':return lab.rollback(q.root,q.plan,q.approval);
 case 'verify-backup':return lab.verifyBackup(q.root,q.backupId);
 default:throw Error('method');}
}
let size=0,body='';process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{size+=chunk.length;if(size>18000000)process.exit(2);body+=chunk;});process.stdin.on('end',async()=>{try{const result=await run(JSON.parse(body));console.log(JSON.stringify({type:'result',ok:true,result}));}catch(e){const allowed=['production-disabled','method','owner','exists','busy','approval','stale','package','package-hash','package-path','tests','disk','backup-integrity','path','limit','id','release','release-integrity','data','route','rollback-target'];console.log(JSON.stringify({type:'result',ok:false,code:allowed.includes(e.code||e.message)?e.code||e.message:'operation-failed'}));process.exitCode=1;}});
