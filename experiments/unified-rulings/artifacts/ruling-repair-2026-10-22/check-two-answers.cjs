// Two user-reported questions only. Uses the normal budget/logging path; no retries.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const root=path.resolve(__dirname,'../..'),release=path.join(root,'releases/v0.1.5');
const outputFile=path.join(__dirname,'answer-check.json');
if(fs.existsSync(outputFile))throw Error('Answer check already recorded; inspect it before authorizing another paid run.');
const {createStore}=require(path.join(release,'src/operations-store'));
const store=createStore(root),reports=JSON.parse(fs.readFileSync(path.join(__dirname,'reports.json'))).reports;
const snapshots=reports.map(r=>store.reportDetail(r.id).snapshot);
const base='http://127.0.0.1:3013',results=[];
let child,log;
(async()=>{
  log=fs.openSync(path.join(root,'tmp/ruling-check-worker.log'),'a');
  child=fork(path.join(release,'src/server.js'),[],{cwd:root,windowsHide:true,stdio:['ignore',log,log,'ipc'],env:{...process.env,RIFTASSI_DATA_ROOT:root,PORT:'3013',PUBLIC_PORT:'3013',PUBLIC_ORIGIN:'',APP_RELEASE_ID:'v0.1.5',LOG_CONTENT:'false'}});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Staging readiness timeout')),25000);child.once('error',reject);child.once('exit',()=>reject(Error('Staging worker exited')));child.on('message',m=>{if(m.type==='ready'){clearTimeout(timer);resolve();}});});
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);const cookie=health.headers.get('set-cookie').split(';')[0];const state=await health.json();assert.equal(state.version,'0.1.5');
  for(let i=0;i<snapshots.length;i++){
    const old=snapshots[i];
    const response=await fetch(base+'/api/ask',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({clientKey:crypto.randomUUID(),question:old.question,language:'ko',cardIds:old.response.cards.map(c=>c.id)}),signal:AbortSignal.timeout(65000)});
    const answer=await response.json();
    const combined=[answer.recommendation,answer.reasoning,...(answer.resolutionSteps||[])].join(' ');
    const checks={http:response.status===200,generated:answer.status==='ruling-generated'&&answer.ai?.used===true,steps:(answer.resolutionSteps?.length||0)>0,noUnneededQuestions:answer.followUpQuestions?.length===0,noJudgeReferral:!/(?:저지|심판)에게\s*(?:확인|문의|물어)/u.test(combined)};
    if(i===0){checks.decisiveClause=answer.citedRuleIds?.includes('core-rules:472');checks.noExtraPoint=/없|않|못/u.test(answer.recommendation);}
    else {checks.targetLock=answer.citedRuleIds?.includes('core-rules:355.15');checks.partialResolution=answer.citedRuleIds?.some(id=>/^core-rules:359\.3\.e\.(?:1|2|5|7|8)$/.test(id));checks.remainingDamage=/3\s*피해|피해\s*3/u.test(combined)&&/남|나머지|다른/u.test(combined);checks.fullRetreat=/룬/u.test(combined)&&/소진|exhaust/u.test(combined);}
    results.push({reportId:reports[i].id,requestId:answer.requestId,status:answer.status,checks,citedRuleIds:answer.citedRuleIds,citedCaseIds:answer.citedCaseIds,stepCount:answer.resolutionSteps?.length||0});
    fs.writeFileSync(outputFile,JSON.stringify({createdAt:new Date().toISOString(),intendedCalls:2,completed:results.length,results},null,2)+'\n');
    if(answer.requestId)store.updateReport(reports[i].id,'review',`v0.1.5 별도 작업서버 검증 요청 ${answer.requestId}. 자동 확인: ${JSON.stringify(checks)}. 실제 답변 및 근거는 해당 요청에 기록. 운영 적용 전 내용 검토 중.`);
    console.log(JSON.stringify({case:i+1,requestId:answer.requestId,checks,recommendation:answer.recommendation,resolutionSteps:answer.resolutionSteps,reasoning:answer.reasoning}));
    assert(Object.values(checks).every(Boolean),'Answer checks failed; inspect output before deployment.');
  }
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{
  if(child&&child.exitCode===null){await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},10000);child.once('exit',()=>{clearTimeout(timer);resolve();});if(child.connected)child.send({type:'shutdown'});else child.kill();});}
  if(log!==undefined)fs.closeSync(log);store.close();
});
