'use strict';
// Fixed .env only; never print values, evaluate shell syntax or accept caller-supplied paths.
const fs=require('node:fs'),path=require('node:path'),P=require('./protocol.cjs');
const copy=new Set(['OPENAI_API_KEY','OPENAI_MODEL','OPENAI_REASONING_EFFORT','OPENAI_MAX_OUTPUT_TOKENS','OPENAI_GENERATION_ENABLED','RIFTASSI_EXTERNAL_MODE','RIFTASSI_ALLOW_EXTERNAL_CALLS']);
const controlled=new Set(['PORT','APP_PORT','MANAGER_PORT','PUBLIC_PORT','PUBLIC_ORIGIN','APP_RELEASE_ID','RIFTASSI_DATA_ROOT','RIFTASSI_PDFJS_PATH','LOG_CONTENT']);
function parse(bytes){
  if(!Buffer.isBuffer(bytes)||bytes.length>65536)P.fail('runtime-config-size');
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{P.fail('runtime-config-format');}
  const values={},seen=new Set();let rebound=0,unsupported=0;
  for(const row of text.split(/\r?\n/)){const line=row.trim();if(!line||line.startsWith('#'))continue;const m=/^([A-Z_][A-Z_0-9]*)\s*=\s*(.*)$/.exec(line);if(!m||seen.has(m[1]))P.fail('runtime-config-format');seen.add(m[1]);let value=m[2];
    if((value.startsWith('"')&&value.endsWith('"'))||(value.startsWith("'")&&value.endsWith("'")))value=value.slice(1,-1);
    if(/[\x00-\x1f\x7f]/.test(value)||value.length>1024)P.fail('runtime-config-format');
    if(controlled.has(m[1])){rebound++;continue;}if(!copy.has(m[1])){unsupported++;continue;}
    if(m[1].endsWith('ENABLED')||m[1]==='RIFTASSI_ALLOW_EXTERNAL_CALLS'){if(!['true','false'].includes(value))P.fail('runtime-config-format');}
    if(m[1]==='OPENAI_MAX_OUTPUT_TOKENS'&&(!/^\d+$/.test(value)||Number(value)<1024||Number(value)>16000))P.fail('runtime-config-format');
    if(m[1]==='OPENAI_MODEL'&&!/^[A-Za-z0-9_.:-]{1,120}$/.test(value))P.fail('runtime-config-format');
    if(m[1]==='OPENAI_REASONING_EFFORT'&&!['none','minimal','low','medium','high','xhigh'].includes(value))P.fail('runtime-config-format');
    if(m[1]==='RIFTASSI_EXTERNAL_MODE'&&!['live','mock','test'].includes(value))P.fail('runtime-config-format');
    if(m[1]==='OPENAI_API_KEY'&&!/^[A-Za-z0-9_-]{8,512}$/.test(value))P.fail('runtime-config-format');values[m[1]]=value;
  }
  return{values,rebound,unsupported};
}
function read(data){const file=path.join(data,'.env');P.noLinks(file,true);if(!fs.existsSync(file))return null;if(fs.statSync(file).size>65536)P.fail('runtime-config-size');return fs.readFileSync(file);}
function report(bytes){if(bytes===null)return{present:false,validated:true,copiedSettings:0,reboundSettings:0,unsupportedSettings:0,requiresReview:false};try{const p=parse(bytes);return{present:true,validated:true,copiedSettings:Object.keys(p.values).length,reboundSettings:p.rebound,unsupportedSettings:p.unsupported,requiresReview:p.unsupported>0};}catch{return{present:true,validated:false,requiresReview:true};}}
function restore(data,encoded){if(encoded===undefined)return{restored:false};const file=path.join(data,'.env');P.noLinks(file,true);if(fs.existsSync(file))P.fail('retained-runtime-config');const bytes=Buffer.from(encoded,'base64');try{const p=parse(bytes);if(p.unsupported)P.fail('runtime-config-review-required');const text=Object.entries(p.values).map(([k,v])=>k+'='+v).join('\n')+'\n';const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return{restored:true,copiedSettings:Object.keys(p.values).length,reboundSettings:p.rebound};}finally{bytes.fill(0);}}
function launchEnvironment(data,inherited){const bytes=read(data);if(!bytes)return{...inherited};try{const p=parse(bytes);if(p.unsupported)P.fail('runtime-config-review-required');return{...p.values,...inherited};}finally{bytes.fill(0);}}
function providerEnvironment(data,inherited,{aiEnabled,liveProviderApproved=false}){
  const env=launchEnvironment(data,inherited);
  if(liveProviderApproved){env.RIFTASSI_EXTERNAL_MODE='live';env.RIFTASSI_ALLOW_EXTERNAL_CALLS='true';}
  if(aiEnabled&&env.OPENAI_GENERATION_ENABLED==='true'&&(env.RIFTASSI_EXTERNAL_MODE!=='live'||env.RIFTASSI_ALLOW_EXTERNAL_CALLS!=='true'||!env.OPENAI_API_KEY))P.fail('provider-activation-not-approved');
  return env;
}
module.exports={read,parse,report,restore,launchEnvironment,providerEnvironment};
