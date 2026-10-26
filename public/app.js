const strings = {
  ko: {
    prototype: '로컬 테스트', language: '언어', eyebrow: 'TABLETOP RULES, CLEARLY',
    headline: '복잡한 상황도,<br><em>근거부터 차근차근.</em>',
    subhead: '게임 중 헷갈리는 규칙이나 대회 운영 상황을 적어 주세요. 공식 규칙과 리프트저지 사례를 찾아 함께 판단합니다.',
    modeRules: '게임 규칙 및 상황', modeTournament: '토너먼트 및 대회 상황', promptLabel: '어떤 상황인가요?', optional: '상세히 적을수록 좋아요',
    promptPlaceholder: '예: 상대 유닛이 이동한 뒤 이 효과를 사용할 수 있나요? 당시 순서와 관련된 카드 효과도 함께 적어 주세요.',
    addImage: '사진 첨부', imageHint: 'AI 생성이 켜져 있어 질문과 함께 분석합니다', imageHintPaused: 'AI 생성이 꺼져 있어 사진은 전송·분석하지 않습니다', tryExample: '이런 질문을 해보세요',
    example1: '쌍권총 난사와 반항', example2: '대회 중 실수 발견',
    examplePrompt1: '쌍권총 난사로 힘 10개를 지불하려 합니다. 주문이 해결되기 전에 상대가 반항을 사용해 무효화할 수 있나요? 지불 시점과 확인하는 비용을 구분해서 알려 주세요.',
    examplePrompt2: '대회 중 게임 상태를 잘못 진행한 것을 뒤늦게 발견했어요. 어디서부터 확인해야 하나요?',
    askButton: '근거 찾아 답변받기', disclaimer: 'AI 답변에는 오류가 있을 수 있습니다. 공식 대회 판정은 현장 저지에게 확인해 주세요.',
    privacyNote: '질문은 리프트저지 사례 검색에 전송됩니다. AI 답변 생성 시 질문·검색 근거·첨부 사진을 OpenAI로 보냅니다. 사진은 로그에 저장하지 않습니다.',
    privacyNoteSearchOnly: '질문은 리프트저지 사례 검색에 전송됩니다. 현재 OpenAI 생성 호출은 꺼져 있고 사진은 전송·분석하지 않습니다.',
    privacyNoteWithLogs: '질문·답변 본문 로깅이 켜져 있어 로컬 서버에 저장됩니다.',
    privacyNoteMetadata: '로컬 로그에는 처리 메타데이터만 남깁니다.',
    privacyNoteLoading: '연결 상태를 확인하고 있습니다.', answerLabel: '근거 기반 답변', newQuestion: '새 질문', sourceLinks: '출처 바로가기', officialLink: '공식 규칙 허브 ↗',
    ruleEvidenceTitle: '참조한 공식 룰', caseEvidenceTitle: '참고한 리프트저지 사례', followUpTitle: '확인이 필요한 점',
    cardEvidenceTitle: '질문에 연결된 카드', cardDetailsNeeded: '카드 확인 필요', caseComparison: 'AI가 설명한 사례 적용', sharedConditions: '공통 조건', differences: '차이점', application: '현재 질문에 적용',
    statusTitle: '현재 데이터 상태', statusValue: '로컬 규칙 색인 준비 중', statusBody: '공식 코어룰과 대회 규정을 한국어·영어 조항으로 검색하고, 리프트저지 사례를 실시간으로 찾습니다.',
    indexedRules: '색인 조항', indexedQa: '리프트저지 검색', sourcesTitle: '연결된 출처',
    sourcesSubtitle: '공식 문서와 커뮤니티 판례를 구분해 보여줍니다.', officialTag: '공식', communityTag: '커뮤니티',
    rulesHub: 'Rules Hub', sourceNote: '저지 사례는 요청마다 리프트저지 검색 인덱스에서 조회합니다.',
    principle: '근거가 부족하면 추측하지 않고, 확인이 필요한 지점을 알려드립니다.', principleCaption: '답변 설계 원칙',
    privacySide: '질문·사진을 로그에 저장하지 않습니다.',
    privacySideWithLogs: '질문·답변 본문 로그가 켜져 있습니다. 사진은 저장하지 않습니다.',
    noEvidence: '공식 룰 근거 없음', evidenceOnly: '근거 검색 완료 · API 키 필요', aiPaused: '근거 검색 완료 · AI 생성 일시 중지', rulingGenerated: 'AI 답변 생성', insufficient: '추가 확인 필요', modelError: 'AI 연결 오류 · 근거만 표시',
    sourceVersion: '버전 미기록', sourceUnknown: '근거 정보', openSource: '원문 열기 ↗',
    originalEnglish: '영문 원문', officialKorean: '공식 한국어', openEnglishPdf: '영문 PDF 보기 ↗', openKoreanPdf: '한국어 PDF 보기 ↗', openKoreanPage: '한국어 공식 페이지 ↗',
    fileTooLarge: '사진은 10MB 이하 파일을 선택해 주세요.', fileNotImage: '이미지 파일만 첨부할 수 있습니다.',
    askError: '질문을 처리하지 못했습니다. 서버가 실행 중인지 확인한 뒤 다시 시도해 주세요.', asking: '룰과 저지 사례 검색 중…',
    caseVerified: '리프트저지 검증됨', caseUnverified: '미검증 커뮤니티 사례', caseDeprecated: '폐기/대체된 사례', caseUnknown: '검증 상태 미확인',
    caseQuestion: '질문', caseAnswer: '답변', openJudgeCase: '리프트저지 원문 보기 ↗', noCases: '검색된 관련 사례가 없습니다.', noRuleMatches: '질문과 직접 연결되는 공식 조항이 없습니다.',
  },
  en: {
    prototype: 'LOCAL TEST', language: 'Language', eyebrow: 'TABLETOP RULES, CLEARLY',
    headline: 'Complex situations,<br><em>grounded in evidence.</em>',
    subhead: 'Ask about a game interaction or tournament situation. The assistant retrieves official rules and RiftJudge examples before answering.',
    modeRules: 'Game rules & situations', modeTournament: 'Tournament situations', promptLabel: 'What happened?', optional: 'More context helps',
    promptPlaceholder: 'For example: Can I use this effect after an opposing unit moves? Include the sequence and relevant card text if you can.',
    addImage: 'Attach image', imageHint: 'AI generation is enabled; images are analyzed with your question', imageHintPaused: 'AI generation is off; images are not sent or analyzed', tryExample: 'TRY A SAMPLE',
    example1: 'Bullet Time and Defy', example2: 'Found a tournament error',
    examplePrompt1: 'I intend to pay 10 power for Bullet Time. Can my opponent counter it with Defy before it resolves? Please distinguish the payment timing from the cost Defy checks.',
    examplePrompt2: 'We discovered a game-state error late during a tournament. What should we check first?',
    askButton: 'Search and answer', disclaimer: 'AI answers may be wrong. Ask the on-site judge for an official tournament ruling.',
    privacyNote: 'Your question is sent to RiftJudge for case search. AI generation sends your question, retrieved sources and attached images to OpenAI. Images are never logged.',
    privacyNoteSearchOnly: 'Your question is sent to RiftJudge for case search. OpenAI generation is currently off; images are not sent or analyzed.',
    privacyNoteWithLogs: 'Content logging is enabled: question and answer text are saved on this local server.',
    privacyNoteMetadata: 'Only processing metadata is saved in local logs.',
    privacyNoteLoading: 'Checking connection status.', answerLabel: 'Evidence-based answer', newQuestion: 'New question', sourceLinks: 'Open references', officialLink: 'Official Rules Hub ↗',
    ruleEvidenceTitle: 'Official rules referenced', caseEvidenceTitle: 'RiftJudge examples', followUpTitle: 'Details to confirm',
    cardEvidenceTitle: 'Cards linked to the question', cardDetailsNeeded: 'Card confirmation needed', caseComparison: 'AI explanation of applicability', sharedConditions: 'Shared conditions', differences: 'Differences', application: 'Application to this question',
    statusTitle: 'DATA STATUS', statusValue: 'Preparing local rules index', statusBody: 'Searches official core and tournament rules in Korean and English, then retrieves RiftJudge examples live.',
    indexedRules: 'Indexed rule clauses', indexedQa: 'RiftJudge search', sourcesTitle: 'Connected references',
    sourcesSubtitle: 'Official documents and community cases are clearly distinguished.', officialTag: 'OFFICIAL', communityTag: 'COMMUNITY',
    rulesHub: 'Rules Hub', sourceNote: 'RiftJudge cases are retrieved from its live search index for each request.',
    principle: 'When evidence is missing, the assistant says so instead of guessing.', principleCaption: 'ANSWERING PRINCIPLE',
    privacySide: 'Questions and images are not saved in logs.',
    privacySideWithLogs: 'Question and answer logging is on. Images are not logged.',
    noEvidence: 'No official rule evidence', evidenceOnly: 'References found · API key needed', aiPaused: 'References found · AI generation paused', rulingGenerated: 'AI answer generated', insufficient: 'More information needed', modelError: 'AI connection error · references only',
    sourceVersion: 'Version not recorded', sourceUnknown: 'Reference', openSource: 'Open source ↗',
    originalEnglish: 'English original', officialKorean: 'Official Korean', openEnglishPdf: 'Open English PDF ↗', openKoreanPdf: 'Open Korean PDF ↗', openKoreanPage: 'Open Korean official page ↗',
    fileTooLarge: 'Choose an image smaller than 10 MB.', fileNotImage: 'Only image files can be attached.',
    askError: 'Could not process the question. Check that the server is running, then try again.', asking: 'Searching rules and judge cases…',
    caseVerified: 'Verified on RiftJudge', caseUnverified: 'Unverified community case', caseDeprecated: 'Deprecated/superseded case', caseUnknown: 'Verification status unknown',
    caseQuestion: 'Question', caseAnswer: 'Answer', openJudgeCase: 'Open RiftJudge case ↗', noCases: 'No related examples found.', noRuleMatches: 'No official rule clauses directly matched this question.',
  },
};

