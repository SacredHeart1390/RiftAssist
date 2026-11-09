'use strict';
// CI only. Runs as the disposable service user inside its real systemd namespace.
const fs=require('node:fs'),path=require('node:path');
function check(root,targets,output){
  if(!root.startsWith(fs.realpathSync(require('node:os').tmpdir())+path.sep)||!targets.every(t=>t.startsWith(root+path.sep))||!output.startsWith(root+path.sep))throw Error('fixture');
  for(const t of targets){
    if(fs.existsSync(path.join(t,'node_modules'))||fs.existsSync(path.join(t,'package-lock.json'))||!fs.existsSync(path.join(t,'src/manager.js')))throw Error('namespace-source');
    let denied=false;try{fs.readFileSync(path.join(t,'scripts/source-monitor.js'));}catch{denied=true;}if(!denied)throw Error('collector-visible');
  }
  fs.writeFileSync(output,JSON.stringify({originalExtrasInvisible:true,collectorScriptsInaccessible:true}),{mode:0o600});
}
if(require.main===module)try{check(process.argv[2],process.argv.slice(4),process.argv[3]);}catch{process.exitCode=1;}
module.exports={check};
