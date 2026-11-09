# Azure 실제 관찰 반영과 남은 최소 출시 조건

2026-11-09. release/v0.2.0 전용. 사용자가 두 읽기 조사의 SSH 종료0/정상 JSON을 보고했다. 원시 JSON 대신 제공된 요약을 `staging/azure-observations-2026-11-09.json`에 기록했다. 이 작업에서는 실제 SSH/서버 변경/DB·키·환경 파일 내용 접근을 하지 않았다. installationApproved/inventoryVerified/authorizedToDeploy와 app ready는 false다.

## 확인된 것과 확인하지 않은 것

- 주 서비스: active/running/enabled, simple/on-failure/control-group, `/etc/systemd/system/riftassist.service`, WorkingDirectory는 기존 v017, drop-in0. manager3100/gateway3001/worker3011·3012 및 기존 Caddy를 재사용한다. 실제 unit/Caddy 내용 hash와 EnvironmentFile·숨은 실행 환경은 아직 확인하지 않았다.
- Caddy: active/running/enabled, drop-in0, 이전 조사에서 활성 `/etc/caddy/Caddyfile` 확인. Caddy 설정/인증서/도메인/라우팅을 교체하거나 reload하지 않는다.
- 이전 코드65개 SHA는 일치했고 이번 메타데이터 열거도65개다. `layout.complete=true, issues=[]`는 **열거 성공**이지 추가 코드 승인이나 전체 무결성 성공이 아니다. 추가 항목은 node_modules와 redacted 실행/설정 분류 파일2개이며 모두 UID/GID1000/1000·groupOrWorldWritable다. group/other 어느 쪽인지·실제 mode와 파일 정체는 아직 확정하지 않는다. 삭제/이동/chmod/허용 목록 확대는 하지 않았다.

## 추가 파일과 Node 의존성

검증된 로컬 v017 소스만 읽어 확인했다. 일반 manager/server/store 경로는 Node 내장 모듈과 상대 소스 모듈을 사용한다. `package.json`은 pdfjs-dist 5.6.205를 devDependency로 선언한다. 수동 `scripts/sync-rules.mjs`는 PDFJS_MODULE 또는 bare `pdfjs-dist/legacy/build/pdf.mjs`를 import하므로 release/node_modules가 관여할 수 있다. 자동 collector의 `src/sync-official.js`는 RIFTASSI_PDFJS_PATH 또는 Node 실행파일 기준의 별도 node_modules 경로를 동적으로 import한다. manager는 원래 collector를 기동하므로 의존성이 사용되지 않는다고 단정할 수 없다. 실제 환경값/설치 모듈/lock 내용은 읽지 않았다.

`package-lock.json`으로 확인된다면 일반 Node 실행이 그 파일을 자동 실행하지는 않는다. 그러나 lock 파일의 존재만으로 설치 모듈의 출처/해시/권한/실제 import 경로를 검증한 것은 아니다. 다른 JS/설정 파일이면 autostart/환경 preload/동적 import의 참조 가능성을 별도로 평가해야 한다. group/other 쓰기 가능 상태는 변조 가능성이지 변조의 증거가 아니다. 현재 strict legacy receipt는 두 항목을 계속 거절한다. node_modules를 통째로 v020 패키지에 복사하지 않는다.

정체 확인 후 선택할 최소 해결안은 (a) 실제 사용되는 의존성/실행 설정만 출처·해시·참조 경로별로 검토해 별도 증거를 만드는 안, 또는 (b) 원본을 그대로 두고 검증된65개로 별도 깨끗한 rollback 후보를 준비하는 안이다. (b)는 현재 운영 엔진에 연결됐다고 주장하지 않는다. 실제 DataRoot/환경/collector 의존성과 unit 복귀를 시험하고 승인된 설치·설정 변경이 필요하다. 원본 전체 검증을 65개 부분집합 검사로 바꾸거나 관찰한 파일을 임의 신뢰하지 않는다. 현재 증거만으로 배포/롤백 reference를 승인할 수 없다.

## autostart 관계와 최소 조사

