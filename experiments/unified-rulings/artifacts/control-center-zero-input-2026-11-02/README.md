# SSH 관리자 자동 인증 검증

2026-11-02 · 기반 47ec323755a44f53cf28ff64632c24259fd0ff11 · feature/riot-api-v0.2 · 기존 Draft PR #1

[실행 방법·고정 파일·재시도·DPAPI 호환·보안 한계](../../control-center/ZERO-INPUT.md).

저장된 SSH 설정만으로 앱 시작 → 상태 조회 → 고정 manager.key 읽기 → 기존 관리자 로그인 → AI 집계/한도/제보 목록을 자동 실행합니다. 자동 수집 키는 DPAPI에 쓰지 않으며 로그인 직후 바이트를 지웁니다. 키/쿠키/개인키 내용·실제 사용자 자료를 파일/로그/인수/설정/Git에 남기지 않습니다. 고정 경로·스크립트·인수, 크기/형식 제한과 호스트 키 검증을 적용합니다. 운영 변경 API는 계속 차단합니다.

세션 만료 재인증, 최대2회/간격5초/시도60초, 재시도 소진 후 중단·연결 복구, 취소/프로필 변경 시 오래된 응답 버리기를 구현했습니다. 기존 DPAPI와 카드/번역 검토·합성 관리자·백업·감사·제보 상세 객체 형식 수정은 유지합니다. 전체 관리자 키를 클라이언트에서 읽기 제한한 구조이며 서버 read scope는 후속 과제입니다. .NET 문자열/동일 사용자 권한·메모리 노출의 한계도 안내합니다.

## 로컬 검사

| 검사 | 결과 |
| --- | --- |
| C# 기존135 + 자동 인증20 | 155/155 |
| Node 회귀 | 132/132 |
| PC/모바일 웹 | 13/13 |
| 수정하지 않은 v0.1.7 호환성 | 11/11 |
| Windows WPF 교차 빌드 | 경고/오류0 |

총311/311. 합성 키/제보·임시 로컬 파일·127.0.0.1 SSH만 사용합니다. 고정 운영 경로를 실제로 읽지 않았으며 로컬 셸 검사는 테스트 전용 경로를 사용하고 그 변경 명령이 생산 정책에서 거절됨도 검사합니다. 실제 OpenSSH의 고정 키 응답 → 변경 없는 v0.1.7 합성 라우터 로그인/상태/제보 상세를 확인했습니다. Linux에서 Windows GUI 실행을 통과했다고 주장하지 않습니다.

Windows CI는 저장된 SSH만으로 첫 실행/재실행·DPAPI 접근 없음·세션 만료·SSH 실패·관리자 미실행·복구 버튼·제보 상세·운영 변경 차단을 native WPF 모의 환경에서 검사하도록 추가했습니다. Windows는 Linux POSIX5개 대신 ProgramData1+DPAPI3개여서 C#154개를 예상합니다. 아래 Windows CI 결과에서 실제 실행을 확인했습니다.

## 보존·운영 제한

main a69dff6 대비 v0.1.7 65파일 불변. 공유 active/manifest/cards/rules/judge·추적 SQLite3개 합계8해시 불변. v0.2.0 Node107개/payload83개와 ready=false 유지. 공개 자료/캐시는 보존 해시만 비교하며 운영 DB/암호화 키·사용자 기록은 접근하지 않았습니다. 기존 AGENTS.md 미커밋 변경은 보존/커밋 제외합니다. 실제 Azure 조회·서버 설치/설정 변경·시작/중지/재시작·배포·main 병합·유료 API 호출은 없습니다.

Windows10 실기기와 실제 Azure 자동 연결은 사용자 후속 확인 사항입니다. 서버 관리자가 미실행이면 자동 시작하지 않습니다. 문서는 Markdown 원본 그대로 보존하며 클라우드에서 사용자 바탕화면에 직접 저장할 수 없습니다.

## Windows CI·새 실행 패키지

실행 코드 **6632479ccb7c4b35c6153687441fad16a4bebe1e**의 [Control Center CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41400403570)와 [규칙 회귀 CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41400403578)가 성공했습니다.

- Windows Server2025 C# 소스/추출 패키지 각각 **154/154**, Ubuntu24.04 **155/155** 통과.
- 실제 WPF 모의 실행: 저장된 SSH만으로 첫 실행/재실행, 키 입력/DPAPI 접근 없음, 세션 만료 재인증, SSH 실패 시 앱 유지, 관리자 미실행 시2회 후 중단, 복구 버튼, 제보 상세와 운영 변경 차단을 통과했습니다. 기존 DPAPI/카드/관리자 검사를 포함해 binding 오류0입니다.
- ZIP 루트 EXE·runtime/backend, 아이콘 리소스/창 핸들, 추출 EXE 직접 실행·정상 종료를 통과했습니다. 저장된 SSH가 없는 CI 기본 실행에서 자동 자식0개를 확인했습니다. 저장된 SSH가 있는 자동 연결은 별도 WPF 모의 시험으로 검증했습니다.

**[새 Windows 실행 패키지 다운로드](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41400403570/artifacts/13120938158)** — `RiftAssist-ControlCenter-v0.2.0-win-x64.zip`, 101,639,489바이트(약102MB), GitHub 권한 필요. 전체를 새 폴더에 풀어 최상위 EXE를 실행하세요. 기존 Windows 사용자 LocalAppData 설정은 유지하세요. SHA256 `69cdbb3b758696f91d2b5838de96e2a55f521586323a65f5a3f45a7f18e0f6f6`, 만료 UTC2027-01-31.

[windows-ci.json](windows-ci.json)에 집계·패키지 정보·한계를 보존했습니다. 이후 문서/증거 정리 커밋은 실행 코드를 변경하지 않습니다. 실제 Windows10·실제 Azure 자동 인증/운영 자료 조회는 사용자 PC에서 별도로 확인해야 합니다. 서버가 이미 실행 중이어야 하며 개발/CI가 운영에 접속하거나 서버를 변경한 결과가 아닙니다.
