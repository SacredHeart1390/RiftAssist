'use strict';
// Development metadata only. Never starts services, changes databases or publishes Git refs.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
function nextDevelopmentVersion(state,expected){
 const m=/^0\.3\.(0|[1-9][0-9]*)$/.exec(state.appVersion||'');
 if(state.line!=='development'||state.branch!=='develop/v0.3.0'||state.releaseFamily!=='v0.3.0'||state.productionAllowed!==false||!m||state.appVersion!==expected||state.completedIterations!==Number(m[1]))throw Error('Development line/version/iteration conflict.');
 const n=state.completedIterations+1;if(!Number.isSafeInteger(n))throw Error('Iteration limit.');return {...state,appVersion:'0.3.'+n,completedIterations:n};
}
function validateProof(proof,state,head){if(proof.schemaVersion!==1||proof.version!==state.appVersion||proof.commit!==head||!/^[a-f0-9]{40}$/.test(head)||proof.failed!==0||!Number.isInteger(proof.passed)||proof.passed<1)throw Error('Exact current commit/version and passing test evidence required.');}
function main(){
 const base=path.resolve(__dirname,'..'),repo=path.resolve(base,'../..'),stateFile=path.join(base,'branch-state.json');
 const state=JSON.parse(fs.readFileSync(stateFile,'utf8')),expected=process.argv[process.argv.indexOf('--expected')+1];const next=nextDevelopmentVersion(state,expected);
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({applied:false,current:state.appVersion,next:next.appVersion,completedIterations:next.completedIterations,note:'Preview only. Apply only after a completed iteration and exact commit test evidence.'}));return;}
 const git=(...a)=>execFileSync('git',a,{cwd:repo,encoding:'utf8'}).trim();if(git('branch','--show-current')!==state.branch||git('status','--porcelain'))throw Error('Apply requires a clean development worktree; commit and test the completed iteration first.');
 const evidencePath=process.argv[process.argv.indexOf('--proof')+1];if(!process.argv.includes('--proof')||fs.statSync(evidencePath).size>16384)throw Error('Small explicit test evidence JSON required.');validateProof(JSON.parse(fs.readFileSync(evidencePath,'utf8')),state,git('rev-parse','HEAD'));
 const rel=path.join(base,'releases/v0.3.0'),cc=path.join(base,'control-center');
 const files=[stateFile,path.join(rel,'package.json'),path.join(rel,'app-release.json'),path.join(cc,'backend-manifest.json'),path.join(cc,'src/RiftAssist.ControlCenter/RiftAssist.ControlCenter.csproj'),path.join(cc,'src/RiftAssist.ControlCenter/MainWindow.xaml'),path.join(cc,'src/RiftAssist.ControlCenter/app.manifest'),path.join(rel,'public/service-worker.js'),path.join(repo,'.github/workflows/control-center.yml')];
 for(const f of files){if(fs.lstatSync(f).isSymbolicLink())throw Error('Metadata links are not allowed.');}
 const original=new Map(files.map(f=>[f,fs.readFileSync(f)])),lock=path.join(base,'.version-update.lock');const handle=fs.openSync(lock,'wx',0o600);
 try{
  fs.writeFileSync(stateFile,JSON.stringify(next,null,2)+'\n');const pkg=JSON.parse(fs.readFileSync(files[1]));pkg.version=next.appVersion;fs.writeFileSync(files[1],JSON.stringify(pkg,null,2)+'\n');
  for(const f of files.slice(4)){let s=fs.readFileSync(f,'utf8');if(f.endsWith('control-center.yml'))s=s.replaceAll('RiftAssist-ControlCenter-v'+expected+'-win-x64','RiftAssist-ControlCenter-v'+next.appVersion+'-win-x64');else if(f.endsWith('csproj'))s=s.replace('<Version>'+expected+'</Version>','<Version>'+next.appVersion+'</Version>');else {s=s.replaceAll(expected,next.appVersion);if(f.endsWith('MainWindow.xaml'))s=s.replace('완료 차수'+state.completedIterations,'완료 차수'+next.completedIterations);}fs.writeFileSync(f,s);}
  const m=JSON.parse(fs.readFileSync(files[2]));m.version=next.appVersion;m.ready=false;m.hashes=Object.fromEntries(Object.keys(m.hashes).map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(rel,n))).digest('hex')]));fs.writeFileSync(files[2],JSON.stringify(m,null,2)+'\n');
  execFileSync(process.execPath,[path.join(cc,'scripts/backend-manifest.cjs'),'--write'],{stdio:'ignore'});
  console.log(JSON.stringify({applied:true,appVersion:next.appVersion,completedIterations:next.completedIterations,published:false,productionAllowed:false}));
 }catch(e){for(const [file,bytes]of original)fs.writeFileSync(file,bytes);throw e;}finally{fs.closeSync(handle);fs.unlinkSync(lock);}
}
if(require.main===module){try{main();}catch{console.error('Development version update refused; check branch, expected version, clean status and test evidence. No deployment or publishing was performed.');process.exitCode=1;}}
module.exports={nextDevelopmentVersion,validateProof};
