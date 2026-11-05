'use strict';
// Compatibility tests only: v017 source remains untouched and cannot reach a paid provider.
const fs=require('node:fs'),path=require('node:path');
const installed=path.join(__dirname,'mock-services.cjs');
const {mockFetch}=require(fs.existsSync(installed)?installed:path.resolve(__dirname,'../../releases/v0.2.0/src/external-services.js'));
if(typeof mockFetch!=='function')throw Error('Missing trusted mock transport.');
const localFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>/^http:\/\/127\.0\.0\.1:[0-9]+\//.test(String(url))?localFetch(url,options):mockFetch(url,options);
