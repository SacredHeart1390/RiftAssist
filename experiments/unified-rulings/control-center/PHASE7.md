# Control Center 7차 — 실제 Codex 실행·작업별 Draft PR

2026-11-04 Asia/Seoul. Windows 10 22H2 x64 / .NET 10 WPF. 통합 개발은 `feature/riot-api-v0.2` / Draft PR #1을 유지한다. 운영 SSH/관리자 읽기, 로컬 수동 제보, 카드/번역 검토와 6차 분석·합성 수정·프롬프트 복사는 그대로다. 운영 쓰기와 Azure 배포는 계속 차단한다.

## 구현과 검증 범위

**실제 어댑터를 구현했다. 실제 Codex 추론·실제 오류 수정 PR 게시를 개발자가 실행한 것은 아니다.** 자동 테스트는 합성 제보·모의 Codex/GitHub 프로세스 응답을 사용한다. 실제 Git 프로세스/소스 사본/diff, Node 합성 재현 전후, WPF/DPAPI/패키지는 별도로 검증한다. Windows CI 결과와 패키지는 [7차 보고서](../artifacts/control-center-phase7-2026-11-04/README.md)에 기록한다. CI Windows Server 실행과 회사 Windows10 실제 연동은 구분한다.

| 기능 | 실제 구현 | 개발 검증 |
| --- | --- | --- |
| CLI 설치/ChatGPT 로그인 상태 | native EXE `--version`, `login status`; raw stderr 비공개 | 실제 프로세스 경계 + 모의 도구 출력 |
| 실행 | `codex exec --json --ephemeral`, stdin, 제한 프로파일, JSONL 진행/토큰/요약 | 모의 CLI; 실제 추론 미실행 |
| 격리 | Windows elevated sandbox, root 읽기 거부, 네트워크 거부, 허용 소스만 사본 | 정책/차단 테스트; 사용 기기의 실제 샌드박스 검사는 실행 직전 필수 |
| GitHub 준비 | gh REST tree/blob 허용 목록; 로컬 저장소 불필요 | 실제 어댑터에 모의 HTTP 응답 |
| 변경 확인 | 별도 bare Git 메타데이터 + real `git diff`, 해시, 범위/비밀 검사 | 실제 Git·합성 코드 |
| 게시 | gh Git database API로 커밋/tree/ref + 작업별 Draft PR | 모의 응답; 실제 작업 PR 미생성 |
| 지속성 | 별도 사용자 DPAPI 이력, CAS/활동 잠금/원자 저장 | Windows DPAPI + 모의 보호·재시작 테스트 |

6차의 ‘AI로 오류 분석’은 로컬 예비 분석이며 별도 유료 분석 API를 추가하지 않는다. 7차 ‘Codex로 수정하기’는 승인한 제보를 실제 CLI에 보내 분석·수정하게 하는 별도 경로다. 모델의 완료/원인 주장을 검증된 정답으로 표시하지 않는다. v017 긴급 건은 기존 제안/프롬프트 경로로 분리하며 직접 편집하지 않는다.

## Windows 최초 준비

1. 새 패키지 전체를 새 폴더에 풀고 최상위 `RiftAssist.ControlCenter.exe`를 실행한다. 기존 LocalAppData SSH/DPAPI/수동 제보를 지우지 않는다. 로그인/설치/계정 권한 부여를 자동 진행하지 않는다.
2. 공식 Codex CLI **0.162.0 이상**, Git for Windows, GitHub CLI를 직접 설치한다. CLI 계약/설정이 지원되지 않으면 차단한다. 도구 창에서 각 **native `.exe`** 경로를 지정한다. npm의 `codex.cmd`/PowerShell shim은 실행하지 않는다. npm 설치를 사용했다면 해당 공식 플랫폼 패키지의 native `codex.exe`를 선택한다. 임의 EXE를 선택하면 해당 도구를 신뢰하는 것이므로 공식 배포본을 확인한다.
3. 개인 터미널에서 `codex login`으로 **ChatGPT 계정** 인증을 완료한다. 브라우저의 기존 Codex 채팅/로그인만으로 로컬 CLI가 인증된다고 가정하지 않는다. `codex login status`가 ChatGPT 방식이어야 한다. API 키 로그인/환경 변수는 자동 사용하지 않는다.
4. `gh auth login --hostname github.com`을 직접 완료한다. 고정 저장소 `SacredHeart1390/RiftAssist` 읽기/쓰기·Draft PR 권한이 필요하다. Git Credential Manager는 기존 Git에 남겨두지만 이 버전의 게시 어댑터는 **gh 인증**을 사용한다. GCM 토큰 추출/복사는 하지 않는다. 회사 조직 정책/SSO 승인이 필요하면 직접 처리한다.
5. 공식 Windows **elevated sandbox**를 사용자/회사 IT가 준비해야 한다. 프로그램은 관리자 권한 상승이나 sandbox 설치를 자동 실행하지 않는다. `unelevated`/WSL 우회·전체 접근·보호 해제는 지원하지 않는다. Windows10은 Codex upstream에서 best effort이며 Windows11을 더 권장한다. 적절한 격리를 제공하지 못하면 실행할 수 없다.
6. 사용자 MCP 목록이 비어 있어야 한다. 외부 도구/플러그인/후크/브라우저·웹 검색은 이 경로에서 비활성화한다. 관리 정책과 충돌하거나 지원 여부를 확인하지 못하면 실행하지 않는다. 기존 계정 설정을 자동 삭제하지 않는다.

