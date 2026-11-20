'use strict';
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DAY=86400000;
const dayKey=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
function bounds(day){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Invalid date');
 const start=Date.parse(day+'T00:00:00+09:00');
 if(!Number.isFinite(start)||dayKey(start)!==day)throw Error('Invalid date');
 return [start,start+DAY];
}
function openStore(root,clock=Date.now){
 const key=fs.readFileSync(path.join(root,'private/storage.key'));
 if(key.length!==32)throw Error('Invalid storage key');
 const db=new DatabaseSync(path.join(root,'private/operations.sqlite'),{readOnly:true});
 db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1500;');
 // No createStore import: that writer migrates, purges and checkpoints the production DB.
 const unseal=value=>{if(!value)return null;const b=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'));};
 const read=fn=>{db.exec('BEGIN');try{return fn();}finally{db.exec('ROLLBACK');}};
 function usage(from,to){return read(()=>{
  const [start]=bounds(from),[,end]=bounds(to);if(end<=start||end-start>31*DAY)throw Error('Invalid range');
  const cutoff=clock()-30*DAY;
  const rows=db.prepare('SELECT created,status,trace FROM requests WHERE created>=? AND created<? ORDER BY created').all(Math.max(start,cutoff),end);
  const calls=db.prepare('SELECT created,kind,finished,input_tokens,output_tokens,error FROM calls WHERE created>=? AND created<?').all(Math.max(start,cutoff),end);
  const days=[];for(let t=start;t<end;t+=DAY)days.push({day:dayKey(t),questions:0,processed:0,failed:0,pending:0,noApi:0,ruleBased:0,aiCalls:0,callErrors:0,answer:0,translation:0,inputTokens:0,outputTokens:0,usageUnknown:0,localRejected:0,newReports:0,newSessions:0});
  const byDay=new Map(days.map(d=>[d.day,d]));
  for(const r of rows){const d=byDay.get(dayKey(r.created));d.questions++;
   if(['failed','server-error','error'].includes(r.status))d.failed++;else if(r.status==='processing')d.pending++;else d.processed++;
   if(r.trace){const trace=unseal(r.trace);if(r.status!=='processing'&&trace.aiUsed===false&&!(trace.generationAttempts||[]).length)d.noApi++;}
   if(r.status==='regional-ban')d.ruleBased++;
  }
  for(const c of calls){const d=byDay.get(dayKey(c.created));
   // These two generation errors occur before fetch; reservations are not API calls.
   if(['input_budget_exceeded','request_deadline'].includes(c.error)){d.localRejected++;continue;}
   d.aiCalls++;if(c.kind==='answer')d.answer++;if(c.kind==='translation')d.translation++;
   if(c.error)d.callErrors++;
   d.inputTokens+=c.input_tokens??0;d.outputTokens+=c.output_tokens??0;
   if(c.input_tokens==null||c.output_tokens==null)d.usageUnknown++;
  }
  for(const r of db.prepare('SELECT created FROM reports WHERE created>=? AND created<?').all(Math.max(start,clock()-90*DAY),end))byDay.get(dayKey(r.created)).newReports++;
  for(const s of db.prepare('SELECT day,count FROM session_counts WHERE day>=? AND day<=?').all(from,to))if(byDay.has(s.day))byDay.get(s.day).newSessions=s.count;
  const totals={};for(const d of days)for(const [k,v]of Object.entries(d))if(k!=='day')totals[k]=(totals[k]||0)+v;
  const unresolved=db.prepare("SELECT count(*) AS n FROM reports WHERE created>=? AND status NOT IN ('resolved','duplicate')").get(clock()-90*DAY).n;
  return {from,to,timezone:'Asia/Seoul',days,totals,unresolved,retainedFrom:new Date(cutoff).toISOString(),notice:'질문·호출 메타데이터 30일. API 호출은 기록된 전송 시도이며 공급자 수신·청구 확정값이 아닙니다. 토큰 미확인 호출은 합계에서 제외됩니다.'};
 });}
 function reports({day='',unresolved=false,search='',offset=0,status='',category=''}={}){
  const clauses=['created>=?'],args=[clock()-90*DAY];
  if(day){const [a,b]=bounds(day);clauses.push('created>=? AND created<?');args.push(a,b);}
  if(unresolved)clauses.push("status NOT IN ('resolved','duplicate')");
  if(status){clauses.push('status=?');args.push(status);}
  if(category){clauses.push('category=?');args.push(category);}
  if(search){clauses.push('instr(id,?)>0');args.push(String(search).slice(0,80));}
  const where=clauses.join(' AND ');offset=Math.max(0,Math.min(100000,Number(offset)||0));
  return read(()=>({total:db.prepare('SELECT count(*) AS n FROM reports WHERE '+where).get(...args).n,
   items:db.prepare('SELECT id,request_id,created,updated,category,status FROM reports WHERE '+where+' ORDER BY created DESC LIMIT 100 OFFSET ?').all(...args,offset),offset}));
 }
 function detail(id){return read(()=>{
  const r=db.prepare('SELECT id,request_id,created,updated,category,status,content,snapshot FROM reports WHERE id=? AND created>=?').get(id,clock()-90*DAY);
  if(!r)return null;
  let snapshot=unseal(r.snapshot),origin=snapshot?'report-snapshot':null;
  if(!snapshot&&r.request_id){const q=db.prepare('SELECT id,created,status,question,response,trace FROM requests WHERE id=? AND created>=?').get(r.request_id,clock()-7*DAY);
   if(q){snapshot={id:q.id,created:q.created,status:q.status,question:unseal(q.question),response:unseal(q.response),trace:unseal(q.trace)};origin='request';}}
  return {...r,content:unseal(r.content),snapshot,origin,missing:snapshot?null:'연결된 질문·답변 기록이 없습니다. 보존 기간이 지났거나 연결 없이 접수됐습니다.',history:db.prepare('SELECT at,status,note FROM report_history WHERE report_id=? ORDER BY id').all(id).map(h=>({...h,note:unseal(h.note)}))};
 });}

 // Requests use the existing encrypted store. No migration, writes, or snapshot recovery.
 const failedStates=['failed','server-error','error','model-error','retrieval-error','insufficient-evidence'];
 const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(id);
 const decode=value=>{try{return {value:unseal(value),error:false};}catch{return {value:null,error:true};}};
 const fields=(object,names)=>Object.fromEntries(names.filter(k=>object&&Object.hasOwn(object,k)).map(k=>[k,object[k]]));
 function flags(trace,status){
  const attempts=Array.isArray(trace?.generationAttempts)?trace.generationAttempts:[];
  const sent=attempts.some(a=>!['input_budget_exceeded','request_deadline'].includes(a.error));
  const aiState=sent||trace?.aiUsed===true?'used':trace?.aiUsed===false||attempts.length?'unused':'unknown';
  return {aiState,ruleBased:status==='regional-ban'||trace?.ruleBased===true,outcome:status==='processing'?'processing':failedStates.includes(status)?'failed':'success'};
 }
 function options(value={}){
  if(Object.keys(value).some(k=>!['day','range','status','ai','offset','limit'].includes(k)))throw Error('Invalid filter');
  const {day='',range='7',status='',ai='',offset='0',limit='20'}=value;
  if(!['7','30'].includes(String(range))||!['','success','failed','processing'].includes(status)||!['','used','unused','unknown'].includes(ai))throw Error('Invalid filter');
  const integer=(v,min,max)=>{if(!/^\d{1,6}$/.test(String(v))||Number(v)<min||Number(v)>max)throw Error('Invalid page');return Number(v);};
  let end=clock()+1,start=clock()-Number(range)*DAY;if(day)[start,end]=bounds(day);
  return {start:Math.max(start,clock()-30*DAY),end,status,ai,offset:integer(offset,0,100000),limit:integer(limit,1,50)};
 }
 function requests(filters={}){const o=options(filters);return read(()=>{
  const clauses=['created>=?','created<?'],args=[o.start,o.end];
  if(o.status==='processing')clauses.push("status='processing'");
  if(o.status==='failed'||o.status==='success'){clauses.push('status '+(o.status==='success'?'NOT ':'')+'IN ('+failedStates.map(()=>'?').join(',')+")"+(o.status==='success'?" AND status<>'processing'":''));args.push(...failedStates);}
  // Encrypted API flags cannot be filtered in SQL; bound work and require a narrower date if necessary.
  const rows=db.prepare('SELECT id,created,status,trace FROM requests WHERE '+clauses.join(' AND ')+' ORDER BY created DESC,id DESC LIMIT 5001').all(...args);
  if(rows.length>5000)throw Error('Narrow date range');
  const matched=rows.map(r=>{const t=decode(r.trace);return {id:r.id,created:r.created,status:r.status,...flags(t.value,r.status),traceReadable:!t.error};}).filter(r=>!o.ai||r.aiState===o.ai);
  const items=matched.slice(o.offset,o.offset+o.limit).map(r=>{
   const recent=r.created>=clock()-7*DAY,q=recent?decode(db.prepare('SELECT question FROM requests WHERE id=?').get(r.id).question):{value:null,error:false};
   const reportCount=db.prepare('SELECT count(*) n FROM reports WHERE request_id=? AND created>=?').get(r.id,clock()-90*DAY).n;
   return {...r,preview:typeof q.value==='string'?q.value.slice(0,160):null,contentState:!recent?'expired':q.error?'decryption-error':q.value==null?'missing':'retained',reportCount};
  });
  return {items,total:matched.length,offset:o.offset,limit:o.limit,timezone:'Asia/Seoul',retention:{bodyDays:7,metadataDays:30},notice:'API 사용은 저장된 전송 시도 기준입니다. 공급자 수신·청구 여부를 확정하지 않습니다.'};
 });}
 function requestDetail(id){if(!validId(id))throw Error('Invalid ID');return read(()=>{
  const row=db.prepare('SELECT id,owner,created,status,question,response,trace FROM requests WHERE id=? AND created>=?').get(id,clock()-30*DAY);if(!row)return null;
  const recent=row.created>=clock()-7*DAY,t=decode(row.trace),q=recent?decode(row.question):{value:null,error:false},a=recent?decode(row.response):{value:null,error:false},trace=t.value||{};
  const attempts=Array.isArray(trace.generationAttempts)?trace.generationAttempts:[];
  const calls=[],seen=new Set();for(const attempt of attempts){if(!validId(attempt.callId)||seen.has(attempt.callId))continue;seen.add(attempt.callId);
   const call=db.prepare('SELECT id,kind,created,finished,input_tokens,output_tokens,error FROM calls WHERE id=? AND owner=? AND created>=?').get(attempt.callId,row.owner,clock()-30*DAY);
   if(call)calls.push({...call,diagnostic:fields(attempt.diagnostic,['stage','httpStatus','providerRequestId','networkCode','responseStatus','incompleteReason']),
     reasoningTokens:Number.isInteger(attempt.usage?.output_tokens_details?.reasoning_tokens)?attempt.usage.output_tokens_details.reasoning_tokens:null});
  }
  const count=v=>Number.isFinite(v)&&v>=0?v:null;
  const tokens=(key,column)=>count(trace[key])??(calls.length&&calls.length===seen.size&&calls.every(c=>count(c[column])!==null)?calls.reduce((n,c)=>n+c[column],0):null);
  const metadata=fields(trace,['category','language','knowledgeReleaseId','cardCatalogVersion','aiModel','modelError','code','blockedByCards','blockedByEvidence','durationMs','promptVersion','retrievalPolicy','ruleVersions','citedRuleIds','citedCaseIds','citedCardIds','evidenceIds','judgeCaseIds','unresolvedCardIds']);
  const cardIds=[...new Set([...(trace.cardReferences||[]).map(c=>c.id),...(trace.citedCardIds||[]),...(a.value?.cards||[]).map(c=>c.id)].filter(v=>typeof v==='string'))];
  return {id:row.id,created:row.created,status:row.status,...flags(t.value,row.status),contentState:!recent?'expired':q.error||a.error?'decryption-error':q.value==null&&a.value==null?'missing':'retained',question:q.value,response:fields(a.value,['requestId','status','category','language','recommendation','reasoning','resolutionSteps','followUpQuestions','error','confidence','requiresJudge','citedRuleIds','citedCaseIds','citedCardIds','evidence','judgeCases','cards','sources','sourceUrls','regionalBan','knowledgeReleaseId','cardCatalogVersion','ai','notice']),metadata,cardIds,
   processing:{inputTokens:tokens('inputTokens','input_tokens'),outputTokens:tokens('outputTokens','output_tokens'),tokenSource:count(trace.inputTokens)!==null||count(trace.outputTokens)!==null?'trace':calls.length?'explicit-call-id':'unavailable',calls,callLinkState:calls.length===0?'unavailable':calls.length===seen.size?'explicit-call-id':'partial',traceReadable:!t.error},
   relatedReports:db.prepare('SELECT id,created,status,category FROM reports WHERE request_id=? AND created>=? ORDER BY created DESC,id DESC LIMIT 50').all(id,clock()-90*DAY),relatedReportCount:db.prepare('SELECT count(*) n FROM reports WHERE request_id=? AND created>=?').get(id,clock()-90*DAY).n,
   notice:recent?'저장된 최종 답변과 처리 정보입니다. 내부 사고 과정은 제공하지 않습니다.':'본문 보관 기간이 지나 메타데이터만 표시합니다. 제보 사본·백업·검색어에서 본문을 복원하지 않습니다.'};
 });}

 return {usage,reports,detail,requests,requestDetail,close:()=>db.close()};
}
module.exports={openStore,dayKey,bounds};
