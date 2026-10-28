# 카드 데이터 관리자 검토·승인 인터페이스

격리된 v0.2.0 **개발 루트와 합성/mock 카드**만 허용한다. 실제 Riot 호출·유료 번역·운영 DB/키를 사용하지 않는다. 운영 v0.1.7과 공유 활성 포인터는 이 도구의 대상이 아니다. 실제 공식 출처를 허용하려면 Riot 승인/사용 권한·출처·매퍼·검토 환경을 검증한 별도 변경이 필요하다. 모의 번역을 공식으로 표시하는 후보는 거절한다.

## 검토 흐름

1. 기존 `sync:mock` 또는 번역 preview로 만든 카드·번역 검토 JSON/해시 manifest와 knowledge 후보를 `register`로 연결한다. 두 카드 스냅샷과 기준 규칙/사례·출처를 검증한다. 동기화 후보는 마지막 정상 관측과 일치해야 한다. 독립 번역 후보는 별도 knowledge ID를 명시한다.
2. `get`으로 변경 전후 카드·영어·한국어·비용/기호·출처·공개/미발매 상태·검증 경고·이전 번역을 조회한다. **데이터 항목과 번역 항목을 분리**한다. 불변 항목 fingerprint를 제공한다.
3. `decide`는 항목별 승인/거절/보류와 사유·관리자 식별자·시각을 저장한다. 한 요청 최대 50개를 전부 검증한 뒤 함께 반영한다. 승인에는 경고 코드별 확인이 필요하고 오류가 있는 번역은 승인할 수 없다. 보류/거절 후 새 사유로 다른 판단은 가능하며 이력을 덮어쓰지 않는다.
4. `stage`는 승인된 항목만 새 `review-<digest>` knowledge 후보로 구성한다. 미승인 항목 ID를 모두 명시적으로 확인해야 한다. 미승인 변경은 정상 기준 자료를 유지하고 미승인 신규 카드는 제외한다. 데이터 승인이 필요한 새 번역은 데이터 승인 없이 적용할 수 없다. 영어/정오표가 바뀌고 번역이 보류되면 한국어를 비워 영어만 구성할 수 있다. 누락 의심 승인은 삭제를 수행하지 않는다. 결과가 기준과 같으면 새 후보를 만들지 않는다.
5. 구성된 승인본의 해시·현재 버전·검토 revision을 확인하고 **별도 `activate` 최종 승인**을 보낸다. 이 단계는 별도 권한과 명시적 확인을 요구한다. `rollback`도 별도 권한·확인으로 정확한 정상 기준으로만 복귀한다. 기존 정상 파일과 이전 검토 이력을 삭제하거나 덮어쓰지 않는다.

승인만으로 활성화하지 않으며 일정 수집이나 관리자 시작에도 연결하지 않는다. 일반 manager/knowledge CLI의 `reviewed: true`만으로 카드 후보를 활성화할 수 없다. 메모리 내부 권한 객체는 JSON 입력으로 만들 수 없다. 관리 API/화면의 다른 기능은 유지한다. 기존 판정은 영어 원문과 명시적 번역 출처를 계속 사용한다.

표시 메타데이터가 제거된 일반 knowledge 릴리스도 마커가 있는 v0.2.0 환경에서 카드 내용이 달라지면 같은 최종 승인 경계를 요구한다. 카드가 같은 일반 규칙 자료 전환의 기존 경로는 유지한다.

## Control Center 연결과 인증

`scripts/card-review-control.cjs`는 **전용 자식 프로세스 stdio**를 사용한다. 새 HTTP/TCP 포트, 공개 라우트, 웹 관리자 화면은 없다. 운영 관리자 포트를 공개하거나 기존 관리자 인증키를 읽지 않는다. 아직 Windows GUI/설치 프로그램을 만들지는 않았다.

