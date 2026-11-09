> 2026-11-09 실행 경로: [MANUAL-LIVE-RELEASE.md](MANUAL-LIVE-RELEASE.md)가 우선합니다. 아래의 상시 broker 설치안은 선택적 자동화 경로입니다. 초기 출시는 같은 엔진을 SSH에서 일회성으로 실행하며 broker 서비스/포트/sudoers를 추가하지 않습니다. .env가 있으면 명시적 승인 하에 암호화 백업하고 허용된 설정만 새 데이터 루트에 복원합니다. 실제 설치/운영 처리는 아직 실행하지 않았습니다.

> 2026-11-06 확인 결과와 새 승인안: [추가 경로·autostart 조사](SOURCE-EXTRAS-AND-AUTOSTART.md). UID/GID1000/1000·Node v24.22.1·Caddy 활성 경로가 확인됐습니다. 기준65개 hash 일치와 전체 referenceVerified=false를 분리하며 추가 경로/helper 동작 검토 전에는 교체를 차단합니다. 이전 문서의 이 항목들에 대한 미확인 표기는 이 관찰로 갱신합니다.

# v0.2.0 실제 출시 준비 — 기존 VM의 단일 서비스 교체

사용자의 배포 방향 변경을 반영한다. **현재 VM·riftassistant.app·HTTPS·Caddy·3001/3100을 유지하며 한 버전만 실행한다. 별도 VM/상시 병렬 운영/추가 Azure 비용은 필수가 아니다.** 짧은 중단을 허용한다. 이전 STAGING.md는 격리 어댑터의 기술 기록이며 라이브 출시의 필수 토폴로지가 아니다.

`staging/replacement-inventory.example.json`은 확인된 경로/포트와 미확인 필드를 구분한 비활성 예시다. installationApproved/inventoryVerified=false, UID/GID1000/1000·Node v24.22.1을 반영했고 hash·근거는 미확인으로 남겼으며 승인 flag만 바꿔 실행할 수 없다. 실제 Caddy 활성 경로·unit 파일·runtime가 제안과 다르면 코드/설치안을 수정·재검증해야 한다.

이 문서는 배포 승인서가 아니다. release/v0.2.0만 변경하고 ready=false를 유지한다. 실제 Azure 접속/변경, 운영 DB·키 접근/복사, 서비스 중지, 설치, 배포는 이번에 실행하지 않는다. 사용자가 제공한 조사 요약만 이용하며 원시 조사 JSON이나 실제 사용자 자료를 저장하지 않는다.

## 확인된 구성과 미확인 사항

사용자 확인: riftassist.service는 active/running/enabled, azureuser:azureuser, /usr/bin/node가 /home/azureuser/RiftAssist/experiments/unified-rulings/releases/v0.1.7/src/manager.js를 실행한다. WorkingDirectory는 해당 v017 릴리스다. Restart=on-failure, 당시 재시작0회였다.

manager가 loopback3100 인증 서버와 loopback3001 gateway를 소유하고, 자식 Node worker가3011을 사용한다.3012는 대기 포트로 관찰됐다. **manager /api/stop과 systemctl stop은 동일하지 않다.** 교체는 manager와 모든 자식 writer를 가진 systemd cgroup 전체를 중지·확인한 뒤 진행한다.

SQLite 열린 파일 경로 메타데이터에서 관찰된 DataRoot는 /home/azureuser/RiftAssist/experiments/unified-rulings다. 내용·키를 읽어 확인한 것은 아니다. 기존 루트를 새 앱으로 직접 열거나 덮지 않는다.

Caddy는 active/running/enabled이고 caddy 계정, /usr/bin/caddy, 관찰 파일 /etc/caddy/Caddyfile에 riftassistant.app 및 reverse_proxy 127.0.0.1:3001이 있다. 관찰 SHA256은 8e0555371405aae75914650e0654efb403731a6975901bc529fc46609444fdfd다. 사용자의 추가 조사로 이 파일이 실제 활성 config임을 확인했다. 위 SHA는 이전 관찰값이므로 현재 hash는 다시 pin해야 한다.443 리스너의 소유 PID도 미확인이다. 이번 방식은 Caddy config·인증서·443을 수정하거나 reload하지 않는다. 같은3001로 새 앱을 시작한다.

