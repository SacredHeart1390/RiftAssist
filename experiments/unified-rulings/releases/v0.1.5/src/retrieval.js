const VERSION = 'issue-prerequisite-search-3';
const STOP = new Set('the and for with when what that this from have can does how are was were into your you not but then after before while during their them they about should would could game rules rule please 에서 으로 에게 하면 인가요 있나요 그리고 상황 어떻게 무엇 저는 우리 있는 없는 합니다 했습니다 있습니다 습니 니다'.split(' '));
const GROUPS = [
  ['우선권','priority'],['체인','chain'],['리액션','반응','reaction'],['무효화','반격','counter'],
  ['대상','target'],['지불','비용','cost','pay'],['피해','damage'],['이동','move','movement'],
  ['폐기장','trash'],['덱','deck'],['사이드보드','sideboard'],['동일 이름','같은 이름','same named','copies'],
  ['대회','tournament'],['저지','judge'],['시간 종료','time limit','end of round'],['지각','tardiness'],
  ['번복','되돌리','undo','rewind'],['전투','combat'],['힘','power'],['에너지','energy'],['위력','might'],
  ['점수','득점','scoring','score'],['점령','정복','conquer'],['점거','hold'],['전장','battlefield'],
  ['해결','resolution','resolves'],['패로','손으로','hand'],['부적법','illegal','invalid'],
];
const ruleKey = (value) => String(value || '').toLowerCase().replace(/(\d)([a-z])/gu, '$1.$2').replace(/([a-z])(\d)/gu, '$1.$2').replace(/\.+/gu, '.').replace(/\.$/u, '');
const relevantEvent = (question) => /대회|토너먼트|저지|공식 경기|라운드|패널티|징계|tournament|judge|penalty|organized play|round/iu.test(question);

