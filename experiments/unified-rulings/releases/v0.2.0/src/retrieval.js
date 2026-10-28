const VERSION = 'mechanics-dependency-search-5';
const STOP = new Set('the and for with when what that this from have can does how are was were into your you not but then after before while during their them they about should would could game rules rule please 에서 으로 에게 하면 인가요 있나요 그리고 상황 어떻게 무엇 저는 우리 있는 없는 합니다 했습니다 있습니다 습니 니다'.split(' '));
const GROUPS = [
  ['우선권','priority'],['체인','chain'],['리액션','반응','reaction'],['무효화','반격','차단','counter'],
  ['대상','target'],['지불','비용','cost','pay'],['피해','damage'],['이동','move','movement'],
  ['폐기장','무덤','trash'],['덱','deck'],['사이드보드','sideboard'],['동일 이름','같은 이름','same named','copies'],
  ['대회','tournament'],['저지','judge'],['시간 종료','time limit','end of round'],['지각','tardiness'],
  ['번복','되돌리','undo','rewind'],['전투','combat'],['힘','power'],['에너지','energy'],['위력','might'],
  ['점수','득점','scoring','score'],['점령','정복','conquer'],['점거','hold'],['전장','battlefield'],
  ['해결','처리','resolution','resolves'],['패로','손으로','hand'],['부적법','부적합','illegal','invalid'],
  ['탈진','exhaust'],['전개','channel'],['결전','showdown'],
  ['유발','발동','trigger','triggered'],['죽','처치','사망','dies','killed','lethal'],
  ['정리','cleanup'],['동시','simultaneous'],['처리 중','해결 중','resolving'],
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

function analyzeQuestion(question, cards=[]) {
  const q = question.normalize('NFKC');
  const cardText = cards.filter(c=>c.modelReady).map(c=>c.textEn || '').join('\n');
  const mechanics = q + '\n' + cardText;
  const triggered = /유발|발동|trigger|\bwhen\b|\bwhenever\b|\bat the (?:start|end)\b|\[deathknell\]/iu.test(mechanics);
  const damage = /피해|데미지|damage|\bdeal\s+\d/iu.test(mechanics);
  const death = /죽|처치|사망|\bdie[sd]?\b|\bkill(?:ed)?\b|lethal|deathknell/iu.test(mechanics);
  const timing = triggered || /체인|처리|해결|순서|시기|반응|우선권|도중|중간|사이에|chain|resolv|resolution|priority|timing|reaction/iu.test(q);
  const quantity = /(?:[3-9]|[1-9]\d+)\s*장|(?:세|네|넷|다섯|여섯)\s*장|[34]\s*copies|four(?:th)?|three/iu.test(q);
  const deck = /덱|사이드보드|deck|sideboard|구성 제한|장수 제한|3장까지|세 장까지/iu.test(q);
  const zones = /폐기장|trash|graveyard/iu.test(q) && /패에서|패에|hand/iu.test(q);
  const deckConstruction = (quantity && (deck || zones || /장째|번째|copies|fourth/iu.test(q))) || /같은\s*(?:이름|카드).*(?:몇|제한)|copy limit|deck legality|덱\s*등록/iu.test(q);
  const effect = /효과|리액션|우선권|대상|추가.*(?:힘|비용)|무효|반항|counter|effect|target|resolve|priority|additional cost/iu.test(q);
  const scoring = /점수|득점|\d\s*점|scor(?:e|es|ed|ing)|\bpoints?\b|conquer|\bhold(?:ing)?\b/iu.test(q);
  const targetResolution = /대상|target/iu.test(q) && /해결|처리|체인|반응|후퇴|패로|손으로|사라|죽|죽었|처치|돌아|다시|변경|resolv|resolution|chain|react|retreat|hand|illegal|invalid|leave|left|die|died|kill|chang|retarget/iu.test(q);
  return {
    deckConstruction, scoring, targetResolution, triggered, damage, death, timing,
    cleanup: damage || death || /정리|cleanup/iu.test(q), needsCardText: !deckConstruction || effect,
    tournament: relevantEvent(q), quantityContext: quantity,
    simultaneousZones: zones, repeatedPlay: /번(?:째)?|회|times|fourth time/iu.test(q),
    explicitRuleIds: [...q.matchAll(/\b\d{3}(?:\.?\d+)?(?:\.?[a-z])?(?:\.\d+)*\b/giu)].map((m)=>ruleKey(m[0])),
  };
}

// Validate the meaning of timing anchors against the active document, not just old rule numbers.
// A unique match also survives a future renumbering. Changed/ambiguous meanings are surfaced in trace.
const ANCHORS = [
  ['158.1', /rules text.*top to bottom/iu],
  ['158.3', /while a spell or ability.*resolving.*no other spells or abilities/iu],
  ['158.3.a', /finish resolving all effects.*before/iu],
  ['340.1', /newest finalized chain item resolves/iu],
  ['321', /while chain items are resolving.*cleanup cannot occur/iu],
  ['319.5', /after a chain item is removed/iu],
  ['323.4', /units.*lethal damage.*killed/iu],
  ['142.4.b', /lethal damage.*greater than or equal.*might/iu],
  ['418.1.b', /deal damage.*mark the specified amount/iu],
  ['418.1.d', /damage can be dealt to more than one unit at the same time/iu],
  ['383.3', /when a condition is met.*triggered ability.*chain/iu],
  ['383.3.d', /more than one triggered ability.*simultaneously.*order/iu],
  ['383.2.c.2', /game object.*leaves the zone.*same time.*trigger/iu],
  ['337.3', /still pending chain items.*step 1/iu],
  ['320.1', /new pending items can be added.*finalized items cannot/iu],
];

function buildIndex(items) {
  const df = new Map();
  const docs = items.map((item) => {
    const terms = tokenize([item.ruleId,item.officialTextKo,item.officialTextEn,...(item.keywords||[])].join(' '));
    const tf = new Map();
    for (const term of terms) tf.set(term,(tf.get(term)||0)+1);
    for (const term of tf.keys()) df.set(term,(df.get(term)||0)+1);
    return { item, tf, length:terms.length };
  });
  const byId = new Map(items.map(i=>[i.id,i]));
  const children = new Map(), references = new Map(), anchors = new Map();
  for (const item of items) {
    if (!item.ruleId) continue;
    const split = item.id.lastIndexOf('.');
    if (split > item.id.indexOf(':')) {
      const parent = item.id.slice(0, split);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item.id);
    }
    const text = item.officialTextEn || item.officialTextKo || '';
    const refs = [...text.matchAll(/(?:see\s+rules?\s+|규칙\s*제?)(\d{3}(?:\.[\da-z]+)*)/giu)]
      .map(m=>`${item.documentId}:${ruleKey(m[1])}`).filter(id=>byId.has(id) && id!==item.id);
    references.set(item.id, [...new Set(refs)]);
  }
  if (byId.has('core-rules:158')) for (const [number, pattern] of ANCHORS) {
    const preferred = byId.get('core-rules:'+number);
    const matches = preferred && pattern.test(preferred.officialTextEn || '') ? [preferred]
      : items.filter(i=>i.documentId==='core-rules' && pattern.test(i.officialTextEn || ''));
    anchors.set(number, matches.length===1 ? matches[0].id : null);
  }
  return { docs, df, average:docs.reduce((s,d)=>s+d.length,0)/Math.max(1,docs.length), byId, children, references, anchors };
}

