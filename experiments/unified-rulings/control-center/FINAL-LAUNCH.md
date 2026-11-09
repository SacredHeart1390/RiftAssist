# v0.2.0 설치·데이터 검증·최종 교체 승인서와 실행 절차

최종 통합 읽기 조사는 완료됐다. 새 조사·VM·상시 병렬 서비스·범용 배포 프레임워크는 만들지 않는다. 이 문서의 명령은 **아직 실행하지 않았고 승인 전 실행 금지**다. 코드/패키지는 ready=false, developmentOnly=true다. 다른 브랜치·원본 v017·운영 데이터·shared active.json은 수정하지 않았다.

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

설치 프로필은 owner hash에 고정된다. A만 승인했다면 B 승인으로 자동 승격하지 않는다. **가장 짧은 경로는 A와 B의 범위를 각각 명시하여 한 답변에서 승인**하고 그 범위에 맞는 profile을 먼저 확정하는 것이다. 별도 qualification용 profile/site를 최종 ready profile로 몰래 수정하지 않는다. 최종 배포는 새 불변 site를 만들고 동일한 global clean reference를 재사용할 수 있다. 서로 다른 site도 공통 service-operation.lock으로 중복 교체를 차단한다.

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

설치 receipt의 siteId/inventoryHash/clean reference hash를 대조한다. `sourceReady=false`, `operationalDataRead=false`, `serviceChanged=false`, `authorizedToDeploy=false`가 정상이다. profile 파일 SHA256과 receipt의 inventoryHash(JSON canonical digest)는 **서로 다른 값**이다. 이후 명령에는 receipt.inventoryHash를 쓴다.

## B. 운영 데이터 백업·독립 복원 검증 승인 — 짧은 중단, v020 공개 없음

명시적으로 승인할 범위:

1. main/helper 관계·unit/Caddy/helper SHA drift 및 EnvironmentFiles **참조 메타데이터** 확인. 원본 DataRoot의 `.env` 한 파일 참조 또는 참조 없음만 허용한다. 여러 파일/다른 경로/미지원 escape면 본문을 열지 않고 중단한다. 새 조사 코드를 만들지 않는다.
2. root 소유 helper drop-in `/etc/systemd/system/riftassist-autostart.service.d/90-riftassist-maintenance.conf` 생성과 daemon-reload. `ConditionPathExists=/var/lib/riftassist-replacement/autostart-enabled`가 없으므로 helper 실행을 막는다. 이 marker를 만들지 않는다. 원본 helper 파일/unit/enable 상태는 변경하지 않는다. 다른 drop-in/활성 helper/진행 job/남은 cgroup은 중단 조건이다. **mask는 사용하지 않아 /etc의 실제 unit 파일과 충돌하지 않는다.**
3. riftassist.service 중지, manager/gateway/worker cgroup과3100/3001/3011/3012 종료 확인. 이 뒤에만 DB/WAL·storage/manager/sessions 키·.env 및 systemd inline 환경설정 본문을 서버 메모리에서 처리한다.
4. SQLite backup API로 WAL의 commit을 포함한 일관 snapshot → DB·키·원본.env·unit/Caddy/owned override/inline 환경값을 AES-GCM으로 봉인 → 별도 프로세스의 새 임시 DB에서 integrity/schema/실제 암호문 복호화/키3개·설정 검사. DB 본체 단순복사·schema migration·원본 UPDATE 없음.
5. 원본은 유지하고 임시 평문은 제거한다. 암호화 archive와 wrapping key는 서버 private0700/0600에만 보관한다. GitHub/로그/PR/Codex/로컬 사용자 PC로 보내지 않는다. 단일 VM 내부 복원 검증이며 VM 소실 대비 외부 보관을 완료했다는 뜻이 아니다.
6. 검증 후 clean65 namespace+기존 DataRoot로 v017 복귀, 정상 관리자 login/start/HTTPS 검사. 완료 후 정확히 소유한 helper drop-in만 제거하고 daemon-reload하여 **다음 재시작/부팅의 원래 Wants 동작을 복구**한다. 제거 직후 /api/start를 반복 호출하지 않는다.

qualification의 v017 복귀는 유지보수 계약이다. 기존 코드·DB·키·쿠키·관리자·기록을 유지하지만 **AI 생성과 자동 수집은 보류**한다. 원래 unit EnvironmentFiles는 서비스 내부에서 reset하고 unsafe Node 주입 변수를 지운다. DB의 AI 설정을 덮어쓰지 않는다. AI 예산 대조와 최종 승인 전에는 과금 기능을 다시 켜지 않는다.

관찰된 4,462,168B의 DB/WAL/SHM 기준 보수적 예산은 메모리169,915,072B·디스크572,568,256B로 관찰 자원 안에 든다. 코드가 실제 실행 전 재검사한다. 16MiB snapshot 상한·여유 부족은 중단한다. 예상 중단은 수분의 유지보수 창으로 계획하되 실제 VM 시간은 아직 미측정이다. 10분 창을 제안하며 승인 시 사용자가 확정한다.

### 한 줄 실행 — 별도 B 승인 후에만

아래 `--approved-*`는 이미 받은 승인을 operator가 실행 의도로 전달하는 고정 entry다. flag 자체가 사용자 승인을 대신하지 않는다. public inventoryHash와 미리 정한 operation UUID만 인수로 받으며 키·쿠키·파일 본문은 인수에 없다. 같은 UUID 재실행은 기존 journal만 반환하고 새 stop/backup을 실행하지 않는다.

```bash
RIFT_INVENTORY_HASH='<설치 receipt.inventoryHash>'; RIFT_OPERATION='<기록해 둔 새 UUID>'
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw "$RIFT_ROOT/tools/replacement-serve.cjs" --approved-qualify-backup "$RIFT_INVENTORY_HASH" "$RIFT_OPERATION"
```

