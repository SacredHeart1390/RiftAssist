// No dotenv import, OpenAI client, SQLite access, Git, or code deployment.
const fs=require('node:fs'),path=require('node:path');
const {runSync}=require('../src/riftnaru-sync');
const {readPolicy}=require('../src/riftnaru-auto-release');
const args=process.argv.slice(2),root=process.env.RIFTASSI_SYNC_ROOT;
if(!root||args.some(a=>a!=='--read-only')){console.error('sync-configuration-invalid');process.exitCode=1;}
else {const policy=readPolicy(root);runSync({root,stateDir:policy.stateDir,seedFile:path.join(policy.stateDir,'seed.json'),readOnly:args.includes('--read-only')}).then(r=>{console.log(JSON.stringify(r));if(['failed','rolled-back'].includes(r.status))process.exitCode=1;}).catch(()=>{console.error('sync-fatal-validation-error');process.exitCode=1;});}
