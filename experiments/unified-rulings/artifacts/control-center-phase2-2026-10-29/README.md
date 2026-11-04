# RiftAssist Control Center 2차 구현·검증 보고서

2026-10-29 · 시작 커밋 `1440e8d` · `feature/riot-api-v0.2` · 기존 Draft PR #1 유지

## 구현 결과

v0.1.7 운영 소스의 관리 기능·인증·서비스/자료 전환 구조를 읽고 [전체 기능 목록과 통합/미구현 항목](../../control-center/PHASE2.md)에 정리했다. 실제 Azure 서버의 주소/계정/키/unit 설정은 읽거나 추측하지 않았다.

WPF 운영 7개 탭과 기존 카드 검토 UI를 함께 제공한다. 개발 관리자는 별도 GUID 루트에서 합성 제보·연결 질문/답변·사용량과 실제 기존 관리자 API를 사용한다. 로그인 키/쿠키·Origin/loopback 확인을 유지한다. 임의 loopback 포트의 소유 Node 자식이 준비됐다는 IPC 확인 뒤에만 개발 키를 전달한다. root 배타 잠금으로 중복 manager를 DB 열기 전에 차단한다. 카드/operations scope를 분리하고 HMAC·UTF-8·nonce 계약을 재사용했다.

개발 앱 시작/중지/재시작, AI/한도, 제보 상세/상태/한글 메모·JSON 내보내기, DB/키 포함 개발 백업, 준비된 합성 앱 버전 적용/복귀, 자료 목록/기존 전환 정책 확인, 개발 작업 journal과 상태 기록을 추가했다. 사유·확인을 요구하고 불명확한 쓰기/중복 작업/잔류 잠금을 자동 재시도·탈취하지 않는다. 기존 외부 재수집 API 거절과 카드 승인 우회 방지를 유지한다.

Azure는 Windows 시스템 OpenSSH의 **고정 읽기 전용 조회 구조만** 제공한다. SSH host/user/port와 키·known_hosts 경로/HTTPS origin 6개 메타데이터만 로컬 저장한다. 키 내용은 저장/복사하지 않는다. StrictHostKeyChecking=yes, BatchMode, 사용자 config 미상속, 포워딩/로컬 명령 차단을 고정한다. 별도 승인과 일회 수동 확인 없이는 runner를 호출하지 않는다. CPU/RAM/디스크/uptime/systemd ActiveState·앱/HTTPS 응답 코드만 읽는다. 원시 stderr는 메모리에서 오류 분류에만 쓰고 HTTP body와 함께 표시·저장하지 않는다. 운영 DB/로그/키는 읽지 않는다. 실패/취소·시간초과·이전 값·다른 프로필의 값 재사용 방지를 처리한다.

**실제 Azure/SSH 연결·Riot/OpenAI 호출은 0건이다.** 운영 제어·실제 제보/AI/백업/로그·Codex/GitHub 배포는 구현하지 않았다. Windows 10 실기기·실제 OpenSSH 인증/호스트 키/HTTPS 경로·원격 네트워크 검증과 서명 설치본은 후속 작업이다. 자세한 제한과 설정은 [2차 안내](../../control-center/PHASE2.md), [Windows 체크리스트](../../control-center/WINDOWS-VALIDATION.md)를 확인한다.

## 로컬 검사

| 대상 | 결과 | 증거 |
| --- | --- | --- |
| Node 회귀·정책·관리자/카드 권한·잠금·인증 | 132/132 통과 | [로그](node-tests.tap) |
| PC/모바일 웹 E2E | 13/13 통과 | [로그](e2e-tests.tap) |
| 변경하지 않은 v0.1.7 호환성 | 11/11 통과 | [로그](legacy-tests.log) |
| C# 기존 검토 30 + SSH/개발 관리자 33 | 63/63 통과 | [JSON](dotnet-tests.json), [로그](dotnet-tests.log) |
| WPF 앱·카드/운영 화면 검사 도구 교차 빌드 | 오류/경고 0 | [로그](wpf-cross-build.log) |

