const path=require('node:path');
function cardSyncStatus(root){try{const x=JSON.parse(require('./riftnaru-auto-release').regular(path.join(root,'knowledge-releases/riftnaru-sync-status.json'),16384));return Object.fromEntries(['status','finishedAt','checked','changed','requests','activeReleaseId','nextEligibleAt','error'].filter(k=>x[k]!==undefined).map(k=>[k,x[k]]));}catch{return null;}}
module.exports={cardSyncStatus};
