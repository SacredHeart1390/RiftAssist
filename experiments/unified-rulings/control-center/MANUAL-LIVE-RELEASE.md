# 가장 빠른 안전 경로: 수동 SSH + 기존 일회성 교체 코드

2026-11-09 한국. 실제 SSH/설치/운영 DB·키·설정 접근/서비스 제어/배포를 이 작업에서 실행하지 않았다. ready=false다. 모르는 운영값을 채우거나 현재 package를 배포 가능하다고 선언하지 않는다.

## 경로 선정과 필수 범위

| 경로 | 현재 사용 범위 | 출시 필수 여부 |
|---|---|---|
| 수동 SSH, 일회성 replacement-serve 실행 | 기존 engine/Ubuntu IO/vault/독립 restore/HMAC 계획·중복/감사 재사용 | **선택한 초기 출시 경로** |
| CC 원클릭 + 상시 wrapper/sudoers broker | 기존 구현/합성 UI 보존, 실제 설치·활성화 안 함 | 후순위. 완성/설치는 필수 gate가 아님 |
| 별도 VM/상시 두 버전/staging VM | 요구하지 않음 | 추가 Azure 비용을 만들지 않음 |

manual-ssh capsule은 candidate 코드와 site/tools·상대 의존성·SHA256SUMS·설치 계획만 가진다. permanent broker/wrapper 파일이 없으며 새 서버 포트/서비스/sudoers가 필요 없다. 필요할 때 기존 SSH 관리자가 root 소유 tools/replacement-serve.cjs를 **한 번의 프로세스로 직접 실행**하고 JSON 요청을 stdin으로 보낸다. 같은 entry를 재사용하는 것이며 새 원격 프로그램/임의 명령 API를 추가하지 않는다. 도구 위치가 다른 site이면 거절한다. 실제 설치·root 권한은 별도 승인이 필요하고 sudo가 없거나 제한돼 있으면 변경 없이 중단한다.

## 1. 읽기 조사 — 하나의 승인안

기존65개 hash 일치/추가 경로 미확인, helper inactive/enabled 상태는 아직 해결됐다고 볼 수 없다. 기존 inspect-release-blockers.py(변경하지 않은3fce…원문)와 고정 유지보수 메타데이터 보충만 묶어 제안한다.

| 원문 | SHA256 / 범위 |
|---|---|
| inspect-release-blockers.py | 3fce265ce5d45dec329f79f31a4b08122b84bd37bc32240a25f2ce2dfc7c328a / 기존 코드 영역의 추가 항목 메타데이터·3개 unit 실행 형태/의존성. 내용/하위 목록/키·환경값 미출력 |
| inspect-maintenance-metadata.py | e281e31584353aa2a17281d5cfa9bc890f66fdbc759389852d1d07b35b83484f / 관찰된 shared DataRoot의 .env, operations.sqlite/WAL/SHM, storage/manager/sessions.key **lstat 존재·크기·권한/UID/GID만**, MemAvailable 및 디스크 여유 |

보충 원문은 DB/키/env 파일을 열거나 hash하지 않으며 SQL/schema·키값을 읽지 않는다. private parent link면 내려가지 않는다. 읽는 파일 본문은 공개 커널 카운터 /proc/meminfo만이다. 두 원문 모두 sudo/쓰기/서비스 제어/설치/HTTP 호출이 없고 stdout은 제한된 JSON이다. 정상 SSH 접속 로그·작은 조회 부하 및 마운트 정책에 따른 메타데이터 atime 가능성은 남는다. 실제 서버에서 두 원문을 실행하지 않았다. 새 메타데이터 범위도 별도 승인 대상이다.

회사 PC의 .ps1 정책을 바꾸지 않는다. ZIP 최상위에서 **INSPECT-CONSOLE.txt를 텍스트로 열고 그 안의 literal function 전체를 PowerShell5.1 콘솔에 붙인다. 파일을 실행하거나 Invoke-Expression/ScriptBlock로 읽어 실행하지 않는다.** 마지막 기본 명령은 Verify뿐이며 두 SHA를 확인하고 SSH0회다. ConstrainedLanguage 등 추가 회사 정책으로 콘솔 자체가 제한되면 우회하지 말고 정책/실행 오류를 보고한다.

