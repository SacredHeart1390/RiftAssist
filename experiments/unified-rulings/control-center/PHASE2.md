# RiftAssist Control Center 2차 — 관리자 기능과 SSH 상태 조회

2026-10-29 · v0.2.0 · `feature/riot-api-v0.2` · 기존 Draft PR #1 유지

네이티브 WPF에 대시보드·서버 관리·AI 운영·질문/제보·카드 관리·시스템 로그·설정 7개 운영 탭을 추가했다. 기존 카드 비교·승인/거절/보류·최종 활성화/롤백·감사는 그대로 유지한다. 브라우저나 WebView를 사용하지 않는다.

**실제 Azure 서버 접속/제어/배포는 이번 개발에서 실행하지 않는다.** 운영 서버의 주소·계정·키·systemd unit 구성·실제 포트는 확인하지 않았다. 아래 조사는 저장소의 실제 운영 코드 `releases/v0.1.7`을 읽은 결과이며 Azure 배포 상태를 확인한 결과가 아니다.

## v0.1.7 기능·인증 조사

근거: [manager.js](../releases/v0.1.7/src/manager.js), [app-host.js](../releases/v0.1.7/src/app-host.js), [operations-store.js](../releases/v0.1.7/src/operations-store.js), [관리 UI](../releases/v0.1.7/manager-ui/manager.js), [관리 실행기](../releases/v0.1.7/scripts/open-manager.ps1).

관리자는 기본 `127.0.0.1:3100`, 앱 gateway는 3001, worker는 3011/3012다. manager가 선택한 릴리스의 자식 worker를 준비하고 gateway를 전환하며 기존 요청을 배출한다. 이는 systemd의 `riftassist.service` 전체 제어와 다르다. 실제 Azure unit의 ExecStart/실행 경로/환경변수는 별도 승인 후 읽기 전용으로 확인해야 한다.

관리 API는 loopback 주소·Host 허용 목록·forwarded 헤더 거절·교차 사이트 거절을 적용한다. POST는 일치하는 Origin과 JSON이 필요하다. `/api/login`의 키는 `private/manager.key`의 64자리 임의 키와 상수 시간 비교한다. 성공하면 메모리 세션과 HttpOnly/SameSite=Strict `rift_admin` 쿠키를 발급하며 기본 8시간 유효하다. API는 그 세션을 확인한다. 관리 실행기는 키를 로컬 fragment로 전달하는 웹 방식이지만 Control Center는 이 실행기/브라우저를 사용하지 않는다.

운영 store는 SQLite와 별도 저장 키를 사용하고 질문/답변/진단·제보/이력 등을 AES-256-GCM으로 저장한다. **백업 API는 DB와 복호화 키를 함께 복사한다.** 코드만 확인했으며 실제 운영 DB·키·기록은 열지 않았다.

