# Control Center 6차 검증 보고서

2026-11-02 · 기반ed561ea3353a9234cee47417f58ca8f193c78c3e · feature/riot-api-v0.2 · 기존 Draft PR #1

[사용법·실제 구현/미구현 경계·Codex 인증/비용·활성화 조건](../../control-center/PHASE6.md).

## 구현과 한계

- 운영 API/개발 API/로컬 수동 제보를 허용한 필드로 투영하고 수동 revision·기억 요약과 API 내용/상태/updated 해시 revision을 유지합니다. 앱 버전 미기록은 추정하지 않습니다. 각 실행/복사 전 최신 revision을 재확인합니다.
- ‘AI로 오류 분석’은 현재 로컬 예비 분석입니다. 기존 검증된 retrieval/cards/answer-policy 모듈을 외부 호출 없이 실행해 빈 공식 인덱스·검색 메타데이터/구조를 확인합니다. 관찰/추정·원인 분류 후보·판정 보류·코드 후보·신뢰도/미확인·v017/v020 개선 구분을 표시합니다. 실제 LLM 분석/현행 공식 자료 연결·실제 오류 재현/수정은 미구현이며 정답을 만들어내지 않습니다.
- 미리보기/수정·알려진 비밀 제거·내용/대상 해시 승인, 별도 DPAPI 분석/작업 이력, 암호화 CAS·잠금·cache·손상 보존을 추가했습니다. 원문/프롬프트 평문 임시 파일이나 자동 외부 전송은 없습니다. 자동 제거는 완전하지 않으며 직접 개인정보 검토가 필요합니다.
- 실제 사용 가능한 Codex 경로는 완성 프롬프트의 명시적 승인 후 클립보드 복사입니다. 실제 CLI/SDK/App Server 실행은 미구현/차단하며 공식 문서로 CLI 인증 재사용·과금/제약을 조사했습니다. 브라우저 로그인과 CLI 인증을 혼동하지 않습니다. API 키나 auth.json을 읽거나 복사하지 않습니다.
- Codex CLI stdin/JSONL 이벤트 계약, 별도lane/작업ID·상태/파일/테스트/diff/위험·정확한 결과에 바인딩한 게시 승인 경계를 준비했습니다. 실제 GitHub 게시는 비활성입니다. 복사 성공은 외부 실행 완료가 아니고 외부 채팅 상태/비용은 자동 추적하지 않습니다.
- 모의 작업은 앱 소유 GUID 폴더의 고정 합성 JS만 수정하고 실제 Node로 재현/회귀2건을 전후 실행합니다. diff/PR 후보도 합성으로 표시하며 실제 제보 해결·프로덕션 회귀 통과를 주장하지 않습니다. 오류/취소/단절/미확정 작업은 자동 재시도하지 않습니다. 활동 잠금으로 다른 창의 진행 중 작업을 재시작 미확정 상태와 구분합니다.
- 기존 자동 SSH/관리자·제보/카드/번역·합성 관리자·수동 제보·아이콘·ZIP 루트 EXE를 유지합니다. analysis-local/codex-mock/codex-manual 비용을 서비스 API 집계와 분리하며 외부0회, 금액/토큰은 미산정입니다.

## 로컬 검증

| 검사 | 결과 |
| --- | --- |
| C# 기존177 + 신규19 | 196/196 |
| Node 회귀 | 132/132 |
| PC/모바일 웹 | 13/13 |
| v0.1.7 호환성 | 11/11 |
| Windows WPF 교차 빌드 | 경고/오류0 |

총352/352. 합성 제보·모의 AI/Codex 응답·임시 AES 보호 구현으로 projection/비밀 제거·동의 대상/내용·offline 기존 모듈·캐시/암호문·CAS/잠금/손상·실제 합성 Node 전후 테스트·lane분리·실패/취소/단절·재시작 미확정/활동 잠금·복사 작업ID 재사용·JSONL 완료와 검증 구분·게시 차단을 검사합니다. 실제 v017/서비스 회귀도 유지합니다. 모든 SSH는 합성 loopback입니다.