원칙상 최신 모델명을 강제하지 않는다. 안전을 위해 실행 시 `--ignore-user-config`로 사용자 일반 설정을 상속하지 않고 CLI 기본 모델을 쓴다. **기존 커스텀 모델/제공자 설정은 이 격리 경로에서 유지하지 않는다.** ChatGPT 캐시 인증은 CLI가 재사용하며 프로그램은 auth.json/토큰을 읽거나 작업 폴더에 복사하지 않는다. 향후 검증된 모델 설정 allowlist가 필요하다.

## 실제 사용 흐름

제보 선택 → **Codex로 수정하기** → 최초 도구·로그인 확인 → 실행 기능 활성화 → 개인정보 제거·편집 가능한 전송 미리보기 승인 → GitHub 개발 소스 준비 → 실제 격리 검사 → Codex 진행 → 테스트·변경 결과 확인 → 게시 기능 별도 활성화 → **수정 결과 승인 · GitHub PR 만들기**.

실행과 게시는 각각 기본 꺼짐이며 설정을 저장해도 작업이 자동 시작되지 않는다. 저장 경로는 `%LOCALAPPDATA%/RiftAssist/ControlCenter/Settings/real-tools.local.json`이고 EXE 경로·boolean만 저장한다. 기존 자동 SSH 연결과 독립적이며 Codex에 SSH 설정/키/쿠키를 넘기지 않는다. 현재 제보 revision이 달라지면 실행/게시를 거절한다.

전송 미리보기는 알려진 토큰/키·쿠키·주소·이메일·전화번호·세션 등의 패턴을 제거하지만 이름/간접 식별/임의 인코딩을 모두 알아내지는 못한다. 사용자가 직접 확인해야 한다. 승인 후 **개발 소스도 CLI가 모델에 전송할 수 있다.** 대상은 OpenAI Codex/ChatGPT 인증 서비스이며 기존 웹 채팅 자동 조작이 아니다. 출력 요약은 모델 주장으로 표시한다.

## 소스·실행 경계

전체 clone/archive/history를 가져오지 않는다. gh가 고정 개발 브랜치의 커밋/tree를 읽고 v020/v017 코드 참조·테스트·Control Center 소스의 허용 확장자만 blob 단위로 검증/복사한다. runtime DB/SQLite 캐시·knowledge-releases·private·source-updates·키/env·사용자 자료·Git credential metadata는 제외한다. symlink/submodule/경로 역참조/크기 초과/중복 경로/불완전 tree/의심 비밀은 거절한다. 이 과정의 GitHub 소스 조회도 사용자가 승인한 실행 단계에서만 한다.

작업 루트 `%LOCALAPPDATA%/RiftAssist/ControlCenter/RealRepairs/Jobs/<GUID>/`:

- `Source`: 허용 코드만 있는 일반 소스 사본. `.git` 없음.
- `Before`: 기준 소스. `BeforeTest`: 기준 소스 + 생성 재현 테스트. `Verify`: 변경 소스 + 고정한 원래 회귀 테스트.
- `BrokerGit`: 앱 전용 bare Git 메타데이터, 원격/인증정보 없음. 에이전트 읽기 범위 밖.
- `Temp`: 제한된 임시 실행 공간. 소스는 평문 개발 코드이며 제보/프롬프트 원문을 파일에 쓰지 않는다.

CLI/샌드박스 실행은 셸 없이 ArgumentList·UTF-8 stdin/stdout을 사용한다. credential 환경 변수·SSH agent socket·API 토큰을 자식 환경으로 상속하지 않는다. Windows cached CLI/gh 로그인은 사용자 계정 경로에서 각 도구가 처리한다. raw stderr/임의 명령 출력은 화면/로그로 내보내지 않고 유한한 상태/오류만 표시한다. 명령 이벤트도 원문 실행 인수 대신 상태를 표시한다.

