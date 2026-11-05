# Azure 운영 구성 읽기 전용 조사 승인안

2026-11-05 Asia/Seoul · release/v0.2.0 · **아직 Azure에서 실행하지 않음**.

아래 조사만 먼저 승인 대상으로 제시한다. 브로커 설치, sudo 권한 부여, staging 기동, 배포/전환, 운영 DB·키 읽기/복사/변경은 이 승인에 포함하지 않는다. 승인 전 실제 SSH를 실행하지 않는다.

## 실행할 명령과 영향

승인할 프로그램 원문은 `staging/inspect-azure.py`다. `staging-manifest.json`의 해당 SHA256과 비교할 수 있다. 프로그램은 Python 표준 라이브러리만 사용하고 `python3 -B -`로 SSH stdin에서 실행한다. 서버에 파일을 설치·저장하거나 Python bytecode를 만들지 않는다. 전체 약45초의 시간 예산을 두고, 누락된 도구/권한/시간 초과는 미확인으로 남긴다. 자동 sudo, 설치, 재시도는 없다.

| 명령/읽기 | 예상 결과 | 영향·제외 |
|---|---|---|
| `systemctl list-units --all --plain --no-legend --no-pager` | riftassist 관련 service/socket/timer 이름, caddy.service | 목록 원문/설명은 출력하지 않고 해당 이름만 선택 |
| `systemctl show <선택된 unit> --no-pager --property=<아래 고정 목록>` | 활성 상태, 자동 시작·재시작 정책, User/Group, WorkingDirectory, ExecStart 실행파일/엔트리, MainPID | Environment는 요청하지 않음. ExecStart argv·셸 본문·임의 인수는 메모리에서 버리고 출력/저장하지 않음 |
| `/proc/<PID>/stat`, `comm`, `cwd`, `fd`의 **메타데이터** | MainPID→자식 관계와 SQLite 열린 파일 **경로**에서 데이터 루트 증거 | environ/cmdline/DB 파일/키 내용은 읽지 않음. 권한 없으면 미확인. 경로 확인은 DB를 여는 작업이 아님 |
| `ss -ltnpH` | 3001/3011/3012/3100/443의 loopback/그 외 바인딩 및 보이는 PID | 나머지 포트·프로세스 문자열은 출력하지 않음. 3100 외부 바인딩은 확인 필요로 표시 |
| `/proc/stat`, `/proc/meminfo`, `/proc/uptime`, 루트 파일시스템 statvfs | CPU 약0.2초 표본, RAM, 가동시간, 디스크 여유 | 소량 메타데이터 읽기. 파일 삭제/정리 없음 |
| `/etc/caddy/Caddyfile` 조건부 읽기 | hash, 제한된 import 경로, loopback upstream, 기존 도메인 포함 여부 | 이 경로가 실제 활성 config인지는 별도 확인 필요. include/인증서/키 파일은 열지 않음. 원문/임의 TLS·DNS 값은 출력하지 않음 |
| 인증서 검증을 유지한 `GET https://riftassistant.app/` | HTTPS 상태 코드/TLS 성공 여부 | 본문·쿠키를 읽거나 저장하지 않음. 공개 프록시/CDN 응답일 수 있어 VM 자체 상태의 증거와 구분 |

systemd 속성 목록은 코드의 `PROPS` 상수로 고정한다: Id, LoadState, ActiveState, SubState, UnitFileState, User, Group, WorkingDirectory, ExecStart, MainPID, ControlGroup, Restart, RestartUSec, NRestarts, StartLimitBurst, StartLimitIntervalUSec, TimeoutStartUSec, TimeoutStopUSec, KillMode, FragmentPath, DropInPaths, WantedBy, Requires, Wants, After. 속성 중에서도 안전한 필드만 보고한다. 경로/실행파일이 검토한 범위를 벗어나면 숨기고 미확인으로 남긴다.

