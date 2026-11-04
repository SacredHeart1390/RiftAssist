// Development defaults never fall back to a real external service.
async function mockFetch(url, options = {}) {
  if (String(url) === 'https://app.riftjudge.com/api/search') return Response.json({ results: [] });
  if (String(url) !== 'https://api.openai.com/v1/responses') throw new Error('External networking is disabled in mock mode.');
  const body = JSON.parse(options.body);
  let result;
  if (body.text?.format?.name === 'source_korean_translation') {
    result = { title: '개발용 모의 번역', question: '개발용 모의 질문', answer: '개발용 모의 답변', body: '개발용 모의 번역입니다.' };
  } else {
    const text = body.input.find(row => row.role === 'user')?.content?.find(row => row.type === 'input_text')?.text || '';
    const id = text.match(/"id":"((?:core|tournament)-rules:[^"]+)"/u)?.[1];
    result = { recommendation: '개발용 모의 응답입니다. 실제 AI 판정이 아닙니다.',
      reasoning: '외부 유료 API를 호출하지 않은 화면·연결 시험입니다.', resolutionSteps: ['참고 근거가 표시되는지 확인하세요.'],
      confidence: 'medium', evidenceAssessment: { status: 'complete', queries: [], ruleIds: [] },
      followUpQuestions: [], citedRuleIds: id ? [id] : [], citedCaseIds: [], citedCardIds: [], caseTitles: [], caseComparisons: [], requiresJudge: false };
  }
  return Response.json({ id: 'development-mock', status: 'completed', usage: { input_tokens: 0, output_tokens: 0 },
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] });
}
function providerMode() { return process.env.RIFTASSI_EXTERNAL_MODE || 'mock'; }
async function fetchExternal(url, options) {
  const mode = providerMode();
  if (mode === 'mock') return mockFetch(url, options);
  if (mode === 'test' && globalThis.__riftassistTestTransport === true) return globalThis.fetch(url, options);
  if (mode === 'live' && process.env.RIFTASSI_ALLOW_EXTERNAL_CALLS === 'true') return globalThis.fetch(url, options);
  throw new Error('External service mode is not explicitly enabled.');
}
module.exports = { fetchExternal, providerMode };
