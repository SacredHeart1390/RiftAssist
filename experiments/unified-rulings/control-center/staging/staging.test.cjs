'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('./protocol.cjs'),V=require('./vault.cjs'),{createBroker}=require('./broker.cjs'),{site,FakeIO}=require('./fixture.cjs');
const {DatabaseSync}=require('node:sqlite');
async function fixture(t){const s=await site();t.after(()=>s.cleanup());const io=new FakeIO(s.config),b=createBroker(s.raw,io,{fixture:true});return{...s,io,b,call:(m,p)=>b.handle(s.envelope(m,p))};}
const count=(s,slot)=>{const db=new DatabaseSync(path.join(s.config.root,'data',slot,'private/operations.sqlite'),{readOnly:true});try{return db.prepare('SELECT count(*) n FROM reports').get().n;}finally{db.close();}};
async function deploy(s){const plan=await s.call('plan',{operationId:crypto.randomUUID()});return{plan,result:await s.call('deploy',{plan,package:s.packet,approval:plan.digest})};}
test('staging inventory refuses production roots unapproved installs reused ports and mutable target fields',async t=>{
 const s=await fixture(t);assert.throws(()=>P.inventory(s.raw));assert.throws(()=>P.inventory({...s.raw,environment:'production'},{fixture:true}));assert.throws(()=>P.inventory({...s.raw,installationApproved:false},{fixture:true}));
 const ports=structuredClone(s.raw.ports);ports.b[0]=3100;assert.throws(()=>P.inventory({...s.raw,ports},{fixture:true}));
 await assert.rejects(s.b.handle({...s.envelope('status'),root:'/etc'}));await assert.rejects(s.b.handle(s.envelope('exec',{command:'systemctl restart riftassist.service'})));
});
test('fixed site and exact installed package commit/hash are required before backup or transfer',async t=>{
 const s=await fixture(t);await assert.rejects(s.b.handle({...s.envelope('status'),siteId:crypto.randomUUID()}));
 const p=await s.call('plan',{operationId:crypto.randomUUID()}),bad=structuredClone(s.packet);bad.files['src/server.js'].content=Buffer.from('tampered').toString('base64');
 await assert.rejects(s.call('deploy',{plan:p,package:bad,approval:p.digest}));assert.equal(s.io.calls.length,0);assert.equal(count(s,'a'),1);
});
test('server-signed exact approval stale version and expiry prevent forged old plans',async t=>{
 const s=await fixture(t),p=await s.call('plan',{operationId:crypto.randomUUID()});
 await assert.rejects(s.call('deploy',{plan:p,package:s.packet,approval:'0'.repeat(64)}));
 const forged={...p,destination:{slot:'a',version:'v0.1.7'}};forged.digest=P.digest(Object.fromEntries(Object.entries(forged).filter(([k])=>k!=='digest')));
 await assert.rejects(s.call('deploy',{plan:forged,package:s.packet,approval:forged.digest}));
 const b=createBroker(s.raw,s.io,{fixture:true,now:()=>Date.now()+11*60000});await assert.rejects(b.handle(s.envelope('deploy',{plan:p,package:s.packet,approval:p.digest})));assert.equal(count(s,'a'),1);
});
test('staging deployment uses actual SQLite snapshot encryption and independent restore while source/key remain intact',async t=>{
 const s=await fixture(t),key=fs.readFileSync(path.join(s.config.root,'data/a/private/storage.key'));
 const {result}=await deploy(s);assert.equal(result.state,'completed');assert.equal(s.io.route().slot,'b');assert.equal(count(s,'a'),1);
 assert.deepEqual(fs.readFileSync(path.join(s.config.root,'data/a/private/storage.key')),key);
 const proof=await s.call('verify-backup',{backupId:result.backupId});assert.equal(proof.verified,true);assert.ok(proof.encryptedRows>=4);
 const sealed=fs.readFileSync(path.join(s.config.root,'backups',result.backupId+'.sealed'));assert.ok(!sealed.includes(key));assert.ok(!sealed.includes('Synthetic fixture question'));
 assert.equal(JSON.parse(fs.readFileSync(path.join(s.config.root,'data/b/releases/v0.2.0/app-release.json'))).ready,false);
});
for(const fault of ['preflight','start','health','route','post-health'])test('failure '+fault+' keeps the known-good v017 route database key and release',async t=>{
 const s=await fixture(t);s.io.fault=fault;const key=fs.readFileSync(path.join(s.config.root,'data/a/private/storage.key')),{result}=await deploy(s);
 assert.equal(result.state,'failed-stable');assert.equal(s.io.route().slot,'a');assert.equal(count(s,'a'),1);assert.deepEqual(fs.readFileSync(path.join(s.config.root,'data/a/private/storage.key')),key);
});
test('backup key or cipher corruption prevents activation and does not restore over source data',async t=>{
 const s=await fixture(t),{result}=await deploy(s),file=path.join(s.config.root,'backups',result.backupId+'.sealed');fs.appendFileSync(file,'synthetic-corruption');
 await assert.rejects(s.call('verify-backup',{backupId:result.backupId}));assert.equal(count(s,'a'),1);
});
test('rollback is separately signed routing approval and preserves new v020 reports and both keys',async t=>{
 const s=await fixture(t),{result}=await deploy(s),store=require('../../releases/v0.2.0/src/operations-store').createStore(path.join(s.config.root,'data/b'));
 try{store.report(store.hash('synthetic-post-deploy'),{clientKey:crypto.randomUUID(),category:'app',description:'Synthetic post-deployment report'});}finally{store.close();}
 const key=fs.readFileSync(path.join(s.config.root,'data/b/private/storage.key'));
 const p=await s.call('rollback-plan',{operationId:crypto.randomUUID(),deploymentId:result.id});await assert.rejects(s.call('rollback',{plan:p,approval:'bad'}));
 const rolled=await s.call('rollback',{plan:p,approval:p.digest});assert.equal(rolled.state,'rolled-back');assert.equal(s.io.route().slot,'a');assert.equal(count(s,'b'),1);assert.equal(count(s,'a'),1);
 assert.deepEqual(fs.readFileSync(path.join(s.config.root,'data/b/private/storage.key')),key);
 await assert.rejects(s.call('plan',{operationId:crypto.randomUUID()}),'Retained candidate data cannot be reused by another deployment.');
});
test('duplicate operation or uncertain retry never repeats transfer backup service start or routing',async t=>{
 const s=await fixture(t),{plan,result}=await deploy(s),calls=s.io.calls.length;
 assert.deepEqual(await s.call('deploy',{plan,package:s.packet,approval:plan.digest}),result);assert.equal(s.io.calls.length,calls);
 const altered={...plan,digest:'f'.repeat(64)};await assert.rejects(s.call('deploy',{plan:altered,package:s.packet,approval:altered.digest}));
});
test('unfinished operation and stale owner are visible without replay or automatic unlock',async t=>{
 const s=await fixture(t),p=await s.call('plan',{operationId:crypto.randomUUID()});
 P.atomic(path.join(s.config.root,'operations',p.id+'.json'),{id:p.id,kind:'deploy',planDigest:p.digest,state:'transfer'});
 P.atomic(path.join(s.config.root,'operation.lock'),{pid:2147483646,token:crypto.randomUUID()});
 const result=await s.call('status',{});assert.equal(result.uncertain,true);assert.equal(result.lock,'interruption-review-required');
 await s.call('deploy',{plan:p,package:s.packet,approval:p.digest});assert.equal(s.io.calls.length,0);assert.equal(fs.existsSync(path.join(s.config.root,'operation.lock')),true);
});
test('path links pinned config changes and port contention fail before touching any source records',async t=>{
 const s=await fixture(t);fs.writeFileSync(path.join(s.config.root,'proxy/route.caddy'),'reverse_proxy 127.0.0.1:3100\n');await assert.rejects(s.call('status',{}));assert.equal(count(s,'a'),1);
});
test('backup failure retains the baseline and cannot create or start a candidate',async t=>{
 const s=await fixture(t);fs.writeFileSync(path.join(s.config.root,'private/vault.key'),Buffer.alloc(31));const{result}=await deploy(s);
 assert.equal(result.state,'failed-stable');assert.equal(s.io.route().slot,'a');assert.equal(count(s,'a'),1);assert.ok(!s.io.calls.includes('start:b'));assert.equal(fs.existsSync(path.join(s.config.root,'releases/b')),false);
});
test('online backup captures committed WAL rows without checkpoint or source restore',async t=>{
 const s=await fixture(t),store=require('../../releases/v0.2.0/src/operations-store').createStore(path.join(s.config.root,'data/a'));
 const db=new DatabaseSync(path.join(s.config.root,'data/a/private/operations.sqlite'));db.exec('PRAGMA wal_autocheckpoint=0');
 try{
  store.report(store.hash('synthetic-wal'),{clientKey:crypto.randomUUID(),category:'app',description:'Synthetic WAL record'});
  const b=await V.createBackup(s.config,'a',crypto.randomUUID());const v=await V.verifyBackup(s.config,b.id);assert.ok(v.encryptedRows>6);assert.equal(count(s,'a'),2);
 }finally{db.close();store.close();}
});
test('failed rollback clearly requires recovery and retains candidate records',async t=>{
 const s=await fixture(t),{result}=await deploy(s);s.io.fault='rollback';const p=await s.call('rollback-plan',{operationId:crypto.randomUUID(),deploymentId:result.id});
 const r=await s.call('rollback',{plan:p,approval:p.digest});assert.equal(r.state,'recovery-required');assert.equal(s.io.route().slot,'b');assert.equal(count(s,'a'),1);assert.ok(fs.existsSync(path.join(s.config.root,'data/b')));
});
test('a concurrent request cannot acquire the deployment lock or repeat a pending write',async t=>{
 const s=await fixture(t),p=await s.call('plan',{operationId:crypto.randomUUID()});
 const replies=await Promise.allSettled([s.call('deploy',{plan:p,package:s.packet,approval:p.digest}),s.call('deploy',{plan:p,package:s.packet,approval:p.digest})]);
 assert.ok(replies.some(r=>r.status==='fulfilled'&&r.value.state==='completed'));assert.equal(s.io.calls.filter(v=>v==='start:b').length,1);
});
test('port contention rejects preflight on real loopback before transfer or service start',async t=>{
 const s=await fixture(t),net=require('node:net'),server=net.createServer();await new Promise(resolve=>server.listen(s.config.ports.b[0],'127.0.0.1',resolve));
 try{const io=new(require('./ubuntu-io.cjs').UbuntuIO)(s.config,{inspect:async()=>{}});await assert.rejects(io.preflight(),e=>e.code==='port-conflict');assert.equal(count(s,'a'),1);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('Caddy validation and reload failure recover the previous scoped include by CAS',async t=>{
 const s=await fixture(t),calls=[];let reloads=0;
 const controller={validate:async file=>{calls.push(path.basename(file));},command:async(action,slot)=>{assert.equal(action,'reload');assert.equal(slot,'proxy');reloads++;if(reloads===1)throw Error('Synthetic reload failure');}};
 const io=new(require('./ubuntu-io.cjs').UbuntuIO)(s.config,controller),old=io.route();await assert.rejects(io.switchRoute(old.hash,'b'),e=>e.code==='route-failed-restored');assert.deepEqual(io.route(),old);assert.equal(reloads,2);assert.equal(calls.length,1);
});
test('audit corruption prevents later requests and source records remain untouched',async t=>{
 const s=await fixture(t);await deploy(s);const file=path.join(s.config.root,'operations/audit.jsonl');const lines=fs.readFileSync(file,'utf8').trim().split('\n');const first=JSON.parse(lines[0]);first.state='tampered';lines[0]=JSON.stringify(first);fs.writeFileSync(file,lines.join('\n')+'\n');
 await assert.rejects(s.call('status',{}),e=>e.code==='audit-integrity');assert.equal(count(s,'a'),1);
});
test('server unit templates contain only site-specific units and a protected isolated runtime',async t=>{
 const s=await fixture(t),units=require('./templates.cjs').systemdUnits(s.config);assert.equal(Object.keys(units).length,3);
 for(const [name,text]of Object.entries(units)){assert.ok(name.includes(s.config.siteId));assert.match(text,/NoNewPrivileges=yes/);assert.match(text,/ProtectHome=yes/);assert.match(text,/IPAddressDeny=any/);assert.ok(!text.includes('riftassist.service'));assert.ok(!text.includes('/etc/caddy/'));}
});
test('a standalone staging marker cannot open an arbitrary existing data root or bypass its namespace',async t=>{
 const root=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'riftassist-stage-boundary-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {spawnSync}=require('node:child_process'),{freePorts}=require('./fixture.cjs'),ports=await freePorts(5);
 fs.writeFileSync(path.join(root,'.riftassist-environment.json'),JSON.stringify({releaseFamily:'v0.2.0',environment:'staging'}));
 fs.writeFileSync(path.join(root,'.riftassist-staging.json'),JSON.stringify({schemaVersion:1,purpose:'isolated-staging',siteId:crypto.randomUUID(),ports:ports.slice(0,4),proxyPort:ports[4]}));
 const r=spawnSync(process.execPath,[path.resolve(__dirname,'../../releases/v0.2.0/src/manager.js')],{encoding:'utf8',env:{...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),RIFTASSI_DATA_ROOT:root,RIFTASSI_EXTERNAL_MODE:'mock',MANAGER_PORT:String(ports[0]),APP_PORT:String(ports[1])}});
 assert.notEqual(r.status,0);assert.match(r.stderr,/dedicated data namespace/);assert.equal(fs.existsSync(path.join(root,'private')),false);
});
