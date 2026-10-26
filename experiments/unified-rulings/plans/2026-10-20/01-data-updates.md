# 자료 자동 갱신과 연결을 유지하는 패치

2026-10-20 설계안. 현재 서비스에는 적용하지 않았다.

## 1. 현재 제약

- `scripts/sync-rules.mjs`는 2026-10-09 PDF 주소와 보충 문서 주소를 고정해서 내려받는다. 최신 문서의 자동 발견 기능은 없다.
- `src/server.js`는 시작할 때 규칙과 카드 색인을 읽는다. 파일을 교체해도 실행 중 검색 자료는 바뀌지 않는다.
- RiftJudge는 질문별 원격 검색이다. 전체 공개 Q&A의 자체 색인은 아직 없다. 10/17 사이트맵에서 11,672개 주소를 확인한 기록이 있으나 오늘의 확정 총수로 취급하지 않는다.
- 리프트나루는 1,527판본을 가져왔고 영어 본문 1,489개를 연결했다. 서버 요청이 확인 화면에 차단된 이력이 있어 무인 수집 경로가 미확보다.
- `manager.js`의 서버 끄기는 앱과 터널을 함께 종료한다. 앱 종료에는 7초 강제 종료 타이머가 있어 최대 45초 AI 요청을 끝까지 기다리지 못할 수 있다.

## 2. 출처별 수집 계약

| 자료 | 발견 기준 | 초안 주기 | 검증/예외 |
|---|---|---|---|
| 코어룰 | Riot 공식 Rules Hub의 EN/KO 문서 링크, 공식 변경 공지·발효일 | 6시간마다 링크/해시 확인 | 공식 본문과 보충 정오표의 적용일 구분. URL/페이지 변경만으로 새 규칙으로 판정하지 않음 |
| 토너먼트룰 | 같은 허브의 Tournament 문서 및 변경 공지 | 6시간마다 | 포맷·OPL·징계 조건·상위 제목 함께 보존 |
| RiftJudge | 사이트맵의 상세 URL/lastmod 또는 제공 API·내보내기 | 6시간마다 변경분, 주1회 목록 대조 | lastmod는 힌트. 본문 해시·상태·적용 룰 버전 확인. verified는 커뮤니티 상태 |
| 리프트나루 카드 | 운영자 제공 API/정기 JSON을 우선, 없으면 승인된 수집/수동 파일 | 1일1회 제공 버전 확인 | 현재 자동 경로 미확보. 403/429/확인 화면이면 보류하고 기존 정상본 유지 |

