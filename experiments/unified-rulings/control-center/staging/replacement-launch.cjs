'use strict';
// Runs as existing service user. Authenticates manager normally and starts its app once.
const fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
const P=require('./protocol.cjs'),R=require('./replacement.cjs');
async function main(file){
  P.noLinks(file,true);const c=P.readJSON(file,8192);
  if(c.schemaVersion!==1||c.purpose!=='single-instance-replacement-launch'||!P.uuid(c.siteId)||c.root!=='/var/lib/riftassist-replacement/'+c.siteId||file!==path.join(c.root,'launch.json')||c.source!==path.join(c.root,'releases/v0.2.0')||c.data!==path.join(c.root,'data/v0.2.0')||c.ports?.join(',')!=='3100,3001,3011,3012')P.fail('launch');
  const stat=fs.statSync(file);if(stat.uid!==0||(stat.mode&0o022))P.fail('launch-permissions');
  const receipt=R.codeReceipt(c.source);if(receipt.hash!==c.candidateHash||receipt.manifest.ready!==true||receipt.manifest.developmentOnly!==false)P.fail('release-not-ready');
  const db=new(require('node:sqlite').DatabaseSync)(path.join(c.data,'private/operations.sqlite'),{readOnly:true});let aiEnabled;
  try{const row=db.prepare("SELECT value FROM settings WHERE name='aiEnabled'").get();aiEnabled=row?JSON.parse(row.value):true;}finally{db.close();}
  if(aiEnabled&&(process.env.RIFTASSI_EXTERNAL_MODE!=='live'||process.env.RIFTASSI_ALLOW_EXTERNAL_CALLS!=='true'||!process.env.OPENAI_API_KEY))P.fail('provider-activation-not-approved');
  const env={...process.env,RIFTASSI_DATA_ROOT:c.data,RIFTASSI_ALLOW_PRODUCTION_START:'true',RIFTASSI_PRESERVE_V017_SESSION:'true',MANAGER_PORT:String(c.ports[0]),APP_PORT:String(c.ports[1]),PUBLIC_PORT:String(c.ports[1]),PUBLIC_ORIGIN:'https://riftassistant.app',RIFTASSI_PRODUCTION_WORKER_PORTS:JSON.stringify(c.ports.slice(2)),RIFTASSI_CARD_POLICY:'verified-only',LOG_CONTENT:'false'};
  const child=fork(path.join(c.source,'src/manager.js'),[],{cwd:c.data,env,stdio:['ignore','ignore','ignore','ipc']});let stopping=false;
  for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;child.kill('SIGTERM');});child.once('exit',code=>process.exit(stopping?0:code||1));
  const origin='http://127.0.0.1:'+c.ports[0],deadline=Date.now()+25000;let response;
  while(Date.now()<deadline){if(stopping)P.fail('shutdown');try{response=await fetch(origin+'/',{signal:AbortSignal.timeout(1500)});response.body?.cancel();if(response.status===200)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  if(response?.status!==200)P.fail('manager-start');let key=fs.readFileSync(path.join(c.data,'private/manager.key'),'utf8').trim();
  try{if(!/^[a-f0-9]{64}$/i.test(key))P.fail('authentication');const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(4000)}),cookie=login.headers.get('set-cookie')?.split(';')[0];if(login.status!==200||!cookie)P.fail('authentication');
    const start=await fetch(origin+'/api/start',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(35000)});if(start.status!==200)P.fail('application-start');
  }finally{key=null;}
  // No paid AI or recurring mutating health polling. systemd supervises this owned process tree.
}
if(require.main===module)main(process.argv[2]).catch(()=>{process.stderr.write('replacement-launch-failed\n');process.exit(1);});
module.exports={main};
