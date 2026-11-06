# 추가 경로·autostart 검토 및 새 읽기 조사 승인안

2026-11-06(한국). release/v0.2.0 전용. 실제 Azure 접속·설치·중지·배포·DB/키 접근은 이 작업에서 실행하지 않는다. 새 조사는 **별도 승인 대기**다. 기존 a7dbf966의 두 조사 원문·SHA256과65개 기준·엄격한 검증은 변경하지 않았다.

## 확인된 결과와 실패의 의미

사용자 제공 요약: riftassist.service active/enabled, 기존 manager.js, UID/GID1000/1000, Node v24.22.1, Caddy 활성 설정 /etc/caddy/Caddyfile. helper는 inactive/enabled이며 동작 미확인이다. 원시 조사 JSON과 현재 unit/Caddy hash·unit FragmentPath/drop-ins/KillMode는 제공되지 않았다. 실제 설치 inventory를 완성한 것으로 처리하지 않는다. `staging/azure-observations-2026-11-06.json`은 이 요약만 기록하며 설치/배포 승인은 false다.

matchedCodeFiles=65와 모든 기준 hash 일치는 **기준 코드 내용의 일치**를 뜻한다. unexpected-directory/unexpected-file 때문에 referenceVerified=false인 것은 추가 경로를 포함한 전체 실행·공개 영역의 검증에 실패했다는 뜻이다. 원본65개의 위변조가 확인됐다는 의미로 바꾸거나, 반대로 추가 경로가 안전하다고 해석하지 않는다. deploymentCodeHash를 임의로 채우지 않는다.

로컬 원본 코드에서도 생성 경로를 조사했다. v017의 `src/paths.js`는 releases 아래 실행 시 기본 DATA_ROOT를 두 단계 위 shared root로 정하고, `src/manager.js`는 그 ROOT의 tmp/manager.json·로그와 source-updates를 사용한다. 따라서 릴리스 디렉터리 안에서 발견된 추가 항목을 기본 운영 산출물이라고 바로 판단할 근거는 없다. 환경변수 override·수동 설치·셸 redirection의 산출물일 가능성은 남지만 실제 환경값/파일 내용은 읽지 않아 확인하지 않았다. 추가 항목을 생성한 주체·시점 역시 미확인이다.

| 구분 | 현재 판단 | 처리 |
|---|---|---|
| 기준65개 | 사용자 보고상 정확한 hash 일치 | 고정 Git tree/검증 기준 유지. 추가 경로와 별도로 진단 |
| .DS_Store, Thumbs.db, __pycache__ 등 | 일반 생성물 후보. 현재 서버에 실제 존재하는지는 미확인 | 내용 미열람, 자동 허용/삭제 금지 |
| node_modules, 실행 파일·설정·환경 파일 | 의존성/기동 동작에 영향을 줄 수 있음 | 코드 실행 경로/출처 검토 필요. 원문·비밀값 자동 수집 안 함 |
| public 아래 추가 파일/링크 | 정적 HTTP 노출 가능성 | 기존 server.js의 정적 파일 경로에 포함될 수 있으므로 특히 주의. HTTP로 내용 조회하지 않음 |
| private, DB/키/로그/백업 후보 | 운영 자료나 비밀정보일 수 있음 | 메타데이터만 분류. 내용·hash·하위 목록·링크 대상 미열람 |
| 그 외 | 미분류 | 이름은 redacted. 익명 ID와 안전한 분류만 출력 |

이 표의 이름 목록은 **안전한 출력용 라벨**이며 신뢰 코드 허용 목록이 아니다. 원본 코드의 일부라는 판단에는 원본 출처/commit/hash 및 실제 사용 경로의 근거가 필요하다. 근거 없이65개 기준에 추가하지 않는다. 사용자 자료가 들어 있거나 실행/공개 영역에 영향을 주는 경우는 독립 보존/이전 검토와 별도 승인이 필요하며 이번에 파일을 이동·삭제하지 않는다.

`legacy-assessment.cjs`는 baselineCodeVerified와 layoutVerified를 분리한다.65개가 맞아도 추가 항목이 있으면 deploymentReferenceVerified=false, authorizedToDeploy=false다. 기존 legacy-v017.receipt는 여전히 추가 항목을 거절한다. gates/preflight/start의 엄격한 검증도 유지하며, 실제 서버 실패를 ready=true나 관찰 hash로 덮지 않는다.

## 새 조사: 실행 전 승인 필요

원문: `staging/inspect-release-blockers.py`

SHA256: `3fce265ce5d45dec329f79f31a4b08122b84bd37bc32240a25f2ce2dfc7c328a`

고정 범위:

1. /home/azureuser/RiftAssist/experiments/unified-rulings/releases/v0.1.7 및 기준 코드의4개 디렉터리(src/public/manager-ui/scripts)만 디렉터리 FD로 열어 항목/lstat 메타데이터를 분류한다. 알려지지 않은 디렉터리로 내려가지 않고 symlink를 따라가지 않는다. 파일 내용은65개 코드조차 다시 읽지 않는다. 알려진 기준 경로 관찰 수는 hash 재검증으로 표기하지 않는다.
2. 추가 항목의 종류·부모 코드 영역·출력용 고정 라벨 또는 redacted·실행/쓰기 권한·UID/GID·대략적인 크기 구간을 출력한다. 임의 파일 이름/하위 이름/링크 대상/내용/hash를 출력하지 않는다. 익명 ID는 메모리 난수로 생성되어 조사 간 고정되지 않으며 원격 경로 선택 권한으로 사용할 수 없다.
3. systemctl show를 riftassist.service, riftassist-autostart.service, caddy.service에 각1회 실행한다. 상태·Type/Restart·KillMode·고정 사용자/작업 디렉터리/cgroup·고정 unit FragmentPath·drop-in 개수·대기 Job 여부·세 서비스 사이의 의존성/다른 unit 수를 출력한다. ExecStartPre/Start/Post/Stop/StopPost는 메모리에서 정상 관리자 login/start/stop·systemctl·지연·loop·background·키 파일 참조 유무와 실행 형태만 추출한다. **원시 argv·unit 본문·Environment·키값·참조 스크립트 경로/본문은 출력하지 않는다.** Exec* 형태만으로 실제 동작 검증 완료라고 하지 않는다.

