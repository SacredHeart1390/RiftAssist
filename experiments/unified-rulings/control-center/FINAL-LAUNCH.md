# v0.2.0 최단 출시: 무중단 A 설치 → 한 번의 C 교체

Windows 단일 진입점은 [ONE-SHOT-LAUNCH.md](ONE-SHOT-LAUNCH.md)의 `START-RELEASE.cmd`다. 기존 엔진을 호출하며 A/C 표시·확인1회, 자동 설치/교체·receipt·같은 ID 상태 재조회를 제공한다. 미충족 권리/개인정보/복구키/ready 조건은 SSH 전에 차단한다. 사용자의 30일·운영자1인 백업 정책을 반영하되, 제공된 규칙 URL/운영자 명칭/이메일/외부 보관/키 보관의 대괄호 자리표시자를 확정값으로 쓰지 않는다. ready 검토본은 실제 설치하지 않는다. 아래 수동 명령은 해당 도구의 같은 작업 범위를 설명하는 복구/감사 참고이며 일상 출시에서 반복 붙여넣기를 요구하지 않는다.

최종 통합 읽기 조사는 완료됐다. 새 조사·VM·상시 병렬 서비스·범용 배포 프레임워크는 만들지 않는다. 이 문서의 명령은 **아직 실행하지 않았고 승인 전 실행 금지**다. 코드/패키지는 ready=false, developmentOnly=true다. 다른 브랜치·원본 v017·운영 데이터·shared active.json은 수정하지 않았다.

**2026-11-10 긴급 정정:** v020은 기존 v017의 카드 형식/기능과 개선사항을 합친 출시다. 카드0개/공식 API를 전제로 한 제한은 폐기한다. [카드 조사·호환 경로·권리 경계](LEGACY-CARD-LAUNCH.md)가 우선하며, minimum-release는 개발 보조용이다. 운영 자료 권리·보안·백업 검증은 해제하지 않는다. 전체 데이터 보존과 실제 공개/AI 권한을 구분한다.

## 기본 경로 — 독립 B 중단 생략

2026-11-10 KST. 8edab74의 교체 흐름을 확인했다. helper 해시 reader의 자기 재귀 1건은 파일 SHA256 계산으로 수정하고 실제 합성 파일 회귀로 검증한다. 그 외 운영 트랜잭션 순서·검증·실패 복귀 로직은 변경하지 않았다. `replace`는 첫 operation으로 바로 실행할 수 있으며 `qualified` 이력을 요구하지 않는다. **기본은 A 한 번과 C 한 번**이다. 독립 `qualify-backup`은 요청한 경우에만 쓰는 진단 기능으로 남긴다.

- 중단 전: 최종 코드/clean65 설치, 승인된 기존 카드 포함 후보를 **새** candidateData에 준비, 공개 inventory·정적 store/schema 계약·CI 확인.
- C의 한 번 중단 안: writer 정지 → WAL 포함 봉인 백업 → 독립 복원/복호화/schema/설정 검사 → 새 데이터 사본 → v020 시작·검증. 중간에 v017을 재기동하지 않는다.
- 통상 실패: 새 버전을 시작하지 않거나 정지한 뒤 clean v017+oldData로 복귀한다. **backup-integrity/정지·설정 불명확/복귀 실패는 강제 기동하지 않고 recovery-required**로 중단한다. 모든 실패에서 자동 복귀한다고 약속하지 않는다.

현재 ready=false 검토본을 먼저 설치하고 나중에 hash/owner를 바꾸면 설치를 반복해야 한다. **최종 규칙·개인정보·백업 정책과 명시적인 ready 소스 변경 승인을 먼저 확정하고, 그 최종 artifact/profile을 A에 설치**하는 것이 최단이다. ready 표시는 코드의 출시 적격성이고, A가 운영 기동을 허용하거나 C를 자동 실행한다는 뜻은 아니다. 현재 작업은 ready를 바꾸지 않았다.

## 확정 근거와 검증 경계