const state = { category: 'rules', language: 'ko', imageUrl: null, imageFile: null, privacyReady: false, aiConfigured: false, aiEnabled: false };
let healthData = null;
let latestAnswer = null;
const form = document.querySelector('#ask-form');
const question = document.querySelector('#question');
const imageInput = document.querySelector('#image-input');
const imagePreview = document.querySelector('#image-preview');
const previewImage = document.querySelector('#preview-image');
const previewName = document.querySelector('#preview-name');
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
  document.querySelector('[data-i18n="privacySide"]').textContent = tr(!state.privacyReady ? 'privacyNoteLoading' : contentLoggingEnabled ? 'privacySideWithLogs' : 'privacySide');
  document.querySelector('[data-i18n="imageHint"]').textContent = tr(!state.privacyReady ? 'privacyNoteLoading' : state.aiEnabled ? 'imageHint' : 'imageHintPaused');
}

function applyLanguage(language) {
  state.language = language === 'en' ? 'en' : 'ko';
  document.documentElement.lang = state.language;
  cardComposer.setLanguage(state.language);
  document.title = state.language === 'en' ? 'Riftbound Judge — Rules Assistant' : 'Riftbound Judge — 룰 어시스턴트';
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const key = element.dataset.i18n;
    if (strings[state.language][key]) element.innerHTML = strings[state.language][key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.placeholder = tr(element.dataset.i18nPlaceholder); });
  updatePrivacyNotice();
  if (healthData) updateStatusPanel();
  document.querySelectorAll('[data-example]').forEach((element, index) => {
    element.textContent = tr(index === 0 ? 'example1' : 'example2');
    element.dataset.example = tr(index === 0 ? 'examplePrompt1' : 'examplePrompt2');
  });
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

