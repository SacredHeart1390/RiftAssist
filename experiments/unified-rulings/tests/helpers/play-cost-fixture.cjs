const {fixture}=require('./isolated-server.cjs');
// Synthetic wording with official procedural meanings; no production card or user text.
const clauses={
 '303.1':'Game Actions occur one at a time and are executed completely.',
 '303.2':'Game Actions cannot be performed simultaneously.',
 '303.2.a':'For actions activated simultaneously, use Turn Order, starting with the current Turn Player.',
 '354':'Move the card from its current zone to the Chain.',
 '355.10.c':'An object mentioned only as part of a cost, trigger condition, or replacement effect is not a target.',
 '355.10.e':'Objects chosen in whole or in part by other players are not targets; those players choose as the effect resolves.',
 '355.18':'When an effect requires players to make choices not outlined in finalization, those choices are made on resolution.',
 '356.2.a.1':'Mandatory additional costs use the phrase as an additional cost without may and must be paid to complete playing the card.',
 '356.2.b.1':'Optional additional costs include may and are paid only if the player chose to pay them.',
 '356.7':'Costs may be Energy costs, Power costs, or non-standard costs.',
 '357.2':'Pay any non-standard Cost summed in step 3 in any order.',
 '357.2.a':'Costs replaced with other events by replacement effects are still considered paid.',
 '358.2':'Check that all costs were paid.',
 '359.2.c':'A Unit enters the Board exhausted at its chosen Location during the finish-finalizing step.',
 '412.1':'The player performing a Game Action is responsible for it.',
 '429.3.a':'Players may only Kill units when Game Effects direct them to do so.',
};
const template=fixture.rules.find(r=>r.id==='core-rules:472');
const rules=[...fixture.rules.filter(r=>!clauses[r.ruleId]),...Object.entries(clauses).map(([id,text])=>({...template,id:'core-rules:'+id,ruleId:id,officialTextEn:text,officialTextKo:''}))];
const base=fixture.cards.cards[0];
const costCard={...base,id:'fixture-cost-unit',code:'TEST-201',nameKo:'시험 공물 유닛',nameEn:'Test Offering Unit',aliases:[],type:'Unit',modelReady:true,textKo:'',textEn:'As an additional cost to play me, kill a friendly unit.'};
const choiceCard={...base,id:'fixture-choice-spell',code:'TEST-202',nameKo:'시험 공동 선택',nameEn:'Test Shared Choice',aliases:[],type:'Spell',modelReady:true,textKo:'',textEn:'Each player picks a unit they control and kills it.'};
const costIds=['354','355.10.c','356.2.a.1','356.2.b.1','356.7','357.2','358.2','359.2.c'];
const choiceIds=['303.1','303.2','303.2.a','355.10.e','355.18','412.1'];
module.exports={rules,costCard,choiceCard,costIds,choiceIds,clauses,template};
