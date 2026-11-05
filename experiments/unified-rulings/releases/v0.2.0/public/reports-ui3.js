(() => {
  const lang = () => document.documentElement.lang === 'en' ? 'en' : 'ko';
  const text = (ko, en) => lang() === 'en' ? en : ko;
  let currentRequest = null, capturedRequest = null, clientKey = null, sending = false;
  const dialog = document.createElement('dialog'); dialog.className = 'report-dialog';
  const form = document.createElement('form');
  dialog.append(form);
  const heading = document.createElement('h2'); heading.id = 'report-heading'; dialog.setAttribute('aria-labelledby', heading.id);
  const context = document.createElement('p'); context.className = 'report-note';
  const categoryLabel = document.createElement('label'), category = document.createElement('select'); category.required = true;
  const descriptionLabel = document.createElement('label'), description = document.createElement('textarea'); description.rows=5; description.minLength=5; description.maxLength=5000; description.required=true;
  const expectedLabel = document.createElement('label'), expected = document.createElement('textarea'); expected.rows=3; expected.maxLength=3000;
  const categories = [['app','앱 이용 중 오류','App problem'],['ruling','룰링 답변·근거 오류','Answer or citation problem'],['translation','번역 오류','Translation problem'],['unsure','잘 모르겠음','Not sure']];
  const tags = [['display','글씨·화면 깨짐','Display'],['error','기능 실행 오류','Feature error'],['translation','번역이 이상함','Translation'],['wrong-answer','룰과 답변이 다름','Incorrect answer'],['wrong-source','질문과 맞지 않는 인용','Irrelevant citation'],['no-answer','답변이 나오지 않음','No answer'],['other','기타','Other']];
  const fieldset = document.createElement('fieldset'), legend = document.createElement('legend'); fieldset.append(legend);
  const warning = document.createElement('p'); warning.className='report-note';
  const status = document.createElement('p'); status.setAttribute('role','status');
  const actions = document.createElement('div'); actions.className='report-actions';
  const send = document.createElement('button'); send.type='submit';
  const close = document.createElement('button'); close.type='button'; close.addEventListener('click',()=>{if(!sending)dialog.close();});
  actions.append(send,close); form.append(heading,context,categoryLabel,fieldset,descriptionLabel,expectedLabel,warning,status,actions); document.body.append(dialog);
  const footer = document.createElement('section'); footer.className='report-footer';
  const footerText = document.createElement('p'), open = document.createElement('button');
  open.type='button';footer.append(footerText,open);document.querySelector('.page-footer').before(footer);
  const answerButton=document.createElement('button');answerButton.type='button';answerButton.className='answer-report-button';document.querySelector('#answer-notice').after(answerButton);
  function labels() {
    footerText.textContent=text('답변이 틀리거나, 이용 중 오류가 있으신가요?','Wrong answer or a problem using the app?');
    open.textContent=text('오류·버그 제보','Report a problem');answerButton.textContent=text('이 답변 제보하기','Report this answer');
  }
  function show() {
    if(sending)return;
    capturedRequest=currentRequest;clientKey=crypto.randomUUID();form.reset();status.textContent='';send.disabled=false;close.disabled=false;
    heading.textContent=text('오류·버그 제보','Report a problem');
    context.textContent=capturedRequest?text(`현재 답변과 당시 근거를 연결합니다. 요청 ${capturedRequest.slice(0,8)}`,`This answer and its references will be attached. Request ${capturedRequest.slice(0,8)}`):text('현재 연결된 답변이 없어 앱 이용 문제로 접수합니다.','No answer is attached. Describe the problem below.');
    category.replaceChildren();for(const [value,ko,en] of categories){const option=document.createElement('option');option.value=value;option.textContent=text(ko,en);category.append(option);}
    categoryLabel.replaceChildren(document.createTextNode(text('문제 유형','Problem type')),category);category.value=capturedRequest?'ruling':'app';
    legend.textContent=text('해당하는 항목 · 복수 선택 가능','Details · choose any');fieldset.replaceChildren(legend);
    for(const [value,ko,en] of tags){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=value;label.append(input,document.createTextNode(text(ko,en)));fieldset.append(label);}
    descriptionLabel.replaceChildren(document.createTextNode(text('어떤 문제가 있었나요?','What happened?')),description);
    expectedLabel.replaceChildren(document.createTextNode(text('기대했던 답변·관련 근거 링크 (선택)','Expected answer or source link (optional)')),expected);
    warning.textContent=text('제보와 연결된 질문·답변·근거는 운영자 검토를 위해 저장되며 접수 90일 후 정리 대상입니다. 백업은 별도 관리합니다. 이름·연락처 등 개인정보를 적지 마세요. 자세한 내용은 하단 개인정보 처리방침에서 확인하세요.','Reports and linked questions, answers and references are stored for operator review and become eligible for cleanup 90 days after receipt. Backups are managed separately. Do not include personal information. See the Privacy Policy in the footer.');
    send.textContent=text('제보 보내기','Submit report');close.textContent=text('닫기','Close');dialog.showModal();description.focus();
  }
  open.addEventListener('click',show);answerButton.addEventListener('click',show);
  dialog.addEventListener('cancel',event=>{if(sending)event.preventDefault();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(sending)return;sending=true;send.disabled=true;close.disabled=true;status.textContent=text('제보 저장 중…','Saving report…');
    try {
      const response=await fetch('/api/reports',{method:'POST',headers:{'Content-Type':'application/json','X-RiftAssist-Client':'v0.2.0'},body:JSON.stringify({clientKey,requestId:capturedRequest,category:category.value,description:description.value,expected:expected.value,tags:[...fieldset.querySelectorAll('input:checked')].map(input=>input.value),language:lang()})});
      let result;try{if(!response.headers.get('content-type')?.includes('application/json'))throw Error();result=await response.json();}catch{throw new Error(text('응답을 확인하지 못했습니다. 자동 재전송하지 않았습니다. 같은 제보로 다시 시도할 수 있습니다.','The response could not be confirmed.'));}if(!response.ok)throw new Error(result.error || 'Report failed');
      status.textContent=text(`접수했습니다. 제보 번호 ${result.id}`,`Report received: ${result.id}`);send.hidden=true;
    }catch(error){status.textContent=error.message;send.disabled=false;}finally{sending=false;close.disabled=false;}
  });
  dialog.addEventListener('close',()=>{send.hidden=false;});
  window.addEventListener('rift-answer',event=>{currentRequest=event.detail?.requestId || null;});
  document.querySelector('#language-select').addEventListener('change',labels);
  labels();
})();