| 항목 | 사용자 최종 관찰 / 적용 정책 |
|---|---|
| main | riftassist.service, simple/on-failure/control-group, enabled; Node v24.22.1, UID/GID1000/1000 |
| 실행 구조 | manager3100/gateway3001/worker3011,3012; 기존 VM/도메인/443/Caddy 유지, 앱 버전1개만 실행 |
| main unit | /etc/systemd/system/riftassist.service, SHA256 `64fdc9a5864920bc599dedeaa3ee394b62e31e7132267c1cf9eb3b39a943d4d3` |
| Caddy | /etc/caddy/Caddyfile, SHA256 `8e0555371405aae75914650e0654efb403731a6975901bc529fc46609444fdfd`, upstream127.0.0.1:3001; 수정/reload하지 않음 |
| namespace | RootDirectory/RootImage/BindPaths/BindReadOnlyPaths/InaccessiblePaths 비어 있음, main drop-in0 |
| 환경 참조 | EnvironmentFiles **있음**, 실제 참조 경로는 전달받지 않아 추정하지 않음. 승인된 유지보수 preflight에서 경로 메타데이터만 검증 |
| helper | /home/azureuser/riftassist-autostart.py, SHA256 `5f84d469b9186eff14039068bdc84019fbd21c3e23b02b5bc8d6d0d93e9c6de1`,1000/1000,0664 |
| helper 동작 | source 구조 확인: 파일의 관리자 키로3100 login 최대30회, status 후 앱이 꺼졌을 때 start. 실제 script 실행 시험 아님 |
| 관계 | main→helper Wants, Requires/BindsTo 아님. helper→main Requires/After/PartOf, oneshot/on-failure, inactive/enabled |
| 자원 | 관찰 당시 MemAvailable595,943,424B, FreeDisk59,778,879,488B. 실제 실행 직전 다시 현재 자원 검사 |
| 데이터 | DB3,452,928B+WAL976,472B+SHM32,768B; .env436B,storage.key32B,manager/sessions.key각64B. 내용/schema/복호화는 **미검증** |

요약은 사용자 제공 사실이며 원시 조사 JSON을 새로 수집한 것이 아니다. 상세는 staging/azure-observations-2026-11-09.json. hash drift는 helper 제어 전, main 중단/설정 선택 전후에 검사하며 다르면 쓰기를 중단한다. helper script0664는 그대로 두고 hash를 재검사한다. v020에서는 실행을 차단한다. legacy 복귀 후 원래 사용자/그룹의 향후 변조 가능성까지 제거했다고 주장하지 않는다. chmod/chown으로 원본을 고치는 승인은 포함하지 않는다.

## A. 코드 설치 승인 — 운영 데이터 처리·서비스 변경 없음

승인할 대상은 **exact commit/CI/capsule plan SHA256/checksum manifest SHA256/완성된 public inventory SHA256/site UUID**다. CI의 `RiftAssist-v0.2.0-manual-release`는 코드 전용이고 root의 REPLACEMENT-INSTRUCTIONS.md가 이 문서다. 별도 approval-kit의 profile.review.json은 site/코드/Node/UID/GID/unit/Caddy/schema 기대값을 채운 **검토 초안**이다. flags/evidence를 일괄 true로 바꾸지 않는다. knowledgeHash의 64개0은 미제공 후보 표식이며 검증된 규칙 hash가 아니다.

승인 범위:

- 새 `/var/lib/riftassist-replacement-upload/<SITE>/code`에 검증 코드만 준비.
- root 소유·타 사용자 쓰기 금지의 `/etc/riftassist-replacement/inventory.json` 설치.
- 새 `/var/lib/riftassist-replacement/<SITE>`의 tools/deployment/releases/v0.2.0/data/v0.2.0 및 private/operations/backups/owner 생성, **새** vault.key 생성. 서비스 공통 잠금은 유지보수 실행 시에만 `/var/lib/riftassist-replacement/service-operation.lock`에 생성한다.
- `/var/lib/riftassist-rollback/<검증된65개 code hash>/v0.1.7` strict clean reference 설치/동일 hash 재사용. original node_modules/lock/코드·권한은 유지.
- installer는 기존 DB·키·.env·사용자 기록을 열지 않는다. unit/helper/Caddy를 바꾸지 않으며 신규 broker/port/sudoers를 설치하지 않는다.

설치 프로필은 owner hash에 고정된다. **별도 B site/profile을 만들지 않고 최종 A/C가 같은 불변 profile을 쓴다.** A 전에 C의 데이터 처리·복구 정책과 권한 설정도 검토해 고정한다. `runtimeEnvBackupApproved`는 사용자에게 데이터 처리 범위를 승인받았을 때만 true로 기록한다. 이는 C 실행 승인과 별개이며 실제 DB/키/env 본문은 C의 정지 확인 이후에만 처리한다. A 설치 승인만으로 C를 승인받았다고 간주하지 않는다. A와 C의 승인 범위를 각각 명시해 한 답변에서 승인하고 지정된 창에서만 C를 실행하는 방식도 가능하다.

