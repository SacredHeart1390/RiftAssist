// Explicit local release step. Never contacts Azure or changes runtime data.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function sync(root,version){
 const file=path.join(root,'app-release.json'),m=JSON.parse(fs.readFileSync(file));
 if(!/^0\.2\.\d+$/.test(version))throw Error('Expected a 0.2 PATCH version');
 if(Number(version.split('.')[2])<Number((m.displayVersion||m.version).split('.')[2]))throw Error('Display patch cannot decrease');
 m.displayVersion=version;m.uiRevision='patch-'+version;
 const publicDir=path.join(root,'public');
 const html=fs.readFileSync(path.join(publicDir,'index.html'),'utf8').replace(/(<[^>]+data-app-version[^>]*>)v[0-9.]+/g,'$1v'+version).replace(/(\/(?:[a-z0-9-]+\.(?:js|css)))(?:\?v=[^"'\s]+)?/g,'$1?v='+version);
 fs.writeFileSync(path.join(publicDir,'index.html'),html);
 let sw=fs.readFileSync(path.join(publicDir,'service-worker.js'),'utf8');sw=sw.replace(/const CACHE_NAME = '[^']+';/,"const CACHE_NAME = 'riftassi-patch-"+version+"';");
 sw=sw.replace(/(\/[a-z0-9-]+\.(?:js|css))(?:\?v=[^'\s]+)?/g,'$1?v='+version);fs.writeFileSync(path.join(publicDir,'service-worker.js'),sw);
 for(const n of Object.keys(m.hashes))if(fs.existsSync(path.join(root,n)))m.hashes[n]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,n))).digest('hex');
 for(const dir of ['src','public'])for(const n of fs.readdirSync(path.join(root,dir)))if(fs.statSync(path.join(root,dir,n)).isFile())m.hashes[dir+'/'+n]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,dir,n))).digest('hex');
 m.hashes['scripts/bump-patch.cjs']=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
 fs.writeFileSync(file,JSON.stringify(m,null,2)+'\n');return version;
}
if(require.main===module){const root=path.resolve(__dirname,'..'),m=JSON.parse(fs.readFileSync(path.join(root,'app-release.json')));const v=process.argv[2]||(m.displayVersion||m.version).replace(/\d+$/,n=>String(Number(n)+1));console.log(sync(root,v));const backend=path.resolve(root,'../../control-center/scripts/backend-manifest.cjs');if(fs.existsSync(backend))require('node:child_process').execFileSync(process.execPath,[backend,'--write'],{stdio:'inherit'});}
module.exports={sync};