```powershell
# 함수는 INSPECT-CONSOLE.txt의 본문을 직접 붙여넣어 정의한다.
Invoke-RiftAssistPredeploymentInspection -Mode Verify -PackageDirectory (Get-Location).Path
# 두 원문/해시/범위를 별도 승인받은 뒤에만 사용자가 직접 실행:
Invoke-RiftAssistPredeploymentInspection -Mode Inspect -Approved -PackageDirectory (Get-Location).Path
```

최초 함수/기본 Verify는 CI에서 실제 Windows PowerShell5.1로 검사한다. 두 원문 모두 먼저 검증한 뒤에만 SSH하며 StrictHostKeyChecking을 유지한다. 키 **경로**만 OpenSSH에 지정하고 관리자/SSH 키 내용·쿠키는 출력/설정/인수/클립보드에 넣지 않는다. raw stderr/잘못된 JSON은 공유하지 않는다. 두 결과의 안전한 메타데이터만 전달한다. 기존 두 승인된 조사 wrapper의 허용 범위를 몰래 바꾸지 않았다.

결과로 원래65개와 추가 경로를 분리 검토하고 helper의 실행·부팅·오류복구·원복 정책을 확정한다. 추가 항목 삭제/이동/자동 allowlist 확대는 없다. helper가 별도 스크립트를 참조하면 내용을 추정하지 않는다. 조사만으로 부족한 코드/설정 내용이 있으면 표적과 비밀값 보호 범위를 특정해 승인받는다. 정상 산출물이라고 추정하여 원본 검증을 끄지 않는다.

## 2. 출시 기준과 불변 package

최소 범위는 MINIMUM-LIVE-SCOPE.md를 따른다. 권한 확인된 rules-only로 출시 가능하며 Riot API나 모든 legacy 카드 허가를 기다리는 것은 필수 조건이 아니다. 사용하는 규칙의 권한/현재성·개인정보 법적 항목은 필수다.

현재 CI의 manual artifact는 **검토용, ready=false**다. 실제 readiness 변경은 별도 승인받아 source commit으로 만든 뒤 동일 CI/packaging을 다시 수행한다. 승인된 최종 commit에서 새 site UUID/root를 정해 마지막 운영 profile을 만든다. initialized site는 inventory/code/knowledge hash에 고정되므로 나중에 ready·commit·evidence를 바꾸어 기존 owner를 속이지 않는다. qualification이 별도로 필요하면 그 검토 site를 보존하고 최종 배포에는 새 불변 site를 쓴다.

별도 Ubuntu proof artifact의 control-center-manual-package-proof.json은 exact commit, planSha256, checksumManifestSha256, expectedSchemaHash를 제공한다. schema는 CI의 **새 빈 DB**에서 계산한 기대값이며 운영 DB 검증 결과가 아니다. 실제 snapshot/probe가 중지 후 이를 다시 비교한다. 승인된 package/knowledge/설정 profile을 로컬에서 검토하고 고정한 후 source-only upload를 승인받는다.

package의 siteId로 제안하는 대상은 /var/lib/riftassist-replacement/<UUID>/releases/v0.2.0 및 같은 root의 tools, deployment, data/v0.2.0이다. 기존 /home/azureuser/RiftAssist/experiments/unified-rulings와 그 v017 릴리스는 유지한다. 기존 unit FragmentPath/drop-ins/current Caddy hash 등은 실제 결과로 확정한다. 고정 inventory 위치는 /etc/riftassist-replacement/inventory.json이며 비밀값은 넣지 않는다. unit/Caddy hash 계산도 실제 설정 파일 처리 권한을 승인받은 범위에서만 한다.

## 3. 승인된 코드 준비 — 서비스는 아직 계속 실행

