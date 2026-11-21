(() => {
  const words = {
    ko: {
      core: '코어룰', tournament: '토너먼트 룰', supplement: '보충 규정', case: '저징 사례', cited: '인용',
      official: '공식 한국어', machine: 'AI 한국어 번역 · 공식 번역 아님',
      original: '원문 출처 ↗', englishPdf: '영문 PDF ↗', koreanPdf: '한국어 PDF ↗', koreanPage: '한국어 출처 ↗',
      question: '질문', answer: '답변', loading: '한국어 번역을 불러오는 중…',
      unavailable: '한국어 번역을 준비하지 못했습니다. 출처 링크에서 원문을 확인할 수 있습니다.',
      sourceMissing: '수집된 질문이나 답변이 누락되어 번역할 수 없습니다. 출처에서 원문을 확인해 주세요.',
      restricted: '이 자료의 한국어 번역은 제공되지 않습니다. 출처에서 원문을 확인해 주세요.',
      serviceError: '번역 서비스를 일시적으로 이용할 수 없습니다.',
      authError: '번역 서비스 인증에 문제가 있습니다. 출처에서 원문을 확인해 주세요.',
      quota: '번역 서비스 사용 한도에 도달했습니다. 출처에서 원문을 확인해 주세요.',
      invalidOutput: '번역 결과를 검증하지 못했습니다.',
      cacheError: '번역을 저장하지 못했습니다. 출처에서 원문을 확인해 주세요.',
      reload: '번역할 자료가 바뀌었거나 조회 기간이 지났습니다. 새 질문에서 다시 확인해 주세요.',
      inputLimit: '자료가 번역 입력 한도를 초과했습니다. 출처에서 원문을 확인해 주세요.',
      unknownVersion: '적용 규칙 버전 미기록',
      paused: 'AI 생성이 꺼져 있어 새 번역을 만들 수 없습니다. 출처 링크에서 원문을 확인해 주세요.',
      busy: '다른 자료를 번역 중입니다. 잠시 뒤 다시 시도해 주세요.',
      incomplete: '번역이 출력 한도 안에서 완료되지 않았습니다. 일부 번역은 표시하지 않습니다. 출처에서 원문을 확인해 주세요.',
      excerpt: '확보한 원문 일부를 표시합니다. 전체 내용은 출처에서 확인해 주세요.',
      retry: '번역 다시 시도', untitled: '한국어 제목 준비 중',
      verified: '리프트저지 검증됨 · 커뮤니티 사례', unverified: '미검증 커뮤니티 사례', deprecated: '폐기/대체된 사례', unknown: '검증 상태 미확인',
      comparison: '현재 질문과 비교', sharedConditions: '공통 조건', differences: '차이점', application: '현재 질문에 적용',
    },
    en: {
      core: 'Core Rules', tournament: 'Tournament Rules', supplement: 'Supplement', case: 'Judge case', cited: 'Cited',
      official: 'Official Korean', machine: 'AI Korean translation · unofficial',
      original: 'Original source ↗', englishPdf: 'English PDF ↗', koreanPdf: 'Korean PDF ↗', koreanPage: 'Korean source ↗',
      question: 'Question', answer: 'Answer', loading: 'Loading Korean translation…',
      unavailable: 'Translation unavailable. Use the source link to read the original.', paused: 'AI generation is paused.',
      sourceMissing: 'The collected question or answer is missing. Read the original source.',
      restricted: 'Korean translation is unavailable for this source.', serviceError: 'The translation service is temporarily unavailable.',
      authError: 'Translation service authentication failed. Read the original source.',
      quota: 'The translation service quota was reached. Read the original source.',
      invalidOutput: 'The translation could not be validated.', cacheError: 'The translation could not be saved.',
      reload: 'This source changed or expired. Start a new question to view it.', inputLimit: 'This source exceeds the translation input limit.',
      unknownVersion: 'Rules version not recorded',
      busy: 'Other sources are being translated. Please try again shortly.', incomplete: 'Translation reached its output limit. Read the original source.',
      excerpt: 'Only an excerpt was retrieved. Follow the source link for the complete answer.',
      retry: 'Retry translation', untitled: 'Title unavailable',
      verified: 'Verified on RiftJudge · community case', unverified: 'Unverified community case', deprecated: 'Deprecated/superseded case', unknown: 'Verification status unknown',
      comparison: 'Comparison with this question', sharedConditions: 'Shared conditions', differences: 'Differences', application: 'Application',
    },
  };
  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }
  function link(url, text) {
    if (!/^https:\/\//iu.test(url || '')) return null;
    const anchor = node('a', '', text);
    anchor.href = url; anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
    return anchor;
  }
  function disclosure(container, title, cited, t) {
    const details = node('details', `evidence-item evidence-disclosure${cited ? ' cited-evidence' : ''}`);
    const summary = node('summary', 'evidence-summary');
    const label = node('span', 'evidence-summary-title', title);
    label.title = title;
    summary.append(label);
    if (cited) summary.append(node('span', 'citation-badge', t.cited));
    const arrow = node('span', 'disclosure-chevron');
    arrow.setAttribute('aria-hidden', 'true');
    summary.append(arrow);
    const body = node('div', 'evidence-body');
    details.append(summary, body);
    container.append(details);
    return { details, body, label };
  }
  function paragraph(container, title, text, className = 'rule-quote') {
    if (title) container.append(node('strong', 'quote-label', title));
    container.append(node('p', className, text || ''));
  }
  function sourceLinks(container, entries) {
    const links = node('div', 'evidence-links');
    for (const [url, title] of entries) { const anchor = link(url, title); if (anchor) links.append(anchor); }
    container.append(links);
  }

  function onExpandTranslation(row, area, item, kind, t, render) {
    if (item.localization?.cached) { render(item.localization.cached); return; }
    let started = false;
    const status = node('p', 'translation-status', t.loading);
    status.setAttribute('role', 'status');
    area.append(status);
    const load = async () => {
      if (started || !row.details.isConnected) return;
      started = true;
      area.replaceChildren(status);
      status.textContent = t.loading;
      const blocked = {
        translation_source_incomplete: t.sourceMissing,
        translation_restricted: t.restricted,
        translation_paused: t.paused,
      };
      if (blocked[item.localization?.status] || !item.localization?.key) {
        status.textContent = blocked[item.localization?.status] || t.unavailable;
        return;
      }
      try {
        const response = await fetch('/api/sources/translate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: item.localization.key, kind, id: String(item.id), requestId: item.requestId }),
          signal: AbortSignal.timeout(70000),
        });
        const data = await response.json();
        if (!response.ok || !data.translation) throw Object.assign(new Error('Translation unavailable'), { code: data.code });
        item.localization.cached = data.translation;
        if (row.details.isConnected) render(data.translation);
      } catch (error) {
        const messages = {
          ...blocked, source_translation_restricted: t.restricted, translation_busy: t.busy,
          translation_authentication: t.authError, translation_quota: t.quota,
          translation_incomplete: t.incomplete, translation_invalid_output: t.invalidOutput,
          translation_cache_failed: t.cacheError, translation_prepare_failed: t.unavailable,
          source_permissions_changed: t.reload, source_not_found: t.reload,
          translation_input_limit: t.inputLimit, translation_rejected: t.restricted,
        };
        status.textContent = messages[error.code] || t.serviceError;
        const retryable = !error.code || ['translation_busy', 'translation_unavailable', 'translation_invalid_output', 'translation_prepare_failed'].includes(error.code);
        if (!retryable) return;
        const retry = node('button', 'translation-retry', t.retry);
        retry.type = 'button';
        retry.addEventListener('click', () => { started = false; load(); });
        area.append(retry);
      }
    };
    row.details.addEventListener('toggle', () => { if (row.details.open && !started) load(); });
  }

  function renderRules(container, items, citedIds, language, emptyText) {
    container.replaceChildren();
    const t = words[language];
    if (!items?.length) { container.append(node('p', 'empty-evidence', emptyText)); return; }
    for (const item of items) {
      const name = item.documentId === 'tournament-rules' ? t.tournament : item.ruleId ? t.core : t.supplement;
      const row = disclosure(container, `${name} - ${item.ruleId || item.id}`, citedIds.includes(item.id), t);
      row.body.append(node('div', 'evidence-meta', `${item.sourceName || name}${item.version ? ` · v${item.version}` : ''}`));
      const text = node('div', 'localized-source');
      row.body.append(text);
      if (language === 'en') paragraph(text, '', item.officialTextEn || item.officialTextKo);
      else if (item.officialTextKo) paragraph(text, t.official, item.officialTextKo);
      else onExpandTranslation(row, text, item, 'rule', t, (translation) => {
        text.replaceChildren(); paragraph(text, t.machine, translation.body);
      });
      sourceLinks(row.body, [[item.url, t.original], [item.pdfUrlEn, t.englishPdf], [item.urlKo, t.koreanPage], [item.pdfUrlKo, t.koreanPdf]]);
    }
  }

  function renderCases(container, items, citedIds, comparisons, language, emptyText) {
    container.replaceChildren();
    const t = words[language];
    if (!items?.length) { container.append(node('p', 'empty-evidence', emptyText)); return; }
    for (const item of items) {
      const generatedTitle = language === 'ko' ? (/[가-힣]/u.test(item.displayTitle || '') ? item.displayTitle : '')
        : (item.displayTitleLanguage === 'en' ? item.displayTitle : item.question);
      const title = generatedTitle || (language === 'ko' ? item.localization?.cached?.title : '') || `#${item.id} · ${t.untitled}`;
      const row = disclosure(container, `${t.case} - ${title}`, citedIds.includes(String(item.id)), t);
      row.body.append(node('div', `evidence-meta judge-status status-${item.status || 'unknown'}`,
        `${t[item.status] || t.unknown} · #${item.id} · ${item.rulesVersion ? `Rules v${item.rulesVersion}` : t.unknownVersion}${item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString(language === 'ko' ? 'ko-KR' : 'en-US')}` : ''}`));
      const content = node('div', 'localized-source');
      row.body.append(content);
      if (language === 'en') {
        paragraph(content, t.question, item.question, 'case-question');
        paragraph(content, t.answer, item.answer, 'case-answer');
      } else onExpandTranslation(row, content, item, 'case', t, (translation) => {
        content.replaceChildren(node('p', 'translation-note', t.machine));
        paragraph(content, t.question, translation.question, 'case-question');
        paragraph(content, t.answer, translation.answer, 'case-answer');
        if (!generatedTitle) {
          row.label.textContent = `${t.case} - ${translation.title}`;
          row.label.title = row.label.textContent;
        }
      });
      if (item.bodyComplete === false || item.localization?.excerpt) row.body.append(node('p', 'translation-note', t.excerpt));
      const comparison = comparisons.find((entry) => String(entry.caseId) === String(item.id));
      if (comparison && citedIds.includes(String(item.id))) {
        const explanation = node('div', 'case-comparison');
        explanation.append(node('strong', '', t.comparison));
        for (const key of ['sharedConditions', 'differences', 'application']) explanation.append(node('p', '', `${t[key]}: ${comparison[key] || ''}`));
        row.body.append(explanation);
      }
      sourceLinks(row.body, [[item.url, t.original]]);
    }
  }
  window.EvidenceView = { renderRules, renderCases };
})();
