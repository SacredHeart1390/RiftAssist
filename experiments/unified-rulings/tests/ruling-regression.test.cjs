const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { isolatedServer, fixture, release } = require('./helpers/isolated-server.cjs');
const { normalizeCatalog } = require(path.join(release, 'src/cards.js'));
const { buildIndex, search } = require(path.join(release, 'src/retrieval.js'));
const { recoveryRequest } = require(path.join(release, 'src/answer-quality.js'));
const { validateRules } = require(path.join(release, 'src/knowledge-provider.js'));
const index = buildIndex(fixture.rules);
const cards = normalizeCatalog(fixture.cards).cards;
const star = cards.find(c => c.nameEn === 'Falling Star');
const leader = cards.find(c => c.nameEn === 'Viktor - Leader');
const retreat = cards.find(c => c.nameEn === 'Retreat');
const byId = new Map(fixture.rules.map(r => [r.id, r]));
const questions = {
  scoring: '내 턴 개시 단계에 점거한 전장에서 1점을 얻었습니다. 메인 단계에 상대가 그 전장을 정복한 뒤 제가 다시 정복했습니다. 같은 턴 같은 전장에서 다시 점수를 얻나요?',
  targets: 'A는 유성으로 서로 다른 유닛 둘을 대상으로 지정했습니다. B는 반응으로 그중 하나에 후퇴를 써서 손으로 돌렸습니다. A는 대상을 다시 고르겠다고 합니다. 무엇부터 처리하고 남은 대상은 어떻게 처리하나요?',
  timing: '내 기지에는 빅토르 - 지도자와 신병이 아닌 위력 2 유닛 둘이 있습니다. 유성으로 그 두 유닛을 대상으로 지정했습니다. 아무도 반응하지 않을 때, 첫 피해와 두 번째 피해 사이에 빅토르가 발동하나요? 처치와 유발 스킬의 처리 순서를 알려 주세요.',
};
function ruling(overrides = {}) {
  return { recommendation: '유성을 모두 처리하고 정리한 뒤 빅토르의 두 스킬을 각각 처리합니다.',
    resolutionSteps: ['각 대상에 피해 3을 표시하고 유성을 모두 처리합니다.', '정리에서 두 유닛을 처치합니다.', '빅토르의 스킬 두 개를 체인에 놓고 각각 처리하여 기지에 위력 1 신병 토큰 둘을 사용합니다.'],
    reasoning: '158.3과 321에 따라 처리 중 다른 항목 처리와 정리를 끼우지 않고, 323.4 및 383.3에 따라 정리 후 유발 스킬을 처리합니다.',
    confidence: 'medium', evidenceAssessment: { status: 'complete', queries: [], ruleIds: [] }, followUpQuestions: [],
    citedRuleIds: ['core-rules:158.3', 'core-rules:321', 'core-rules:323.4', 'core-rules:383.3'],
    citedCaseIds: [], citedCardIds: [star.id, leader.id], caseTitles: [], caseComparisons: [], requiresJudge: false,
    ...overrides };
}
function gapRuling() {
  return ruling({ recommendation: '제공된 규칙으로 유발 스킬의 처리 시기를 확정할 수 없습니다.', confidence: 'insufficient',
    evidenceAssessment: { status: 'missing-rule', queries: ['triggered abilities during resolution cleanup lethal damage'], ruleIds: ['core-rules:158.3.a'] },
  });
}
function suppliedRules(body) {
  const text = body.input.find(m => m.role === 'user').content.find(c => c.type === 'input_text').text;
  const label = 'Retrieved official rule excerpts (the IDs are the only rule citations you may use):\n';
  return JSON.parse(text.split(label)[1].split('\n\nRetrieved RiftJudge')[0]);
}
function assertEvidence(result, ids) {
  assert.deepEqual(result.trace.missingRequired, [], 'A required rule was lost to the evidence budget.');
  for (const id of ids) assert.ok(result.evidence.some(r => r.id === id), `Missing decisive source ${id}`);
}

test('01 재점령 득점: 같은 턴·전장 제한 472를 검색 결과에 보존한다', () => {
  // Local official source: 471.1/471.2/472, not a model-generated expected answer.
  assert.match(byId.get('core-rules:472').officialTextEn, /once per Battlefield per turn/);
  const result = search(index, questions.scoring);
  assertEvidence(result, ['core-rules:472', 'core-rules:471.1', 'core-rules:471.2']);
});