**`/api/health`는 호출하지 않는다.** 현재 저장소의 v017 코드는 이 GET에서 새 세션을 만들고 `session_counts`를 갱신할 수 있다. 따라서 이번 무DB접근 조사에서는 정적 `/`만 요청한다. 기존 Control Center의 일반 SSH 상태 조회도 같은 정적 경로로 바꾼다. 실제 deep health·AI·제보 시험은 운영이 아닌 새 staging DB에서만 수행한다.

앱·서비스·설정 파일을 바꾸지 않지만 SSH 로그인/HTTPS 접근은 OS·프록시의 정상 접속 로그를 남길 수 있고 아주 짧은 읽기 부하가 있다. 무로그·무I/O를 보장하는 절차는 아니다. 프로그램은 stdout에 제한된 metadata JSON만 내보내며 실패 stderr/비밀값을 출력하지 않는다.

## 승인 후 사용자가 Windows PowerShell에서 실행할 명령

다음은 이전에 사용자가 확인한 IP/계정/개인키 **경로**를 사용한 예다. 실제 대상이 그대로인지 먼저 확인한다. 코드가 승인되기 전에는 붙여넣어 실행하지 않는다. 개인키 내용·관리자 키는 입력/복사하지 않는다. 이 프로그램에는 관리자 키 자동 획득을 호출하는 경로가 없다.

```powershell
# 새 ZIP의 최상위 폴더에서: 원문과 hash를 먼저 확인
Get-FileHash -Algorithm SHA256 .\staging\inspect-azure.py
Get-Content -Encoding UTF8 .\staging\inspect-azure.py

# 별도 읽기 조사 승인 후에만 실행. Python 원문/JSON은 ASCII여서 PowerShell 5 파이프도 지원.
Get-Content -Raw -Encoding UTF8 .\staging\inspect-azure.py | & "$env:WINDIR\System32\OpenSSH\ssh.exe" -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectionAttempts=1 -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 -o ForwardAgent=no -o ForwardX11=no -o ClearAllForwardings=yes -o PermitLocalCommand=no -o LogLevel=ERROR -o UserKnownHostsFile="$env:USERPROFILE\.ssh\known_hosts" -i "$env:USERPROFILE\.ssh\riftassistant-key.pem" azureuser@20.222.152.195 "python3 -B -"
```

호스트 키를 자동 추가하거나 검증을 끄지 않는다. 암호·sudo 입력을 요청하지 않는다. Python/도구/권한이 없으면 프로그램을 설치하거나 권한을 높이지 말고 결과를 보고한다. 이 명령에는 실제 서비스/사용자 데이터를 모델에 전송하는 기능이 없다.

## 결과 검토와 다음 승인

1. 실제 ExecStart가 manager인지 direct server인지, MainPID/자식·3001/worker/3100 소유관계가 맞는지 확인한다. manager `/api/start`·`stop`과 systemd 시작·중지는 같은 작업이 아니다.
2. DataRoot는 열린 SQLite 경로가 보이는 경우에만 관찰 증거로 삼는다. 보이지 않을 때 코드 기본값을 실제 경로로 확정하지 않는다. 환경/운영 DB를 뒤져 보완하지 않는다.
3. Caddy 실제 config/import/실행 계정·443 소유와 자동 재시작 관계를 확인한다. 파서가 확인하지 못한 셸 ExecStart·include는 별도 범위의 후속 metadata 조사 승인이 필요하다. `systemctl cat`, `ps eww`, `journalctl`, `.env`, `/proc/*/environ`, 관리자 backup API는 이번 승인안에 없다.
4. 조사 JSON은 서버 경로·계정·PID 등 인프라 정보를 포함한다. 자동 Git commit/외부 AI 업로드를 하지 않는다. 필요한 확인 항목만 검토해 공유한다. 비밀값·실제 질문/제보 본문은 보내지 않는다.
5. 그 후 전용 staging 호스트/계정·포트·경로·권한·실제 package SHA/CI를 확정하고 **설치 승인**, **staging 기동/쓰기 승인**, **최종 운영 전환 승인**을 각각 진행한다. 이번 조사를 승인해도 후속 쓰기는 승인되지 않는다.
