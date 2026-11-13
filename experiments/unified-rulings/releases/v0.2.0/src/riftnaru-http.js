const {setTimeout:sleep}=require('node:timers/promises');
class SourceError extends Error{constructor(code,details={}){super(code);Object.assign(this,details);this.code=code;}}
function retryAt(value,now=Date.now()){if(/^\d+$/u.test(value||''))return now+Math.max(1,Number(value))*1000;const date=Date.parse(value);return Number.isFinite(date)?Math.max(now+1000,date):now+86400000;}
function createHttp({fetchImpl=fetch,now=Date.now,pause=sleep,intervalMs=4000,timeoutMs=20000,maxBytes=8*1024*1024,onCooldown=async()=>{}}={}){
 let last=0,requests=0;const stats=()=>({requests});
 async function request(url,{cache=null,image=false}={}){
  const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port||(!image&&u.origin!=='https://www.riftnaru.com')||image&&!['media.riftnaru.com','cmsassets.rgpub.io'].includes(u.hostname))throw new SourceError('source-url-restricted');
  for(let attempt=0;attempt<2;attempt++){
   await pause(Math.max(0,last+intervalMs-now()));last=now();requests++;
   let response;
   try{response=await fetchImpl(url,{method:image?'HEAD':'GET',redirect:'error',signal:AbortSignal.timeout(timeoutMs),headers:{'User-Agent':'RiftAssistCatalogSync/0.2.5 (+https://riftassistant.app)',Accept:image?'image/*':'text/html,application/json,text/plain',...(cache?.etag?{'If-None-Match':cache.etag}:{}),...(cache?.lastModified?{'If-Modified-Since':cache.lastModified}:{})}});}
   catch{if(attempt===0){await pause(3000);continue;}throw new SourceError('source-network-timeout');}
   if([401,403,429].includes(response.status)){
    const until=response.status===429?retryAt(response.headers.get('retry-after'),now()):now()+86400000;
    await onCooldown(until,response.status);await response.body?.cancel();throw new SourceError(response.status===429?'source-rate-limited':'source-access-denied',{status:response.status,retryAt:until});
   }
   if(response.status===304){if(!cache?.body)throw new SourceError('source-invalid-304');return {...cache,status:304};}
   if(response.status>=500&&attempt===0){await response.body?.cancel();await pause(3000);continue;}
   if(!response.ok){await response.body?.cancel();throw new SourceError('source-http-error',{status:response.status});}
   const type=response.headers.get('content-type')||'';
   if(image){if(!type.startsWith('image/'))throw new SourceError('source-image-invalid');return {status:response.status,type};}
   if(Number(response.headers.get('content-length')||0)>maxBytes){await response.body?.cancel();throw new SourceError('source-size-limit');}
   const reader=response.body.getReader();let size=0,parts=[];try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw new SourceError('source-size-limit');parts.push(Buffer.from(value));}}finally{await reader.cancel();}
   const body=Buffer.concat(parts).toString('utf8');if(/Vercel Security Checkpoint|captcha|sign in to continue/iu.test(body.slice(0,30000))){await onCooldown(now()+86400000,403);throw new SourceError('source-authentication-required',{retryAt:now()+86400000});}
   return {body,type,status:response.status,etag:response.headers.get('etag'),lastModified:response.headers.get('last-modified')};
  }
  throw new SourceError('source-http-error');
 }
 return {request,stats};
}
// Honor publicly provided robots restrictions; unavailable/challenge robots is not permission.
function allowsRobots(text,pathname){
 let agents=[],rules=[],groups=[];for(const raw of text.split(/\r?\n/u)){const line=raw.split('#')[0].trim(),m=/^(user-agent|allow|disallow)\s*:\s*(.*)$/iu.exec(line);if(!m)continue;const key=m[1].toLowerCase(),value=m[2].trim();if(key==='user-agent'){if(rules.length){groups.push({agents,rules});agents=[];rules=[];}agents.push(value.toLowerCase());}else if(agents.length&&value)rules.push({allow:key==='allow',path:value});}if(agents.length)groups.push({agents,rules});
 const exact=groups.filter(g=>g.agents.some(a=>a!=='*'&&'riftassistcatalogsync'.includes(a))),applicable=exact.length?exact:groups.filter(g=>g.agents.includes('*'));
 const matches=applicable.flatMap(g=>g.rules).filter(r=>new RegExp('^'+r.path.replace(/[.+?^${}()|[\]\\]/gu,'\\$&').replace(/\*/gu,'.*').replace(/\\\$$/u,'$')).test(pathname)).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));return !matches.length||matches[0].allow;
}
module.exports={createHttp,retryAt,SourceError,allowsRobots};
