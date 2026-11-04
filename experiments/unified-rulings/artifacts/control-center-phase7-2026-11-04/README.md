# RiftAssist Control Center 7차 검증 기록

2026-11-04 Asia/Seoul. `feature/riot-api-v0.2` / 기존 Draft PR #1. [사용법·Windows10 준비·인증/비용·실제/모의 경계](../../control-center/PHASE7.md).

## 변경

- 실제 native Codex CLI noninteractive adapter, ChatGPT CLI 인증 상태 확인, UTF-8 stdin·JSONL·취소/시간초과/유한 출력·프로세스 트리 종료를 구현했다. 임의 모델명/Platform API 키 fallback은 없다. raw stderr/credential 환경을 출력·상속하지 않는다.
- 고정 GitHub 개발 브랜치에서 허용 source blob만 검증해 독립 소스 사본을 준비한다. 전체 clone/history·runtime DB·knowledge/private/키·결과·로컬 저장소·운영 사용자 기록을 가져오지 않는다. 별도 bare Git broker로 실제 diff를 만든다. 원래 개발 저장소가 없는 Windows PC도 준비할 수 있다.
- Windows elevated sandbox/read-deny·network-deny·narrow write profile, 밖의 공개 canary 읽기/쓰기/LAN 차단·안의 허용/거부 쓰기 probe·CLI 해시 ticket을 구현했다. 최소 버전/Windows 빌드/인증/MCP/격리를 검증하지 못하면 실행을 막는다. Windows10은 upstream best effort이고 실제 기기 검증이 필요하다.
- 수정 전 실패/수정 후 성공 재현, 기준에서 고정한 Node 회귀9 suite와 v017 호환성, 범위/비밀 검사, 앱이 생성하는 ready=false manifest 해시, 테스트 이후 변경 탐지를 게시 조건으로 삼았다. 생성된 테스트도 sandbox에서 실행한다.
- gh REST 실제 게시 adapter는 승인된 정확한 변경만 결정적 commit/tree/ref로 게시하고 작업별 `codex/incident-*` Draft PR → `feature/riot-api-v0.2`를 생성한다. 계정/권한·base 이동·remote commit/files·기존 PR marker/검토 해시를 검증한다. Agent는 GitHub 자격증명/네트워크/게시 권한을 받지 않는다.
- 실행/게시 각각 기본 비활성, 전송 내용/정확한 diff 별도 승인, 재시작 미확정·활동 잠금·중복 inference/게시 방지·read-only 재조회·거절·별도 RealRepairs DPAPI 이력을 구현했다. 실패 쓰기는 자동 재전송하지 않는다.
- WPF 네이티브 실제 작업 창, 경로/도구/로그인 확인·설정·진행·취소·diff/테스트/토큰·PR 링크/재조회·이력을 추가했다. 기존6차 prompt 복사/모의/로컬 분석과 SSH 자동인증/관리자 조회·수동/카드/번역 기능을 유지한다. ZIP 최상위 EXE·아이콘·asInvoker를 유지한다.

## 로컬 검증

| 검사 | 결과 |
| --- | --- |
| C# 기존196 + 7차56 | 252/252 |
| Node 회귀 | 132/132 |
| PC/모바일 브라우저 | 13/13 |
| v017 판정 호환 | 11/11 |
| WPF/Windows smoke 대상 교차 빌드 | 오류·경고0 |

합계408/408. 실제 Git diff/허용 전체 소스 사본/manifest 검증·합성 Node 전후, 소스 누락/해시 불일치/권한/base 이동·중복 PR·응답 유실·승인 해시·암호화 CAS/재시작을 포함한다. 합성 loopback SSH만 사용했다. 실제 Azure 접속·실제 Codex 추론/수정 PR 게시·유료 API 호출은 0회다. Windows용 실제 어댑터의 exec/이벤트/test 명령 계약은 Windows CI에서 모의 runner로 추가 검사한다.

최종 실행 코드 **fadeced91221a5c060c97d2508e8a1fa25fb0fd6**의 [Control Center CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41764033800)와 [규칙 회귀 CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41764033754)가 성공했다. 회사 Windows10 물리 기기·실제 CLI/gh 연결은 사용자 후속 검증이다.

## 보존·한계

