// Evidence gaps are retrieval work, not an answer to the rules question.
// This is a bounded coverage check, not a claim to mechanically verify every ruling.
function recoveryRequest(ruling) {
  if (!ruling) return null;
  const assessment = ruling.evidenceAssessment || {};
  const referral = /(?:심판|저지).{0,16}(?:물어|문의|확인하세요)|(?:ask|check with|consult).{0,18}(?:judge|referee)/iu;
  // A prohibition on finalizing targets is a ruling, not a claim of uncertain evidence.
  const gap = /(?:판정|결론|시점|시기|순서|여부).{0,30}(?:확정|특정|단정).{0,18}(?:없|어렵)|(?:제공된|발췌).{0,60}(?:없|부족|어렵)|(?:cannot|can't|unable to).{0,30}(?:determine|establish|confirm)|(?:not|isn't) enough (?:evidence|information)/iu;
  const reason = ['missing-rule','source-conflict'].includes(assessment.status) ? assessment.status
    : !ruling.citedRuleIds?.length ? 'missing-citation'
    : !ruling.resolutionSteps?.length ? 'missing-steps'
    : referral.test(ruling.recommendation || '') && !ruling.requiresJudge ? 'generic-referral'
    : assessment.status !== 'missing-fact' && (gap.test(ruling.recommendation || '') || ruling.confidence === 'insufficient') ? 'unresolved-ruling' : null;
  if (!reason) return null;
  const queries=(assessment.queries || []).filter(q=>typeof q==='string' && q.trim()).slice(0,3).map(q=>q.slice(0,300));
  if(!queries.length) queries.push(String(ruling.reasoning || ruling.recommendation || '').slice(0,300));
  return { reason, queries, ruleIds:(assessment.ruleIds || []).filter(id=>typeof id==='string').slice(0,6) };
}
module.exports={recoveryRequest};