| 기존 기능 | 코드상 API/구현 | 이번 WPF 통합 범위 |
| --- | --- | --- |
| 로그인/세션 | POST `/api/login`, 관리자 키·쿠키 | 합성 개발 manager에서 기존 인증 재사용. 운영 로그인 미연결 |
| 상태/최근 오류·터널·AI 요약 | GET `/api/status` | 개발 실제 API 상태 + 명시된 합성 CPU/RAM/디스크/가동시간. Azure는 별도 SSH 조회 |
| 서버 켜기/끄기 | POST `/api/start`, `/api/stop` | 격리 개발 앱만 제어 |
| 서버 재시작 | 원래 독립 API 없음 | 개발 stop→start 조합. 원자적이지 않으며 중간 실패 시 수동 확인 |
| 앱 열기/공개 URL 복사 | UI의 링크/클립보드 | 네이티브 관리자에서 자동 브라우저 열기/공개 URL 복사는 미구현 |
| 운영 요약/경고·새로고침 | 상태/자료/제보의 클라이언트 집계, 자동 주기 조회 | 수동 상태/결과 표시. 기존 경고 규칙 전체·자동 polling·요약 JSON 내보내기 미구현 |
| AI 사용량 | status.stats.calls, 시도/입출력 토큰/입력 사용량 미확인 수, 한국 날짜 | 합성 개발 집계 표시. 실제 요금/과금 API 미연결 |
| AI 허용/중지 | POST `/api/ai` | 개발 설정만 변경. 진행 중 호출 종료 명령 아님 |
| 호출 한도 8개 | POST `/api/limits` | 개발 편집/저장. 동시 1–3, 나머지 1–1,000 |
| 제보 목록/검색 | GET `/api/reports`, 상태·분류·ID 필터 | 합성 목록과 현재 목록 문자열 검색 |
| 제보 상세·연결 질문/답변·진단·이력 | GET `/api/reports/:id` | 합성 상세를 네이티브 읽기 전용 JSON으로 표시. 기존 웹의 상세 접이식 레이아웃 전체는 미이식 |
| 상태/분석 메모 | POST `/api/reports/:id`, 상태 8종 | 개발 상태/한글 메모 저장. 취소 시 메모 유지 |
| 제보 내보내기 | 기존 JSON 및 읽기 쉬운 TXT | 합성 JSON 저장 지원. TXT 서식 내보내기는 미구현 |
| 독립 질문 목록 | 관리 API 없음. 제보에 연결한 snapshot만 조회 | 새 운영 DB 접근 경로를 만들지 않음 |
| 공개 hosting | POST `/api/hosting`, none/cloudflare/ngrok/external | 개발 none만 허용. 외부 터널·운영 hosting 변경 차단 |
| DB 백업 | POST `/api/backup`, DB+storage.key | 개발 폴더 내부 백업만 지원. 사유·체크·`개발 백업` 확인. 실제 백업 미연결 |
| 자료 목록/상태 | GET `/api/knowledge` | 개발 목록/활성 자료 조회 |
| 자료 재수집 | POST `/api/knowledge/discover` | v0.2.0의 기존 거절 정책 유지. 버튼도 차단 확인용이며 접수/성공으로 표시하지 않음 |
| 자료 활성화 | POST `/api/knowledge/activate` | 개발 API만 호출. 기존 카드 검토·승인 우회 방지 유지 |
| 앱 버전 목록·적용/복귀 | GET `/api/app-releases`, POST `/api/app-release` | 준비된 합성 v0.2.0/데모 worker만 적용/복귀. 운영 업데이트 미연결 |
| 로그 | 상태 오류 + root/tmp 로그 파일. 범용 로그 조회 API 없음 | 별도 개발 작업 journal과 현재 실행의 상태 결과만 표시. 운영 파일/journal은 읽지 않음 |
| SSH/CPU/RAM/디스크/가동시간/systemd/HTTPS | 기존 관리자 API에 없음 | 고정 읽기 전용 SSH 구조 추가, 실제 접속 미검증 |

## 개발 관리자 실행

전체 Windows 개발 패키지에서 `RiftAssist.ControlCenter.exe`를 실행한다. **서버·운영 → 대시보드 → 합성 개발 관리자 → 새 개발 관리자 준비/연결**을 누른다. 시작 시 자동으로 Node 관리자나 SSH를 실행하지 않는다.

- 카드 검토: `%LOCALAPPDATA%\RiftAssist\ControlCenter\Sandboxes\<GUID>`.
- 개발 관리자: `%LOCALAPPDATA%\RiftAssist\ControlCenter\OperationsSandboxes\<GUID>`.
- SSH 설정 메타데이터: `%LOCALAPPDATA%\RiftAssist\ControlCenter\Settings\ssh.local.json`.

기존 `SandboxCatalog`로 새 빈 GUID 환경을 만들고, 고정 규칙 fixture·합성 카드·새 개발 키/DB를 준비한다. 합성 제보 1건과 연결 질문/답변, 합성 호출 집계, 두 준비된 개발 worker만 만든다. 실제 카드/제보·DB·운영 키를 복사하지 않는다. 재접속은 저장한 개발 상태를 사용하며 앱을 자동 시작하지 않는다.

같은 개발 루트에는 manager.lock을 배타적으로 생성해 관리자 한 개만 실행한다. 두 번째 연결은 DB를 열기 전에 거절한다. 정상 종료는 자신이 만든 잠금만 해제한다. 강제 종료 뒤 잠금이 남으면 자동 탈취/삭제하거나 기록된 PID를 종료하지 않는다. 해당 개발 프로세스·저널을 확인한 뒤 별도 복구가 필요하며 새 합성 환경을 만들더라도 기존 자료는 보존한다.

