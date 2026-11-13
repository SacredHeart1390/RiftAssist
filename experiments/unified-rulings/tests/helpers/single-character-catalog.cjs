// Synthetic cards only; never installed into production data.
const {fixture,syntheticPermittedCards}=require('./isolated-server.cjs');
function catalog(){const original=fixture.cards.cards[0];return syntheticPermittedCards({...fixture.cards,cards:[
 ['shen-legend','쉔 - 황혼','Shen - Twilight','전설'],['shen-unit','쉔, 방패','Shen, Shield','유닛'],
 ['mel-legend','멜 - 반향','Mel - Echo','전설'],['mel-unit','멜','Mel','유닛'],
 ['disciple','쉔의 제자','Disciple of Shen','유닛'],['melon','멜론','Melon','유닛'],
 ['ahri','아리','Ahri','유닛'],['jinx','징크스','Jinx','유닛'],['future','진: 명사수','Jhin: Marksman','Champion'],
 ['ordinary','가','A','유닛']
].map(([id,nameKo,nameEn,type])=>({...original,id,nameKo,nameEn,type,aliases:[],textEn:'Synthetic '+id}))});}
module.exports={catalog};
