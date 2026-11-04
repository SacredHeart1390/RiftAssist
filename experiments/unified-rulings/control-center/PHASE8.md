# Control Center 8차 — 배포·백업·롤백 검증과 Codex 프로세스 관리

2026-11-04 Asia/Seoul. v0.2.0 / feature/riot-api-v0.2 / 기존 Draft PR #1. 새 release/develop 브랜치를 만들거나 운영 버전을 전환하지 않는다.

## 실제 구현과 운영 경계

네이티브 WPF 배포·롤백 탭, GitHub 개발 커밋/CI 선택, 코드 패키지/해시 검증, 독립 릴리스·SQLite/키·암호화 백업, 복원 검사, 모의 서비스 HTTP 검증, 라우팅 CAS, 이력·중복 방지·미확정 재조회를 구현했다. **이번 빌드가 Azure 원터치 배포를 실제로 실행할 수 있다는 뜻은 아니다.** 대상은 앱이 만든 합성 로컬 환경으로 고정한다. 승인 객체나 숨은 설정을 넣어도 production target은 전송 전에 거절한다.

실제 Node 프로세스·파일·SQLite 온라인 백업/AES-GCM·복원 probe·HTTP 검사를 실행한다. systemd/Caddy 서비스는 모의이며 HTTP AI 응답도 mock이다. 선택 코드의 무결성은 확인하지만 lab HTTP 서버는 선택한 RiftAssist 서버 코드 자체를 실행하는 서버가 아니다. GitHub CI 증거와 기존 앱 회귀를 별도로 확인한다. 실제 Ubuntu systemd/Caddy 통합·실제 선택 앱 기동 검증은 운영 활성화 전 staging 후속이다. 합성 검증 성공을 라이브 배포·공식 AI 판정 정확성 검증으로 표시하지 않는다.

`deployment/ubuntu-contract.cjs`는 별도 서버 브로커의 제한된 명령/입출력 경계를 준비한 계약이다. 합성 inventory와 모의 IO로 후보 systemd unit·Caddy include CAS/검증/reload를 검사한다. 실행 가능한 Azure SSH 쓰기 전송·서버 브로커 설치/상용 활성화는 제공하지 않는다. 실제 unit/경로/권한을 모르는 상태에서 범용 SSH나 임의 shell 실행 기능을 추가하지 않았다.

## 확인한 운영 구조

| 근거 | 확인한 내용 | 추가 확인 |
| --- | --- | --- |
| 사용자 실기기 확인 | Ubuntu24.04, Caddy HTTPS, SQLite, live v017, riftassist.service active, 기존 관리자 조회 성공 | 이번 개발자가 Azure에서 재확인하지 않음 |
| v017 src/paths.js | APP_ROOT는 해당 release, DATA_ROOT는 RIFTASSI_DATA_ROOT 또는 unified-rulings 루트 | VM의 실제 환경·데이터 경로 미확인 |
| v017 src/manager.js | loopback 관리자3100, 인증/세션, app-host 소유 gateway/worker | 실제 systemd가 manager인지 직접 server인지 미확인 |
| v017 src/app-host.js | gateway3001, worker3011/3012 기본값, manager가 선택한 release의 server.js fork·drain | 실제 포트·MainPID·자식/별도 프로세스 소유관계 미확인 |
| v017 manager 시작 | source monitor 복구/자동 생성, hosting 설정에 따른 tunnel 등 부수효과 | 운영 manager를 새로 띄우는 것은 중복·외부 수집/포트 충돌 위험 |
| v017 operations-store.makeBackup | SQLite backup + storage.key 복사, 먼저 purge 실행 | 읽기 전용 백업 API가 아님. 이번 운영 백업에 호출하지 않음 |
| 저장소/기존 문서 | 운영 unit 파일·ExecStart·Caddy 원본/인증서 저장 경로 없음 | 추정으로 운영 제어하지 않음 |

`/api/start`·`stop`·`app-release`는 manager의 자식 앱 제어이며 `systemctl start/stop/restart`와 다르다. 기존 `riftassist.service`를 변경하거나 v017 manager/API를 우회하지 않는다. 기존 자동 SSH 인증/관리자 읽기는 유지하지만 새 배포 탭이 SSH를 자동 실행하지 않는다.

## Windows 사용

