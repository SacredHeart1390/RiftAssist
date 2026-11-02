// Execute the unmodified v0.1.7 HTTP/auth router against a synthetic in-memory store.
// No operational SQLite/key files, child workers, collectors, external APIs or service control.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const root=process.argv[2], mode=process.argv[3]||'normal';fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
const reportId='12345678-1234-1234-1234-123456789abc';
const limits={questions:100,generations:80,translations:60,sessionQuestions:20,sessionTranslations:10,reports:50,sessionReports:5,concurrent:2};
const stats={day:'2026-11-02',limits,aiEnabled:true,calls:[{kind:'generation',count:13,inputTokens:50,outputTokens:70,usageUnknown:0}],reports:[{status:'received',count:1}]};
const row={id:reportId,request_id:'synthetic-request',created:1793577600000,category:'wrong-answer',status:'received'};
const requests=[];let server;
const forbidden=()=>{throw new Error('Synthetic fixture forbids mutation')};
const store={directory:root,stats:()=>stats,listReports:()=>[row],reportDetail:()=>({...row,content:'합성 제보입니다',snapshot:{question:{text:'합성 질문'},response:{recommendation:'합성 답변'},trace:{token:'synthetic-token'}},history:[{status:'received',note:'합성 메모'}],token:'synthetic-token'}),setting:()=>({provider:'none',publicOrigin:''}),purge:()=>{},close:()=>{},setSetting:forbidden,updateReport:forbidden,makeBackup:forbidden};
const fakeHttp={...http,createServer(handler){
 server=http.createServer((req,res)=>{
  requests.push({method:req.method,path:req.url});fs.writeFileSync(path.join(root,'requests.json'),JSON.stringify(requests));
  if(req.url==='/api/status'&&mode!=='normal'){
   if(mode==='expired'){res.writeHead(401);return res.end('synthetic-sensitive-output')}
   if(mode==='redirect'){res.writeHead(302,{Location:'https://example.invalid/forbidden'});return res.end()}
   if(mode==='disconnect'){return req.socket.destroy()}
   if(mode==='hang')return;
   res.writeHead(200,{'Content-Type':'application/json'});return res.end(mode==='oversize'?'x'.repeat(2100000):'{invalid json');
  }
  handler(req,res);
 });
 const listen=server.listen.bind(server); server.listen=(_port,_host,ready)=>listen(0,'127.0.0.1',()=>{ready();process.stdout.write(JSON.stringify({port:server.address().port})+'\n')});return server;
}};
const modules={'http':fakeHttp,'fs':fs,'path':path,'crypto':crypto,'./operations-store':{createStore:()=>store,REPORT_STATES:['received','triaged','reproduced','fixing','review','resolved','duplicate','needs-info']},'./access-control':{localSecret:()=> 'synthetic-token',safeEqual:(a,b)=>typeof a==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b))},'./cloudflare-quick':{startQuickTunnel:forbidden},'./paths':{APP_ROOT:root,DATA_ROOT:root},'./app-host':{createAppHost:()=>({status:()=>({releaseId:'v0.1.7'}),currentChild:()=>null,stop:async()=>{}})},'./knowledge-admin':{knowledgeStatus:forbidden},'./knowledge-releases':{activateRelease:forbidden},'./source-discovery':{atomicJson:forbidden},'child_process':{fork:forbidden,spawn:()=>{const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.unref=()=>{};return child}}};
const source=fs.readFileSync(path.join(__dirname,'manager-v017.cjs'),'utf8');
vm.runInNewContext(source,{require:name=>{name=name.replace(/^node:/,'');if(!(name in modules))throw new Error('Unknown fixture module');return modules[name]},process:{env:{MANAGER_PORT:'3100',APP_PORT:'3001'},on:()=>{},exit:forbidden,kill:forbidden,execPath:process.execPath},__filename:'synthetic-manager.cjs',console:{log:()=>{},error:()=>{}},Buffer,URL,setTimeout,clearTimeout,setInterval:()=>({unref(){}}),clearInterval},{filename:'unmodified-manager-v017.cjs'});
