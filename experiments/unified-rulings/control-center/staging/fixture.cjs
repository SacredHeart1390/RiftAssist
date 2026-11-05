'use strict';
// Synthetic test/provisioning fixtures only. Not a server command and never loads operational data.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),net=require('node:net');
const P=require('./protocol.cjs'),F=require('./files.cjs');
const release=path.resolve(__dirname,'../../releases/v0.2.0'),legacy=path.resolve(__dirname,'../../releases/v0.1.7');
function packetFromCode(root=release) {
  const manifest=P.readJSON(path.join(root,'app-release.json')),files={};
  for(const name of ['app-release.json',...Object.keys(manifest.hashes).filter(n=>/^(src|public|manager-ui|dev-fixtures)\//.test(n))]){
    const bytes=fs.readFileSync(path.join(root,name));files[name]={sha256:P.hash(bytes),content:bytes.toString('base64')};
  }
  const p={schemaVersion:1,version:'v0.2.0',branch:'release/v0.2.0',commit:'a'.repeat(40),scope:'development-only',ready:false,tests:{status:'success',commit:'a'.repeat(40),kind:'synthetic',runIds:[]},files};p.digest=P.digest(p);return p;
}
async function freePorts(n) {
  const servers=[],ports=[];
  try{while(ports.length<n){const s=net.createServer();await new Promise((r,j)=>{s.once('error',j);s.listen(0,'127.0.0.1',r);});servers.push(s);const p=s.address().port;if(!P.RESERVED.has(p))ports.push(p);}return ports;}
  finally{await Promise.all(servers.map(s=>new Promise(r=>s.close(r))));}
}
function entries(root){const out={};for(const folder of ['src','public','manager-ui']){
  const walk=relative=>{for(const e of fs.readdirSync(path.join(root,relative),{withFileTypes:true})){const n=relative+'/'+e.name;if(e.isDirectory())walk(n);else{const b=fs.readFileSync(path.join(root,n));out[n]={sha256:P.hash(b),content:b.toString('base64')};}}};if(fs.existsSync(path.join(root,folder)))walk(folder);
}const b=fs.readFileSync(path.join(root,'app-release.json'));out['app-release.json']={sha256:P.hash(b),content:b.toString('base64')};return out;}
async function site({caddy=process.execPath,realLegacy=false,appUid=process.getuid?.()||0,appGid=process.getgid?.()||0}={}) {
  const temporary=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'riftassist-stage-test-')));fs.chmodSync(temporary,0o755);
  const siteId=crypto.randomUUID(),ports=await freePorts(10),packet=packetFromCode();
  const raw={schemaVersion:1,siteId,environment:'isolated-staging',installationApproved:true,root:path.join(temporary,'riftassist-staging',siteId),node:process.execPath,caddy,appUid,appGid,
    approvedCommit:packet.commit,approvedPackageDigest:packet.digest,ports:{a:ports.slice(0,4),b:ports.slice(4,8)},proxyPort:ports[8],proxyAdminPort:ports[9]};
  const config=P.inventory(raw,{fixture:true});F.initialize(config);
  const baseline=realLegacy?entries(legacy):{'app-release.json':{content:Buffer.from(JSON.stringify({releaseId:'v0.1.7',dataSchema:2,ready:false})).toString('base64')}};
  if(!realLegacy)for(const e of Object.values(baseline))e.sha256=P.hash(Buffer.from(e.content,'base64'));
  F.writeCode(config,'a',baseline,'v0.1.7','synthetic-v017-baseline','synthetic-baseline');
  const rules=JSON.parse(fs.readFileSync(path.join(release,'dev-fixtures/rules.json'),'utf8'));
  const data=F.prepareData(config,'a','v0.1.7',rules);
  const store=require(path.join(release,'src/operations-store.js')).createStore(data);
  try{const q=store.beginQuestion(store.hash('synthetic-owner'),crypto.randomUUID(),'Synthetic fixture question only',store.hash('synthetic'),{});store.finishQuestion(q.id,{recommendation:'Synthetic answer'},{});store.report(store.hash('synthetic-owner'),{clientKey:crypto.randomUUID(),requestId:q.id,category:'app',description:'Synthetic report, never actual user content.'});}finally{store.close();}
  F.chownTree(config,data);
  const envelope=(method,payload={})=>({protocol:P.PROTOCOL,requestId:crypto.randomUUID(),siteId,inventoryHash:config.inventoryHash,method,payload});
  return{temporary,raw,config,packet,envelope,cleanup(){fs.rmSync(temporary,{recursive:true,force:true,maxRetries:4,retryDelay:100});}};
}
class FakeIO {
  constructor(config){this.config=config;this.fault='none';this.calls=[];}
  async preflight(){this.calls.push('preflight');if(this.fault==='preflight')P.fail('preflight');return{synthetic:true};}
  async start(slot){this.calls.push('start:'+slot);if(this.fault==='start'&&slot==='b')P.fail('start');}
  async stop(slot){this.calls.push('stop:'+slot);}
  async health(slot){this.calls.push('health:'+slot);if(this.fault==='health'&&slot==='b')P.fail('health');return{healthy:true,realApplication:false,synthetic:true,version:JSON.parse(fs.readFileSync(path.join(this.config.root,'releases',slot,'release.json'))).version};}
  async proxyHealth(version){if(this.fault==='post-health'&&version==='v0.2.0')P.fail('proxy-health');return{healthy:true,synthetic:true};}
  route(){const text=fs.readFileSync(P.within(this.config.root,'proxy','route.caddy'),'utf8');const slot=['a','b'].find(s=>text==='reverse_proxy 127.0.0.1:'+this.config.ports[s][1]+'\n');if(!slot)P.fail('route-drift');return{slot,hash:P.hash(text)};}
  async switchRoute(expected,slot){this.calls.push('route:'+slot);if(this.fault==='route'||this.fault==='rollback'&&slot==='a')P.fail('route');if(this.route().hash!==expected)P.fail('route-conflict');P.atomic(P.within(this.config.root,'proxy','route.caddy'),'reverse_proxy 127.0.0.1:'+this.config.ports[slot][1]+'\n',0o644);return this.route();}
}
module.exports={site,FakeIO,packetFromCode,freePorts};
