// Preserve repair evidence under the existing encrypted report's 90-day retention.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
const check=JSON.parse(fs.readFileSync(path.join(__dirname,'answer-check.json'))),deployment=JSON.parse(fs.readFileSync(path.join(__dirname,'deployment.json')));
assert.equal(deployment.after.appHost.releaseId,'v0.1.5');assert.equal(check.results.length,2);
const db=new DatabaseSync(path.join(root,'private/operations.sqlite')),key=fs.readFileSync(path.join(root,'private/storage.key'));
db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
const seal=value=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),b=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64');};
const unseal=value=>{if(!value)return null;const b=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8'));};
const results=[];
try{
  db.exec('BEGIN IMMEDIATE');
  for(const item of check.results){
    assert(Object.values(item.checks).every(Boolean));
    const report=db.prepare('SELECT * FROM reports WHERE id=?').get(item.reportId),content=unseal(report.content),request=db.prepare('SELECT * FROM requests WHERE id=?').get(item.requestId);
    const response=unseal(request.response),trace=unseal(request.trace);
    assert.equal(response.status,'ruling-generated');assert.equal(trace.promptVersion,'actionable-resolution-3');
    const now=Date.now();
    if(content.repairVerification?.requestId!==item.requestId){
      content.repairVerification={verifiedAt:new Date(now).toISOString(),releaseId:'v0.1.5',requestId:item.requestId,response,trace,checks:item.checks,scope:'Two reported situations plus local retrieval checks; not a guarantee for all future rulings.'};
      db.prepare('UPDATE reports SET content=?,status=?,updated=? WHERE id=?').run(seal(content),'resolved',now,item.reportId);
      const note=`v0.1.5 운영 적용 및 해당 문항 실제 AI 답변 확인 완료.\n${response.recommendation}\n처리: ${(response.resolutionSteps||[]).join(' → ')}\n인용: ${(response.citedRuleIds||[]).join(', ')}\n검증 요청: ${item.requestId}\n원래 오류 기록/첨부 원문은 그대로 보존하고 검증 답변·검색 기록을 제보에 추가 보존. 검증 범위는 이번 사례이며 이후 제보는 계속 확인합니다.`;
      assert(note.length<=3000);db.prepare('INSERT INTO report_history(report_id,at,status,note) VALUES (?,?,?,?)').run(item.reportId,now,'resolved',seal(note));
    }
    results.push({reportId:item.reportId,requestId:item.requestId,status:'resolved',inputTokens:trace.inputTokens,outputTokens:trace.outputTokens,citedCaseIds:response.citedCaseIds});
  }
  db.exec('COMMIT');
  fs.writeFileSync(path.join(__dirname,'completed.json'),JSON.stringify({at:new Date().toISOString(),reports:results,totalInputTokens:results.reduce((s,r)=>s+r.inputTokens,0),totalOutputTokens:results.reduce((s,r)=>s+r.outputTokens,0)},null,2)+'\n');
  console.log(JSON.stringify(results));
}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}finally{db.close();}
