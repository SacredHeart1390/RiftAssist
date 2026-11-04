// Local-only integration check: temporary checkout, synthetic sources, no API key or paid/network calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { once, EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const http = require('node:http');
const { createStore } = require('../src/operations-store');
const { createAccess } = require('../src/access-control');
const { extractQuickOrigin, startQuickTunnel } = require('../src/cloudflare-quick');
const ROOT = path.resolve(__dirname, '..');
const work = path.join(ROOT, 'tmp', `home-check-${Date.now()}`);
fs.mkdirSync(work, { recursive: true });
let assertions = 0;
function equal(actual, expected) { assert.deepEqual(actual, expected); assertions++; }
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const uuid = () => crypto.randomUUID();

async function main() {
  for (const directory of ['src', 'public', 'manager-ui']) {
    fs.cpSync(path.join(ROOT, directory), path.join(work, directory), { recursive: true });
    for (const file of fs.readdirSync(path.join(ROOT, directory)).filter((name) => name.endsWith('.js'))) {
      const check = spawnSync(process.execPath, ['--check', path.join(ROOT, directory, file)], { windowsHide: true, encoding: 'utf8' });
      assert.equal(check.status, 0, check.stderr); assertions++;
    }
  }
  fs.mkdirSync(path.join(work, 'knowledge'));
  fs.writeFileSync(path.join(work, 'knowledge', 'evidence.json'), JSON.stringify([{ id:'test-rule', ruleId:'100.1', documentId:'core-rules',title:'체인 처리',officialTextKo:'체인 우선권 처리 순서입니다.',officialTextEn:'Resolve the chain.',version:'fixture',url:'https://example.com/rules' }]));
  const preload = path.join(work, 'offline.cjs');
  fs.writeFileSync(preload, `global.fetch=async()=>new Response(JSON.stringify({results:[]}),{status:200,headers:{'content-type':'application/json'}});`);
  equal(extractQuickOrigin('url https://sample-rift.trycloudflare.com |'), 'https://sample-rift.trycloudflare.com');
  equal(extractQuickOrigin('https://sample.trycloudflare.com.evil.example/'), null);
  const fake = new EventEmitter(); fake.stdout=new PassThrough();fake.stderr=new PassThrough();fake.kill=()=>true;
  const quick = startQuickTunnel({ executable:'unused',directory:path.join(work,'fake-quick'),port:39011,spawnProcess:(_exe,args,options)=>{
    equal(args.includes('http://127.0.0.1:39011'),true); equal(args.includes('http://127.0.0.1:3100'),false);equal(options.windowsHide,true);return fake;
  }});
  fake.stderr.write('Generated https://fixture-rift.trycloudflare.com |\n'); equal(await quick.ready,'https://fixture-rift.trycloudflare.com'); fake.emit('exit',0);
  const store = createStore(path.join(work,'db-check'));
  try {
    const access = createAccess({port:39011,directory:store.directory,store});
    access.setPublicOrigin('https://fixture.trycloudflare.com');
    access.check({headers:{host:'fixture.trycloudflare.com'},method:'GET'}); assertions++;
    access.setPublicOrigin(''); assert.throws(()=>access.check({headers:{host:'fixture.trycloudflare.com'},method:'GET'})); assertions++;
    store.setSetting('limits',{...store.limits(),generations:1});
    const call=store.reserveCall('owner','answer'); assert.throws(()=>store.reserveCall('another','answer'),/한도/);assertions++;
    store.finishCall(call,{input_tokens:123,output_tokens:45});equal(store.stats().calls[0].inputTokens,123);
  } finally { store.close(); }
  const base = 'http://127.0.0.1:39010', appBase='http://127.0.0.1:39011';
  const manager=spawn(process.execPath,['--require',preload,path.join(work,'src','manager.js')],{cwd:work,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,MANAGER_PORT:'39010',APP_PORT:'39011',OPENAI_API_KEY:'',OPENAI_GENERATION_ENABLED:'false',PUBLIC_ORIGIN:'',NODE_OPTIONS:''}});
  let log=''; manager.stdout.on('data',chunk=>{log+=chunk;});manager.stderr.on('data',chunk=>{log+=chunk;});
  const exited=once(manager,'exit');
  async function request(url,{cookie,body,headers={}}={}) {
    return new Promise((resolve,reject)=>{
      const encoded=body===undefined?null:JSON.stringify(body);
      const outgoing=http.request(url,{method:body===undefined?'GET':'POST',headers:{...body!==undefined?{'Content-Type':'application/json',Origin:new URL(url).origin,'Content-Length':Buffer.byteLength(encoded)}:{},...cookie?{Cookie:cookie}:{},...headers}},response=>{
        let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;});response.on('end',()=>{let data;try{data=JSON.parse(text);}catch{data=text;}resolve({status:response.statusCode,data,cookie:response.headers['set-cookie']?.[0]?.split(';')[0]});});
      });
      outgoing.setTimeout(12000,()=>outgoing.destroy(new Error('Local check timeout')));outgoing.on('error',reject);outgoing.end(encoded);
    });
  }
  try {
    let ready=false;
    for(let i=0;i<50;i++){try{await request(base);ready=true;break;}catch{}if(manager.exitCode!==null)break;await delay(100);}
    assert(ready,`Manager startup failed: ${log}`);assertions++;
    equal((await request(`${base}/api/status`)).status,401);
    equal((await request(`${base}/api/status`,{headers:{Host:'attacker.example'}})).status,403);
    equal((await request(`${base}/api/status`,{headers:{'X-Forwarded-For':'1.2.3.4'}})).status,403);
    const key=fs.readFileSync(path.join(work,'private','manager.key'),'utf8');
    const login=await request(`${base}/api/login`,{body:{key}});equal(login.status,200);const admin=login.cookie;
    equal((await request(`${base}/api/status`,{cookie:admin})).data.appRunning,false);
    equal((await request(`${base}/api/start`,{cookie:admin,body:{},headers:{Origin:'https://attacker.example'}})).status,403);
    equal((await request(`${base}/api/start`,{cookie:admin,body:{}})).status,200);
    const health=await request(`${appBase}/api/health`);equal(health.data.aiEnabled,false);const session=health.cookie;
    equal((await request(`${appBase}/private/storage.key`)).status,404);
    equal((await request(`${appBase}/api/status`)).status,404);
    equal((await request(`${appBase}/api/ask`,{body:{question:'체인'},headers:{Origin:'https://attacker.example'}})).status,403);
    const question={clientKey:uuid(),question:'체인 처리 우선권',language:'ko',cardIds:[]};
    const answer=await request(`${appBase}/api/ask`,{cookie:session,body:question});equal(answer.status,200);equal(answer.data.ai.used,false);assert(answer.data.requestId);assertions++;
    const repeat=await request(`${appBase}/api/ask`,{cookie:session,body:question});equal(repeat.data.requestId,answer.data.requestId);
    const input={clientKey:uuid(),requestId:answer.data.requestId,category:'ruling',description:'TEST fixture: answer needs review',tags:['wrong-answer'],expected:''};
    const report=await request(`${appBase}/api/reports`,{cookie:session,body:input});equal(report.status,201);
    equal((await request(`${appBase}/api/reports`,{cookie:session,body:input})).data.id,report.data.id);
    const session2=(await request(`${appBase}/api/health`)).cookie;
    equal((await request(`${appBase}/api/reports`,{cookie:session2})).data.reports.length,0);
    equal((await request(`${appBase}/api/reports`,{cookie:session2,body:{...input,clientKey:uuid()}})).status,404);
    const detail=await request(`${base}/api/reports/${report.data.id}`,{cookie:admin});equal(detail.data.snapshot.question,question.question);equal(detail.data.snapshot.response.evidence[0].id,'test-rule');
    equal((await request(`${base}/api/reports/${report.data.id}`,{cookie:admin,body:{status:'triaged',note:'local test'}})).status,200);
    const copied=(await request(`${base}/api/backup`,{cookie:admin,body:{}})).data;
    assert(copied.folder);assertions++;
    const restore=path.join(work,'restore');fs.mkdirSync(path.join(restore,'private'),{recursive:true});
    for(const name of ['storage.key','operations.sqlite'])fs.copyFileSync(path.join(copied.folder,name),path.join(restore,'private',name));
    const restored=createStore(restore);try{equal(restored.reportDetail(report.data.id).status,'triaged');equal(restored.reportDetail(report.data.id).history.length,2);}finally{restored.close();}
    equal((await request(`${base}/api/stop`,{cookie:admin,body:{}})).status,200);
    equal((await request(`${base}/api/status`,{cookie:admin})).data.appRunning,false);
    equal((await request(`${base}/api/start`,{cookie:admin,body:{}})).status,200);
    equal((await request(`${base}/api/stop`,{cookie:admin,body:{}})).status,200);
    equal((await request(`${base}/api/hosting`,{cookie:admin,body:{provider:'cloudflare-quick',publicOrigin:''}})).status,200);
    equal((await request(`${base}/api/start`,{cookie:admin,body:{}})).status,400);
    equal((await request(`${base}/api/status`,{cookie:admin})).data.appRunning,false);
    console.log(JSON.stringify({ok:true,assertions,externalRequests:0,paidCalls:0,work}));
  } finally {
    try{const key=fs.readFileSync(path.join(work,'private','manager.key'),'utf8');const login=await request(`${base}/api/login`,{body:{key}});await request(`${base}/api/stop`,{cookie:login.cookie,body:{}});}catch{}
    manager.kill();await Promise.race([exited,delay(8000)]);
  }
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
