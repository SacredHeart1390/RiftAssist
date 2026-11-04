// Read-only structural compatibility; never upgrades permissions or imports a dataset.
const { normalizeCatalog } = require('./cards');
const { createCardAccess } = require('./card-access');
function inspectLegacyCatalog(input, { mode = 'restricted' } = {}) {
  const before=JSON.stringify(input), catalog=normalizeCatalog(input);
  const view=createCardAccess(mode).snapshot({releaseId:'compatibility-inspection-only',cardCatalog:catalog});
  if(JSON.stringify(input)!==before)throw new Error('Compatibility inspection must not mutate the source.');
  return {schemaVersion:1,inputSchema:input.schemaVersion,supported:true,records:catalog.cards.length,
    visible:view.cardCatalog.cards.length,modelReady:view.cardAccess.modelReadyTotal,
    retained:catalog.cards.length,permissionUpgrades:0,dataImported:false,
    rightsVerified:false,notes:['Schema compatibility is not a license or Riot approval.','No permissions, source authority, pointers, database or keys were changed.']};
}
module.exports={inspectLegacyCatalog};
