const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { jsonValue, strings, normalizeRecord } = require('./card-translation-core');

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
    const permissions = { display: entry.permissions?.display === true, modelInput: entry.permissions?.modelInput === true, translation: entry.permissions?.translation === true };
    // Prototype settings record the user's local use decision, not a license from the source owner.
    const prototypeUse = { enabled: entry.prototypeUse?.enabled === true, modelInput: entry.prototypeUse?.modelInput === true, redistribution: false, rightsConfirmed: false };
    const textEn = text(entry.textEn, 12000);
    const textKo = text(entry.textKo, 12000);
    const textVerified = entry.textVerified === true;
    const officialKorean = entry.officialKorean == null ? null : {
      name: text(entry.officialKorean.name), text: text(entry.officialKorean.text, 12000), keywords: strings(entry.officialKorean.keywords),
      version: text(entry.officialKorean.version, 120), englishVersion: text(entry.officialKorean.englishVersion, 120), url: httpsUrl(entry.officialKorean.url),
    };
    const translationHistory = strings(entry.translationHistory, 1000);
    if (translationHistory.some(id => !/^[a-f0-9]{64}$/u.test(id))) throw new Error('Translation history must reference immutable record IDs.');
    if (entry.keywordsKo != null && (!Array.isArray(entry.keywordsKo) || entry.keywordsKo.length > 100)) throw new Error('Invalid Korean keyword list.');
    const localNaru = prototypeUse.enabled && source.kind === 'riftnaru-public' && source.url && new URL(source.url).hostname === 'www.riftnaru.com' && new URL(source.url).pathname.startsWith('/cards/');
    if ((textEn || textKo || entry.imageUrl) && !permissions.display && !localNaru && !['riot-api', 'licensed', 'mock'].includes(source.kind)) throw new Error('Card text needs recorded provenance.');
    if (textVerified && (!textEn || !source.url || !source.version || !['riot-api', 'licensed', 'mock'].includes(source.kind))) throw new Error('Verified card text needs an English original and a versioned source.');
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
      translationSource: { kind: text(entry.translationSource?.kind, 80), reference: text(entry.translationSource?.reference, 300), englishHash: text(entry.translationSource?.englishHash, 64) },
      cost: jsonValue(entry.cost || {}), keywordsEn: strings(entry.keywordsEn), symbols: strings(entry.symbols), officialKorean,
      officialKoreanCheck: { status: ['available', 'absent'].includes(entry.officialKoreanCheck?.status) ? entry.officialKoreanCheck.status : 'unknown',
        englishVersion: text(entry.officialKoreanCheck?.englishVersion, 120), url: httpsUrl(entry.officialKoreanCheck?.url),
        checkedAt: text(entry.officialKoreanCheck?.checkedAt, 80), reference: text(entry.officialKoreanCheck?.reference) },
      keywordsKo: (entry.keywordsKo || []).map(t => ({ en: text(t.en, 100), ko: text(t.ko, 100) })),
      translationRecord: normalizeRecord(entry.translationRecord), translationProposal: normalizeRecord(entry.translationProposal), translationHistory,
      publication: { publiclyRevealed: entry.publication?.publiclyRevealed === true, url: httpsUrl(entry.publication?.url), version: text(entry.publication?.version, 120) },
      textVerified, permissions, prototypeUse, source, stats, imageUrl: permissions.display || localNaru ? artUrl(entry.imageUrl) : '',
      errata: text(entry.errata, 6000), status: text(entry.status, 80) || 'unknown',
    };
    const localEvidenceReady = localNaru && prototypeUse.modelInput && textEn && source.version && source.fetchedAt && source.verification === 'observed-public-page';
    card.modelReady = Boolean(((textVerified && permissions.display && permissions.modelInput) || localEvidenceReady) && card.status !== 'withdrawn');
    card.authority = source.kind === 'mock' ? 'mock-source' : textVerified ? 'verified-source' : localNaru ? 'community-source' : 'unconfirmed';
    card.contentHash = crypto.createHash('sha256').update(JSON.stringify(card)).digest('hex');
    return card;
  });
  return { schemaVersion: 1, version: text(data.version, 120) || 'unversioned', updatedAt: text(data.updatedAt, 80), coverage: text(data.coverage, 150) || 'partial', cards };
}

async function loadCardCatalog(root) {
  return normalizeCatalog(JSON.parse((await fs.readFile(path.join(root, 'knowledge', 'cards.json'), 'utf8')).replace(/^\uFEFF/u, '')));
}