최종 source/profile 확정 전의 zero knowledgeHash·ready=false review artifact는 실행용이 아니다. 이미 설치한 profile이 있다면 덮어쓰지 말고 검토하지만, **아직 설치하지 않았다면 미완성 profile로 A를 먼저 실행하지 않는 것이 최단**이다. 같은 clean65 reference는 재사용하며 service-operation.lock은 서로 다른 profile의 중복 작업도 차단한다.

### 설치 명령

먼저 승인된 code capsule과 public inventory만 기존 SSH/SCP로 새 사용자 업로드 폴더에 전송한다. DB·키·.env·백업을 업로드 폴더에 넣지 않는다. 업로드 및 아래 root 작업 자체도 A 승인 대상이다. 기존 대상이 있으면 중단하고 재실행/덮어쓰지 않는다.

회사 PC에서는 기존 Windows OpenSSH로 대화형 shell을 열고 **각 명령을 한 줄씩** 실행할 수 있다. .ps1 실행이나 실행 정책 변경은 필요 없다. SSH 개인키 내용은 전송/출력하지 않는다.

```powershell
ssh -F NUL -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ForwardAgent=no -o ClearAllForwardings=yes -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" azureuser@20.222.152.195
```

승인된 capsule을 압축 해제한 로컬 폴더에서 아래 업로드 3줄을 **각각 독립 한 줄**로 실행한다. `<SITE>`는 CI plan의 UUID다. 첫 mkdir 실패 시 후속 전송을 하지 않는다. approved-inventory.json은 승인된 공개 설정이며 키 파일이 아니다. Windows EXE·운영 DB·키·.env는 업로드 대상에 없다.

```powershell
ssh -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" azureuser@20.222.152.195 'umask 077; mkdir /home/azureuser/riftassist-code-<SITE>'
scp -F NUL -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" -r .\candidate .\rollback .\site .\INSTALLATION-PLAN.json .\SHA256SUMS .\REPLACEMENT-INSTRUCTIONS.md azureuser@20.222.152.195:/home/azureuser/riftassist-code-<SITE>/
scp -F NUL -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" .\approved-inventory.json azureuser@20.222.152.195:/home/azureuser/riftassist-inventory-<SITE>.json
```

이하 승인된 root 관리 shell에서 실행한다. `<...>`는 approval-kit/CI proof와 승인된 profile의 **실제 값**으로 먼저 채운다. 개인정보/키는 변수에 넣지 않는다.

```bash
RIFT_SITE='<SITE>'; RIFT_PLAN='<planSha256>'; RIFT_SUMS='<checksumManifestSha256>'; RIFT_PROFILE_SHA='<승인 inventory 파일 SHA256>'
RIFT_CODE="/var/lib/riftassist-replacement-upload/$RIFT_SITE/code"; RIFT_ROOT="/var/lib/riftassist-replacement/$RIFT_SITE"
test ! -e "$RIFT_CODE" && mkdir -p -m0755 "$RIFT_CODE" && cp -RP "/home/azureuser/riftassist-code-$RIFT_SITE/." "$RIFT_CODE/"
python3 -c 'import os,stat,sys; assert all((stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode) and s.st_nlink==1) for d,ds,fs in os.walk(sys.argv[1],followlinks=False) for n in ds+fs for s in [os.lstat(os.path.join(d,n))]),"capsule-shape-rejected"' "$RIFT_CODE"
chown -Rh root:root "$RIFT_CODE" && chmod -R u+rwX,go-w "$RIFT_CODE"
cd "$RIFT_CODE" && printf '%s  INSTALLATION-PLAN.json\n%s  SHA256SUMS\n' "$RIFT_PLAN" "$RIFT_SUMS" | sha256sum --check --strict
sha256sum --check --strict SHA256SUMS
```

링크/특수 파일/다중 hardlink·외부 pin/전체 hash를 확인하기 전에 package의 Node 코드를 root로 실행하지 않는다. root upload parent도 root 소유·타 사용자 쓰기 금지가 필요하다. 실패 후 기존 준비 폴더를 자동 삭제하지 않는다.

