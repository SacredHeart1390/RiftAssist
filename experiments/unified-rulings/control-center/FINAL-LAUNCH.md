# 다음 실행: 표적 읽기 → 승인된 코드 설치 → 데이터 검사 → 단일 교체

연결 권한 점검과 이번 출시의 최소 조사 경로는 [INSPECTION-ACCESS.md](INSPECTION-ACCESS.md)를 따른다. 현재 Azure 자동 접속은 미설정이며, 보호된 접근을 새로 설치하기보다 기존 고정 통합 조사를 마지막 한 번 사용하는 경로를 선택했다. 이 문서는 조사나 운영 변경을 승인하지 않는다.

2026-11-09, release/v0.2.0. 이번 작업에서는 실제 Azure SSH/설치/서비스 제어/DB·키·.env 내용 접근을 하지 않았다. ready=false와 운영 변경 차단을 유지한다. 원본 v017/추가 파일/기록/다른 branch/PR1은 그대로다. Control Center 원클릭 완성/상시 broker/새 VM/병렬 서비스는 요구하지 않는다.

## 1. 원본을 수정하지 않는 복귀 기준

확인된 추가 항목은 node_modules775·package-lock.json664이며1000/1000이다. package-lock은 npm 설치 재현 자료로 Node가 일반 실행 때 자동 해석하는 파일은 아니다. 그러나 pdfjs-dist5.6.205는 원래 package.json에 선언돼 있고, 수동 sync-rules의 bare import 및 자동 collector의 RIFTASSI_PDFJS_PATH/별도 Node 설치 경로 import가 있다. 설치 의존성/환경까지 검증됐다고 가정하지 않는다. group 쓰기 가능은 변조 가능성이지 변조 증거가 아니다.

기존 strict `legacy-v017` 검증을 변경하지 않았다. 원본 폴더 전체 referenceVerified는 계속 false다. 새 package에는 Git 기준65개를 exact-byte 검증한 **별도 clean rollback 코드**만 넣는다. node_modules/lock/운영 DB·키·자료는 넣지 않는다. 설치 대상은 `/var/lib/riftassist-rollback/<검증 code hash>/v0.1.7`이며 root 소유·group/other 쓰기 금지다. 같은 검증본은 새 배포 profile에서도 읽기 검증 후 재사용하며 덮어쓰지 않는다.

`rollbackCode`를 명시한 모드에서 원본65개 검증은 유지하고, 실행/복귀 reference는 새65개 전체 strict receipt로 분리한다. `rollbackSourceAssessment`는 원본의 미검증 상태를 그대로 보고하고 `rollbackExecutionReference`가 별도 reference를 표시한다. 원본 extras를 허용하는 fallback은 없다. 코드 hash·소유권·namespace 증거가 없으면 차단한다.

서비스의 **private mount namespace 안에서만** clean 코드를 기존 v017 경로에 `BindReadOnlyPaths`로 보인다. 호스트 원본은 이동/삭제/덮어쓰기/chmod하지 않는다. 같은 옛 경로를 사용하는 manager와 worker가 clean 코드를 읽고 DataRoot/DB·키·기록은 기존 위치를 사용한다. readonly binding이 실패하면 systemd가 프로세스를 기동하지 못하며 미검증 원본을 실행하는 우회는 없다. RootDirectory/RootImage/다른 bind/EnvironmentFiles 등 미검토 설정은 사전 차단하고, start 직전에도 실제 effective binding을 확인한다.

clean rollback에서는 scripts 경로를 서비스 내부에서만 inaccessible로 만들어 자동 수집을 중지하고 NODE_OPTIONS/NODE_PATH/PDFJS 설정을 비운다. main ExecStart는 확인된 Node+원래 manager 경로로 고정한다. AI 생성은 예산/상태 대조 전까지 중지한다. 기존 관리자·규칙/검색·제보·기록 접근을 복귀시키는 유지보수 계약이며 모든 기존 자동 수집/AI 설정이 그대로 활성이라고 주장하지 않는다. fallback이 노출하는 기존 자료·외부 사례·캐시의 권리/개인정보 범위도 최종 rights/privacy 검토에 포함해야 하며 clean 코드 검증이 자료 허가를 부여하지 않는다.

## 2. 가능하면 마지막 한 번에 묶는 표적 읽기 승인안

새 원문: `staging/inspect-final-launch.py`. 실제 실행 전 해당 commit의 원문과 `FINAL-INSPECTION.txt`에 pin된 SHA256을 함께 승인받는다. 기존 승인된 metadata-only 스크립트의 범위를 바꾸지 않았다.

