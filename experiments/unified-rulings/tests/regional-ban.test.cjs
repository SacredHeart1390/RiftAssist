const test=require('node:test'),assert=require('node:assert/strict');
const {isolatedServer}=require('./helpers/isolated-server.cjs');
const {evaluate}=require('../releases/v0.2.0/src/regional-ban-question');
test('multiple printing codes map to one named ban without matching a different champion card',()=>{
 const catalog=[{id:'riftnaru:rad-043',code:'RAD-043',nameEn:'Riven - Broken Blade'},
 {id:'riftnaru:rad-043a',code:'RAD-043A',nameEn:'Riven - Broken Blade'},
 {id:'riftnaru:other',code:'RAD-044',nameEn:'Riven, Showboat'}];
 for(const code of ['RAD-043','RAD-043A'])assert.equal(evaluate(`글로벌 Standard에서 2026-11-23 ${code} 금지인가요?`,[],'ko','2026-11-14',catalog).regionalBan.ban,'banned');
 assert.equal(evaluate('글로벌 Standard에서 2026-11-23 RAD-044 금지인가요?',[],'ko','2026-11-14',catalog).regionalBan.ban,'unknown');
});
test('question endpoint returns Korean and global official ban rulings without AI',async t=>{
 const s=await isolatedServer(t,[]);
 const kr=await s.ask('한국 Standard에서 2026-11-23 공격 예고 금지인가요?');
 assert.equal(kr.status,200);assert.equal(kr.body.regionalBan.ban,'not-banned');assert.equal(kr.body.ai.used,false);
 assert.ok(kr.body.sourceUrls[0].startsWith('https://playriftbound.com/'));
 const global=await s.ask('글로벌 Standard에서 2026-11-23 공격 예고 금지인가요?');
 assert.equal(global.body.regionalBan.ban,'banned');assert.equal(s.externalCalls.length,0);
 const before=await s.ask('글로벌 Standard에서 2026-11-22 Riven, Broken Blade 금지인가요?');
 assert.equal(before.body.regionalBan.ban,'not-banned');
 const after=await s.ask('글로벌 Standard에서 2026-11-23 Riven, Broken Blade 금지인가요?');
 assert.equal(after.body.regionalBan.ban,'banned');
 const selected=await s.ask('글로벌 Standard에서 2026-11-23 Riven - Broken Blade 금지인가요?');
 assert.equal(selected.body.regionalBan.ban,'banned');
 const koreanDate=await s.ask('한국 Standard에서 2026년 11월 23일 공격 예고 금지인가요?');
 assert.equal(koreanDate.body.regionalBan.ban,'not-banned');
});
test('ambiguous bans and unknown event overrides stay undecided',async t=>{
 const s=await isolatedServer(t,[]);
 const unclear=await s.ask('드레이븐은 금지인가요?');
 assert.equal(unclear.body.regionalBan.ban,'unknown');
 const event=await s.ask('한국 Standard 이번 대회 2026-11-23 공격 예고 금지인가요?');
 assert.equal(event.body.regionalBan.ban,'unknown');assert.equal(s.externalCalls.length,0);
});