승인된 public inventory는 코드 밖에 준비하고, 링크가 아닌 일반 파일인지와 외부 SHA를 확인한 뒤 고정 위치에 설치한다. 기존 inventory는 덮어쓰지 않는다.

```bash
test ! -L "/home/azureuser/riftassist-inventory-$RIFT_SITE.json" && test -f "/home/azureuser/riftassist-inventory-$RIFT_SITE.json"
printf '%s  %s\n' "$RIFT_PROFILE_SHA" "/home/azureuser/riftassist-inventory-$RIFT_SITE.json" | sha256sum --check --strict
install -d -m0755 /etc/riftassist-replacement && test ! -e /etc/riftassist-replacement/inventory.json && install -m0644 "/home/azureuser/riftassist-inventory-$RIFT_SITE.json" /etc/riftassist-replacement/inventory.json
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw "$RIFT_CODE/site/tools/install-code.cjs" "$RIFT_PLAN"
```

설치 receipt의 siteId/inventoryHash/clean reference hash를 대조한다. `operationalDataRead=false`, `serviceChanged=false`, `authorizedToDeploy=false`를 확인한다. `sourceReady`는 승인된 최종 manifest 값과 일치해야 한다. 현재 검토본은 false여서 C가 차단되며, 나중에 현장 JSON만 true로 고쳐서는 안 된다. profile 파일 SHA256과 receipt의 inventoryHash(JSON canonical digest)는 **서로 다른 값**이다. 이후 명령에는 receipt.inventoryHash를 쓴다.

### A 후 무중단 사전 점검

설치 receipt의 inventoryHash로 기존 `preflight` endpoint를 조회한다. 아래는 승인된 root shell의 한 줄이며 코드/reference/unit/Caddy hash와 증거 목록을 검사하고 서비스는 중지하지 않는다. `readyForApprovedExecution`은 사전 gate 결과이며 배포 허가나 실제 DB 검증 결과가 아니다.

```bash
printf '%s\n' '{"protocol":"riftassist-replacement-1","requestId":"<새 request UUID>","inventoryHash":"<설치 receipt.inventoryHash>","method":"preflight","payload":{}}' | /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw "$RIFT_ROOT/tools/replacement-serve.cjs"
```

실제 DB/WAL·키·env 본문의 호환성은 여전히 미검증이다. C의 승인된 preflight에서 실제 unit/EnvFiles 참조/자원·helper 상태를 다시 확인하고, 정지 후 독립 restore/probe가 성공해야만 v020으로 간다. A에 사용할 **승인 기존 카드 포함 지식의 새 root 준비**는 원본 shared active.json/카드 자료를 변경하는 작업과 다르며, 최종 profile의 실제 knowledgeHash에 고정한다.

## C. 최종 운영 승인 — 백업·독립 검증·교체·조건부 실패 복귀를 한 번에

실제 권한 확인된 기존 카드 포함 후보·개인정보 조건·복구키/백업 정책·최종 source/CI·A 설치 receipt를 확인한 후 **하나의 최종 운영 승인**을 받는다. **실제 Azure DB 검증을 먼저 끝내기 위한 B 중단은 요구하지 않는다.** 실제 검증은 아래 C 내부에서 v020 기동 전에 반드시 수행한다.

사전 증거와 실행 중 증거를 혼동하지 않는다. inventory의 compatibility reference는 고정65개의 operations-store 코드와 v020 store 코드의 일치, 기대 schemaHash 및 CI에서 확인한 검사 계약을 가리킨다. `backupRestore` 검토 증거도 CI의 독립 복원 구현/시험 범위다. 운영 DB를 미리 읽었거나 이미 검증했다고 기록하지 않는다. `replace`의 `requireCompatible`, 독립 restore, `cloneBackup`의 schema/hosting/runtime-config 검사는 이 정적 증거와 관계없이 실행된다. 모르는 실제 설정은 성공으로 가정하지 않는다.

승인된 기존 카드 포함 knowledge를 새 candidateData에만 준비하고 실제 active+manifest hash를 inventory에 pin한다. shared active.json을 고치지 않는다. 새 지식/자료 설치도 C 준비 승인에 명시한다. 원래 카드1,527개/규칙/사례 파일은 보존한다. 공개·AI·이미지·한국어/사례 노출은 별도 검토 범위에 따른다. fallback에 노출될 기존 자료의 권리 범위도 별도로 확인해야 하며 clean65 검증은 자료 이용 허가를 부여하지 않는다.