- helper unit의 ExecStart에서 실제 발견된 `riftassist-autostart.py` **한 파일**만 읽는다. 고정 허용 위치5곳 중 실제 참조된 한 경로에만 접근하며 경로를 추측해 순회하지 않는다. 불일치/symlink/hardlink/크기 초과는 거절한다. 해당 source를 AST로 parse할 뿐 import/eval/exec하지 않는다. 주석과 미등록 문자열·숫자·bytes는 제거/치환하고 구조와 고정 API/필드 이름만 반환한다. 원문은 서버 메모리에서만 처리하며 파일로 저장하지 않는다. 하드코딩된 비밀 리터럴이 있을 수 있어 source 읽기 자체도 이번 새 승인 대상이다. 이 redacted 구조가 실행 가능한 원본이나 자동 behaviorVerified=true는 아니다.
- main/helper2개 고정 unit의 관계·namespace/EnvironmentFiles 존재 여부·drop-in 수를 묶어 확인한다. Environment 값·원시 argv는 출력하지 않는다. main→helper Requires/BindsTo가 있으면 mask 후 main 시작까지 막힐 수 있으므로 먼저 중단한다.
- 확인된 `/etc/systemd/system/riftassist.service`와 `/etc/caddy/Caddyfile` source를 bounded 읽어 SHA256만 반환한다. 설정 본문·환경 비밀값은 출력하지 않는다. Caddy import가 있으면 자동으로 다른 설정을 읽지 않는다.
- DB/WAL·키·.env·사용자 기록·의존성 내용은 읽거나 hash하지 않는다. sudo/서비스 제어/HTTP 요청/설치/파일 쓰기가 없고 Python `-I -S -B` 격리 stdin 실행이다. 새 포트/프로그램 설치도 없다. SSH 로그·작은 읽기 부하는 생길 수 있다.

PowerShell5.1에서 `FINAL-INSPECTION.txt`의 **한 줄만** 붙인다. 두 명령은 각각 독립돼 있고 함수 정의/멀티라인 붙여넣기/.ps1 실행/정책 변경이 필요 없다. Verify 줄은 SSH0회, Inspect 줄은 이 새 범위 승인 후 사용자가 실행한다. 전체 파일을 한꺼번에 붙이지 않는다. raw stderr/잘못된 응답 억제·호스트 검증·SHA 선검증·재시도 금지를 유지한다. source가 고정 범위 밖이거나 미지원 구문/추가 import 때문에 검토가 불완전하면 범위를 임의 확대하지 않는다. 필요 시 한 표적만 추가 승인한다.

결과를 보고 helper의 실제 login/start/지연·재시도·파일/서비스 제어를 검토한다. 중지 전 helper quiescence와 유지보수 차단/원복 승인이 필요하다. disable만으로 Wants 실행을 막을 수 없고 mask도 별도 운영 변경이다. 기존 unit/부팅 상태를 보존하고 장기 복구가 보장되는지 확인하지 않은 채 helper를 영구 차단하지 않는다. 신규 v020 launcher는 정상 관리자 로그인 후 앱을 시작하며 service Restart=on-failure를 유지한다.

## 3. 최소 코드 설치 명령 — 아직 승인되지 않음

읽기 결과·권리/개인정보·실제 pin을 반영한 inventory를 만든 뒤 **설치 승인**을 받는다. inventory에 키/쿠키/사용자 내용은 넣지 않는다. 현재 package는 ready=false 검토용이다. ready 변경은 별도 승인된 source commit/CI/package로만 하며 초기화된 site의 owner/hash를 재등록하지 않는다. 별도 DB qualification 후 새 source profile을 준비해도 동일한 clean reference와 guard를 유지할 수 있다.

승인된 exact code-only package를 `/var/lib/riftassist-replacement-upload/<site UUID>/code`에 **root 소유·타 사용자 쓰기 금지**로 준비한다. 기존 경로를 덮어쓰지 않고 업로드는 코드만 한다. 외부 CI proof의 plan hash와 SHA256SUMS hash를 독립 확인한 뒤 링크/특수 파일/hardlink를 거절하고 모든 hash를 검사한다. 상세 외부 checksum 선검증은 MANUAL-LIVE-RELEASE.md 3절을 따른다. 미검증 package 코드를 root로 먼저 실행하지 않는다.

아래는 **확정된 UUID/CI hash/profile의 설치 승인 후에만** root 관리 shell에서 실행할 최소 절차다. CODE/PLAN_SHA256을 임의 값으로 채우지 않는다. global inventory는 root 소유이고 `/etc/riftassist-replacement`도 타 사용자 쓰기가 없어야 한다.

