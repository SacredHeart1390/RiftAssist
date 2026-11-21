// Evidence gaps are retrieval work, not an answer to the rules question.
// This is a bounded coverage check, not a claim to mechanically verify every ruling.
const {resolveRuleReference} = require('./retrieval');
function scoringConflict(ruling,{cards=[],evidence=[]}={}) {
  if(!cards.some(c=>c.modelReady&&/\bscore\s+(?:\d+|one|two|three|x)\s+points?\b/iu.test(c.textEn||'')))return false;
  const cites=ruling.citedRuleIds||[];
  const definitions=evidence.filter(r=>/gaining\s+points[\s\S]*score\s+x\s+points[\s\S]*does\s+not\s+refer/iu.test(r.officialTextEn||''));
  const limits=evidence.filter(r=>/only\s+score[\s\S]*once\s+per\s+battlefield\s+per\s+turn/iu.test(r.officialTextEn||''));
  if((limits.length?limits.some(r=>cites.includes(r.id)):cites.includes('core-rules:472'))&&!(definitions.length?definitions.some(r=>cites.includes(r.id)):cites.includes('core-rules:470.2')))return true;
  // Only guard an explicit extra-point denial tied to the already-scored battlefield.
  // This does not override independent card prohibitions, replacements or missing facts.
  if(cards.some(c=>/\b(?:cannot|can't|can not)\b[^.\n]{0,60}\b(?:gain|score)\b[^.\n]{0,30}\bpoints?\b/iu.test(c.textEn||'')))return false;
  const text=[ruling.recommendation,ruling.reasoning,...(ruling.resolutionSteps||[])].join('\n');
  return text.split(/\n|(?<=[.!?。])\s+/u).some(s=>{
    if(/(?:뜻|의미|주장).{0,12}(?:아니|않)|does not mean|not (?:true|correct) that/iu.test(s))return false;
    const prior=/이미.{0,45}(?:득점|점거)(?:했다면|했으면|하였으면|한\s*경우|했기\s*때문|했으므로|했으니)|\bbecause\b[^.!?\n]{0,40}\balready\b[^.!?\n]{0,60}(?:scor|held|hold)|\balready\b[^.!?\n]{0,40}(?:scor|held|hold)[^.!?\n]{0,20}\b(?:so|therefore)\b/iu.test(s);
    const denial=/(?:추가|더|또|2점).{0,35}(?:얻|획득|득점).{0,10}(?:못|없)|(?:추가|더|또).{0,20}못\s*(?:얻|받|획득)|(?:cannot|can't|may not|does not|won't|will not).{0,40}(?:give|gain|score|award|receive).{0,30}(?:additional|extra|another|second)/iu.test(s);
    const cardEffect=/스킬|카드\s*효과|이\s*효과|능력|\babilit(?:y|ies)\b|card\s+(?:effect|point)/iu.test(s);
    return prior&&denial&&cardEffect;
  });
}
function recoveryRequest(ruling,context={}) {
  if (!ruling) return null;
  if(scoringConflict(ruling,context))return {reason:'scoring-source-conflict',queries:['Scoring is distinct from Gaining Points; Score X points card effects versus Conquer Hold once per Battlefield per turn'],ruleIds:['core-rules:470.1','core-rules:470.2','core-rules:470.3','core-rules:472']};
  const assessment = ruling.evidenceAssessment || {};
  const referral = /(?:심판|저지).{0,16}(?:물어|문의|확인하세요)|(?:ask|check with|consult).{0,18}(?:judge|referee)/iu;
  // A prohibition on finalizing targets is a ruling, not a claim of uncertain evidence.
  const gap = /(?:판정|결론|시점|시기|순서|여부).{0,30}(?:확정|특정|단정).{0,18}(?:없|어렵)|(?:제공된|발췌).{0,60}(?:없|부족|어렵)|(?:cannot|can't|unable to).{0,30}(?:determine|establish|confirm)|(?:not|isn't) enough (?:evidence|information)/iu;
  const cited = ruling.citedRuleIds || [];
  const evidence = context.evidence || [];
  const ruleIds = (assessment.ruleIds || []).filter(id=>typeof id==='string').slice(0,6);
  const requested = ruleIds.map(id=>resolveRuleReference(id,evidence));
  const alreadySupplied = requested.length > 0 && requested.every(Boolean);
  const missingDecisiveCitations = (context.decisiveRuleIds || []).filter(id=>!cited.includes(id));
  // A stale self-assessment cannot override server coverage or a well-formed,
  // actionable answer that cites the exact supplied clauses it claimed to need.
  const contradictedMissingRule = assessment.status === 'missing-rule' && alreadySupplied
    && requested.every(id=>cited.includes(id)) && !context.missingRequired?.length
    && !missingDecisiveCitations.length && ruling.confidence !== 'insufficient'
    && Boolean(ruling.reasoning?.trim()) && Boolean(ruling.recommendation?.trim())
    && !gap.test(ruling.recommendation || '')
    && !referral.test(ruling.recommendation || '');
  const reason = assessment.status === 'source-conflict' || (assessment.status === 'missing-rule' && !contradictedMissingRule) ? assessment.status
    : !ruling.citedRuleIds?.length ? 'missing-citation'
    : !ruling.resolutionSteps?.length ? 'missing-steps'
    : missingDecisiveCitations.length ? 'missing-decisive-citation'
    : referral.test(ruling.recommendation || '') && !ruling.requiresJudge ? 'generic-referral'
    : assessment.status !== 'missing-fact' && (gap.test(ruling.recommendation || '') || ruling.confidence === 'insufficient') ? 'unresolved-ruling' : null;
  if (!reason) return null;
  const queries=(assessment.queries || []).filter(q=>typeof q==='string' && q.trim()).slice(0,3).map(q=>q.slice(0,300));
  if(!queries.length) queries.push(String(ruling.reasoning || ruling.recommendation || '').slice(0,300));
  return { reason, queries, ruleIds, alreadySupplied };
}
module.exports={recoveryRequest,scoringConflict};
