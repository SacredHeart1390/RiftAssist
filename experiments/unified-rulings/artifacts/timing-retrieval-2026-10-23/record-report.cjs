const fs=require('node:fs'),path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'../..');
const requestId='fd50205a-40fa-4394-af2a-ca96ac14e7f1';
const db=new DatabaseSync(path.join(root,'private/operations.sqlite'),{readOnly:true});
const row=db.prepare('SELECT owner FROM requests WHERE id=?').get(requestId);db.close();
if(!row)throw new Error('Original request unavailable.');
const store=require('../../releases/v0.1.7/src/operations-store').createStore(root);
try {
  const result=store.report(row.owner,{clientKey:'timing-v017-'+requestId,requestId,category:'ruling',language:'ko',tags:['wrong-answer','wrong-source','no-answer'],
    description:'사용자 채팅 제보: 빅토르 - 지도자와 신병이 아닌 위력 2 유닛 둘이 있는 기지에 유성을 사용. 유발 스킬 처리 시점을 확정할 수 없다는 답변. 저장된 10월 9일 규칙 중 158.3 및 정리/유발 조항을 검색하지 못함. 실제 요청 3건에서 대상 처리 8개 조항이 근거 예산 8개 전체를 차지했음을 로그로 확인.',
    expected:'유성의 두 피해 지시를 모두 처리한다. 처리 도중 정리는 없으며, 처리 후 정리에서 치명적 피해를 받은 두 유닛을 처치한다. 빅토르가 남아 있으므로 유발 스킬 두 개를 체인에 놓고 확정한 뒤 각각 처리한다. 반응이 없다면 기지에 위력 1 신병 토큰 둘. 근거: 158.3/158.3.a, 321, 319.5, 323.4, 142.4.b, 418.1.b, 383.2.c.2, 383.3/383.3.d, 337.3, 340.1.'});
  store.updateReport(result.id,'review','v0.1.7 운영 반영. 복합 쟁점 기본 조항/참조 조항 확장, 현재 원문 의미 확인, 누락 시 최대1회 추가 생성, 이전 자료 충돌 처리 보강. 문법7파일 및 운영 준비 상태 확인. 테스트·실제 AI 재질문 미실행이므로 해결 확정이 아닌 검토 상태로 보존.');
  fs.writeFileSync(path.join(__dirname,'report.json'),JSON.stringify({id:result.id,requestId,status:'review'},null,2)+'\n');
  console.log(JSON.stringify({id:result.id,status:'review'}));
} finally { store.close(); }