```bash
set -eu
CODE="/var/lib/riftassist-replacement-upload/<승인-UUID>/code"
cd "$CODE"
# 외부 plan/SHA256SUMS pin 및 링크 검사를 먼저 완료한 뒤:
sha256sum --check --strict SHA256SUMS
/usr/bin/node "$CODE/site/tools/install-code.cjs" "$PLAN_SHA256"
```

installer는 고정 inventory와 exact package/site/commit/clean code hash를 대조하고, 새 site·도구·v020 코드·새 private wrapping key 및 검증된 rollback 코드만 준비한다. 기존 v017/DB·키/.env/Caddy/unit 내용은 열지 않고 서비스/설정을 바꾸지 않는다. 기존 mirror는 strict hash·root 소유권을 확인해 재사용하며 수정하지 않는다. 새 site가 존재하거나 응답/설치가 불명확하면 자동 재설치/삭제하지 않는다. 결과 receipt의 authorizedToDeploy=false를 유지한다.

별도로 권한 확인된 rules-only knowledge 후보를 새 candidate DataRoot에만 준비하고 active pointer+manifest의 knowledgeHash를 inventory에 pin한다. 원본 shared active.json은 변경하지 않는다. 미승인 카드/이미지/번역·사례를 섞지 않는다. 실제 승인 규칙과 운영자 개인정보 항목이 없으면 준비 완료로 간주하지 않는다.

## 4. 데이터 검사·실제 교체·복귀의 승인 경계

현재 메타데이터 DB+WAL+SHM4,462,168bytes는 자원 검사상 수용 가능하다. 키 길이/존재만으로 schema/복호화 검증을 통과시키지 않는다. 실제 DB·3키·.env 처리와 서비스 중단은 설치와 별도 승인이다.

기존 MAINTENANCE-CONSOLE의 고정 JSON endpoint를 수동 SSH로 일회성 실행한다. 승인된 profile로 `status/preflight → plan → 승인된 replace`를 수행한다. replace는 writer/cgroup·3001/3100/3011/3012 종료 → SQLite backup API의 WAL 포함 snapshot → AES-GCM 봉인 → 독립 integrity/schema/실제 암호문 복호화/설정 검사 → 새 데이터 사본 → v020 단독 시작 → 관리자 인증·HTTPS/버전 확인 순이다. **검증 전 원본 덮어쓰기/자동 migration/DB 본체만 복사하지 않는다.** 별도 qualification을 원하면 명시적 유지보수 승인으로 같은 백업/복원 검사 후 clean v017 유지보수 모드에 복귀한다.

실패 복귀는 사전 승인된 transaction 범위에서 clean v017 binding+원래 DataRoot로 돌아간다. Caddy/443/TLS/도메인은 변경하지 않는다. 정상 교체 후 rollback은 별도 계획/승인을 받으며 새 v020 DB·키·제보를 먼저 보존/검사하고 삭제/역 migration/구 DB와 자동 병합하지 않는다. AI 예산 대조 전 생성은 중지한다. 응답 유실은 status/inspect/reconcile부터 확인하고 실패 쓰기를 재전송하거나 lock을 지우지 않는다. transaction 밖의 새로운 복구 변경은 다시 승인받는다.

## 다음에 필요한 것

1. 위 표적 source/config 읽기 승인 및 사용자 PC 실행 결과. 이미 끝난 전체 metadata 조사를 반복하지 않는다.
2. 허가된 규칙 후보·운영자 연락처/처리 조건, 복구키 분리 보관·백업 보관/삭제·RPO/RTO, helper 차단/부팅/원복 정책 확정.
3. 검증된 exact package/profile의 코드 설치 승인.
4. 운영 데이터 백업·독립 복원과 중단 승인, ready 변경/최종 교체 승인. 필요한 승인 범위를 한 답변에 묶을 수 있지만 서로 자동 승격하지 않는다.

실제 운영 호환성과 자료 권리 확인이 안 된 항목을 true로 채우지 않는다. API 승인 대기나 Control Center 자동화 완성 자체는 최소 출시 gate가 아니다.

## 저장된 로컬 검증 범위

Node257·버전 호환6·v017회귀11·Chromium17·기존lab29·C#284·Python43 = **647/647** 통과 로그가 남아 있다. WPF 교차 빌드는 경고/오류0이다. 최종 조사 UTF-8 BOM 처리와 격리 Python 인수도 검사했다. 실제 systemd namespace 기동/복귀는 이 commit의 Ubuntu CI에서 별도 검증하며 CI 전에 통과했다고 주장하지 않는다. Windows PowerShell5.1·실제 WPF·추출 package도 같은 exact commit에서 확인한다. 실제 Azure/운영 데이터/유료 API 시험을 대신하지 않는다.