riftassist-autostart.service는 enabled/inactive/dead이며 주 서비스에 의존한다. **실제 실행 명령/타이머·소켓·재시작 시 개입 여부는 미확인**이다. 기존 helper를 그대로 실행해도 안전하다고 추정하지 않는다. 배포 어댑터는 helper가 없거나 검토 후 명시적으로 차단됐다는 증거 없이는 중단한다. 자동 mask/disable/삭제를 구현하거나 실행하지 않았다. helper 원문에서 키/쿠키를 출력하지 않는 추가 조사와 helper 조정안의 별도 승인이 필요하다.

RAM 약887MiB, 조사 당시 MemAvailable 약371MiB, 디스크 여유 약59.8GB, HTTPS200/TLS 검증 성공이 관찰됐다. 현재 용량 보증은 아니며 실행 직전 다시 검사한다. 두 앱을 동시 기동해 여유 메모리를 소모하지 않는다.

## 구현 경계

- `staging/replacement.cjs`: 단일 교체 상태기계·서명 계획·승인·잠금·중복/중단 조회. 종전 vault/독립 restore probe/감사 hash chain을 재사용한다.
- `replacement-ubuntu.cjs`: 고정 riftassist.service의 stop/start/show/daemon-reload와 전용 override 하나만 관리한다. 임의 unit/명령/원격 경로를 요청하지 않는다. Caddy는 hash 확인만 하고 변경/reload하지 않는다.
- `replacement-serve.cjs`: root-owned /etc/riftassist-replacement/inventory.json을 고정으로 읽는 endpoint다. stdin JSON에서 status/reconcile/preflight/plan/backup-plan/qualify-backup/replace/rollback-plan/rollback/inspect만 허용한다. 설치용 임의 파일 쓰기/업로드 API는 없다.
- `templates.cjs.replacementWrapper`: 무인수·env-i 고정 endpoint 실행 원문만 제공한다. SSH 명령은 /usr/bin/sudo -n -- /usr/local/libexec/riftassist-replacement-broker 하나다. 설치·sudoers·forced-command 설정은 별도 승인 전 실행하지 않는다.
- `SshReplacementClient`: 기존 Windows OpenSSH와 프로필/호스트 검증/UTF8/안전한 process IO를 재사용하며 이 endpoint의 별도 설치 활성화 및 작업별 exact 승인을 요구한다. 기존 자동 관리자 로그인은 배포 승인이 아니다. 실패 쓰기는 자동 재전송하지 않는다.
- `replacement-launch.cjs`: 기존 service 사용자로 새 manager를 실행하고 원래 /api/login → /api/start 절차로 앱을 한 번 시작한다. 키/쿠키는 메모리에만 두며 argv/일반 설정/로그에 넣지 않는다. 실제 worker는3011/3012, gateway3001, 관리자3100으로 구성할 수 있다. ready=false에서는 production 실행을 거절한다.

현재 WPF 배포 화면은 기존 합성 연습을 유지하고 라이브 버튼은 비활성이다. 새 교체 엔진/SSH 어댑터가 구현됐다는 사실이 실제 서버 설치 또는 클릭 한 번으로 운영 전환 가능한 상태라는 뜻은 아니다. 소스/패키지 무결성 검사에는 새 모듈도 포함한다.

## 준비와 실제 교체 순서

