// A review report, never a deployment permit. Evidence is caller supplied and must be audited.
const SHA=/^[a-f0-9]{40}$/;
const gates=['rights','privacy','topology','caddy','broker','dataIsolation','backupRestore','rollback'];
function assessRelease({manifest,evidence={},commit}={}){
 const blockers=[];
 if(!manifest||manifest.releaseId!=='v0.2.0'||manifest.ready!==true)blockers.push('release-not-ready');
 if(!SHA.test(commit||''))blockers.push('exact-commit-required');
 const attested=v=>v?.status==='verified'&&typeof v.reference==='string'&&v.reference.trim().length>=3&&v.reference.length<=300&&v.commit===commit;
 if(!attested(evidence.tests)||evidence.tests.failed!==0||!Number.isInteger(evidence.tests.passed)||evidence.tests.passed<1)blockers.push('tests-not-verified-for-commit');
 if(!['licensed-legacy','riot-official'].includes(evidence.sourceMode))blockers.push('data-source-mode-unconfirmed');
 if(evidence.sourceMode==='riot-official'&&!attested(evidence.riotApi))blockers.push('riot-api-approval-not-verified');
 for(const name of gates)if(!attested(evidence[name]))blockers.push(name+'-not-verified');
 if(!attested(evidence.staging)||evidence.staging.environment!=='isolated-staging'||evidence.staging.actualApplicationStarted!==true||evidence.staging.mockOnly!==false)blockers.push('actual-application-staging-required');
 return {schemaVersion:1,releaseFamily:'v0.2.0',commit:SHA.test(commit||'')?commit:null,
   reviewComplete:blockers.length===0,blockers,authorizedToDeploy:false,
   note:'Attestations are not independently verified here. Separate reviewed installation and explicit deployment approval remain mandatory.'};
}
module.exports={assessRelease};
