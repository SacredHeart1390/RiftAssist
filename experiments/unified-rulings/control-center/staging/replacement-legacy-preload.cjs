'use strict';
// Rehearsal only: original v017 source, with ephemeral worker ports injected in memory.
const fs=require('node:fs'),path=require('node:path');
if(process.env.RIFTASSIST_REHEARSAL_LEGACY==='true'){
  const root=process.env.RIFTASSI_DATA_ROOT,source=process.env.RIFTASSIST_REHEARSAL_SOURCE,ports=JSON.parse(process.env.RIFTASSIST_REHEARSAL_PORTS||'null');
  if(!root||!source||!root.startsWith(fs.realpathSync(require('node:os').tmpdir())+path.sep)||!Array.isArray(ports)||ports.length!==2||ports.some(p=>!Number.isInteger(p)||p<1024))throw Error('rehearsal-scope');
  const host=require(path.join(source,'src/app-host.js')),original=host.createAppHost;
  host.createAppHost=options=>original({...options,workerPorts:ports});
}
