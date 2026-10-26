const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_SELECTED_CARDS = 8;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/u;
const fold = (value) => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function text(value, max = 300) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid or oversized card text field.');
  return value.trim();
}

function httpsUrl(value) {
  if (!value) return '';
  const url = new URL(text(value, 2000));
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Card source URLs must use HTTPS without credentials.');
  return url.href;
}

function artUrl(value) {
  const address = httpsUrl(value);
  if (!address) return '';
  const host = new URL(address).hostname;
  if (host === 'media.riftnaru.com') return address;
  return ['rgpub.io', 'riotgames.com', 'contentstack.io', 'ctfassets.net'].some((suffix) => host === suffix || host.endsWith(`.${suffix}`)) ? address : '';
}

function normalizeCatalog(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.cards) || data.cards.length > 20000) throw new Error('Expected a schemaVersion 1 card catalog (at most 20,000 cards).');
  const ids = new Set();
  const cards = data.cards.map((entry) => {
    const id = text(entry.id, 120);
    if (!ID_PATTERN.test(id) || ids.has(id)) throw new Error('Card IDs must be unique and use letters, numbers, dot, colon, dash or underscore.');
    ids.add(id);
    const nameKo = text(entry.nameKo);
    const nameEn = text(entry.nameEn);
    if (!nameKo && !nameEn) throw new Error('Every card needs a name.');
    if (entry.aliases != null && (!Array.isArray(entry.aliases) || entry.aliases.length > 30)) throw new Error('A card may have at most 30 aliases.');
    const aliases = [...new Set((entry.aliases || []).map((value) => text(value)).filter(Boolean))];
    if (entry.domains != null && (!Array.isArray(entry.domains) || entry.domains.length > 6)) throw new Error('Invalid card domains.');
    const domains = (entry.domains || []).map((value) => text(value, 80));
    const source = {
      kind: text(entry.source?.kind, 80), label: text(entry.source?.label), url: httpsUrl(entry.source?.url),
      version: text(entry.source?.version, 120), updatedAt: text(entry.source?.updatedAt, 80),
      fetchedAt: text(entry.source?.fetchedAt, 80), verification: text(entry.source?.verification, 80),
    };
    const permissions = { display: entry.permissions?.display === true, modelInput: entry.permissions?.modelInput === true };
    // Prototype settings record the user's local use decision, not a license from the source owner.
    const prototypeUse = { enabled: entry.prototypeUse?.enabled === true, modelInput: entry.prototypeUse?.modelInput === true, redistribution: false, rightsConfirmed: false };
    const textEn = text(entry.textEn, 12000);
    const textKo = text(entry.textKo, 12000);
    const textVerified = entry.textVerified === true;
    const localNaru = prototypeUse.enabled && source.kind === 'riftnaru-public' && source.url && new URL(source.url).hostname === 'www.riftnaru.com' && new URL(source.url).pathname.startsWith('/cards/');
    if ((textEn || textKo || entry.imageUrl) && !permissions.display && !localNaru) throw new Error('Card text needs a permitted source or a recorded local prototype source.');
    if (textVerified && (!textEn || !source.url || !source.version || !['riot-api', 'licensed'].includes(source.kind))) throw new Error('Verified card text needs an English original and a versioned Riot API or licensed source.');
    const rawStats = entry.stats || {};
    const stats = {};
    for (const field of ['energy', 'power', 'might']) {
      const value = rawStats[field];
      if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error(`Invalid ${field} value.`);
      stats[field] = value ?? null;
    }
    const card = {
      id, nameKo, nameEn, aliases, subtitle: text(entry.subtitle), set: text(entry.set, 120), code: text(entry.code, 120),
      type: text(entry.type, 120), domains, textEn, textKo, translationStatus: text(entry.translationStatus, 80) || 'unverified',
      textVerified, permissions, prototypeUse, source, stats, imageUrl: permissions.display || localNaru ? artUrl(entry.imageUrl) : '',
      errata: text(entry.errata, 6000), status: text(entry.status, 80) || 'unknown',
    };
    const localEvidenceReady = localNaru && prototypeUse.modelInput && textEn && source.version && source.fetchedAt && source.verification === 'observed-public-page';
    card.modelReady = Boolean(((textVerified && permissions.display && permissions.modelInput) || localEvidenceReady) && card.status !== 'withdrawn');
    card.authority = textVerified ? 'verified-source' : localNaru ? 'community-source' : 'unconfirmed';
    card.contentHash = crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
    return card;
  });
  return { schemaVersion: 1, version: text(data.version, 120) || 'unversioned', updatedAt: text(data.updatedAt, 80), coverage: text(data.coverage, 150) || 'partial', cards };
}

