# Control Center 3차 SSH 조회 수정 검증 — 2026-11-02

기존 3차 기반 `ddd93421e35eb41559525ffe832bdc1433518ad3`, `feature/riot-api-v0.2`, Draft PR #1을 유지합니다. 기존 미커밋 AGENTS.md를 보존/제외합니다. 실제 Azure 서버에는 접속하지 않았습니다.

분석·수동 Windows 시험 방법: [SSH-TROUBLESHOOTING.md](../../control-center/SSH-TROUBLESHOOTING.md).

Windows CI에서 ProgramData 누락으로 ssh.exe가 접속 전 종료 255/빈 stderr가 되는 결함을 발견했습니다. Windows OpenSSH 초기화 소스의 필수 조건과 일치하며 ProgramData를 필요한 환경에 복원했습니다. 회사 PC에서 동일 수정으로 해결되는지는 사용자 수동 확인이 필요합니다. 재현한 원격 비정상 종료·stdin 조기 종료·로컬 실행 예외의 잘못된 `client-ssh-disconnected` 분류를 수정하고 안전한 진단 항목을 추가했습니다. `sh -s`는 유지하며 필수 도구/자료를 확인하고 optional HTTP/systemd 실패는 경고로 분리합니다. 개인키/원시 stderr를 로그에 기록하지 않습니다.

## 로컬 검증

| 검사 | 결과 |
| --- | --- |
| C# 기존 기능·새 오류 분류·실제 자식 프로세스 파이프 | 103/103 |
| 위 C#에 포함된 실제 OpenSSH ↔ 루프백 합성 SSH | 6/6 |
| 위 C#에 포함된 POSIX sh + /proc + HTTP/systemd stub | 3/3 |
| Node 회귀 | 132/132 |
| PC/모바일 웹 E2E | 13/13 |
| 수정하지 않은 v0.1.7 호환성 | 11/11 |
| Windows 대상 WPF 교차 빌드 | 오류·경고 0 |

**총 259/259**, 실패/취소/skip 0. Linux 검증기는 Debian 13이며 Ubuntu 실행 검증은 추가한 Ubuntu 24.04 CI에서 수행합니다. C#의 새 32개 검사는 분류 17 + 실제 프로세스 파이프 6 + Linux 스크립트 3 + 루프백 OpenSSH 6입니다. Windows에서는 Linux 전용 3개를 제외하고 ProgramData 누락/복원 회귀 1개를 추가한 101개를 실행합니다. 서로 다른 OS의 검사 수 차이를 숨기지 않습니다.

루프백 SSH는 Paramiko 4.0.0과 **매번 임시 생성하는 합성 키/known_hosts**, `127.0.0.1` 임의 포트만 사용합니다. 실제 Azure·운영 키·사용자 기록·실제 HTTP/API는 사용하지 않습니다. mock SSH 서버는 전달받은 명령을 실행하지 않고 `sh -s`와 UTF-8/LF 입력 바이트를 검증한 뒤 합성 응답/오류만 보냅니다. Linux 스크립트 시험은 실제 /proc 및 awk/df를 사용하되 curl/systemctl을 임시 stub으로 대체해 외부 조회를 차단합니다. 임시 fixture 키/서버는 테스트 종료 후 제거합니다.

## 보존/배포 경계

- main 대비 v0.1.7 65개 파일 불변. shared active/manifest/cards/rules/judge와 추적 SQLite 3개, 합계 8개 SHA256 불변.
- v0.2.0 Node 소스/런타임 107개 및 backend payload 83개 해시 불변, ready=false. 운영 DB/키·사용자 기록 접근/변경 없음. 공개 카드/캐시는 보존 해시만 비교했습니다.
- UTF-8/HMAC/nonce·권한·중복 방지·감사·검토·최종 활성화/롤백·개발 관리자·AI/합성 제보·백업을 기존 시험으로 유지합니다.
- SSH StrictHostKeyChecking=yes, 지정 known_hosts, 사용자 config/포워딩 차단과 운영 제어 비활성화를 유지합니다. 자동 접속/재시도/운영 배포를 추가하지 않습니다.
- GitHub에는 코드·합성 fixture 소스·검증 집계/문서만 선택적으로 커밋합니다. 실제 키/DB/설정·사용자 기록·SSH stderr를 커밋하지 않습니다. scoped 패턴 검사는 모든 비밀 부재 또는 전체 이력 제거를 보장하지 않습니다.
- main 병합/자동 병합, Azure 수정·재시작·배포, 유료 API 호출은 금지 상태입니다.

## Windows 패키지/실기기

실행 코드 `d159f9204223807c521d3986a10d9f775e9e9ae3`의 [Windows/Ubuntu CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41372092735)와 [Node/v0.1.7 회귀 CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41372092727)가 모두 성공했습니다.

- Windows Server 2025: 소스/패키지 C# 각각 **101/101**. 실제 ssh.exe ↔ 127.0.0.1 합성 서버의 조회·인증 실패·호스트 키 불일치·원격 명령 오류·파싱 오류·연결 후 단절을 모두 통과했습니다.
- ProgramData만 제거한 **ssh -V**: 종료 **255**, stdout/stderr **0자**. 정상 환경: 종료 **0**, 버전 stderr **43자**. 서버 연결 없이 Windows 초기화 원인을 재현하고 수정 동작을 확인했습니다.
- native WPF: 기존 운영 7개 탭·카드/확인·설정·오류 분류/진단 표시, **binding 오류 0건**, 운영 제어 비활성. 패키지 exe 직접 시작/정상 종료, 자동 자식 프로세스 **0개**.
- Ubuntu 24.04: C# **103/103**. /proc·POSIX 스크립트와 HTTP/systemd stub, 합성 루프백 SSH 검사 포함.

**[새 Windows 실행 패키지 다운로드](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41372092735/artifacts/13110095652)** — 약 102MB, GitHub 저장소 접근 권한 필요. 전체 파일을 풀고 `RiftAssist.ControlCenter.exe`를 실행합니다. SHA256 `c0536e0328a79586e16e39560ffa90c4a82af29185aa234d309456638333eb02`, artifact 만료 UTC 2027-01-31. 생성 원본은 위 실행 코드 SHA이며 이후 증거/문서만 정리한 커밋과 실행 코드는 동일합니다.

기계 판독 가능한 증거: [windows-ci.json](windows-ci.json). Windows Server의 OS 버전 문자열이 Windows 10.0으로 시작해도 **Windows 10 실기기 시험으로 간주하지 않습니다.** 회사 Windows 10 PC 및 실제 Azure는 사용자 측 수동 검증이며 이번 작업에서 접속하지 않았습니다. 새 패키지에서 기존 SSH 설정을 확인하고 서버 상태 조회를 직접 누르며, 실패하면 표시된 코드/종료 코드/고정 점검 항목만 공유합니다.