이하 Linux 명령은 **별도 설치/설정 처리 승인 후**, 확인된 profile/정확한 capsule을 대상으로 운영자가 수행할 템플릿이다. 변수를 추정값으로 채워 실행하지 않는다. source upload·root-owned 복사·새 backup wrapping key/owner 생성도 서버 쓰기다. 현재 실행하지 않았다. 준비 중 서비스/기존 DB/키는 건드리지 않는다.

```bash
# CODE는 승인된 코드 전용 capsule을 받은 새 작업 폴더. hash들은 CI proof에서 독립 확인.
# 기존 .env/DB/키/백업은 이 CODE 안에 넣지 않는다.
set -eu
cd "$CODE"
printf '%s  INSTALLATION-PLAN.json\n' "$PLAN_SHA256" | sha256sum --check --strict
printf '%s  SHA256SUMS\n' "$SUMS_SHA256" | sha256sum --check --strict
# 먼저 symlink/hardlink·범위 밖 항목이 없음을 확인하고, 아래 목록의 코드만 대상으로 한다.
sha256sum --check --strict SHA256SUMS
```

압축/복사 중 경로 traversal·링크·추가 파일·존재하는 대상은 거절한다. 서버 사용자 쓰기가 가능한 upload에서 root 코드로 실행하지 않는다. 새 root 전용 준비 폴더에 안전하게 코드만 복사하고 동일 외부 pin과 전체 SHA를 다시 검사한 뒤 사용한다. Node verify만 믿고 아직 검증하지 않은 package 코드를 root로 먼저 실행하지 않는다. GNU checksum 파일도 외부 pin이 맞아야 신뢰한다. 공개 package hash는 디지털 서명/허가를 대신하지 않는다.

검토한 inventory는 installationApproved/inventoryVerified, exact source/oldCodeHash·unit/Caddy·knowledge·expected schema/Node v24.22.1/UID·GID1000·ports3100,3001,3011,3012와 사실별 reference를 담는다. false/미확인 예시를 일괄 true로 바꾸지 않는다. 기존 drop-in은 경로/hash별로 configuration.dropInHashes에 검토해 pin하며 미등록/변경된 drop-in은 거절한다. runtimeEnvBackupApproved는 .env 내용의 **서버 내 암호화 백업·복원**까지 승인받았을 때만 true다. liveProviderApproved는 기존 과금 서비스와 외부 전송·실제 사용자 생성 활성화를 검토·승인받았을 때만 true다. 이번 예시/작업에서는 이 승인을 만들지 않았다.

이미 검증한 root 소유 capsule 도구와 승인 profile로 R.config→R.initialize를 호출하여 **새 root만** 초기화한다. 아래처럼 기존 모듈을 사용한다. profile 경로는 고정이고 CODE/UUID는 검토 package에서만 가져온다. source/runtime/기대 schema 검토는 사전 근거이며 실제 DB/키 검사는 뒤의 transaction 안에서 별도로 필수 실행한다.

```bash
# 승인된 root 전용 shell에서만. 실제 값 확정 전 실행 금지.
/usr/bin/node - "$CODE/site/tools/replacement.cjs" <<'JS'
const fs=require('node:fs'),R=require(process.argv[2]);
const raw=JSON.parse(fs.readFileSync('/etc/riftassist-replacement/inventory.json','utf8'));
R.initialize(R.config(raw)); // 대상이 존재하면 거절. 기존 source/data를 덮지 않음.
JS
# Root는 승인 inventory의 /var/lib/riftassist-replacement/<UUID>와 정확히 일치해야 한다.
test ! -e "$ROOT/releases/v0.2.0"
cp -R -P -- "$CODE/candidate" "$ROOT/releases/v0.2.0"
cp -R -P -- "$CODE/site/tools/." "$ROOT/tools/"
install -d -m 0755 -- "$ROOT/deployment"
cp -P -- "$CODE/site/deployment/lab.cjs" "$ROOT/deployment/lab.cjs"
```

