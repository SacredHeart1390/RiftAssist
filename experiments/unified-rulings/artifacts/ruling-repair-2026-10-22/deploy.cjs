const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),release=path.join(root,'releases/v0.1.5');
const hash=content=>crypto.createHash('sha256').update(content).digest('hex');
const checks=JSON.parse(fs.readFileSync(path.join(__dirname,'answer-check.json')));
assert.equal(checks.completed,2);assert(checks.results.every(r=>Object.values(r.checks).every(Boolean)));
const retrieval=JSON.parse(fs.readFileSync(path.join(__dirname,'retrieval-check.json')));assert.equal(retrieval.passed,12);
for(const file of ['src/retrieval.js','src/judge-index.js','src/answer-policy.js','src/server.js','public/app-ui4.js','public/service-worker.js'])execFileSync(process.execPath,['--check',path.join(release,file)],{windowsHide:true});
// Preserve the independently updated operations dashboard in this release's archive, too.
for(const file of ['index.html','manager.js','manager.css'])fs.copyFileSync(path.join(root,'manager-ui',file),path.join(release,'manager-ui',file));
const html=fs.readFileSync(path.join(release,'public/index.html'),'utf8');
assert(html.includes('id="resolution-steps"')&&html.includes('app-ui4.js'));
for(const name of ['app-ui3.js','styles-ui3.css'])assert.equal(hash(fs.readFileSync(path.join(release,'public',name))),hash(fs.readFileSync(path.join(root,'releases/v0.1.4/public',name))));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const manifest=JSON.parse(fs.readFileSync(path.join(release,'app-release.json')));
manifest.hashes=Object.fromEntries(files(release).filter(f=>path.basename(f)!=='app-release.json').map(f=>[path.relative(release,f).replaceAll('\\','/'),hash(fs.readFileSync(f))]));
manifest.ready=true;manifest.review={syntaxFiles:6,retrievalChecks:12,paidAiCalls:2,liveAnswerChecksPassed:true,checkedAt:new Date().toISOString()};
fs.writeFileSync(path.join(release,'app-release.json'),JSON.stringify(manifest,null,2)+'\n');
(async()=>{
  const base='http://127.0.0.1:3100',headers={Origin:base,'Content-Type':'application/json'};
  const login=await fetch(base+'/api/login',{method:'POST',headers,body:JSON.stringify({key:fs.readFileSync(path.join(root,'private/manager.key'),'utf8').trim()})});
  assert.equal(login.status,200);headers.Cookie=login.headers.get('set-cookie').split(';')[0];
  const readStatus=async()=>{const r=await fetch(base+'/api/status',{headers});assert.equal(r.status,200);return r.json();};
  const before=await readStatus();assert(before.appRunning&&!before.appHost.changing);
  assert.equal(before.appHost.releaseId,'v0.1.4','Unexpected active release; review before changing it.');
  const samples=[];
  async function probe(){try{const r=await fetch('http://127.0.0.1:3001/',{signal:AbortSignal.timeout(3000)});samples.push({at:new Date().toISOString(),status:r.status});await r.arrayBuffer();}catch(e){samples.push({at:new Date().toISOString(),error:e.message});}}
  await probe();const timer=setInterval(probe,750);
  let changed;
  try{const r=await fetch(base+'/api/app-release',{method:'POST',headers,body:JSON.stringify({releaseId:'v0.1.5'}),signal:AbortSignal.timeout(120000)});changed=await r.json();assert.equal(r.status,200,JSON.stringify(changed));}finally{clearInterval(timer);}
  await probe();const after=await readStatus();assert.equal(after.appHost.releaseId,'v0.1.5');
  if(before.activeOrigin)assert.equal(after.activeOrigin,before.activeOrigin,'Public origin changed');
  const healthResponse=await fetch('http://127.0.0.1:3001/api/health');assert.equal(healthResponse.status,200);const health=await healthResponse.json();assert.equal(health.version,'0.1.5');
  const served=[];for(const name of ['index.html','app-ui4.js','styles-ui4.css','service-worker.js','app-ui3.js']){const r=await fetch('http://127.0.0.1:3001/'+(name==='index.html'?'':name));assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.equal(hash(bytes),hash(fs.readFileSync(path.join(release,'public',name))));served.push(name);}
  const compact=s=>({appRunning:s.appRunning,activeOrigin:s.activeOrigin,tunnel:s.tunnel,appHost:s.appHost,error:s.error});
  const result={at:new Date().toISOString(),before:compact(before),after:compact(after),gatewaySamples:samples,servedFiles:served,health:{ok:health.ok,version:health.version,appReleaseId:health.appReleaseId}};
  fs.writeFileSync(path.join(__dirname,'deployment.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
