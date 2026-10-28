const { createTranslationProvider } = require('./card-translation');
const names = { 'Practice Unit': '연습 유닛', 'Practice Spell': '연습 주문' };
const effects = {
  'This is a synthetic development card.': '개발용 합성 카드입니다.',
  'It has no official game effect.': '공식 게임 효과가 없습니다.',
  'This synthetic spell exists only to test card selection and translation.': '이 합성 주문은 카드 선택과 번역 시험에만 사용합니다.',
};
function createMockCardTranslator() {
  return createTranslationProvider({ id: 'mock-card-ko', model: 'synthetic-ko-1', mode: 'mock',
    async generate(request) {
      const unknown = request.clauses.some(row => !effects[row.text]);
      return { nameKo: names[request.source.name] || '모의 카드',
        clauses: request.clauses.map(row => ({ id: row.id, textKo: effects[row.text] || '모의 번역이 준비되지 않았습니다.' })),
        keywordsKo: request.source.keywords.map(en => ({ en, ko: request.glossary.find(term => term.en.toLowerCase() === en.toLowerCase())?.ko || en })),
        cost: request.source.cost, stats: request.source.stats, symbols: request.source.symbols,
        uncertainties: unknown ? ['Synthetic fixture response unavailable; operator review required.'] : [] };
    } });
}
module.exports = { createMockCardTranslator };
