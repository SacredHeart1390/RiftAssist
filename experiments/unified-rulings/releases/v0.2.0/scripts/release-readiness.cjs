// Code-only report. Does not inspect data roots, credentials, VM, accounts or user records.
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'app-release.json'),'utf8'));
const {assessRelease}=require('../src/release-readiness');
console.log(JSON.stringify(assessRelease({manifest}),null,2));
