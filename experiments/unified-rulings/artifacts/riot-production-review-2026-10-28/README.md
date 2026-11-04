# RiftAssist Production API 심사 대비 정비

> 후속 지시 반영: 이 문서의 v0.1.7 수정 내용은 당시 로컬 작업 기록입니다. 해당 개선은 v0.2.0으로 이동했고 v0.1.7은 저장소 기준 소스로 복원했습니다. 최종 상태는 [v0.2.0 분리 보고서](../riot-v0.2.0-2026-10-28/README.md)를 참조하세요.

2026-10-28 KST. 구현은 실제 앱 경로 `experiments/unified-rulings/releases/v0.1.7`에 적용했다. 저장소 최상위 구형 앱 및 `sources/`는 수정하지 않았다. **운영 재시작·배포, Git commit/push, GitHub 원격 변경, Azure 작업은 실행하지 않았다.**

## 운영 경로와 빌드·실행 확인

- `releases/v0.1.7/src/paths.js`: 앱 코드는 릴리스 폴더에서, 자료는 `RIFTASSI_DATA_ROOT` 또는 기본 `experiments/unified-rulings`에서 읽는다. 릴리스와 자료 루트가 다르다. 운영 앱을 그대로 실행하면 공용 자료 루트의 `.env`·운영 DB를 사용할 수 있으므로 이번 테스트는 반드시 임시 DATA_ROOT를 지정했다.
- 릴리스 `package.json`의 `npm start`는 `node src/manager.js`다. 관리자는 loopback 전용 기본 3100, 앱 게이트웨이는 기본 3001이다. `app-host.js`가 선택된 `releases/<id>/src/server.js`를 3011/3012 작업 포트로 시작하며 앱 전환 시 진행 중인 요청을 배출한다. 공개 터널은 앱 게이트웨이용이다.
- 기록 `artifacts/timing-retrieval-2026-10-23/README.md`에는 v0.1.7 전환 이력이 있다. 이번 작업은 운영 관리자 키·DB의 현재 설정을 읽거나 실제 운영 프로세스에 접속해 확인하지 않았다. 현재 운영 경로는 사용자 지시와 이 코드·기록을 기준으로 삼았다.
- 화면은 릴리스의 `public/index.html` → `styles-ui5.css`, `card-composer-ui3.js`, `app-ui5.js`, `reports-ui3.js` 등 정적 파일을 Node HTTP 서버가 직접 제공한다. 프런트엔드 번들 빌드 단계는 없다. 필요한 런타임은 Node 22.13 이상 및 `node:sqlite`다.
- 저장소 최상위 Dockerfile은 구형 앱용이다. `experiments/unified-rulings/Dockerfile`도 해당 폴더의 `src/public/knowledge`를 복사해 `node src/server.js`를 실행하는 구조로, 릴리스 선택·`knowledge-releases` 구조를 그대로 포장하는 파일이 아니다. 이 파일들을 v0.1.7의 Azure 배포 정의로 가정하지 않았으며 수정·컨테이너 빌드·배포하지 않았다. 향후 배포 패키징은 승인된 운영 방식에 맞춰 별도 점검해야 한다.

## 구현 결과

