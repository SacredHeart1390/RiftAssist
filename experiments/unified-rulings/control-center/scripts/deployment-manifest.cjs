const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'deployment');
const files=Object.fromEntries(fs.readdirSync(directory).filter(n=>n.endsWith('.cjs')).sort().map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(directory,n))).digest('hex')]));
const expected=JSON.stringify({schemaVersion:1,scope:'synthetic-only',files},null,2)+'\n',target=path.join(root,'deployment-manifest.json');
if(process.argv[2]==='--write')fs.writeFileSync(target,expected);else if(fs.readFileSync(target,'utf8')!==expected)throw Error('Deployment payload integrity failed.');
console.log(JSON.stringify({deploymentFilesVerified:Object.keys(files).length,productionEnabled:false}));