1. **중단 전** 정확한 release SHA·성공한 CI·코드 manifest를 확인한다. 새 릴리스는 새 /var/lib/riftassist-replacement/<승인 UUID>/releases/v0.2.0, 새 데이터는 같은 site/data/v0.2.0에 준비하는 계획이다. 이 경로는 제안이며 서버에 생성하지 않았다. 기존 v017 코드·데이터·활성 knowledge pointer를 보존한다. 기존9개 불일치와 전체 manifest의 추가1개는 정확한 LF/CRLF 차이로 전부 설명됐다([65개 원본·64개 선언·최초 Git 기준 감사](LEGACY-BASELINE.md)). v017은 수정하지 않는다. 고정 Git 원본에서 미리 계산한 정확한 hash 목록으로65개 전체를 검증하고, 통과한 실제 bytes의 hash를 oldCodeHash에 추가 pin하며 교체 전·복귀 시작 직전에 다시 비교한다. 파일이 달라지면 다른 코드를 임의로 실행하지 않는다. root 소유 코드와 별도 service-user 데이터 권한·읽기 전용 code/knowledge mount를 설치안에서 검토한다.
2. 실제 unit FragmentPath·drop-ins/ExecStart/User/Group/KillMode/ControlGroup, UID/GID, Node24 호환성, 활성 Caddy 경로, autostart 정책을 확인하고 inventory에 pin한다. 현재 구현은 /etc/systemd/system/riftassist.service와 전용90-riftassist-release.conf에 한정하며 실제 경로가 다르면 추측해서 쓰지 않고 설치안을 수정·검증해야 한다. 기존 전용 override가 이미 있으면 거절한다.
3. 별도 검토한 knowledge 후보를 새 data root에 준비한다. schema1 카드 형식은 호환하지만 권한 미확인 자료를 가져오거나 허가 flag를 바꾸지 않는다. 기존1527개 Riftnaru 출처 카드·이미지·번역은 허가 증거 전 공개/AI 입력 대상이 아니다. 규칙/저지 사례도 현재성·재사용 조건을 확인한 범위에서만 유지한다. 원본자료는 삭제하지 않는다.
4. 사용자에게 대상 VM/서비스·구/신 버전·commit·백업 상태·중단 영향·복귀 대상을 표시하고 **별도 최종 교체 승인**을 받는다. HMAC 계획은 inventory/site/SHA/상태 세대/대상/10분 기한에 바인딩한다.
5. systemctl stop riftassist.service를 한 번 실행한 뒤 inactive/failed·MainPID0·해당 cgroup의 모든 자식 종료와3100/3001/3011/3012 해제를 확인한다. 불확실하면 DB에 접근하거나 다른 버전을 시작하지 않는다. 응답 손실을 성공으로 간주하지 않고 inspect/status로 확인한다.
6. **서비스 중단 후** 운영 SQLite를 readOnly 연결/online backup으로 일관성 snapshot하고 storage.key·sessions.key·manager.key 등 확인한 키 및 DB 안의 설정/질문/제보/이력과 unit/Caddy/전용 override 설정을 서버 private 안에서 AES-GCM 봉인한다. 설정/키/행은 결과나 GitHub artifact에 넣지 않는다. 기존 makeBackup API는 purge 부수효과가 있어 호출하지 않는다.
7. 별도 프로세스에서 임시 복원 DB의 integrity_check 및 실제 암호문 복호화 가능성을 확인한다. 기존 DB 위에 restore하지 않는다. 실패하면 새 앱을 시작하지 않고 이전 실행 설정으로 복귀한다. wrapping key는 backup envelope와 분리하며, 별도 보관·디스크 암호화·복구키/오프호스트 보관 정책은 운영자가 확정해야 한다.
8. 검증된 snapshot을 **새 private 디렉터리에만** 복원한다. DB schema hash와 두 버전 operations-store 코드의 동일성 검사를 통과해야 한다. schema가 다르면 자동 migration/직접 덮어쓰기하지 않는다. 기존 설정/한도/AI 상태를 보존하며 검증된 사본의 appRelease 포인터만 v0.2.0으로 맞춘다. cloudflare/ngrok 설정은 자동 변환하지 않고 거절한다. 실제 production은 기존 hosting이 external 또는 none이며 publicOrigin=https://riftassistant.app로 확인된 경우만 대상이며 local-only/미확인 origin은 자동 변경하지 않고 중단한다. 격리 시험은 none + localhost를 사용한다. 미확인 추가 DB/외부 설정이 있으면 포함 범위 검토가 선행해야 한다.
9. 주 unit 원문/계정/의존성은 유지하고 검토한 전용 drop-in에서 WorkingDirectory/ExecStart를 새 launcher로 바꾼다. base unit/Caddy hash와 전용 override CAS가 달라지면 중단한다. 새 override에는 TimeoutStopSec=115를 포함한다. 기존 unit의 중지 제한/진행 중 요청은 별도 검토하며 중단 시 아직 처리 중인 AI/제보 응답이 끊길 수 있어 중복 전송을 피하도록 안내해야 한다. daemon-reload → 같은 riftassist.service 시작 → 정상 관리자 인증/앱 시작 순서다. 새/구 버전을 동시에 실행하지 않는다.
10. 로컬 앱 버전·규칙 준비·관리자 인증/상태와 실제 HTTPS200/TLS를 점검한다. 이때 새 복원 사본에서 세션 통계가 늘 수 있다. 유료 AI 호출은 health check에 넣지 않는다. 실제 AI가 활성 상태라면 기존 환경에 명시적인 live provider/호출 허용/키 설정이 검토되어 있어야 하며, 없을 때 mock으로 대신 운영하지 않고 launcher가 거절한다. 자동 유료 호출은 하지 않는다. 실제 카드/규칙 검색·KO/EN·AI 품질·제보/관리자·브라우저/PWA는 별도의 승인된 수동 기능 검수도 필요하다. 공개 HTTPS200 하나만으로 버전/기능 검증 완료를 선언하지 않는다.

