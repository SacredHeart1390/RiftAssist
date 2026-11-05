'use strict';
// Isolated integration fixture: actual Node/Caddy processes, simulated systemd supervision.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile);
const {within,fail}=require('./protocol.cjs');
class ProcessController {
  constructor(config){this.config=config;this.children=new Map();this.actualSystemd=false;}
  async inspect(slot){if(!['a','b','proxy'].includes(slot))fail('slot');}
  env(){return{PATH:'/usr/bin:/bin',HOME:within(this.config.root,'proxy'),XDG_DATA_HOME:within(this.config.root,'proxy','data'),XDG_CONFIG_HOME:within(this.config.root,'proxy','config'),...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})};}
  async validate(file){try{await execFile(this.config.caddy,['validate','--config',file,'--adapter','caddyfile'],{env:this.env(),maxBuffer:32768,...(process.platform!=='win32'&&process.geteuid()===0?{uid:this.config.appUid,gid:this.config.appGid}:{})});}catch{fail('caddy-validation');}}
  async command(action,slot){
    if(!['a','b','proxy'].includes(slot)||!['start','stop','reload'].includes(action))fail('system-command');
    if(action==='reload'){if(slot!=='proxy')fail('system-command');try{await execFile(this.config.caddy,['reload','--config',within(this.config.root,'proxy','Caddyfile'),'--adapter','caddyfile','--address','127.0.0.1:'+this.config.proxyAdminPort],{env:this.env(),maxBuffer:32768,...(process.platform!=='win32'&&process.geteuid()===0?{uid:this.config.appUid,gid:this.config.appGid}:{})});}catch{fail('caddy-reload');}return;}
    const old=this.children.get(slot);
    if(action==='stop'){
      if(!old||old.exitCode!==null)return;const closed=new Promise(resolve=>old.once('exit',resolve));old.kill('SIGTERM');
      const timer=setTimeout(()=>old.kill('SIGKILL'),10000);await closed;clearTimeout(timer);return;
    }
    if(old&&old.exitCode===null)return;
    const args=slot==='proxy'?['run','--config',within(this.config.root,'proxy','Caddyfile'),'--adapter','caddyfile']:
      ['--require',path.join(__dirname,'mock-legacy.cjs'),path.join(__dirname,'runner.cjs'),within(this.config.root,'launch',slot+'.json')];
    const child=spawn(slot==='proxy'?this.config.caddy:this.config.node,args,{env:this.env(),stdio:['ignore','ignore','ignore'],windowsHide:true,
      ...(process.platform!=='win32'&&process.geteuid()===0?{uid:this.config.appUid,gid:this.config.appGid}:{})});
    child.on('error',()=>{});this.children.set(slot,child);
  }
  async close(){for(const slot of ['proxy','b','a'])await this.command('stop',slot);}
}
module.exports={ProcessController};
