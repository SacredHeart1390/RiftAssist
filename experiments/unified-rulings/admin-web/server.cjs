'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {openStore,dayKey}=require('./store.cjs');
function createAdmin({root,secret,health=()=>fetch('http://127.0.0.1:3001/api/health',{signal:AbortSignal.timeout(3000),headers:{'X-RiftAssist-Health-Probe':fs.readFileSync(path.join(root,'private/admin-probe.key'),'utf8').trim()}}).then(r=>{if(!r.ok)throw Error('Probe failed');return r.json();}),store=openStore(root),now=Date.now}){
 if(typeof secret!=='string'||secret.length<32)throw Error('Strong admin credential required');
 const sessions=new Map(),attempts=[],requestLimits=new Map();
 const digest=s=>crypto.createHash('sha256').update(s).digest();
 const server=http.createServer(async(req,res)=>{
  const headers={'Cache-Control':'no-store, private','Pragma':'no-cache','X-Robots-Tag':'noindex, nofollow, noarchive','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'"};
  const send=(status,value,type='application/json')=>{res.writeHead(status,{...headers,'Content-Type':type+'; charset=utf-8'});res.end(type==='application/json'?JSON.stringify(value):value);};
  try{
   if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress))return send(403,{error:'Loopback only'});
   if(!/^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host||''))return send(403,{error:'Invalid host'});
   if(req.headers.origin&&req.headers.origin!=='http://'+req.headers.host)return send(403,{error:'Invalid origin'});
   if(req.headers['sec-fetch-site']==='cross-site')return send(403,{error:'Invalid site'});
   if(req.url.length>2048)return send(414,{error:'Request too long'});
   const url=new URL(req.url,'http://localhost');
   if(req.method==='POST'&&url.pathname==='/api/login'){
    while(attempts.length&&attempts[0]<now()-60000)attempts.shift();
    if(attempts.length>=10)return send(429,{error:'잠시 후 다시 시도하세요.'});attempts.push(now());
    let body='';for await(const b of req){body+=b;if(body.length>4096)return send(413,{error:'Too large'});}
    let password;try{password=JSON.parse(body).password;}catch{return send(400,{error:'Invalid request'});}
    if(typeof password!=='string'||!crypto.timingSafeEqual(digest(password),digest(secret)))return send(401,{error:'인증 실패'});
    for(const [k,v]of sessions)if(v<now())sessions.delete(k);
    if(sessions.size>=100)sessions.delete(sessions.keys().next().value);
    const token=crypto.randomBytes(32).toString('hex');sessions.set(token,now()+8*3600000);
    res.setHeader('Set-Cookie',`riftadmin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);return send(200,{ok:true});
   }
   const token=/\briftadmin=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
   if(req.method==='POST'&&url.pathname==='/api/logout'){sessions.delete(token);res.setHeader('Set-Cookie','riftadmin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send(200,{ok:true});}
   if(req.method!=='GET')return send(405,{error:'Read only'});
   if(url.pathname.startsWith('/api/')){
    if(!token||!(sessions.get(token)>now()))return send(401,{error:'관리자 로그인이 필요합니다.'});

    if(url.pathname==='/api/requests'||url.pathname.startsWith('/api/requests/')){
     let rate=requestLimits.get(token);if(!rate||rate.until<=now()){rate={count:0,until:now()+60000};requestLimits.set(token,rate);}
     for(const key of requestLimits.keys())if(!sessions.has(key)||sessions.get(key)<=now())requestLimits.delete(key);
     if(++rate.count>30){res.setHeader('Retry-After',String(Math.max(1,Math.ceil((rate.until-now())/1000))));return send(429,{error:'조회 요청이 많습니다. 잠시 후 다시 시도하세요.'});}
     if(url.pathname==='/api/requests'){
      const query=Object.create(null);for(const [k,v]of url.searchParams){if(Object.hasOwn(query,k))return send(400,{error:'중복 필터입니다.'});query[k]=v;}
      try{return send(200,store.requests(query));}catch{return send(400,{error:'조회 조건을 확인하세요. 기본 20건·최대 50건이며 기록이 많으면 날짜를 좁혀 주세요.'});}
     }
     const id=url.pathname.slice('/api/requests/'.length);if(!/^[a-zA-Z0-9-]{1,80}$/.test(id)||url.search)return send(400,{error:'잘못된 요청 번호입니다.'});
     const data=store.requestDetail(id);return send(data?200:404,data||{error:'보관 중인 요청이 없습니다.'});
    }
    if(url.pathname==='/api/overview'){let state;try{const h=await health();state={ok:h.ok,version:h.version,environment:h.environment,providerMode:h.providerMode,model:h.model,cards:h.cardCatalog?.total};}catch{state={ok:false};}return send(200,{state,today:store.usage(dayKey(now()),dayKey(now()))});}
    if(url.pathname==='/api/usage'){try{return send(200,store.usage(url.searchParams.get('from'),url.searchParams.get('to')));}catch{return send(400,{error:'조회 기간을 확인하세요 (최대 31일).'});}}
    if(url.pathname==='/api/reports'){try{return send(200,store.reports({day:url.searchParams.get('day')||'',unresolved:url.searchParams.get('unresolved')==='1',search:url.searchParams.get('search')||'',offset:url.searchParams.get('offset'),status:url.searchParams.get('status')||'',category:url.searchParams.get('category')||''}));}catch{return send(400,{error:'필터를 확인하세요.'});}}
    if(/^\/api\/reports\/[a-zA-Z0-9-]{1,80}$/.test(url.pathname)){const data=store.detail(url.pathname.split('/').pop());return send(data?200:404,data||{error:'보존된 제보가 없습니다.'});}
    return send(404,{error:'Not found'});
   }
   const files={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
   const file=files[url.pathname];if(!file)return send(404,{error:'Not found'});
   send(200,fs.readFileSync(path.join(__dirname,...file.slice(0,1)),'utf8'),file[1]);
  }catch{send(500,{error:'조회에 실패했습니다. 서버 상태를 확인하세요.'});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 server.on('close',()=>store.close());return server;
}
if(require.main===module){const root=process.env.RIFTASSI_DATA_ROOT;if(!root)throw Error('Data root required');const secret=fs.readFileSync(process.env.RIFTASSI_ADMIN_KEY,'utf8').trim();const app=createAdmin({root,secret});app.listen(8765,'127.0.0.1',()=>console.log('Read-only admin listening on 127.0.0.1:8765'));for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>app.close(()=>process.exit(0)));}
module.exports={createAdmin};