`control-center-operations.cjs`는 서명된 전용 자식 프로세스 파이프를 받는다. 기존 HMAC/세션/nonce/시각/요청 ID 검증을 재사용하고 `operations:read`/`operations:write`를 카드 권한과 분리한다. 카드 권한으로 관리 요청을 보낼 수 없고 operations 권한으로 카드 승인·활성화를 할 수 없다.

개발 manager는 임의 loopback 포트를 사용한다. 새로운 worker 포트 설정은 development+소유 마커+서로 다른 포트 검증을 **store를 열기 전에** 통과해야 한다. Node bridge가 새 개발 manager.key를 메모리로 읽어 기존 `/api/login`을 호출하고 쿠키를 내부에 보관한다. C#이나 stdout에 키/쿠키를 보내지 않고 키를 인수/환경/설정 JSON에 넣지 않는다. 기존 관리자 인증을 제거하거나 운영 3100으로 우회하지 않는다.

변경은 사유·확인을 요구한다. 요청 ID별 개발 journal에 시작/결과를 남기고 같은 ID를 재사용할 수 없다. 불명확한 쓰기는 자동 재시도하지 않는다. `started`/`uncertain`이 남으면 추가 쓰기를 차단하며 읽기 전용 상태/기록을 확인해야 한다. 이 MVP에는 해당 운영 결과를 자동 복구·재실행하는 도구가 없다. 합성 환경을 새로 준비할 수 있지만 기존 데이터/감사 파일을 임의로 지우지 않는다. 종료 시 앱이 소유한 Node 프로세스 트리만 정리하고 데이터는 보존한다.

백업은 **해당 합성 관리자 폴더 내부**의 private/backups에만 저장되며 개발 복호화 키를 포함한다. 외부 반출/Git 포함 금지 경고와 별도 확인 문구를 적용했다. 운영 백업/복원은 구현하지 않았다. 개발 감사 사유는 평문 JSON이므로 키·개인정보를 입력하지 않는다. journal 2,000개를 넘으면 점검을 요구한다. 디스크 장애/fsync·회전·서명/WORM·같은 사용자의 파일 변조 방어는 운영 수준으로 검증하지 않았다.

## Azure 읽기 전용 연결 구조와 후속 설정

이번 개발/CI에서는 실제 SSH를 실행하지 않는다. 먼저 별도의 실제 접속 승인을 받은 뒤 운영자가 Windows에서 다음을 준비해야 한다.

1. Windows 10 22H2 x64의 OpenSSH Client와 기존 Windows 인증 방식을 준비한다. 암호화된 개인키는 필요하면 운영자가 Windows ssh-agent에서 먼저 잠금 해제한다. 앱은 암호/키 내용을 받거나 저장하지 않는다. 개인키 파일의 ACL도 OpenSSH 기준을 충족해야 한다.
2. 실제 서버 DNS/IP·SSH 사용자/포트, 선택적 개인키 경로와 검증한 known_hosts 파일, 실제 HTTPS origin을 설정 탭에 입력한다. **키 내용이 아니라 경로만** 일반 로컬 JSON에 저장한다. 설정 저장으로 연결하지 않는다. 실제 주소·사용자·키 경로를 이 문서에 가정해 넣지 않았다.
3. 호스트 key fingerprint를 신뢰한 별도 경로로 확인하여 known_hosts를 운영자가 준비한다. 앱은 자동 keyscan/등록/갱신을 하지 않는다. 미등록/변경 키는 연결 실패다. `StrictHostKeyChecking=yes`, `UpdateHostKeys=no`, BatchMode를 고정한다.
4. 앱은 `%SystemRoot%\System32\OpenSSH\ssh.exe`만 실행한다. `-F NUL`로 사용자 SSH config의 ProxyCommand/LocalCommand/추가 포워딩을 상속하지 않는다. config의 별칭/ProxyJump/추가 인증 설정은 지원하지 않는다. Windows 기본 agent/기본 identity 또는 지정 identity와 지정 known_hosts만 사용한다. agent/프록시/실제 네트워크 조합은 별도 실제 연결 검증이 필요하다.
5. Azure 모드에서 별도 승인 체크와 정확한 `읽기 전용 조회` 문구·사유·위험 확인을 거쳐 **한 번만** 조회한다. 승인 체크/연결 허용은 JSON에 저장하지 않는다. 설정을 바꾸면 다시 확인해야 한다. 자동 polling·자동 재접속·운영 제어 활성화 플래그는 없다.

