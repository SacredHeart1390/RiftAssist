> 2026-11-06 확인 결과와 새 승인안: [추가 경로·autostart 조사](SOURCE-EXTRAS-AND-AUTOSTART.md). UID/GID1000/1000·Node v24.22.1·Caddy 활성 경로가 확인됐습니다. 기준65개 hash 일치와 전체 referenceVerified=false를 분리하며 추가 경로/helper 동작 검토 전에는 교체를 차단합니다. 이전 문서의 이 항목들에 대한 미확인 표기는 이 관찰로 갱신합니다.

# v0.2.0 단일 서비스 교체 — 최종 준비 확인표

2026-11-06 갱신. release/v0.2.0 전용. **실제 Azure 설치·DB/키 접근·중지·배포 승인이 아니다. ready=false를 유지한다.** 추가 VM 없이 기존 VM/도메인/HTTPS/Caddy/3001/3100에서 앱 한 버전만 실행한다. 사용자 제공 메타데이터 외 운영 정보는 미확인이다.

## 1. 완료된 기존 읽기 조사 및 새 승인 범위

기존 두 조사는 사용자 PC에서 완료됐다. 재실행이 필요할 때만 다음 기존 절차를 사용한다. 새 추가 경로/helper 조사는 SOURCE-EXTRAS-AND-AUTOSTART.md의 별도 승인이 필요하다. Windows 패키지를 새 폴더에 해제하고 EXE가 있는 최상위에서 PowerShell을 연다. 아래 하나의 절차는 두 원문을 모두 검증한 뒤 승인된 조사 두 개만 순차 실행한다. 최초 Verify는 SSH 없이 검사한다. 키 내용·환경값·DB·질문/제보·일반 stderr를 읽거나 출력·저장하지 않는다. 실제 SSH 접속 로그와 소량 조회 부하는 생긴다. 프로필의 고정 대상은 azureuser@20.222.152.195, Windows OpenSSH, 기존 known_hosts/riftassistant-key.pem 경로다. 대상이 바뀌었다면 실행하지 않고 절차부터 재검토한다. 보안 정책/실행 정책을 낮추지 않는다.

```powershell
# ZIP 최상위. 다운로드한 패키지가 성공한 release/v0.2.0 CI의 것인지 먼저 확인.
& .\Invoke-ReleasePreparation.ps1 -Mode Verify -PackageDirectory (Get-Location).Path
# 이미 승인된 읽기 조사만 실행. 파일/결과 자동 저장이나 재시도 없음.
& .\Invoke-ReleasePreparation.ps1 -Mode Inspect -PackageDirectory (Get-Location).Path
```

실행 원문은 **a7dbf966f7361dfa9fba34416caf6409bfcd6047**에서 변경하지 않았다.

| 원문 | SHA256 |
|---|---|
| inspect-replacement-topology.py | 6d0a68ff75eeccc45235d5607b72704ef9079f159d94f1fc52bf74acd36cbfa1 |
| inspect-legacy-source.py | 5d353f19ff44ff1218ddfdc5b09e4fa5a2126f29c6fa24fc9404cb56d2a98166 |

공유할 것은 두 검증된 JSON의 메타데이터·hash 결과뿐이다. 예기치 않은 원시 SSH 출력/로그/키/DB는 보내지 않는다. source referenceVerified=false면 복귀 기준이 없으므로 설치·교체를 계속 차단한다. topology의 behaviorVerified=false는 helper의 실제 동작이 확인됐다는 뜻이 아니다. 참조 스크립트가 있으면 별도 승인된 범위로 검토한다. 443 소유/숨겨진 환경 확장·wrapper는 이 조사로 확정하지 않는다.

## 2. 설치 이전 확정할 사항

