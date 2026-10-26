const strings = {
  ko: {
    prototype: '베타', language: '언어', eyebrow: 'TABLETOP RULES, CLEARLY',
    headline: '복잡한 상황도,<br><em>근거부터 차근차근.</em>',
    subhead: '카드 효과부터 대회 중 상황까지, 궁금한 내용을 그대로 적어 주세요. 게임 규칙과 대회 규칙, 리프트저지 사례를 함께 살펴봅니다.',
    promptLabel: '어떤 상황인가요?',
    promptPlaceholder: '예: 대회 시간 종료 후 마지막 차례에 시간 왜곡을 사용했어요. 추가 차례를 진행할 수 있나요?',
    askButton: '근거 찾아 답변받기', footerDisclaimer: '리프트어시는 코어룰, 토너먼트룰, Riftjudge Q&A 기록을 참조하여 답변하는 AI 어시스턴트이므로, 100% 정확하지 않을 수 있습니다.',
    privacyNote: '질문은 리프트저지 사례 검색에 전송됩니다. AI 답변 생성 시 질문과 검색 근거를 OpenAI로 보냅니다.',
    privacyNoteSearchOnly: '질문은 리프트저지 사례 검색에 전송됩니다. 현재 OpenAI 생성 호출은 꺼져 있습니다.',
    privacyNoteWithLogs: '운영 서버에 질문·답변·근거는 7일, 처리 기록은 30일 보관합니다. 제보에 연결한 자료는 최대 90일 보관합니다. 개인정보는 적지 마세요.',
    privacyNoteMetadata: '운영 서버에 질문·답변·근거는 7일, 처리 기록은 30일 보관합니다. 제보에 연결한 자료는 최대 90일 보관합니다. 개인정보는 적지 마세요.',
    privacyNoteLoading: '연결 상태를 확인하고 있습니다.', answerLabel: '근거 기반 답변', newQuestion: '새 질문', sourceLinks: '출처 바로가기', officialLink: '공식 규칙 허브 ↗',
    ruleEvidenceTitle: '참조한 공식 룰', caseEvidenceTitle: '참고한 리프트저지 사례', followUpTitle: '확인이 필요한 점',
    cardEvidenceTitle: '질문에 연결된 카드', cardDetailsNeeded: '카드 확인 필요', caseComparison: 'AI가 설명한 사례 적용', sharedConditions: '공통 조건', differences: '차이점', application: '현재 질문에 적용',
    sourcesTitle: '연결된 출처',
    sourcesSubtitle: '공식 문서와 커뮤니티 판례를 구분해 보여줍니다.', officialTag: '공식', communityTag: '커뮤니티',
    rulesHub: 'Rules Hub', sourceNote: '저지 사례는 요청마다 리프트저지 검색 인덱스에서 조회합니다.',
    noEvidence: '공식 룰 근거 없음', evidenceOnly: '근거 검색 완료 · API 키 필요', aiPaused: '근거 검색 완료 · AI 생성 일시 중지', rulingGenerated: 'AI 답변 생성', insufficient: '추가 확인 필요', modelError: 'AI 연결 오류 · 근거만 표시',
    sourceVersion: '버전 미기록', sourceUnknown: '근거 정보', openSource: '원문 열기 ↗',
    originalEnglish: '영문 원문', officialKorean: '공식 한국어', openEnglishPdf: '영문 PDF 보기 ↗', openKoreanPdf: '한국어 PDF 보기 ↗', openKoreanPage: '한국어 공식 페이지 ↗',
    askError: '질문을 처리하지 못했습니다. 서버가 실행 중인지 확인한 뒤 다시 시도해 주세요.', asking: '룰과 저지 사례 검색 중…',
    caseVerified: '리프트저지 검증됨', caseUnverified: '미검증 커뮤니티 사례', caseDeprecated: '폐기/대체된 사례', caseUnknown: '검증 상태 미확인',
    caseQuestion: '질문', caseAnswer: '답변', openJudgeCase: '리프트저지 원문 보기 ↗', noCases: '검색된 관련 사례가 없습니다.', noRuleMatches: '질문과 직접 연결되는 공식 조항이 없습니다.',
  },
  en: {
    prototype: 'BETA', language: 'Language', eyebrow: 'TABLETOP RULES, CLEARLY',
    headline: 'Complex situations,<br><em>grounded in evidence.</em>',
    subhead: 'From card interactions to tournament situations, just describe what happened. The assistant considers gameplay rules, tournament rules and RiftJudge examples together.',
    promptLabel: 'What happened?',
    promptPlaceholder: 'For example: I played Time Warp on the final turn after time was called at a tournament. Can I take another turn?',
    askButton: 'Search and answer', footerDisclaimer: 'RiftAssi is an AI assistant that references the Core Rules, Tournament Rules, and RiftJudge Q&A. Its answers may contain errors.',
    privacyNote: 'Your question is sent to RiftJudge for case search. AI generation sends your question and retrieved sources to OpenAI.',
    privacyNoteSearchOnly: 'Your question is sent to RiftJudge for case search. OpenAI generation is currently off.',
    privacyNoteWithLogs: 'Questions, answers and references are retained for 7 days, metadata for 30 days, and reports with linked records for up to 90 days. Do not enter personal information.',
    privacyNoteMetadata: 'Questions, answers and references are retained for 7 days, metadata for 30 days, and reports with linked records for up to 90 days. Do not enter personal information.',
    privacyNoteLoading: 'Checking connection status.', answerLabel: 'Evidence-based answer', newQuestion: 'New question', sourceLinks: 'Open references', officialLink: 'Official Rules Hub ↗',
    ruleEvidenceTitle: 'Official rules referenced', caseEvidenceTitle: 'RiftJudge examples', followUpTitle: 'Details to confirm',
    cardEvidenceTitle: 'Cards linked to the question', cardDetailsNeeded: 'Card confirmation needed', caseComparison: 'AI explanation of applicability', sharedConditions: 'Shared conditions', differences: 'Differences', application: 'Application to this question',
    sourcesTitle: 'Connected references',
    sourcesSubtitle: 'Official documents and community cases are clearly distinguished.', officialTag: 'OFFICIAL', communityTag: 'COMMUNITY',
    rulesHub: 'Rules Hub', sourceNote: 'RiftJudge cases are retrieved from its live search index for each request.',
    noEvidence: 'No official rule evidence', evidenceOnly: 'References found · API key needed', aiPaused: 'References found · AI generation paused', rulingGenerated: 'AI answer generated', insufficient: 'More information needed', modelError: 'AI connection error · references only',
    sourceVersion: 'Version not recorded', sourceUnknown: 'Reference', openSource: 'Open source ↗',
    originalEnglish: 'English original', officialKorean: 'Official Korean', openEnglishPdf: 'Open English PDF ↗', openKoreanPdf: 'Open Korean PDF ↗', openKoreanPage: 'Open Korean official page ↗',
    askError: 'Could not process the question. Check that the server is running, then try again.', asking: 'Searching rules and judge cases…',
    caseVerified: 'Verified on RiftJudge', caseUnverified: 'Unverified community case', caseDeprecated: 'Deprecated/superseded case', caseUnknown: 'Verification status unknown',
    caseQuestion: 'Question', caseAnswer: 'Answer', openJudgeCase: 'Open RiftJudge case ↗', noCases: 'No related examples found.', noRuleMatches: 'No official rule clauses directly matched this question.',
  },
};

