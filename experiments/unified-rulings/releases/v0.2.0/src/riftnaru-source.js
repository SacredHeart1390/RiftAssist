const {hash,canonical}=require('./riftnaru-auto-release');
const {imageIdentity}=require('./riftnaru-refresh');
const {allowsRobots,SourceError}=require('./riftnaru-http');
const origin='https://www.riftnaru.com';
const types={Unit:'유닛',Spell:'주문',Rune:'룬',Gear:'도구',Legend:'전설',Battlefield:'전장'},domains={Body:'신체',Chaos:'혼돈',Calm:'평정',Fury:'분노',Mind:'정신',Order:'질서',Colorless:'영역 없음',None:'영역 없음'};
const tokens={exhaust:'[Exhaust]',might:'[Might]',rune_body:'[Body power]',rune_calm:'[Calm power]',rune_chaos:'[Chaos power]',rune_fury:'[Fury power]',rune_mind:'[Mind power]',rune_order:'[Order power]',rune_rainbow:'[Wild power]'};
function plain(v){return String(v?.richText||v?.text||'').replace(/<br\s*\/?\s*>|<\/(?:p|li|div)>/giu,'\n').replace(/<[^>]*>/gu,'').replace(/\[([^\]]+)\](?:&gt;|>)/gu,'$1 ').replace(/\[([^\]]+)\]/gu,'$1').replace(/:rb_([a-z0-9_]+):/gu,(_,s)=>{if(/^energy_\d+$/u.test(s))return `[${s.slice(7)} Energy]`;if(!tokens[s])throw new SourceError('source-symbol-changed');return tokens[s];}).replace(/&amp;/gu,'&').replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&#39;|&apos;/gu,"'").replace(/&quot;/gu,'"').replace(/&#(\d+);/gu,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([a-f0-9]+);/giu,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/[ \t]+/gu,' ').replace(/ *\n */gu,'\n').replace(/\n{3,}/gu,'\n\n').trim();}
function objects(html){
 if(html.length>8*1024*1024)throw new SourceError('source-size-limit');const chunks=[];
 for(const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gu)){const s=match[1],start=s.indexOf('self.__next_f.push(');if(start<0)continue;try{const a=JSON.parse(s.slice(start+19,s.lastIndexOf(')')));if(a[0]===1&&typeof a[1]==='string')chunks.push(a[1]);}catch{throw new SourceError('source-rsc-schema');}}
 const found=[];function walk(v,depth=0){if(!v||typeof v!=='object')return;if(depth>100)throw new SourceError('source-rsc-depth');if(!Array.isArray(v))found.push(v);for(const x of Object.values(v))walk(x,depth+1);}
 for(const line of chunks.join('').split('\n')){const i=line.indexOf(':');if(i<0)continue;let value;try{value=JSON.parse(line.slice(i+1));}catch{continue;}walk(value);}
 if(!found.length)throw new SourceError('source-rsc-schema');return found;
}
function normalizeListing(item,id,old){
 if(!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(id||'')||!item.printingId||!item.cardId||!item.imageVariant||!Array.isArray(item.descriptionVariants)||!item.classification||!item.attributes||!types[item.classification.type]||!Array.isArray(item.classification.domains)||item.classification.domains.some(x=>!domains[x]))throw new SourceError('source-listing-schema');
 if(item.descriptionVariants.some(v=>v.printingId!==item.printingId))throw new SourceError('source-printing-collision');
 const ko=item.descriptionVariants.filter(v=>v.locale==='ko-KR'),en=item.descriptionVariants.filter(v=>v.locale==='en-US');if(ko.length>1||en.length!==1)throw new SourceError('source-language-schema');
 const code=old?.code||id.toUpperCase().replace(/(\d)p$/iu,'$1-P');
 return {id,code,set:item.imageVariant.setId,cardId:item.cardId,printingId:item.printingId,sourceUrl:origin+'/cards/'+id,nameKo:ko[0]?.name||'',nameEn:en[0].name,type:types[item.classification.type],domains:item.classification.domains.length?item.classification.domains.map(x=>domains[x]):['영역 없음'],stats:{energy:item.attributes.energy??null,power:item.attributes.power??null,might:item.attributes.might??null},textEn:plain(en[0]),textKo:plain(ko[0]),textComplete:!!plain(en[0]),imageUrl:ko[0]?.imageUrl||en[0].imageUrl||'',sourceVariants:Object.fromEntries([ko[0],en[0]].filter(Boolean).map(v=>[v.locale,{imageUrl:v.imageUrl}])),errata:old?.errata||'',imageVerified:false};
}
function fingerprint(c){const x={};for(const k of ['id','code','set','cardId','printingId','nameKo','nameEn','type','domains','stats','textEn','textKo','imageUrl'])x[k]=k.startsWith('text')?String(c[k]||'').replace(/\s+/gu,''):k==='imageUrl'?imageIdentity(c[k]):c[k];return hash(x);}
function errataFingerprint(text){return hash([...String(text||'').matchAll(/현행 문구 \/ Current text:\n([\s\S]*?)\n[^\n]+ · \d{4}-\d{2}-\d{2}\n(https:\/\/playriftbound\.com\/[^\s]+)(?:\n|$)/gu)].map(m=>({text:m[1].replace(/\s+/gu,''),url:m[2]})).sort((a,b)=>canonical(a).localeCompare(canonical(b))));}
function detailSnapshot(html,listing,at){
 const data=objects(html),variants=data.filter(x=>x.cardId===listing.cardId&&x.variant&&typeof x.variant==='object'&&x.variant.printingId===listing.printingId).map(x=>x.variant);
 if(!variants.length)throw new SourceError('source-detail-identity');const selected=variants[0];
 if(selected.active!==true||selected.releaseStatus!=='released')throw new SourceError('source-publication-review');
 if(!['ko-KR','en-US'].includes(selected.locale)||selected.name!==(selected.locale==='ko-KR'?listing.nameKo:listing.nameEn)
   ||plain(selected).replace(/\s+/gu,'')!==(selected.locale==='ko-KR'?listing.textKo:listing.textEn).replace(/\s+/gu,''))throw new SourceError('source-detail-listing-conflict');
 if(imageIdentity(selected.imageUrl)!==imageIdentity(listing.sourceVariants?.[selected.locale]?.imageUrl||listing.imageUrl))throw new SourceError('source-detail-image-conflict');
 const entries=data.filter(x=>Array.isArray(x.errata)).flatMap(x=>x.errata).filter(x=>x.cardId===listing.cardId&&(x.printingId==null||x.printingId===listing.printingId));
 const unique=new Map();for(const e of entries){if(!['ko-KR','en-US'].includes(e.locale)||typeof e.effectiveText!=='string'||!e.effectiveText||new URL(e.source?.url).origin!=='https://playriftbound.com'||!/^\d{4}-\d{2}-\d{2}$/u.test(e.source.version))throw new SourceError('source-errata-schema');unique.set(e.id,e);}
 const errata=[...unique.values()].map(e=>{const date=(e.effectiveFrom||e.source.publishedAt||e.source.version).slice(0,10).split('-').map(Number);const note=`${e.locale==='ko-KR'?'한국어':'영어'} · ${date[0]}년 ${date[1]}월 ${date[2]}일 ${e.effectiveFrom?'시행':'공개'} · ${e.printingId?'해당 일러스트에 적용':'모든 일러스트에 적용'}`;return `${note}\n현행 문구 / Current text:\n${e.effectiveText}\n${e.source.title} · ${e.source.version}\n${e.source.url}\n관찰한 카드 상세 / Observed card: ${listing.sourceUrl}`;}).join('\n\n');
 return {...listing,errata:errataFingerprint(errata)===errataFingerprint(listing.errata)?listing.errata:errata,fetchedAt:at,updatedAt:'',publiclyObserved:true};
}
function createSource(http,{cache={},persist=async()=>{}}={}){
 const cached=async url=>cache.get?cache.get(url):cache[url],store=async(url,value)=>{if(cache.set)await cache.set(url,value);else {cache[url]=value;await persist(cache);}};
 let robots='';async function get(url,options={}){if(robots&&!allowsRobots(robots,new URL(url).pathname))throw new SourceError('source-robots-restricted');const r=await http.request(url,{cache:await cached(url),...options});if(!options.image)await store(url,r);return r;}
 async function list(known){
  const robot=await http.request(origin+'/robots.txt',{cache:await cached(origin+'/robots.txt')});if(!robot.type.includes('text/plain'))throw new SourceError('source-robots-unavailable');robots=robot.body;await store(origin+'/robots.txt',robot);
  const page=await get(origin+'/cards'),found=objects(page.body).filter(x=>x.catalog?.items&&Number.isInteger(x.catalog.total));if(found.length!==1)throw new SourceError('source-listing-schema');const first=found[0].catalog;
  const hrefs=[...new Set([...page.body.matchAll(/href="\/cards\/([a-z0-9-]+)"/gu)].map(m=>m[1]))];
  const byPrinting=new Map(Object.values(known).filter(x=>x.lastGood).map(x=>[x.lastGood.printingId,x.lastGood]));const cards=[];const total=first.total,size=first.size;
  if(first.page!==1||size!==30||!first.configured||total<1||total>20000||hrefs.length!==first.items.length)throw new SourceError('source-listing-schema');
  if(total>Object.keys(known).length+20)throw new SourceError('sync-mass-change');
  for(let n=1;n<=Math.ceil(total/size);n++){
   const j=n===1?first:JSON.parse((await get(`${origin}/api/live/cards?page=${n}&size=30&response=summary`)).body);
   if(j.total!==total||j.size!==size||j.page!==n||j.items.length!==Math.min(size,total-(n-1)*size))throw new SourceError('source-list-incomplete');
   j.items.forEach((item,i)=>{const old=byPrinting.get(item.printingId);const inferred=/^([a-z0-9]+-[a-z0-9]+)-[0-9]+$/iu.exec(item.imageVariant?.collectorNumber||'')?.[1]?.toLowerCase();const id=n===1?hrefs[i]:old?.id||inferred;if(old&&old.id!==id)throw new SourceError('source-printing-collision');cards.push(normalizeListing(item,id,old));});
  }
  if(cards.length!==total||new Set(cards.map(x=>x.id)).size!==total||new Set(cards.map(x=>x.printingId)).size!==total)throw new SourceError('source-list-incomplete');
  const check=objects((await get(origin+'/cards')).body).find(x=>x.catalog?.items)?.catalog;
  if(!check||check.total!==total||hash(check.items.map((x,i)=>fingerprint(normalizeListing(x,cards[i].id,cards[i]))))!==hash(cards.slice(0,first.items.length).map(fingerprint)))throw new SourceError('source-changed-during-list');
  return {cards,checkedAt:new Date().toISOString(),sourceSyncedAt:first.lastSyncedAt||'',hash:hash(cards.map(fingerprint))};
 }
 async function detail(card,at){const result=await get(card.sourceUrl);if(!result.type.includes('text/html'))throw new SourceError('source-detail-schema');return detailSnapshot(result.body,card,at);}
 return {list,detail,async verifyImage(url){await http.request(url,{image:true});return true;},stats:()=>http.stats?.()||{requests:0},cache};
}
module.exports={plain,objects,normalizeListing,fingerprint,errataFingerprint,detailSnapshot,createSource};
