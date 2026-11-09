# 통합 조사 연결 점검과 이번 출시의 실행 경로

2026-11-09, release/v0.2.0. 실제 Azure 접속·설치·서비스 제어·운영 데이터 접근은 실행하지 않았다.

## 현재 사용할 수 있는 연결

- GitHub 저장소 연결: 비공개 SacredHeart1390/RiftAssist 조회 가능. 연결이 반환한 repository permissions는 admin/maintain/push/pull=true다. Git fetch와 개발 브랜치 push, CI 결과·아티팩트 조회를 사용한다. 이 정보만으로 Actions Secrets 관리용 인증 scope가 확보됐다고 판단하지 않는다.
- GitHub CLI: 현재 환경에서 인증되지 않았다. 연결 도구는 Secrets/Environments 조회 endpoint를 지원하지 않아 기존 Azure secret의 유무는 **미확인**이다. secret 값을 열거나 출력하지 않았다.
- 클라우드 실행 환경: Azure secret/identity binding 없음, Azure CLI 없음, VPN 미설정, TCP 허용 대상 없음. 사용자 Windows의 SSH 키·known_hosts·로그인 세션이 이 환경에도 있다고 가정하지 않는다. 접속 시험을 하지 않았다.
- main에는 rules-tests.yml만 있다. release 브랜치의 control-center.yml은 push로 실행되지만 default branch에 없는 workflow_dispatch를 즉시 쓸 수 있다고 안내하지 않는다. main 변경/병합으로 해결하지 않는다.

## 이번 출시의 결정

현재 연결만으로 승인된 고정 조사 코드를 Azure에 실행할 경로는 없다. 새 자동 접근을 만들려면 최소한 전용 인증키 등록과 실행 범위 제한이 필요하고, 이는 서버 변경 승인에 해당한다. 출시를 늦추지 않도록 사용자가 허용한 **마지막 1회의 기존 통합 조사**를 사용한다. 새로운 Actions SSH job, 주기 조사, credential 저장, 범용 broker를 추가하지 않았다. 이 결정은 자동 수집을 구현했다는 뜻이 아니다.

사용자가 승인하면 기존 작은 조사 키트의 `FINAL-INSPECTION.txt`에서 Inspect 한 줄만 실행한다. EXE나 새 Windows 설치는 필요 없다. 로컬 검증이 필요하면 Verify 한 줄은 SSH 0회다. 이미 수집한 65개 코드/메타데이터 조사를 반복하지 않는다. 이후 결과 분석·수정·테스트·CI는 Codex가 수행한다.

## 한 번에 승인할 정확한 읽기 범위

- 원문: `staging/inspect-final-launch.py` (6890d0599a03e2a91812da003218b9ac4e03ec7c와 동일).
- SHA256: `b5ad2101ddcec04cbd9a1502efdba5b401edaea68a1cd594cc15277242262326`.
- 연결: 기존 Windows OpenSSH, azureuser@20.222.152.195. 로컬 개인키·known_hosts를 그대로 사용한다. StrictHostKeyChecking=yes, 전달/PTY/자동 재시도 금지. 원격 명령은 `python3 -I -S -B -` 하나다.
- 조회: main/helper unit 관계·namespace/환경 파일 존재 여부·drop-in 수, 실제 ExecStart가 참조한 고정 허용 위치의 autostart Python 한 파일(최대32KiB), 확인된 main unit/Caddyfile(각 최대64KiB)의 hash/import 존재 여부.
- helper는 AST parse만 하며 import/eval/실행하지 않는다. source의 주석·미등록 리터럴을 제거한 구조만 반환한다. unit/Caddy 본문은 반환하지 않는다. 구조/식별자 자체가 민감할 가능성은 완전히 배제할 수 없어 이 source 읽기는 별도 승인이 필요하다. redactedStructure는 검토 근거이며 자동 behaviorVerified=true 증거가 아니다.
- DB/WAL/SHM·키·.env·사용자 기록·node_modules 내용은 열지 않는다. sudo/HTTP/파일 쓰기/서비스 제어/설치 없음. 결과는 화면 JSON이며 SSH stderr는 억제한다. 자동 로그·아티팩트 저장/외부 업로드 없음. SSH 접속 로그와 소량 읽기 부하는 발생할 수 있다.
- 코드 SHA 불일치, 잘못된 응답, 예상 외 최상위 필드, 잘못된 안전 플래그는 JSON 출력 전에 차단한다. source 생성기도 고정 SHA가 달라지면 `--write`를 거절한다. 원격 Python 원문은 이번 보완에서 변경하지 않았다.

