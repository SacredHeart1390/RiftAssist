# Windows 단일 진입점: A → C

`START-RELEASE.cmd`를 실행한다. PowerShell 붙여넣기나 .ps1 실행 정책 변경은 없다. 기존 Windows OpenSSH와 `%USERPROFILE%\.ssh\known_hosts`, `riftassistant-key.pem` 경로를 재사용한다. 개인키 본문은 읽거나 업로드하지 않는다. SSH 대상은 azureuser@20.222.152.195 한 곳으로 고정하고 호스트 키 검사·BatchMode를 유지한다. 새 포트·브로커·sudoers는 설치하지 않는다. 기존 sudo 비대화형 권한이 없으면 안전하게 실패한다.

**현재 패키지는 실행 도구 검증본이며 라이브 출시본이 아니다.** 소스 ready=false, 확정되지 않은 권리·개인정보·복구키 조건 때문에 SSH 이전에 BLOCKED로 종료한다. 원문이나 inventory를 현장에서 true로 고쳐 사용하지 않는다. 최종 조건이 충족되면 같은 빌더가 실제 규칙·공개 정책·exact CI와 불변 inventory를 포함한 새 키트를 만든다. 이 문서/합성 시험은 법적 허가나 운영 완료 증거가 아니다.

최종 출시본에서는 전체 파일 hash/plan/clean65/commit/knowledge/정책·CI pin 검사 후 서비스·코드·inventory·A/C 영향 범위를 표시한다. **지금 시작하는 유지보수 창의 A와 C를 함께 승인하는 y 확인 한 번**만 받는다. 키 입력·클립보드 복사·단계별 승인은 없다. 현재 v017 원본과 shared active는 수정하지 않는다. AI 전송 미승인 시 generation/liveProvider 모두 꺼져 있어야 한다. noindex는 기존 v020의 전 응답 헤더 정책을 유지한다.

승인 후 A: 새 사용자 업로드 폴더 예약 → 코드/public inventory/승인 규칙만 SCP → root 고정 Python bootstrap의 외부 pin/전 파일 검증 → 기존 install-code 엔진 → 새 데이터 경로에 규칙 설치 → receipt와 preflight 확인. 기존 DB·키·env·unit·Caddy는 A에서 변경하지 않는다. 코드 설치의 부분 실패도 자동 덮어쓰기·재설치하지 않는다.

C: 기존 `replacement-serve --approved-replace`를 **같은 operation ID로 한 번** 호출한다. 기존 엔진이 helper guard, drift·자원, cgroup 정지, WAL 포함 SQLite backup/AES-GCM, 독립 restore/복호화/schema/설정, 새 데이터 사본, 단독 기동, 관리자/규칙/HTTPS를 검사한다. 독립 B는 없다. Caddy는 바꾸지 않는다. 통상 실패는 검증된 clean65+oldData로 조건부 복귀하고, 무결성·상태 불명확/복구 실패는 recovery-required다. 기존 및 신규 기록은 보존하고 구 DB에 병합하지 않는다. **fallback의 자료 권리도 별도 확인되어야 하며 clean 코드 hash가 자료 권한을 대신하지 않는다.** 미확인 fallback 자료 공개를 허용하는 키트를 만들지 않는다.

완료 후 PC에서도 TLS 검증을 켠 실제 `/api/release`가 v0.2.0인지 재확인한다. 유료 AI를 시험 호출하지 않는다. 로컬 receipt는 `%LOCALAPPDATA%\RiftAssist\Release\<inventoryHash>.json`에 public pin·operation ID·단계만 저장한다. raw SSH stderr, 키, 쿠키, DB·사용자 기록은 화면·파일에 남기지 않는다. stdout도 고정 receipt/상태만 표시한다.

중단·응답 유실·재실행: 원래 receipt를 보존하고 **inspect/reconcile 조회만** 한다. 업로드·설치·replace를 자동 재전송하지 않는다. 완료 응답을 잃은 경우에도 새 UUID로 다시 쓰지 않는다. 재실행 시 공개 버전도 읽기 확인한다. 설치 실패·중단은 receipt만으로 자동 복구할 수 있다고 주장하지 않는다. lock/journal을 삭제하지 않으며 recovery-required는 상태에 맞는 별도 복구 승인이 필요하다. 새 버전에서 정상 운영 후 요청하는 수동 rollback은 기존 FINAL-LAUNCH 절차의 별도 운영 변경이다.

## 실제 조건과 검증 경계

- 사용자 정책: 백업 30일, 운영자 1명 접근, 만료 시 법적 보존·복구 필요 검토 후 삭제. 현재 자동 만료/외부 반출 기능은 없으며 완료됐다고 표시하지 않는다.
- 규칙 URL·공개/AI 이용 허가 근거, 실제 개인정보처리자 명칭/이메일/법적 고지, VM 외부 보관 장소·분리 복구키 방법은 아직 미확정이다. 대괄호 자리표시자는 입력으로 거절한다. 최초 사용자가 제공한 자리표시자를 실제 정보로 저장하지 않는다.
- 동일 VM·도메인·Caddy·서비스·3001/3100 구조다. 10분은 제안 유지보수 창일 뿐 실제 중단 상한 보증이 아니다. 프로그램의 최종 y는 표시한 즉시 A/C 범위에만 적용된다.
- 최종 GitHub Actions의 exact commit 성공과 **게시된 외부 artifact SHA256**을 확인한 신뢰할 수 있는 ZIP을 새 폴더에 푼다. 내부 manifest는 파일 간 일치 검사이며 자체 서명/게시자 인증을 대신하지 않는다. .cmd/Node에 코드 서명을 했다고 주장하지 않는다.
- 자동 검증은 합성 자료·모의 SSH 실행 어댑터와 격리 환경만 쓴다. Windows CI의 실제 CMD/Node 실행·차단 및 루프백 SSH 전송/고정 bootstrap 검사는 실제 Azure 배포 성공과 다르다. 회사 Windows10 실기기·실제 sudo/SSH 설치/교체는 별도 실제 실행 결과로만 인정한다.
- 최종 활성화는 검증된 소스/규칙/정책으로 다시 빌드하고 전체 CI를 통과해야 한다. 현재 검토 키트를 수정해 활성화하지 않는다. main/develop/feature/Draft PR1 변경·운영 코드 자동 배포·유료 호출은 없다.