1. [Riot 정책](https://developer.riotgames.com/policies/riftbound)의 Brand Integrity에 있는 공식 영어 비후원 고지를 프로젝트 이름 **RiftAssist**로 치환해 메인 하단에 그대로 표시했다. 언어 전환으로 번역·변형되지 않으며 법률 페이지에도 동일하게 표시한다.
2. AI 답변이 참고용이며 공식 Riot Games 판정이나 대회 저지의 최종 판정을 대체하지 않는다는 한국어·영어 고지를 추가했다.
3. `/privacy.html`, `/terms.html`을 추가하고 하단에서 연결했다. 문서는 한국어·영어 섹션과 상호 이동/홈 링크가 있으며 JavaScript·로그인·API 상태 확인 없이 읽을 수 있다. PC와 320/390px 모바일에서 가로 넘침과 링크 접근을 점검했다.
4. 메인과 제보 창의 보관 안내를 실제 정리 로직에 맞췄다. 기존의 ‘최대 90일’이라는 절대적 표현 대신 정리 대상 시점·백업 별도 관리를 설명한다. 서비스 워커 캐시 이름과 목록도 갱신해 새 법률 문서/CSS를 포함했다.
5. API/저장/판정/검색/관리자 런타임 코드는 변경하지 않았다. 확인되지 않은 연락처·시행일·처리 근거·외부 계약을 만들지 않았고, 법률 페이지에 공개 전 확인 필요 사항으로 표시했다.

## 개인정보 처리의 코드 근거

| 주제 | 확인한 동작 | 코드 |
|---|---|---|
| 질문·답변·제보 | 질문·응답·검색/모델 처리 기록, 제보 내용 및 연결 사본/이력 저장 | `src/server.js`의 `handleAsk`, `src/operations-store.js` |
| 암호화 | 콘텐츠 AES-256-GCM, 메타데이터는 평문 필드. 키는 같은 서버의 별도 파일 | `operations-store.js`의 `seal`, 테이블 정의 |
| 보관·삭제 | 질문·응답 7일 후 비우기, 요청·호출·이벤트 30일 후 삭제, 제보와 연결 사본/이력 90일 후 삭제 | `operations-store.js`의 `purge`, `server.js`/`manager.js`의 약 1시간 주기 |
| 7일 이후 잔존 | 모델 평가·검색 보강어 등 질문 유래 문구는 trace에 30일까지 남을 수 있음. 제보 사본은 별도 90일 | `server.js`의 `generationAttempts`/`logEntry`, `report`의 snapshot |
| 백업 | DB와 복호화 키를 함께 백업, 자동 만료/연쇄 삭제 없음 | `operations-store.js`의 `makeBackup` |
| OpenAI | 질문·선택 카드·검색 근거 전송, 필요 시 보강 1회, `store: false` | `server.js`의 `inputText`, `askOpenAI` |
| 번역 | 등록된 공개 출처 원문/카드명/용어집을 OpenAI로 전송, 별도 JSON 캐시 자동 만료 없음 | `source-translations.js` |
| RiftJudge | 로컬 검색 부족 시 질문 일부·검색어·카드명을 외부 검색 API로 전송. AI가 꺼져도 가능 | `server.js`의 `searchJudge`/`searchJudgeRemote` |
| 쿠키 | `rift_session` 30일, HttpOnly/Strict, 공개 호스트 Secure, DB는 세션 ID의 SHA-256으로 연결 | `access-control.js` |
| 관리자 | loopback + 별도 인증, 관리자 쿠키 8시간. 제보 사본 열람/상태/메모 변경 | `manager.js` |
| 브라우저 | 언어 localStorage, 카드 ID sessionStorage, 정적 파일 PWA 캐시; API는 캐시 제외 | `app-ui5.js`, `card-composer-ui3.js`, `service-worker.js` |
| 로그 | 본문 JSONL 기록 중지. 오류 코드·요청 식별자 등 stdout/stderr 가능. 인프라 로그 조건은 미확인 | `server.js`, `app-host.js` |
| 이미지 | 첨부는 서버 거절. 카드 이미지는 외부 URL 직접 로드, no-referrer | `server.js`, `card-composer-ui3.js` |

## 검증 결과

- **Node 회귀/통합 14개 통과**: 기존 판정 회귀 11개 + 정적 법률 페이지/비밀·관리 경로 비노출, 카드 API·AI·제보·세션 격리·관리자 연계, 암호화·보관/백업 검사 3개. [원문 결과](regression.tap).
- **브라우저 10개 통과**: 기존 사용자 흐름 5개 + 한·영/무스크립트 법률 페이지 및 정확한 고지(1280/390/320px), 모바일 제보 제출, 실제 PWA 캐시·오프라인 법률 페이지/API 비캐시 검사 5개. [원문 결과](e2e.tap).
- 환경: Node 24.19.0, Playwright 1.62.1, 시스템 Chromium 154.0.8037.57, Linux. 실패·skip·todo 0. 초기 기본 샌드박스 실행은 loopback 포트 개설 EPERM으로 실패했으며 테스트 권한으로 다시 실행했다. 앱 실패를 숨기거나 테스트를 skip하지 않았다.
- 기존 도우미의 서버 종료가 열린 브라우저 연결을 기다리는 문제를 줄이도록 브라우저/DB/테스트 관리자부터 닫고 임시 서버를 정리하게 했다. 임시 서버에만 강제 종료 한도를 적용한다.
- 외부 AI·RiftJudge는 고정 응답으로 모킹하고 계획하지 않은 외부 요청은 실패 처리했다. 테스트 서버는 임의 로컬 포트·임시 자료·임시 DB·합성 키를 사용하며 실제 자격증명·운영 `.env`를 상속하지 않았다. 실제 유료 API 호출 **0**.
- 실제 OpenAI 의미 추론 정확도, 공급자 실제 보관·이전, 실기기 Safari/Android, 기존 설치 PWA의 모든 업그레이드 경로, 공개 HTTPS/프록시/터널·Azure 환경은 검증하지 않았다. 테스트 통과가 Riot 승인 또는 법률 적합성을 뜻하지 않는다.
- JS/CJS 문법 7개, HTML 문서 3개의 중복 ID·로컬 링크, 정적 파일 등 릴리스 해시 67개 및 변경 소스의 키 패턴을 확인했다. 키 패턴 검사 결과는 0건이며 광범위한 Git 이력 보안 감사를 대신하지 않는다. 상세 수치는 [검증 메타데이터](validation.json)에 있다.
- 기존 `app-release.json`에는 이번 수정과 무관한 해시 불일치 10개가 있었다. `app-r2.js`, `app-ui2.js`, `card-composer-r2.js`, `card-composer-ui2.js`, 활성 `card-composer-ui3.js`, `styles-r2.css`, `styles-ui2.css`, `scripts/source-monitor.js`, `src/manager.js`, `src/paths.js`다. 이 파일의 바이트가 작업 시작 시 저장소 HEAD와 동일함을 확인했으며 소스는 수정하지 않았다. 명세 해시는 현재 제공된 소스 기준으로 함께 갱신하고 `legalValidation` 및 검증 메타데이터에 목록을 남겼다. 과거 날짜의 검증 필드는 과거 기록으로 보존했다.

실행 명령 (`experiments/unified-rulings/tests`에서):

```sh
npm test
RIFTASSI_E2E_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

시스템 브라우저가 없다면 테스트 패키지의 Playwright 설치/브라우저 설치 안내를 따른다. 기존 `RIFTASSI_E2E_CHANNEL`도 계속 지원한다. CI는 Node 회귀/통합 14개를 실행하도록 `npm test`로 갱신했고 실제 GitHub 실행은 하지 않았다.

화면: [모바일 답변·하단 고지](screenshots/mobile-answer.png), [데스크톱 답변](screenshots/desktop-answer.png), [모바일 개인정보 처리방침](screenshots/mobile-privacy.png), [데스크톱 약관](screenshots/desktop-terms.png).

## 수정·추가 파일

| 경로 | 변경 |
|---|---|
| `releases/v0.1.7/public/index.html` | 정확한 비후원 고지, AI 한계, 법률 링크, RiftAssist 표기/초기 버전 |
| `releases/v0.1.7/public/app-ui5.js` | 한·영 고지/링크 라벨·개인정보 요약·제목 |
| `releases/v0.1.7/public/reports-ui3.js` | 제보 보관·백업 안내 |
| `releases/v0.1.7/public/privacy.html`（추가） | 코드와 대응하는 한·영 개인정보 처리방침 |
| `releases/v0.1.7/public/terms.html`（추가） | 한·영 이용약관 |
| `releases/v0.1.7/public/legal.css`（추가） | 법률 문서·하단 가독성/모바일/포커스 스타일 |
| `releases/v0.1.7/public/service-worker.js` | 새 캐시와 법률 페이지/CSS 사전 캐시 |
| `releases/v0.1.7/app-release.json` | 변경/신규 정적 파일 해시와 이번 검증 기록 |
| `tests/helpers/isolated-server.cjs` | 격리 API/관리자 검사 접근 및 자원 정리 순서 |
| `tests/legal-operations.test.cjs`（추가） | 법률 페이지·기존 API/관리·보관 정책 통합 검사 |
| `tests/e2e/legal-pages.test.cjs`（추가） | 한·영/모바일·무스크립트·제보·오프라인 검사 |
| `tests/e2e/user-flows.test.cjs` | 시스템 Chromium/별도 결과 폴더 옵션, 종료 순서 |
| `tests/package.json` | 새 검사를 기존 실행 명령에 포함 |
| 저장소 `.github/workflows/rules-tests.yml` | 14개 회귀/통합 검사 실행 |
| `experiments/unified-rulings/.gitignore` | 신규 런타임 DB/키 파일 제외 보강 |
| `artifacts/riot-production-review-2026-10-28/`（추가） | 이 보고서, 별도 카드 감사, 검증 메타데이터, TAP 결과, 합성 테스트 화면 |

## 남은 법적·운영상 확인 사항

1. **카드 자산/번역/이미지 사용 권한과 공식 API 출처:** [별도 카드 감사](card-source-audit.md)를 우선 확인한다. 활성 1,527개 전부 외부 출처·미검증·권한 미확인이다. 표시/모델 입력 프로토타입 예외가 실제 공개 운영에 적용되고 있다. 자료를 삭제·교체하거나 예외를 바꾸지 않았다. 고지 추가만으로 이 문제가 해소되지 않는다.
2. **Riot 등록·승인과 AI 사용 흐름:** 실제 Production API 승인·앱별 키/서면 허가 상태를 확인하고, 참고 답변이 자동 규칙 집행과 어떻게 구별되는지 심사 자료에서 설명해야 한다. [공식 문서](https://developer.riotgames.com/docs/riftbound)는 자동 규칙 집행을 제한하므로, AI 판정 보조 흐름의 수용 여부를 Riot에 확인해야 한다.
3. **개인정보처리자와 권리 창구:** 운영자의 법적 명칭/성명·연락처, 열람·정정·삭제 요청 수단, 본인 확인·처리 절차, 처리 근거와 실제 시행일을 확정해야 한다. 현재 전용 삭제 API나 권리 요청 화면은 없다. 타 서비스 연락처를 전용하지 않았다.
4. **외부 처리·국외 이전:** OpenAI, RiftJudge, 이미지 CDN 및 실제 호스팅/터널 제공자의 계약·처리 국가·보관·제공/위탁 구분과 필요한 고지·동의 사항을 확인해야 한다. `store: false`가 공급자의 무보관을 보장한다고 쓰지 않았다.
5. **보관과 삭제 운영:** 백업과 복호화 키 동시 보관의 보안, 백업·WAL·로그·호스팅 사본의 실제 보관/삭제 기간, 정리 실패 모니터링, 요청에 따른 사본 삭제 절차를 확정해야 한다. 7일 질문 정리와 30일 trace, 90일 제보 사본, 수동 백업은 서로 다르다.
6. **이미 추적 중인 DB:** 파일 내용은 열지 않았으나 Git 파일 목록에 `source-updates/content.sqlite`, `content.sqlite-wal`, `content.sqlite-shm` 3개가 이미 추적되고 있다. `sync-store.js`는 이 경로를 출처 동기화 캐시로 사용한다. 이것을 사용자 운영 DB로 단정하지 않았고 내용을 출력·삭제·변경·새로 커밋하지 않았다. 새 ignore 규칙은 이미 추적된 파일에 소급되지 않으므로, push 전 이 파일들의 분류·배포 필요성·Git 인덱스/기록 제외 방식을 별도로 확인해야 한다. `private/` 사용자 운영 DB·키는 접근하지 않았다.
7. **공개 전 확정:** 개인정보 처리방침과 약관의 확인 필요 문구를 실제 운영 사실/연락처로 보완하고, 카드 권한 및 Riot 검토 쟁점을 해결한 후 승인된 절차로 배포 여부를 결정해야 한다. 테스트가 통과했더라도 이번 작업에서 배포·push를 수행하지 않았다.
