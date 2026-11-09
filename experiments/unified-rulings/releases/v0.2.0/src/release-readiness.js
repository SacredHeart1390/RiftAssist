// A review report, never a deployment permit. Evidence is caller supplied and must be audited.
const SHA=/^[a-f0-9]{40}$/;
const gates=['rights','privacy','topology','autostart','caddy','dataIsolation','backupRestore','rollback','resources'];
function assessRelease({manifest,evidence={},commit}={}){
 const blockers=[];
 if(!manifest||manifest.releaseId!=='v0.2.0'||manifest.ready!==true)blockers.push('release-not-ready');
 if(!SHA.test(commit||''))blockers.push('exact-commit-required');
 const attested=v=>v?.status==='verified'&&typeof v.reference==='string'&&v.reference.trim().length>=3&&v.reference.length<=300&&v.commit===commit;
 if(!attested(evidence.tests)||evidence.tests.failed!==0||!Number.isInteger(evidence.tests.passed)||evidence.tests.passed<1)blockers.push('tests-not-verified-for-commit');
 if(!['licensed-legacy','riot-official','approved-rules-only'].includes(evidence.sourceMode))blockers.push('data-source-mode-unconfirmed');
 if(evidence.sourceMode==='riot-official'&&!attested(evidence.riotApi))blockers.push('riot-api-approval-not-verified');
 const manual=evidence.deploymentPath==='manual-ssh';
 if(evidence.deploymentPath&&!['manual-ssh','restricted-broker'].includes(evidence.deploymentPath))blockers.push('deployment-path-unconfirmed');
 if(!attested(manual?evidence.manualProcedure:evidence.broker))blockers.push(manual?'manual-procedure-not-verified':'broker-not-verified');
 if(evidence.sourceMode==='approved-rules-only'&&(!attested(evidence.minimumKnowledge)||evidence.minimumKnowledge.cards!==0||evidence.minimumKnowledge.judgeCases!==0||evidence.minimumKnowledge.externalJudge!==false||evidence.minimumKnowledge.sourceTranslation!==false))blockers.push('minimum-knowledge-scope-not-verified');
 for(const name of gates)if(!attested(evidence[name]))blockers.push(name+'-not-verified');
 if(!attested(evidence.rehearsal)||!['isolated-ci','isolated-local'].includes(evidence.rehearsal.environment)||evidence.rehearsal.mode!=='single-instance-replacement'||evidence.rehearsal.actualApplicationStarted!==true||evidence.rehearsal.maxConcurrentVersions!==1)blockers.push('single-instance-application-rehearsal-required');
 return {schemaVersion:1,releaseFamily:'v0.2.0',commit:SHA.test(commit||'')?commit:null,
   deploymentMode:'single-instance-replacement',deploymentPath:manual?'manual-ssh':'restricted-broker',permanentBrokerRequired:!manual,additionalVmRequired:false,maxConcurrentVersions:1,
   reviewComplete:blockers.length===0,blockers,authorizedToDeploy:false,
   note:'Attestations are not independently verified here. Separate reviewed installation and explicit deployment approval remain mandatory.'};
}
module.exports={assessRelease};
