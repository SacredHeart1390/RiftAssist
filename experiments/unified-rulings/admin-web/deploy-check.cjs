// Server-side read-only verification. Never prints questions, keys or configuration.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const {openStore}=require('./store.cjs');
const root=process.env.RIFTASSI_DATA_ROOT||'/home/azureuser/RiftAssist-v020-e06496b0';
(async()=>{
 const db=new DatabaseSync(path.join(root,'private/operations.sqlite'),{readOnly:true});db.exec('PRAGMA query_only=ON');
 const snapshot=()=>JSON.stringify(['requests','calls','reports','report_history','settings','session_counts','events'].map(n=>db.prepare('SELECT * FROM '+n+' ORDER BY 1').all()));const before=snapshot(),base='http://127.0.0.1:8765';
 const get=async route=>{const r=await fetch(base+route);assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('set-cookie'),null);return r.json();};
 const overview=await get('/api/overview'),reports=await get('/api/reports'),requests=await get('/api/requests');assert.equal(overview.state.version,'0.2.11');assert.equal(overview.state.environment,'production');assert.equal(overview.state.providerMode,'live');assert.equal(overview.state.model,'gpt-6-luna');assert.equal(overview.state.cards,1527);
 const store=openStore(root);try{const expected=store.usage(overview.today.from,overview.today.to);for(const key of ['from','to','timezone','days','totals','unresolved','notice'])assert.deepEqual(overview.today[key],expected[key]);if(requests.items.length)assert.deepEqual(await get('/api/requests/'+requests.items[0].id),store.requestDetail(requests.items[0].id));if(reports.items.length)assert.deepEqual(await get('/api/reports/'+reports.items[0].id),store.detail(reports.items[0].id));}finally{store.close();}
 for(const route of ['/api/login','/api/logout','/api/session'])assert.equal((await fetch(base+route,{method:'POST'})).status,404);
 assert.equal((await fetch(base+'/api/requests',{method:'POST'})).status,405);assert.equal((await fetch(base+'/api/requests',{headers:{Origin:'https://invalid.example'}})).status,403);
 assert.equal(snapshot(),before);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();
 console.log(JSON.stringify({version:overview.state.version,sshOnlyDashboard:true,requests:requests.total,reports:reports.total,statisticsVerified:true,detailsVerified:true,operationalRowsUnchanged:true}));
})().catch(()=>{console.error('Read-only SSH administrator verification failed; record contents are not logged.');process.exitCode=1;});
