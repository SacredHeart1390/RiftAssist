const crypto = require('node:crypto');
const terminology = require('./terminology-ko');
const { officialURL } = require('./card-publication');
const VERSION = 'ko-card-translation-1';
const STYLE_VERSION = 'ko-card-style-1';
const VALIDATOR_VERSION = 'ko-card-checks-1';
const stable = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : stable(value)).digest('hex');
function bounded(value, max = 12000) { return typeof value === 'string' && value.length <= max; }
function jsonValue(value, depth = 0) {
  if (depth > 4) throw new Error('Card mechanics exceed the supported structure.');
  if (value == null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return value;
  if (bounded(value, 300)) return value;
  if (Array.isArray(value) && value.length <= 100) return value.map(v => jsonValue(v, depth + 1));
  if (value && Object.getPrototypeOf(value) === Object.prototype && Object.keys(value).length <= 30) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => {
      if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,60}$/u.test(k)) throw new Error('Invalid mechanics field.');
      return [k, jsonValue(v, depth + 1)];
    }));
  }
  throw new Error('Invalid card mechanics.');
}
function strings(value, max = 100) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > max || value.some(v => !bounded(v, 100) || !v.trim())) throw new Error('Invalid card terminology/symbols.');
  return [...value];
}
function symbolTokens(text) { return text.match(/\[[^\]\r\n]{1,80}\]|\{[^}\r\n]{1,80}\}|[↻↷↶⚡✦♠♥♦♣∞]/gu) || []; }
function englishSource(card) {
  return { name: card.nameEn, text: card.textEn, keywords: strings(card.keywordsEn), cost: jsonValue(card.cost || {}),
    stats: jsonValue(card.stats || {}), symbols: [...new Set([...strings(card.symbols), ...symbolTokens(card.textEn)])] };
}
function clauses(text) {
  const parts = text.split(/(\r?\n+|(?<=[.!?])[ \t]+)/u), rows = [];
  for (let i = 0; i < parts.length; i += 2) if (parts[i]) rows.push({ id: `c${rows.length + 1}`, text: parts[i], separator: parts[i + 1] || '' });
  return rows;
}
function buildGlossary({ rules = [], officialCards = [], mappings = [] } = {}) {
  const terms = new Map(), conflicts = [];
  for (const entry of terminology.glossary(rules)) terms.set(entry.en.toLowerCase(), { en: entry.en, ko: entry.ko,
    kind: 'term', authority: 'official-rule', reference: entry.ruleId, version: entry.version || '', url: entry.url || '' });
  for (const item of mappings) {
    const card = officialCards.find(c => c.id === item.cardId), ko = card?.officialKorean;
    if (!card || card.source.kind !== 'riot-api' || !card.textVerified || !card.permissions.translation || !card.permissions.modelInput
      || !ko?.text || !officialURL(ko.url) || !ko.version || !officialURL(card.source.url) || !item.reviewReference || !bounded(item.en, 100) || !item.en || !bounded(item.ko, 100) || !item.ko
      || !['term', 'keyword', 'name'].includes(item.kind) || ko.englishVersion !== card.source.version
      || !`${card.nameEn}\n${card.textEn}\n${(card.keywordsEn || []).join(' ')}`.toLowerCase().includes(item.en.toLowerCase())
      || !`${ko.name}\n${ko.text}\n${(ko.keywords || []).join(' ')}`.includes(item.ko)) throw new Error('Glossary terms require reviewed, aligned official-card evidence and input permissions.');
    const next = { en: item.en, ko: item.ko, kind: item.kind, authority: 'official-card', reference: item.reviewReference,
      cardId: card.id, englishHash: hash(englishSource(card)), koreanHash: hash(ko), version: ko.version, url: ko.url };
    const previous = terms.get(item.en.toLowerCase());
    if (previous?.authority === 'official-card' && previous.ko !== next.ko) { conflicts.push(item.en); continue; }
    terms.set(item.en.toLowerCase(), next); // Reviewed official-card wording has priority over rule headings.
  }
  const entries = [...terms.values()].sort((a, b) => a.en.localeCompare(b.en));
  const styleExamples = officialCards.filter(card => card.source.kind === 'riot-api' && card.textVerified && card.permissions.translation && card.permissions.modelInput
    && card.officialKorean?.text && officialURL(card.source.url) && officialURL(card.officialKorean.url) && card.officialKorean.version && card.officialKorean.englishVersion === card.source.version
    && card.textEn.length <= 2000 && card.officialKorean.text.length <= 2000).slice(0, 3).map(card => ({
    englishName: card.nameEn, englishText: card.textEn, koreanName: card.officialKorean.name, koreanText: card.officialKorean.text,
    version: card.officialKorean.version, url: card.officialKorean.url, englishHash: hash(englishSource(card)), koreanHash: hash(card.officialKorean),
  }));
  return { version: VERSION, entries, conflicts, styleExamples, digest: hash({ entries, conflicts, styleExamples }) };
}
const numberWords = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
function numbers(text, language) {
  let value = text.normalize('NFKC');
  if (language === 'en') {
    value = value.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten)\b/giu, x => numberWords[x.toLowerCase()]);
    value = value.replace(/\ba(?:n)?\s+(?=card\b|unit\b|rune\b)/giu, '1 ');
  } else {
    value = value.replace(/(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(?=\s*(?:장|개|번|명))/gu,
      x => ({ 한: '1', 두: '2', 세: '3', 네: '4', 다섯: '5', 여섯: '6', 일곱: '7', 여덟: '8', 아홉: '9', 열: '10' })[x]);
  }
  return (value.match(/[+-]?\d+(?:\.\d+)?(?:%|\/\d+)?/gu) || []).sort();
}
const markers = [
  ['negation', /\b(?:cannot|can't|must not|do not|does not|don't|not|no|never|without)\b/iu, /않|못|없|금지|불가/u, 'error'],
  ['condition', /\bif\b/iu, /경우|하면|라면|다면/u, 'review'],
  ['unless', /\bunless\b/iu, /않는 한|않으면|아니라면|아닌 경우|제외/u, 'review'],
  ['optional', /\bmay\b/iu, /할 수 있|해도 됩|선택/u, 'review'],
  ['mandatory', /\bmust\b(?! not)/iu, /해야|반드시/u, 'review'],
  ['up-to', /\bup to\b/iu, /최대|까지/u, 'review'],
  ['at-least', /\bat least\b/iu, /이상|최소/u, 'review'],
  ['target', /\btarget(?:s|ed)?\b/iu, /대상/u, 'review'],
  ['friendly', /\bfriendly\b/iu, /아군|자신이 조종|내가 조종/u, 'review'],
  ['opposing', /\bopposing|opponent'?s?|enemy\b/iu, /상대|적군/u, 'review'],
  ['before', /\bbefore\b/iu, /전에|이전/u, 'review'],
  ['after', /\bafter\b/iu, /후|뒤/u, 'review'],
  ['until', /\buntil\b/iu, /까지/u, 'review'],
  ['each', /\beach\b/iu, /각|마다/u, 'review'],
  ['only', /\bonly\b/iu, /만|오직/u, 'review'],
  ['start', /\bstart of\b/iu, /시작|개시/u, 'review'],
  ['end', /\bend of\b/iu, /종료|끝/u, 'review'],
];
function validateTranslation(source, output, glossary) {
  const issues = [], add = (code, severity = 'error', clauseId = null) => issues.push({ code, severity, clauseId });
  const required = ['nameKo', 'clauses', 'keywordsKo', 'cost', 'stats', 'symbols', 'uncertainties'];
  if (!output || Object.keys(output).sort().join() !== required.sort().join()
    || !bounded(output.nameKo, 300) || !output.nameKo.trim() || !/[가-힣]/u.test(output.nameKo)
    || !Array.isArray(output.clauses) || !Array.isArray(output.keywordsKo) || !Array.isArray(output.uncertainties)
    || output.uncertainties.length > 20 || output.uncertainties.some(v => !bounded(v, 300))) return { status: 'blocked', issues: [{ code: 'invalid-provider-output', severity: 'error', clauseId: null }], manualReviewRequired: true };
  const rows = clauses(source.text);
  if (stable(source.name.match(/\d+/gu) || []) !== stable(output.nameKo.normalize('NFKC').match(/\d+/gu) || [])) add('name-number-mismatch');
  if (rows.length !== output.clauses.length || output.clauses.some((row, i) => row?.id !== rows[i]?.id || !bounded(row.textKo) || !row.textKo.trim() || !/[가-힣]/u.test(row.textKo))) add('clause-alignment');
  for (const [key, value] of [['cost', source.cost], ['stats', source.stats], ['symbols', source.symbols]]) if (stable(output[key]) !== stable(value)) add(`${key}-mismatch`);
  for (const [i, row] of rows.entries()) {
    const ko = output.clauses[i]?.textKo;
    if (!bounded(ko) || !ko) continue;
    if (stable(numbers(row.text, 'en')) !== stable(numbers(ko, 'ko'))) add('number-mismatch', 'error', row.id);
    if (stable(symbolTokens(row.text).sort()) !== stable(symbolTokens(ko).sort())) add('symbol-mismatch', 'error', row.id);
    const plainEn = row.text.replace(/\[[^\]]+\]|\{[^}]+\}/gu, ''), plainKo = ko.replace(/\[[^\]]+\]|\{[^}]+\}/gu, '');
    for (const [code, enPattern, koPattern, severity] of markers) {
      if (enPattern.test(plainEn) && !koPattern.test(plainKo)) add(`missing-${code}`, severity, row.id);
    }
    if (!markers[0][1].test(plainEn) && markers[0][2].test(plainKo)) add('added-negation', 'error', row.id);
    for (const [action, koPattern, amountPattern] of [['draw', n => new RegExp(`(?:카드\\s*${n}\\s*장|${n}\\s*장의?\\s*카드).*뽑`, 'u'), /(?:카드\s*(\d+)\s*장|(\d+)\s*장의?\s*카드).*뽑/u],
      ['deal', n => new RegExp(`(?:피해\\s*${n}|${n}\\s*(?:의\\s*)?피해)`, 'u'), /(?:피해\s*(\d+)|(\d+)\s*(?:의\s*)?피해)/u]]) {
      const match = plainEn.match(new RegExp(`\\b${action}\\s+(?:up to\\s+)?(\\d+)\\b`, 'iu'));
      if (match && !koPattern(match[1]).test(plainKo)) {
        const actual = plainKo.match(amountPattern);
        add(`${action}-amount-${actual ? 'mismatch' : 'unconfirmed'}`, actual ? 'error' : 'review', row.id);
      }
    }
    if (/\bfriendly\b/iu.test(plainEn) && !/opposing|opponent|enemy/iu.test(plainEn) && !/아군|자신이 조종|내가 조종/u.test(plainKo) && /상대|적군/u.test(plainKo)) add('ownership-reversal', 'error', row.id);
    if (/\bunless\b/iu.test(plainEn)) add('complex-condition-needs-review', 'review', row.id);
    for (const term of glossary.entries.filter(t => t.kind !== 'name')) {
      const escaped = term.en.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'iu').test(plainEn) && !plainKo.includes(term.ko)) add('terminology-inconsistent', 'review', row.id);
    }
  }
  if (source.keywords.length !== output.keywordsKo.length) add('keyword-count');
  for (const [i, en] of source.keywords.entries()) {
    const item = output.keywordsKo[i], term = glossary.entries.find(t => t.en.toLowerCase() === en.toLowerCase());
    if (!item || item.en !== en || !bounded(item.ko, 100) || !item.ko.trim()) add('keyword-identity');
    else if (term && item.ko !== term.ko) add('keyword-translation');
    else if (!term) add('keyword-needs-official-term', 'review');
  }
  if (glossary.conflicts.length) add('glossary-conflict', 'review');
  if (output.uncertainties.length) add('provider-uncertain', 'review');
  return { status: issues.some(i => i.severity === 'error') ? 'blocked' : issues.length ? 'needs-review' : 'checks-passed', issues, manualReviewRequired: true };
}
function normalizeRecord(record) {
  if (record == null) return null;
  const { id, authority, provider, model, createdAt, generatedAt, sourceVersion, appliedToVersion, englishHash,
    glossaryDigest, styleVersion, validatorVersion, nameKo, textKo, keywordsKo, validation, review } = record;
  if (!/^[a-f0-9]{64}$/u.test(id || '') || !/^[a-f0-9]{64}$/u.test(englishHash || '')
    || !['official', 'ai', 'mock', 'legacy', 'failed', 'blocked'].includes(authority)
    || !bounded(provider, 120) || !bounded(model || '', 120) || !Number.isFinite(Date.parse(createdAt))
    || (generatedAt != null && !Number.isFinite(Date.parse(generatedAt))) || !bounded(sourceVersion, 120) || !bounded(appliedToVersion, 120)
    || !bounded(nameKo, 300) || !bounded(textKo) || !Array.isArray(keywordsKo) || keywordsKo.length > 100
    || keywordsKo.some(t => !bounded(t.en, 100) || !bounded(t.ko, 100))
    || !validation || !['official-source', 'checks-passed', 'needs-review', 'blocked', 'failed'].includes(validation.status)
    || !Array.isArray(validation.issues) || validation.issues.length > 1000
    || validation.issues.some(i => !bounded(i.code, 100) || !['error', 'review'].includes(i.severity) || !bounded(i.clauseId || '', 20))
    || !review || !['pending', 'approved'].includes(review.status) || !bounded(review.reference || '', 300)
    || (review.status === 'approved' && (!review.reference || !Number.isFinite(Date.parse(review.at))))) throw new Error('Invalid card translation record.');
  const clauseRows = record.clausesKo || [];
  if (!Array.isArray(clauseRows) || clauseRows.length > 500 || clauseRows.some(row => !/^c\d{1,4}$/u.test(row.id || '') || !bounded(row.textKo))
    || clauseRows.reduce((n, row) => n + row.textKo.length, 0) > 12000) throw new Error('Invalid translated clause records.');
  const fields = ['name', 'effect', 'keywords', 'mechanics'];
  const fieldSources = Object.fromEntries(fields.map(field => [field, record.fieldSources?.[field] || (field === 'mechanics' ? 'source' : ['official', 'ai', 'mock'].includes(authority) ? authority : 'unknown')]));
  if (Object.values(fieldSources).some(value => !['official', 'ai', 'mock', 'source', 'unknown'].includes(value))) throw new Error('Invalid field translation authority.');
  let officialSource = null;
  if (record.officialSource) {
    const item = record.officialSource; let url;
    try { url = new URL(item.url); } catch { throw new Error('Invalid official translation source.'); }
    if (!officialURL(url.href) || !bounded(item.version, 120) || !bounded(item.englishVersion, 120)
      || !Number.isFinite(Date.parse(item.observedAt))) throw new Error('Invalid official translation source.');
    officialSource = { url: url.href, version: item.version, englishVersion: item.englishVersion, observedAt: item.observedAt };
  }
  return { schemaVersion: 1, id, authority, provider, model: model || null, createdAt, generatedAt: generatedAt || null,
    sourceVersion, appliedToVersion, englishHash, glossaryDigest: bounded(glossaryDigest, 64) ? glossaryDigest : '',
    styleVersion: bounded(styleVersion, 100) ? styleVersion : '', validatorVersion: bounded(validatorVersion, 100) ? validatorVersion : '',
    nameKo, textKo, keywordsKo: keywordsKo.map(t => ({ en: t.en, ko: t.ko })), clausesKo: clauseRows.map(row => ({ id: row.id, textKo: row.textKo })), fieldSources, officialSource,
    validation: { status: validation.status, issues: validation.issues.map(i => ({ code: i.code, severity: i.severity, clauseId: i.clauseId || null })), manualReviewRequired: true },
    review: { status: review.status, reference: review.reference || null, at: review.at || null } };
}
module.exports = { VERSION, STYLE_VERSION, VALIDATOR_VERSION, stable, hash, jsonValue, strings, bounded, symbolTokens,
  englishSource, clauses, buildGlossary, validateTranslation, normalizeRecord, numbers };
