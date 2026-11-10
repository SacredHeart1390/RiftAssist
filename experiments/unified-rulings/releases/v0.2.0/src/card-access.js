// Runtime views only. Never change knowledge files, permissions, releases or backups.
const crypto = require('node:crypto');
const { resolveCards } = require('./cards');
const { hash, englishSource } = require('./card-translation-core');
const { officialURL } = require('./card-publication');
const VERSION = 'card-access-3';

function createCardAccess(configuredMode, { allowMock = false } = {}) {
  const mode = ['verified-only','legacy-reviewed'].includes(configuredMode) ? configuredMode : 'restricted';
  const configurationValid = configuredMode == null || configuredMode === '' || ['restricted', 'verified-only','legacy-reviewed'].includes(configuredMode);
  const views = new WeakMap();
  function snapshot(original) {
    if (views.has(original)) return views.get(original);
    const raw = original.cardCatalog;
    const legacy=mode==='legacy-reviewed'?original.legacyReview:null;
    // An operator must verify the app's approval/license before enabling verified-only.
    // These per-card flags are necessary technical checks, not proof of legal permission.
    const cards = mode === 'restricted' || mode==='legacy-reviewed'&&!legacy ? [] : raw.cards.filter(card => legacy ?
      card.status!=='withdrawn'&&card.source.kind==='riftnaru-public'&&card.source.url&&card.source.version&&legacy.cardsDisplay
      &&(card.status!=='preview-unreleased'||card.publication.publiclyRevealed&&officialURL(card.publication.url)&&card.publication.version)
      :
      card.status !== 'withdrawn' && card.textVerified && card.textEn && card.source.url && card.source.version
      && (['riot-api', 'licensed'].includes(card.source.kind) || (allowMock && card.source.kind === 'mock' && card.source.verification === 'synthetic-fixture')) && card.permissions.display
      && (card.status !== 'preview-unreleased' || (card.publication.publiclyRevealed && card.publication.version && (officialURL(card.publication.url) || (allowMock && card.source.kind === 'mock' && card.publication.url.startsWith('https://example.invalid/')))))
    ).map(card => {
      const { translationProposal, translationHistory, officialKorean, officialKoreanCheck, sourceKorean, ...safe } = card;
      if(legacy){
        safe.imageUrl=legacy.images?safe.imageUrl:'';
        if(!legacy.koreanDisplay){safe.nameKo='';safe.textKo='';safe.keywordsKo=[];safe.aliases=[];safe.subtitle='';safe.errata='';}
        safe.translationRecord=null;
        safe.translationStatus=legacy.koreanDisplay?card.translationStatus:'translation-rights-restricted';
        safe.authority='community-source';
        safe.accessReview={reference:legacy.reference,koreanModelInput:legacy.koreanModelInput};
        return {...safe,modelReady:Boolean(card.modelReady&&legacy.cardsModelInput&&legacy.rulesModelInput)};
      }
      safe.imageUrl = card.permissions.image === true ? safe.imageUrl : '';
      const record = safe.translationRecord;
      const approved = record && record.review.status === 'approved' && record.englishHash === hash(englishSource(card))
        && !record.validation.issues.some(issue => issue.severity === 'error')
        && !(record.authority === 'mock' && !allowMock) && !(record.authority === 'official' && card.source.kind !== 'riot-api');
      if ((translationProposal || record) && !approved) {
        safe.nameKo = ''; safe.textKo = ''; safe.keywordsKo = []; safe.translationRecord = null; safe.translationStatus = 'translation-review-pending';
      } else if (approved) {
        safe.nameKo = record.nameKo; safe.textKo = record.textKo; safe.keywordsKo = record.keywordsKo;
        safe.translationStatus = record.authority === 'official' ? 'official' : record.authority === 'mock' ? 'mock' : record.authority === 'ai' ? 'unofficial-ai-reviewed' : 'unofficial-reviewed';
      }
      return { ...safe, modelReady: Boolean(card.modelReady && card.permissions.modelInput) };
    });
    const access = Object.freeze({ mode, configurationValid, retainedTotal: raw.cards.length,
      restrictedTotal: raw.cards.length - cards.length, visibleTotal: cards.length,
      modelReadyTotal: cards.filter(card => card.modelReady).length });
    const cacheScope = crypto.createHash('sha256').update(JSON.stringify({ version: VERSION, mode,
      releaseId: original.releaseId, legacyReview:legacy?.reviewHash||null,cards: raw.cards.map(card => card.contentHash) })).digest('hex');
    const view = Object.freeze({ ...original, rawCardCatalog: raw, cardAccess: access,
      cardCacheScope: cacheScope, cardCatalog: { ...raw, cards } });
    views.set(original, view);
    return view;
  }
  function resolve(view, ids, question, remembered = [], excluded = []) {
    // Validate old clients' identifiers using the intact catalog. Never expose this result.
    // Ignore exclusions during the rights check: a client cannot hide a blocked mention.
    const raw = resolveCards(view.rawCardCatalog, ids, question, remembered, []);
    const visible = new Set(view.cardCatalog.cards.map(card => card.id));
    const restricted = [...raw.selected, ...raw.unresolved].some(card => !visible.has(card.id));
    const filter = values => (values || []).filter(id => visible.has(id));
    const result = resolveCards(view.cardCatalog, filter(ids), question, filter(remembered), excluded);
    return { ...result, restricted };
  }
  function forModel(cards){return cards.filter(c=>c.modelReady).map(c=>c.accessReview&&!c.accessReview.koreanModelInput?
    {...c,nameKo:'',textKo:'',keywordsKo:[],aliases:[],subtitle:'',errata:'',translationRecord:null}:c);}
  return { snapshot, resolve,forModel };
}
module.exports = { createCardAccess, VERSION };