고정 명령은 `/proc/stat`의 짧은 CPU 샘플, `/proc/meminfo`의 Total/Available, 루트 `df -Pk`, `/proc/uptime`, `systemctl show riftassist.service --property=ActiveState --value`, 앱 기본 `http://127.0.0.1:3001/api/health` 및 설정 HTTPS origin의 `/api/health` 응답 코드만 읽는다. 응답 body는 버리고 curl의 인증서 검증을 유지하며 리다이렉트를 따라가지 않는다. sudo·journal/파일 로그·DB·사용자 기록·환경변수·키 읽기·업데이트·서비스 변경 명령은 없다. 3100 포트 공개나 SSH 터널도 없다.

`sh`, procfs, awk, head, df, systemctl, curl의 존재·권한과 **실제 unit명/앱 포트/health 경로**는 아직 확인하지 않았다. 기본 3001과 요청한 unit명이 실제 서버와 다르면 승인 후 고정 명령 계약을 별도 검토해야 한다. HTTPS 상태는 서버에서 수행한 GET 결과이며 외부 사용자 PC/모바일의 도달성을 증명하지 않는다. CPU는 순간 샘플이고 HTTP `000`은 응답 미확인이다. SSH 인증/GET은 서버 측 접속·접근 로그를 남길 수 있으므로 실제 시험도 승인 후에만 한다.

접속은 1회 시도, 전체 25초 제한, 응답 크기 제한과 취소를 적용한다. 실패 시 raw SSH stderr를 표시/저장하지 않고 호스트 키·인증·시간초과·연결 끊김 코드만 전달한다. 같은 대상의 마지막 정상값은 ‘이전 값’으로 표시하며 다른 프로필의 값은 재사용하지 않는다. 설정·모드를 바꾸면 승인/상태를 초기화한다. SSH 인수에는 호스트/사용자/파일 경로만 포함되고 키 내용·관리자 토큰은 들어가지 않는다.

**서버 시작/중지/재시작·AI/한도·실제 제보/로그·백업·배포는 Azure에서 실행할 수 없다.** 향후 운영 통합은 별도 서버 신원/역할, 최소 권한 command broker, TLS/기기 신뢰, 기존 관리자 인증을 보존하는 전송, 사유/감사·승인 분리·백업/롤백 설계가 필요하다. 키 존재나 SSH 조회 승인만으로 이 경계를 해제하지 않는다.

## 검증과 배포

SSH 성공/인증 실패/호스트 키 변경·미검증/끊김/시간초과/취소는 **주입한 모의 runner**로 검사한다. C# 검사는 기존 30개와 2차 33개로 63개이며 기존 Node 관리자 API를 임시 합성 폴더에서 실제 호출하는 테스트도 포함한다. Native WPF smoke는 기존 카드 비교와 운영 7개 탭·Azure 제어 비활성 상태를 검사한다. 실제 Azure 접속, 실제 Windows 10 PC, 실제 OpenSSH 인증 성공을 검증한 결과로 주장하지 않는다.

최종 Node/웹/legacy/C# 결과와 Windows runner 결과는 [2차 구현 보고서](../artifacts/control-center-phase2-2026-10-29/README.md), 최신 Windows 실행 패키지는 [기존 PR #1](https://github.com/SacredHeart1390/RiftAssist/pull/1)의 Control Center validation 아티팩트를 확인한다. 전체 압축을 풀고 exe를 실행한다. main 병합·Azure 서버 변경/재시작·운영 배포·실제 Riot/OpenAI 호출은 금지하며 `ready=false`를 유지한다. 문서는 저장소의 일반 Markdown으로 제공하고 별도 문서 압축 묶음을 만들지 않는다.