PowerShell5.1에서 shell 변수/함수 없이 직접 실행할 때는 다음 **독립 한 줄**을 사용한다. `<SITE>`, `<HASH>`, `<UUID>`는 위 승인된 값이다. 실패한 쓰기를 새 UUID로 재실행하지 않는다.

```powershell
ssh -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectionAttempts=1 -o ForwardAgent=no -o ClearAllForwardings=yes -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" azureuser@20.222.152.195 '/usr/bin/sudo -n -- /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw /var/lib/riftassist-replacement/<SITE>/tools/replacement-serve.cjs --approved-qualify-backup <HASH> <UUID>'
```

성공은 result.state=`qualified`, probe.integrity=true, keyNames에 필수3개, compatibility.schemaHash=기대값, limits/AI/hosting 검사 통과, health의 version=v017이다. runtimeConfig.requiresReview=true면 백업 자체가 정상이어도 **출시 설정은 미해결**이다. 원본.env/systemd 문법·미지원 항목은 임의로 버리지 않는다. cookie/session은 보존하되 관리자 메모리 login 세션은 정상 재로그인한다. HTTP/ok=true만으로 성공 판정하지 않는다.

## C. 최종 v020 교체 승인 — B와 별도

실제 권한 확인된 rules-only 후보·개인정보 문서·B 결과·복구키/백업 정책·최종 CI를 확인한 뒤, 사용자가 ready/developmentOnly 변경과 **exact 최종 source/profile/capsule의 교체**를 승인해야 한다. 현재 작업에서는 ready를 바꾸지 않는다. B용 site/profile의 hash/owner를 나중에 조작하지 않고 새 불변 최종 site를 준비한다. global inventory의 C profile 전환도 별도 설치 승인에 포함한다. 기존 journal이 qualified이고 두 lock이 없음을 확인한 뒤, 승인된 이전 inventory 파일 SHA를 CAS 확인하고 기존 public inventory를 이전 site에 보존한 다음 root-owned 새 파일을 atomic rename한다. 기존 DB/키나 owner를 덮지 않는다.

승인된 rules-only knowledge를 새 candidateData에만 준비하고 실제 active+manifest hash를 inventory에 pin한다. shared active.json을 고치지 않는다. 새 지식/자료 설치도 C 준비 승인에 명시한다. 리프트나루 카드·이미지·번역1527개/제3자 사례는 넣지 않는다. fallback에 노출될 기존 자료의 권리 범위도 별도로 확인해야 하며 clean65 검증은 자료 이용 허가를 부여하지 않는다.

환경 이전은 unit 인라인→EnvironmentFile 순서 또는 Node dotenv fallback의 실제 우선순위를 반영하고, 새0600.env에는 허용된 공급자 설정만 복원한다. 원본은 암호화 archive에 그대로 보존한다. 새 서비스 drop-in은 Environment와 EnvironmentFile을 reset하여 원래 파일의 키/포트가 새 DataRoot 설정을 덮지 않게 한다. launch descriptor가 root-owned인 조건과 full code/knowledge/schema/key hash 경계를 유지한다. liveProviderApproved와 generationEnabled의 실제 공개 서비스 승인 여부는 사용자가 정한다. 모델명은 검증된 기존 설정을 보존하며 강제 변경하지 않는다.

실행 순서: helper guard → drift/자원 → old stop/cgroup/ports → 새 일관 backup/독립 restore → 새 데이터 사본·v020 release pointer만 조정 → owned main drop-in CAS → daemon-reload → 같은 riftassist.service 시작 → 관리자 인증/앱/규칙/HTTPS200/TLS/공개 api/release 검증. Caddy/도메인/인증서/443/3001/3100 유지, 버전 동시 실행 없음. 실제 유료 AI를 health check로 호출하지 않는다.

```bash
/usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 /usr/bin/node --disable-proto=throw "$RIFT_ROOT/tools/replacement-serve.cjs" --approved-replace "$RIFT_INVENTORY_HASH" "$RIFT_OPERATION"
```

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

- 공개/AI 입력 허가와 최신성이 확인된 **실제 규칙 파일 및 출처·권리 검토 reference**. 최소 카드0/사례0. legacy fallback 데이터의 공개 범위에 대한 권리 검토도 필요하다. 권리 미확인을 운영 승인만으로 대체하지 않는다.
- 개인정보처리자 성명/법적 명칭, 연락처·권리 행사 창구, 처리 근거/고지·동의/국외 이전·위탁 해당 여부, 실제 시행일. 현재 동의 수집 전용 기능이 없으므로 제출 자체를 동의로 간주하지 않는다. v1.0까지 미룰 항목이 아니다.
- 백업 보관·파기 기간, 접근자, VM 외부의 암호화 보관 장소와 **복구키 분리 보관 담당/방법**, 목표 RPO/RTO 및 유지보수 시간. 현재 archive 자동 삭제는 없다. 실제 backup/key 반출은 별도 승인 전 하지 않는다.
- 기존 한도·모델은 보존한다. 최종 라이브에서 AI를 켤지, 복귀 시 일시 중지한 예산을 대조한 뒤 켤지 명시한다. 개발/CI는 계속 mock이고 유료 호출을 하지 않는다.
- A 코드 설치, B 중단/데이터 처리·복원 검증, C ready 변경·최종 교체(조건부 자동 복귀 포함)의 **각 승인**. A+B를 명확히 구분해 함께 승인할 수 있으나 C를 포함했다고 가정하지 않는다.

이번 작업은 코드·합성 검증·패키징만 수행한다. 운영 schema/키 복호화·백업·데이터/법적 조건이 확인되지 않은 상태를 verified/ready=true로 바꾸지 않는다.