function tokenize(value) {
  const words = String(value || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  const terms = [];
  for (const word of words) {
    if (STOP.has(word)) continue;
    // Keep quantities; Korean endings are not independent evidence.
    terms.push(word);
    if (/^[가-힣]{3,}$/u.test(word)) for (let i=0;i<word.length-1;i++) {
      const part=word.slice(i,i+2);
      if (!STOP.has(part) && !['대의','대가','카드','드가','장이','장의','장에','에는','는데'].includes(part)) terms.push(part);
    }
  }
  return terms;
}

function analyzeQuestion(question) {
  const q = question.normalize('NFKC');
  const quantity = /(?:[3-9]|[1-9]\d+)\s*장|(?:세|네|넷|다섯|여섯)\s*장|[34]\s*copies|four(?:th)?|three/iu.test(q);
  const deck = /덱|사이드보드|deck|sideboard|구성 제한|장수 제한|3장까지|세 장까지/iu.test(q);
  const zones = /폐기장|trash|graveyard/iu.test(q) && /패에서|패에|hand/iu.test(q);
  const deckConstruction = (quantity && (deck || zones || /장째|번째|copies|fourth/iu.test(q))) || /같은\s*(?:이름|카드).*(?:몇|제한)|copy limit|deck legality|덱\s*등록/iu.test(q);
  const effect = /효과|리액션|우선권|대상|추가.*(?:힘|비용)|무효|반항|counter|effect|target|resolve|priority|additional cost/iu.test(q);
  const scoring = /점수|득점|\d\s*점|scor(?:e|es|ed|ing)|\bpoints?\b|conquer|\bhold(?:ing)?\b/iu.test(q);
  const targetResolution = /대상|target/iu.test(q) && /해결|체인|반응|후퇴|패로|손으로|사라|죽|죽었|처치|돌아|다시|변경|resolv|resolution|chain|react|retreat|hand|illegal|invalid|leave|left|die|died|kill|chang|retarget/iu.test(q);
  return {
    deckConstruction, scoring, targetResolution, needsCardText: !deckConstruction || effect,
    tournament: relevantEvent(q), quantityContext: quantity,
    simultaneousZones: zones, repeatedPlay: /번(?:째)?|회|times|fourth time/iu.test(q),
    explicitRuleIds: [...q.matchAll(/\b\d{3}(?:\.?\d+)?(?:\.?[a-z])?(?:\.\d+)*\b/giu)].map((m)=>ruleKey(m[0])),
  };
}

function buildIndex(items) {
  const df = new Map();
  const docs = items.map((item) => {
    const terms = tokenize([item.ruleId,item.officialTextKo,item.officialTextEn,...(item.keywords||[])].join(' '));
    const tf = new Map();
    for (const term of terms) tf.set(term,(tf.get(term)||0)+1);
    for (const term of tf.keys()) df.set(term,(df.get(term)||0)+1);
    return { item, tf, length:terms.length };
  });
  return { docs, df, average:docs.reduce((s,d)=>s+d.length,0)/Math.max(1,docs.length), byId:new Map(items.map(i=>[i.id,i])) };
}

function search(index, question, cards=[]) {
  const intent=analyzeQuestion(question);
  const expansions=GROUPS.filter(g=>g.some(term=>question.toLowerCase().includes(term.toLowerCase()))).flat();
  if (intent.deckConstruction) expansions.push('same named card','copies','deck construction','같은 이름','주 덱','장수','decklist','legality');
  if (intent.scoring) expansions.push('score','scoring','conquer','hold','battlefield','per turn');
  if (intent.targetResolution) expansions.push('target','illegal','resolution','choices','finalized');
  const baseTerms=[...new Set(tokenize(question+' '+expansions.join(' ')))];
  const effectTerms=intent.needsCardText ? [...new Set(tokenize(cards.filter(c=>c.modelReady).map(c=>c.textEn).join(' ').slice(0,1800)))] : [];
  const required=[];
  if (intent.deckConstruction) {
    required.push('core-rules:103.3.b','core-rules:103.3.e');
    if (/챔피언|champion/iu.test(question)) required.push('core-rules:103.3.b.1');
    if (/캐릭터|이름.*다|different.*name|character/iu.test(question)) required.push('core-rules:103.3.b.2');
    if (/사이드보드|sideboard/iu.test(question)) required.push('tournament-rules:403.3');
    if (intent.tournament) required.push('tournament-rules:703.4.e','tournament-rules:703.3','tournament-rules:703.3.a.3');
    if (/리미티드|실드|드래프트|limited|sealed|draft/iu.test(question)) required.push('tournament-rules:602.3.a');
  }
  if (intent.scoring) required.push('core-rules:472','core-rules:471.1','core-rules:471.2','core-rules:470');
  const targetPrinciples = ['355.15','359.3.e.1','359.3.e.2','359.3.e.5','340.1','359.3.d','359.3.e.7','359.3.e.8'].map(id=>'core-rules:'+id);
  if (intent.targetResolution) required.push(...targetPrinciples);
  const candidates=index.docs.map(({item,tf,length})=>{
    let score=0;
    const matched=[];
    for(const term of baseTerms) {
      const freq=tf.get(term)||0;if(!freq)continue;
      matched.push(term);
      score+=Math.log(1+(index.docs.length-(index.df.get(term)||0)+.5)/((index.df.get(term)||0)+.5)) * freq*2.2/(freq+1.2*(.25+.75*length/Math.max(1,index.average)));
    }
    for(const term of effectTerms) if(tf.has(term))score+=.12;
    if (!intent.tournament && item.id.startsWith('tournament-rules:')) score *= .35;
    const direct=intent.explicitRuleIds.includes(ruleKey(item.ruleId));
    const pinned=required.includes(item.id);
    if(direct)score+=200;
    if(pinned)score+=100;
    return {...item,searchScore:Math.round(score*1000)/1000,matchedTerms:matched,selectionReason:direct?'explicit-rule':pinned?'issue-principle':'lexical'};
  }).filter(i=>i.searchScore>0).sort((a,b)=>b.searchScore-a.searchScore).slice(0,40);
  // A narrow exception must not displace the general rules that govern it.
  if (!intent.targetResolution && candidates.slice(0,8).some(i=>i.id.startsWith('core-rules:359.3.e.'))) {
    required.push(...targetPrinciples.slice(0,4));
  }
  const requiredIds=[...new Set(required)];
  const selected=[];
  const budget=Math.min(12,Math.max(8,requiredIds.length));
  const add=(item,reason)=>{if(item&&!selected.some(i=>i.id===item.id)&&selected.length<budget)selected.push({...item,selectionReason:reason||item.selectionReason});};
  // Reserve slots before lexical ranking, including rules outside the top 40.
  for(const id of requiredIds)add(index.byId.get(id),'issue-principle');
  for(const item of candidates)add(item);
  // Bundle only parent context, keeping each supplied citation independently identifiable.
  const seen=new Set(selected.map(i=>i.id));
  for(const item of [...selected]) {
    const id=item.id.slice(0,item.id.lastIndexOf('.'));
    const parent=index.byId.get(id);
    if(parent&&!seen.has(id)&&selected.length<budget) {selected.push({...parent,selectionReason:'parent-context'});seen.add(id);}
  }
  const bundles=selected.map(item=>{
    const parents=[];
    let key=item.id;
    for(let level=0;level<2;level++) {
      const split=key.lastIndexOf('.');if(split<key.indexOf(':'))break;
      key=key.slice(0,split);const parent=index.byId.get(key);
      if(parent)parents.unshift({id:parent.id,textEn:parent.officialTextEn,textKo:parent.officialTextKo});
    }
    return {...item,parentContext:parents};
  });
  return { evidence:bundles, intent,
    trace:{version:VERSION,intent,evidenceBudget:budget,requiredRuleIds:requiredIds,
      missingFromIndex:requiredIds.filter(id=>!index.byId.has(id)),
      missingRequired:requiredIds.filter(id=>!bundles.some(item=>item.id===id)),
      candidates:candidates.map(i=>({id:i.id,score:i.searchScore,reason:i.selectionReason})),selectedIds:bundles.map(i=>i.id)} };
}
module.exports={VERSION,buildIndex,search,analyzeQuestion,ruleKey,tokenize};