const state = { language: 'ko', privacyReady: false, aiConfigured: false, aiEnabled: false };
let latestAnswer = null;
const form = document.querySelector('#ask-form');
const question = document.querySelector('#question');
const submitButton = document.querySelector('#submit-button');
const answerCard = document.querySelector('#answer-card');
const evidenceList = document.querySelector('#evidence-list');
const caseList = document.querySelector('#case-list');
const cardComposer = new window.CardComposer(question, state.language);
let contentLoggingEnabled = false;

function tr(key) { return strings[state.language][key] || strings.ko[key] || key; }

function updatePrivacyNotice() {
  const notice = !state.privacyReady ? tr('privacyNoteLoading')
    : `${tr(state.aiEnabled ? 'privacyNote' : 'privacyNoteSearchOnly')} ${tr(contentLoggingEnabled ? 'privacyNoteWithLogs' : 'privacyNoteMetadata')}`;
  document.querySelector('[data-i18n^="privacyNote"]').textContent = notice;
}

function applyLanguage(language) {
  state.language = language === 'en' ? 'en' : 'ko';
  document.documentElement.lang = state.language;
  cardComposer.setLanguage(state.language);
  document.title = state.language === 'en' ? 'Rift Assistant — Riftbound Rules' : '리프트어시 — 리프트바운드 규칙 도우미';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (strings[state.language][key]) element.innerHTML = strings[state.language][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.placeholder = tr(element.dataset.i18nPlaceholder); });
  updatePrivacyNotice();
  document.querySelector('#char-count').textContent = String(question.value.length);
  if (latestAnswer) {
    renderEvidence(latestAnswer.evidence, latestAnswer.citedRuleIds || []);
    renderCases(latestAnswer.judgeCases, latestAnswer.citedCaseIds || [], latestAnswer.caseComparisons || []);
  }
}

document.querySelector('#language-select').addEventListener('change', (event) => {
  applyLanguage(event.target.value);
  try { localStorage.setItem('riftbound-language', state.language); } catch { /* optional preference */ }
});

question.addEventListener('input', () => { document.querySelector('#char-count').textContent = String(question.value.length); });