- [ ] main/develop/feature/PR1 보존, release SHA와 Windows/Ubuntu/브라우저 CI 성공 확인.
- [ ] Azure의65개 v017 소스가 고정 Git 원본과 일치하고 deploymentCodeHash 확보. 원본·manifest 수정 금지.
- [x] 사용자 보고 UID/GID1000/1000, Node v24.22.1, Caddy 활성 경로 /etc/caddy/Caddyfile 반영.
- [ ] 실제 unit FragmentPath/drop-ins/ExecStart/WorkingDirectory/KillMode/cgroup 확인. 현재 어댑터는 승인 inventory의 정확한 Node 버전과 /etc/systemd/system/riftassist.service를 검증한다. 실제 unit 경로가 다르면 코드/시험 수정이 먼저다.
- [ ] autostart의 시작·재부팅·오류복구 개입 확인. helper 조정·mask가 필요하면 원복안과 별도 승인. 현재 기본 어댑터는 미확인/enabled helper를 차단한다. 단순 mask만으로 v017의 장기 자동복구가 보장되지는 않는다.
- [ ] 현재 Caddy 설정 hash·도메인/인증서 확인. 활성 경로 /etc/caddy/Caddyfile은 확인됐다. Caddy 변경/reload는 교체 작업에 없다.
- [ ] 추가 DB/외부 설정/필수 키·확장 파일·로그 보존 범위 확인. 현재 구현은 private/operations.sqlite와3개 확인된 키 및 DB 안의 설정/질문/제보/이력, unit/Caddy/owned override를 다룬다. 미확인 파일이 모두 백업된다고 가정하지 않는다.
- [ ] 승인된 knowledge 후보와 권한 증거, 개인정보 운영자 연락처/법적 정보·보관/삭제·국외 AI 전송 조건 확정. 기존1527개 카드/이미지/번역의 권한을 API 승인으로 대체하지 않는다.
- [ ] 백업 wrapping key 분리 보관·오프호스트 암호화 보관·접근자·보관기간·복구 담당자·RPO/RTO 확정. 이번 작업에서 실제 키/백업을 생성·복사하지 않는다.

## 3. 코드 전용 설치 패키지와 승인 분리

`staging/replacement-package.cjs`는 로컬의 검증된 v020 코드·고정 production broker 의존성만 새 디렉터리에 복사한다. codeReceipt의 전체 manifest/추가 파일 거절, symlink 거절, 비밀 패턴 검사를 적용한다. 운영 DB/키/knowledge/사용자 기록/개발용 서비스 실행 fixture는 포함하지 않는다. 합성 dev-fixtures는 앱 소스에 포함되지만 공개용 knowledge로 설치하지 않는다. 실제 source checkout에서만 다음처럼 만든다.

```javascript
// Node24, 로컬 저장소의 control-center에서 실행하는 준비 코드 예시. SSH 아님.
const M = require('./staging/replacement-package.cjs');
// siteId, commit은 검토한 실제 UUID/전체 release commit으로 제공한다.
const proof = M.prepare('../releases/v0.2.0', '/tmp/새로운-준비-폴더', {siteId, commit});
// 별도로 신뢰한 CI/검토 결과의 planSha256을 pin해 다시 검사한다.
M.verify('/tmp/새로운-준비-폴더', {expectedPlanHash: proof.planSha256});
```

실제 설치 대상을 `INSTALLATION-PLAN.json`에 명시한다.

| 패키지 | 제안 설치 위치 | 소유/제약 |
|---|---|---|
| candidate | /var/lib/riftassist-replacement/&lt;승인 UUID&gt;/releases/v0.2.0 | root 소유 코드, 기존 경로 없음 |
| site/tools, site/deployment | 같은 site의 tools, deployment | launcher 및 상대 require 의존성, root 소유 |
| broker/staging, broker/deployment | /usr/local/lib/riftassist-replacement/staging, deployment | 기존 staging과 별도 namespace, root 소유 |
| broker/riftassist-replacement-broker | /usr/local/libexec/riftassist-replacement-broker | 0755/root, 무인수·env-i 고정 실행 |
| 별도 검토 inventory | /etc/riftassist-replacement/inventory.json | root 소유, group/world 쓰기 금지, 실제 관찰 hash에 pin |
| 새 data | site/data/v0.2.0 | service 사용자 소유 private, 기존 루트와 분리 |