실제 실행 직전 외부의 **공개 canary**로 읽기/쓰기/로컬 LAN 네트워크 접근이 일반 Node에서는 가능하고 sandbox에서는 막히는지, 허용 테스트 폴더 쓰기/기존 테스트 폴더 쓰기 거부를 확인한다. 실제 키를 probe로 읽지 않는다. 결과/CLI 바이너리 해시에 연결한 짧은 ticket이 있어야 실행한다. `:root` deny + `:minimal` read + 소스 read, v020 `src/`와 `tests/incident-tests/` write, job Temp write, network false 정책을 사용한다. workspace-write/ephemeral 옵션만을 격리 보장으로 취급하지 않는다.

단일 canary/패턴 검사는 완전한 악성 코드 분석·모든 sandbox 취약점 검증이 아니다. Windows/CLI 업데이트·회사 정책별 검증이 필요하고 같은 사용자 권한 악성 프로그램/관리자·메모리/화면 캡처까지 보호하지 않는다. 격리가 불충분하면 실제 실행을 막고 기존 프롬프트 복사를 제공한다. 보호를 해제하는 폴백은 없다.

## 테스트 및 게시 승인

기본 수정 범위는 **v020 src의 js/cjs/json과 incident-tests**이다. 문서/WPF/관리자 쓰기/운영 hotfix 등은 이 경로에서 수정하지 못한다. 원래 테스트·기준 사본을 변경하면 거절한다. 에이전트가 manifest를 임의 수정하지 못하며 앱이 `ready=false`인 app-release와 backend manifest의 해시를 변경 소스에 맞춰 결정적으로 생성하고 검토 diff에 포함한다.

필수: `tests/incident-tests/repro.test.cjs`가 기준 소스에서 실패하고 변경 소스에서 통과 → 기준에서 고정한 Node 9개 suite(최소132) → v017 판정 회귀(최소11) → 검증 후 재검사/해시 일치. 생성된 테스트도 신뢰하지 않고 **네트워크 차단 sandbox**에서 실행한다. loopback/임시 파일/의존성 문제로 고정 회귀가 실행되지 않으면 게시 후보가 되지 않는다. 오류명 일부만 정제하여 표시한다. WPF·브라우저 E2E·공식 규칙 의미·실제 운영 재현은 작업별 자동 필수 검사에 아직 포함되지 않는다. 녹색 결과만으로 올바른 판정/운영 적용이 입증되지 않는다.

GitHub 게시 승인은 정확한 작업 ID·기준 커밋/tree·계정·변경 파일/내용·diff·테스트·검토 해시에 묶인다. 승인 후 파일이 바뀌면 차단한다. gh는 다시 계정/쓰기 권한/기준 브랜치 이동 여부를 확인한다. **에이전트는 GitHub 인증·네트워크·Push/PR 권한을 받지 않는다.**

게시 어댑터는 GitHub Git database REST API로 tree/결정적 commit을 만들고 `codex/incident-<GUID>` ref를 생성한다. 이것이 작업 브랜치의 Commit/Push에 해당하며 git push/GCM 토큰 추출은 사용하지 않는다. Draft PR base는 **feature/riot-api-v0.2**이다. 기존 PR #1의 main 대상은 바꾸지 않는다. 작업 PR은 사람이 검토해 개발 브랜치에 통합하고, PR #1의 main 병합·운영 배포는 이후 별도 승인 사항이다. 자동 merge/force push/기존 브랜치 덮어쓰기/Azure 배포 API는 없다.

## 장애·재시작·비용

20분 CLI 제한, 취소 시 프로세스 트리 종료, 유한 출력 크기를 적용한다. 한 실행의 자동 재시도는 **0회**다. 실패/취소/미확정 같은 제보 revision+검토 내용은 기존 작업 ID를 재사용하고 inference를 다시 보내지 않는다. 실패 작업의 임의 재개는 미지원이며 새 근거/revision을 검토한 새 작업이 필요하다.

진행 중 앱이 종료되면 이력 조회에서 활동 잠금 없는 작업은 `uncertain`, 게시 중은 `publication-uncertain`으로 표시한다. CLI 작업을 자동 resume하지 않는다. ‘기존 PR 재조회’는 exact head/base/작업 marker/검토 해시·결정적 commit·비교된 파일 집합/blob을 검증한다. PR이 없고 동일 원격 ref/기준을 확인한 경우에만 review로 돌려놓아 **다시 승인받은 뒤** 게시를 이어간다. 같은 commit/tree/ref를 재사용하며 새 작업 ID/중복 PR을 자동 만들지 않는다. 이미 닫힌 작업 PR도 재조회하며 자동 재개설하지 않는다.

