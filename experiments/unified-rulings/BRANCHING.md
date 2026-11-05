> 후속 출시 준비: [기존 VM 단일 서비스 교체](control-center/REPLACEMENT.md). 아래 초기 staging 계획보다 이 문서가 우선합니다. 별도 VM이나 상시 병렬 운영은 필수 조건이 아닙니다.

# v0.2.0 출시 준비 / v0.3.0 개발 분리

2026-11-04 Asia/Seoul. 기준 커밋 `955f6e8fb85692e274a3ba919486dacf6440433c`(8차 완료 문서 포함). 사용자가 Windows10 합성 v020 배포·암호화 백업 복원·v017 routing rollback/기존 데이터 보존 성공을 보고했다. 이는 실제 Azure 배포·실제 선택 앱 staging 기동 검증이 아니다.

- feature/riot-api-v0.2와 Draft PR #1은 그대로 보존한다. PR의 head/base를 바꾸지 않고 main에 병합하지 않는다.
- release/v0.2.0: 출시 안정화 전용. runtime은 releases/v0.2.0, Control Center의 실제 Codex 수정/게시 대상과 합성 배포 catalog는 이 branch에 묶는다. 기존 미확정 작업이 다른 branch를 대상으로 했다면 자동 재개/게시하지 않는다.
- develop/v0.3.0: 별도 개발. releases/v0.3.0의 독립 코드·.dev-data·환경 마커·포트·쿠키·Control Center 개발 설정을 준비한다. releases/v0.2.0을 다음 개발 코드로 덮어쓰지 않는다.
- v0.3.0은 개발 시작(완료 차수0)이다. 향후 완료 차수1→v0.3.1, 차수2→v0.3.2, 이후 v0.3.n. 이번 준비만으로 차수1을 완료하거나 버전을 올리지 않는다. Git branch와 runtime family 폴더는 develop/v0.3.0 / releases/v0.3.0을 유지하고 제품 patch version을 증가시킨다.

## 이번 안전한 출시 보완

schemaVersion1 카드 포맷은 v017과 같은 정규화 구조로 읽는다. `legacy-card-compatibility.js`는 원본을 바꾸거나 허가를 승격하지 않는 구조/노출 개수 검사다. 실제 운영 카드·DB·키를 이관하지 않고 합성 자료만 시험한다. prototype/community 경로는 verified-only 정책을 우회하지 못한다.

이미지 사용은 텍스트 display 권한으로 암묵 허용하지 않고 별도 permissions.image를 요구한다. 미발매 카드는 runtime 경계에서도 공개 근거를 확인한다. 플래그/확인 reference는 법적 허가 자체가 아니며 자료 소유자의 권한·범위와 이미지/번역/모델 입력을 별도 검토해야 한다. 리프트나루 자료를 licensed/official로 재표시하지 않는다. 원본 카탈로그와 백업은 삭제·교체하지 않는다.

ready=false인 출시 후보는 production 마커와 환경 플래그를 함께 넣어도 store를 열기 전에 시작을 거절한다. staging/development 테스트는 별도 루트에서만 가능하다. `scripts/release-readiness.cjs`는 코드 manifest를 읽는 보고서이며 배포/SSH/계정/DB 접근을 하지 않는다. 모든 문서상 attestation을 채워도 authorizedToDeploy=false다.

## 실제 출시까지 필수 작업

1. 승인된 metadata 조사로 실제 systemd ExecStart/실행 계정/MainPID·자식·3001/3100/worker 소유 관계와 DataRoot를 확인한다. 관리자 API 앱 제어와 systemd 제어를 동일시하지 않는다. 환경/키/질문 본문은 출력하지 않는다.
2. 제한된 서버 브로커와 고정 SSH 쓰기 전송은 아직 미구현이다. 설치·최소 권한·호스트 검증·site inventory/승인/중복 방지/감사 계약을 검토하고 별도 승인을 받아야 한다. 현재 GUI 생산 배포는 차단하며 설정으로 켤 수 없다.
3. Caddy 실제 domain/import·config hash·TLS 보관/실행 계정·HTTPS 검사와 후보 서비스/port 예약을 확인한다. 기존 인증서/3100 비공개를 유지하고 검증된 include만 CAS·실패 복귀한다.
4. 실제 선택 앱을 독립 staging unit·포트·DB·키에서 기동하고 인증·카드/규칙 검색·AI mock·제보/관리·drain/PWA/부하를 검증한다. 8차 lab의 HTTP는 모의 서버여서 이를 대신하지 않는다. 실제 유료 AI/Riot 호출은 별도 승인 전 하지 않는다.
5. 실제 저장 형식과 키를 다루는 백업/독립 restore 훈련·wrap key 보관·권한/회전·암호화 오프호스트 보관·RPO/RTO를 확정한다. 앱/routing rollback을 우선하고 구버전에 새 DB를 덮지 않는다. 새 제보 보존·후속 읽기/이관도 별도 검증한다.
6. 권한 확인된 legacy 데이터만 v020 후보에 사용할 수 있다. Riot API 미승인은 무단 legacy 사용을 허용하지 않는다. 실제 공식 API를 쓰려면 승인·endpoint/mapper/언어/번역·정오표/공개 상태를 검증한다. 현재 실연동은 실행하지 않는다.
7. 개인정보처리자 연락처/법적 정보/처리 근거·로그/보관/삭제·외부 전송/동의 방식, Riot 고지/이용약관을 운영자가 확정한다. 임의 연락처/동의/허가를 채우지 않는다.
8. 정확한 출시 commit의 CI·실기기·staging/복구 증거와 권리 검토가 끝난 후 ready·운영 배포를 별도로 승인한다. branch 생성/테스트 통과/사용자 lab 성공은 배포 허가가 아니다.