환경 이전은 unit 인라인→EnvironmentFile 순서 또는 Node dotenv fallback의 실제 우선순위를 반영하고, 새0600.env에는 허용된 공급자 설정만 복원한다. 원본은 암호화 archive에 그대로 보존한다. 새 서비스 drop-in은 Environment와 EnvironmentFile을 reset하여 원래 파일의 키/포트가 새 DataRoot 설정을 덮지 않게 한다. launch descriptor가 root-owned인 조건과 full code/knowledge/schema/key hash 경계를 유지한다. liveProviderApproved와 generationEnabled의 실제 공개 서비스 승인 여부는 사용자가 정한다. 모델명은 검증된 기존 설정을 보존하며 강제 변경하지 않는다.

### 최종 운영 승인안 — 아직 승인되지 않음

- 대상: 승인된 exact source commit·CI·plan/checksum SHA·inventoryHash·site UUID·knowledgeHash, riftassist.service 및 아래 고정 경로.
- 기존 코드/DataRoot: `/home/azureuser/RiftAssist/experiments/unified-rulings/releases/v0.1.7`, `/home/azureuser/RiftAssist/experiments/unified-rulings`. 새 코드는 `/var/lib/riftassist-replacement/<SITE>/releases/v0.2.0`, 새 데이터는 같은 root의 `data/v0.2.0`.
- 시간/영향: 사용자가 정한 KST 유지보수 창에 main을 한 번 중단한다. 이 동안 웹/관리자 앱 접속이 중단될 수 있다. Caddy/HTTPS/도메인/443과 app3001/admin3100/worker3011·3012 구조는 유지한다. 별도 VM/상시 병렬 운영 없음.
- 포함: helper condition drop-in·daemon-reload, main/cgroup 정지, 운영 SQLite WAL 포함 snapshot, storage/manager/sessions 키·원본.env·systemd inline 환경·unit/Caddy/owned override를 **서버 내 AES-GCM 봉인**, 독립 프로세스 integrity/schema/모든 암호화 셀 복호화·키/한도/AI/hosting 검사. 원본 DB를 수정/마이그레이션하지 않는다.
- 성공 시: 새 private에만 복원하고 release pointer만 v020으로 조정, 환경 우선순위 검증, 새 코드/knowledge 해시 검사 후 owned main drop-in 선택·같은 service 시작. 정상 관리자 login/status, 앱/규칙 준비·HTTPS200/TLS·공개 버전 확인. health check로 유료 AI를 호출하지 않는다.
- 실패 시: 새 버전 미기동 또는 안전 정지 후 원본이 사용 가능한 조건에서 검증된 clean65+기존 DataRoot로 복귀. helper 부팅 동작 복구, AI/자동 수집 보류, 후보·새 기록 보존. 백업 무결성/정지·설정·복귀 불명확은 recovery-required로 유지하고 별도 수동 복구 승인. 실패 쓰기 자동 재전송/lock 삭제 없음.
- 제외: 기존 파일 삭제·무검증 덮어쓰기, 역 migration/새 기록 자동 merge, 미승인 카드·이미지·번역 공개/AI 전송, Caddy 수정, 백업/키의 GitHub·로그·Codex·PC 반출. 보관/분리 복구키 정책은 사전 확정하며 외부 보관을 구현·완료했다고 가정하지 않는다.

환경 참조는 approved preflight에서 oldData의 `.env` 단일 참조 또는 참조 없음만 허용한다. 다중/다른 경로·미지원 문법이면 범위를 임의 확대하지 않는다. 실제 unit/Caddy/helper hash·Node24.22.1·UID/GID1000·자원·정지 상태를 다시 검사한다. 이는 새 조사 개발이 아니라 이미 구현된 배포 전 drift 검사다.

관찰된 DB/WAL/SHM4,462,168B의 보수적 예산은 메모리169,915,072B·디스크572,568,256B이며 실제 자원으로 다시 검사한다. 16MiB snapshot 상한은 유지한다. 중단 시간은 아직 실제 VM에서 측정하지 않았으므로 수분으로 계획하고 **10분 유지보수 창을 제안**한다. 승인 시 실제 KST 창을 지정한다.

