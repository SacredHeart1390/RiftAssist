'use strict';
const fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process'),P=require('./protocol.cjs');
async function main(file){
  P.noLinks(file,true);const c=P.readJSON(file,8192);
  if(c.purpose!=='isolated-staging-launch'||!c.root.startsWith(fs.realpathSync(require('node:os').tmpdir())+path.sep))P.fail('rehearsal-scope');
  if(c.version==='v0.2.0')return require('./runner.cjs').main(file);
  if(c.version!=='v0.1.7')P.fail('version');
  const env={PATH:process.env.PATH||'/usr/bin:/bin',RIFTASSI_DATA_ROOT:c.root,MANAGER_PORT:String(c.ports[0]),APP_PORT:String(c.ports[1]),PUBLIC_ORIGIN:'https://localhost:'+c.proxyPort,RIFTASSI_EXTERNAL_MODE:'mock',OPENAI_API_KEY:'development-mock-only',OPENAI_GENERATION_ENABLED:process.env.RIFTASSIST_REHEARSAL_PAUSE_AI==='true'?'false':'true',LOG_CONTENT:'false',RIFTASSIST_REHEARSAL_LEGACY:'true',RIFTASSIST_REHEARSAL_SOURCE:c.source,RIFTASSIST_REHEARSAL_PORTS:JSON.stringify(c.ports.slice(2))};
  // Existing collector checks this live fixture-owner PID and therefore does not spawn.
  fs.mkdirSync(path.join(c.root,'source-updates'),{recursive:true,mode:0o700});P.atomic(path.join(c.root,'source-updates/monitor.json'),{pid:process.pid});
  const child=fork(path.join(c.source,'src/manager.js'),[],{cwd:c.root,env,execArgv:['--require',path.join(__dirname,'mock-legacy.cjs'),'--require',path.join(__dirname,'replacement-legacy-preload.cjs')],stdio:['ignore','ignore','ignore','ipc']});let stopping=false;
  for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{stopping=true;child.kill('SIGTERM');});child.once('exit',code=>process.exit(stopping?0:code||1));
  const origin='http://127.0.0.1:'+c.ports[0];let response;for(let i=0;i<100;i++){try{response=await fetch(origin+'/',{signal:AbortSignal.timeout(1000)});response.body?.cancel();if(response.status===200)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  if(response?.status!==200)P.fail('manager-start');let key=fs.readFileSync(path.join(c.root,'private/manager.key'),'utf8');
  try{const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(4000)}),cookie=login.headers.get('set-cookie')?.split(';')[0];if(login.status!==200||!cookie)P.fail('authentication');const start=await fetch(origin+'/api/start',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});if(start.status!==200)P.fail('app-start');}finally{key=null;}
}
if(require.main===module)main(process.argv[2]).catch(()=>{process.stderr.write('replacement-rehearsal-start-failed\n');process.exit(1);});
module.exports={main};
