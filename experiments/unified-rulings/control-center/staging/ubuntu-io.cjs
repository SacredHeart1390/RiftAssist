'use strict';
const fs=require('node:fs'),path=require('node:path'),https=require('node:https'),net=require('node:net');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const {within,readJSON,atomic,noLinks,hash,fail,unit}=require('./protocol.cjs');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function available(port) {
  const server=net.createServer();try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});return true;}catch{return false;}finally{if(server.listening)await new Promise(resolve=>server.close(resolve));}
}
async function jsonHTTP(port,route,options={}) {
  const response=await fetch('http://127.0.0.1:'+port+route,{...options,signal:AbortSignal.timeout(6000)});
  const text=await response.text();if(text.length>2000000)fail('health');let data;try{data=JSON.parse(text);}catch{fail('health');}
  return{status:response.status,headers:response.headers,data};
}
async function health(config,slot,{exercise=false}={}) {
  const version=readJSON(within(config.root,'releases',slot,'release.json')).version, ports=config.ports[slot];let answer;
  const deadline=Date.now()+30000;
  for(let attempt=0;attempt<150&&Date.now()<deadline;attempt++) {
    try {answer=await jsonHTTP(ports[1],'/api/health');if(answer.status===200&&answer.data.appReleaseId===version)break;} catch {}
    await delay(100);
  }
  if(answer?.status!==200||answer.data.appReleaseId!==version||answer.data.version!==version.slice(1)||!answer.data.indexedRuleCount)fail('health');
  if(version==='v0.2.0'&&answer.data.providerMode!=='mock')fail('paid-provider-blocked');
  const cards=await jsonHTTP(ports[1],'/api/cards/search?q=staging&language=ko');if(version==='v0.1.7' ? cards.status!==503 : cards.status!==200||cards.data.total!==0)fail('card-rights');
  if(version==='v0.2.0') {
    let key=fs.readFileSync(within(config.root,'data',slot,'private','manager.key'),'utf8');
    try {
      if(!/^[a-f0-9]{64}$/i.test(key))fail('authentication');const origin='http://127.0.0.1:'+ports[0];
      const login=await jsonHTTP(ports[0],'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({key})});
      const cookie=login.headers.get('set-cookie')?.split(';')[0];if(login.status!==200||!cookie)fail('authentication');
      const status=await jsonHTTP(ports[0],'/api/status',{headers:{Cookie:cookie}});if(status.status!==200||status.data.appRunning!==true)fail('admin-health');
    } finally {key=null;}
  }
  if(exercise) {
    const cookie=answer.headers.get('set-cookie')?.split(';')[0],origin='http://127.0.0.1:'+ports[1];
    const options={method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'}};
    const asked=await jsonHTTP(ports[1],'/api/ask',{...options,body:JSON.stringify({clientKey:require('node:crypto').randomUUID(),question:'같은 턴 같은 전장에서 다시 득점하나요?',language:'ko'})});
    if(asked.status!==200||asked.data.status!=='ruling-generated'||!asked.data.requestId)fail('mock-ai-health');
    const report=await jsonHTTP(ports[1],'/api/reports',{...options,body:JSON.stringify({clientKey:require('node:crypto').randomUUID(),requestId:asked.data.requestId,category:'app',description:'Synthetic staging health fixture only; not user data.'})});
    if(report.status!==200&&report.status!==201)fail('report-health');
  }
  return{healthy:true,version,realApplication:true,provider:'mock-only',cardsPublic:0,admin:version==='v0.2.0'?'existing-authenticated-api':'legacy-app-host-only',syntheticExercise:exercise};
}
async function proxyHealth(config,expectedVersion) {
  const ca=within(config.root,'proxy','data','caddy','pki','authorities','local','root.crt');noLinks(ca,true);
  return await new Promise((resolve,reject)=>{
    const request=https.get({hostname:'localhost',family:4,port:config.proxyPort,path:'/api/health',ca:fs.readFileSync(ca),rejectUnauthorized:true,timeout:5000},response=>{
      let bytes='';response.on('data',b=>{bytes+=b;if(bytes.length>65536)response.destroy();});response.on('error',reject);
      response.on('end',()=>{try{const v=JSON.parse(bytes);if(response.statusCode!==200||v.appReleaseId!==expectedVersion)fail('proxy-health');resolve({healthy:true,tlsVerified:true,version:expectedVersion});}catch{reject(Error('proxy-health'));}});
    });request.on('timeout',()=>request.destroy(Error('proxy-health')));request.on('error',reject);
  });
}
class UbuntuIO {
  constructor(config,controller){this.config=config;this.controller=controller;}
  async preflight(){
    const c=this.config;for(const slot of ['a','b','proxy'])await this.controller.inspect(slot);
    for(const port of c.ports.b)if(!await available(port))fail('port-conflict');
    const text=fs.readFileSync(within(c.root,'proxy','Caddyfile'),'utf8'),receipt=readJSON(within(c.root,'proxy','config-receipt.json'));
    if(hash(text)!==receipt.sha256)fail('caddy-drift');return{portsAvailable:true,siteScoped:true,caddyHash:receipt.sha256};
  }
  async start(slot){await this.controller.command('start',slot);}
  async stop(slot){await this.controller.command('stop',slot);}
  async health(slot,options){return health(this.config,slot,options);}
  async proxyHealth(version){return proxyHealth(this.config,version);}
  route(){const c=this.config,text=fs.readFileSync(within(c.root,'proxy','route.caddy'),'utf8');const slot=['a','b'].find(s=>text==='reverse_proxy 127.0.0.1:'+c.ports[s][1]+'\n');if(!slot)fail('route-drift');return{slot,hash:hash(text)};}
  async switchRoute(expectedHash,slot){
    const c=this.config;if(!['a','b'].includes(slot))fail('slot');const previous=this.route();if(previous.hash!==expectedHash)fail('route-conflict');
    const configFile=within(c.root,'proxy','Caddyfile'),oldConfig=fs.readFileSync(configFile,'utf8');
    if(hash(oldConfig)!==readJSON(within(c.root,'proxy','config-receipt.json')).sha256)fail('caddy-drift');
    const routeFile=within(c.root,'proxy','route.caddy'),fragment='reverse_proxy 127.0.0.1:'+c.ports[slot][1]+'\n';
    const token='import '+routeFile.replaceAll('\\','/');if(oldConfig.split(token).length!==2)fail('caddy-drift');
    const validation=within(c.root,'proxy','validate-'+require('node:crypto').randomUUID()+'.Caddyfile');
    atomic(validation,oldConfig.replace(token,fragment),0o644);
    try{await this.controller.validate(validation);}finally{fs.unlinkSync(validation);}
    if(this.route().hash!==expectedHash)fail('route-conflict');if(hash(fs.readFileSync(configFile,'utf8'))!==hash(oldConfig))fail('caddy-drift');atomic(routeFile,fragment,0o644);
    try{await this.controller.command('reload','proxy');return this.route();}
    catch{
      if(this.route().hash!==hash(fragment))fail('recovery-required');
      atomic(routeFile,'reverse_proxy 127.0.0.1:'+c.ports[previous.slot][1]+'\n',0o644);
      try{await this.controller.command('reload','proxy');}catch{fail('recovery-required');}fail('route-failed-restored');
    }
  }
}
class SystemdController {
  constructor(config){this.config=config;}
  async run(binary,args,asApp=false){
    try{return(await execFile(binary,args,{timeout:35000,maxBuffer:32768,...(asApp&&process.geteuid()===0?{uid:this.config.appUid,gid:this.config.appGid}:{}),env:{PATH:'/usr/bin:/bin',LANG:'C',HOME:within(this.config.root,'proxy'),XDG_DATA_HOME:within(this.config.root,'proxy','data'),XDG_CONFIG_HOME:within(this.config.root,'proxy','config')}})).stdout;}
    catch{fail('system-command-failed');}
  }
  async inspect(slot){
    const name=unit(this.config,slot),raw=await this.run('/usr/bin/systemctl',['show',name,'--no-pager','--property=LoadState,User,WorkingDirectory,FragmentPath']);
    const fields=Object.fromEntries(raw.trim().split('\n').map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
    if(fields.LoadState!=='loaded'||Number(fields.User)!==this.config.appUid||fields.WorkingDirectory!==(slot==='proxy'?within(this.config.root,'proxy'):within(this.config.root,'data',slot)))fail('unit-inventory');
    const expected=['/etc/systemd/system/','/run/systemd/system/'].map(p=>p+name);if(!expected.includes(fields.FragmentPath))fail('unit-inventory');
  }
  async command(action,slot){if(!['start','stop','reload'].includes(action)||action==='reload'&&slot!=='proxy')fail('system-command');await this.run('/usr/bin/systemctl',[action,unit(this.config,slot)]);}
  async validate(file){noLinks(file,true);if(path.dirname(file)!==within(this.config.root,'proxy')||!/^validate-[a-f0-9-]{36}\.Caddyfile$/.test(path.basename(file)))fail('path');await this.run(this.config.caddy,['validate','--config',file,'--adapter','caddyfile'],true);}
}
module.exports={UbuntuIO,SystemdController,health,proxyHealth,available};