새 ZIP 전체를 새 폴더에 풀고 최상위 EXE를 실행한다. 기존 LocalAppData SSH/제보/작업 이력을 지우지 않는다. ‘배포·롤백’ 탭에서:

1. **새 합성 배포 환경**을 승인해 독립된 합성 v017 기준 DB·키를 만든다. 운영 자료는 가져오지 않는다. 기존 lab은 목록에서 다시 선택할 수 있다.
2. **번들 코드로 합성 연습** 또는 **GitHub 개발 브랜치·CI 조회 → 커밋 선택 → 패키지 준비**를 사용한다. GitHub 조회는 7차에서 저장한 gh.exe/OS 인증을 재사용한다. 설치·로그인·권한 부여는 자동 실행하지 않는다.
3. 브랜치는 8차 범위의 feature/riot-api-v0.2로 제한한다. 최근10개 커밋 중 정확한 head SHA/branch에 대해 Control Center·규칙 workflow가 success인 후보를 확인한다. 실제 GitHub는 사용자 동작 때만 조회한다. 개발자의 자동 테스트는 모의 GH 응답이다.
4. **배포 전 점검·계획**은 lab ID·기준 route generation·이전/새 버전·커밋·패키지 해시·장애 시나리오를 고정한다. 아직 서비스/라우팅 변경은 없다.
5. **선택 버전 배포(합성)**에서 영향 범위·백업/복원 검사와 전환 대상을 확인하고 예/아니요로 승인한다. 진행 상태와 결과를 확인한다. 조회·새로고침은 확인창이 없다.
6. 이력에서 배포를 선택하고 **이전 버전으로 롤백(합성)**을 별도 승인한다. 백업 확인·이전 코드/데이터 검증 후 routing만 되돌린다. DB를 복원본으로 덮지 않는다.
7. 취소·앱 종료·응답 유실 뒤에는 **중단·미확정 재조회**를 사용한다. 실패한 쓰기를 자동 재전송하지 않는다. 다른 살아 있는 프로세스의 잠금은 건드리지 않는다.

GitHub CI 통과는 배포 허가가 아니다. 번들 선택은 synthetic 증거로 표시하고 운영 승인을 의미하지 않는다. package는 ready=false/development-only이고 현재 라이브를 대체할 수 없다. CI 테스트가 mock provider를 사용하는 한 실제 OpenAI/공식 Riot API의 동작도 증명하지 않는다.

## 배포 엔진과 파일 경계

`%LOCALAPPDATA%/RiftAssist/ControlCenter/DeploymentLabs/<GUID>/`에만 합성 대상이 있다. Windows 사용자 ACL을 적용하고 Unix 테스트는0700/0600을 사용한다. 루트/파일 링크·경로 역참조·잘못된 owner marker를 거절한다.

- `releases/stable`: 실제 운영 파일이 아닌 합성 v017 기준 자료. `releases/candidate-<GUID>`: 선택 코드·독립 DB/레코드 키. 기존 폴더/포트/키를 공유하지 않는다.
- `backups`: 일관된 SQLite 온라인 backup을 AES-256-GCM sealed envelope로 보관한다. 해당 DB를 읽는 레코드 키와 release metadata도 envelope 안에 포함한다. vault wrapping key는 **별도 private 폴더**에 두고 백업 파일에 포함하지 않는다.
- `operations`: 유한 상태/해시·버전·백업ID·원인 코드만 저장한다. 질문/제보 본문·키·쿠키·stderr를 기록하지 않는다.
- `route.json`: generation 기반 CAS·임시 파일 rename으로 앱 경로를 선택한다. 이것은 **모의 Caddy routing**이며 실제 Caddy 설정/인증서를 바꾸지 않는다.

패키지는 검증된 backend 파일 목록 또는 GitHub blob의 코드 허용 목록만 사용한다. 전체 clone/history·운영 DB·private·knowledge-releases·캐시를 포함하지 않는다. 번들 루트에 추가된 임의 파일은 읽어 패키지에 넣지 않는다. 코드 파일별 해시·package digest·테스트 commit을 확인한다. 개발용 source packet이 백업 packet으로 변하는 경로는 없다.

