'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {within,noLinks,atomic,readJSON,hash,fail,owner} = require('./protocol.cjs');
function initialize(config) {
  if(fs.existsSync(config.root))fail('exists');noLinks(config.root);
  const parent=path.dirname(config.root),freshParent=!fs.existsSync(parent);fs.mkdirSync(config.root,{recursive:true,mode:0o755});fs.chmodSync(config.root,0o755);if(freshParent)fs.chmodSync(parent,0o755);
  for(const d of ['private','operations','backups','releases','data','launch','proxy']){const mode=d==='private'||d==='backups'||d==='operations'?0o700:0o755;fs.mkdirSync(within(config.root,d),{mode});fs.chmodSync(within(config.root,d),mode);}
  for(const d of ['data','config']){const dir=within(config.root,'proxy',d);fs.mkdirSync(dir,{mode:0o700});if(process.platform!=='win32'&&process.geteuid()===0)fs.chownSync(dir,config.appUid,config.appGid);}
  atomic(within(config.root,'owner.json'),{schemaVersion:1,purpose:'isolated-staging',siteId:config.siteId,inventoryHash:config.inventoryHash},0o644);
  fs.writeFileSync(within(config.root,'private','vault.key'),crypto.randomBytes(32),{flag:'wx',mode:0o600});
  atomic(within(config.root,'route.json'),{generation:1,slot:'a',version:'v0.1.7'});
  atomic(within(config.root,'proxy','route.caddy'),'reverse_proxy 127.0.0.1:'+config.ports.a[1]+'\n',0o644);
  const configText='{\n admin 127.0.0.1:'+config.proxyAdminPort+'\n auto_https disable_redirects\n skip_install_trust\n}\nhttps://localhost:'+config.proxyPort+' {\n bind 127.0.0.1\n tls internal\n import '+within(config.root,'proxy','route.caddy').replaceAll('\\','/')+'\n}\n';
  atomic(within(config.root,'proxy','Caddyfile'),configText,0o644);
  atomic(within(config.root,'proxy','config-receipt.json'),{sha256:hash(configText)});
}
function writeCode(config,slot,entries,version,commit,packageDigest) {
  if(!['a','b'].includes(slot))fail('slot');owner(config);
  const folder=within(config.root,'releases',slot);if(fs.existsSync(folder))fail('retained-release');
  fs.mkdirSync(folder,{mode:0o755});fs.chmodSync(folder,0o755);fs.mkdirSync(path.join(folder,'code'),{mode:0o755});fs.chmodSync(path.join(folder,'code'),0o755);const hashes={};
  for(const [name,entry]of Object.entries(entries)){
    const file=within(folder,'code',name);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o755});
    const bytes=Buffer.from(entry.content,'base64');if(hash(bytes)!==entry.sha256)fail('package-hash');fs.writeFileSync(file,bytes,{flag:'wx',mode:0o644});fs.chmodSync(file,0o644);let parent=path.dirname(file);while(parent.startsWith(folder)){fs.chmodSync(parent,0o755);if(parent===folder)break;parent=path.dirname(parent);}hashes[name]=entry.sha256;
  }
  atomic(path.join(folder,'release.json'),{version,commit,packageDigest,files:hashes},0o644);return folder;
}
function chownTree(config,folder) {
  noLinks(folder);
  if(process.platform!=='win32'&&process.geteuid()===0){for(const e of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,e.name);noLinks(file);if(e.isDirectory())chownTree(config,file);else fs.chownSync(file,config.appUid,config.appGid);}fs.chownSync(folder,config.appUid,config.appGid);}
}
function prepareData(config,slot,version,rules) {
  owner(config);const root=within(config.root,'data',slot);if(fs.existsSync(root))fail('retained-data');fs.mkdirSync(root,{mode:0o700});
  atomic(path.join(root,'.riftassist-environment.json'),{releaseFamily:'v0.2.0',environment:'staging'});
  atomic(path.join(root,'.riftassist-staging.json'),{schemaVersion:1,purpose:'isolated-staging',siteId:config.siteId,ports:config.ports[slot],proxyPort:config.proxyPort});
  const id='isolated-staging-fixture-1', folder=within(root,'knowledge-releases',id);fs.mkdirSync(folder,{recursive:true,mode:0o700});const hashes={};
  if(!Array.isArray(rules)||!rules.length)fail('knowledge');
  for(const [name,value]of Object.entries({'rules.json':rules,'cards.json':{schemaVersion:1,version:'isolated-staging-empty',cards:[]},'judge-cases.json':[]})){
    const bytes=JSON.stringify(value);fs.writeFileSync(path.join(folder,name),bytes,{flag:'wx',mode:0o600});hashes[name]=hash(bytes);
  }
  atomic(path.join(folder,'manifest.json'),{schemaVersion:1,compatibleSchema:2,releaseId:id,validationStatus:'validated',hashes,sources:{staging:{scope:'synthetic-only',actualRiotData:false}}});
  atomic(within(root,'knowledge-releases','active.json'),{releaseId:id});
  const source=within(config.root,'releases',slot,'code'), worker=within(root,'releases',version);
  fs.mkdirSync(worker,{recursive:true,mode:0o700});
  for(const name of ['src','public','manager-ui','dev-fixtures'])if(fs.existsSync(path.join(source,name)))fs.cpSync(path.join(source,name),path.join(worker,name),{recursive:true,errorOnExist:true,force:false});
  // The candidate manifest remains byte-for-byte ready=false. No fixture readiness promotion.
  fs.copyFileSync(path.join(source,'app-release.json'),path.join(worker,'app-release.json'),fs.constants.COPYFILE_EXCL);
  chownTree(config,root);
  atomic(within(config.root,'launch',slot+'.json'),{schemaVersion:1,purpose:'isolated-staging-launch',siteId:config.siteId,slot,root,source,version,ports:config.ports[slot],proxyPort:config.proxyPort},0o644);
  return root;
}
function verifyRelease(config,slot) {
  if(!['a','b'].includes(slot))fail('slot');const folder=within(config.root,'releases',slot),r=readJSON(path.join(folder,'release.json'));
  for(const [name,expected]of Object.entries(r.files)){const file=within(folder,'code',name);noLinks(file,true);if(hash(fs.readFileSync(file))!==expected)fail('release-integrity');}return r;
}
module.exports={initialize,writeCode,prepareData,verifyRelease,chownTree};