도구/코드는 root 소유·타 사용자 쓰기 금지, 전용 global inventory는 root 소유/비밀값 없음, private/operations/backups는0700을 검증한다. 자동 chown으로 기존 운영 루트를 건드리지 않는다. 승인된 knowledge 후보만 새 data/v020/knowledge-releases에 준비한다. 로컬 planned pointer `{releaseId:<검토 후보>}`와 manifest에서 knowledgeHash를 미리 계산하여 profile에 pin하고, **새 data root에만** 이 pointer를 적용한다. 기존 shared active.json은 변경하지 않는다. candidate/private는 존재하지 않아야 한다. 새 snapshot 복원/worker 준비 때 service UID/GID를 부여하며 oldRoot의 권한/내용을 고치지 않는다.

broker wrapper/sudoers/새 service/Caddy reload는 설치하지 않는다. 기존 SSH 로그인과 승인된 sudo만 사용하며 권한이 부족하면 중단한다. 수동 Node 도구는 env-i/PATH/LANG만 지정한 정상 관리 shell에서 실행한다. API 키를 shell 인수/command/environment 출력에 넣지 않는다.

## 4. 일회성 요청과 실제 교체 승인

고정 원격 명령은 다음 한 프로세스다(실제 UUID 확정 후). stdin request는 ASCII protocol/UUID/hash/계획만이며 관리자 키를 받지 않는다. 기존 SshReplacementClient와 같은 protocol을 사용한다.

```text
/usr/bin/sudo -n -- /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw /var/lib/riftassist-replacement/<승인 UUID>/tools/replacement-serve.cjs
```

요청은 `{protocol:'riftassist-replacement-1',requestId:<UUID>,inventoryHash:<owner의 hash>,method:<아래>,payload:<아래>}`이다. PowerShell5.1에서는 hashtable을 ConvertTo-Json -Depth 12 -Compress로 만들고 기존 엄격 OpenSSH 명령의 stdin으로 보낸다. 원격 명령/경로/host를 사용자 입력으로 일반화하지 않는다. 연결·profile·현재 site/commit·작업 영향을 승인받기 전에는 보내지 않는다.

| 순서/목적 | method | payload / 승인 |
|---|---|---|
| 현재 작업 조회 | status | {} / 승인된 설치 이후 root metadata 읽기 |
| 사전 gate | preflight | {} / unit·설정 hash 내용 처리를 포함하므로 해당 권한 필요 |
| 선택적 별도 유지보수 | backup-plan → qualify-backup | {operationId} → {plan,approval:plan.digest} / 구 서비스 중지·DB/키/.env 백업·probe·구 앱 재시작 승인 |
| 최종 교체 계획 | plan | {operationId} / 대상 SHA/버전/백업·중단·실패 복귀 범위 검토 |
| 실제 교체 | replace | {plan,approval:plan.digest} / 설치와 구분된 **DB/키/config 처리·서비스 중지·라이브 교체 승인** |
| 응답 손실 확인 | inspect / reconcile | {operationId} / {} / 먼저 관찰, 쓰기 자동 반복 금지 |
| 정상 후 수동 롤백 | rollback-plan → rollback | {operationId,deploymentId} → {plan,approval:plan.digest} / 별도 승인 |

실제 profile 확정/설치와 연결 승인을 받은 뒤 MAINTENANCE-CONSOLE.txt의 literal function을 콘솔에 붙이면 같은 고정 entry를 호출할 수 있다. 이 파일도 실행하지 않고 텍스트를 붙이며 함수 정의만으로는 SSH가 없다. 아래 변수는 최종 승인 receipt에서만 가져온다. preflight는 설정 파일 내용의 hash 처리가 포함되므로 그 권한을 먼저 받아야 한다.