document.querySelectorAll('.mode-tab').forEach((tab) => tab.addEventListener('click', () => {
  state.category = tab.dataset.category;
  document.querySelectorAll('.mode-tab').forEach((item) => {
    const selected = item === tab;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-selected', String(selected));
  });
}));

question.addEventListener('input', () => { document.querySelector('#char-count').textContent = String(question.value.length); });
document.querySelectorAll('.example-chip').forEach((chip) => chip.addEventListener('click', () => {
  question.value = chip.dataset.example;
  question.dispatchEvent(new Event('input'));
  question.focus();
}));

imageInput.addEventListener('change', () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert(tr('fileNotImage')); imageInput.value = ''; return; }
  if (file.size > 10 * 1024 * 1024) { alert(tr('fileTooLarge')); imageInput.value = ''; return; }
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.imageFile = file;
  state.imageUrl = URL.createObjectURL(file);
  previewImage.src = state.imageUrl;
  previewImage.alt = file.name;
  previewName.textContent = file.name;
  imagePreview.hidden = false;
});

function clearImage() {
  if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
  state.imageUrl = null;
  state.imageFile = null;
  previewImage.removeAttribute('src');
  imagePreview.hidden = true;
  imageInput.value = '';
}
document.querySelector('#remove-image').addEventListener('click', clearImage);

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
  for (const source of sources || []) {
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

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read image file.'));
    reader.readAsDataURL(file);
  });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = question.value.trim();
  if (!text) { question.focus(); return; }
  if (submitButton.disabled) return;
  submitButton.disabled = true;
  cardComposer.freeze(true);
  document.querySelectorAll('.example-chip, .mode-tab, #language-select, #image-input').forEach((node) => { node.disabled = true; });
  const buttonLabel = submitButton.querySelector('[data-i18n="askButton"]');
  const originalLabel = buttonLabel.textContent;
  buttonLabel.textContent = tr('asking');
  answerCard.hidden = true;
  try {
    const body = { question: text, category: state.category, language: state.language, cardIds: cardComposer.getCardIds() };
    if (state.aiEnabled && state.imageFile) body.imageDataUrl = await readImageAsDataUrl(state.imageFile);
    const response = await fetch('/api/ask', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || tr('askError'));
    answerCard.dataset.status = data.status;
    setAnswerStatus(data);
    latestAnswer = data;
    document.querySelector('#answer-recommendation').textContent = data.recommendation;
    document.querySelector('#answer-reasoning').textContent = data.reasoning;
    document.querySelector('#answer-notice').textContent = data.notice;
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
    document.querySelectorAll('.example-chip, .mode-tab, #language-select, #image-input').forEach((node) => { node.disabled = false; });
  }
});