## 실패·롤백·중단

새 앱 기동/검사 실패 시 현재 작업의 새 서비스부터 중지하고 종료·포트 해제를 확인한 뒤, 저장한 전용 override 원복/daemon-reload/구 service 시작/구 버전 health를 수행한다. base unit/Caddy·다른 운영자 변경을 덮지 않는다. stop 응답 유실 시 동일 stop을 자동 반복하지 않고 관찰부터 한다. 이전 버전 시작/원복도 실패하면 recovery-required로 남기고 자동 반복하지 않는다.

정상 교체 후의 rollback도 별도 승인 작업이다. 새 버전 서비스를 중지하고 **새 DB/키/기록도 별도 암호화 백업·복원 검사**한 뒤 기존 v017 실행 설정으로 복귀한다. 기존 v017 DB는 동결된 원본이며 새 버전 DB를 덮지 않는다. 새 버전의 제보/사용자 기록·새 DB·키·코드·백업은 그대로 보존한다. **롤백 후 새 버전에서만 생긴 제보가 v017 관리자에 자동 합쳐지는 것은 아니다.** 보존 사본의 별도 열람/중복 없는 병합·보관/삭제 정책은 후속 승인 작업이다. RPO/RTO와 사용자 안내를 최종 승인에 포함한다.

operation ID·서명·inventory/SHA·상태 세대가 다른 재요청은 거절하고 동일 작업은 기존 결과만 반환한다. 남은 lock/미확정 단계는 앱 재실행 후 조회할 수 있다. 강제 종료/재부팅 후 임의로 lock을 지우거나 DB를 복구하지 않는다. 별도 복구 검토가 필요하다. 한 번 사용하거나 실패한 candidate private을 다음 작업이 덮어쓰지 않는다.

## 메모리·자료·출시 차단 사항

현재 복원 probe/봉인 구현은 메모리에 전체 snapshot을 다루므로 단일 교체 경로는 DB/snapshot16MiB 상한과 작업 직전 MemAvailable >=128MiB+8×DB 크기를 적용한다. 부모/복원 자식이 겹치는 비용을 고려한 보수적 상한이며887MiB에서 실측한 보증은 아니다. 큰 DB나 메모리 부족은 중단하고 streaming/offline 도구 또는 별도 수동 검증을 설계한다. 추가 VM을 자동 생성하지 않는다. 기존 staging 경로의 상한128MiB는 이 단일 교체의 한도로 사용하지 않는다.

현재 차단: autostart 실행/개입 정책, unit/drop-ins·KillMode/cgroup·현재 설정 hash(UID/GID·Node v24.22.1·Caddy 활성 경로는 확인), 실제 DB schema/크기·추가 설정/키 목록, 기존 카드·이미지·번역 및 규칙/사례 권한, 개인정보 운영자 연락처/법적 정보·보관/삭제·외부 AI 전송 조건, 실제 workload 메모리, 복구키/백업 보관, 실제 도메인 PWA/쿠키 전환·복귀, 위 결과에 근거한 readiness 결정과 설치/배포 승인이다. ready=true를 자동으로 설정하는 기능은 없다.

API 승인 전에도 권한 확인된 규칙 검색·제보·관리·허가 범위 내 카드 검색과 격리 mock 시험을 개발할 수 있다. Riot API 미승인·Riftnaru 이용 권한 미확인은 서로 다른 확인 사항이며 API 승인만으로 기존 자료 이용 권한이 생기지 않는다. 원래자료 보존과 새 버전 공개 제한을 함께 유지한다.

## 격리 검증과 실제/모의 구분

replacement.test.cjs는 합성 service IO와 실제 SQLite/암호화/독립 restore를 사용해 중지 순서·스키마 거절·승인·실패/중단·중복·기록/키 보존을 검사한다. 실제 server OS 제어를 했다고 주장하지 않는다.

