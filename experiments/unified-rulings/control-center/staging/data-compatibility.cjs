'use strict';
const P=require('./protocol.cjs');
function schemaHash(db){return P.digest(db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").all());}
function inspect(db){
  const setting=(name,fallback)=>{const r=db.prepare('SELECT value FROM settings WHERE name=?').get(name);return r?JSON.parse(r.value):fallback;};
  const appRelease=setting('appRelease',null),hosting=setting('hosting',null),ai=setting('aiEnabled',true),limits=setting('limits',{});
  const names=['questions','generations','translations','sessionQuestions','sessionTranslations','reports','sessionReports','concurrent'];
  const limitsValid=limits&&typeof limits==='object'&&!Array.isArray(limits)&&Object.entries(limits).every(([k,v])=>names.includes(k)&&Number.isInteger(v)&&v>=1&&v<=(k==='concurrent'?3:1000));
  return{schemaHash:schemaHash(db),appRelease:typeof appRelease==='string'&&/^v\d+\.\d+\.\d+$/.test(appRelease)?appRelease:null,
    hostingCompatible:['external','none'].includes(hosting?.provider)&&hosting.publicOrigin==='https://riftassistant.app',limitsValid:Boolean(limitsValid),aiSettingValid:typeof ai==='boolean'};
}
module.exports={schemaHash,inspect};