```powershell
Invoke-RiftAssistMaintenance -Method status -SiteId $siteId -InventoryHash $inventoryHash -ConnectionApproved
Invoke-RiftAssistMaintenance -Method preflight -SiteId $siteId -InventoryHash $inventoryHash -ConnectionApproved
$operationId=[Guid]::NewGuid().ToString('D')
$plan=Invoke-RiftAssistMaintenance -Method plan -SiteId $siteId -InventoryHash $inventoryHash -Payload @{operationId=$operationId} -ConnectionApproved
$plan | ConvertTo-Json -Depth 12
# 표시한 정확한 계획·데이터/서비스/최종 교체 승인을 받은 후에만:
$result=Invoke-RiftAssistMaintenance -Method replace -SiteId $siteId -InventoryHash $inventoryHash -Payload @{plan=$plan;approval=$plan.digest} -ConnectionApproved -OperationApproved
# 실패/중단 시 새 write를 보내지 않고 먼저:
Invoke-RiftAssistMaintenance -Method inspect -SiteId $siteId -InventoryHash $inventoryHash -Payload @{operationId=$operationId} -ConnectionApproved
Invoke-RiftAssistMaintenance -Method reconcile -SiteId $siteId -InventoryHash $inventoryHash -ConnectionApproved
# 정상 교체 이후 별도로 롤백을 승인받을 때:
$rollbackId=[Guid]::NewGuid().ToString('D')
$rollback=Invoke-RiftAssistMaintenance -Method rollback-plan -SiteId $siteId -InventoryHash $inventoryHash -Payload @{operationId=$rollbackId;deploymentId=$operationId} -ConnectionApproved
# 롤백 영향·신규 기록 보존을 확인하고 별도 승인한 뒤에만:
Invoke-RiftAssistMaintenance -Method rollback -SiteId $siteId -InventoryHash $inventoryHash -Payload @{plan=$rollback;approval=$rollback.digest} -ConnectionApproved -OperationApproved
```

10분이 지난 계획/다른 세대/다른 source/profile은 거절한다. 만료 시 자동 새 계획/재전송하지 않고 승인 범위를 다시 확인한다. 관리자 키는 이 protocol에 포함되지 않고 정상 관리자 인증은 서버의 기존 코드가 메모리에서 수행한다. 별도 UI나 .ps1 정책 변경은 필요 없다.

실제 DB 호환성 검증은 replace 안에서 **old service/cgroup·4개 port 종료 → SQLite online snapshot → AES-GCM DB·키·unit/Caddy/owned override·선택 .env 봉인 → 별도 프로세스 integrity/실제 암호문 복호화/schema/키3개·설정 검사 → 새 private 복원** 순으로 강제한다. 실제 schema/key가 맞는지 모르는데 compatibility=true라고 기록하지 않는다. compatibility 사전 reference는 비교한 store 코드/기대 schema/CI·이 필수 probe 계획을 가리킨다. 별도 qualification 없이 이 transaction에서 실검사 후 새 버전으로 갈 수 있어 불필요한 두 번의 중단을 요구하지 않는다.

이후 owned drop-in만 CAS 변경 → daemon-reload → 같은 riftassist.service의 v020 manager와 app 단독 기동 → normal login/status·HTTPS200/TLS·공개 /api/release·규칙 준비 확인 순이다. Caddy config/도메인/인증서/3001·3100은 유지한다. health는 실제 유료 AI를 호출하지 않는다. 실제 AI 표본 검수는 별도 승인/비용 범위가 필요하다. 원래 쿠키·제보 접근/KO·EN·관리자·브라우저/PWA도 검수한다. 실제 Windows10/모바일과 실제 VM887MiB workload는 CI로 보증하지 않는다.