replacement-integration.cjs는 disposable Ubuntu의 실제 v017 manager/gateway/worker와 실제 v020 manager/gateway/worker를 **같은 포트에서 순차 실행**하고 변경 없는 Caddy/TLS를 통해 확인한다. 기존 v017 소스는 수정하지 않으며 충돌 없는 임시 worker 포트만 테스트 preload로 메모리 주입한다. collector는 합성 owner PID로 억제하고 외부 AI는 mock이다. 컨테이너는 --network none, systemd 감독은 모의다. Ubuntu CI --systemd는 고유한 **앱 unit 하나**를 순차 전환하며 실제 systemd를 검증한다. 실제 Azure 경로/설치/유료 AI/운영 자료 검증으로 확대하지 않는다.

추가 조사는 helper의 비밀값 제외 실행 형태·참조 스크립트 경로/개입 시점, Caddy 실제 --config 경로/443 소유, systemd FragmentPath/drop-ins·KillMode/ControlGroup·UID/GID/Node 버전에 한정한 후속 승인안이 필요하다. 기존 inspect-azure.py는 바꾸지 않으며 승인받은 SHA256도 보존한다. 이번 작업에서는 추가 SSH를 실행하지 않는다.

## 추가 읽기 조사 (사용자 승인 완료, 실제 실행 결과 대기)

별도 승인 대상 원문은 staging/inspect-replacement-topology.py이며 SHA256은 `6d0a68ff75eeccc45235d5607b72704ef9079f159d94f1fc52bf74acd36cbfa1`이다. 기존 승인된 inspect-azure.py는 그대로다.

이 새 원문은 고정3개 unit(riftassist.service, riftassist-autostart.service, caddy.service)에 대해 systemctl show의 제한된 속성만 요청한다. Environment/원시 argv를 출력하지 않고, helper의 로그인/시작/중지/sleep/systemctl 언급 여부·참조 스크립트 경로·Caddy --config 경로·FragmentPath/drop-ins·KillMode/cgroup/의존성만 정규식으로 추출한다. shell/스크립트 실제 동작을 검증했다고 표기하지 않는다. /usr/bin/id -u/-g azureuser와 깨끗한 환경의 /usr/bin/node --version을 읽는다. DB/키/사용자 기록/환경값/로그/참조 스크립트/Caddy 본문/443 socket은 읽지 않고, 파일 저장·sudo·서비스 제어·HTTPS 요청도 없다. 최대6개 하위 명령, 각5초 timeout이며 권한 부족은 미확인으로 남긴다. SSH 정상 접속 로그와 소량 조회 부하는 발생할 수 있다.

승인 후에만 새 ZIP의 최상위 PowerShell에서 다음을 실행한다. 값/원문 불일치 때는 SSH가 실행되지 않는다. 실제 대상 IP/사용자/키 경로가 그대로인지 확인한다. raw stderr/응답은 자동 저장하지 않는다.

