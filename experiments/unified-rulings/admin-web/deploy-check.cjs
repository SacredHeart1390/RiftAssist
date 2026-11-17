// Runs only on Azure. Never outputs plaintext records, configuration or credentials.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync,backup}=require('node:sqlite');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const base='/home/azureuser/RiftAssist-v020-e06496b0',live=base+'/releases/v0.2.0';
let phase='startup';
async function main(){const [mode,stage,folder,commit]=process.argv.slice(2);
 if(mode==='prepare'){
  const baseline=JSON.parse(fs.readFileSync(stage+'/baseline-v027.json'));
  for(const [file,digest]of Object.entries(baseline.hashes))assert.equal(hash(fs.readFileSync(path.join(live,file))),digest,'Production code differs from v0.2.7: '+file);
  const db=new DatabaseSync(base+'/private/operations.sqlite',{readOnly:true});
  try{
   assert.equal(db.prepare('PRAGMA quick_check').get().quick_check,'ok');
   await backup(db,folder+'/operations.sqlite');fs.copyFileSync(base+'/private/storage.key',folder+'/storage.key');
   const since=Date.now()-6*86400000,records={};
   for(const table of ['requests','calls','reports','report_history']){const rows=db.prepare('SELECT * FROM '+table+(table==='report_history'?'':' WHERE created>=?')).all(...(table==='report_history'?[]:[since]));records[table]=rows.map(r=>({id:r.id,hash:hash(JSON.stringify(r))}));}
   const protectedFiles={};for(const p of ['.env','private/storage.key','private/manager.key','private/sessions.key','knowledge-active.json'])if(fs.existsSync(base+'/'+p))protectedFiles[p]=hash(fs.readFileSync(base+'/'+p));
   fs.writeFileSync(folder+'/preservation.json',JSON.stringify({since,records,protectedFiles}),{mode:0o600});
   const b=new DatabaseSync(folder+'/operations.sqlite',{readOnly:true});try{assert.equal(b.prepare('PRAGMA quick_check').get().quick_check,'ok');}finally{b.close();}
   console.log('Verified v0.2.7 code, consistent server-only DB backup and retention-safe preservation receipt.');
  }finally{db.close();}
 }else if(mode==='verify'){
  phase='runtime-health';
  const h=await fetch('http://127.0.0.1:3001/api/health',{headers:{'X-RiftAssist-Health-Probe':fs.readFileSync(base+'/private/admin-probe.key','utf8').trim()}}).then(r=>r.json()),r=await fetch('https://riftassistant.app/api/release').then(r=>r.json());
  assert.equal(h.version,'0.2.8');assert.equal(r.version,'0.2.8');assert.equal(h.environment,'production');assert.equal(h.providerMode,'live');assert.equal(h.model,'gpt-6-luna');assert.equal(h.cardCatalog.total,1527);assert.deepEqual(h.retention,{questionDays:7,metadataDays:30,reportDays:90,imagesStored:false});
  phase='public-html';const html=await fetch('https://riftassistant.app/').then(r=>r.text());assert.equal((html.match(/data-app-version>v0.2.8/g)||[]).length,2);
  phase='preservation';
  const before=JSON.parse(fs.readFileSync(folder+'/preservation.json'));
  for(const [file,digest]of Object.entries(before.protectedFiles))assert.equal(hash(fs.readFileSync(base+'/'+file)),digest,'Protected configuration changed');
  const db=new DatabaseSync(base+'/private/operations.sqlite',{readOnly:true});try{for(const [table,rows]of Object.entries(before.records))for(const row of rows){const current=db.prepare('SELECT * FROM '+table+' WHERE id=?').get(row.id);assert.ok(current,'Existing record disappeared');assert.equal(hash(JSON.stringify(current)),row.hash,'Existing record changed');}}finally{db.close();}
  phase='admin-authentication';const secret=fs.readFileSync('/etc/riftassist/admin-web.key','utf8').trim(),url='http://127.0.0.1:8765';
  assert.equal((await fetch(url+'/api/reports')).status,401);assert.equal((await fetch(url+'/api/login',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({password:'wrong'})})).status,401);
  const login=await fetch(url+'/api/login',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({password:secret})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const get=async p=>{const res=await fetch(url+p,{headers:{Cookie:cookie}});assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);return res.json();};
  phase='admin-read';const overview=await get('/api/overview'),reports=await get('/api/reports');
  phase='independent-sql-and-no-session-writes';
  const sql=new DatabaseSync(base+'/private/operations.sqlite',{readOnly:true});try{
   const start=Date.parse(overview.today.from+'T00:00:00+09:00'),end=start+86400000;
   assert.equal(overview.today.totals.questions,sql.prepare('SELECT count(*) n FROM requests WHERE created>=? AND created<?').get(start,end).n);
   const c=sql.prepare("SELECT count(*) n,coalesce(sum(input_tokens),0) input,coalesce(sum(output_tokens),0) output FROM calls WHERE created>=? AND created<? AND coalesce(error,'') NOT IN ('input_budget_exceeded','request_deadline')").get(start,end);
   assert.equal(overview.today.totals.aiCalls,c.n);assert.equal(overview.today.totals.inputTokens,c.input);assert.equal(overview.today.totals.outputTokens,c.output);
   const before=JSON.stringify(sql.prepare('SELECT * FROM session_counts ORDER BY day').all());await get('/api/overview');await get('/api/overview');assert.equal(JSON.stringify(sql.prepare('SELECT * FROM session_counts ORDER BY day').all()),before);
  }finally{sql.close();}
  phase='report-detail-and-aggregate-comparison';const ro=require('./store.cjs').openStore(base);try{const expected=ro.usage(overview.today.from,overview.today.to);for(const field of ['from','to','timezone','days','totals','unresolved'])assert.deepEqual(overview.today[field],expected[field]);assert.equal(reports.total,ro.reports().total);if(reports.items.length){const d=await get('/api/reports/'+reports.items[0].id);assert.deepEqual(d,ro.detail(reports.items[0].id));console.log('Existing report detail and decryption verified (no plaintext output).');}}finally{ro.close();}
  fs.writeFileSync(base+'/deployment-v028.json',JSON.stringify({commit,version:h.version,verifiedAt:new Date().toISOString(),previousCommit:'c5713e3',backup:folder},null,2),{mode:0o600});
  console.log(JSON.stringify({version:h.version,environment:h.environment,providerMode:h.providerMode,model:h.model,cards:h.cardCatalog.total,today:overview.today.totals,unresolved:overview.today.unresolved,reports:reports.total,existingRecordsPreserved:true}));
 }else throw Error('Unknown mode');
}
main().catch(e=>{console.error('Deployment verification failed at '+phase+' ('+(e.code||e.name)+').');console.error((e.stack||'').split('\n').filter(s=>/^\s+at /.test(s)).slice(0,2).join('\n'));process.exitCode=1;});
