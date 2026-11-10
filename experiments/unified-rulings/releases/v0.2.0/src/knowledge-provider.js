const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { normalizeCatalog } = require('./cards');
const { buildIndex } = require('./retrieval');
const { buildJudgeIndex } = require('./judge-index');
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const safeId = (id) => typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,95}$/iu.test(id);

function validateRules(items) {
  if (!Array.isArray(items) || !items.length || items.length > 30000) throw new Error('Invalid rule catalog.');
  const seen = new Set();
  const versions = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id)) throw new Error('Duplicate or missing rule identifier.');
    seen.add(item.id);
    if (!(item.officialTextEn || item.officialTextKo)?.trim()) throw new Error(`Empty rule: ${item.id}`);
    if(item.ruleId && ['core-rules','tournament-rules'].includes(item.documentId)) {
      const version=item.versionEn || item.version;
      if(!version)throw new Error(`Missing official document version: ${item.id}`);
      if(versions.has(item.documentId) && versions.get(item.documentId)!==version)throw new Error(`Mixed official document versions: ${item.documentId}`);
      versions.set(item.documentId,version);
    }
  }
}
function snapshot(releaseId, evidence, cards, manifest, judgeCases=[]) {
  validateRules(evidence);
  const cardCatalog = normalizeCatalog(cards);
  const legacyReview=require('./legacy-card-release').reviewScope(manifest);
  if(legacyReview&&!cardCatalog.cards.length)throw new Error('Legacy card release must retain its card catalog.');
  if(manifest.sources?.minimumRelease?.mode==='approved-rules-only'){
    if(cardCatalog.cards.length||judgeCases.length||manifest.sources.minimumRelease.rulesSha256!==manifest.hashes?.['rules.json'])throw new Error('Minimum release scope does not match the reviewed rules-only dataset.');
  }
  return Object.freeze({
    releaseId, evidence, cardCatalog, manifest, legacyReview,
    judgeCases:legacyReview&&!legacyReview.judgeCases?[]:judgeCases,
    index: buildIndex(evidence), judgeIndex: buildJudgeIndex(legacyReview&&!legacyReview.judgeCases?[]:judgeCases),
    evidenceCountByDocument:evidence.reduce((counts,item)=>{counts[item.documentId]=(counts[item.documentId]||0)+1;return counts;},{}),
  });
}
async function loadRelease(root, id) {
  if (!safeId(id)) throw new Error('Invalid knowledge release ID.');
  const dir=path.join(root,'knowledge-releases',id);
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'manifest.json'),'utf8'));
  if (manifest.schemaVersion!==1 || manifest.releaseId!==id || manifest.validationStatus!=='validated') throw new Error('Unvalidated knowledge release.');
  if (manifest.effectiveFrom && (!Number.isFinite(Date.parse(manifest.effectiveFrom)) || Date.parse(manifest.effectiveFrom)>Date.now())) throw new Error('Release is not effective yet.');
  if (manifest.compatibleSchema!==2) throw new Error('Incompatible knowledge schema.');
  const read=async(name)=>{
    const bytes=await fs.readFile(path.join(dir,name));
    if (!manifest.hashes?.[name] || digest(bytes)!==manifest.hashes[name])throw new Error(`Knowledge hash mismatch: ${name}`);
    return JSON.parse(bytes);
  };
  const [rules,cards,judge]=await Promise.all([read('rules.json'),read('cards.json'),read('judge-cases.json')]);
  if (!Array.isArray(judge)||judge.length>100000)throw new Error('Invalid Q&A snapshot.');
  return snapshot(id,rules,cards,manifest,judge);
}
function createKnowledgeProvider(root) {
  let active=null, timer=null, polling=false, lastError=null;
  async function reload() {
    if(polling)return;polling=true;
    try{
      let pointer;
      try{pointer=JSON.parse(await fs.readFile(path.join(root,'knowledge-releases','active.json'),'utf8'));}
      catch(error){if(error.code==='ENOENT')return;throw error;}
      if(pointer.releaseId!==active?.releaseId)active=await loadRelease(root,pointer.releaseId);
      lastError=null;
    } catch(error){lastError=error.message;if(!active)throw error;}
    finally{polling=false;}
  }
  return {
    async initialize(){
      // Fail safely if an explicit active release is damaged; never silently change versions.
      await reload();
      if(!active){
        const [rules,cards]=await Promise.all([
          fs.readFile(path.join(root,'knowledge','evidence.json'),'utf8').then(JSON.parse),
          fs.readFile(path.join(root,'knowledge','cards.json'),'utf8').then(JSON.parse),
        ]);
        active=snapshot('legacy-unvalidated',rules,cards,{validationStatus:'legacy',sources:{}});
      }
      timer=setInterval(()=>reload().catch(()=>{}),10000);timer.unref();
    },
    current(){if(!active)throw new Error('Knowledge unavailable');return active;},
    reload,
    status(){return {releaseId:active?.releaseId,validation:active?.manifest.validationStatus,judgeCases:active?.judgeCases.length || 0,judgeCoverage:active?.manifest.sources?.riftjudge?.coverage || 'live-search-only',unresolvedRuleAnchors:[...(active?.index?.anchors || [])].filter(([,id])=>!id).map(([id])=>id),lastError};},
    close(){if(timer)clearInterval(timer);},
  };
}
module.exports={createKnowledgeProvider,loadRelease,validateRules,digest,safeId};