.env는 원본 그대로 암호화 envelope에 보존하고, 새 경로에는 허용된 OpenAI 설정만0600으로 복원한다. port/DataRoot/로그 등 배포 제어 설정은 강제로 새 경계에 맞추고 개수를 기록한다. 모르는 설정/형식은 새 앱 기동 전에 차단해 구 앱으로 복귀한다. 유효한 백업인데 env 문법만 지원하지 않는 것은 백업 손상으로 오인하지 않고 qualification 결과에 review 필요로 남긴다. 실제 값·key/hash fingerprint는 결과/로그/Git에 출력하지 않는다. provider flag는 키 존재만으로 활성화하지 않는다. backup wrapping key와 DB key를 포함할 수 있는 봉인 파일은 서버 private에 두고 GitHub artifact/PR/Codex로 보내지 않는다. 오프호스트 암호화 보관·복구키·RPO/RTO·보관/삭제 정책은 운영자 필수 확인이다.

DB/snapshot16MiB, MemAvailable≥128MiB+8×DB, disk≥512MiB+8×DB 상한이 있다. 운영 lstat 결과가 크거나 WAL/부하가 불확실하면 중단하고 실제 백업에 맞는 도구/승인을 검토한다. 테스트가 작은 DB였다고 실제 데이터를 보증하지 않는다. 중단 예산은 기존 systemctl/앱/SSH timeout을 포함하며 실측 전 정확한 분 수를 약속하지 않는다.

## 5. 실패·복귀와 승인 범위

기동/health 실패의 자동 복귀는 **최초 교체 승인에 포함해 사전 승인한 transaction 안에서만** 실행한다. 새 서비스를 먼저 정지·writer/port 종료 확인 → 저장한 owned 설정 복귀 → 검증된 old source/key로 원래 manager 정상 인증·app 시작 → HTTPS/서비스 확인 순이다. old DB/키·source를 덮지 않는다. 새 버전이 기동했을 수 있으면 비용 한도 대조 전 AI 생성은 budget guard로 일시 중지하며 새 기록을 보존한다.

정상 교체 뒤 rollback도 새 DB/키/.env·신규 기록을 먼저 봉인/독립 검사한 뒤 old code/config로 복귀한다. 새 DB를 원본 위에 덮거나 역 migration·자동 병합하지 않는다. 새 제보는 v017 관리자에 자동 합쳐지지 않으므로 보존 사본의 별도 접근/이관은 후속 승인 작업이다.

응답 손실/강제 종료는 status→inspect→reconcile로 확인한다. 같은 실패 쓰기를 자동 재전송하지 않는다. 남은 lock·외부 override·복구 실패·불확실 단계는 recovery-required로 보존한다. transaction이 끝난 뒤 새로운 복구 변경은 **다시 별도 승인**한다. 이때 actual operation 단계/backup ID/base unit·Caddy·owned override hash/현재 cgroup·port를 확인해 저장된 old 설정으로만 복귀한다. unknown lock 삭제·원본 DB restore·임의 rm/kill은 제공하지 않는다. 이미 재가동된 버전을 추정해 또 재시작하지 않는다. 실제 사고 단계가 없는데 범용 destructive 복구 명령을 승인받은 것처럼 만들지 않는다.

## 6. 운영 승인 확인표

- 읽기: 위 두 원문과 SHA, code metadata 및 고정 private-file lstat/공개 자원만. 실제 SSH는 사용자가 실행.
- 설치: exact source/package/UUID/profile·known config hash 처리·새 root/vault/코드/knowledge 배치. 서비스와 기존 DB/키 내용은 아직 처리하지 않음.
- 데이터/유지보수: 운영 DB·3키/.env·unit/Caddy 봉인·서버 내 독립 restore, 중지/재시작 범위와 비밀 보관.
- ready 변경/최종 교체: exact 최종 commit/package·한 버전·같은 Caddy/ports·중단/사전 승인한 실패 복귀·health 범위.
- 후속 새 복구/정상 후 롤백: 신규 기록/백업 보존·변경 대상·실제 상태를 다시 검토/승인.

여러 범위를 한 승인 답변에 명시할 수 있지만 읽기/설치/데이터/최종 교체를 서로 자동 승격하지 않는다. 지금 요청할 수 있는 것은 코드/해시가 완성된 읽기 조사이며 나머지는 실제 결과·자료/개인정보 사실·최종 package를 확정한 후 구체적으로 요청한다.
