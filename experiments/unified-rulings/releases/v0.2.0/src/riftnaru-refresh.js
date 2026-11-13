// Offline candidate merge only: no network, activation, database or permission changes.
const crypto=require('node:crypto');
const {normalizeCatalog}=require('./cards');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compact=value=>String(value||'').normalize('NFC').replace(/\s+/gu,'');
function imageIdentity(value){if(!value)return '';const u=new URL(value);for(const k of ['w','q','fit'])u.searchParams.delete(k);return u.href;}
function mergeRiftnaruCatalog(previous,observation){
  normalizeCatalog(previous);
  if(observation?.schemaVersion!==1||!Number.isFinite(Date.parse(observation.capturedAt))||!Array.isArray(observation.cards)
    ||!observation.cards.length||observation.cards.length>20000||observation.complete!==true
    ||observation.coverage!==`all-${observation.cards.length}-artwork-listings-observed-public-page`)
    throw Error('A complete dated public listing is required; active catalog retained.');
  const version=`riftnaru-${observation.capturedAt.slice(0,10)}-${digest(observation).slice(0,12)}`;
  const incoming=new Map();
  for(const item of observation.cards){
    if(!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(item.id||'')||item.sourceUrl!==`https://www.riftnaru.com/cards/${item.id}`
      ||incoming.has(`riftnaru:${item.id}`)||!item.printingId||!item.cardId)throw Error('Invalid or duplicate public printing identity.');
    const card={id:`riftnaru:${item.id}`,code:item.code,set:item.set,nameKo:item.nameKo,nameEn:item.nameEn,
      aliases:[],subtitle:'',type:item.type,domains:item.domains||[],textEn:item.textEn,textKo:item.textKo,
      stats:item.stats,imageUrl:item.imageUrl,errata:item.errata||'',status:'source-observed',
      translationStatus:'unofficial-riftnaru',textVerified:false,permissions:{display:false,modelInput:false},
      prototypeUse:{enabled:true,modelInput:item.textComplete===true,redistribution:false,rightsConfirmed:false},
      source:{kind:'riftnaru-public',label:'Rift Naru 공개 카드 자료 · 공식 원문 대조 전',url:item.sourceUrl,
        version,fetchedAt:item.fetchedAt||observation.capturedAt,updatedAt:item.updatedAt!==undefined?item.updatedAt:observation.sourceSyncedAt||'',verification:'observed-public-page',
        cardId:item.cardId,cardVersion:item.printingId}};
    const validated=normalizeCatalog({schemaVersion:1,version,cards:[card]}).cards[0];
    if(item.imageUrl&&!validated.imageUrl)throw Error('Unapproved image host.');
    incoming.set(card.id,{card,item});
  }
  const before=new Map(previous.cards.map(c=>[c.id,c])),report={before:before.size,observed:incoming.size,added:[],changed:[],unchanged:[],missing:[],held:[],translationPending:[]};
  const fields=['nameKo','nameEn','type','domains','stats','textEn','textKo','imageUrl','errata'];
  const output=previous.cards.map(old=>{
    const row=incoming.get(old.id);if(!row){report.missing.push(old.id);return structuredClone(old);}
    const {card:next,item}=row;
    if(next.code!==old.code||next.set!==old.set)throw Error('Printing code or set changed: '+old.id);
    const proposed=fields.filter(k=>k==='imageUrl'?imageIdentity(old[k])!==imageIdentity(next[k]):k.startsWith('text')?compact(old[k])!==compact(next[k]):JSON.stringify(old[k]??'')!==JSON.stringify(next[k]??''));
    if(!proposed.length){report.unchanged.push(old.id);return structuredClone(old);}
    if(old.source?.kind!=='riftnaru-public'||old.source?.verification!=='observed-public-page'||old.textVerified
      ||old.translationRecord||old.translationProposal||old.translationHistory?.length
      ||Object.values(old.permissions||{}).some(Boolean)||old.status!=='source-observed'){
      report.held.push({id:old.id,fields:proposed,reason:'preserve-manual-review-or-access-state'});return structuredClone(old);
    }
    const merged=structuredClone(old),applied=[];
    for(const k of proposed){
      if((k==='textEn'||k==='textKo'||k==='imageUrl')&&!next[k]&&old[k]){report.held.push({id:old.id,fields:[k],reason:'source-field-missing'});continue;}
      if(k==='imageUrl'&&item.imageVerified!==true){report.held.push({id:old.id,fields:[k],reason:'image-not-verified'});continue;}
      merged[k]=structuredClone(next[k]);applied.push(k);
    }
    if(!applied.length)return merged;
    // An unchanged Korean translation cannot certify a changed English original.
    if(applied.includes('textEn')&&!applied.includes('textKo')&&old.textKo){
      merged.sourceKorean={name:old.nameKo,text:old.textKo,keywords:old.keywordsKo||[]};
      merged.textKo='';merged.translationStatus='translation-review-pending';report.translationPending.push(old.id);
    }
    merged.source={...old.source,...next.source};
    merged.contentHash=normalizeCatalog({schemaVersion:1,version,cards:[merged]}).cards[0].contentHash;
    report.changed.push({id:old.id,fields:applied});return merged;
  });
  for(const [id,{card,item}]of incoming)if(!before.has(id)){
    if(card.imageUrl&&item.imageVerified!==true)throw Error('New printing image must be verified.');
    output.push(normalizeCatalog({schemaVersion:1,version,cards:[card]}).cards[0]);report.added.push(id);
  }
  const changed=report.changed.length+report.added.length>0;
  const catalog=changed?{...structuredClone(previous),version,updatedAt:observation.capturedAt,coverage:observation.coverage,cards:output}:structuredClone(previous);
  normalizeCatalog(catalog);report.after=catalog.cards.length;report.changedAny=changed;report.version=catalog.version;
  return {catalog,report};
}
module.exports={mergeRiftnaruCatalog,imageIdentity};