test('02 유성·후퇴: 실제 질문 API가 대상 원칙을 전달하고 잘못된 인용을 제거한다', async t => {
  const expected = ruling({ recommendation: '대상을 다시 고를 수 없습니다. 후퇴를 먼저 처리하고, 유성은 남은 유닛에만 피해 3을 입힙니다.',
    resolutionSteps: ['후퇴로 한 유닛을 손으로 돌립니다.', '유성의 해당 대상 지시는 수행하지 않고, 남은 대상에 피해 3을 입힙니다.'],
    reasoning: '355.15와 359.3.e.2/359.3.e.5에 따라 원래 선택을 유지하고 부적법한 대상 관련 지시를 수행하지 않습니다.',
    citedRuleIds: ['core-rules:355.15', 'core-rules:359.3.e.2', 'core-rules:359.3.e.5', 'core-rules:999.999'],
    citedCardIds: [star.id, retreat.id, 'not-a-supplied-card'], citedCaseIds: ['not-a-supplied-case'],
  });
  const server = await isolatedServer(t, [{ ruling: expected }]);
  const response = await server.ask(questions.targets, [star.id, retreat.id]);
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ruling-generated');
  assert.equal(server.externalCalls.length, 1);
  const ids = suppliedRules(server.externalCalls[0]).map(r => r.id);
  for (const id of ['core-rules:355.15', 'core-rules:359.3.e.2', 'core-rules:359.3.e.5']) assert.ok(ids.includes(id));
  assert.deepEqual(response.body.citedRuleIds, expected.citedRuleIds.slice(0, 3));
  assert.deepEqual(response.body.citedCardIds, [star.id, retreat.id]);
  assert.deepEqual(response.body.citedCaseIds, []);
  assert.deepEqual(response.body.resolutionSteps, expected.resolutionSteps);
});

test('03 유성·빅토르: 피해·정리·유발의 기본 조항이 실제 AI 입력에 함께 들어간다', async t => {
  const server = await isolatedServer(t, [{ ruling: ruling() }]);
  const response = await server.ask(questions.timing, [star.id, leader.id]);
  assert.equal(response.body.status, 'ruling-generated');
  assert.equal(server.externalCalls.length, 1);
  const rules = suppliedRules(server.externalCalls[0]);
  for (const id of ['core-rules:158.3', 'core-rules:158.3.a', 'core-rules:321', 'core-rules:323.4', 'core-rules:418.1.b', 'core-rules:383.3']) {
    assert.ok(rules.some(r => r.id === id), `Timing regression: model did not receive ${id}`);
  }
  assert.match(byId.get('core-rules:321').officialTextEn, /Cleanup cannot occur/);
  assert.match(byId.get('core-rules:323.4').officialTextEn, /Lethal Damage.*killed/);
  assert.ok(response.body.resolutionSteps.at(-1).includes('신병 토큰 둘'));
  assert.equal(response.body.knowledgeReleaseId, 'regression-2026-10-09');
  const sent = JSON.stringify(server.externalCalls[0]);
  assert.ok(sent.includes('2026-10-09'));
  const input = server.externalCalls[0].input.find(m => m.role === 'user').content.find(c => c.type === 'input_text').text;
  const suppliedCards = JSON.parse(input.split('User-selected cards, resolved by the server from a versioned catalog:\n')[1].split('\n\nRetrieved official')[0]);
  assert.equal(suppliedCards.find(c => c.id === star.id).textEn, star.textEn);
});

test('04 빅토르도 같은 정리에서 죽는 예외: 스킬 출처 이탈 조항을 확보한다', () => {
  const question = '유성으로 빅토르 - 지도자와 다른 신병이 아닌 유닛에 치명적 피해가 표시되었습니다. 둘 다 같은 정리에서 죽으면 신병이 나오나요?';
  const result = search(index, question, [star, leader]);
  assertEvidence(result, ['core-rules:383.2.c.2', 'core-rules:321', 'core-rules:323.4']);
  // The source itself explicitly gives the Viktor exception; no inferred oracle is added.
  const original = byId.get('core-rules:383.2.c.2').officialTextEn;
  assert.match(original, /Viktor.*does not trigger if Viktor and another non-Recruit unit.*die/s);
});

test('05 실제 상황 정보 부족: 조건별 설명과 후속 질문을 불필요하게 재생성하지 않는다', () => {
  const conditional = ruling({ recommendation: '빅토르가 정리 후 살아 있으면 유발됩니다. 함께 죽었다면 유발되지 않습니다.',
    evidenceAssessment: { status: 'missing-fact', queries: [], ruleIds: [] },
    followUpQuestions: ['빅토르도 같은 정리에서 처치되었나요?'], citedRuleIds: ['core-rules:383.2.c.2'],
  });
  assert.equal(recoveryRequest(conditional), null);
});