function safeLink(url, label) {
  if (!url || !/^https:\/\//iu.test(url)) return null;
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function appendSourceLinks(sources) {
  const list = document.querySelector('#source-list');
  list.replaceChildren();
  for (const source of (sources || []).filter((item) => item.id !== 'riftnaru')) {
    const link = safeLink(source.url, source.title);
    if (link) list.append(link);
  }
}

function renderEvidence(evidence, citedRuleIds = []) {
  window.EvidenceView.renderRules(evidenceList, evidence, citedRuleIds, state.language, tr('noRuleMatches'));
}

function renderCases(cases, citedCaseIds = [], comparisons = []) {
  window.EvidenceView.renderCases(caseList, cases, citedCaseIds, comparisons, state.language, tr('noCases'));
}

function setAnswerStatus(data) {
  const labels = {
    'ruling-generated': 'rulingGenerated', 'insufficient-evidence': 'insufficient', 'no-evidence': 'noEvidence',
    'evidence-only': 'evidenceOnly', 'ai-paused': 'aiPaused', 'model-error': 'modelError', 'card-details-needed': 'cardDetailsNeeded',
  };
  document.querySelector('#answer-status').textContent = tr(labels[data.status] || 'evidenceOnly');
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = question.value.trim();
  if (!text) { question.focus(); return; }
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  cardComposer.freeze(true);
  document.querySelectorAll('#language-select').forEach((node) => { node.disabled = true; });
  const buttonLabel = submitButton.querySelector('[data-i18n="askButton"]');
  const originalLabel = buttonLabel.textContent;
  buttonLabel.textContent = tr('asking');
  answerCard.hidden = true;
  window.dispatchEvent(new CustomEvent('rift-answer', { detail: null }));
  try {
    const body = { clientKey: crypto.randomUUID(), question: text, language: state.language, cardIds: cardComposer.getCardIds() };
    const response = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    window.dispatchEvent(new CustomEvent('rift-answer', { detail: { requestId: data.requestId || null } }));
    if (!response.ok) throw new Error(data.error || tr('askError'));
    answerCard.dataset.status = data.status;
    setAnswerStatus(data);
    latestAnswer = data;
    document.querySelector('#answer-recommendation').textContent = data.recommendation;
    document.querySelector('#answer-reasoning').textContent = data.reasoning;
    document.querySelector('#answer-notice').textContent = '';
    document.querySelector('#answer-notice').hidden = true;
    renderEvidence(data.evidence, data.citedRuleIds || []);
    renderCases(data.judgeCases, data.citedCaseIds || [], data.caseComparisons || []);
    cardComposer.renderAnswer(document.querySelector('#answer-cards'), data.cards, data.citedCardIds || []);
    document.querySelector('#answer-card-section').hidden = !data.cards?.length;
    const followUp = document.querySelector('#follow-up-list');
    followUp.replaceChildren();
    for (const prompt of data.followUpQuestions || []) {
      const item = document.createElement('li');
      item.textContent = prompt;
      followUp.append(item);
    }
    document.querySelector('#follow-up-section').hidden = !(data.followUpQuestions || []).length;
    appendSourceLinks(data.sources);
    answerCard.hidden = false;
    answerCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    latestAnswer = null;
    answerCard.dataset.status = 'error';
    document.querySelector('#answer-status').textContent = 'ERROR';
    document.querySelector('#answer-recommendation').textContent = error.message || tr('askError');
    document.querySelector('#answer-reasoning').textContent = '';
    evidenceList.replaceChildren();
    caseList.replaceChildren();
    document.querySelector('#answer-cards').replaceChildren();
    document.querySelector('#answer-card-section').hidden = true;
    document.querySelector('#follow-up-section').hidden = true;
    document.querySelector('#answer-notice').textContent = '';
    appendSourceLinks([]);
    answerCard.hidden = false;
  } finally {
    buttonLabel.textContent = originalLabel;
    submitButton.disabled = false;
    cardComposer.freeze(false);
    document.querySelectorAll('#language-select').forEach((node) => { node.disabled = false; });
  }
});

document.querySelector('#clear-answer').addEventListener('click', () => {
  latestAnswer = null;
  window.dispatchEvent(new CustomEvent('rift-answer', { detail: null }));
  question.value = '';
  cardComposer.reset();
  document.querySelector('#char-count').textContent = '0';

  answerCard.hidden = true;
  question.focus();
});

applyLanguage('ko');
try {
  const savedLanguage = localStorage.getItem('riftbound-language');
  if (savedLanguage === 'en') { document.querySelector('#language-select').value = 'en'; applyLanguage('en'); }
} catch { /* local storage may be unavailable */ }

fetch('/api/health', { cache: 'no-store' }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Connection failed'); return data; }).then((data) => {
  if (typeof data.version === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(data.version)) {
    document.querySelectorAll('[data-app-version]').forEach(node => { node.textContent = `v${data.version}`; });
  }
  contentLoggingEnabled = data.contentLogging === true;
  state.aiConfigured = data.aiConfigured === true;
  state.aiEnabled = data.aiEnabled === true;
  state.privacyReady = true;
  updatePrivacyNotice();
  submitButton.disabled = false;
}).catch(() => {});

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
