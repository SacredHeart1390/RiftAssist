const $ = (selector) => document.querySelector(selector);
const message = (text) => { $('#message').textContent = text; };
const stateNames = { received:'접수',triaged:'분류',reproduced:'재현 확인',fixing:'수정 중',review:'검수 중',resolved:'해결',duplicate:'중복', 'needs-info':'추가 정보 필요' };
const categoryNames = { app:'앱 오류',ruling:'룰링',translation:'번역',unsure:'분류 미정' };
const limitNames = { questions:'전체 질문/일',generations:'답변 생성/일',translations:'새 번역/일',sessionQuestions:'접속 세션별 질문/일',sessionTranslations:'접속 세션별 번역/일',reports:'전체 제보/일',sessionReports:'접속 세션별 제보/일',concurrent:'AI 동시 호출' };
let current = null, selectedReport = null, initialized = false;
async function api(url, data) {
  const response = await fetch(url, data === undefined ? { cache:'no-store' } : { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청에 실패했습니다.');
  return result;
}
async function refresh() {
  current = await api('/api/status');
  $('#server-status').textContent = current.changing ? '서버 상태를 바꾸고 있습니다.' : current.appRunning ? '앱 서버 실행 중' : '앱 서버 꺼짐';
  $('#start').disabled = current.changing || current.appRunning;
  $('#stop').disabled = current.changing || !current.appRunning;
  $('#toggle-ai').textContent = current.stats.aiEnabled ? 'AI 생성 일시 중지' : 'AI 생성 다시 허용';
  const states = {off:'연결 꺼짐',starting:'공개 연결 시작 중',connected:'터널 연결됨 · 외부 접속 확인은 별도',failed:'연결 실패','external-unverified':'외부 연결은 별도 구성·확인이 필요합니다.'};
  $('#public-status').textContent = `${current.activeOrigin || current.hosting.publicOrigin || '공개 주소 미설정'} · ${states[current.tunnel] || current.tunnel}`;
  $('#copy-url').disabled = !current.activeOrigin || !current.appRunning;
  $('#cloudflare-note').textContent = current.cloudflaredInstalled ? 'Cloudflare 실행 파일 준비됨. 실제 외부 접속 확인은 별도입니다.' : 'Cloudflare 실행 파일 미준비: private/tools/cloudflared.exe를 준비해 주세요.';
  $('#open-app').href = current.localUrl;
  $('#usage').replaceChildren();
  const heading = document.createElement('p'); heading.textContent = `${current.stats.day} · 답변 생성 ${current.stats.limits.generations}회 / 새 번역 ${current.stats.limits.translations}회 한도`; $('#usage').append(heading);
  for (const item of current.stats.calls) {
    const p = document.createElement('p'); p.textContent = `${item.kind === 'answer' ? '답변' : '번역'} ${item.count}회 · 입력 ${item.inputTokens.toLocaleString()} / 출력 ${item.outputTokens.toLocaleString()} 토큰${item.usageUnknown ? ` · 사용량 미확인 ${item.usageUnknown}건` : ''}`; $('#usage').append(p);
  }
  if (current.error) message(current.error);
  if (!initialized) {
    $('#provider').value = current.hosting.provider; $('#public-origin').value = current.hosting.publicOrigin;
    for (const [name,value] of Object.entries(current.stats.limits)) { const label=document.createElement('label'); label.textContent=limitNames[name]; const input=document.createElement('input'); input.name=name; input.type='number'; input.min='1'; input.max=name==='concurrent'?'3':'1000'; input.required=true; input.value=value; label.append(input); $('#limits-fields').append(label); }
    for (const status of current.reportStates) { const option=document.createElement('option'); option.value=status; option.textContent=stateNames[status] || status; $('#report-state').append(option); }
    initialized = true;
    updateProvider();
  }
}
async function reports() {
  const data = await api('/api/reports'); $('#reports').replaceChildren();
  if (!data.reports.length) $('#reports').textContent='접수된 제보가 없습니다.';
  for (const item of data.reports) {
    const button=document.createElement('button'); button.className='report-row'; button.textContent=`${stateNames[item.status]} · ${categoryNames[item.category]} · ${new Date(item.created).toLocaleString('ko-KR')} · ${item.id.slice(0,8)}`;
    button.addEventListener('click', () => run(async () => { selectedReport=await api(`/api/reports/${item.id}`); $('#report-detail').hidden=false; $('#report-json').textContent=JSON.stringify(selectedReport,null,2); $('#report-state').value=selectedReport.status; $('#report-note').value=''; })); $('#reports').append(button);
  }
}
async function run(action, success) { try { await action(); if (success) message(success); } catch (error) { message(error.message); } }
for (const name of ['start','stop']) $(`#${name}`).addEventListener('click', () => run(async () => { $('#start').disabled=true; $('#stop').disabled=true; message('서버 상태를 변경하고 있습니다.'); try { await api(`/api/${name}`,{}); } finally { await refresh(); } }, name==='start'?'서버 시작 요청을 처리했습니다. 아래 공개 연결 상태를 확인하세요.':'서버가 중지됐습니다.'));
$('#refresh').addEventListener('click', () => run(async()=>{ await refresh(); await reports(); }));
$('#toggle-ai').addEventListener('click', () => run(async()=>{ await api('/api/ai',{enabled:!current.stats.aiEnabled}); await refresh(); },'새 AI 요청에 설정을 적용했습니다. 이미 진행 중인 호출은 완료될 수 있습니다.'));
$('#hosting-form').addEventListener('submit', event=>{event.preventDefault();run(async()=>{await api('/api/hosting',{provider:$('#provider').value,publicOrigin:$('#public-origin').value});await refresh();},'주소 설정을 저장했습니다.');});
$('#limits-form').addEventListener('submit', event=>{event.preventDefault();run(async()=>{const values=Object.fromEntries([...new FormData(event.currentTarget)].map(([key,value])=>[key,Number(value)]));await api('/api/limits',values);await refresh();},'호출 한도를 저장했습니다.');});
$('#report-form').addEventListener('submit', event=>{event.preventDefault();run(async()=>{await api(`/api/reports/${selectedReport.id}`,{status:$('#report-state').value,note:$('#report-note').value});selectedReport=await api(`/api/reports/${selectedReport.id}`);$('#report-json').textContent=JSON.stringify(selectedReport,null,2);await reports();},'처리 이력을 저장했습니다.');});
$('#export-report').addEventListener('click',()=>{if(!selectedReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(selectedReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`riftassi-report-${selectedReport.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
$('#backup').addEventListener('click',()=>run(async()=>{const result=await api('/api/backup',{});message(`${result.folder} — ${result.note}`);}));
function updateProvider() { const automatic=['none','cloudflare-quick'].includes($('#provider').value); $('#public-origin').disabled=automatic; if(automatic)$('#public-origin').value=''; }
$('#provider').addEventListener('change',updateProvider);
$('#copy-url').addEventListener('click',()=>run(async()=>{if(current.activeOrigin)await navigator.clipboard.writeText(current.activeOrigin);},'공개 주소를 복사했습니다.'));
run(async()=>{
  const key=new URLSearchParams(location.hash.slice(1)).get('key'); history.replaceState(null,'','/');
  if(key) await api('/api/login',{key});
  await refresh(); await reports(); message('관리 화면 준비됨. 서버 켜기를 누르면 실행합니다.');
  setInterval(()=>{if(!document.hidden)run(refresh);},10000);
});