순서: 기준/패키지 검증·최소64MiB 및 크기 배수 디스크 reserve → 기준 DB backup → 암호화·별도 restore probe → 새 코드 전송/해시 → 새 독립 DB/키 → 별도 loopback 모의 서비스/인증 admin·HTTP/mock AI/데이터 → backup 재검사 → 승인된 route CAS → 사후 health. 모의 HTTP 포트는 OS가 할당하며 3100/기존 기본 포트를 피한다. 서비스는 작업 중에만 돌고 종료하므로 상시 실제 daemon 상태로 표시하지 않는다.

일반 전환 후 실패는 소유한 route generation이 그대로일 때 이전 경로로 복귀한다. 복귀 실패는 recovery-required이며 실제 관찰 route를 표시한다. response-loss는 uncertain으로 남기고 ‘성공’으로 추정하지 않는다. 같은 operation ID는 기존 결과를 반환하고 백업/전환을 재실행하지 않는다. 계획·owner·package·route가 달라지면 거절한다. 새 계획에 대한 명시적 승인만 새 작업을 만든다.

## 백업·복원·롤백

원본 DB/WAL 파일을 단순 복사하지 않고 SQLite online backup을 사용한다. sealed hash/tag와 DB integrity_check, 레코드 키로 복호화 가능 여부를 **독립 임시 restore probe**에서 확인한다. WAL 미checkpoint 자료도 복원하여 검사한다. probe와 plain snapshot은 소유한 임시 파일만 정리한다. 강제 종료 시 남은 scratch는 private lab에 남을 수 있으며 자동 운영 복원에 쓰지 않는다.

기본 롤백은 이전 코드/라우팅 복귀다. 이전 버전의 DB·키를 그대로 사용하고 새 버전 DB·키·전환 이후 제보는 보존한다. 새 DB가 손상되어도 이력을 볼 수 있고 이전 DB가 정상이라면 라우팅 복귀를 검증한다. 역방향 migration·데이터 병합·제보 이관·운영 DB restore 명령을 제공하지 않는다. 새 버전 기록은 나중에 별도 승인된 읽기/이관 절차로 다뤄야 한다.

현재 lab vault key는 합성 전용 파일이며 사용자 ACL/0700으로 제한한다. 실제 서버 활성화 전 wrapping key의 OS secret store/보호된 별도 볼륨·접근 권한·오프호스트 암호화 백업·복구키 분리/회전/보존 주기를 정해야 한다. DPAPI/파일 ACL은 같은 사용자/관리자 탈취를 완전히 방어하지 않는다. **실제 사용자 기록/키/DB 백업을 GitHub Actions artifact·PR·로그·Codex에 올리지 않는다.** 이 패키지/CI에는 합성 fixture와 코드만 있다.

## 운영 활성화에 필요한 추가 조건

이번 빌드에는 클릭으로 여는 운영 활성화 스위치가 없다. 다음 조건과 **별도 사용자 승인** 후 서버 설치/실제 어댑터·staging 검증을 수행해야 한다.

1. 제한된 읽기 조사 승인 후 실제 unit ExecStart·WorkingDirectory·User·MainPID/자식·포트 소유·DataRoot를 확인한다. 환경변수/키 값·질문은 출력하지 않는다. 기존 manager/app가 독립인지 정리하고 이중 실행을 금지한다.
2. 실제 Caddy site/import 구성·관리 endpoint·바이너리/서비스·인증서 유지 정책을 확인한다. 기존 domain/TLS 설정과 인증서 저장소는 보존한다. 검증한 include만 CAS 전환하고 사전 전체 config 검사, 실패 시 원 include/reload·사후 HTTPS 점검을 검증한다. 템플릿 경로를 실제 경로로 간주하지 않는다.
3. 신규 릴리스용 전용 unit/계정·manager/app/worker 별도 loopback 포트·디렉터리·권한을 예약한다. 관리자3100을 공개하지 않고 버전별 관리자/세션/저장 키·DB를 분리한다. 기존 legacy service는 롤백 대상으로 유지한다.
4. 제한된 서버 브로커와 SSH 고정 stdin 프로토콜 설치/인증/최소 sudo 권한·site receipt·감사/락·정확한 승인 범위를 별도 검토한다. 현재 Ubuntu contract의 IO는 모의이며 실제 원격 쓰기 연결은 미구현이다.
5. 실제 선택 앱이 새 unit에서 시작되는지, manager 인증·AI mock/금액 승인 범위·DB schema/암호화·권한 확인 카드만 로딩·요청 drain·web/PWA 캐시·부하·새 제보 보존·반복 실패/중단을 staging에서 검증한다. 외부 AI 실제 유료 health 호출은 별도 승인 없이는 하지 않는다.
6. 암호화된 실제 백업/복구키 보관·복원훈련·RPO/RTO·전환/복귀 기준과 새 버전 기록 접근 절차를 확정한다. 구버전에 새 DB를 덮지 않는다. 개발 코드/CI 통과·Riot 승인만으로 배포를 자동 승인하지 않는다.