main a69dff6 대비 v017 65파일 불변, 공유 active/공개 자료·추적 SQLite3개 포함8개 해시 불변. v020 Node107개/Control Center backend83개·ready=false 유지. 운영 레코드/키는 읽지 않았으며 공개 자료와 캐시는 내용 출력 없이 해시만 비교했다. 기존 AGENTS.md 미커밋 변경은 보존/커밋 제외한다. staged 경로/비밀 패턴 검사를 별도로 기록하며 전체 역사/모든 비밀 부재 보장은 아니다.

샌드박스 probe는 모든 취약점의 증명이 아니며 회사 Windows10에서 실제 backend/네트워크/루프백 테스트 호환성을 확인해야 한다. Codex 의미 정확성·공식 규칙 연결·작업별 WPF/E2E·이력 삭제/보관 UI·기본 모델/한도 API는 후속이다. 비용은 ChatGPT 플랜/CLI 이용량으로 기존 서비스 API와 구분하고 reported token만 표시하며 정확 금액/잔여량은 미산정이다. 실제 Codex/GitHub 개별 실행은 각각 별도 승인한다. main 병합·Azure/운영 코드/DB 변경·배포는 하지 않는다.

문서는 Markdown 원본 그대로 보관한다. 이 클라우드에서는 사용자 바탕화면을 직접 열 수 없어 `바탕화면/RiftAssist`에 저장했다고 주장하지 않는다.

## 최종 Windows 패키지

**[7차 Windows 실행 패키지 다운로드](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41764033800/artifacts/13291798648)** — `RiftAssist-ControlCenter-v0.2.0-win-x64.zip`, 101,786,387바이트(약102MB), GitHub 권한 필요, 만료 UTC2027-02-02. 전체를 새 폴더에 풀어 최상위 EXE를 실행한다. 기존 LocalAppData 설정/DPAPI/수동 제보는 그대로 유지한다.

SHA256 `7c6d066736e051cc08e05c1d1874853320ab8e2acd4b5460011f3a3fedd56368`.

- Windows Server2025 소스 C# **256/256**, 추출 패키지 C# **255/255**, Ubuntu24.04 C# **252/252** 통과. Windows 추가 계약5건·실제 DPAPI와 OS별 기존 차이로 수가 다르며, 패키지 검사는 소스 저장소의 전체 export 검사를 제외해1건 적다.
- native WPF는 실제 실행·게시 활성화 분리, 전송 미리보기 승인/거절, 모의 진행/검증/diff, 게시 별도 승인/PR 재조회, 제보 수정 후 재열기에서 이전 작업 게시 차단, DPAPI 재열기, 기존6차 UI를 검사했다. **binding 오류0**. 테스트의 CLI/GitHub 종단은 모의 의존성이다.
- 실제 Git 프로세스/소스 사본/diff·manifest LF 결정성, 생성 재현 전후·고정 테스트 overlay, Windows Git 객체의 소유 임시 파일 정리 검사를 통과했다. 기존 운영 파일은 정리 대상이 아니다.
- ZIP 최상위 EXE/runtime/backend·아이콘, 추출한 실제 EXE 실행/정상 종료·창/작업 표시줄/파일 탐색기 아이콘을 확인했다. 설정 없는 시작의 자식 프로세스0개. SSH 자동 인증은 별도 모의 기존 회귀로 확인했다. EXE는 **NotSigned·asInvoker**이며 보호 해제/권한 상승을 추가하지 않았다.
- 실제 Codex 추론/작업별 GitHub PR 게시·Azure 접속·유료 API 호출은 **0회**다. native CLI 옵션/계정/elevated sandbox는 사용자의 Windows10에서 별도 검증해야 한다. 생성된 테스트와 모델 주장은 관리자 검토가 필요하다.

[windows-ci.json](windows-ci.json), [CLI 계약 조사](codex-contract-research.json), [후속 수정 비밀 검사](secret-scan-fixes.json)에 증거와 한계를 보존했다. 이 패키지는 위 실행 코드 기준이며 이후 문서·증거 커밋은 실행 코드/백엔드를 변경하지 않는다. 통합 Draft PR #1을 유지하고 실제 수정 작업 PR은 이번에 만들지 않았다.
