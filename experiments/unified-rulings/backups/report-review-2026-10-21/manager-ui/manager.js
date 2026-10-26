const $ = (selector) => document.querySelector(selector);
const message = (text) => { $('#message').textContent = text; };
const stateNames = { received:'접수',triaged:'분류',reproduced:'재현 확인',fixing:'수정 중',review:'검수 중',resolved:'해결',duplicate:'중복', 'needs-info':'추가 정보 필요' };
const categoryNames = { app:'앱 오류',ruling:'룰링',translation:'번역',unsure:'분류 미정' };
const limitNames = { questions:'전체 질문/일',generations:'답변 생성/일',translations:'새 번역/일',sessionQuestions:'접속 세션별 질문/일',sessionTranslations:'접속 세션별 번역/일',reports:'전체 제보/일',sessionReports:'접속 세션별 제보/일',concurrent:'AI 동시 호출' };
let current = null, selectedReport = null, initialized = false;
let knowledge = null;
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
  await refresh(); await reports(); await refreshKnowledge(); message('관리 화면 준비됨.');
  setInterval(()=>{if(!document.hidden)run(refresh);},10000);
});
async function refreshKnowledge() {
  knowledge = await api('/api/knowledge');
  const apps = await api('/api/app-releases');
  $('#knowledge-status').textContent = `선택된 자료: ${knowledge.active.releaseId} · 실행 중 자료는 서버 반영 후 적용`;
  $('#knowledge-json').textContent = JSON.stringify(knowledge, null, 2);
  $('#knowledge-release').replaceChildren();
  for (const item of knowledge.releases) {
    const option = document.createElement('option');
    option.value = item.releaseId;
    option.textContent = `${item.releaseId} · 규칙 ${item.counts.rules} / 사례 ${item.counts.judgeCases || 0} / 카드 ${item.counts.cards}${item.reviewRequired ? ' · 적용 전 확인 필요' : ''}`;
    $('#knowledge-release').append(option);
  }
  $('#source-status').replaceChildren();
  const names = { 'official-en':'공식 영문 자료', 'official-ko':'공식 한국어 자료', riftjudge:'RiftJudge 목록', riftnaru:'카드 자료' };
  const states = { 'awaiting-review':'변경 발견 · 검토 대기', unchanged:'목록 변경 없음', failed:'확인 실패 · 기존 자료 유지', 'manual-import-required':'자동 수집 경로 미연결' };
  for (const [id, value] of Object.entries(knowledge.contentSync ? {} : knowledge.discovery?.sources || {})) {
    const line = document.createElement('p');
    line.textContent = `${names[id] || id}: ${states[value.state] || value.state}${value.pendingReview && value.state === 'unchanged' ? ' · 미적용 변경 있음' : ''}${value.checkedAt ? ` (${new Date(value.checkedAt).toLocaleString('ko-KR')})` : ''}`;
    $('#source-status').append(line);
  }
  const sync = knowledge.contentSync;
  if (sync) {
    const line = text => { const p = document.createElement('p'); p.textContent = text; $('#source-status').append(p); };
    const stale = Date.now() - Date.parse(sync.updatedAt) > 180000;
    const phases = { starting:'준비 중', 'official-documents':'공식 규칙 확인 중', sitemap:'사례 목록 확인 중', 'judge-bodies':'사례 본문 수집 중', publishing:'새 자료 적용 중', waiting:'다음 갱신 대기', 'paused-source':'출처 응답 대기 후 재시도', stopped:'수집기 중지' };
    line(`자동 갱신: ${stale ? '수집기 상태 확인 필요' : phases[sync.phase] || sync.phase} · ${new Date(sync.updatedAt).toLocaleString('ko-KR')}`);
    line(`RiftJudge 본문 ${Number(sync.judge.collected || 0).toLocaleString()} / 공개 목록 ${Number(sync.judge.total || 0).toLocaleString()}건 · 미수집 ${sync.judge.missing || 0}건 · 접근 불가 ${sync.judge.unavailable || 0}건`);
    for (const [id, value] of Object.entries(sync.official?.documents || {})) {
      line(`${id === 'core-rules' ? '코어룰' : '토너먼트룰'}: ${value.state === 'current' ? '본문 갱신 완료' : value.state === 'partial-language' ? '영문 갱신 · 한국어 확인 필요' : '기존 자료 유지'}${value.count ? ` · ${value.count}개 조항` : ''}${value.error || value.koError ? ` · ${value.error || value.koError}` : ''}`);
    }
    for (const item of Object.values(sync.errors || {})) line(`갱신 확인 필요: ${item.message}`);
    if (sync.judge.pausedUntil) line(`수집 재시도: ${new Date(sync.judge.pausedUntil).toLocaleString('ko-KR')}`);
    line('6시간마다 새 자료 확인 · 사례 본문은 변경분 우선, 전체 본문은 7일마다 재확인 · AI 사용료 없음');
  }
  const cards = knowledge.discovery?.sources?.riftnaru;
  if (cards?.mode) {
    const line = text => { const p = document.createElement('p'); p.textContent = text; $('#source-status').append(p); };
    const phases = { 'source-required':'원격 제공 주소 미연결 · 파일 가져오기 가능', checking:'제공 자료 확인 중', waiting:'다음 확인 대기', paused:'갱신 일시 중지', 'awaiting-review':'변경 내용 확인 필요 · 기존 자료 유지', 'source-unavailable':'갱신 실패 · 기존 자료 유지', failed:'갱신 설정 또는 파일 확인 필요', stopped:'카드 수집기 중지' };
    const stale = !cards.running || Date.now() - Date.parse(cards.checkedAt) > 180000;
    line(`카드 ${Number(cards.cardCount || 0).toLocaleString()}개: ${stale ? '수집기 상태 확인 필요' : phases[cards.state] || cards.state}`);
    if (cards.lastSourceCapturedAt) line(`마지막 처리 파일의 원본 수집일: ${new Date(cards.lastSourceCapturedAt).toLocaleString('ko-KR')} · 현재 판본: ${cards.activeVersion || '확인 필요'}`);
    if (cards.diff) line(`최근 파일 처리: 추가 ${cards.diff.added || 0} · 변경 ${cards.diff.changed || 0} · 번역 확인 ${cards.diff.translationPending || 0} · 목록 누락 ${cards.diff.missing || 0} (누락 카드는 유지)`);
    if (cards.error) line(`카드 갱신 확인 필요: ${cards.error}`);
    if (cards.mode === 'inbox') line('Open-Card-Import-Folder.cmd로 폴더를 열고 지정 형식의 JSON 파일을 넣으면 약 1분마다 검사합니다. 새로운 카드의 원격 자동 수집은 아직 연결되지 않았습니다.');
    else line(`제공 JSON ${cards.intervalHours}시간마다 확인 · 전체 목록 7일마다 재확인 요청 · ${cards.remoteConnected ? '최근 연결 성공 기록 있음' : '연결 성공 미확인'}${cards.nextCheckAt ? ` · 다음 확인 ${new Date(cards.nextCheckAt).toLocaleString('ko-KR')}` : ''}`);
    line('내용이 바뀐 경우에만 자료 교체 · 앱 재시작 및 AI 호출 없음');
  }
  $('#app-release-status').textContent = apps.current.releaseId ? `실행 중: ${apps.current.releaseId} · 처리 중 ${apps.current.activeRequests}건` : '앱 서버 꺼짐';
  $('#app-release').replaceChildren();
  for (const value of apps.releases) {
    const option = document.createElement('option'); option.value = value.releaseId; option.textContent = value.releaseId; $('#app-release').append(option);
  }
}
$('#refresh-knowledge').addEventListener('click', () => run(refreshKnowledge));
$('#discover-sources').addEventListener('click', () => run(async () => {
  $('#discover-sources').disabled = true; message('공식 규칙·사례 본문과 연결된 카드 제공 자료의 갱신을 요청합니다.');
  try { await api('/api/knowledge/discover', {}); await refreshKnowledge(); }
  finally { $('#discover-sources').disabled = false; }
}, '갱신 요청을 접수했습니다. 수집 중에도 앱을 사용할 수 있습니다. 잠시 후 자료 상태 새로고침을 눌러 주세요.'));
$('#activate-knowledge').addEventListener('click', () => run(async () => {
  if (!knowledge || !$('#knowledge-reviewed').checked) throw new Error('자료 상세 기록을 확인한 뒤 확인란을 선택해 주세요.');
  await api('/api/knowledge/activate', { releaseId: $('#knowledge-release').value, expectedId: knowledge.active.releaseId, reviewed: true });
  $('#knowledge-reviewed').checked = false; await refreshKnowledge();
}, '자료를 선택했습니다. 실행 중 앱은 최대 10초 뒤 새 요청부터 반영합니다.'));
$('#deploy-app').addEventListener('click', () => run(async () => {
  $('#deploy-app').disabled = true; message('새 앱을 준비하고 기존 응답의 완료를 기다립니다.');
  try { await api('/api/app-release', { releaseId: $('#app-release').value }); await refresh(); await refreshKnowledge(); }
  finally { $('#deploy-app').disabled = false; }
}, '앱 버전 전환을 마쳤습니다.'));
