const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const origin='http://127.0.0.1:3100';
async function main(){
  const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({key:fs.readFileSync(path.join(root,'private/manager.key'),'utf8').trim()}),signal:AbortSignal.timeout(6000)});
  if(!login.ok)throw new Error('Manager authentication failed: '+login.status);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  const headers={Cookie:cookie,Origin:origin,'Content-Type':'application/json'};
  const beforeResponse=await fetch(origin+'/api/status',{headers,signal:AbortSignal.timeout(6000)});
  if(!beforeResponse.ok)throw new Error('Manager status unavailable.');
  const before=await beforeResponse.json();
  if(!before.appRunning)throw new Error('App is not running; leave stopped.');
  if(before.appHost.releaseId!=='v0.1.6')throw new Error('Active release changed; inspect before deployment.');
  const applied=await fetch(origin+'/api/app-release',{method:'POST',headers,body:JSON.stringify({releaseId:'v0.1.7'}),signal:AbortSignal.timeout(120000)});
  const result=await applied.json();
  if(!applied.ok)throw new Error('Deployment failed: '+JSON.stringify(result));
  const healthResponse=await fetch('http://127.0.0.1:3001/api/health',{signal:AbortSignal.timeout(8000)});
  const health=await healthResponse.json();
  if(!healthResponse.ok||health.appReleaseId!=='v0.1.7'||health.knowledge?.unresolvedRuleAnchors?.length||health.knowledge?.lastError)throw new Error('Deployed worker readiness needs review.');
  const after=await(await fetch(origin+'/api/status',{headers,signal:AbortSignal.timeout(6000)})).json();
  const record={at:new Date().toISOString(),before:{releaseId:before.appHost.releaseId,origin:before.activeOrigin,tunnel:before.tunnel},result,
    after:{releaseId:after.appHost.releaseId,origin:after.activeOrigin,tunnel:after.tunnel},health:{version:health.version,appReleaseId:health.appReleaseId,knowledge:health.knowledge,aiEnabled:health.aiEnabled},testsRun:false,paidAiCalls:0};
  fs.writeFileSync(path.join(__dirname,'deployment.json'),JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify(record));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
