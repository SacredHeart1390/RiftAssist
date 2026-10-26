const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..'),next=path.join(root,'releases/v0.1.5');
const {createStore}=require(path.join(next,'src/operations-store'));
const store=createStore(root), reports=JSON.parse(fs.readFileSync(path.join(__dirname,'reports.json'))).reports;
const snapshots=reports.map(r=>store.reportDetail(r.id).snapshot);store.close();
const pointer=JSON.parse(fs.readFileSync(path.join(root,'knowledge-releases/active.json')));
const data=path.join(root,'knowledge-releases',pointer.releaseId),rules=JSON.parse(fs.readFileSync(path.join(data,'rules.json')));
const catalog=require(path.join(next,'src/cards')).normalizeCatalog(JSON.parse(fs.readFileSync(path.join(data,'cards.json'))));
const cards=require(path.join(next,'src/cards'));
const retrieval=require(path.join(next,'src/retrieval')),index=retrieval.buildIndex(rules);
const judge=require(path.join(next,'src/judge-index')),judgeIndex=judge.buildJudgeIndex(JSON.parse(fs.readFileSync(path.join(data,'judge-cases.json'))));
const idsForTarget=['355.15','359.3.e.1','359.3.e.2','359.3.e.5','340.1','359.3.d','359.3.e.7','359.3.e.8'].map(id=>'core-rules:'+id);
const matrix=[
  {label:'reported-scoring',q:snapshots[0].question,required:['core-rules:472','core-rules:471.1','core-rules:471.2']},
  {label:'reported-targets',q:snapshots[1].question,cardIds:snapshots[1].response.cards.map(c=>c.id),required:idsForTarget},
  {label:'different-player',q:'내가 점거 득점한 전장을 상대가 같은 턴에 정복하면 상대도 점수를 받나요?',required:['core-rules:472']},
  {label:'different-turn',q:'지난 턴에 점거 득점한 전장을 다음 턴에 정복하면 또 점수를 얻나요?',required:['core-rules:472']},
  {label:'different-battlefield',q:'이 턴에 A 전장 점거로 득점했습니다. 다른 B 전장을 정복하면 득점하나요?',required:['core-rules:472']},
  {label:'all-targets-gone',q:'유성의 대상 두 유닛이 모두 해결 전에 패로 돌아갔습니다. 어떻게 처리하나요?',required:idsForTarget},
  {label:'board-movement',q:'대상 유닛이 해결 전에 다른 전장으로 이동했습니다. 무조건 부적법해지나요?',required:idsForTarget},
  {label:'english-retarget',q:'Can I retarget a spell on the chain after one target becomes illegal?',required:idsForTarget},
  {label:'english-scoring',q:'I held a battlefield, lost it, and conquered it again this turn. Do I score?',required:['core-rules:472']},
  {label:'combined',q:'대회 중 점거로 득점한 전장에서 유성 대상 유닛에 후퇴로 체인을 걸면 점수와 해결 처리는?',required:['core-rules:472',...idsForTarget]},
  {label:'deck-limit-preserved',q:'폐기장에 점멸 3장이 있는데 네 번째 점멸을 패에서 사용해도 되나요?',required:['core-rules:103.3.b','core-rules:103.3.e']},
];
const results=matrix.map(item=>{
  const selected=cards.resolveCards(catalog,item.cardIds||[],item.q).selected,result=retrieval.search(index,item.q,selected);
  if(item.label==='reported-targets')assert.equal(selected.length,2);
  for(const id of item.required)assert(result.evidence.some(e=>e.id===id),`${item.label}: missing ${id}`);
  assert.equal(result.trace.missingRequired.length,0,item.label);
  assert(result.evidence.length<=12,item.label);
  const cases=judge.searchJudgeIndex(judgeIndex,item.q,'',selected);
  return {label:item.label,selectedIds:result.evidence.map(e=>e.id),cardIds:selected.map(c=>c.id),caseIds:cases.map(c=>c.id),caseTopics:cases.map(c=>c.question.slice(0,150))};
});
const missingIndex=retrieval.buildIndex(rules.filter(r=>r.id!=='core-rules:472'));
assert(retrieval.search(missingIndex,snapshots[0].question).trace.missingRequired.includes('core-rules:472'));
const old=require(path.join(root,'releases/v0.1.4/src/retrieval')),oldIndex=old.buildIndex(rules);
const reproduction=snapshots.map((s,i)=>({report:reports[i].id,before:old.search(oldIndex,s.question,cards.resolveCards(catalog,s.response.cards.map(c=>c.id),s.question).selected).evidence.map(e=>e.id)}));
fs.writeFileSync(path.join(__dirname,'retrieval-check.json'),JSON.stringify({knowledgeReleaseId:pointer.releaseId,passed:matrix.length+1,reproduction,results},null,2)+'\n');
console.log(JSON.stringify({passed:matrix.length+1,reported:results.slice(0,2),combinedCount:results.find(r=>r.label==='combined').selectedIds.length}));
