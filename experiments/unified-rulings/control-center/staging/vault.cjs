'use strict';
// Server-only: plaintext and keys never leave the owned staging root or appear in results.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {DatabaseSync,backup} = require('node:sqlite');
const {promisify} = require('node:util'), execFile = promisify(require('node:child_process').execFile);
const {hash,fail,uuid,noLinks,within,readJSON,atomic} = require('./protocol.cjs');
const MAX_DB = 128 * 1024 * 1024;
function seal(bytes, key) { const iv=crypto.randomBytes(12), c=crypto.createCipheriv('aes-256-gcm',key,iv); return Buffer.concat([Buffer.from('RFS2'),iv,c.update(bytes),c.final(),c.getAuthTag()]); }
function open(bytes, key) {
  if (bytes.length < 32 || bytes.subarray(0,4).toString() !== 'RFS2') fail('backup-integrity');
  try {const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(4,16));d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(16,-16)),d.final()]);} catch {fail('backup-integrity');}
}
function checked(file, limit=MAX_DB) { noLinks(file,true);if(fs.statSync(file).size>limit)fail('backup-size');return fs.readFileSync(file); }
function unsealCell(value,key) { const b=Buffer.from(value,'base64');if(b.length<28)fail('backup-integrity');const d=crypto.createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));const p=Buffer.concat([d.update(b.subarray(28)),d.final()]);try{JSON.parse(p);}finally{p.fill(0);} }
async function createBackup(config, slot, operationId) {
  if (!uuid(operationId)||!['a','b'].includes(slot)) fail('backup');
  return createPrivateBackup(config,slot,operationId,within(config.root,'data',slot,'private'),readJSON(within(config.root,'releases',slot,'release.json')));
}
// Trusted server-side caller only. These paths are never accepted from a remote request.
async function createPrivateBackup(config,slot,operationId,directory,release,{captureRuntimeConfig=false}={}) {
  if(!uuid(operationId)||!['a','b'].includes(slot))fail('backup');noLinks(directory);
  const snapshot=within(config.root,'private',operationId+'.snapshot.sqlite');
  const limit=Math.min(config.maxDbBytes||MAX_DB,MAX_DB);
  const source=path.join(directory,'operations.sqlite');noLinks(source,true);if(fs.statSync(source).size>limit)fail('backup-size');
  const keys={};let plain,wrap;
  const reservation=fs.openSync(snapshot,'wx',0o600);fs.closeSync(reservation);
  try {
    const db=new DatabaseSync(source,{readOnly:true});try{await backup(db,snapshot);}finally{db.close();}
    for(const name of ['storage.key','manager.key','session.key','sessions.key']) {
      const file=path.join(directory,name);
      if (fs.existsSync(file)) {const b=checked(file,128);if(name==='storage.key'?b.length!==32:!(/^[a-f0-9]{64}\s*$/i.test(b.toString())))fail('backup-key');keys[name]=b.toString('base64');b.fill(0);}
    }
    if(!keys['storage.key'])fail('backup-key');
    const configurationFiles={};if(captureRuntimeConfig){const b=require('./runtime-config.cjs').read(path.dirname(directory));if(b){try{configurationFiles['.env']=b.toString('base64');}finally{b.fill(0);}}}
    plain=Buffer.from(JSON.stringify({schemaVersion:1,id:operationId,slot,database:checked(snapshot,limit).toString('base64'),keys,release,configurationFiles}));
    wrap=checked(within(config.root,'private','vault.key'),32);if(wrap.length!==32)fail('backup-key');
    const sealed=seal(plain,wrap), target=within(config.root,'backups',operationId+'.sealed');
    const sealedFile=fs.openSync(target,'wx',0o600);try{fs.writeFileSync(sealedFile,sealed);fs.fsyncSync(sealedFile);}finally{fs.closeSync(sealedFile);}
    const metadata={id:operationId,slot,sha256:hash(sealed),bytes:sealed.length,verified:false};
    atomic(within(config.root,'backups',operationId+'.json'),metadata);
    await verifyBackup(config,operationId);metadata.verified=true;atomic(within(config.root,'backups',operationId+'.json'),metadata);return metadata;
  } finally {plain?.fill(0);wrap?.fill(0);if(fs.existsSync(snapshot))fs.unlinkSync(snapshot);}
}
async function verifyBackup(config,id) {
  if(!uuid(id))fail('backup');
  try {
    const {stdout}=await execFile(config.node,[path.join(__dirname,'restore-probe.cjs'),config.root,id],{timeout:30000,maxBuffer:4096,windowsHide:true,env:{...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})}});
    const v=JSON.parse(stdout);if(v.protocol!=='riftassist-restore-1'||v.id!==id||v.verified!==true)fail('backup-integrity');return v;
  } catch {fail('backup-integrity');}
}
function restoreProbe(root,id) {
  if(!uuid(id))fail('backup');noLinks(root);const owner=readJSON(within(root,'owner.json'),4096);if(!['isolated-staging','single-instance-replacement'].includes(owner.purpose))fail('owner');
  const metadata=readJSON(within(root,'backups',id+'.json'),4096), bytes=checked(within(root,'backups',id+'.sealed'),MAX_DB*2), key=checked(within(root,'private','vault.key'),32);
  if(metadata.id!==id||hash(bytes)!==metadata.sha256)fail('backup-integrity');
  const plain=open(bytes,key);key.fill(0);let value;
  try {value=JSON.parse(plain);}finally{plain.fill(0);}
  if(value.schemaVersion!==1||value.id!==id||value.slot!==metadata.slot)fail('backup-integrity');
  const probe=within(root,'private','probe-'+crypto.randomUUID().slice(0,12));fs.mkdirSync(probe,{mode:0o700});let db,storage;
  try {
    const file=path.join(probe,'probe.sqlite');fs.writeFileSync(file,Buffer.from(value.database,'base64'),{flag:'wx',mode:0o600});
    db=new DatabaseSync(file);db.exec('PRAGMA journal_mode=DELETE');if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')fail('backup-integrity');
    storage=Buffer.from(value.keys['storage.key'],'base64');if(storage.length!==32)fail('backup-key');let encryptedRows=0;
    for(const [table,columns]of Object.entries({requests:['question','response','trace'],reports:['content','snapshot'],report_history:['note']})) {
      for(const row of db.prepare('SELECT '+columns.join(',')+' FROM '+table).iterate())for(const cell of Object.values(row))if(cell){unsealCell(cell,storage);encryptedRows++;}
    }
    const files=value.configurationFiles||{};if(Object.keys(files).some(n=>n!=='.env'))fail('runtime-config-format');
    const env=files['.env']===undefined?null:Buffer.from(files['.env'],'base64');let runtimeConfig;try{runtimeConfig=require('./runtime-config.cjs').effectiveReport(env,value.release?.settings?.unitEnvironment,value.release?.settings?.environmentFileUsed!==false);}finally{env?.fill(0);}
    return{protocol:'riftassist-restore-1',id,verified:true,integrity:true,runtimeConfig,encryptedRows,keysPreserved:Object.keys(value.keys).length,keyNames:Object.keys(value.keys).sort(),compatibility:require('./data-compatibility.cjs').inspect(db)};
  } finally {db?.close();storage?.fill(0);fs.rmSync(probe,{recursive:true,force:true,maxRetries:3});}
}
module.exports={createBackup,createPrivateBackup,verifyBackup,restoreProbe,seal,open};
