'use strict';
// Metadata only. WAL can contain committed pages absent from the main DB.
const fs=require('node:fs'),path=require('node:path'),P=require('./protocol.cjs');
function estimate({dbBytes,walBytes=0,shmBytes=0,maxDbBytes=16*1024*1024}){
  if(![dbBytes,walBytes,shmBytes,maxDbBytes].every(n=>Number.isSafeInteger(n)&&n>=0)||!dbBytes||!maxDbBytes)P.fail('backup-metadata');
  const snapshotUpperBound=dbBytes+walBytes,retainedBytes=snapshotUpperBound+shmBytes;
  if(!Number.isSafeInteger(retainedBytes)||retainedBytes>Number.MAX_SAFE_INTEGER/8)P.fail('backup-metadata');
  return{dbBytes,walBytes,shmBytes,snapshotUpperBound,maxDbBytes,
    snapshotWithinLimit:snapshotUpperBound<=maxDbBytes,
    requiredMemory:128*1024*1024+retainedBytes*8,requiredDisk:512*1024*1024+retainedBytes*8,
    consistentBackupRequired:true,mainFileCopyPermitted:false,actualRestoreVerified:false};
}
function metadata(data,maxDbBytes){
  const base=path.join(data,'private','operations.sqlite');
  const size=(suffix,required=false)=>{const file=base+suffix;P.noLinks(file,true);try{return fs.statSync(file).size;}catch(e){if(!required&&e.code==='ENOENT')return 0;throw e;}};
  return estimate({dbBytes:size('',true),walBytes:size('-wal'),shmBytes:size('-shm'),maxDbBytes});
}
function assertFits(plan,resources){
  if(!plan.snapshotWithinLimit)P.fail('backup-snapshot-budget');
  if(!Number.isFinite(resources.availableMemory)||resources.availableMemory<plan.requiredMemory)P.fail('backup-memory-budget');
  if(!Number.isFinite(resources.freeDisk)||resources.freeDisk<plan.requiredDisk)P.fail('backup-disk-budget');
  return plan;
}
module.exports={estimate,metadata,assertFits};
