# v0.2.0 라이브 출시 준비 2단계 — 제한된 Ubuntu staging

2026-11-05 Asia/Seoul · **release/v0.2.0만 변경**. develop/v0.3.0, feature/riot-api-v0.2, Draft PR #1의 head/base, 라이브 v017은 보존한다.

이 코드는 실제 SSH·systemd·Caddy 어댑터를 포함하지만 Azure에는 설치/접속하지 않았다. 브로커는 `isolated-staging`만 허용하고 production 대상은 없다. 기존 WPF 배포 화면은 합성 전용을 유지하며 실제 staging 연결을 자동 활성화하지 않는다. 소스와 후보 worker의 v020 manifest는 **ready=false 그대로**다. 이 문서는 운영 배포 승인서가 아니다.

## 구현과 실행 경계

| 부분 | 실제 구현 | 이번 검증/경계 |
|---|---|---|
| Windows SSH | `SshStagingClient`, 기존 OpenSSH의 strict host key·agent·프로세스 IO 재사용 | 기본 비활성, 확인한 설치/site/inventory/profile/만료에 바인딩. 쓰기는 별도 exact 요청 승인. 모의 SSH endpoint와 loopback 검증. Azure 접속 없음 |
| 고정 endpoint | `/usr/bin/sudo -n -- /usr/local/libexec/riftassist-stage-broker` | 원격 임의 shell/file/systemctl API 없음. 요청은 UTF-8 JSON stdin. 키·쿠키를 argv/env/로그에 넣지 않음 |
| 서버 | `staging/serve.cjs`·`broker.cjs` | Linux/root-owned 고정 `/etc/riftassist-staging/inventory.json`, 검토된 새 UUID site와 commit/package digest만 수용. 서버 설치/사용 승인 전 template는 거절 |
| 코드/데이터 | schema1 카드 호환성을 유지하는 실제 v020 manager→gateway→worker | 새 Root/data/a,b·private DB/키·knowledge pointer·reserved ports. 운영 자료 import/복사 기능 없음. 초기 카드는 빈 합성 catalog/권한 제한 |
| 서비스 | `SystemdController`의 고정 unit start/stop/reload/show 및 격리 unit 템플릿 | `riftassist-stage-<site UUID>-a/b/proxy.service`만. 기존 riftassist.service/caddy.service 제어 안 함. 앱 API start/stop과 systemd는 구분 |
| 라우팅 | 별도 Caddy config/include 사전 검증·hash CAS·reload/실패 복귀 | loopback high port HTTPS·새 내부 CA. 운영 domain/443/import/인증서 저장소는 만지지 않음. TLS 검증을 끄지 않고 시험 CA만 사용 |
| 백업 | SQLite online backup, AES-256-GCM, 별도 private wrapping key | requests/reports/history 암호문 및 storage.key/sessions.key/manager.key 등을 포함해 독립 프로세스 restore probe. 원본에 restore하지 않음 |
| 이력/중단 | 승인 계획 HMAC, operation ID·inventory·commit·route·기한, exclusive lock, hash-chain audit | 중복 ID는 기존 상태만 반환. 실패 쓰기/끊김 자동 재전송 없음. 미확정은 inspect/status로 관찰하고 자동 unlock/재배포하지 않음 |

`prepare-development.cjs`의 예전 ready=true 개발 fixture를 이 staging 경로에서 사용하지 않는다. staging은 고유 namespace/owner receipt/예약 포트/강제 mock 조건에서만 ready=false 앱을 기동한다. production 시작 검사를 완화하지 않는다. 실제 server.js/manager.js·인증/API·SQLite를 사용하며 모의 HTTP 서버로 바꾸지 않는다.

v017 기준은 **운영 파일/데이터가 아닌 v017 서버 원본 코드의 별도 direct-worker fixture**다. 운영 manager/systemd 프로세스 관계를 복제했다고 주장하지 않는다. 실제 manager topology는 [읽기 조사](AZURE-INSPECTION.md) 이후에 확정해야 한다.

## 고정 프로토콜과 승인

`protocol=riftassist-staging-1`, siteId/inventoryHash/requestId/method/payload만 받는다. 알 수 없는 명령/필드는 거절한다. Root·unit·프로그램·셸·임의 원격 경로를 요청에 지정할 수 없다.