async function loadCardCatalog(root) {
  return normalizeCatalog(JSON.parse((await fs.readFile(path.join(root, 'knowledge', 'cards.json'), 'utf8')).replace(/^\uFEFF/u, '')));
}

function cardSummary(card) {
  const { id, nameKo, nameEn, subtitle, set, code, type, modelReady, imageUrl, translationStatus, authority } = card;
  return { id, nameKo, nameEn, subtitle, set, code, type, modelReady, imageUrl, translationStatus, authority };
}

function searchCards(catalog, query, language = 'ko', browse = false) {
  // Preserve original offsets for replacing the typed fragment in the textarea.
  const raw = String(query || '').slice(-100);
  const pieces = raw.match(/[^\s"'“”‘’()[\]{}<>!?.,;:]+(?:[ \t]+|$)/gu) || [];
  const candidates = [raw, ...pieces.map((_, index) => pieces.slice(index).join(''))].map((value) => value.trimStart());
  const suffixes = [...new Set(candidates)].filter((value) => {
    const normalized = fold(value);
    return raw.endsWith(value) && normalized.length >= 2;
  });
  if (!fold(raw) && !browse) return [];
  return catalog.cards.filter((card) => card.status !== 'withdrawn').map((card) => {
    const names = [card.nameKo, card.nameEn, ...card.aliases].filter(Boolean).map(fold);
    let best = null;
    for (const suffix of suffixes) {
      const q = fold(suffix);
      const quality = Math.max(...names.map((name) => name === q ? 400 : name.startsWith(q) ? 250 : name.includes(q) ? 150 : 0));
      if (!quality) continue;
      const score = q.length * 1000 + quality;
      if (!best || score > best.score) best = { score, matchedText: suffix };
    }
    if (!best && browse && !fold(raw)) best = { score: 0, matchedText: '' };
    return best ? { ...cardSummary(card), ...best } : null;
  }).filter(Boolean).sort((a, b) => b.score - a.score || (language === 'en' ? a.nameEn || a.nameKo : a.nameKo || a.nameEn).localeCompare(language === 'en' ? b.nameEn || b.nameKo : b.nameKo || b.nameEn)).slice(0, 50);
}

function nameAppears(question, name) {
  if (!name || fold(name).length < 2) return false;
  const escaped = name.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&').replace(/\s+/gu, '\\s*');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}]|(?:을|를|은|는|이|가|의|에|와|과|으로|로|도|만|랑|라고)(?=$|[^\\p{L}\\p{N}]))`, 'iu').test(question.normalize('NFKC'));
}

function resolveCards(catalog, requestedIds, question) {
  const ids = requestedIds ?? [];
  if (!Array.isArray(ids) || ids.length > MAX_SELECTED_CARDS || ids.some((id) => typeof id !== 'string' || !ID_PATTERN.test(id))) throw Object.assign(new Error('Select at most 8 valid cards.'), { statusCode: 400 });
  const byId = new Map(catalog.cards.map((card) => [card.id, card]));
  const selected = [...new Set(ids)].map((id) => {
    const card = byId.get(id);
    if (!card) throw Object.assign(new Error('The card catalog changed. Select the card again.'), { statusCode: 409 });
    if (![card.nameKo, card.nameEn, ...card.aliases].some((name) => nameAppears(question, name))) throw Object.assign(new Error('A selected card is no longer present in the question. Select it again.'), { statusCode: 409 });
    return card;
  });
  const selectedIds = new Set(selected.map((card) => card.id));
  const known = catalog.cards.filter((card) => card.status !== 'withdrawn' && [card.nameKo, card.nameEn, ...card.aliases].some((name) => nameAppears(question, name)));
  const unresolved = known.filter((card) => !selectedIds.has(card.id) && !selected.some((chosen) => [chosen.nameKo, chosen.nameEn, ...chosen.aliases].some((name) => name && [card.nameKo, card.nameEn, ...card.aliases].some((other) => fold(name) === fold(other)))));
  return { selected, unresolved: unresolved.slice(0, MAX_SELECTED_CARDS), missing: selected.filter((card) => !card.modelReady), version: catalog.version };
}

module.exports = { loadCardCatalog, normalizeCatalog, searchCards, cardSummary, resolveCards, MAX_SELECTED_CARDS };