## 7차 Codex 보강

Windows native 도구 실행에 **Kill-on-close Job Object**를 적용한다. stdin을 보내기 전에 도구를 소유 Job에 할당하고 현재 사용자 DPAPI receipt에 owner PID/start time, root process 정보, 바이너리·작업 경로 hash만 저장한다. prompt·키·인증·실제 경로 문자열은 receipt에 넣지 않는다. 종료/취소·소유 앱 crash로 마지막 Job handle이 닫히면 소속 프로세스가 종료된다. 보호/receipt를 만들지 못하면 자식을 중단하고 실행을 막는다. 실제 작업 명령은 stdin 이후 시작되는 CLI 계약을 사용한다. 도구 bootstrap 전반의 모든 OS 취약점을 증명한 것은 아니다.

‘실행/잔존 프로세스 조회’는 확인 없이 읽고, ‘소유한 잔존 작업 정리’는 예/아니요로 승인한다. 살아 있는 다른 Control Center owner는 보존한다. 이전 owner가 종료된 **정확한 named Job**만 종료할 수 있고 프로세스 이름/임의 PID로 찾아 죽이지 않는다. 종료된 Job의 암호화된 receipt는 정리할 수 있다. 원래 수정/게시 작업의 미확정 상태는 기존 이력에서 다시 조회하며 자동 재개/추론/중복 게시하지 않는다.

Windows 자동 테스트는 모의 Codex/GitHub와 실제 합성 Node 부모/자식 트리를 쓴다. 부모만 강제 종료하여 Job의 하위 프로세스 종료와 receipt 재조회를 검사한다. 실제 Codex 추론/GitHub 오류 수정 PR 게시를 테스트했다고 주장하지 않는다.

회사 Windows10 실기기에서는 7차 PHASE7.md 절차에 더해: 합성 제보/전송 거절 → 도구·ChatGPT/gh 인증 → elevated sandbox 확인 → 별도 승인한 실제 CLI 작업 → 정상 취소/시간초과 → 작업 관리자에서 Control Center만 종료 → 재시작/잔존 소유 Job 조회·정리 → 미확정 작업 재조회 → 실제 diff/재현·회귀 확인 → 별도 승인한 Draft PR 생성/재조회·중복 방지를 검증한다. 관리자키/개인 제보/운영 DB를 테스트에 넣지 않는다. CLI/계정/회사 정책에 따른 격리 실패 시 보호를 끄지 말고 프롬프트 복사를 사용한다.

## 다음 버전 분리·출시 준비

이번 8차의 모든 코드는 기존 feature에만 반영한다. 사용자가 8차 검증 결과를 확인하고 별도로 승인한 뒤에만 `release/v0.2.0`(출시 준비), `develop/v0.3.0`(다음 개발)을 만든다. v020은 기존 저장 형식/검색·판정·제보·관리 호환성과 법적/운영 요건을 점검한다. Riot 미승인 상태에서 기존 카드 DB를 복사해 공개하거나 미확인 리프트나루 자료를 공식 자료로 취급하지 않는다. 권한이 확인된 데이터만 별도 후보·검토·승인을 거쳐 공개한다.

v030 개발 시작 →1차 완료 v031 →2차 v032 →이후 v03n으로 올리는 정책을 다음 브랜치에 적용한다. 이번 assembly/release는 계속0.2.0/ready=false다. v03n의 공식 Riot API·v1.0.0 목표는 실제 API 승인/권한·endpoint/언어/버전 매핑·번역/정오표 정확성·운영 시험과 별개 승인 후 연결한다. main 병합과 Azure 배포는 이번에 하지 않는다.