신뢰할 수 있는 로컬 부모가 Node 프로세스를 shell 없이 직접 실행하고 `stdio: ['pipe','pipe','pipe','pipe']`를 구성한다. 분리된 개발 루트만 `RIFTASSI_DATA_ROOT`로 지정한다. 부모가 만든 새 세션 ID와 전용 무작위 키·관리자/권한을 fd 3의 bootstrap JSON으로 한 번 전달하고 해당 파이프를 끝낸다. **키를 argv·환경변수·파일·콘솔·Git에 넣지 않고 기존 Riot/OpenAI/관리자 키를 재사용하지 않는다.** bootstrap은 최대 32KB다. 형식은 `{sessionId, credentials:[{id,actor,scopes,secret}], expiresAt?}`이며 `secret`은 메모리에서 생성한 32바이트 hex 문자열이다. 서로 다른 credential에 같은 키를 재사용하는 설정은 거절한다. operator의 실제 식별자/권한은 부모가 신뢰할 수 있게 연결해야 하며 임의의 실명/동의를 가정하지 않는다.

stdin은 UTF-8 한 줄 JSON 요청, stdout은 한 줄 JSON 응답이다. stderr는 일반 오류 코드 안내만 출력한다. 요청에는 `protocol: riftassist-control-1`, `sessionId`, `credentialId`, UUID `requestId`, UUID `nonce`, 밀리초 `issuedAt`, `method`, `params`, `signature`가 필요하다. `signature`를 제외한 요청을 `card-translation-core.stable`로 직렬화한 UTF-8 바이트의 HMAC-SHA256을 사용한다. `card-review-auth.signRequest`가 참조 서명기다. **C# 구현 시 정렬/JSON escaping/한국어 UTF-8가 정확히 같아야 하므로 교차 언어 golden vector 검증이 필요하다.**

서명·세션·시각 ±30초·nonce 재사용을 검사한다. 세션은 기본 1시간, 최대 24시간이며 매 시작 시 새 ID/키를 사용해야 한다. 권한은 서버 bootstrap에서 결정하고 요청의 임의 actor/role을 신뢰하지 않는다. 쓰기 요청의 네트워크 재시도는 같은 `requestId`/동일 method·params와 **새 nonce/issuedAt/서명**을 사용한다. 같은 작업은 이전 결과를 반환하고 다른 내용으로 같은 ID를 쓰면 충돌한다. 새 작업 ID로 같은 승인을 반복해도 거절한다.

요청 최대 1MB, 응답 2MB, 조회 최대 20항목(초과 응답은 더 작은 page로 조회), 일괄 결정 최대 50항목이다. 파이프는 20회 오류 뒤 종료할 수 있다. Windows에서는 부모/worker 실행 파일 신뢰·익명 파이프 상속·동일 사용자 ACL·설치/코드 서명·권한 상승 경계를 실기기로 검증해야 한다. Linux Node에서 자식 프로세스 서명 통신과 한국어 사유를 검사했으며 Windows 네이티브 검증을 완료했다고 주장하지 않는다.

## 메서드 계약

| 메서드 | 권한 | 주요 params |
| --- | --- | --- |
| `list` | `review:read` | `offset`, `limit`(최대 100) |
| `register` | `review:decide` | `candidateId`, `knowledgeReleaseId`, `reason` |
| `get` | `review:read` | `bundleId`, `offset`, `limit`(최대 20) |
| `decide` | `review:decide` | `bundleId`, `expectedRevision`, `actions[]` |
| `stage` | `cards:stage` | `bundleId`, `expectedRevision`, `acknowledgeExcluded[]`, `reason` |
| `activate` | `cards:activate` | `bundleId`, `expectedRevision`, `packageId`, `packageDigest`, `expectedActiveReleaseId`, `reason`, `confirmation` |
| `rollback` | `cards:rollback` | 활성화와 같은 식별/해시/버전 필드, `reason`, `confirmation` |
| `recover` | 의도에 맞는 활성화/롤백 권한 | `intentId`, `reason`, `confirmation` |
| `audit` | `audit:read` | `offset`, `limit`(최대 100) |

`actions[]`는 `{itemId, expectedFingerprint, decision: approve|reject|hold, reason, acknowledgeWarnings:[code]}`다. 사유는 비어 있지 않은 1,000자 이하로 기록한다. `get`은 항목 fingerprint, bundle revision, source digest, 준비된 package와 미완료 의도를 반환한다. 실제 개인 정보·키·질문/사용자 기록을 사유에 입력하지 않는다.

