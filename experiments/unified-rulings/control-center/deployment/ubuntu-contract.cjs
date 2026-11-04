'use strict';
// Reviewable future server broker actions. Not installed or reachable from the phase8 desktop client.
// No inferred production paths. Callers must supply an independently verified site inventory.
const path=require('node:path'),crypto=require('node:crypto');
function requireInventory(i){
 if(!i||i.schemaVersion!==1||i.approval!=='separate-reviewed-installation-required'||i.environment!=='synthetic-validation')throw Error('production-disabled');
 for(const key of ['releaseBase','dataBase','backupBase','caddyConfig','routeInclude'])if(typeof i[key]!=='string'||!path.posix.isAbsolute(i[key])||/[^A-Za-z0-9_./-]/.test(i[key])||i[key].split('/').includes('..'))throw Error('inventory');
 if(new Set([i.releaseBase,i.dataBase,i.backupBase]).size!==3||!i.caddyConfigHash?.match(/^[a-f0-9]{64}$/)||i.legacyOwner!=='systemd-manager-confirmed'||i.managerPort!==3100)throw Error('inventory');
}
function candidateUnit(id){if(!/^[a-f0-9-]{36}$/.test(id))throw Error('id');return 'riftassist-candidate-'+id+'.service';}
function createUbuntuContract(inventory,io){
 requireInventory(inventory);
 return{
  async preflight(){const status=await io.inventory();if(status.caddyConfigHash!==inventory.caddyConfigHash||!status.portsReserved||!status.legacyOwnershipConfirmed)throw Error('inventory-drift');return status;},
  async startCandidate(id){return io.command('/usr/bin/systemctl',['start',candidateUnit(id)]);},
  async stopCandidate(id){return io.command('/usr/bin/systemctl',['stop',candidateUnit(id)]);},
  async route(expectedHash,fragment){
   // Server-only include, no domain/certificate replacement. IO performs CAS+fsync+rename.
   if(!/^[a-f0-9]{64}$/.test(expectedHash)||!/^reverse_proxy 127\.0\.0\.1:[1-9][0-9]{3,4}\n$/.test(fragment))throw Error('route');
   const port=Number(fragment.match(/:(\d+)/)[1]);if(port>65535||[3100,3001,3011,3012].includes(port))throw Error('port');
   const previous=await io.readInclude(inventory.routeInclude);
   if(previous.hash!==expectedHash)throw Error('route-conflict');
   await io.validateProposed(fragment); // Must validate an isolated full config before touching live include.
   const next=crypto.createHash('sha256').update(fragment).digest('hex');
   await io.swapInclude(inventory.routeInclude,expectedHash,fragment);
   try{
    await io.command('/usr/bin/caddy',['validate','--config',inventory.caddyConfig,'--adapter','caddyfile']);
    await io.command('/usr/bin/systemctl',['reload','caddy.service']);return next;
   }catch{
    try{await io.swapInclude(inventory.routeInclude,next,previous.text);await io.command('/usr/bin/caddy',['validate','--config',inventory.caddyConfig,'--adapter','caddyfile']);await io.command('/usr/bin/systemctl',['reload','caddy.service']);}
    catch{throw Error('recovery-required');}throw Error('route-failed-restored');
   }
  }
 };
}
function productionAdapter(){throw Error('production-disabled');}
module.exports={createUbuntuContract,productionAdapter};