function cardSummary(card) {
  const { id, nameKo, nameEn, subtitle, set, code, type, modelReady, imageUrl, translationStatus, authority, status } = card;
  return { id, nameKo, nameEn, subtitle, set, code, type, modelReady, imageUrl, translationStatus, authority, status };
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
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}]|(?:을|를|은|는|이|가|의|에|에게|에서|와|과|으로|로|도|만|랑|라고|까지|부터|보다|처럼)(?=$|[^\\p{L}\\p{N}]))`, 'iu').test(question.normalize('NFKC'));
}

const mentionIndexes = new WeakMap();
function exactCardMentions(catalog, question) {
  let entries=mentionIndexes.get(catalog);
  if(!entries){
    const names=new Map();
    for(const card of catalog.cards.filter(c=>c.status!=='withdrawn'))for(const name of [card.nameKo,card.nameEn,...card.aliases]){
      if(!name||fold(name).length<2)continue;
      const normalized=name.normalize('NFKC'),key=normalized.toLowerCase();
      if(!names.has(key))names.set(key,{name:normalized,cards:[]});names.get(key).cards.push(card);
    }
    entries=[...names.values()].map(entry=>({...entry,regex:new RegExp(`(^|[^\\p{L}\\p{N}])(${entry.name.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&').replace(/\s+/gu,'\\s*')})(?=$|[^\\p{L}\\p{N}]|(?:을|를|은|는|이|가|의|에|에게|에서|와|과|으로|로|도|만|랑|라고|까지|부터|보다|처럼)(?=$|[^\\p{L}\\p{N}]))`,'giu')}));
    mentionIndexes.set(catalog,entries);
  }
  const text=question.normalize('NFKC'),matches=[];
  for(const entry of entries){entry.regex.lastIndex=0;let m;while((m=entry.regex.exec(text))&&matches.length<1000){matches.push({start:m.index+m[1].length,end:m.index+m[0].length,label:m[2],cards:entry.cards});}}
  matches.sort((a,b)=>(b.end-b.start)-(a.end-a.start)||a.start-b.start);
  const found=[];for(const m of matches)if(!found.some(other=>m.start<other.end&&m.end>other.start))found.push(m);
  return found.sort((a,b)=>a.start-b.start);
}
function resolveCards(catalog, requestedIds, question, rememberedIds = [], excludedIds = []) {
  const ids = requestedIds ?? [];
  if (!Array.isArray(ids) || ids.length > MAX_SELECTED_CARDS || ids.some((id) => typeof id !== 'string' || !ID_PATTERN.test(id))) throw Object.assign(new Error('Select at most 8 valid cards.'), { statusCode: 400 });
  for(const values of [rememberedIds,excludedIds])if(!Array.isArray(values)||values.length>64||values.some(id=>typeof id!=='string'||!ID_PATTERN.test(id)))throw Object.assign(new Error('Invalid remembered card selection.'),{statusCode:400});
  const byId = new Map(catalog.cards.map((card) => [card.id, card]));
  const selected = [...new Set(ids)].map((id) => {
    const card = byId.get(id);
    if (!card) throw Object.assign(new Error('The card catalog changed. Select the card again.'), { statusCode: 409 });
    if(card.status==='withdrawn')throw Object.assign(new Error('This card entry has been withdrawn. Select the current entry.'),{statusCode:409});
    if (![card.nameKo, card.nameEn, ...card.aliases].some((name) => nameAppears(question, name))) throw Object.assign(new Error('A selected card is no longer present in the question. Select it again.'), { statusCode: 409 });
    return card;
  });
  const selectedIds = new Set(selected.map(card=>card.id)),excluded=new Set(excludedIds),unresolved=[],references=[],automaticallyResolvedIds=[];
  const signature=card=>JSON.stringify([fold(card.nameEn||card.nameKo),card.textEn.replace(/\s+/gu,' ').trim(),card.stats,card.type,card.domains]);
  for(const mention of exactCardMentions(catalog,question)){
    let chosen=mention.cards.find(card=>selectedIds.has(card.id));
    const candidates=mention.cards.some(card=>excluded.has(card.id))?[]:[...new Map(mention.cards.map(card=>[card.id,card])).values()];
    if(!chosen)chosen=[...rememberedIds].reverse().map(id=>candidates.find(card=>card.id===id)).find(Boolean);
    if(!chosen&&candidates.length&&new Set(candidates.map(signature)).size===1){
      chosen=candidates.find(card=>card.modelReady&&card.authority==='verified-source')||candidates.find(card=>card.modelReady)||candidates[0];
    }
    if(chosen&&!selectedIds.has(chosen.id)){
      if(selected.length>=MAX_SELECTED_CARDS){unresolved.push(chosen);continue;}
      selected.push(chosen);selectedIds.add(chosen.id);automaticallyResolvedIds.push(chosen.id);
    }
    if(chosen)references.push({start:mention.start,end:mention.end,label:mention.label,cardId:chosen.id});
    else unresolved.push(...mention.cards);
  }
  return { selected, unresolved: [...new Map(unresolved.map(card=>[card.id,card])).values()].slice(0,MAX_SELECTED_CARDS), missing: selected.filter(card=>!card.modelReady), references:question===question.normalize('NFKC')?references:[], automaticallyResolvedIds, version:catalog.version };
}

module.exports = { loadCardCatalog, normalizeCatalog, searchCards, cardSummary, resolveCards, MAX_SELECTED_CARDS };
