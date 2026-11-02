# Control Center 3차 SSH 조회 수정 — 2026-11-02

## Windows SSH 초기화 원인

Control Center가 자식 환경을 비우면서 **ProgramData를 누락**했습니다. Win32 OpenSSH의 `init_prog_paths()`는 ProgramData가 없으면 fatal 종료하며, `w32posix_initialize()`에서 이 함수가 표준입출력 초기화보다 먼저 호출됩니다. 따라서 서버 연결 전 **종료 255 + 빈 stderr**가 될 수 있습니다. 이 코드는 직접 실행한 PowerShell과 다른 환경 조건을 만들었습니다.

수정: 비밀정보가 아닌 Windows ProgramData 경로만 허용 목록에 추가하고, 환경에 없으면 Windows CommonApplicationData known folder를 사용합니다. 경로를 얻지 못하면 안전한 로컬 환경 오류로 표시합니다. 전체 환경/API 키/PATH 상속을 허용하지 않습니다. **실제 ssh.exe -V**를 네트워크 없이 실행해 ProgramData 제거 전후를 비교하고, 수정된 runner의 실제 루프백 SSH 인증/상태 조회를 검증합니다.

확인한 upstream 구조: [Win32 OpenSSH w32fd.c](https://github.com/PowerShell/openssh-portable/blob/latestw_all/contrib/win32/win32compat/w32fd.c), `init_prog_paths` / `w32posix_initialize`. 사용자 PC에서 같은 수정으로 해결되는지는 새 패키지의 수동 조회가 필요합니다.

## 추가 확인한 원인과 확인하지 못한 부분

사용자 Windows 10 PC에서 같은 키와 known_hosts를 사용한 PowerShell `ssh … "echo SSH_OK"`가 성공했습니다. 이 사실은 해당 명령의 연결/인증을 확인하지만 Control Center의 `sh -s` 표준입력 스크립트 실행·도구·출력 파싱까지 확인하지는 않습니다. 회사 PC의 실제 실패 단계는 이번 개발 환경에서 재현하지 못했으며, 개인키·원시 stderr 제출을 요청하지 않습니다.

기존 코드에서 재현·확인한 결함:

1. SSH는 보통 전송 실패에 255, 원격 프로세스 실패에는 해당 종료 코드를 반환합니다. 기존 구현은 2/70/127 등의 원격 명령 실패도 `client-ssh-disconnected`로 처리했습니다.
2. 표준입력 쓰기/닫기에서 파이프 오류가 나면 프로세스의 인증 오류 stderr와 종료 코드를 회수하기 전에 예외가 전파될 수 있었습니다. 이를 일반 catch가 다시 `client-ssh-disconnected`로 바꿨습니다.
3. 프로세스 시작/기타 로컬 예외도 같은 단절 오류로 처리했습니다. stdout/stderr가 상한을 넘으면 읽기를 중단한 파이프 때문에 자식이 대기하고 제한 초과가 타임아웃으로 보일 가능성도 있었습니다.
4. .NET Process의 기본 StreamReader는 지정 인코딩과 별개로 BOM을 탐지합니다. UTF-8 프로토콜은 BOM 자동 탐지를 끄고 검증합니다. stderr는 로컬 인코딩 잡음 때문에 인증 오류 분류가 사라지지 않도록 치환 디코딩하고 외부에 출력하지 않습니다.

**이 결함들이 회사 PC 오류의 유일한 원인이라는 뜻은 아닙니다.** 새 패키지로 사용자 PC에서 1회 수동 조회한 뒤, 안전하게 표시된 오류 코드·종료 코드·고정 점검 항목으로 실제 실패 단계를 확인해야 합니다.

## 수정 구조

- Windows 기본 `%SystemRoot%\System32\OpenSSH\ssh.exe`를 셸 없이 실행합니다. `ArgumentList`로 인수 경계를 유지하며 PowerShell/cmd 문자열 조합을 하지 않습니다.
- `-F NUL`, `BatchMode=yes`, `StrictHostKeyChecking=yes`, 지정 known_hosts, `UpdateHostKeys=no`, 포워딩/agent 전달/사용자 config 차단을 유지합니다. 지정 키는 `IdentitiesOnly=yes`와 `-i`로 선택합니다. 키 본문을 설정·로그에 복사하지 않습니다.
- `ConnectTimeout=10`은 사용자 성공 명령과 일치시킵니다. 전체 조회 25초, HTTP 각 5초, keepalive와 수동 취소를 유지합니다. ProgramData/TEMP/TMP와 Windows named-pipe 형식의 명시적 SSH_AUTH_SOCK만 필요한 환경에 추가합니다. API 인증정보·사용자 PATH는 전달하지 않습니다.
- `sh -s`에 UTF-8 BOM 없는 LF 스크립트만 씁니다. stdout/stderr를 동시에 제한 크기로 읽고 입력을 flush/닫아 EOF를 전달합니다. 입력 파이프가 먼저 닫혀도 종료 코드와 stderr를 회수합니다. 실패/초과/취소 시 자식을 종료하고 최대 2초의 정리 대기를 수거합니다. 자동 재시도하지 않습니다.
- stdout의 기존 status-1 10필드 형식을 유지합니다. stderr의 고정 시작/완료/오류/경고 마커만 분류합니다. 메시지·로그에는 정해진 코드/라벨과 정수 종료 코드만 표시합니다. stderr 원문·배너·키/계정/호스트 경로를 표시하지 않습니다.
- 필수 awk/df/head/sleep와 읽을 수 있는 /proc 자료·디스크를 확인합니다. systemd 상태나 앱/HTTPS HTTP 응답이 없으면 수치 전체를 폐기하지 않고 unknown/000 및 경고를 표시합니다.
- 원격 스크립트는 POSIX sh/Ubuntu의 /proc·awk·df를 사용합니다. systemctl show와 HTTP GET만 수행합니다. unit 이름 `riftassist.service`, 내부 `127.0.0.1:3001/api/health`, 설정 origin의 `/api/health`는 기존 가정이며 실제 서버 구성은 자동 탐색/수정하지 않습니다. 관리자 포트/로그/DB는 조회하지 않습니다.

## 오류 해석

| 코드 | 의미/다음 확인 |
| --- | --- |
| client-ssh-environment | Windows ProgramData 기본 경로 확인 실패 |
| client-ssh-start / missing | 로컬 ssh.exe 실행/설치/회사 실행 정책 |
| client-ssh-configuration | 설치된 OpenSSH의 옵션 지원 |
| client-ssh-authentication | 키 로드/권한·계정·agent; 입력 파이프 조기 종료에도 원래 인증 오류 보존 |
| client-ssh-host-key-changed / unverified | 신뢰 경로로 fingerprint 확인; 검증을 끄거나 자동 삭제하지 않음 |
| client-ssh-dns / refused / timeout | 이름 조회 / 접속 거절 / 지연 |
| client-ssh-disconnected | 시작 마커 없는 255; 원인을 특정하지 못한 SSH 세션 실패 |
| client-ssh-session-lost | 원격 조회 시작 확인 후 255; 원격에서 명시적으로 255를 반환해도 이 분류가 될 수 있음 |
| client-ssh-remote-command | 255 외 비정상 종료; 원격 셸/명령/실행 정책 확인 |
| client-ssh-remote-tools | 고정 서버 오류 마커; awk/df/head/sleep/proc/disk/metrics 중 표시 항목 확인 |
| client-ssh-input-incomplete / pipe-failed | 스크립트 전송/로컬 표준입출력 문제 |
| client-ssh-response-invalid / limit | 출력 형식·인코딩·배너 / 허용 크기 초과; 연결 단절로 분류하지 않음 |
| client-ssh-local-failed | 예상하지 못한 로컬 처리 오류; 서버 중단을 의미하지 않음 |

종료 코드 0이어도 파싱 검증에 실패하면 새 정상값을 게시하지 않습니다. 같은 프로필의 마지막 정상값은 **이전 값**으로만 남기고 프로필 변경 시 지웁니다. 마커가 없고 종료 코드가 255인 경우 인증 전후를 완벽히 구분할 수 없으며 그 한계를 유지합니다.

## 새 패키지로 Windows 10에서 확인

1. 새 실행 패키지의 **전체 파일**을 새 폴더에 풀고 `RiftAssist.ControlCenter.exe`를 실행합니다. exe만 복사하지 않습니다. 기존 로컬 SSH 설정은 그대로 사용할 수 있습니다.
2. 설정에서 성공한 PowerShell 명령과 같은 주소·계정·포트·키·known_hosts 절대 경로를 확인합니다. HTTPS origin도 실제 사이트 주소로 입력합니다. 키 본문을 붙여넣지 않습니다.
3. Azure 모드의 **서버 상태 조회**를 직접 누릅니다. 시작/저장/모드 변경만으로 접속하지 않습니다. 이 버튼은 읽기 전용 상태 명령만 실행합니다.
4. 실패하면 화면 오류 코드와 **조회 상세의 종료 코드·고정 점검 항목**만 공유합니다. known_hosts·키 파일·stderr·계정 경로를 공유하지 않습니다. 명령이 실패해도 서버를 재시작하거나 앱 설정을 바꾸지 않습니다.
5. SSH는 성공했지만 웹 상태가 000이거나 systemd unknown이면 URL·unit·도구 가정이 맞는지 운영자가 별도로 읽기 전용 확인합니다. 임의로 도구를 설치하거나 서비스를 변경하지 않습니다.

이번 개발에서 실제 Azure/회사 PC 접속은 실행하지 않았습니다. Windows CI의 실제 OpenSSH 테스트는 **127.0.0.1의 임시 합성 SSH 서버**만 사용합니다. Windows Server CI의 빌드/GUI 결과와 Windows 10 실기기/회사 네트워크 검증은 별개입니다.
