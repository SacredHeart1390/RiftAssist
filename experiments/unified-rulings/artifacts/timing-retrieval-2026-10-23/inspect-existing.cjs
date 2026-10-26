const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '../..');
const key = fs.readFileSync(path.join(root, 'private/storage.key'));
function unseal(value) {
  if (!value) return null;
  const bytes=Buffer.from(value,'base64');
  const d=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));
  d.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([d.update(bytes.subarray(28)),d.final()]).toString('utf8'));
}
const db = new DatabaseSync(path.join(root,'private/operations.sqlite'), {readOnly:true});
const results=[];
for (const row of db.prepare('SELECT id,created,question,trace,response FROM requests WHERE question IS NOT NULL ORDER BY created DESC LIMIT 250').all()) {
  const q=unseal(row.question);
  if(typeof q!=='string'||!/빅토르/.test(q)||!/유성/.test(q))continue;
  const trace=unseal(row.trace), response=unseal(row.response);
  results.push({id:row.id,created:new Date(row.created).toISOString(),status:response?.status,knowledgeReleaseId:trace?.knowledgeReleaseId,
    retrievalPolicy:trace?.retrievalPolicy,trace:trace?.retrievalTrace,citedRuleIds:response?.citedRuleIds,model:trace?.aiModel});
}
db.close();
fs.writeFileSync(path.join(__dirname,'existing-traces.json'),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({...r,trace:r.trace?{intent:r.trace.intent,selected:r.trace.selectedIds,required:r.trace.requiredRuleIds}:null})),null,2));
