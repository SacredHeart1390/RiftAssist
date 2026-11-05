# v0.1.7 manifest 불일치와 고정 롤백 기준

원본 v017 파일·manifest·운영 자료는 수정하지 않았다. 아래는 저장소 Git 객체/코드만 조사한 결과이며 실제 Azure 파일을 읽거나 같은 상태라고 가정하지 않는다.

## 원인과 범위

기존 검증 함수는 src/public/manager-ui만 비교해9개를 보고했다. **전체 manifest는64개 파일을 선언하고, 전체 릴리스는 manifest 자신을 포함65개다.** 전체 검사에서는 scripts/source-monitor.js가 추가되어10개였다. 아래10개 모두 LF 원문을 정확한 CRLF 형식으로 재현했을 때 선언 SHA256과 일치했다. 논리 변경/문자 누락을 임의로 무시한 것이 아니다.

| 범위 | 파일 | 검증 결과 |
|---|---|---|
| 기존9개 | public/app-r2.js | Git LF와 선언 CRLF의 정확한 해시 차이 |
| 기존9개 | public/app-ui2.js | 동일 |
| 기존9개 | public/card-composer-r2.js | 동일 |
| 기존9개 | public/card-composer-ui2.js | 동일 |
| 기존9개 | public/card-composer-ui3.js | 동일 |
| 기존9개 | public/styles-r2.css | 동일 |
| 기존9개 | public/styles-ui2.css | 동일 |
| 기존9개 | src/manager.js | 동일 · 기능 변경 증거 없음 |
| 기존9개 | src/paths.js | 동일 · 기능 변경 증거 없음 |
| 전체 검사 추가1개 | scripts/source-monitor.js | 동일 |

나머지54개는 Git blob의 LF bytes 자체가 선언 hash와 일치한다. 최초 Git 커밋 **289aee4504a8abfaa4b8ebd7e3dff7fc3648ab80**의 루트 .gitattributes는 `* text=auto`로 LF 정규화를 지정한다. 이 커밋에서 이미 위 차이가 존재했고, 이후 현재 release/main까지 v01765개 Git 파일은 변하지 않았다. Git tree는 **7f25baaaa9e2d1898d54c99386fd24adce929a0f**다. 따라서 저장소에서 관찰한 불일치는 기록된 줄바꿈 bytes와 Git 정규화 bytes의 차이로 전부 설명된다. 침해나 임의 코드 변경으로 단정하지 않는다.

manifest.createdAt은2026-10-23T03:12:12.048Z이며 최초 Git 커밋은2026-10-26이다. manifest에는 생성 기준 Git commit이 없고 그 이전 이력이 없으므로 **실제 manifest 생성 commit은 미확인(null)**이다. 최초 커밋을 생성 commit으로 지어내지 않는다. 최초 커밋의65개 blob을 복구 가능한 원본 기준으로 사용하고 선언64개가 모두 그 원문과 일치하는지 독립 검증했다.

## 원본 보존과 엄격한 검증

`scripts/audit-v017-baseline.py`는 고정 Git tree의65개 코드/자산 blob만 읽고 `staging/legacy-v017-baseline.json`과 대조한다. DB·키·사용자 기록을 읽지 않는다. 새 reference는 각 파일의 Git blob ID, 선언 hash, 원본 LF와 정확한 CRLF checkout 각각의 SHA256/크기를 명시한다. 생성은 원본289aee4 객체가 있어야 하며, CI check는 HEAD의 v017 tree가 고정 tree와 같은지 먼저 확인하므로 shallow checkout에서도 임의 원본을 새 기준으로 만들 수 없다.

reference 파일 SHA256은 **3a956500a3216719f0a42f86b22f06ea4f6ac3d718428b81a0a5605802c33f36**이며 `legacy-v017.cjs`에도 고정한다. 기존 v017 manifest를 다시 쓰거나 expected hash를 현재 파일 값으로 덮지 않는다.

런타임은 **정규화하지 않은 실제 bytes를 그대로 해시**하고 reference에 미리 명시된 두 값 중 하나와만 비교한다. 혼합 줄바꿈·코드 한 글자 변경·추가/누락 파일·manifest 수정·알 수 없는 reference는 거절한다. `oldCodeHash`만 임의로 바꿔도 고정 원본 검사를 우회할 수 없다. reference가 없거나 깨지면 관찰된 파일을 새 정답으로 등록하는 fallback 없이 배포/롤백을 차단한다.

검증된 실제 코드의 exact bytes 전체 fingerprint를 inventory의 oldCodeHash에 추가 pin하여, 허용된 LF/CRLF 형식 사이의 변경도 작업 승인 이후에는 drift로 검출한다. 현재 기준은 저장소 코드의 출처/무결성 기준이며 보안 취약점 부재나 운영 배포 승인을 뜻하지 않는다.

## 실제 Azure에 남은 확인

현재 서버가 이 기준65개와 같은지는 아직 확인하지 않았다. 사용자 승인된 별도 코드 hash 조사/패키지 검증 범위가 필요하다. 운영 DB·키는 그 조사에서 제외한다. 서버에서 hotfix·추가 파일·다른 bytes가 나오면 자동 허용하지 말고 차이와 Git 출처를 별도 검토해야 한다. 검증된 원본 기준 및 inventory pin을 확보하지 못하면 배포/롤백을 계속 차단한다.

이 문제의 저장소 원인은 해결됐지만 autostart 실제 동작, 활성 Caddy 경로·unit 세부 설정/UID/GID/Node·DB/키/설정 호환성과 자료 권한·개인정보·백업 보관/readiness·설치/교체 승인은 [REPLACEMENT.md](REPLACEMENT.md)의 차단 사항으로 남는다. 추가 VM이나 상시 병렬 운영을 요구하지 않는다.

## 추가 승인 대상: 서버 소스 hash만 읽는 조사

`staging/inspect-legacy-source.py`는 고정된 v017 경로의 위65개 소스만 열어, 미리 명시된 hash와 비교한다. Git/Node나 프로젝트 코드를 실행하지 않고 Python 표준 라이브러리로만 계산한다. DB·키·사용자 기록·환경값·로그·알 수 없는 파일 본문은 읽지 않는다. symlink/hardlink·추가/누락·크기/mtime 변화가 있으면 실패한다. 알 수 없는 파일 이름도 결과에 넣지 않는다. 정상일 때만 Node 검증기와 동일한 deploymentCodeHash를 출력하고 어떤 경우에도 authorizedToDeploy=false다.

원문 SHA256은 `5d353f19ff44ff1218ddfdc5b09e4fa5a2126f29c6fa24fc9404cb56d2a98166`이다. **아직 Azure에서 실행하지 않았으며 별도 승인 대상**이다. 같은 승인안의 topology 검사(6d0a68ff...)와 함께 실행할 정확한 PowerShell 명령은 REPLACEMENT.md의 마지막 절에 있다. 소스 읽기로 OS atime/SSH 접속 로그와 소량 I/O가 생길 수 있다. 파일 내용/DB/키/외부 전송/서비스 제어/설치는 이 승인에 포함하지 않는다.
