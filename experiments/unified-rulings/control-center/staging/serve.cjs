'use strict';
// Installed root-owned entry point. No command-line configuration, shell or arbitrary file endpoint.
const fs=require('node:fs');const P=require('./protocol.cjs');
async function serve(configFile='/etc/riftassist-staging/inventory.json') {
  if(process.platform!=='linux'||process.geteuid()!==0||process.argv.length!==2)P.fail('installation-not-approved');
  P.noLinks(configFile,true);const stat=fs.statSync(configFile);if(stat.uid!==0||(stat.mode&0o022))P.fail('inventory-permissions');
  const raw=P.readJSON(configFile,16384),config=P.inventory(raw);
  const {UbuntuIO,SystemdController}=require('./ubuntu-io.cjs');const io=new UbuntuIO(config,new SystemdController(config));
  const broker=require('./broker.cjs').createBroker(raw,io);let size=0;const pieces=[];
  for await(const piece of process.stdin){size+=piece.length;if(size>P.MAX_PACKET)P.fail('limit');pieces.push(piece);}
  const bytes=Buffer.concat(pieces);let q;try{q=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{P.fail('protocol');}
  const result=await broker.handle(q);return{protocol:P.PROTOCOL,requestId:q.requestId,siteId:config.siteId,inventoryHash:config.inventoryHash,ok:true,result};
}
if(require.main===module)serve().then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>{
  const code=/^[a-z0-9-]{1,64}$/.test(e.code||'')?e.code:'staging-failed';process.stdout.write(JSON.stringify({protocol:P.PROTOCOL,ok:false,code})+'\n');process.exitCode=1;
});
module.exports={serve};