공식 출처는 [Riot Rules Hub](https://playriftbound.com/en-us/rules-hub/)를 최우선으로 한다. 사용자가 준 riftbound.gg는 발견 보조 링크로 두고 실제 원문은 공식 게시자·자산 주소로 확인한다. [RiftJudge](https://app.riftjudge.com/)와 [RiftNaru](https://www.riftnaru.com/cards)는 각각 커뮤니티 사례·카드 공급원으로 분리한다.

주기는 제안값이다. 운영자 제한/변경 빈도에 맞춰 조정하며 동일 호스트 동시1건, 기본 요청 간격2초, Retry-After 준수, 최대3회 지수 지연을 시작값으로 둔다. 차단·로그인·CAPTCHA는 우회하지 않는다. 수집 URL은 허용 호스트와 리디렉션 도착지를 확인하고 로컬/사설망 주소는 거절한다.

### 최초 Q&A 색인

공개 전체 목록 확인 → 20개 파싱 확인 → 중복 제거 → 200개씩 체크포인트 저장 → 중단 지점부터 재개. 11,672건을 2초 간격으로 읽으면 대기만 약6.5시간이다. 요청 실패·상세 처리에 더 걸린다. 하루 상한2,000개라면 최초 약6일 이상으로 계획하며, 제공 API/전체 내보내기가 있으면 이를 우선한다. 원문 수집에 AI를 사용하거나 전체를 선번역하지 않는다. 수집 완료율을 표시하고 수집 도중 ‘전체 색인 완료’로 표시하지 않는다.

기존 실시간 검색은 지역 색인에 적합 사례가 없거나 오래된 경우에만 보조적으로 사용한다. 모든 질문에서 중복 원격 수집을 하지 않는다. 검색 결과 없음과 원격 장애를 구분하고, 관련 사례가 없으면 무관한 Q&A로 채우지 않는다.

## 3. 자료 형태

운영 본문/제보 DB와 공개 규칙 자료를 분리한다. 원문은 불변 저장소, 검색 자료는 재생성 가능한 파생 자료로 둔다.

```text
knowledge-releases/<releaseId>/manifest.json
  rules.json + rule-parents.json + rule-links.json
  judge-cases.jsonl + judge-index/
  cards.json + card-aliases.json
  search-index/ + validation-report.json
```

Manifest 필드: schemaVersion, releaseId, createdAt, effectiveFrom, sourceVersions, contentHashes, documentCounts, parserVersion, searchVersion, compatibleAppVersions, validationStatus. 네 공급원의 버전/수집일/확인일/최종 성공일을 따로 둔다.

- Rule: documentId, canonicalRuleId, sourceRuleLabel, headingPath, parentId, childIds, textEn/Ko, pdfUrl/page, version, effectiveFrom, hash, references, extractionWarnings.
- Case: sourceCaseId, question/answer, cardIds, ruleRefs, verified/unverified/deprecated/unknown, applicableVersion, updatedAt, fetchedAt, sourceUrl, bodyHash. 원문 상태를 AI가 임의로 승격하지 않는다.
- Card: canonicalNameId, printingId, nameEn/Ko, aliases, text/기호/비용, language, textComplete, authority, sourceUrl, version/hash, officialComparisonStatus. 서로 다른 그림·희귀도·언어 판본과 ‘같은 이름’ 판정을 구분한다. 번역만 보고 동일 카드로 합치지 않는다.
- Translation cache: sourceId + bodyHash + language + glossaryHash + promptVersion + model. 원문이 바뀐 번역만 무효화, 공식 한국어 우선, 사용자가 펼칠 때 생성한다.

## 4. 발견에서 적용까지

`discovered → fetched → parsed → validated → staged → active`

별도 종료 상태: unchanged / awaiting-review / failed / rolled-back.

1. 조건부 HTTP 요청(지원 시 ETag/Last-Modified), 최종 URL·본문 해시 기록.
2. 날짜와 실제 발효일 추출. 미래 시행 문서는 미리 저장하되 발효 전 활성화하지 않는다.
3. 임시 폴더에서 파싱·색인. 조항 경계/상위 조건/페이지 연속성, 중복 ID, 빈 본문, 참조 끊김 검사. 현재 파서에는 본문 참조 번호를 새 정의로 읽고 같은 ID를 덮어쓰는 결함이 확인됐다(대회703.4.a.5/c.5). 좌표 기반 열 구분과 중복 정의 차단을 먼저 구현하고, Map 저장 전의 원시 추출 결과를 검증한다.
4. 이전 정상본과 비교. 예: 문서 항목 수 10% 이상 감소, 변경 비율 30% 초과, 번호 체계 대폭 변경, 언어 버전 불일치, PDF 추출 누락은 자동 적용 보류. 수치는 초기 운영 기준이며 정상 대규모 개정도 검토 대상으로 다룬다.
5. 핵심 규칙 묶음과 발효 정오표의 충돌을 확인한다. 한국어가 이전판이면 최신 영문으로 답하고 필요한 부분만 번역한다. 오래된 한국어를 새 영문에 붙이지 않는다.
6. 승인된 불변 묶음을 완성한 뒤 활성 포인터를 교체한다. 다운로드/파싱 도중인 파일을 서비스하지 않는다.

공급원 하나가 실패하면 나머지의 유효한 갱신은 가능하다. 다만 새 코어룰과 연결된 사례가 호환되지 않으면 그 사례를 ‘과거 버전’으로 낮추거나 제외한다. 묶음은 각 구성 버전을 명시하므로 ‘모든 자료 최신’이라는 단일 성공 표시를 하지 않는다. 수집 실패가 삭제를 뜻하지 않으며, 전체 목록 확인 없이 카드·사례를 삭제 처리하지 않는다.

## 5. 재시작 없는 자료 교체

새 `KnowledgeProvider` 계약:

```text
acquireSnapshot() → { releaseId, rules, cards, judgeSearch, release() }
stageRelease(manifest) → validationResult
activateRelease(expectedCurrentId, nextId) → committed | conflict
rollbackRelease(expectedCurrentId, previousId)
```

- 한 질문은 시작 시 하나의 snapshot을 잡고 검색·생성·근거 표시·로그까지 그 버전을 사용한다. 처리 중 업데이트되어도 구판/신판을 섞지 않는다.
- 로컬은 별도 빌더 프로세스가 색인을 준비한다. 앱이 새 색인을 완전히 읽고 검증한 뒤 메모리 참조를 한 번에 바꾼다. 파일 감시만 믿지 않고 명시적 활성화 신호와 주기적 포인터 대조를 병행한다.
- 활성 포인터는 SQLite 트랜잭션으로 비교 후 변경한다. Windows에서 사용 중인 데이터 파일을 덮어쓰는 방식은 쓰지 않는다.
- 구판은 진행 중 요청/근거 상세/제보가 참조하는 동안 유지한다. 제보에는 필요한 근거 원문·해시 스냅샷을 포함하고 90일 보존 정책을 적용한다. 질문 본문7일·메타30일은 확대하지 않는다.
- 관리자에 ‘자료 확인 / 갱신 결과 / 적용 대기 / 직전 버전 복구’를 둔다. 일반 화면에는 네 자료의 확인 상태와 실제 적용 버전을 간결히 표시한다.

## 6. 집 PC에서 앱 패치 중 연결 유지

```text
사용자 → 살아 있는 Cloudflare 터널 → 고정 프록시 :3001
                                      ├─ 앱 A :3011 (구판)
                                      └─ 앱 B :3012 (신판)
                  관리자 :3100 → 전환/자료/제보/사용량
```

1. 런타임 코드와 정적 자산을 `releases/<appReleaseId>/`에 불변 복사한다. 운영 DB·키·자료 저장소는 릴리스 밖의 공용 경로에 둔다.
2. 구판으로 계속 응답하면서 신판을 다른 포트에서 시작한다. 신판 준비 확인은 DB/자료/스키마 호환성과 필요한 경로를 확인하며, 별도 허가 없는 유료 질문은 사용하지 않는다.
3. 프록시가 새 요청만 신판에 보내고 구판의 진행 중 응답은 끝까지 전달한다. 시작값 90초 drain이며 실제 최장 요청 제한보다 길어야 한다. AI POST를 다른 서버에 자동 재전송하지 않는다.
4. 실패하면 새 요청의 대상을 즉시 구판으로 되돌린다. 모델 호출 여부가 불명확한 요청은 clientKey와 저장 상태를 확인하고 재과금할 수 있는 자동 재시도를 피한다.
5. 두 앱은 공용 DB의 트랜잭션 기반 예약/한도를 사용한다. 프로세스별 카운터면 한도가 두 배가 되므로 허용하지 않는다. KST 일자 기준과 요청 중복 방지를 유지한다.
6. DB 변경은 열/테이블 추가 → 양 버전 호환 → 구판 종료 후 정리 순서. 파괴적 변경은 무중단 대상에서 제외한다.
7. HTML/API는 최신 확인, JS/CSS는 해시 파일명과 불변 캐시. 구판 자산도 일정 기간 유지한다. 서비스 워커는 답변 중 강제 새로고침하지 않고 완료 후 갱신을 안내한다.

**최초 전환에는 짧은 점검 시간이 필요할 수 있다.** 현재는 앱이 직접3001을 점유하고 관리자 재시작이 터널에 영향을 준다. 첫 도입부터 현재 임시 URL과 모든 요청을 무조건 유지한다고 약속하지 않는다. 첫 전환은 사용자가 적용을 지시할 때 별도 순서로 수행하고, 이후 앱 패치가 프록시/터널을 재시작하지 않도록 만든다. PC 전원·인터넷 단절, 프록시/OS 업데이트, DB 비호환 패치는 이 구조로도 완전 무중단을 보장하지 못한다.

## 7. 구현 파일 지도와 향후 확인 기준

기존 변경: `scripts/sync-rules.mjs`, `scripts/import-riftnaru.mjs`, `src/server.js`, `src/cards.js`, `src/source-translations.js`, `src/operations-store.js`, `src/manager.js`, `src/cloudflare-quick.js`, `public/service-worker.js`.

새 모듈 제안: `src/knowledge-provider.js`, `src/retrieval.js`, `src/update-coordinator.js`, `src/gateway.js`, `scripts/discover-sources.mjs`, `scripts/build-release.mjs`, `scripts/sync-judge.mjs`, `scripts/sync-card-feed.mjs`.

적용 후 확인할 항목(지금 실행하지 않음): 변경 없음은 재색인0/AI0, 파싱 실패 시 정상본 유지, 발효 전 규칙 비활성, 질문 중 자료 교체 시 버전 고정, 구판 복구, 진행 중 AI 응답의 앱 전환, 중복 호출/한도 우회 없음, 오래된 브라우저 근거 링크 정상, 카드 제공 경로 실패 시 수동 정상본 유지.