document.querySelector('#clear-answer').addEventListener('click', () => {
  latestAnswer = null;
  question.value = '';
  cardComposer.reset();
  document.querySelector('#char-count').textContent = '0';
  clearImage();
  answerCard.hidden = true;
  question.focus();
});

applyLanguage('ko');
try {
  const savedLanguage = localStorage.getItem('riftbound-language');
  if (savedLanguage === 'en') { document.querySelector('#language-select').value = 'en'; applyLanguage('en'); }
} catch { /* local storage may be unavailable */ }

fetch('/api/health').then((response) => response.json()).then((data) => {
  healthData = data;
  contentLoggingEnabled = data.contentLogging === true;
  state.aiConfigured = data.aiConfigured === true;
  state.aiEnabled = data.aiEnabled === true;
  state.privacyReady = true;
  updatePrivacyNotice();
  document.querySelector('#indexed-rule-count').textContent = new Intl.NumberFormat(state.language === 'en' ? 'en-US' : 'ko-KR').format(data.indexedRuleCount || 0);
  document.querySelector('#indexed-qa-count').textContent = data.riftJudgeSearchAvailable === false ? 'OFFLINE' : 'LIVE';
  updateStatusPanel();
  submitButton.disabled = false;
}).catch(() => {});

function updateStatusPanel() {
  if (!healthData) return;
  const data = healthData;
  document.querySelector('#indexed-rule-count').textContent = new Intl.NumberFormat(state.language === 'en' ? 'en-US' : 'ko-KR').format(data.indexedRuleCount || 0);
  document.querySelector('#indexed-qa-count').textContent = data.riftJudgeSearchAvailable === false ? 'OFFLINE' : 'LIVE';
  document.querySelector('#status-value').textContent = state.aiConfigured
    ? (state.aiEnabled
      ? (state.language === 'en' ? `AI requests enabled · ${data.model}` : `AI 호출 설정됨 · ${data.model}`)
      : (state.language === 'en' ? 'API key saved · AI generation paused' : 'API 키 저장됨 · AI 생성 일시 중지'))
    : (state.language === 'en' ? 'Rules and judge search ready · AI key needed' : '룰·저지 사례 검색 준비됨 · AI 키 필요');
  document.querySelector('#status-body').textContent = state.language === 'en'
    ? 'Official rule text is indexed locally. Relevant RiftJudge cases are retrieved from its live search index for each question.'
    : '공식 룰 원문을 이 컴퓨터에 색인했습니다. 질문할 때마다 리프트저지 검색 인덱스에서 관련 사례를 찾습니다.';
}

if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