파일 open은 고정5개 디렉터리만 대상으로 한다. DB·키·질문·제보·일반 파일·로그·환경 파일·Caddy 본문·unit 파일을 열지 않는다. 명령은 show뿐이며 sudo/systemctl start·stop·mask/설치/파일 저장/외부 HTTP 호출은 없다. helper에 참조 스크립트가 있으면 그 실제 내용은 이번 범위로 읽지 않고 후속 검토 대상으로 남긴다.

예상 결과: protocol=riftassist-release-blockers-1, readOnly=true, 안전하게 분류한 additionalPaths와3개 unit 메타데이터, authorizedToDeploy=false. 디렉터리 최대512항목/출력80항목/약5초, systemctl 각5초 제한이다. 예산·권한·경로 변경·링크 문제는 complete=false 또는 metadata-unavailable로 남긴다. 전체 출력은 제한하며 raw stderr는 폐기한다. SSH 접속 기록과 소량 메타데이터 조회 부하는 생길 수 있고, 일부 파일시스템/마운트 정책에 따라 디렉터리 열람 atime 갱신 가능성을 배제할 수 없다. 서비스 설정/데이터를 변경하는 명령은 없다.

현재 ZIP 최상위에서 아래 Verify만 실행하면 SSH 없이 원문 SHA를 확인한다.

```powershell
& .\Invoke-AdditionalInspection.ps1 -Mode Verify -PackageDirectory (Get-Location).Path
```

**사용자가 이 새 원문·SHA·범위를 승인한 후에만** 같은 폴더에서 다음을 직접 실행한다. 기존 두 조사 승인을 자동 확장하지 않는다. 고정 대상은 azureuser@20.222.152.195, 기존 Windows OpenSSH·known_hosts·riftassistant-key.pem이며 대상이 바뀌면 실행하지 않는다.

```powershell
& .\Invoke-AdditionalInspection.ps1 -Mode Inspect -Approved -PackageDirectory (Get-Location).Path
```

기본 Verify는 SSH0회다. Inspect는 -Approved 없으면 거절하고, 있어도 SHA 불일치이면 SSH를 실행하지 않는다. 기존 Invoke-ReleasePreparation.ps1에는 새 원문을 넣지 않았다. 결과 자동 파일 저장·전송·재시도는 없다. 예상과 다른 원시 출력은 공유하지 않는다. 출력용 라벨과 분류로 정체가 확정되지 않은 추가 항목은 미분류 상태로 유지하며, 경로 이름이나 내용을 더 공개해야 한다면 그 범위부터 별도 검토한다.

## autostart 충돌 방지와 운영 교체

inactive/enabled는 다음 서비스 시작·부팅·의존성 동작에서 helper가 실행될 수 있는 상태다. 기존 /api/start는 manager 소유 앱/worker를 다루며 systemd 주 서비스 시작/중지와 같지 않다. helper가 sleep/background/재시도 뒤 앱 시작을 호출하면 교체 중 이중 시작이나 포트 재점유가 생길 수 있다. 실제 동작은 아직 확정하지 않는다.

코드는 다음을 고정 조건으로 검사한다: helper가 absent 또는 **별도 검토·승인으로 masked**이고 inactive/failed·MainPID0·대기 Job 없음·helper cgroup 자식 writer 없음. preflight에서만 보지 않고 stop과 종료 확인/start 직전에도 다시 검사한다. 활성화/대기/남은 프로세스/상태 drift는 서비스 명령 전에 차단한다. 자동 mask/disable·helper 정지·변경은 구현하거나 실행하지 않는다.

운영 절차는 다음 순서로 확정한다.

- 새 메타데이터 결과로 추가 경로와 helper 실행 형태/의존성을 검토한다. 스크립트 내용이 필요한 경우 표적·비밀값 보호 범위를 따로 승인받는다.
- helper를 유지/대체/일시 차단하는 안과 부팅·오류 복구·원복 정책을 먼저 승인받는다. 무조건 mask하는 것으로 장기 자동복구가 해결됐다고 보지 않는다.
- actual unit/hash/drop-ins·UID/GID·runtime·현재 Caddy hash를 pin한 inventory와 좁은 broker 설치/권한·수동 복구안을 검토한다. caddy 경로는 이제 확인됐지만 파일 hash는 새로 확인하지 않았다.
- 추가 경로 검토 및 엄격한 rollback reference가 해결되기 전에는 서비스 중지/백업 qualification/교체를 진행하지 않는다. 원본65개나 추가 파일을 자동 정리하여 기준에 맞추지 않는다.
- 별도 설치 승인 → 별도 서비스 중단/DB·키 백업·독립 복원/호환성 확인 승인 → 자료 권한/개인정보/백업 보관·복구키 정책 확정 → readiness 결정 → 최종 교체 승인 순서를 유지한다.

같은 VM/도메인/Caddy/3001·3100, 한 앱 버전만 사용하는 교체와 기존 DB 원본·별도 새 기록 보존, 실패 자동 복귀/정상 후 별도 롤백은 유지한다. 라이브 WPF 배포 버튼은 계속 비활성이다. 실제 Azure가 아니라 합성 Windows/Ubuntu/SQLite 및 CI로 검증한 범위를 구분한다.
