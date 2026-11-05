const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'staging');
const files=Object.fromEntries(fs.readdirSync(directory).filter(n=>/\.(cjs|py|json)$/.test(n)).sort().map(n=>{
 const file=path.join(directory,n);if(fs.lstatSync(file).isSymbolicLink())throw Error('Staging payload links are not permitted.');
 return[n,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
}));
const data=JSON.stringify({schemaVersion:1,scope:'isolated-staging-not-installed',productionEnabled:false,files},null,2)+'\n',target=path.join(root,'staging-manifest.json');
if(process.argv[2]==='--write')fs.writeFileSync(target,data);else if(fs.readFileSync(target,'utf8')!==data)throw Error('Staging source payload differs from its manifest.');
console.log(JSON.stringify({stagingSourceFilesVerified:Object.keys(files).length,installedOnAzure:false,productionEnabled:false}));