Windows는 기존 OS별 차이와 analysis symlink 대신 실제 analysis DPAPI 재열기/수동 제보 entropy 격리를 실행하므로 C#195개를 예상합니다. native WPF에는 미리보기 승인/거절·비밀 제거·복사·합성 작업 결과/이력·stale revision 거절을 추가했습니다. Linux 교차 빌드를 Windows 실행 통과라고 주장하지 않습니다. 아래 Windows CI에서 실제 실행을 확인했습니다.

## 보존·후속

main a69dff6 대비 v0.1.7 65파일 불변. 공유 active/manifest/cards/rules/judge·추적 SQLite3개 합계8해시 불변. v0.2.0 Node107개/payload83개·ready=false 유지. 공개 자료/캐시 해시만 비교하며 운영 DB/키·실제 사용자 기록은 접근하지 않았습니다. AGENTS.md 기존 미커밋 변경은 보존/제외합니다.

실제 AI/Codex/유료 API·Azure 접속/제어/설치/배포·main 병합·런타임 자동 GitHub 반영은 없습니다. 개발 코드만 기존 feature 브랜치/PR에 반영합니다. 실제 CLI 프로세스/격리 복제·공식 근거 연결·실제 오류 재현/회귀·외부 응답 검증·수동 클라우드 결과 가져오기·실제 GitHub 게시 어댑터는 후속입니다. 실제 외부 실행·비용·전송과 GitHub 반영/배포는 각각 별도 승인이 필요합니다. 실제 Windows10 기기 확인은 사용자 후속 단계입니다.

## Windows 실행 검증과 새 패키지

헤더 비밀 제거를 보강한 최종 실행 코드 **65b619dd8f7e0fc7c08494975700222bd2262b84**의 [Control Center CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41414048257)와 [규칙 회귀 CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41414048209)가 성공했습니다.

- Windows Server2025 C# 소스/추출 패키지 각각 **195/195**, Ubuntu24.04 **196/196** 통과.
- native WPF: 분석 미리보기 승인/거절·비밀 제거·승인 후 모의 클립보드 복사·수정/테스트 상태·분석/수정 DPAPI 이력 재열기·stale revision 차단을 확인했습니다. 기존 자동 SSH/DPAPI/제보/카드·수동 제보 검사를 유지하며 **binding 오류0**입니다. 실제 사용자 클립보드는 사용하지 않았습니다.
- 모의 수정의 실제 Node 재현/회귀 전후 실행은 C# 소스/패키지 검사에 포함합니다. 실제 RiftAssist 코드/오류를 수정하거나 프로덕션 회귀를 실행한 결과가 아닙니다.
- ZIP 루트 EXE·runtime/backend·아이콘, 추출 EXE 직접 실행·정상 종료를 확인했습니다. 설정 없는 기본 시작은 자동 자식0개이며 자동 SSH는 별도 모의 WPF 시험입니다. EXE는 NotSigned·asInvoker/uiAccess=false입니다.

**[새 Windows 실행 패키지 다운로드](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41414048257/artifacts/13126617448)** — `RiftAssist-ControlCenter-v0.2.0-win-x64.zip`, 101,710,558바이트(약102MB), GitHub 권한 필요. 전체를 새 폴더에 풀어 최상위 EXE를 실행하고 기존 LocalAppData 설정/수동 제보 저장소는 유지하세요. SHA256 `4e667ead22593910d523ebcc2e7cae08299c4057ed3d80f594bd392bfb94a59b`, 만료 UTC2027-01-31.

[windows-ci.json](windows-ci.json)에 검사·패키지와 미구현 경계를 보존했습니다. 이후 문서/증거 커밋은 실행 코드를 변경하지 않습니다. 실제 Windows10 기기/운영 읽기는 사용자 후속 검증이며 실제 외부 AI/Codex·GitHub 게시/배포 활성화는 별도 구현·승인 단계입니다. 문서는 Markdown 원본으로 보존하며 클라우드에서 사용자 바탕화면에 직접 저장하지 않았습니다.
