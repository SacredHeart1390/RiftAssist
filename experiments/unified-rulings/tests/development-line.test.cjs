const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {nextDevelopmentVersion,validateProof}=require('../scripts/version-development.cjs');const base=path.resolve(__dirname,'..'),state=require('../branch-state.json');
test('development starts at 0.3.0/iteration0 without advancing release line',()=>{assert.equal(state.appVersion,'0.3.'+state.completedIterations);assert.equal(state.productionAllowed,false);assert.equal(JSON.parse(fs.readFileSync(path.join(base,'releases/v0.2.0/package.json'))).version,'0.2.0');});
test('completed iteration1 and2 advance patch deterministically but keep family and branch',()=>{const one=nextDevelopmentVersion({...state,appVersion:'0.3.0',completedIterations:0},'0.3.0'),two=nextDevelopmentVersion(one,'0.3.1');assert.equal(one.appVersion,'0.3.1');assert.equal(two.appVersion,'0.3.2');assert.equal(two.releaseFamily,'v0.3.0');assert.equal(two.branch,'develop/v0.3.0');assert.equal(two.productionAllowed,false);});
test('stale expected version wrong branch or iteration conflict cannot bump',()=>{assert.throws(()=>nextDevelopmentVersion(state,'0.3.'+(state.completedIterations+1)));assert.throws(()=>nextDevelopmentVersion({...state,line:'release'},state.appVersion));assert.throws(()=>nextDevelopmentVersion({...state,completedIterations:state.completedIterations+1},state.appVersion));});
test('test proof must match exact commit and current version and have no failures',()=>{const head='a'.repeat(40),p={schemaVersion:1,commit:head,version:state.appVersion,passed:1,failed:0};validateProof(p,state,head);assert.throws(()=>validateProof({...p,failed:1},state,head));assert.throws(()=>validateProof({...p,commit:'b'.repeat(40)},state,head));});
test('v030 source integrity and independent defaults do not read old records',()=>{const root=path.join(base,'releases/v0.3.0'),m=JSON.parse(fs.readFileSync(path.join(root,'app-release.json')));assert.equal(m.ready,false);assert.equal(m.version,state.appVersion);for(const [n,h]of Object.entries(m.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex'),h);const code=fs.readFileSync(path.join(root,'src/manager.js'),'utf8');assert.match(code,/3300/);assert.match(code,/3301/);assert.match(code,/rift_admin_v030/);assert.match(fs.readFileSync(path.join(root,'src/access-control.js'),'utf8'),/rift_session_v030/);});
test('v030 cannot reuse v020 markers or enter staging/production',t=>{
 const os=require('node:os'),root=fs.mkdtempSync(path.join(os.tmpdir(),'riftassist-version-boundary-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const {assertEnvironment}=require('../releases/v0.3.0/src/environment');
 const marker=path.join(root,'.riftassist-environment.json');
 for(const value of [{releaseFamily:'v0.2.0',environment:'development'},{releaseFamily:'v0.3.0',environment:'staging'},{releaseFamily:'v0.3.0',environment:'production'}]){
  fs.writeFileSync(marker,JSON.stringify(value));assert.throws(()=>assertEnvironment(root));assert.equal(fs.existsSync(path.join(root,'private')),false);
 }
});
test('version command applies only code metadata and retains runtime family in an isolated Git fixture',t=>{
 const {execFileSync,spawnSync}=require('node:child_process'),os=require('node:os');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'riftassist-version-tool-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const target=path.join(root,'experiments/unified-rulings'),rel=path.join(target,'releases/v0.3.0'),cc=path.join(target,'control-center');fs.mkdirSync(rel,{recursive:true});
 const copy=(from,to)=>{fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);};
 for(const file of ['app-release.json','package.json',...Object.keys(require('../releases/v0.3.0/app-release.json').hashes)])copy(path.join(base,'releases/v0.3.0',file),path.join(rel,file));
 for(const file of ['backend-manifest.json','scripts/backend-manifest.cjs','src/RiftAssist.ControlCenter/RiftAssist.ControlCenter.csproj','src/RiftAssist.ControlCenter/MainWindow.xaml','src/RiftAssist.ControlCenter/app.manifest'])copy(path.join(base,'control-center',file),path.join(cc,file));
 for(const file of ['branch-state.json','scripts/version-development.cjs'])copy(path.join(base,file),path.join(target,file));
 copy(path.join(base,'../../.github/workflows/control-center.yml'),path.join(root,'.github/workflows/control-center.yml'));
 const env={PATH:process.env.PATH,HOME:root,...(process.env.SystemRoot?{SystemRoot:process.env.SystemRoot}:{})};
 const git=(...args)=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 git('init','-b','develop/v0.3.0');git('add','.');git('-c','user.name=Synthetic Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--no-verify','-m','Synthetic code fixture');
 const proof=path.join(root,'..',path.basename(root)+'-proof.json');t.after(()=>fs.rmSync(proof,{force:true}));
 fs.writeFileSync(proof,JSON.stringify({schemaVersion:1,commit:git('rev-parse','HEAD'),version:state.appVersion,passed:1,failed:0}));
 const command=path.join(target,'scripts/version-development.cjs'),result=spawnSync(process.execPath,[command,'--expected',state.appVersion,'--apply','--proof',proof],{cwd:root,env,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);const next='0.3.'+(state.completedIterations+1);assert.equal(JSON.parse(result.stdout).appVersion,next);
 const manifest=JSON.parse(fs.readFileSync(path.join(rel,'app-release.json')));assert.equal(manifest.releaseId,'v0.3.0');assert.equal(manifest.version,next);assert.equal(manifest.ready,false);
 for(const [file,hash]of Object.entries(manifest.hashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(rel,file))).digest('hex'),hash);
 assert.equal(fs.existsSync(path.join(rel,'.dev-data')),false);assert.equal(fs.existsSync(path.join(target,'private')),false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(cc,'backend-manifest.json'))).releaseFamily,'v0.3.0');
 assert.match(fs.readFileSync(path.join(cc,'src/RiftAssist.ControlCenter/MainWindow.xaml'),'utf8'),new RegExp('완료 차수'+(state.completedIterations+1)));
 const refused=spawnSync(process.execPath,[command,'--expected',next,'--apply','--proof',proof],{cwd:root,env,encoding:'utf8'});assert.notEqual(refused.status,0);assert.equal(JSON.parse(fs.readFileSync(path.join(rel,'package.json'))).version,next);
});