실행 순서: helper guard → drift/자원 → old stop/cgroup/ports → 새 일관 backup/독립 restore → 새 데이터 사본·v020 release pointer만 조정 → owned main drop-in CAS → daemon-reload → 같은 riftassist.service 시작 → 관리자 인증/앱/규칙/HTTPS200/TLS/공개 api/release 검증. Caddy/도메인/인증서/443/3001/3100 유지, 버전 동시 실행 없음. 실제 유료 AI를 health check로 호출하지 않는다.

```bash
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw "$RIFT_ROOT/tools/replacement-serve.cjs" --approved-replace "$RIFT_INVENTORY_HASH" "$RIFT_OPERATION"
```

회사 PowerShell5.1에서는 `<SITE>`, `<HASH>`, `<UUID>`를 승인된 값으로 채운 **다음 한 줄만** 실행한다. `<HASH>`는 설치 receipt.inventoryHash이며 승인 inventory 파일의 SHA256과 다르다. `<UUID>`는 실행 전에 로컬에서 생성해 기록한 operation ID다. 별도의 qualify-backup 명령은 실행하지 않는다.

```powershell
ssh -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectionAttempts=1 -o ForwardAgent=no -o ClearAllForwardings=yes -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" azureuser@20.222.152.195 '/usr/bin/sudo -n -- /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw /var/lib/riftassist-replacement/<SITE>/tools/replacement-serve.cjs --approved-replace <HASH> <UUID>'
```

값이 비어 있거나 review-only profile이면 실행하지 않는다. 단계별 수동 systemctl stop/start나 DB 복사 명령을 섞지 않는다. 실제 C의 관리자 로그인·앱·규칙·HTTPS/버전 검사는 엔진이 처리하며, KO/EN 질문·제보·브라우저/PWA/Control Center의 실제 사용 점검은 그 직후 수행한다. 실제 AI 표본 호출은 별도 비용/외부 전송 승인 범위다.

성공은 result.state=`completed`와 version=v020이다. v020은 helper guard를 유지한다. 부팅/manager 장애는 root-owned 런처가 매번 정상 login/start하며 systemd의 on-failure/control-group이 감독한다. worker 실패는 15초 간격 GET status로 감지해 owner를 실패 종료하고 cgroup 정리 후 다시 기동한다. 수동 앱 stop은 다시 시작하지 않는다. status 조회3회 연속 실패는 fail-closed, 세션 만료는 제한된 정상 재인증이다. start/settings 변경 요청을 주기적으로 반복하지 않는다. 새 main drop-in의 RestartSec5, 300초 내3회 제한으로 재시작 폭주를 막는다.

후속 확인: PC/모바일 KO·EN 질문/근거, 무권한 카드·사례 차단, 세션별 제보 등록/조회, Control Center 정상 자동 SSH/admin 인증, 한도·AI 상태, PWA 오래된 cache/이전 탭·cookie 동작. 실제 AI 표본 검수·외부 전송·비용은 별도 승인 범위다.

## 실패·수동 복귀

정상 배포 실패는 중지/버전·원본/설정이 검증된 조건에서 clean v017로 자동 복귀하고 helper 부팅 동작을 복구한다. backup-integrity 실패·writer 생존·guard/설정 drift·응답 유실·복귀 실패는 `recovery-required`로 차단한다. 임의 원본 실행/DB 덮어쓰기/새 stop·start 자동 재전송은 하지 않는다. 강제 종료 후 journal/lock은 남기고 status→reconcile→inspect부터 읽는다. lock 삭제나 uncertain 쓰기 재실행은 새로운 복구 승인이 필요하다.

기존 MAINTENANCE-CONSOLE.txt의 status/reconcile/inspect는 조회용으로 유지한다. site 잠금과 service-operation.lock 모두 강제 삭제하지 않는다. 실제 SSH 조회도 승인된 연결 범위에서만 실행한다. `--approved-*`에 동일 operation UUID를 다시 주면 상태만 조회하며 실행을 반복하지 않는다. 결과가 nonterminal이면 새 UUID를 만들지 않는다.

서버의 승인된 root shell에서 쓰기 재실행 없이 현재 상태를 보는 한 줄이다. `<UUID>`는 상관관계용 새 request UUID다. `method`를 `reconcile`로 바꾸면 실제 service/config target 메타데이터를 대조한다. `inspect`는 payload를 `{"operationId":"<원래UUID>"}`로 지정한다. 세 방법 모두 변경 요청을 실행하지 않는다.