- 조회/계획: status, inspect, preflight, plan, rollback-plan. 일반 확인 popup 없음. 최초 설치·접속 활성화는 별도 승인이다.
- 쓰기: deploy, rollback. 사용자가 site/서버/현재·대상 버전/commit/package hash/backup·route 계획을 확인한 exact 요청에만 승인한다. `AnalysisConsent`는 해당 payload와 프로필에 바인딩된다.
- verify-backup은 staging private에 임시 복원본을 만들어 검증한 뒤 정리한다. 원본 DB를 변경하지 않지만 임시 디스크 I/O는 있다.
- 서버의 서명된 계획은10분 유효하다. source commit/package digest는 설치 inventory의 승인 pin과 일치해야 한다. 클라이언트의 "CI 성공" 필드만 신뢰하지 않는다. pin을 정하는 운영자는 실제 GitHub exact SHA CI/파일/권한 검토를 해야 한다. 서버가 Riot 승인/라이선스 진위를 자동 판정하지 않는다.
- 최초 연결 활성화도 host/user/SSH profile hash/site/inventory/최대1시간 기한과 설치 확인을 요구한다. 기존 Azure 읽기 자동 로그인이나 DPAPI 기록이 staging 쓰기 승인이 되지 않는다. 설정을 저장하거나 EXE를 시작했다고 쓰기 연결하지 않는다.

기존 Desktop 배포 탭은 여전히 LocalDeploymentClient 합성 엔진이다. 새 실제 staging API는 Core에 준비되어 있지만 사용자가 설치/연결을 승인하기 전 UI의 실제 연결 버튼/시작 자동화는 제공하지 않는다. 기존 카드·번역·제보/개발 관리자·Codex/GitHub 도구는 보존한다. 실제 Codex 추론/수정PR 게시·유료 Riot/OpenAI 호출은 수행하지 않는다.

## 설치 전에 사람이 확정할 항목

1. [읽기 점검 명령/영향](AZURE-INSPECTION.md)을 먼저 승인하고 실제 unit/프로세스/포트/DataRoot/Caddy 관계를 확인한다. v017 manager backup API는 purge를 수행하므로 호출하지 않는다.
2. **별도 Ubuntu staging VM/호스트를 우선 권장**한다. 새 계정·디스크·네트워크와 합성 자료만 제공한다. 같은 운영 VM을 쓰려면 별도 UID·포트·OS/파일/네트워크 격리 검토가 추가 필요하다. systemd의 localhost 허용만으로 같은 호스트의 모든 다른 loopback 서비스에 대한 포트 단위 egress 격리가 증명되지는 않는다. 실제 운영 키/DB/SSH 개인키를 staging으로 복사하지 않는다.
3. 새로운 `/var/lib/riftassist-staging/<UUID>`와 `/etc/riftassist-staging/inventory.json`, 전용 APP UID/GID, Node24·Caddy 바이너리, 두 slot의4개씩 포트·proxy HTTPS/admin 포트를 예약한다. 기존 80/443/3001/3011/3012/3100/3200/3201/3211/3212는 거절한다. 예시 숫자는 실제 예약 증거가 아니다.
4. `inventory.example.json`의 installationApproved=false/UID0/빈 hash를 그대로 유지한 상태로 검토를 시작한다. 실제 확인한 새 site/계정·exact commit·package digest를 검토하고 설치 승인을 받아야 활성 inventory를 만들 수 있다. config는 root 소유, 그룹/전체 쓰기 금지이며 server serve는 고정 경로만 읽는다. stdin/request로 바꿀 수 없다.
5. 검증된 staging 모듈은 root 소유 `/usr/local/lib/riftassist-stage/staging/`, 종전 lab helper는 형제를 유지한 `.../deployment/lab.cjs`, 신뢰 mock transport는 `staging/mock-services.cjs`에 설치하는 구조다. Windows ZIP의 mock-services는 검증된 backend external-services.js와 해시가 같아야 한다. 이 단계에서는 설치를 실행하지 않는다.
6. root-owned wrapper의 원문은 `templates.cjs.wrapper`다. env를 비우고 고정 Node/serve만 시작하며 인수를 받지 않는다. SSH 전용 계정/키는 제한된 fixed command만 쓰게 하고 port/agent forwarding·PTY를 허용하지 않는다. sudoers는 이 **무인수 endpoint 하나만** 허용하는 검토안이다. `sudo sh`, 임의 systemctl/파일 쓰기 권한을 부여하지 않는다. broker가 root 권한으로 동작하는 위험은 사라지지 않으므로 설치 파일/경로/UID/권한/업데이트 주체의 별도 보안 검토가 필수다.
7. `templates.cjs.systemdUnits(config)`는 텍스트만 생성한다. 설치·enable·daemon-reload를 실행하지 않는다. 고유3개 unit의 User/WorkingDirectory/경로·sandbox를 검토해 **설치 승인 후** 반영해야 한다. 기존 unit을 덮거나 자동 시작을 바꾸지 않는다. 후보 service는 정해진 app UID, NoNewPrivileges/ProtectHome/ProtectSystem/ReadOnly code/loopback/mock 환경에서 실행한다.
8. 새 site의 baseline을 운영 데이터가 아닌 검토한 v017 코드/합성 DB로 provision하고 wrapping key를 별도 private에 보관한다. `files.initialize/prepareData`는 원격 RPC가 아니며 새 비어 있는 site를 위한 설치 단계다. 실제 운영 데이터를 seed하는 명령은 구현하지 않았다. code 디렉터리0755·파일0644, 비밀 DB/키/private0700/0600과 app 소유권을 명시해야 하며 umask에 맡기지 않는다.