작업 이력/검토한 입력/결과/diff는 별도 **RealRepairs DPAPI** 저장소(사용자 ACL·purpose entropy)에 보관한다. ManualReports/IncidentAnalysis와 분리한다. 같은 Windows 사용자 업데이트에서 재사용한다. 보관 한도200건/항목4MiB이며 자동 삭제/백업/내보내기 UI는 없다. 프로필/DPAPI 키 유실과 같은 사용자/관리자 접근 위험은 남는다. plaintext 소스 작업 공간에도 사람이 넣은 비밀이 없어야 하며 자동 기록 보안의 완전성을 보장하지 않는다.

ChatGPT 로그인 방식은 계정의 Codex 이용 권한/사용량/조직 정책을 따른다. 무료·무제한 또는 추가 과금 없음을 보장하지 않는다. 별도 Platform API 키 과금 방식은 지원하지 않고 자동 전환하지 않는다. CLI가 보고한 input/output token만 별도 이력에 저장하며 정확한 금액/잔여 한도 API는 미연동이다. 기존 RiftAssist 서비스 API 비용과 합산하지 않는다. GitHub API 호출·Actions/저장소 플랜 제한과 장치 자원 사용량도 별개다.

## Windows10 실제 연동 검증 순서

개발자는 실제 Codex/작업 PR/Azure를 실행하지 않았다. 사용자가 다음을 각각 승인해 검증한다.

1. 합성 수동 제보를 새로 만들고 이름·운영 정보 없이 준비한다. 도구 상태를 확인한다. 미설치/미로그인 상태에서는 안내만 나오고 설치/로그인이 자동 시작되지 않는지 확인한다.
2. 실행 기능을 켜고 전송 미리보기를 **거절**해 외부 실행이 없는지 확인한다. 이후 안전한 합성 v020 오류와 재현 조건으로 다시 승인한다.
3. 소스 준비·격리 probe를 확인한다. 실패하면 설정/샌드박스를 점검하고 보호를 해제하지 않는다. 성공 시 실제 CLI JSONL 진행·완료/실패·토큰을 확인한다.
4. 취소/네트워크 단절/시간초과·앱 재시작 후 이력/미확정 표시·중복 실행 방지를 확인한다. Codex 완료만으로 PR 버튼이 허용되지 않고 재현/회귀와 범위 검사가 필요함을 확인한다.
5. 결과 diff/재현 전후·회귀/경고를 직접 검토한다. 실패하면 게시하지 않는다. 모델이 만든 재현 테스트가 실제 오류를 검증하는지 확인한다.
6. GitHub 게시 기능을 켜고 대상·계정·base가 맞는지 확인한다. **별도 게시 승인을 한 경우에만** 합성 작업 Draft PR을 만든다. 생성된 PR이 #1과 별개이고 base가 feature이며 merge되지 않았는지 확인한다.
7. 같은 작업에서 PR 재조회/앱 재시작을 해 branch/PR이 중복되지 않는지 확인한다. 응답 유실은 재조회로 먼저 처리한다. 새 패키지로 바꿔 기존 SSH/수동/작업 이력이 유지되는지 확인한다.

## 공식 자료·후속

2026-11-04 확인한 공식 문서 계약에 맞춰 구현했다. CLI가 변하면 버전/기능과 실제 격리 검사를 다시 검증해야 한다.

- [Non-interactive execution](https://developers.openai.com/codex/noninteractive/) — exec/JSONL/stdin
- [Authentication](https://developers.openai.com/codex/auth/) — ChatGPT와 API 키 구분
- [Permissions](https://learn.chatgpt.com/docs/permissions), [Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox), [developer commands](https://learn.chatgpt.com/docs/developer-commands)
- [Codex SDK](https://developers.openai.com/codex/sdk/), [App Server](https://developers.openai.com/codex/app-server/) — 이번 단일 작업에는 native CLI 채택; SDK/App Server/클라우드 thread 자동 조작은 미구현
- [GitHub Git database](https://docs.github.com/en/rest/git), [Draft pull requests](https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request)

다음 단계: 실제 Windows10 elevated sandbox/모델/루프백 테스트 호환성 검증, 공식 규칙 근거 연결, sandbox 검증 범위 확대/독립 보안 검토, 작업별 WPF/E2E·선택 테스트 정책, 수동 재시도/안전한 이력 보관·삭제 UI, CLI 기본 모델/토큰·한도 가시성, 닫힌 PR 상태 표시·새 기준 재검증 UX. 실제 오류 의미 검증/운영 hotfix·배포 승인과 Riot API 승인은 별개로 남긴다.
