'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DAY=86400000,TTL=30*DAY,MAX_DEVICES=100,GRACE=15000;
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function createTrustedDevices(directory,{secret,now=Date.now,io=fs}={}){
 if(typeof secret!=='string'||secret.length<32)throw Error('Strong authentication key required');
 directory=path.resolve(directory);io.mkdirSync(directory,{recursive:true,mode:0o700});
 const dir=io.lstatSync(directory);if(!dir.isDirectory()||dir.isSymbolicLink()||(process.platform!=='win32'&&(dir.mode&0o077)))throw Error('Private authentication directory required');
 const file=path.join(directory,'trusted-devices.json'),mac=value=>crypto.createHmac('sha256',secret).update('riftassist-admin-trust-v1\0'+value).digest('hex');
 const hash=value=>mac('token\0'+value);let records=[],failed=false;
 try{
  const stat=io.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>1500000||(process.platform!=='win32'&&(stat.mode&0o077)))throw Error('Unsafe authentication state');
  const fd=io.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));let data;try{data=JSON.parse(io.readFileSync(fd,'utf8'));}finally{io.closeSync(fd);}
  if(!data||data.version!==1||!Array.isArray(data.devices)||data.devices.length>MAX_DEVICES||!equal(data.mac,mac(JSON.stringify(data.devices))))throw Error('Invalid authentication state');
  const ids=new Set();for(const r of data.devices){if(!r||!/^[a-f0-9]{32}$/.test(r.id)||ids.has(r.id)||!/^[a-f0-9]{64}$/.test(r.hash)||!Number.isSafeInteger(r.created)||!Number.isSafeInteger(r.expires)||r.expires!==r.created+TTL||!Number.isSafeInteger(r.changed)||!Array.isArray(r.spent)||r.spent.length>128||r.spent.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('Invalid authentication record');ids.add(r.id);}
  records=data.devices;
 }catch(e){if(e.code!=='ENOENT')throw Error('Authentication state could not be verified');}
 function commit(next){
  if(failed)throw Error('Authentication storage unavailable');const tmp=path.join(directory,'.trusted-'+crypto.randomUUID()+'.tmp');let fd;
  try{fd=io.openSync(tmp,'wx',0o600);io.writeFileSync(fd,JSON.stringify({version:1,devices:next,mac:mac(JSON.stringify(next))})+'\n');io.fsyncSync(fd);io.closeSync(fd);fd=undefined;io.renameSync(tmp,file);if(process.platform!=='win32'){const d=io.openSync(directory,'r');try{io.fsyncSync(d);}finally{io.closeSync(d);}}records=next;}
  catch{failed=true;throw Error('Authentication storage unavailable');}
  finally{if(fd!==undefined)try{io.closeSync(fd);}catch{}try{io.unlinkSync(tmp);}catch{}}
 }
 function parse(token){const m=/^([a-f0-9]{32})\.([a-f0-9]{64})$/.exec(token||'');return m?{id:m[1],hash:hash(m[2])}:null;}
 function proven(token){const p=parse(token),r=p&&records.find(r=>r.id===p.id);return r&&(equal(r.hash,p.hash)||r.spent.some(h=>equal(h,p.hash)))?r:null;}
 function active(id){return !failed&&records.some(r=>r.id===id&&r.expires>now());}
 function issue(replaceToken,replaceId){
  const time=now(),raw=crypto.randomBytes(32).toString('hex'),id=crypto.randomBytes(16).toString('hex'),old=proven(replaceToken);
  const next=records.filter(r=>r.expires>time&&r.id!==old?.id&&r.id!==replaceId);if(next.length>=MAX_DEVICES)next.sort((a,b)=>a.created-b.created).shift();
  const r={id,hash:hash(raw),created:time,expires:time+TTL,changed:time,spent:[]};next.push(r);commit(next);return {token:id+'.'+raw,id,expires:r.expires};
 }
 function resume(token){
  if(failed)throw Error('Authentication storage unavailable');const p=parse(token),r=p&&records.find(r=>r.id===p.id);if(!r||r.expires<=now())return {status:'invalid'};
  if(!equal(r.hash,p.hash)){
   if(r.spent.some(h=>equal(h,p.hash))){if(now()-r.changed<=GRACE)return {status:'busy'};commit(records.filter(x=>x.id!==r.id));return {status:'replay'};}
   return {status:'invalid'};
  }
  const raw=crypto.randomBytes(32).toString('hex'),next={...r,hash:hash(raw),changed:now(),spent:[...r.spent,r.hash].slice(-128)};
  commit(records.filter(x=>x.expires>now()).map(x=>x.id===r.id?next:x));return {status:'ok',token:r.id+'.'+raw,id:r.id,expires:r.expires};
 }
 function revoke({id,token}={}){const verified=proven(token);const ids=new Set([id,verified?.id].filter(Boolean));if(records.some(r=>ids.has(r.id)))commit(records.filter(r=>!ids.has(r.id)));}
 return {issue,resume,revoke,active};
}
module.exports={createTrustedDevices,TTL,GRACE};