파일 hash 목록은 디지털 서명이 아니다. 성공한 CI commit·별도 전달/검토한 planSha256·후보 code hash와 일치해야 한다. 경로가 존재하면 덮어쓰지 않는다. broker 코드/권한/좁은 sudoers·SSH principal 설정, inactive 설치 및 root vault 생성은 **별도 설치 승인 후** 수행할 작업이다. 아직 서버 설치기나 자동 설치 명령을 운영 검증했다고 주장하지 않는다. 실제 unit/helper/권한 정보가 미확정이므로 설치 명령을 추측해 제공하지 않는다. 서비스 변경·Caddy 변경은 설치 범위에서 분리한다.

## 4. ready=false에서 실제 DB 호환성 확인하는 유지보수 단계

운영 DB/키 접근·중지를 포함하므로 **별도 유지보수 승인**이 필요하다. inactive 설치 후 inventory·topology/원본/개인정보/백업 정책/자원/설정 증거를 검토한다. `backup-plan` → 표시된 정확한 계획 승인 → `qualify-backup`은 기존 v017 중지 → 일관성 백업 → 독립 restore·schema/암호화/키/설정 검사 → 같은 v017 정상 인증·앱 시작 → HTTPS 검사 순서다. v020 실행/DB clone/라우팅 변경은 없다. ready=false 그대로 진행 가능하며 카드 권한 미확인 자료를 새 버전에 공개하지 않는다. 결과 qualified는 배포 승인이 아니다.

현재 DB16MiB 상한, MemAvailable ≥128MiB+8×DB, 여유디스크 ≥512MiB+8×DB를 검사한다. 초과하면 중단하고 더 큰 자원이나 streaming 도구를 별도로 검토한다. 887MiB VM에서의 실제 처리시간/최대 메모리는 실측 전이다. 독립 probe는 실제 저장 암호문의 복호화·integrity_check 및 schema hash/필수 키3개/한도/AI 플래그/publicOrigin을 확인하되 값·본문·키는 출력하지 않는다. 다른 schema는 자동 migration하지 않는다.

## 5. 최종 교체와 복귀

설치 승인과 실제 DB qualification, 권한/법적 확인, CI/수동 검수와 readiness 결정이 모두 끝난 뒤 **대상 SHA/VM/서비스·기존/신규 버전·백업/복구키·중단·복귀 범위를 표시해 별도 최종 배포 승인**을 받는다. 이 작업에는 ready=true 변경이 없다. 기존 자동 SSH/관리자 로그인은 설치나 배포 승인이 아니다.

1. 고정 broker의 preflight/status로 drift와 미확정 작업을 검사하고10분 유효 HMAC plan을 얻는다.
2. riftassist.service 중지1회 → manager/gateway/worker의 전체 cgroup와4개 포트 종료 확인. 관리자 /api/stop만 호출하는 것과 다르다.
3. 중지 상태에서 새 일관성 암호화 백업·독립 restore → 새 private에만 복원. 원본 DB/키·knowledge active를 직접 덮지 않는다.
4. 검증된 owned drop-in만 적용 → daemon-reload → 같은 service/새 manager 시작 → 기존 /api/login·/api/start. Caddy/3001/3100 유지.
5. 로컬 버전·규칙/정상 관리자 인증/상태와 HTTPS200/TLS·공개 /api/release=v020를 검사. health는 유료 AI를 호출하지 않는다.
6. 정상 교체 이후 수동 rollback도 별도 승인된 plan으로 실행한다. 새 DB/키/기록부터 백업·검증하고 구 코드/실행 설정으로 복귀한다. 새 기록은 별도 보존되며 v017 DB에 자동 병합되지 않는다.

중단 시간은 stop/backup/restore/start/health 및 실패 복구 시간이다. 현재 timeout 예산은 SSH클라이언트8분, systemctl125초/호출, manager 대기20초, 앱 health35초다. 실제 짧은 중단 시간을 보증하지 않으며 작업 전 사용자 공지를 정한다. 브라우저에 입력 중이던 질문을 자동 저장하거나 자동 유료 재전송하지 않는다.

