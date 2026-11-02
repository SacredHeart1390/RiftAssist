# Control Center 3차 SSH 조회 수정 검증 — 2026-11-02

기존 3차 기반 `ddd93421e35eb41559525ffe832bdc1433518ad3`, `feature/riot-api-v0.2`, Draft PR #1을 유지합니다. 기존 미커밋 AGENTS.md를 보존/제외합니다. 실제 Azure 서버에는 접속하지 않았습니다.

분석·수동 Windows 시험 방법: [SSH-TROUBLESHOOTING.md](../../control-center/SSH-TROUBLESHOOTING.md).

Windows CI에서 ProgramData 누락으로 ssh.exe가 접속 전 종료 255/빈 stderr가 되는 결함을 발견했습니다. Windows OpenSSH 초기화 소스의 필수 조건과 일치하며 ProgramData를 필요한 환경에 복원했습니다. 회사 PC에서 동일 수정으로 해결되는지는 사용자 수동 확인이 필요합니다. 재현한 원격 비정상 종료·stdin 조기 종료·로컬 실행 예외의 잘못된 `client-ssh-disconnected` 분류를 수정하고 안전한 진단 항목을 추가했습니다. `sh -s`는 유지하며 필수 도구/자료를 확인하고 optional HTTP/systemd 실패는 경고로 분리합니다. 개인키/원시 stderr를 로그에 기록하지 않습니다.

## 로컬 검증

| 검사 | 결과 |
| --- | --- |
| C# 기존 기능·새 오류 분류·실제 자식 프로세스 파이프 | 101/101 |
| 위 C#에 포함된 실제 OpenSSH ↔ 루프백 합성 SSH | 6/6 |
| 위 C#에 포함된 POSIX sh + /proc + HTTP/systemd stub | 3/3 |
| Node 회귀 | 132/132 |
| PC/모바일 웹 E2E | 13/13 |
| 수정하지 않은 v0.1.7 호환성 | 11/11 |
| Windows 대상 WPF 교차 빌드 | 오류·경고 0 |

**총 257/257**, 실패/취소/skip 0. Linux 검증기는 Debian 13이며 Ubuntu 실행 검증은 추가한 Ubuntu 24.04 CI에서 수행합니다. C#의 새 30개 검사는 분류 15 + 실제 프로세스 파이프 6 + Linux 스크립트 3 + 루프백 OpenSSH 6입니다. Windows에서는 Linux 전용 3개를 제외하고 ProgramData 누락/복원 회귀 1개를 추가한 99개를 실행합니다. 서로 다른 OS의 검사 수 차이를 숨기지 않습니다.

루프백 SSH는 Paramiko 4.0.0과 **매번 임시 생성하는 합성 키/known_hosts**, `127.0.0.1` 임의 포트만 사용합니다. 실제 Azure·운영 키·사용자 기록·실제 HTTP/API는 사용하지 않습니다. mock SSH 서버는 전달받은 명령을 실행하지 않고 `sh -s`와 UTF-8/LF 입력 바이트를 검증한 뒤 합성 응답/오류만 보냅니다. Linux 스크립트 시험은 실제 /proc 및 awk/df를 사용하되 curl/systemctl을 임시 stub으로 대체해 외부 조회를 차단합니다. 임시 fixture 키/서버는 테스트 종료 후 제거합니다.

## 보존/배포 경계

- main 대비 v0.1.7 65개 파일 불변. shared active/manifest/cards/rules/judge와 추적 SQLite 3개, 합계 8개 SHA256 불변.
- v0.2.0 Node 소스/런타임 107개 및 backend payload 83개 해시 불변, ready=false. 운영 DB/키·사용자 기록 접근/변경 없음. 공개 카드/캐시는 보존 해시만 비교했습니다.
- UTF-8/HMAC/nonce·권한·중복 방지·감사·검토·최종 활성화/롤백·개발 관리자·AI/합성 제보·백업을 기존 시험으로 유지합니다.
- SSH StrictHostKeyChecking=yes, 지정 known_hosts, 사용자 config/포워딩 차단과 운영 제어 비활성화를 유지합니다. 자동 접속/재시도/운영 배포를 추가하지 않습니다.
- GitHub에는 코드·합성 fixture 소스·검증 집계/문서만 선택적으로 커밋합니다. 실제 키/DB/설정·사용자 기록·SSH stderr를 커밋하지 않습니다. scoped 패턴 검사는 모든 비밀 부재 또는 전체 이력 제거를 보장하지 않습니다.
- main 병합/자동 병합, Azure 수정·재시작·배포, 유료 API 호출은 금지 상태입니다.

## Windows 패키지/실기기

개발 브랜치 Commit/Push 후 Windows Actions가 동일 소스로 자체 포함 WPF/Node 패키지를 생성합니다. Windows CI 및 패키지 링크·원본 SHA는 검증 완료 후 별도 windows-ci.json과 이 문서에 기록합니다. CI 성공 전 Windows 실행 성공으로 간주하지 않습니다. Windows 10 회사 PC 및 실제 Azure는 사용자 측 수동 검증이며 이번 작업에서 접속하지 않습니다.
