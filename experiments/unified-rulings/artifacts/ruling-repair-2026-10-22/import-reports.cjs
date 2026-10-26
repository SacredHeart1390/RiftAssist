// Explicit administrator import of the user's attached report; never a public endpoint.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const input = 'C:/Users/user/.codex/attachments/a9ba0001-fca5-47e7-96a1-c433d027ef9c/맆바오류.txt';
const original = fs.readFileSync(input);
const text = original.toString('utf8');
const digest = crypto.createHash('sha256').update(original).digest('hex');
const key = fs.readFileSync(path.join(root, 'private/storage.key'));
const seal = value => { const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',key,iv); const b=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]); return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64'); };
const unseal = value => { if(!value)return null;const b=Buffer.from(value,'base64'),d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')); };
const definitions = [
  { requestId:'f4667325-246e-43b0-bab9-460292155f30', marker:'점거', title:'점거 득점 후 같은 턴 재점령: 472조 누락', expected:'같은 플레이어는 같은 턴에 같은 전장에서 점거/정복을 합쳐 한 번만 득점한다. 이미 점거로 득점했다면 상대가 점령했다가 되찾아도 추가 득점하지 않는다.', cause:'필수 득점 규칙 472, 471.1, 471.2가 검색 상위 8개에서 누락됨.' },
  { requestId:'157a6457-7139-4c19-8b12-926ecd42a033', marker:'유성', title:'유성에 후퇴 대응: 남은 대상 처리 안내 누락', expected:'새 대상을 선택하지 않는다. 후퇴를 먼저 해결해 해당 유닛을 손으로 돌리고 소유자는 소진된 룬 1개를 채널링한다. 유성은 돌아간 대상에게 피해를 주지 않고 원래 남은 적법한 대상에게만 3 피해를 준다.', cause:'대상 변경 제한 355.15와 부적법 대상 처리 359.3.e.1/.2/.5/.7/.8 누락. 주장 반박 이후 실제 해결 순서가 생략됨.' },
];
(async()=>{
  const db=new DatabaseSync(path.join(root,'private/operations.sqlite'));
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
  try {
    const rows=definitions.map(def=>{const row=db.prepare('SELECT * FROM requests WHERE id=?').get(def.requestId);if(!row)throw Error('Original request missing: '+def.requestId);const question=unseal(row.question);if(typeof question!=='string'||!question.includes(def.marker))throw Error('Original question mismatch');return {def,row,question};});
    const owner='admin-attachment-import', existing=definitions.map((_,i)=>db.prepare('SELECT id FROM reports WHERE owner=? AND client_key=?').get(owner,`${digest}-${i+1}`));
    if(existing.some(x=>!x)) {
      const folder=path.join(root,'private/backups',`ruling-import-${Date.now()}`);fs.mkdirSync(folder,{recursive:true});
      await backup(db,path.join(folder,'operations.sqlite'));fs.copyFileSync(path.join(root,'private/storage.key'),path.join(folder,'storage.key'));
    }
    const imported=[];
    db.exec('BEGIN IMMEDIATE');
    try {
      rows.forEach(({def,row,question},i)=>{
        const prior=db.prepare('SELECT id FROM reports WHERE owner=? AND client_key=?').get(owner,`${digest}-${i+1}`);
        if(prior){imported.push({id:prior.id,requestId:def.requestId,existing:true});return;}
        const response=unseal(row.response),trace=unseal(row.trace);
        const content={description:`${def.title}\n\n질문: ${question}\n\n당시 답변: ${response?.recommendation||''}\n\n당시 설명: ${response?.reasoning||''}\n\n분석: ${def.cause}`,expected:def.expected,tags:['wrong-answer','wrong-source'],language:'ko',
          attachment:{name:path.basename(input),sha256:digest,text},importSource:'user-provided-attachment',expectedReview:'official-clauses-reviewed; not a judge-approved dataset'};
        const snapshot={id:row.id,created:row.created,status:row.status,question,response,trace};
        const id=crypto.randomUUID(),now=Date.now(),fingerprint=crypto.createHash('sha256').update(JSON.stringify({requestId:def.requestId,category:'ruling',content})).digest('hex');
        db.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,owner,`${digest}-${i+1}`,fingerprint,def.requestId,now,now,'ruling','reproduced',seal(content),seal(snapshot));
        db.prepare('INSERT INTO report_history(report_id,at,status,note) VALUES (?,?,?,?)').run(id,now,'reproduced',seal(`사용자 첨부 맆바오류.txt ${i+1}/2. 원문 전체와 SHA-256을 암호화 보존하고 실제 질문/답변/검색 기록을 연결. ${def.cause}`));
        imported.push({id,requestId:def.requestId,existing:false});
      });
      db.exec('COMMIT');
    } catch(e){db.exec('ROLLBACK');throw e;}
    for(const item of imported){const row=db.prepare('SELECT content,snapshot FROM reports WHERE id=?').get(item.id);if(unseal(row.content).attachment.text!==text||unseal(row.snapshot).id!==item.requestId)throw Error('Import verification failed');}
    fs.writeFileSync(path.join(__dirname,'reports.json'),JSON.stringify({attachmentSha256:digest,importedAt:new Date().toISOString(),reports:imported},null,2)+'\n');
    console.log(JSON.stringify({registered:imported.length,reports:imported}));
  } finally {db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