**롤백 비용 보호:** 새 버전이 실행됐거나 정상 배포 뒤 복귀하면 구 unit의 기본 실행 설정을 보존하면서 소유 drop-in에 OPENAI_GENERATION_ENABLED=false를 설정한다. 구 DB의 호출 카운터는 새 버전 사용량을 포함하지 않으므로 비용/일일 한도 대조 전 생성 일시 중지가 필요하다. 규칙 검색/제보/관리자는 유지한다. 보존한 새 호출 기록을 검토하고 별도 승인으로 AI를 재개한다. 저장된 관리자 AI 플래그와 유효한 런타임 AI 상태가 다를 수 있으며 health/result의 aiPausedForBudgetReconciliation을 함께 확인한다. 자동 병합·자동 재개는 없다.

## 6. 실패·응답 손실·수동 복구

실패 쓰기/stop/start/앱 시작은 자동 재전송하지 않는다. 동일 operation ID는 기존 결과만 반환한다. 현재 작업이 새 앱을 기동한 후 실패하면 새 서비스 종료·포트 확인 → 소유 설정 복귀 → 원본 hash/키 확인 → 구 manager 정상 인증·앱 시작·health 순으로 보상한다. 외부 운영자의 override 변경은 덮지 않는다. 완료 기록 저장 실패 시 서비스뿐 아니라 영속 버전 포인터도 이전 버전으로 보상한다.

응답이 끊겼다면 기존 `SshReplacementClient`로 **status → inspect(operationId) → reconcile**만 수행한다. 읽기 조회는 승인창/재시작/파일 수정이 없다. reconciliation은 상태·설정 target·service 실행 여부를 표시하며 불일치를 성공으로 처리하지 않는다. 이 어댑터는 별도 설치 활성화가 필요하고 현재 WPF의 라이브 버튼은 비활성이다.

강제 종료 후 미확정 lock, 암호화 백업 무결성 실패, 외부 설정 변경, 복귀 실패는 recovery-required/uncertain으로 유지한다. **lock을 지우거나 DB를 덮는 범용 복구 명령은 제공하지 않는다.** 먼저 작업 ID·설정 hash·서비스/cgroup·어느 data root가 사용됐는지 확인하고 별도 복구 승인으로 고정 원본 실행 설정만 복구한다. 이 상태별 실제 수동 복구 명령은 topology/설치 inventory가 확정된 후 만들어야 한다. 공개 링크200만 보고 임의 재시작하지 않는다.

## 7. 배포 후 검수·보존

- [ ] HTTPS/TLS/공개 버전/manager·worker·포트, 관리자 자동 로그인·AI 설정/한도/제보 목록·상세.
- [ ] 허가된 카드 검색·관련 판정/규칙·저지 근거/KO·EN/AI disabled·한도·네트워크 오류 안내. 실제 유료 검수는 별도 승인.
- [ ] 기존 소유자의 질문·제보 접근, 새 제보 생성/조회, 쿠키·세션 경계. 이전 signed 쿠키는 복원된 동일 sessions.key로 검증된 경우만 owner/원래 만료를 유지하며 새 이름으로 전달한다. 개발 기본 환경은 분리한다.
- [ ] PC/모바일/PWA: network 우선, 새 캐시 marker 검증, API 미캐시, offline 법적 문서, 구 UI 열린 탭·새 UI와 구 서버 불일치 안내. 입력은 메모리만 보존. 실제 도메인/설치형 PWA는 사용자 실기기 검수 필요.
- [ ] 구 v017 소스65개/동결 DB/모든 키·검증된 백업·복구키·새 버전 기록을 보존. 삭제/정리·기록 병합은 자동 실행하지 않는다. 보존 기간·동의/삭제 요청 처리·백업 보존은 운영자가 확정한다.

독립 CI/합성 Ubuntu/Windows 검증은 실제 Azure DB·키·환경·실사용 부하나 법적 허가를 대신하지 않는다. 모든 증거가 확보되기 전 출시는 차단한다.