주 서비스 Wants→helper, helper Requires/After/PartOf→주 서비스다. inactive oneshot이어도 주 서비스 start/부팅 시 Wants로 호출될 수 있다. After는 순서이며 앱 health 보장이 아니고, PartOf는 stop/restart 전파 관계다. systemd start/stop과 manager의 `/api/start`·`/api/stop`은 다르다. 실제 ExecStart가 없으므로 API 호출/지연/별도 manager 실행 중 무엇인지 추측하지 않는다.

먼저 **이미 받은 JSON 중 autostart의 commands 필드만** 공유하면 추가 SSH 없이 기존 실행 형태 단서를 검토할 수 있다. 키·원시 argv·Environment·스크립트 본문은 보내지 않는다. 추가 정체가 필요할 경우 `inspect-launch-details.py` 한 파일만 제안한다. 고정 code 디렉터리의 추가 항목 표준명/확장자/mode와 helper 1개 unit의 5개 Exec 명령에 대한 제한된 단서를 출력한다. node_modules·알 수 없는 디렉터리를 탐색하거나 추가 파일/참조 스크립트/키/env/DB 내용을 열지 않는다. 표준명 목록은 **출력용 이름 목록**이며 검증 허용 목록이 아니다. 개인명이 될 수 있는 다른 이름은 redacted를 유지한다. 명령 단어의 순서는 lexical hints일 뿐이며 behaviorVerified=false다. 외부 helper 스크립트가 확인되면 그 한 표적의 비밀값 보호 검토 범위를 별도 승인받아야 한다.

`ONE-LINE-INSPECTION.txt`의 Verify/Inspect는 각각 **독립된 한 물리적 줄**이다. 패키지 최상위 PowerShell5.1에서 원하는 한 줄 전체를 붙인다. 함수 정의/여러 줄 붙여넣기/.ps1 실행/실행 정책 변경이 없다. Verify는 SSH0회다. Inspect는 새 원문·SHA 범위 승인 후에만 실행한다. Python stdin으로 보내므로 서버에 설치/파일 기록/pycache를 만들지 않는다(`-B`). SSH 호스트 검증 유지, raw stderr/잘못된 응답 억제, 결과 파일 저장/자동 재시도 없음. 실제 실행은 사용자가 한다.

운영 중지는 helper 동작 검토와 승인된 충돌 방지·원복안 후에만 한다. 기본 코드는 absent 또는 승인돼 masked된 helper의 inactive/failed·PID0·대기 job 없음·빈 cgroup만 받으며 재확인한다. 단순 disable은 Wants로 인한 실행을 막지 못한다. 임시 mask도 새 서버 쓰기 승인이 필요하고 재부팅/자동복구·종료 후 원복 정책을 포함해야 한다. 지금 mask/disable/stop을 자동 실행하지 않는다. main Type/Restart/Wants가 바뀌거나 main→helper의 Requires/BindsTo가 있거나 미확인이면 차단한다. hard dependency 상태에서 helper를 mask한 뒤 main을 멈추면 재기동까지 막힐 수 있기 때문이다. 이 두 main 필드는 기존 JSON의 해당 관계만 추가 공유하면 된다. systemd Group이 비어 있으면 고정 azureuser의 실제 기본 GID가 pin과 일치할 때만 허용하며 임의 그룹을 추정하지 않는다.

## WAL 포함 자원과 복원 조건

실제 메타데이터: DB3,452,928 + WAL976,472 + SHM32,768 = 4,462,168 bytes. SQLite snapshot 상한 추정은 DB+WAL=4,429,400 bytes로16MiB 제한 이내다. SHM은 조정용이며 복원 자료로 복사하지 않고 자원 예약에만 포함한다. 보수적으로 MemAvailable≥169,915,072 bytes(약162MiB), 추가 disk≥572,568,256 bytes(약546MiB)가 필요하다. 보고된595,943,424 / 59,778,879,488 bytes는 이 조건을 충족하지만 시점 관찰이다. preflight와 writer 종료 후 다시 검사하며 WAL 증가·한도 초과·불명확한 자원값·link 변조는 차단한다.