합계 **219/219**, 실패/취소/skip 0. Node 24.19.0, .NET SDK 10.0.403/런타임 10.0.14, Chromium 격리 프로필을 사용했다. C# SSH 검사는 모의 runner이며 실제 ssh.exe를 실행하지 않았다. 개발 API 검사는 임시 루트의 합성 데이터만 사용했고 백업 내용/인증 키를 출력하지 않았다. 설정 JSON의 파생 URL 필드가 저장되는 문제를 검사로 찾아 6개 메타데이터만 저장하도록 수정했다. 웹/legacy 결과는 해당 코드에 변경이 없는 동일 작업의 회귀 기록이다.

앱 코드 `2127b79`의 [Windows Actions](https://github.com/SacredHeart1390/RiftAssist/actions/runs/40835470491)가 **성공**했다. Windows Server 2025 runner에서 실제 WPF 7개 탭·기존 카드 비교를 로드했고 binding 오류는 0건이었다. 소스·포터블 패키지 C# 검사가 각각 63/63 통과했다. **설치 패키지 exe를 직접 실행해 기본 창·자동 Node/SSH/브라우저 자식 0개·정상 종료**까지 확인했다. [OS/로그 발췌/아티팩트 집계](windows-ci.json)를 보존한다. [새 Windows 실행 패키지](https://github.com/SacredHeart1390/RiftAssist/actions/runs/40835470491/artifacts/12879554678)는 약 102MB이며 GitHub 접근 권한이 필요하고 만료될 수 있다. 전체 파일을 풀고 RiftAssist.ControlCenter.exe를 실행한다. 최신 브랜치 상태는 기존 PR #1에서 확인한다. Windows runner 성공도 Windows 10 실기기·실제 Azure SSH 접속 검증을 대신하지 않는다.

## 보존과 남은 작업

[보존 집계](preservation.json)와 [읽기 전용 검사기](verify-preservation.py): main 대비 v0.1.7 65개 파일 변경 0, 공유 active/활성 manifest·카드·규칙·저지/추적 SQLite 3개 합계 8개 해시 불변. v0.2.0 소스 해시 107개와 CC Node 번들 83개를 확인했으며 `ready=false`다. 기존 AGENTS.md 미커밋 변경은 그대로 남기고 이번 커밋에서 제외한다. source SQLite 추적 제외/삭제·운영 키/DB/사용자 기록 접근·기존 카드 교체는 실행하지 않았다.

커밋 전 선택 파일의 경로·DB 형식·토큰/개인키/자격증명 패턴 검사에서 검출 0건이었다. [집계 파일 추가 전 41개 검사](secret-scan.json)를 보존하고 집계 자체를 포함한 최종 42개도 재검사한다. 이는 전체 이력이나 모든 비밀 부재를 보장하는 검사는 아니다. bin/obj/runtime·개발 DB/키/백업/로컬 SSH 설정은 포함하지 않는다.

실제 접속은 별도 승인 후 운영자가 주소·계정·known_hosts fingerprint·Windows 키/agent와 네트워크를 준비하고 서버의 도구·riftassist.service·기본 3001/health 계약을 검증해야 한다. actual admin 권한/명령 broker·원격 조회·백업/복구·감사 보관·서명/ACL/DPAPI, 독립 질문 목록·운영 로그, 상세 UI/TXT·요약 내보내기 일부는 미구현이다. 재시작은 개발 stop/start 조합으로 원자적이지 않다. 개발 백업은 개발 키를 포함하며 외부 반출 금지다. 잔류 잠금/불명확한 작업은 수동 점검해야 한다.

main 병합·자동 병합·Azure 수정/재시작/배포·운영 DB/키/활성 카드 변경·실제 유료 호출을 하지 않는다. 실제 접속 승인이나 테스트 성공만으로 운영 변경을 활성화하지 않는다. 문서는 일반 Markdown으로 제공하며 새 문서 압축 묶음은 만들지 않는다.
