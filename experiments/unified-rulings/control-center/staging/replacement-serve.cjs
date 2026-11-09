'use strict';
// Fixed installed endpoint; no generic remote command, caller paths or fixture switch.
const fs=require('node:fs'),P=require('./protocol.cjs'),R=require('./replacement.cjs');
function trustedLocation(directory,root){return directory===require('node:path').posix.join(root,'tools')||directory==='/usr/local/lib/riftassist-replacement/staging';}
async function serve(){
  if(process.platform!=='linux'||process.geteuid()!==0||process.argv.length!==2)P.fail('installation-not-approved');
  const file='/etc/riftassist-replacement/inventory.json';P.noLinks(file,true);const stat=fs.statSync(file);if(stat.uid!==0||(stat.mode&0o022))P.fail('inventory-permissions');
  const directory=fs.statSync('/etc/riftassist-replacement');if(directory.uid!==0||(directory.mode&0o022))P.fail('inventory-permissions');
  const raw=P.readJSON(file,32768),c=R.config(raw);if(!trustedLocation(__dirname,c.root))P.fail('tool-location');
  const io=new(require('./replacement-ubuntu.cjs').UbuntuReplacementIO)(c),engine=R.createReplacement(raw,io);
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
if(require.main===module)serve().then(v=>process.stdout.write(JSON.stringify(v)+'\n')).catch(()=>{process.stdout.write(JSON.stringify({protocol:R.PROTOCOL,ok:false,code:'replacement-rejected'})+'\n');process.exitCode=1;});
module.exports={serve,trustedLocation};
