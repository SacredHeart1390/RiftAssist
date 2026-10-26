const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),release=path.join(root,'releases/v0.1.6');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const syntax=['src/cards.js','src/retrieval.js','src/server.js','src/source-translations.js','src/terminology-ko.js','public/app-ui5.js','public/card-composer-ui3.js','public/service-worker.js'];
for(const file of syntax)execFileSync(process.execPath,['--check',path.join(release,file)],{windowsHide:true});
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const manifest=JSON.parse(fs.readFileSync(path.join(release,'app-release.json')));
manifest.hashes=Object.fromEntries(files(release).filter(f=>path.basename(f)!=='app-release.json').map(f=>[path.relative(release,f).replaceAll('\\','/'),hash(fs.readFileSync(f))]));
manifest.ready=true;manifest.uiRevision='official-terms-card-memory-loading-1';manifest.review={syntaxFiles:syntax.length,testsRun:false,paidAiCalls:0,checkedAt:new Date().toISOString()};
fs.writeFileSync(path.join(release,'app-release.json'),JSON.stringify(manifest,null,2)+'\n');
(async()=>{
  const base='http://127.0.0.1:3100',headers={Origin:base,'Content-Type':'application/json'};
  const login=await fetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({key:fs.readFileSync(path.join(root,'private/manager.key'),'utf8').trim()})});
  if(!login.ok)throw Error('Manager authentication failed.');headers.Cookie=login.headers.get('set-cookie').split(';')[0];
  const status=async()=>{const r=await fetch(base+'/api/status',{headers});if(!r.ok)throw Error('Manager status unavailable.');const s=await r.json();return {appRunning:s.appRunning,appHost:s.appHost,activeOrigin:s.activeOrigin,tunnel:s.tunnel,error:s.error};};
  const before=await status();
  if(!before.appRunning||before.appHost.changing||before.appHost.releaseId!=='v0.1.5')throw Error('Inspect current service state before applying v0.1.6.');
  const samples=[];async function probe(){try{const r=await fetch('http://127.0.0.1:3001/',{signal:AbortSignal.timeout(4000)});await r.arrayBuffer();samples.push({at:new Date().toISOString(),status:r.status});}catch(e){samples.push({at:new Date().toISOString(),error:e.message});}}
  await probe();const timer=setInterval(probe,750);
  try{const r=await fetch(base+'/api/app-release',{method:'POST',headers,body:JSON.stringify({releaseId:'v0.1.6'}),signal:AbortSignal.timeout(120000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Deployment failed.');}finally{clearInterval(timer);}
  await probe();const after=await status();
  if(after.appHost.releaseId!=='v0.1.6'||(before.activeOrigin&&before.activeOrigin!==after.activeOrigin))throw Error('Unexpected release or public URL after deployment.');
  const r=await fetch('http://127.0.0.1:3001/api/health');const health=await r.json();
  if(!r.ok||health.version!=='0.1.6')throw Error('Release health unavailable.');
  const served=[];for(const file of ['index.html','app-ui5.js','card-composer-ui3.js','styles-ui5.css','service-worker.js','app-ui4.js','card-composer-ui2.js']){const r=await fetch('http://127.0.0.1:3001/'+(file==='index.html'?'':file));const content=Buffer.from(await r.arrayBuffer());if(!r.ok||hash(content)!==hash(fs.readFileSync(path.join(release,'public',file))))throw Error('Served asset mismatch: '+file);served.push(file);}
  const result={at:new Date().toISOString(),before,after,gatewaySamples:samples,health:{ok:health.ok,version:health.version,appReleaseId:health.appReleaseId},servedFiles:served,testsRun:false,paidAiCalls:0};
  fs.writeFileSync(path.join(__dirname,'deployment.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
