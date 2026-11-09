'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
function fixture(run){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'riftassist-inspection-pin-'));
  try{
    for(const dir of ['scripts','staging'])fs.mkdirSync(path.join(temp,dir));
    for(const file of ['scripts/final-inspection.cjs','staging/inspect-final-launch.py'])fs.copyFileSync(path.join(root,file),path.join(temp,file));
    run(temp,(...args)=>spawnSync(process.execPath,[path.join(temp,'scripts/final-inspection.cjs'),...args],{encoding:'utf8'}));
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
test('fixed source emits two independent commands without executing SSH',()=>fixture((temp,run)=>{
  assert.equal(run('--write').status,0);
  const lines=fs.readFileSync(path.join(temp,'FINAL-INSPECTION.txt'),'utf8').split('\n').filter(x=>x.startsWith('& {'));
  assert.equal(lines.length,2);
  assert.match(lines[0],/sshCommands=0/);
  assert.match(lines[1],/StrictHostKeyChecking=yes/);
  assert.match(lines[1],/environmentValuesEmitted -isnot \[bool\]/);
  assert.match(lines[1],/unexpected-field/);
  assert.equal(run().status,0);
}));
test('modified probe cannot silently generate a new review pin',()=>fixture((temp,run)=>{
  fs.appendFileSync(path.join(temp,'staging/inspect-final-launch.py'),'\n# synthetic-do-not-emit\n');
  const result=run('--write');
  assert.notEqual(result.status,0);
  assert.equal(fs.existsSync(path.join(temp,'FINAL-INSPECTION.txt')),false);
  assert.doesNotMatch(result.stdout+result.stderr,/synthetic-do-not-emit/);
}));
test('changed instructions are rejected rather than executed',()=>fixture((temp,run)=>{
  assert.equal(run('--write').status,0);
  fs.appendFileSync(path.join(temp,'FINAL-INSPECTION.txt'),'changed\n');
  assert.notEqual(run().status,0);
}));