test('06 근거 부족 초안: 한 번 보강한 뒤 정상 답변을 반환하고 두 호출을 정산한다', async t => {
  const server = await isolatedServer(t, [{ ruling: gapRuling() }, { ruling: ruling() }]);
  const response = await server.ask(questions.timing, [star.id, leader.id]);
  assert.equal(response.body.status, 'ruling-generated');
  assert.equal(response.body.ai.used, true);
  assert.equal(server.externalCalls.length, 2);
  assert.ok(suppliedRules(server.externalCalls[1]).some(r => r.id === 'core-rules:158.3.a'));
  const trace = await server.trace(response.body.requestId);
  assert.equal(trace.generationAttempts.length, 2);
  assert.equal(trace.inputTokens, 200);
  assert.equal(trace.outputTokens, 80);
  assert.equal(trace.generationAttempts[1].assessment.status, 'complete');
  assert.equal(server.calls().length, 2);
  assert.ok(server.calls().every(c => c.finished && c.kind === 'answer' && c.input_tokens === 100 && c.error === null));
});

test('07 보강 후에도 근거 부족: 세 번째 호출 없이 검색 오류로 기록한다', async t => {
  const server = await isolatedServer(t, [{ ruling: gapRuling() }, { ruling: gapRuling() }]);
  const response = await server.ask(questions.timing, [star.id, leader.id]);
  assert.equal(response.body.status, 'retrieval-error');
  assert.equal(response.body.ai.used, false);
  assert.equal(response.body.ai.error, 'unresolved_evidence_gap');
  assert.equal(response.body.requiresJudge, false);
  assert.equal(server.externalCalls.length, 2);
  assert.equal(server.calls().length, 2);
  const trace = await server.trace(response.body.requestId);
  assert.equal(trace.generationAttempts.length, 2);
  assert.equal(trace.modelError, 'unresolved_evidence_gap');
});

test('08 OpenAI 429 오류: 자동 재시도하지 않고 실패 호출을 정산한다', async t => {
  const server = await isolatedServer(t, [{ status: 429, error: { code: 'rate_limit_exceeded', message: 'Mock rate limit.' } }]);
  const response = await server.ask(questions.timing, [star.id, leader.id]);
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'model-error');
  assert.equal(response.body.ai.error, 'rate_limit_exceeded');
  assert.equal(server.externalCalls.length, 1);
  const calls = server.calls();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].finished);
  assert.equal(calls[0].error, 'rate_limit_exceeded');
});

test('09 개정 규칙: 같은 공식 문서의 서로 다른 버전 혼합을 거절한다', () => {
  assert.doesNotThrow(() => validateRules(fixture.rules));
  const current = byId.get('core-rules:158.3');
  const older = { ...byId.get('core-rules:321'), version: '2026-10-08', versionEn: '2026-10-08' };
  assert.throws(() => validateRules([current, older]), /Mixed official document versions/);
});

test('10 정상적인 부정 판정: 대상 재확정 금지를 근거 부족으로 오인하지 않아야 한다', () => {
  assert.match(byId.get('core-rules:355.15').officialTextEn, /cannot be changed after this step/);
  const definitive = ruling({ recommendation: '유성의 대상을 다시 확정할 수 없습니다. 후퇴 후 남은 유닛에만 피해 3을 입힙니다.',
    reasoning: '355.15는 이미 선택한 대상을 임의로 변경할 수 없다고 규정합니다.',
    resolutionSteps: ['후퇴를 먼저 처리합니다.', '유성의 남은 적법한 대상에 피해 3을 입힙니다.'],
    citedRuleIds: ['core-rules:355.15', 'core-rules:359.3.e.5'], citedCardIds: [star.id, retreat.id],
  });
  assert.equal(recoveryRequest(definitive), null, 'A supported prohibition is a complete ruling, not an evidence gap.');
});

test('11 실제 불확실성: complete로 잘못 표시한 초안도 처리 순서 미확정 표현을 감지한다', () => {
  const uncertain = ruling({ recommendation: '유발 스킬의 처리 순서를 확정할 수 없습니다.' });
  assert.equal(recoveryRequest(uncertain)?.reason, 'unresolved-ruling');
});
