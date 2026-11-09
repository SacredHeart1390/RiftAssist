'use strict';
// Fixed installed endpoint; no generic remote command, caller paths or fixture switch.
const fs=require('node:fs'),P=require('./protocol.cjs'),R=require('./replacement.cjs');
function trustedLocation(directory,root){return directory===require('node:path').posix.join(root,'tools')||directory==='/usr/local/lib/riftassist-replacement/staging';}
function context(){
  if(process.platform!=='linux'||process.geteuid()!==0)P.fail('installation-not-approved');
  const file='/etc/riftassist-replacement/inventory.json';P.noLinks(file,true);const stat=fs.statSync(file);if(stat.uid!==0||(stat.mode&0o022))P.fail('inventory-permissions');
  const directory=fs.statSync('/etc/riftassist-replacement');if(directory.uid!==0||(directory.mode&0o022))P.fail('inventory-permissions');
  const raw=P.readJSON(file,32768),c=R.config(raw);if(!trustedLocation(__dirname,c.root))P.fail('tool-location');
  const io=new(require('./replacement-ubuntu.cjs').UbuntuReplacementIO)(c),engine=R.createReplacement(raw,io);
  return{c,engine};
}
async function approvedOperation(engine,kind,hash,id,deploymentId){
  if(!['qualify-backup','replace','rollback'].includes(kind)||hash!==engine.config.inventoryHash||!P.uuid(id)||kind==='rollback'&&!P.uuid(deploymentId))P.fail('approval');
  try{const old=engine.inspect(id);if(old.kind!==kind)P.fail('idempotency-conflict');return old;}catch(e){if(e.code!=='ENOENT')throw e;}
  const plan=engine.plan(kind,id,deploymentId);return engine.execute(plan,plan.digest);
}
async function cli(){
  const kind={'--approved-qualify-backup':'qualify-backup','--approved-replace':'replace','--approved-rollback':'rollback'}[process.argv[2]];
  if(!kind||process.argv.length!==(kind==='rollback'?6:5))P.fail('approval');
  const {c,engine}=context();return{protocol:R.PROTOCOL,inventoryHash:c.inventoryHash,ok:true,result:await approvedOperation(engine,kind,process.argv[3],process.argv[4],process.argv[5])};
}
async function serve(){
  if(process.argv.length!==2)P.fail('protocol');const {c,engine}=context();
  const parts=[];let bytes=0;for await(const b of process.stdin){bytes+=b.length;if(bytes>65536)P.fail('limit');parts.push(b);}
  const q=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));P.exact(q,['protocol','requestId','inventoryHash','method','payload']);
  if(q.protocol!==R.PROTOCOL||!P.uuid(q.requestId)||q.inventoryHash!==c.inventoryHash)P.fail('protocol');const p=q.payload;let result;
  switch(q.method){
    case 'status':P.exact(p,[]);result=engine.status();break;
    case 'reconcile':P.exact(p,[]);result=await engine.reconcile();break;
    case 'preflight':P.exact(p,[]);result=engine.gates();break;
    case 'plan':P.exact(p,['operationId']);result=engine.plan('replace',p.operationId);break;
    case 'backup-plan':P.exact(p,['operationId']);result=engine.plan('qualify-backup',p.operationId);break;
    case 'rollback-plan':P.exact(p,['operationId','deploymentId']);result=engine.plan('rollback',p.operationId,p.deploymentId);break;
    case 'replace':case 'rollback':case 'qualify-backup':P.exact(p,['plan','approval']);if(p.plan?.kind!==q.method)P.fail('protocol');result=await engine.execute(p.plan,p.approval);break;
    case 'inspect':P.exact(p,['operationId']);result=engine.inspect(p.operationId);break;
    default:P.fail('method');
  }
  return{protocol:R.PROTOCOL,requestId:q.requestId,inventoryHash:c.inventoryHash,ok:true,result};
}
if(require.main===module)(process.argv.length===2?serve():cli()).then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(()=>{process.stdout.write(JSON.stringify({protocol:R.PROTOCOL,ok:false,code:'replacement-rejected'})+'\n');process.exitCode=1;});
module.exports={serve,trustedLocation,approvedOperation};