현재 이 문서에는 승인 없는 서버 쓰기를 한 번에 실행하는 설치 명령을 제공하지 않는다. 실제 metadata 결과를 확인한 후에 고정 inventory·unit 텍스트·경로·hash를 채워 사용자가 검토할 수 있는 **별도 설치안**으로 제공해야 한다.

## 시험 순서와 보존

설치 후에도 기동/실행 승인은 따로 받는다. status/preflight→서명 plan→exact 승인 deploy→baseline online backup/AES 봉인/독립 restore→별도 code·DB·키 준비→고유 unit 기동→실제 manager 인증/상태·규칙/빈 카드 검색·mock AI/합성 제보→백업 재검증→별도 Caddy include CAS/reload→검증 CA HTTPS 사후 확인 순서다. 주어진 unit/코드/포트가 다르면 중단한다.

실패하면 관찰한 own route hash가 일치할 때만 이전 staging v017 route로 복귀한다. 실패/응답 유실/중단 상태는 성공으로 추정하지 않는다. rollback은 별도 서명 계획과 승인으로 이전 앱/라우팅만 선택하고, 새 slot의 DB/키/전환 이후 제보는 남긴다. 역 migration/새 DB를 구 DB 위에 덮기/새 사용자 기록 자동 삭제는 없다. 종료는 서비스의 요청 drain을 기다리고 제한 시간을 둔다.

한 site는 보존되는 a/b slot 하나씩으로 제한한다. b의 code/data가 있으면 후속 deploy에 재사용하거나 덮지 않는다. 다른 commit 시험은 새 site/설치 pin을 준비한다. 장기 release 보관/자동 slot 회전·새 기록 병합·실제 production DB 이관은 미구현이다. crash로 lock이 남으면 status/inspect의 관찰 결과·서버 프로세스·route·backup을 확인하고 별도 복구 승인을 받아야 한다. 자동 stale lock 삭제는 없다.

백업에는 DB·복호화 키가 들어간다. 암호화 wrapping key는 backup envelope와 분리하지만 같은 staging 호스트의 root가 탈취되면 둘 다 노출될 수 있다. plain snapshot/probe는 private에서만 만들고 정상 종료 시 정리한다. 강제 종료/정전 시 잔여 private scratch와 디스크 암호화·오프호스트 보관·접근 권한·복구키 회전·RPO/RTO는 운영자가 별도 확정해야 한다. 실제 백업/키/사용자 내용을 GitHub Actions artifact, PR, Codex, 일반 로그로 보내지 않는다. CI artifact는 code/검사 metadata만 담는다.

## v017 대비 출시 가능성