최종 `confirmation`은 `ACTIVATE_ISOLATED_DEVELOPMENT`, 롤백은 `ROLLBACK_ISOLATED_DEVELOPMENT`, 복구는 `RECOVER_ISOLATED_DEVELOPMENT`다. 이 문자열만으로 권한을 얻을 수 없으며 서명/권한·revision·후보/원문·현재 버전 검사가 함께 필요하다. 권한 분리는 제공하지만 서로 다른 두 사람이 반드시 승인하는 조직 정책은 구현하지 않았다. 실제 조직의 계정/권한·다중 승인 정책은 Control Center에서 확정해야 한다.

## 경쟁·오래된 승인 차단

항목 fingerprint, bundle revision, 원본/knowledge/기준 해시와 마지막 동기화 후보를 묶는다. 새 동기화나 새 검토 bundle, 후보 파일 변경, 기준 활성 버전 변경은 기존 쓰기/활성화를 차단한다. 승인본 구성 이후 결정이 바뀌어도 과거 최종 승인 계획은 무효가 된다. 동기화의 기존 잠금과 검토 journal 잠금을 공유 순서로 사용해 움직이는 자료에 결정을 쓰지 않는다. 경합은 갱신 후 재시도해야 한다. 감사 기록을 쓸 수 없는 경합/장애는 `review-audit-unavailable`로 거절할 수 있다.

활성화/롤백 완료된 bundle은 봉인한다. 롤백 후에도 과거 승인을 다시 자동 적용하지 않으며 새로운 후보/검토가 필요하다. 현재 동기화 엔진은 활성 기준 변경 시 중단하므로 승인본 활성화 뒤의 수집 재기준화는 여전히 별도 작업이다.

## 영속성과 복구·남은 한계

`DATA_ROOT/card-reviews/events/`에 관리자 ID·결정/사유·시각·해시·경고 확인·승인본·활성화/롤백 의도/결과를 **평문 JSON**으로 추가 저장한다. 기존 질문 암호화 키를 읽지 않는다. 이벤트는 배타적 링크와 순서/이전 해시 체인으로 연결하고 전체 이력을 재생해 상태를 얻는다. 임시 파일·잠금·손상 기록을 자동 삭제하지 않는다. read/거절도 감사 기록을 남기되 서명·키·원시 요청/거절 사유 본문을 저장하지 않는다. 활성화는 의도를 먼저 저장하고 기존 원자적 knowledge 포인터 교체기를 호출한 뒤 결과를 기록한다.

포인터 전후 장애가 발생하면 새 쓰기를 막는다. 운영자가 격리 루트의 잠금·미완료 의도·두 릴리스 해시·현재 포인터를 점검한 후 잔류 검토 잠금을 처리하고 `get.pendingIntents`/`audit`로 의도를 조회해 `recover`를 명시적으로 호출한다. 복구는 포인터가 의도의 시작/대상과 일치하는지 확인해 결과만 기록하며, 자동 재활성화/롤백하지 않는다. 알 수 없는 버전이면 수동 복구가 필요하다. 실제 운영 환경의 잠금 파일을 삭제하는 명령은 제공하지 않는다.

해시 체인은 우발적 변경/중간 손상을 검출하지만 파일 소유자가 전체 체인을 다시 쓰거나 마지막 부분을 잘라내는 공격까지 방지하는 외부 신뢰 앵커/WORM 감사 저장소는 아니다. Windows ACL/저장소 암호화·백업·fsync·디스크 장애·프로세스/OS 권한 경계 검증이 필요하다. 자동 만료/삭제·압축/체크포인트·보관 정책은 없으며 journal 10,000개/이벤트 16MB 한도에 도달하면 점검을 요구한다. 대규모 운영의 인덱싱·감사 보관/회전 도구는 추가 작업이다.

실제 Riot 권한/공식 데이터·번역 정확성·운영자/개인정보 법적 정보 등 기존 확인 사항은 남아 있다. [기존 배포/롤백 계획](../../artifacts/riot-v0.2.0-2026-10-28/deployment-and-rollback.md)을 유지하고 실제 운영 연결·배포는 별도 사용자 승인 후 진행한다. 이번 구현/시험은 임시 개발 데이터에서만 활성화·롤백을 실행한다.
