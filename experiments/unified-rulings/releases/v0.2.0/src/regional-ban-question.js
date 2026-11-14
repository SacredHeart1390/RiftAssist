'use strict';
const {decide,resolveCardName}=require('./regional-ban');
function evaluate(question,cards,language='ko',today=new Date().toISOString().slice(0,10),catalog=[]){
 if(!/(?:금지|밴\s*카드|ban(?:ned)?\s+card|ban\s+list|is\s+.+\s+banned)/iu.test(question))return null;
 const region=/한국|대한민국|\b(?:korea|korean|kr)\b/iu.test(question)?'kr':/글로벌|\bglobal\b/iu.test(question)?'global':null;
 const format=/\b2\s*v\s*2\b|2대2/u.test(question)?'2v2':/실드|\bsealed\b/iu.test(question)?'sealed':/스탠다드|\bstandard\b/iu.test(question)?'standard':null;
 const koreanDate=/(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/u.exec(question);
 const date=/\b20\d{2}-\d{2}-\d{2}\b/u.exec(question)?.[0]||(koreanDate?`${koreanDate[1]}-${koreanDate[2].padStart(2,'0')}-${koreanDate[3].padStart(2,'0')}`:today);
 const eventRules=/이번\s*대회|특정\s*대회|대회\s*별도|event\s+(?:addendum|exception|rules)/iu.test(question);
 const matched=[];
 for(const card of cards||[]){const known=resolveCardName(card.nameEn)||resolveCardName(card.nameKo);if(known&&!matched.some(x=>x.id===known.id))matched.push(known);}
 // A printed code can identify a catalog entry, but the official ban still follows
 // its verified full card name across printings. Ambiguous codes never decide.
 const codeMatches=(catalog||[]).filter(card=>card.code&&new RegExp('(^|[^\\p{L}\\p{N}])'+card.code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^\\p{L}\\p{N}])','iu').test(question));
 if(codeMatches.length===1){const known=resolveCardName(codeMatches[0].nameEn)||resolveCardName(codeMatches[0].nameKo);if(known&&!matched.some(x=>x.id===known.id))matched.push(known);}
 for(const name of require('./regional-ban-events.json').cards){if([name.en,name.ko,name.en?.replace(',',' -')].some(n=>n&&question.toLocaleLowerCase().includes(n.toLocaleLowerCase()))&&!matched.some(x=>x.id===name.id))matched.push(name);}
 const result=matched.length===1&&codeMatches.length<2&&region&&format?decide({cardId:matched[0].id,region,format,date,eventRules}):null;
 const ko=language!=='en';
 const follow=[];if(!matched.length)follow.push(ko?'금지 여부를 확인할 카드의 전체 이름이나 카드를 선택해 주세요.':'Select a card or enter its full name.');
 if(matched.length>1)follow.push(ko?'카드 한 장씩 질문해 주세요.':'Ask about one card at a time.');
 if(!region)follow.push(ko?'한국 또는 글로벌 지역을 지정해 주세요.':'Specify Korea or global.');
 if(!format)follow.push(ko?'Standard, 2v2, Sealed 중 형식을 지정해 주세요.':'Specify Standard, 2v2, or Sealed.');
 if(result?.ban==='unknown')follow.push(ko?'공식 시행일·출시일 또는 대회별 규정을 추가 확인해야 합니다.':'The effective date, release date, or event rules need verification.');
 const verdict=result?.ban==='banned'?(ko?'금지':'Banned'):result?.ban==='not-banned'?(ko?'금지 목록에 없음':'Not on the ban list'):(ko?'판정 보류':'Ruling pending');
 return {status:result?.ban==='unknown'||!result?'insufficient-evidence':'regional-ban',recommendation:verdict,
  reasoning:result?.ban==='unknown'||!result?(ko?'확인된 공식 자료만으로는 단정할 수 없습니다.':'Official sources do not establish a definitive result.'):(ko?'확인된 공식 금지 목록 기준입니다. 카드 사용 가능 여부는 별도입니다.':'Based on the reviewed official ban list. Card availability is separate.'),
  resolutionSteps:[],followUpQuestions:follow,evidence:[],judgeCases:[],cards:cards||[],citedRuleIds:[],citedCaseIds:[],citedCardIds:[],caseComparisons:[],
  regionalBan:result||{ban:'unknown',availability:'unknown',sources:[]},ai:{used:false},sourceUrls:result?.sources||[]};
}
module.exports={evaluate};
