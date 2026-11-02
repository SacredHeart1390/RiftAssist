# Control Center 4차 검증 — 2026-11-02

기반 ea0b5c16b16ac25bfb5310f83e7e631783a4e517, feature/riot-api-v0.2, 기존 Draft PR #1을 유지합니다. 사용자로부터 3차 실제 Windows 10 → Azure 상태 조회 성공을 확인했습니다. **이번 4차 개발에서는 실제 Azure/운영 관리자·사용자 자료를 조회하지 않았습니다.**

[구현 구조·API 조사·키/개인정보 처리·추가 승인·설치 위험·실행 안내](../../control-center/PHASE4.md).

## 구현

- 기존 v0.1.7 관리자 로그인/쿠키·Host/Origin 검사를 유지하고, SSH -W 고정 원격 127.0.0.1:3100 스트림으로 연결합니다. 로컬 수신 포트/인터넷 공개 포트/원격 셸·설치·서비스 실행 없음.
- 기존 로그인 POST와 상태/제보 GET만 허용합니다. 실제 AI 일별 호출·토큰·한도·활성 여부, 관리자 앱 상태/오류의 고정 분류, 제보 목록/내용·연결 질문/답변·처리 이력을 WPF에서 조회하는 기능을 준비했습니다. 일반 조회 확인 팝업 없음.
- 키/쿠키·제보는 메모리에서만 사용하고 설정/명령 인수/로그/Git에 저장하지 않습니다. 모드/프로필 변경·실패·연결 해제·로컬 만료 시 자료를 지웁니다. 운영 제보 내보내기·변경·운영 AI/백업/서비스 제어는 차단합니다.
- 기존 관리자 키는 서버에서 전체 관리자 권한을 가지며 이번 읽기 제한은 클라이언트 허용 목록입니다. 전용 서버 read scope/자격증명은 미구현입니다.
- 실행 아티팩트를 단일 패키지 디렉터리 내용만 업로드해 ZIP 루트에 EXE가 나타납니다. 보고서는 별도 아티팩트로 분리합니다. includeBaseDirectory=false ZIP 검사/새 폴더 추출본의 실행·무결성 검사를 CI에 추가했습니다.
- v0.1.7 rel=icon의 원본 public/icon.svg를 수정하지 않고 16/24/32/48/64/128/256px ICO로 변환했습니다. 출처/원본·변환 해시와 디렉터리 검증을 추가하고 같은 아이콘을 EXE·WPF 창/작업표시줄에 적용했습니다.

## 로컬 검사

| 검사 | 결과 |
| --- | --- |
| C# 기존 103 + 새 관리자/SSH/보안 17 | 120/120 |
| Node 기존 회귀 | 132/132 |
| PC/모바일 웹 | 13/13 |
| 수정하지 않은 v0.1.7 호환성 | 11/11 |
| Windows 대상 WPF 교차 빌드 | 경고/오류 0 |
| 아이콘 원본/ICO 해시·7개 프레임 | 통과 |

총 **276/276**. Linux는 Debian13이며 Ubuntu/Windows native 검사는 Push 후 CI에 기록합니다. Windows는 Linux POSIX3개 대신 ProgramData 누락/복원1개를 실행하여 C# 118개입니다. C# 신규17개 중2개는 실제 OpenSSH -W → 127.0.0.1 합성 관리자 및 forwarding 거절 검사입니다. 실제 관리자 라우터는 원본 v0.1.7 manager.js를 그대로 읽고 VM의 DB/키/수집기·자식/타이머는 합성으로 대체합니다. 실제 데이터·암호화 키·운영 DB·Riot/OpenAI API를 사용하지 않습니다.

## 보존·남은 승인

main a69dff6 대비 v0.1.7 65파일 불변. 공유 active/manifest/cards/rules/judge·추적 SQLite3개 합계8 SHA256 불변. v0.2.0 Node107개·payload83개 및 ready=false 유지. 기존 AGENTS.md 미커밋 변경은 보존/커밋 제외합니다. 공개 자료/캐시는 해시만 비교하며 운영 DB/키·사용자 기록은 열거나 변경하지 않았습니다.

실제 접속에는 운영 열람 권한/전체 관리자 키 사용 승인, 기존 관리자 loopback3100·운영 DATA_ROOT·SSH direct-tcpip 허용 확인이 필요합니다. 기존 관리자가 없으면 자동으로 시작하지 않습니다. **기존 manager.js를 새로 시작하면 구형 수집기를 자동 기동하므로 별도 위험 검토/승인이 필요합니다.** 실제 서버 설치/설정 변경·기동·재시작·배포는 실행하지 않았습니다.

Windows 10 회사 PC의 새 패키지/Explorer·작업표시줄 캐시/DPI 및 실제 운영 관리자 열람은 사용자 측 별도 확인입니다. CI의 native Windows 성공과 실제 운영 관리자 연동 성공을 동일시하지 않습니다.

## Windows 패키지

실행 코드 **af08e1c1716a3b771e404c1ce429f0a633823fe5**의 [Windows/Ubuntu CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41381921364)와 [회귀 CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41381921478)가 모두 성공했습니다.

- Windows Server 2025 소스/추출 패키지 C# 각각 **118/118**. 기존 검토/관리 기능과 새 관리자 인증·SSH -W·실패 경로 포함.
- native WPF 7개 탭·관리자 조회/한글 제보·만료 정리·쓰기 차단·ICO 프레임/창 아이콘: **binding 오류0**.
- ZIP 루트 EXE·중첩 EXE 없음·runtime/backend 존재를 검사하고 새 폴더에 푼 패키지에서 검사했습니다. EXE의 shell 아이콘 리소스, WM_GETICON 큰/작은 창·작업표시줄 아이콘 핸들, 실제 EXE 시작/정상 종료·자동 자식 **0개**를 확인했습니다.
- Ubuntu 24.04 **120/120**. 기존 v0.1.7 HTTP 라우터는 합성 모듈과 격리 루프백에 연결해 인증/조회만 검사하며 실제 수집기를 실행하지 않습니다.

**[새 Windows 실행 패키지 다운로드](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41381921364/artifacts/13113727371)** — RiftAssist-ControlCenter-v0.2.0-win-x64.zip, 약102MB, GitHub 저장소 접근 권한 필요. 전체 파일을 풀면 최상위에 RiftAssist.ControlCenter.exe가 있습니다. SHA256 a25d9a952618aaf93f620ae1f8e21e3ac8332606838677e0b55fe69b1d3018e6, artifact 만료 UTC 2027-01-31. 검증 보고서는 별도 [validation artifact](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41381921364/artifacts/13114170489)입니다.

[windows-ci.json](windows-ci.json)에 기계 판독 집계를 기록했습니다. 패키지 원본은 위 실행 코드 SHA이며 이후 증거/문서만 추가한 커밋과 실행 코드는 동일합니다. Windows 10 실제 기기/Explorer·작업표시줄 캐시·DPI와 실제 운영 관리자 API 조회는 개발자가 시험하지 않았습니다. 사용자의 3차 실제 Azure 상태 조회 성공과 이번 4차 합성 검증을 구분합니다.
