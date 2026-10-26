const { buildIndex, tokenize, analyzeQuestion } = require('./retrieval');
function buildJudgeIndex(cases) {
  const usable = cases.filter(c => c.sourceAvailability !== 'removed' && c.status !== 'deprecated' && c.bodyComplete && c.question && c.answer);
  const index = buildIndex(usable.map(c => ({ ...c, officialTextEn: `${c.question} ${c.question} ${c.answer}`, keywords: [] })));
  return index;
}
function searchJudgeIndex(index, question, englishQuery, cards = []) {
  if (!index?.docs.length) return [];
  const intent = analyzeQuestion(question);
  const cardNames = intent.needsCardText ? cards.map(c => c.nameEn).filter(Boolean) : [];
  const generic = new Set('card cards unit units player opponent game rules rule can does what how when if would have with from the and for that this'.split(' '));
  const terms = [...new Set(tokenize(`${question} ${englishQuery} ${cardNames.join(' ')}`))].filter(t => !generic.has(t) && t.length > 1);
  const undo = intent.tournament && /되돌|번복|취소|take back|rewind|undo|reverse/iu.test(question);
  return index.docs.map(({ item, tf, length }) => {
    const body = `${item.question} ${item.answer}`;
    if (intent.deckConstruction && !/deck|cop(?:y|ies)|덱|장수/iu.test(body)) return null;
    if (undo && !/take\s+back|rewind|reverse|reversal|undo|rollback|retract/iu.test(body)) return null;
    const matched = terms.filter(t => tf.has(t));
    const cardHits = cardNames.filter(n => body.toLowerCase().includes(n.toLowerCase())).length;
    if (matched.length < 2 && !cardHits) return null;
    let score = 0;
    for (const term of matched) {
      const freq = tf.get(term), df = index.df.get(term);
      score += Math.log(1 + (index.docs.length - df + .5) / (df + .5)) * freq * 2.2 / (freq + 1.2 * (.25 + .75 * length / index.average));
    }
    score += cardHits * 8;
    if (score < 2) return null;
    const { officialTextEn, keywords, ...result } = item;
    return { ...result, score, retrievalSource: 'local-full-text', matchedTerms: matched.slice(0, 20) };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 4);
}
module.exports = { buildJudgeIndex, searchJudgeIndex };