## 이후 자동 수집을 위한 최초 1회 설정 조건

v0.2.n에서 별도 승인 후, 기존 개인키 대신 조사 전용 키를 생성하고 해당 공개키를 Azure에 등록한다. private key는 대화/저장소로 받지 않고 보호된 GitHub Environment secret에 사용자가 직접 입력한다. 서버 host key도 기존 검증된 known_hosts로 pin한다.

전용 키에는 `restrict`와 **root가 소유하고 변경을 제한한 exact hash의 조사 파일만 실행하는 forced command**가 필요하다. `python3 -`만 forced command로 지정하면 stdin으로 임의 코드를 실행할 수 있어 제한된 권한으로 인정하지 않는다. 서버에 이 파일/키를 설치하는 것은 읽기 조사가 아니며 별도 변경 승인 대상이다. 공유 azureuser 계정의 OS 권한까지 축소되는 것도 아니다.

그 후 release 전용 승인 gate와 fixed hash 검증을 거쳐 1회 실행하고, raw stderr/source/secret을 저장하지 않는 schema 검증 결과만 짧은 보관 기간의 아티팩트로 남긴다. Codex가 CI 아티팩트를 직접 조회할 수 있다. 현재 이 경로는 **미설정·미구현**이며 이번 라이브 출시의 필수 조건이 아니다.

## 분리되는 운영 승인

1. 위 exact source/hash의 1회 읽기 조사.
2. 검증된 코드 패키지 및 필요한 helper 유지보수 차단의 설치/설정 승인.
3. 운영 DB·키·.env의 일관성 백업·독립 복원 검증 및 서비스 중단 승인.
4. 승인된 규칙/개인정보 조건, exact package/profile/CI를 확인한 최종 단일 교체 승인. 실패 복귀와 이후 수동 롤백 범위를 함께 명시한다.

어느 단계도 다음 단계의 승인을 대신하지 않는다. ready=false, 원본 폴더 strict 검증 실패 상태와 별도 clean rollback 기준을 유지한다. 나머지 실행 순서는 [FINAL-LAUNCH.md](FINAL-LAUNCH.md)를 따른다.

## 이번 변경 검증

로컬 Node257·버전 호환6·v017회귀11·Chromium17·기존lab29·고정 pin 회귀3·C#284·Python43 = **650/650** 통과, WPF 교차 빌드 경고/오류0. 최초 기본 sandbox 실행에서는 loopback listen이 EPERM으로 실패했으며, 로컬 통신이 허용된 실행으로 다시 검증했다. 실제 Windows PowerShell5.1 응답 거절 시험·native WPF·systemd 교체/복귀는 이 commit의 CI에서 확인하며 로컬 결과로 대체하지 않는다. 범위/패턴 기반 staged 검사에서 민감 파일·자격증명 패턴 발견0이며 전체 이력의 비밀정보 부재를 보증하는 검사는 아니다. v017·운영 SQLite·키·다른 브랜치 수정 없음.

최초 CI c7a034a에서는 Windows source C#290/290 후 package C#288/289였다. 250ms 고정 취소가 합성 자식의 PID 파일 생성과 쓰기 사이에 겹쳐 빈 파일을 읽은 경쟁 조건이었다. fixture가 PID를 atomic rename으로 게시하고 부모가 실제 live child 준비를 확인한 뒤 취소하도록 수정했다. 취소 후 종료 시간과 프로세스 수거 검사는 유지하며, 단순 재실행이나 예외 무시로 통과시키지 않는다. 이 보완의 최종 CI 결과는 GitHub exact commit에서 확인한다.