DB·WAL·SHM 및3키가 일반 파일/단일 link,1000/1000, group/other 읽기·쓰기 없음이고 .env436bytes도 확인됐다. 키 길이32/64/64는 유효 키값·세션 서명·복호화 성공을 입증하지 않는다. 실제 schema와 settings/세 키 대응·암호문 복원은 여전히 미검증이다.

승인된 교체 transaction은 service/helper writer/cgroup·4ports 종료 → SQLite backup API로 committed WAL을 포함한 일관 snapshot → DB·키·설정·.env AES-GCM 봉인 → 독립 child에서 integrity/schema/실제 암호문 복호화/설정 검사 → 새 데이터 루트 복원 → v020 단독 시작·인증/HTTPS 검사 순이다. DB 본체만 복사하지 않고 원본에 checkpoint/restore/migration을 강요하지 않는다. 사전 qualification을 원하면 별도 중단/데이터 승인으로 v017에 복귀시키며, 실제 replace에도 같은 검사가 있으므로 필수 두 번 중단은 요구하지 않는다.

원본 v017 코드/DB·키·기록은 유지한다. 실패 시 사전 승인된 transaction 내 구 설정 복귀, 정상 후 별도 승인 rollback, 신규 v020 기록·키·백업 보존 및 비용 대조 전 AI 일시 중지는 기존 절차를 유지한다. 역 migration/구 DB 덮기/신규 기록 자동 병합은 없다. 불명확한 응답은 inspect/status/reconcile부터 관찰하며 쓰기를 재전송하거나 lock을 삭제하지 않는다.

## 남은 최소 승인과 출시

1. 추가 읽기: 위 source/metadata만. 기존 sanitized commands 공유로 대체 가능한 부분은 재조회하지 않는다.
2. source reference/의존성·helper 실행/부팅·원복 확정, 실제 unit/Caddy/구성 pin, 승인 규칙 후보·운영자 개인정보 항목 확정. 규칙 전용 최소 모드 유지, 미승인 카드/이미지/번역 공개·AI 전송 없음.
3. 코드 설치: exact 최종 commit/131개 이상 code-only checksum·새 UUID/profile·새 root/vault 준비 승인. 현재 검토용 ready=false site를 나중에 rebind하지 않는다. 상시 broker/새 포트/별도 VM은 필수가 아니다.
4. 운영 데이터/복원: DB·WAL snapshot·3키/.env·설정 처리, 서버 내 암호화 보관/독립 restore·복구키/보관·RPO/RTO 및 중단 범위 승인.
5. ready 변경/최종 교체: 검증된 최종 package·규칙 권한/개인정보·실제 검사·실패 복귀 범위를 명시해 별도 승인. 이후 새로운 복구 변경/정상 후 rollback도 별도 승인.

Control Center 고급 자동화/새 프레임워크는 추가하지 않았다. CI/합성 성공을 실제 운영 복원 성공이나 배포 승인으로 바꾸지 않는다.

## 이번 로컬 검증

Node250 + v017/v020 호환6 + 변경 없는 v017 회귀11 + 실제 Chromium PC/모바일/PWA17 + 기존 배포lab29 + C#284 + Python37 = **634/634** 통과. 추가6개 Node 검사는 WAL 예산/invalid 자원/sidecar hardlink/실제 WAL-only 제보의 봉인 복원/주 서비스 shape/기본 GID pin을 다룬다. 추가6개 Python 검사는 표준 lock 이름과 알 수 없는 이름 분리, 비밀 argv 억제, unit1개 고정 조회, 오류 시 승인 금지, 실제 POSIX directory descriptor로 extra 내용/자식 미조회다. WPF 교차 빌드는 오류/경고0이며 Linux에서 GUI 실행을 주장하지 않는다. 한 줄 Verify/모의 Inspect/변조 hash의 SSH 전 차단은 Windows PowerShell5.1 CI에 추가했고, 실제 Azure 실행은 하지 않는다. 최종 exact commit의 Windows·Ubuntu systemd·패키지 결과는 Actions에서 별도로 확인한다.