```powershell
& {
  $probeBytes = [IO.File]::ReadAllBytes((Join-Path (Get-Location).Path 'staging\inspect-replacement-topology.py'))
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $digest = [BitConverter]::ToString($sha.ComputeHash($probeBytes)).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
  if ($digest -cne '6d0a68ff75eeccc45235d5607b72704ef9079f159d94f1fc52bf74acd36cbfa1') { throw 'SHA256 불일치: SSH 실행 안 함' }
  $source = [Text.Encoding]::ASCII.GetString($probeBytes)
  $result = @($source | & "$env:WINDIR\System32\OpenSSH\ssh.exe" -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectionAttempts=1 -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 -o ForwardAgent=no -o ForwardX11=no -o ClearAllForwardings=yes -o PermitLocalCommand=no -o LogLevel=ERROR -o UserKnownHostsFile="$env:USERPROFILE\.ssh\known_hosts" -i "$env:USERPROFILE\.ssh\riftassistant-key.pem" azureuser@20.222.152.195 "python3 -B -" 2>$null)
  if ($LASTEXITCODE -ne 0) { throw 'SSH 조사 실패: stderr 표시/저장 안 함' }
  $report = ($result -join "`n") | ConvertFrom-Json -ErrorAction Stop
  if ($report.protocol -cne 'riftassist-replacement-topology-1' -or $report.readOnly -ne $true) { throw '응답 형식 불일치: 원시 응답 공유 금지' }
  $report | ConvertTo-Json -Depth 12
}
```

helper가 별도 스크립트/숨겨진 환경 설정을 참조하면 이 조사만으로 동작을 확정할 수 없다. 그때는 해당 코드/설정의 비밀값 없는 별도 검토 범위를 제시하고 추가 승인을 받아야 한다. 443 소유 PID도 이 조사로 새로 확정하지 않는다. 어떠한 추가 권한도 자동 요청/부여하지 않는다.

## 두 원문을 한 번에 실행하는 승인 범위

기존 조사(원문inspect-azure.py)의 승인을 확장하지 않는다. 사용자가 a7dbf966의 topology 및 고정65개 소스 hash 검사 원문을 승인했다. 아래 두 가지 읽기 조사만 사용자 PC에서 실행한다. 설치/DB·키 접근/배포 승인으로 확대하지 않는다. 실제 설치·DB/키 접근·변경은 포함하지 않는다. 사용자가 실행한 요약 결과를 2026-11-06 반영했으며 원시 JSON은 확보하지 않았다.

```powershell
# 최신 검증 Windows ZIP의 최상위에서 실행. 두 hash 모두 먼저 검사한다.
& .\Invoke-ReleasePreparation.ps1 -Mode Verify -PackageDirectory (Get-Location).Path
& .\Invoke-ReleasePreparation.ps1 -Mode Inspect -PackageDirectory (Get-Location).Path
```

검증한 동일 원문만 메모리에서 stdin으로 전달한다. 서버에 원문/결과를 저장하지 않고 비밀값/일반 stderr를 표시하지 않는다. 실제 대상 IP/계정/키 경로가 그대로인지 확인한다. 두 조사 중 먼저 실행한 결과가 남더라도 두 번째 실패를 성공으로 숨기지 않는다. 정상적인 SSH 접속 기록·소량 조회 부하는 발생할 수 있다. 결과의 referenceVerified가 false면 현재 서버 코드가 복구 기준과 같다고 선언하지 않으며 교체/롤백을 계속 차단한다.

## 2026-11-05 추가 보완

[RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md)에 설치 대상/승인 분리/배포 전후 검수와 복구 조건을 통합했다. release readiness와 실제 DB 검사가 서로 선행 조건이 되는 문제를 없애기 위해, 별도 승인된 backup-plan/qualify-backup 유지보수로 v017만 중지·백업·독립 검증·재시작할 수 있다. 새 버전 실행/DB 복사는 없고 ready=false를 유지한다. 실제 schema/복호화/필수 키3개·한도·AI 상태·publicOrigin을 값 노출 없이 확인한다.

구 manager는 helper가 없을 때 systemd 시작만으로 앱이 뜨지 않을 수 있어 정상 /api/login·/api/status 후 /api/start를 한 번만 요청한다. 재시작/응답 손실은 자동 재전송하지 않는다. 새 앱 실행 뒤 복귀하면 소유 drop-in으로 AI 생성을 일시 중지해 동결된 구 DB의 호출 카운터 때문에 비용 한도가 중복 사용되지 않게 한다. 새 호출/제보는 보존하며 비용 대조/AI 재개는 별도 승인 작업이다. 단순 backup qualification은 원래 AI 설정을 유지한다.

완료 감사 저장 실패 시 영속 버전 포인터도 보상하고, reconcile은 서비스/설정/기록 불일치를 읽기 전용으로 표시한다. 외부 override 변경은 계속 차단한다. 디스크/메모리/키 누락·설정 불일치·백업 무결성 실패는 새 앱 실행을 막는다. candidate 소스 전체의 미등록 파일/디렉터리도 거절해 부가 파일이 공개 폴더로 섞이지 않는다.

브라우저는 정적 자산 network 우선/릴리스 marker 캐시/오래된 서버 감지/입력 보존/수동 연결 재확인을 사용한다. 유료 요청 응답이 불명확하면 자동 재전송하지 않고 동일한 요청 내용의 수동 재시도에 idempotency key를 재사용한다. 기존 signed 쿠키는 명시적인 production 전환에서만 같은 owner/원래 만료를 유지한다. 기존 개발 세션은 기본 분리한다. 실제 도메인과 기존 설치형 PWA 검수는 별도로 필요하다.

replacement-package.cjs는 code-only 후보·production 의존성·고정 wrapper·설치 계획/hash를 생성하고 검증한다. 실제 root 설치/SSH 권한 부여를 실행하는 도구가 아니다. broker와 기존 staging은 다른 namespace이며 launcher의 상대 require와 독립 restore 자식 의존성도 포함한다. 실제 topology 결과와 설치 inventory가 확정되기 전 운영 설치/수동 복구 명령은 추정하지 않는다.
