// Standalone collection; the scheduled process never imports an OpenAI client or SQLite.
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
const {collectBrowser}=require('../src/riftnaru-browser'),{atomic,lock}=require('../src/riftnaru-sync');
const A=require('../src/riftnaru-auto-release');
function parse(args){const out={};for(let i=0;i<args.length;i+=2){if(!/^--[a-z-]+$/u.test(args[i])||args[i+1]===undefined)throw Error('collector-arguments-invalid');out[args[i].slice(2)]=args[i+1];}return out;}
function command(program,args){return new Promise((resolve,reject)=>{const child=spawn(program,args,{windowsHide:true,stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',c=>{output+=c;if(output.length>16*1024*1024)child.kill();});child.stderr.on('data',c=>{error+=c;if(error.length>8192)child.kill();});const timer=setTimeout(()=>child.kill(),180000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error('collector-transfer-failed'));});});}
async function run(args){const o=parse(args),stateDir=path.resolve(o.state||path.join(process.env.LOCALAPPDATA||'.','RiftAssistCardSync/state'));await fs.mkdir(stateDir,{recursive:true});const unlock=await lock(path.dirname(stateDir));if(!unlock)return {status:'busy'};
 try{
  const receipt=path.join(stateDir,'transfer-status.json');try{const last=JSON.parse(await fs.readFile(receipt));if(o.force!=='true'&&last.status==='delivered'&&Date.now()-Date.parse(last.finishedAt)<86400000)return {status:'not-due'};}catch(e){if(e.code!=='ENOENT')throw e;}
  const remote=o.host,identity=o.identity,hosts=o['known-hosts'];if(!/^[a-z_][a-z0-9_-]*@(?:[a-z0-9.-]+)$/iu.test(remote||'')||!path.isAbsolute(identity||'')||!path.isAbsolute(hosts||''))throw Error('collector-ssh-configuration-invalid');
  const ssh=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','IdentitiesOnly=yes','-o','UserKnownHostsFile='+hosts,'-i',identity];
  // Fixed command, no user input interpolation except a validated SHA below.
  await command('ssh',[...ssh,remote,'sudo -n systemctl start riftassist-riftnaru-sync.service']);
  const planFile=path.join(stateDir,'plan.json');await command('scp',[...ssh,remote+':/home/azureuser/RiftAssist-v020-e06496b0/knowledge-releases/riftnaru-browser-plan.json',planFile]);const plan=JSON.parse(await fs.readFile(planFile));
  const playwright=require(o.playwright||'playwright'),result=await collectBrowser({chromium:playwright.chromium,plan,stateDir,executablePath:o.browser,headless:o.headless!=='false',progress:x=>console.log(JSON.stringify(x))});
  if(result.status!=='collected')return result;
  const file=path.join(stateDir,'export.json'),digest=A.hash(await fs.readFile(file));if(digest!==result.exportSha256)throw Error('collector-export-drift');
  await command('scp',[...ssh,file,remote+':/home/azureuser/riftassist-browser-upload/'+digest+'.json']);
  const applied=JSON.parse(await command('ssh',[...ssh,remote,'sudo -n /usr/local/sbin/riftassist-receive-browser '+digest]));
  if(!['unchanged','activated','checked-read-only'].includes(applied.status))throw Error('collector-server-validation-failed');
  const delivered={status:'delivered',finishedAt:new Date().toISOString(),sha256:digest,collected:result,applied};await atomic(receipt,delivered);return delivered;
 }finally{await unlock();}
}
if(require.main===module){const args=process.argv.slice(2);run(args).then(async r=>{const o=parse(args),dir=path.resolve(o.state||path.join(process.env.LOCALAPPDATA||'.','RiftAssistCardSync/state'));await atomic(path.join(dir,'runner-status.json'),{...r,at:new Date().toISOString()});console.log(JSON.stringify(r));if(['failed','source-blocked'].includes(r.status))process.exitCode=1;}).catch(async e=>{const error=/^[a-z][a-z0-9-]+$/u.test(e.message)?e.message:'collector-failed';try{const o=parse(args),dir=path.resolve(o.state||path.join(process.env.LOCALAPPDATA||'.','RiftAssistCardSync/state'));await fs.mkdir(dir,{recursive:true});await atomic(path.join(dir,'runner-status.json'),{status:'failed',error,at:new Date().toISOString()});}catch{}console.error(error);process.exitCode=1;});}
module.exports={parse,run,command};