```bash
printf '%s\n' '{"protocol":"riftassist-replacement-1","requestId":"<UUID>","inventoryHash":"<HASH>","method":"status","payload":{}}' | /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw "$RIFT_ROOT/tools/replacement-serve.cjs"
```

recovery-required에서 검증되지 않은 DB를 덮거나 기존 원본 ExecStart로 강제 시작하는 범용 복구 명령은 제공하지 않는다. status/inspect의 안전한 상태·실패 코드로 원인을 특정한 뒤, 보존된 verified backup/clean reference의 범위를 지정한 별도 복구 승인을 받는다. 이는 정상 rollback 명령과 구분된다.

정상 교체 후 수동 롤백은 **별도 승인**한다. 새 v020 기록/키/config를 먼저 봉인·독립 검사하고 old clean code+old DataRoot로 복귀한다. v020 DB·추가 제보는 그대로 보존하며 원본에 덮거나 역 migration/자동 merge하지 않는다.

```bash
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw "$RIFT_ROOT/tools/replacement-serve.cjs" --approved-rollback "$RIFT_INVENTORY_HASH" '<새 rollback UUID>' '<completed 배포 operation UUID>'
```

성공은 `rolled-back`, 새 기록이 남은 별도 candidate DB 존재, old HTTPS/admin/규칙 정상, AI 예산 pause다. helper guard 제거는 원본 hash·관계·enabled 상태가 유지된 때만 수행한다. 안전한 제거 결과가 불명확하면 자동 재시도하지 않는다. helper의0664 향후 변조 위험이나 원래 데이터 권한을 이 절차가 해결했다고 간주하지 않는다.

## 사용자가 결정/제공할 최소 항목

- 기존 카드 포함 snapshot과 그 출처/버전·공개/AI/한국어/이미지/제3자 사례 권리 reference. API 키 미발급 자체는 기술 기동 차단 조건이 아니다. Riot 앱/자산 정책 적용과 기존 자료의 이용 권한을 별도로 검토한다. legacy fallback 자료 공개 권한도 확인한다. 원본/권리 상태를 바꾸거나 자료 미확인을 운영 승인만으로 대체하지 않는다.
- 개인정보처리자 성명/법적 명칭, 연락처·권리 행사 창구, 처리 근거/고지·동의/국외 이전·위탁 해당 여부, 실제 시행일. 현재 동의 수집 전용 기능이 없으므로 제출 자체를 동의로 간주하지 않는다. v1.0까지 미룰 항목이 아니다.
- 백업 보관·파기 기간, 접근자, VM 외부의 암호화 보관 장소와 **복구키 분리 보관 담당/방법**, 목표 RPO/RTO 및 유지보수 시간. 현재 archive 자동 삭제는 없다. 실제 backup/key 반출은 별도 승인 전 하지 않는다.
- 기존 한도·모델은 보존한다. 최종 라이브에서 AI를 켤지, 복귀 시 일시 중지한 예산을 대조한 뒤 켤지 명시한다. 개발/CI는 계속 mock이고 유료 호출을 하지 않는다.
- 최종 source-ready 표시 변경의 명시적 승인, A 무중단 설치 승인, **백업/독립 검증/중단/교체/조건부 복귀를 모두 포함한 C 운영 승인**. 독립 B 실행 승인이나 B 결과를 기본 출시 조건으로 요구하지 않는다. A/C는 각각 범위를 명시해 함께 승인할 수 있으며 어느 하나를 다른 승인의 대용으로 간주하지 않는다.

이번 작업은 코드·합성 검증·패키징만 수행한다. 운영 schema/키 복호화·백업·데이터/법적 조건이 확인되지 않은 상태를 verified/ready=true로 바꾸지 않는다.

## 선택 진단: 독립 qualification은 기본 출시 경로가 아님

`--approved-qualify-backup`은 호환성 문제를 별도로 조사하기로 사용자가 선택한 경우에만 유지한다. 현재 최단 A→C 경로에서는 실행하지 않으며, 이전 B 절차/두 site 제안은 이 문서의 기본 경로에서 폐기했다. 독립 restore **검사 자체**는 C 안에서 그대로 강제된다.
