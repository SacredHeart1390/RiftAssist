const crypto = require('node:crypto');
const { normalizeCatalog } = require('../../releases/v0.1.3/src/cards');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const content = c => ({ id: c.id, code: c.code || '', nameKo: c.nameKo || '', nameEn: c.nameEn || '',
  aliases: [...(c.aliases || [])].sort(), set: c.set || '', type: c.type || '', domains: [...(c.domains || [])].sort(),
  subtitle: c.subtitle || '', textEn: c.textEn || '', textKo: c.textKo || '', stats: c.stats || {}, imageUrl: c.imageUrl || '',
  errata: c.errata || '', translationStatus: c.translationStatus || '', modelInput: c.prototypeUse?.modelInput === true });
function held(message, details = {}) { return Object.assign(new Error(message), { code: 'review-required', details }); }
function prepareCatalog(data, currentRaw, previous = {}) {
  const captured = Date.parse(data?.capturedAt);
  if (data?.schemaVersion !== 1 || typeof data.capturedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/u.test(data.capturedAt) || !Number.isFinite(captured) || captured > Date.now() + 300000 || !Array.isArray(data.cards) || !data.cards.length || data.cards.length > 20000) throw held('카드 파일 형식·수집 날짜·개수를 확인해 주세요.');
  const full = /^all-(\d+)-artwork-listings-observed-/u.exec(data.coverage || '');
  if (full && Number(full[1]) !== data.cards.length) throw held('전체 목록 표시와 실제 카드 수가 다릅니다.');
  const current = normalizeCatalog(currentRaw), oldById = new Map(current.cards.map(c => [c.id, c]));
  if (full && captured < Date.parse(previous.lastFullCapturedAt || current.updatedAt || '')) throw held('이전 전체 목록으로 최신 목록 상태를 변경할 수 없습니다.');
  const pendingTranslations = { ...(currentRaw.syncMetadata?.pendingTranslations || {}) };
  const version = `riftnaru-${data.capturedAt.slice(0, 10)}-${hash(data.cards).slice(0, 12)}`;
  const mapped = data.cards.map(c => {
    if (!c || !/^[a-z0-9][a-z0-9-]{0,99}$/u.test(c.id || '')) throw held('카드 ID 형식이 올바르지 않습니다.');
    if (c.aliases != null && !Array.isArray(c.aliases)) throw held('카드 별칭은 배열이어야 합니다.');
    if ((c.textEn != null && typeof c.textEn !== 'string') || (c.textKo != null && typeof c.textKo !== 'string')) throw held('카드 본문은 문자열이어야 합니다.');
    const url = new URL(c.sourceUrl);
    if (url.href !== `https://www.riftnaru.com/cards/${c.id}`) throw held('카드 ID와 출처 주소가 일치하지 않습니다.');
    const old = oldById.get(`riftnaru:${c.id}`);
    const changedEnglish = old?.textEn && old.textEn !== (c.textEn || '').trim();
    const previousPending = pendingTranslations[`riftnaru:${c.id}`];
    const staleKorean = (changedEnglish && old.textKo && old.textKo === (c.textKo || '').trim()) ||
      (previousPending && previousPending.englishHash === hash((c.textEn || '').trim()) && previousPending.koreanHash === hash((c.textKo || '').trim()));
    if (staleKorean) pendingTranslations[`riftnaru:${c.id}`] = { englishHash: hash((c.textEn || '').trim()), koreanHash: hash((c.textKo || '').trim()) };
    else delete pendingTranslations[`riftnaru:${c.id}`];
    return { id: `riftnaru:${c.id}`, code: c.code, nameKo: c.nameKo, nameEn: c.nameEn,
      aliases: [...new Set([...(old?.aliases || []), ...(c.aliases || [])])], set: c.set, type: c.type, domains: c.domains || [], subtitle: c.subtitle || '',
      textEn: c.textEn, textKo: staleKorean ? '' : c.textKo, stats: c.stats, imageUrl: c.imageUrl, errata: old?.errata || '', status: old?.status === 'withdrawn' ? 'withdrawn' : 'source-observed',
      translationStatus: staleKorean ? 'stale-after-english-update' : 'unofficial-riftnaru', textVerified: false,
      permissions: { display: false, modelInput: false },
      prototypeUse: { enabled: true, modelInput: c.textComplete === true, redistribution: false, rightsConfirmed: false },
      source: { kind: 'riftnaru-public', label: 'Rift Naru 공개 카드 자료 · 공식 원문 대조 전', url: url.href,
        version, fetchedAt: data.capturedAt, updatedAt: '', verification: 'observed-public-page' } };
  });
  const incoming = normalizeCatalog({ schemaVersion: 1, version, updatedAt: data.capturedAt, coverage: data.coverage || 'partial', cards: mapped });
  const before = current.cards.filter(c => c.source.kind === 'riftnaru-public');
  const incomingIds = new Set(incoming.cards.map(c => c.id));
  if (full && incoming.cards.length < before.length * .9) throw held('전체 카드 수가 10% 이상 감소했습니다. 기존 자료를 유지합니다.');
  const merged = new Map(currentRaw.cards.map(c => [c.id, c]));
  const diff = { added: [], changed: [], missing: [], translationPending: [], unchanged: 0 };
  let bodyChanged = 0;
  for (const card of incoming.cards) {
    const old = oldById.get(card.id);
    if (old && old.code && card.code !== old.code) throw held('기존 ID의 카드 번호가 바뀌었습니다.', { id: card.id });
    if (!old && full && before.some(c => c.code && c.code === card.code && !incomingIds.has(c.id))) throw held('기존 카드 번호가 다른 ID로 이동했습니다. 판본 연결 확인이 필요합니다.', { id: card.id });
    const same = old && hash(content(old)) === hash(content(card));
    if (same) { diff.unchanged++; continue; }
    if (old && captured < Date.parse(old.source.fetchedAt || '')) throw held('오래된 파일이 최신 카드 본문을 바꾸려 합니다.', { id: card.id });
    if (old?.textVerified) throw held('공식 확인된 카드를 커뮤니티 자료로 덮어쓸 수 없습니다.', { id: card.id });
    for (const field of ['nameKo', 'nameEn', 'type', 'set', 'imageUrl']) if (old?.[field] && !card[field]) throw held(`기존 카드의 ${field} 정보가 누락되었습니다.`, { id: card.id });
    for (const field of ['energy', 'power', 'might']) if (old?.stats[field] != null && card.stats[field] == null) throw held(`기존 카드의 ${field} 수치가 누락되었습니다.`, { id: card.id });
    if (old?.domains.length && !card.domains.length) throw held('기존 카드의 영역 정보가 누락되었습니다.', { id: card.id });
    if (old?.textEn && !card.textEn) throw held('기존 영문 카드 본문이 빈 값으로 바뀌었습니다.', { id: card.id });
    if (old?.textKo && !card.textKo && card.translationStatus !== 'stale-after-english-update') throw held('기존 한국어 카드 본문이 빈 값으로 바뀌었습니다.', { id: card.id });
    if (old?.modelReady && !card.modelReady) throw held('기존 카드의 본문 완전성 표시가 누락되었습니다.', { id: card.id });
    if (old && old.textEn !== card.textEn) bodyChanged++;
    if (card.translationStatus === 'stale-after-english-update') diff.translationPending.push(card.id);
    (old ? diff.changed : diff.added).push(card.id); merged.set(card.id, card);
  }
  if (bodyChanged > Math.max(20, before.length * .2)) throw held('카드 본문이 한 번에 크게 바뀌었습니다. 변경 내용 확인이 필요합니다.');
  const snapshotId = `${data.capturedAt}:${hash(incoming.cards.map(content))}`;
  const missing = { ...(previous.missing || {}) }, present = new Set(incoming.cards.map(c => c.id));
  for (const id of present) delete missing[id];
  if (full) for (const old of before) if (!present.has(old.id)) {
    const entry = missing[old.id] || { count: 0, lastSnapshot: '', firstSeen: data.capturedAt };
    if (entry.lastSnapshot !== snapshotId) entry.count++;
    entry.lastSnapshot = snapshotId; missing[old.id] = entry; diff.missing.push(old.id);
  }
  // Missing source rows are retained. This is not a tournament legality/ban decision.
  const changed = diff.added.length + diff.changed.length > 0;
  const catalog = changed ? { ...currentRaw, version, updatedAt: data.capturedAt, coverage: data.coverage || 'partial', cards: [...merged.values()], syncMetadata: { ...(currentRaw.syncMetadata || {}), pendingTranslations } } : currentRaw;
  normalizeCatalog(catalog);
  return { catalog, changed, diff, history: { missing, snapshotId, lastFullCapturedAt: full ? data.capturedAt : previous.lastFullCapturedAt || null }, sourceCapturedAt: data.capturedAt,
    fullListing: Boolean(full), suppliedCount: incoming.cards.length, semanticHash: hash(incoming.cards.map(content)) };
}
module.exports = { prepareCatalog, hash };
