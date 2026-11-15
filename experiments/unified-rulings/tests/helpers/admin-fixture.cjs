const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {createStore}=require('../../releases/v0.2.0/src/operations-store');
function fixture(root){
 const writer=createStore(root);writer.close();
 const db=new DatabaseSync(path.join(root,'private/operations.sqlite'));
 db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0');
 const key=fs.readFileSync(path.join(root,'private/storage.key'));
 const seal=v=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,iv),b=Buffer.concat([c.update(JSON.stringify(v)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),b]).toString('base64');};
 const now=Date.parse('2026-11-16T03:00:00Z'),start=Date.parse('2026-11-15T15:00:00Z'),DAY=86400000;
 const response={recommendation:'합성 답변',reasoning:'합성 근거',cards:[{id:'test-card',nameKo:'합성 카드'}],evidence:[{id:'r1',text:'합성 규칙'}],ai:{used:true}};
 const add=(id,created,status,trace={aiUsed:false,generationAttempts:[]})=>db.prepare('INSERT INTO requests VALUES (?,?,?,?,?,?,?,?,?)').run(id,'owner-secret',id,'fingerprint',created,status,seal('합성 질문'),seal(response),seal(trace));
 add('question-1',start,'ruling-generated',{aiUsed:true,generationAttempts:[{callId:'call-1'}]});add('question-2',now,'server-error',{code:'server-error'});add('question-3',now,'regional-ban');add('question-4',now,'processing');add('question-yesterday',start-1,'ruling-generated');add('question-expired',now-8*DAY,'ruling-generated');add('question-meta-expired',now-31*DAY,'ruling-generated');
 const call=(id,created,kind,input,output,error)=>db.prepare('INSERT INTO calls VALUES (?,?,?,?,?,?,?,?,?)').run(id,'owner-secret','deliberately-wrong',kind,created,now,input,output,error);
 call('call-1',start,'answer',100,20,null);call('call-2',now,'translation',50,10,null);call('call-3',now,'answer',null,null,'http_500');call('call-local',now,'answer',null,null,'input_budget_exceeded');call('call-yesterday',start-1,'answer',7,3,null);
 const report=(id,created,status,snapshot,request='question-1')=>{db.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,'owner-secret',id,'fp',request,created,created,'ruling',status,seal({description:'합성 사용자 제보',expected:'합성 기대 답변',tags:['wrong-answer']}),snapshot?seal(snapshot):null);db.prepare('INSERT INTO report_history(report_id,at,status,note) VALUES (?,?,?,?)').run(id,created,status,seal('합성 처리 이력'));};
 report('report-1',now,'received',{id:'question-1',created:start,question:'합성 질문',response,trace:{modelError:'synthetic-code'}});
 report('report-linked',now,'resolved',null);report('report-expired-question',now,'received',null,'question-expired');report('report-expired',now-91*DAY,'received',null);
 db.prepare('INSERT INTO session_counts VALUES (?,?)').run('2026-11-16',5);
 return {db,now,start,seal,add};
}
module.exports={fixture};