| 기능 | 기술적 비교/검증 | 실제 공개 출시 조건 |
|---|---|---|
| 카드 DB/검색 | schema1 정규화·ID/선택·영문 효과 입력 계약 유지. 허가된 합성 카드 matrix 사용. SQLite 운영 store 코드는 v017과 동일 | 기존1527개 자료는 과거 감사상 Riftnaru·권한 false였다. 이번에 운영 원문을 다시 열지 않았다. 무승인 자료 이관/공개/AI 입력 불가 |
| 카드/이미지/번역 권한 | v020 restricted 기본, source/본문/권한·번역 검토, image 별도permission, 미발매 공개 근거 확인 | API 승인/서면 허가의 범위·각 출처/이미지/번역/모델 입력을 확인. 플래그 변경/이미지 Riot 도메인/공개 페이지는 허가 증거 아님 |
| AI/규칙 근거 | 공식 규칙 검색·근거 연결·참고용 AI 계약과 KO/EN 유지. 모의 API 및 판정 회귀 | 실제 비용·현재 규칙/정오표·사례 최신성·인용/전송 조건·품질 검증 필요. 공식 최종 판정/대회 저지 대체 아님 |
| 질문/제보/관리 | 기존 인증 API·상태·한도·제보 상세/메모 계약, Node/C# 회귀. 실제 staging manager 인증도 시험 | 실제 개인정보는 시험에 사용하지 않음. operator 연락처/법적 정보/처리 근거·보관/삭제/외부 전송 확정 |
| 쿠키/DB/로그인 | v020의 세션·관리 쿠키 이름과 데이터 루트 분리. HTTPS 사용자 세션 Secure, HttpOnly/SameSite; 관리자는 SSH loopback | 기존 v017 cookie/DB/key 자동 재사용 없음. 새 버전 로그인/세션 재발급과 이전 기록 접근 정책 확인. 운영 dataRoot 지정 금지 |
| 백업/복원/롤백 | online snapshot·AES-GCM·별도 integrity/decryption probe·새 기록 보존. rollback=앱/route | 실제 운영 DB/키 조합 복원 훈련·offhost 보관·RPO/RTO·전환 이후 기록 후속 열람/이관은 별도 승인/검증 |
| HTTPS/PWA | 별도 Caddy TLS 검증·live443 미접촉. PC/모바일/PWA offline/API 비캐싱 기존 E2E 유지 | 실제 도메인·현재 Caddy/TLS inventory·브라우저에서 전환/rollback 중 기존 탭/쿠키/오프라인 shell 호환 시험은 후속. 보존한 예전 shell을 곧바로 삭제하거나 강제 새로고침하지 않음 |

Riot API 승인 전에도 **기술적으로** 규칙 검색·제보·관리·권한 제한 화면·합성 카드 수집/번역/검토·mock AI·별도 staging/backup 시험은 개발할 수 있다. 이것이 정책상 공개 출시 허가라는 뜻은 아니다. 공식 규칙/저지 사례도 확인한 출처·재사용 범위 내에서만 써야 한다.

권한이 확인되지 않은 Riftnaru 카드·이미지·번역의 기존 공개/모델 입력 경로, 실제 Riot 공식 API/최신 카드의 공식 출처 표방은 현재 출시 가능한 기능으로 분류하지 않는다. 권한이 확인된 자료만 별도 후보/관리 승인 후 사용할 수 있다. 자동 수집/번역 성공·Riot API 승인만으로 운영 서비스를 전환하지 않는다.

## 검증 방법

- `node --test staging/staging.test.cjs`: 합성 IO와 실제 SQLite/봉인/별도 restore, 승인/중복·오류 주입. 실제 systemd/Caddy라고 주장하지 않음.
- `python staging/inspection.test.py`: 합성 systemctl/HTTPS 응답만. import 시 Azure/public HTTPS 조회 없음.
- C# StagingProofs: 승인 차단/프로필·UTF8·오류 분리·유실 no-retry 및 실제 OpenSSH↔모의 loopback 고정 endpoint. 실제 Azure 아님.
- `staging/Dockerfile` code-only Ubuntu24.04 컨테이너 + `--network none`: 실제 v020 앱·v017 원본 서버·Caddy/TLS·backup/rollback. systemd는 프로세스 감독 fixture로 구분.
- Ubuntu CI의 `integration.cjs --systemd`: 새 disposable site/unit만 만들고 실제 systemd·실제 앱·Caddy HTTPS·backup/rollback을 시험한 후 own unit/site만 정리한다. 실제 Azure/운영 구성을 검증했다고 확대하지 않는다.
- Windows CI: native WPF/실제 ZIP EXE·아이콘·소스/번들 C#·앱/구버전 회귀. Windows10 새 실기기 및 실제 설치 연결은 사용자 후속.

운영 적용은 읽기 조사→고정 설치안 승인→staging 시험 승인→데이터 권한/개인정보/현재 버전 품질 검증→별도 production 설계·ready 결정→사용자 배포 승인 순서로 남는다. 현재 production writer/실제 live Caddy 전환/DB migration/라이브 복구는 제공하거나 실행하지 않았다.