## 보존

기존 feature 작업 폴더의 미커밋 변경은 보존한다. 새 작업 폴더는 코드만 sparse checkout하여 운영 자료/추적 SQLite 캐시를 복사하지 않는다. GitHub push는 새 두 branch에만 하고 원래 feature/main은 이동하지 않는다. 문서는 Markdown 원본이며 사용자 바탕화면은 이 클라우드에서 직접 접근하지 않는다.

## 브랜치별 실제 연결 범위

| 구성 | 현재 동작 | 실제 출시까지 남은 부분 |
|---|---|---|
| Azure SSH | Windows OpenSSH 호스트 검증·고정 상태 조회·기존 관리자 읽기 인증 어댑터 유지 | 이번에는 실제 VM에 접속하지 않음. 배포 쓰기 전송은 미구현 |
| 배포 catalog | gh 인증과 정확한 branch/commit CI 조회 어댑터 | 출시 승인·권리/사이트 inventory 확인을 대체하지 않음 |
| 제한 서버 브로커 | production target을 전송 전에 거절하는 인터페이스 | 서버 설치/최소권한, 고정 명령·경로 allowlist, operation ID·CAS·감사·조회 계약 구현 필요 |
| staging/서비스 | 임시 합성 HTTP·상태 머신·오류 주입; 독립 개발 앱 gateway 시험 | 실제 선택 release 코드의 Ubuntu staging unit/포트/manager/DB/키 기동 필요 |
| 백업/복원 | 임시 SQLite 온라인 snapshot·AES-GCM·별도 복원 probe 실제 실행 | 운영 schema·보관/권한·wrap key 분리·오프호스트 보관과 복구 훈련 필요 |
| 롤백 | 합성 경로 CAS·이전 앱 라우팅·양쪽 기록 보존 | 실제 Caddy include/CAS·systemd 전환·요청 drain·전환 후 신규 제보 보존 검증 필요 |

서버 조사 승인과 변경 승인은 구분한다. 실제 systemd unit/포트/Caddy 상태를 확인한 후에만 고정 inventory를 작성한다. `makeBackup`은 v017에서 purge를 먼저 수행하므로 읽기 전용 조사에서 호출하지 않는다. 백업은 GitHub/Codex/일반 로그로 보내지 않고 원격 서버 승인 이후의 별도 보안 경로로 보관한다. routing rollback 후 신규 버전 DB는 지우거나 구버전에 덮지 않으며, 후속 읽기/이관 계획과 RPO/RTO를 운영자가 확정한다.

## 다음 개발 버전 운영

`develop/v0.3.0`의 Control Center는 버전0.3.0, backend family v0.3.0, 별도 `%LOCALAPPDATA%\RiftAssist\ControlCenter-Development-v030`를 사용한다. 기존 출시용 설정·DPAPI 기록·실제 Azure 자동 연결 설정은 자동 복사하지 않는다. 개발 프로필은 새로 설정하며 실제 서버 접속은 별도 사용자 작업이다. 모의 환경의 기본 포트는3300/3301, worker3311/3312이고 세션/관리 쿠키도 별도다. 기존 v020 소스는 그대로 둔다.

향후 완료 차수 갱신 도구는 develop branch에만 있다:

```sh
node experiments/unified-rulings/scripts/version-development.cjs --expected 0.3.0
# 완료 코드를 commit하고 해당 exact SHA 테스트 증거 JSON을 준비한 뒤에만:
node experiments/unified-rulings/scripts/version-development.cjs --expected 0.3.0 --apply --proof /path/to/test-proof.json
```

증거 JSON은 `{ "schemaVersion":1, "version":"0.3.0", "commit":"<현재 40자 SHA>", "passed":1, "failed":0 }` 형식이다. passed에는 실제 통과 수를 기록한다. 도구는 증거의 진위를 독립 검증하지 않으며 CI/검토자가 실제 결과를 확인해야 한다. clean develop worktree와 version/차수/SHA 일치 시에만 코드 metadata·해시를 갱신한다. 자동 push·배포·DB 변경은 하지 않는다. 갱신 후 metadata 변경을 다시 검사·테스트하고 commit한다. crash로 lock이 남으면 자동 재시도하지 말고 metadata/해시와 Git diff를 확인한다. 시작0.3.0→첫 완료0.3.1→둘째0.3.2이며 family 폴더/branch/데이터 namespace는 유지한다.
