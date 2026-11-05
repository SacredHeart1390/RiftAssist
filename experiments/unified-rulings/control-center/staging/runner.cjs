'use strict';
// systemd runs this trusted launcher as the isolated APP user, never as the broker/root.
const fs=require('node:fs'),path=require('node:path'),{fork}=require('node:child_process');
const {noLinks,readJSON,uuid,fail}=require('./protocol.cjs');
async function main(file) {
  noLinks(file,true);const c=readJSON(file,8192);
  if(c.schemaVersion!==1||c.purpose!=='isolated-staging-launch'||!uuid(c.siteId)||!['a','b'].includes(c.slot)||!['v0.1.7','v0.2.0'].includes(c.version))fail('launch');
  const site=path.resolve(path.dirname(file),'..');
  if(path.basename(site)!==c.siteId||c.root!==path.join(site,'data',c.slot)||c.source!==path.join(site,'releases',c.slot,'code'))fail('launch');
  const env={PUBLIC_ORIGIN:'https://localhost:'+c.proxyPort,PATH:process.env.PATH||'/usr/bin:/bin',...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{}),RIFTASSI_DATA_ROOT:c.root,
    RIFTASSI_EXTERNAL_MODE:'mock',RIFTASSI_CARD_POLICY:'restricted',OPENAI_API_KEY:'development-mock-only',OPENAI_GENERATION_ENABLED:'true',LOG_CONTENT:'false',
    MANAGER_PORT:String(c.ports[0]),APP_PORT:String(c.ports[1]),PUBLIC_PORT:String(c.ports[1])};
  if(c.version==='v0.1.7') {
    const child=fork(path.join(c.source,'src/server.js'),[],{cwd:c.root,env:{...env,PORT:String(c.ports[1]),APP_RELEASE_ID:'v0.1.7'},stdio:['ignore','ignore','ignore','ipc']});
    for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(child.connected)child.send({type:'shutdown'});else child.kill('SIGTERM');});
    child.once('exit',code=>process.exit(code||0));
    return;
  }
  const child=fork(path.join(c.source,'src/manager.js'),[],{cwd:c.root,env,stdio:['ignore','ignore','ignore','ipc']});
  let stopping=false;
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{stopping=true;child.kill('SIGTERM');});
  child.once('exit',code=>process.exit(stopping?0:code||1));
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('startup')),20000);child.once('error',reject);child.once('exit',()=>reject(Error('startup')));child.on('message',v=>{if(v.type==='isolated-staging-manager-ready'){clearTimeout(timer);resolve();}});});
  let key=fs.readFileSync(path.join(c.root,'private/manager.key'),'utf8');
  try {
    if(!/^[a-f0-9]{64}$/i.test(key))fail('authentication');
    const origin='http://127.0.0.1:'+c.ports[0];
    const r=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key}),signal:AbortSignal.timeout(5000)});
    const cookie=r.headers.get('set-cookie')?.split(';')[0];if(r.status!==200||!cookie)fail('authentication');
    const start=await fetch(origin+'/api/start',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
    if(start.status!==200)fail('startup');
    let misses=0,pending=false,cookieValue='';
    const monitor=setInterval(async()=>{if(pending||stopping)return;pending=true;try{const h=await fetch('http://127.0.0.1:'+c.ports[1]+'/api/health',{headers:cookieValue?{Cookie:cookieValue}:{},signal:AbortSignal.timeout(4000)});if(h.status!==200)throw Error('health');cookieValue=h.headers.get('set-cookie')?.split(';')[0]||cookieValue;misses=0;}catch{if(++misses>=2){clearInterval(monitor);child.kill('SIGTERM');}}finally{pending=false;}},10000);
    monitor.unref();
  } finally {key=null;}
}
if(require.main===module)main(process.argv[2]).catch(()=>{process.stderr.write('isolated-staging-startup-failed\n');process.exit(1);});
module.exports={main};
