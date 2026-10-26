const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),release=path.join(root,'releases/v0.1.7');
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else if(item.name!=='app-release.json')files.push(p);}}
walk(release);
const hashes=Object.fromEntries(files.map(p=>[path.relative(release,p).replaceAll('\\','/'),crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const metadata={releaseId:'v0.1.7',version:'0.1.7',dataSchema:2,ready:true,createdAt:new Date().toISOString(),baseRelease:'v0.1.6',
  uiRevision:'timing-evidence-recovery-1',review:{syntaxFiles:7,testsRun:false,paidAiCalls:0,checkedAt:new Date().toISOString()},hashes};
fs.writeFileSync(path.join(release,'app-release.json'),JSON.stringify(metadata,null,2)+'\n');
console.log(JSON.stringify({releaseId:metadata.releaseId,files:files.length,testsRun:false,paidAiCalls:0}));