function search(index, question, cards=[], options={}) {
  const repairs=(options.queries || []).filter(q=>typeof q==='string').slice(0,3).map(q=>q.slice(0,300));
  const searchQuestion=question+'\n'+repairs.join('\n');
  const intent=analyzeQuestion(searchQuestion,cards);
  const expansions=GROUPS.filter(g=>g.some(term=>searchQuestion.toLowerCase().includes(term.toLowerCase()))).flat();
  if (intent.deckConstruction) expansions.push('same named card','copies','deck construction','같은 이름','주 덱','장수','decklist','legality');
  if (intent.scoring) expansions.push('score','scoring','conquer','hold','battlefield','per turn');
  if (intent.targetResolution) expansions.push('target','illegal','resolution','choices','finalized');
  if (intent.triggered) expansions.push('triggered ability','condition','pending','finalized','simultaneously');
  if (intent.timing) expansions.push('resolving','entirety','priority','chain');
  if (intent.cleanup) expansions.push('cleanup','lethal damage','marked','kill');
  const baseTerms=[...new Set(tokenize(searchQuestion+' '+expansions.join(' ')))];
  const effectTerms=intent.needsCardText ? [...new Set(tokenize(cards.filter(c=>c.modelReady).map(c=>c.textEn).join(' ').slice(0,1800)))] : [];
  const required=[];
  const unresolvedAnchors=[];
  const anchor=(number)=>{
    const id=index.anchors.get(number);
    if(id)required.push(id);else unresolvedAnchors.push(number);
  };
  if(intent.timing) ['158.1','158.3','158.3.a','340.1'].forEach(anchor);
  if(intent.cleanup) ['418.1.b','142.4.b','321','319.5','323.4'].forEach(anchor);
  if(intent.damage && /同時|동시|따로|각각|별개|두|번째|하나씩|separate|simultaneous|each/iu.test(searchQuestion)) anchor('418.1.d');
  if(intent.triggered) ['383.3','383.3.d','337.3','320.1'].forEach(anchor);
  if(intent.triggered && intent.death) anchor('383.2.c.2');
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
  for(const id of (options.ruleIds || []).slice(0,6)) {
    const canonical=String(id).includes(':') ? String(id) : 'core-rules:'+ruleKey(id);
    if(index.byId.has(canonical)) required.push(canonical);
  }
  for(const number of intent.explicitRuleIds) {
    for(const prefix of ['core-rules:','tournament-rules:']) if(index.byId.has(prefix+number))required.push(prefix+number);
  }
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
  const budget=Math.min(40,Math.max(options.repair ? 22 : 12,requiredIds.length+6));
  const add=(item,reason)=>{if(item&&!selected.some(i=>i.id===item.id)&&selected.length<budget)selected.push({...item,selectionReason:reason||item.selectionReason});};
  // Reserve slots before lexical ranking, including rules outside the top 40.
  for(const id of requiredIds)add(index.byId.get(id),'issue-principle');
  // Keep space for cited definitions and relevant child clauses; a heading is not a complete rule.
  for(const item of candidates.slice(0,4))add(item);
  const dependencyEdges=[];
  for(const item of [...selected]) {
    const roots=[...(index.references.get(item.id)||[])];
    const ownText=item.officialTextEn||item.officialTextKo||'';
    if(ownText.length<100)roots.unshift(item.id);
    for(const id of [...new Set(roots)].slice(0,2)) {
      const root=index.byId.get(id);if(!root)continue;
      add(root,'referenced-definition');
      const children=(index.children.get(id)||[]).map(child=>index.byId.get(child));
      children.sort((a,b)=>{
        const score=row=>tokenize((row.officialTextEn||'')+' '+(row.officialTextKo||'')).filter(t=>baseTerms.includes(t)).length;
        return score(b)-score(a);
      });
      for(const child of children.slice(0,options.repair?3:2))add(child,'definition-detail');
      dependencyEdges.push({from:item.id,to:id});
    }
  }
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
    trace:{version:VERSION,intent,evidenceBudget:budget,requiredRuleIds:requiredIds,unresolvedAnchors,dependencyEdges,repairQueries:repairs,
      missingFromIndex:requiredIds.filter(id=>!index.byId.has(id)),
      missingRequired:[...requiredIds.filter(id=>!bundles.some(item=>item.id===id)),...unresolvedAnchors.map(id=>'unresolved-current-rule:'+id)],
      candidates:candidates.map(i=>({id:i.id,score:i.searchScore,reason:i.selectionReason})),selectedIds:bundles.map(i=>i.id)} };
}
module.exports={VERSION,buildIndex,search,analyzeQuestion,ruleKey,tokenize};
