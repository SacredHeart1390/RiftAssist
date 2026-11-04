const VERSION = 'official-ko-2026-10-23-1';
const cache = new WeakMap();
// Short, aligned official headings supply terms. Do not manufacture Korean translations.
const essential = new Set('108.2 108.7 135.2.a 147 165 315.1 315.2 315.3 315.4 316 317 341 363 376 382 387 394 414 415 416 417 423 426 428 429 431 432 456 469 806 813'.split(' '));
const aliases = { '108.2':['Trash'], '108.7':['Hand'], '135.2.a':['Ability'], '165':['Rune Pool'], '341':['Showdown'], '456':['Recall'] };
function glossary(evidence) {
  if(cache.has(evidence))return cache.get(evidence);
  const entries=[],seen=new Set();
  for(const item of evidence){
    const en=item.officialTextEn?.trim(),ko=item.officialTextKo?.trim();
    if(!item.id.startsWith('core-rules:')||!en||!ko||item.languageAlignment!=='matching-document-dates')continue;
    if(en.length>42||ko.length>42||/[.!?:\d]/u.test(en)||/입니다|있습니다|경우|때$|후$/u.test(ko))continue;
    if(en.split(/\s+/u).length>4)continue;
    for(const term of [en,...(aliases[item.ruleId]||[])]){
      if(seen.has(term.toLowerCase()))continue;seen.add(term.toLowerCase());
      entries.push({en:term,ko,ruleId:item.id,version:item.versionKo,url:item.pdfUrlKo,essential:essential.has(item.ruleId)});
    }
  }
  // These names are defined in full sentences, rather than standalone headings.
  for(const [id,en,ko] of [['471.1','Conquer','정복'],['471.2','Hold','점거'],['143.2','Might','위력'],['163.1','Energy','에너지'],['163.2','Power','힘'],['332','Resolve','처리']]){
    const r=evidence.find(x=>x.id==='core-rules:'+id);
    if(r?.languageAlignment==='matching-document-dates'&&r.officialTextKo?.includes(ko))entries.push({en,ko,ruleId:r.id,version:r.versionKo,url:r.pdfUrlKo,essential:true});
  }
  cache.set(evidence,entries);return entries;
}
function instruction(entries,context='') {
  const lower=context.toLowerCase();
  const chosen=[...entries.filter(e=>e.essential),...entries.filter(e=>!e.essential&&(lower.includes(e.en.toLowerCase())||context.includes(e.ko)))].slice(0,90);
  return `For Korean output use the following OFFICIAL Korean rules terminology, including titles, steps and case comparisons: ${chosen.map(e=>`${e.en}=${e.ko}`).join('; ')}. Use the official Korean excerpt's wording for additional terms. Channel is 전개, not 채널/채널링. Exhaust is 탈진; Burn Out is 소진: these are different actions. A showdown is 결전 and combat is 전투. Use 손 for Hand, 폐기장 for Trash, and 처리 for resolving a spell. Do not substitute synonyms from other card games. Prefer grammatical Korean verbs (룬을 전개합니다, 카드를 탈진시킵니다). Preserve card names, proper nouns, numbers, symbols, IDs and original quotations. If a term has no supplied official Korean equivalent, do not claim a guessed translation is official; explain the action plainly. This glossary controls vocabulary, not rule outcomes.`;
}
function normalize(text,protectedNames=[]) {
  if(typeof text!=='string')return text;
  const protectedText=[];
  let value=text;
  for(const name of [...new Set(protectedNames)].filter(n=>n&&value.includes(n)).sort((a,b)=>b.length-a.length)){
    value=value.split(name).join(`\uE000${protectedText.push(name)-1}\uE001`);
  }
  // Only unmistakable terminology variants are corrected. In particular, never globally replace 소진.
  const substitutions=[['채널링','전개'],['채널','전개'],['무덤','폐기장'],['쇼다운','결전'],['리액션','반응'],['메인 단계','주요 단계'],['드로우 단계','뽑기 단계'],['반사형 효과','재귀 유발 효과'],['반사형 트리거','재귀 유발 효과'],['부적법한 대상','부적합한 대상'],['불법 대상','부적합한 대상']];
  for(const [from,to] of substitutions){
    value=value.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${from}(?=$|[^\\p{L}\\p{N}]|(?:을|를|은|는|이|가|의|에|에서|으로|로|도|만|하|합|한|할|해|했|되|된|됩))`,'gu'),(_,prefix)=>prefix+to);
  }
  value=value.replace(/소진(된|한|되어 있는|상태의?| 상태의?)\s*(룬|유닛|도구|전설|카드)/gu,'탈진$1 $2');
  return value.replace(/\uE000(\d+)\uE001/gu,(_,n)=>protectedText[Number(n)]);
}
function normalizeRuling(ruling,cards=[]) {
  const names=cards.flatMap(c=>[c.nameKo,c.nameEn,...(c.aliases||[])]);
  for(const field of ['recommendation','reasoning'])ruling[field]=normalize(ruling[field],names);
  for(const field of ['resolutionSteps','followUpQuestions'])ruling[field]=(ruling[field]||[]).map(v=>normalize(v,names));
  for(const item of ruling.caseTitles||[])item.title=normalize(item.title,names);
  for(const item of ruling.caseComparisons||[])for(const field of ['sharedConditions','differences','application'])item[field]=normalize(item[field],names);
  return ruling;
}
module.exports={VERSION,glossary,instruction,normalize,normalizeRuling};
