> 2026-11-10 출시 목표 정정: **기존 v0.1.7 카드 DB 형식/검색·질문·판정 + v0.2.0 개선사항**을 출시한다. rules-only로 축소하지 않는다. 공식 API는 v0.3.0 개발 대상이며 v0.2.0 기동 의존성이 아니다. [실제 카드 감사·복원·권리 경계](../../control-center/LEGACY-CARD-LAUNCH.md), [확정 로드맵](../../control-center/LIVE-ROADMAP.md)을 따른다. 미확인 자료 권리나 ready 상태는 임의 승인하지 않는다.

# RiftAssist v0.2.0 개발 릴리스

[Control Center 2차](../../control-center/PHASE2.md)는 별도의 합성 관리자 GUID 환경에서 기존 로그인/쿠키 API를 재사용한다. `operations:read`/`operations:write`는 카드 권한과 분리하며 임의 loopback 포트만 사용한다. Azure는 별도 승인 후 고정 읽기 전용 OpenSSH 조회 구조만 준비했고 실제 접속하지 않았다. 관리자 3100 공개·운영 제어/DB 접근·실제 API 호출은 없다. 기존 재수집 거절과 카드 승인 우회 방지는 유지한다.

운영 v0.1.7과 분리한 차기 개발 코드다. 앱 승인, 실제 공식 데이터 검증, 배포 승인을 받은 릴리스가 아니며 루트 `app-release.json`의 `ready`는 false다.

## 로컬 개발

Node 24 권장(최소 22.13). 이 폴더에서:

```sh
npm run dev:prepare
npm start
```

첫 명령은 **비어 있는** `.dev-data/`에 합성 카드 2개, 고정 회귀 규칙 fixture, 새 개발 자료 포인터와 개발 worker를 만든다. 기존 폴더·포인터·DB를 덮어쓰지 않는다. 운영 자료·사용자 DB·키를 복사하지 않는다. 다른 개발 폴더는 `RIFTASSI_DATA_ROOT`로 명시할 수 있으나 공유 운영 트리는 거절한다. 준비 마커와 내부 경로/심볼릭 링크도 검증한다.

`npm start`는 격리된 개발 관리자만 시작한다. 관리자 기본 포트는 **3200**, 앱 게이트웨이 **3201**, worker **3211/3212**다. 관리 화면 인증은 `scripts/open-manager.ps1`을 사용할 수 있다. 이 스크립트는 키를 출력하거나 기존 프로세스를 종료하지 않는다. 관리 화면의 서버 시작은 이 개발 루트의 worker만 시작한다. 개발 환경에서 공개 터널 연결 설정은 거절한다.

외부 서비스는 기본 **mock**이다. 개발 시작기는 실제 자격증명/외부 서비스 모드를 상속하지 않고 모의 OpenAI 응답을 쓴다. 자동 수집기·자료 게시·운영 전환은 시작하지 않는다. 별도 프로세스로 기존 운영 관리자/앱을 시작하거나 끄지 않는다.

관리자의 기존 외부 자료 재수집 요청은 접수된 것처럼 표시하지 않고 409와 `riot:preview` 안내를 반환한다. 제보 검토·AI 설정·한도·격리 앱 시작/정지 기능은 유지한다.

카드 정책 기본값은 `RIFTASSI_CARD_POLICY=restricted`다. 합성 카드를 UI에서 시험할 때만 개발 프로세스에 `verified-only`를 명시한다. 모의 카드는 개발 마커가 있는 환경에서만 표시 가능하며 `mock-source`와 개발용 합성 자료임을 표시한다. 실제 미승인 카드를 공식 카드로 승격시키지 않는다.

```sh
npm run riot:preview
```

이 명령과 `npm run translations:preview`는 합성 수집→변환→번역 후보를 `.dev-data/card-translations/candidates/`에, 재사용할 결과를 `card-translations/cache/`에 작성한다. 동일한 규칙·저지 사례를 가진 미게시 `knowledge-releases/ko-…` 후보도 만든다. 공식 API를 호출하거나 활성 자료 포인터를 전환하지 않는다. 두 번째 실행은 같은 영어 원문의 모의 번역 캐시를 재사용한다.

## 한국어 카드 번역 후보

실제 Riot 자료는 검토된 매퍼의 한국어 제공 여부 또는 주입된 공식 locale 조회 결과를 먼저 확인한다. 한국어 필드 누락은 공식 번역 부재의 증거가 아니다. 확인 실패·버전 불일치는 AI 호출을 막고, 확인된 공식 한국어는 AI보다 우선한다. 이름만 공식 한국어가 제공되면 캐시된 효과 후보와 출처를 구분해 결합한다.

영어 이름·효과·키워드와 비용·능력치·기호를 분리한다. 번역 결과는 원문 해시·버전, 공급자·모델, 생성 시각, 필드별 출처, 검증·검토 상태를 남긴다. 숫자·기호·부정·대상·조건·타이밍·용어를 검사하고 **정상 결과도 관리자 검토 전에는 공개하지 않는다.** 공식 번역이 뒤늦게 도착해도 이전 번역을 즉시 덮어쓰지 않고 변경 전후와 영어 원문을 보존한 교체 후보를 만든다.

현재 CLI는 합성 응답만 사용한다. 실제 OpenAI 번역 클라이언트는 없으며 `card-translation.config.example.json`은 연결 계약 예시다. 운영자 어댑터는 명시적 활성화·승인 참조·영속 캐시·호출 예산이 필요하고 새 호출 예산은 기본 0이다. 운영 DB·사용자 질문을 번역 자료로 사용하지 않는다. 리프트나루 카드·번역을 공식 용어집이나 학습 예제로 가져오지 않았다.

검토 API와 후보 파일 형식, 권한·정확성 한계, 승인 후 연결 작업은 [번역 엔진 안내](card-translation.md), [구현·테스트 보고서](../../artifacts/card-translation-2026-10-28/README.md)를 확인한다.

## 공식 연동 경계

신규 카드·에라타 갱신은 `npm run sync:mock`으로 한 번 확인하고 `npm run sync:status`로 실패/재시도 상태를 확인한다. 준비된 개발 루트에서만 실행된다. 모의 스냅샷의 모든 페이지·수량·중복·버전을 검증한 뒤 신규/영문/정오표/한국어/출시 변경·삭제 의심을 비교한다. 누락 카드는 보존하며 변경 카드만 기존 번역 엔진으로 보내고 후보만 생성한다. 반복 수집은 번역·후보 생성을 생략한다. 실제 Riot 동기화는 코드에서 차단되어 있다. 일정 실행기는 명시적으로 시작해야 하며 앱/관리자 시작이나 이 명령으로 자동 시작되지 않는다.

상세 계약·일정·장애 복구·관리자 검토는 [카드 동기화 안내](card-sync.md), 시험 결과는 [갱신 검증 보고서](../../artifacts/card-sync-2026-10-28/README.md)에 있다. 기존 `riot:preview`/`translations:preview`는 단발 번역 후보 검사이고, 반복 수집의 중복 방지는 `sync:mock`의 영속 관측 상태가 담당한다.

- `src/riot-adapter.js`: 기본 mock 수집. 실제 모드는 명시적 enabled, 승인 앱 참조, 검토된 HTTPS Riot API endpoint, 매퍼 버전과 `decodeOfficial` 함수, 안전한 API 키 공급이 모두 있어야 요청할 수 있다. 키는 `RIOT_API_KEY` 또는 주입된 getter에서만 읽고 파일/로그/결과에 넣지 않는다. 공급자 오류 본문과 키를 출력하지 않는다.
- `riot.config.example.json`: 비밀값이 없는 기본 설정 구조. 로컬 설정 파일과 `.dev-data/`는 Git에서 제외한다. 승인 여부나 키 존재로 설정을 자동 변경하지 않는다.
- `src/riot-converter.js`: API별 응답을 검토된 매퍼가 canonical 형태로 바꾼 후 기존 카드 스키마로 변환한다. 실제 카드의 표시·모델 권한은 기본 false다. 공식 한국어가 있으면 우선 보존하고 비공식 번역은 영어 원문·번역 상태·검토 참조·영문 해시와 함께 남긴다. 번역기는 주입하며 이 모듈은 OpenAI를 호출하지 않는다.
- **실제 Riot endpoint/응답 스키마/자산 계약은 아직 구현·검증되지 않았다.** 예시 합성 계약을 Riot의 실제 응답 형식으로 주장하지 않는다. 승인 후 공식 명세를 확인해 실제 매퍼를 추가하고 검증해야 한다.
- `src/card-access.js`: 원 자료를 수정하지 않는 요청별 뷰. 미확인 자료의 목록·상세·이미지·AI 본문/용어집 입력을 차단하며 인식된 미확인 카드 질문은 판정 보류와 근거 검색을 제공한다. 요청 재전송·이전 번역 키도 현재 정책을 우회하지 못한다.

사용자 쿠키는 `rift_session_v020`, 관리자 쿠키는 `rift_admin_v020`로 운영 쿠키와 분리한다. 운영 DB 스키마 마이그레이션·키 재사용·사용자 기록 이관은 구현하거나 실행하지 않았다.

## 검증과 전환

카드 데이터·번역 후보는 [관리 검토 인터페이스](card-review.md)로 개별/일괄 승인·거절·보류하고 사유를 저장할 수 있다. 검토, 승인 항목의 별도 후보 구성, 최종 활성화, 롤백을 분리했다. 새 공개 관리자 화면이나 HTTP 포트는 없으며, Control Center의 자식 프로세스 전용 파이프와 서명 메시지를 사용한다. 기존 관리자 키/운영 DB를 읽지 않는다. 현재는 격리 개발 루트의 합성/mock 자료만 허용한다.

첫 Windows 네이티브 관리 앱은 [Control Center 안내](../../control-center/README.md)에 있다. WPF/.NET 10 화면이 기존 Node 엔진을 사용한다. Windows용 명시적 `--bootstrap-stdin`은 첫 줄로 임시 인증정보를 받고 다음 줄부터 기존 서명 계약을 처리한다. FD3 방식은 유지한다. 이 앱은 소유 마커가 있는 별도 LocalAppData 합성 환경만 사용하고 기존 웹 관리자나 운영 서버를 자동 시작하지 않는다. 실행/패키징과 실제 Windows 후속 검증 범위를 함께 확인한다.

최종 활성화/롤백은 각각 권한·명시적 확인·현재 버전/후보 해시 일치를 요구한다. 기존 관리 API/CLI의 일반 knowledge 활성화로 카드 번역·동기화·검토 후보를 우회할 수 없다. 개발 worker의 관리 프로세스도 자동 시작하지 않는다. 구현·검사는 [관리 검토 보고서](../../artifacts/card-review-2026-10-28/README.md)에 정리했다.

공유 `../../tests`의 `npm test`, `npm run test:e2e`는 v0.2.0을 기본 대상으로 한다. `npm run test:legacy`는 원본 v0.1.7의 고정 회귀를 별도로 실행한다. 모든 서버 검사는 임시 DB·자료·키·모의 API를 쓴다.

전체 변경, 운영자 입력 항목, 승인 이후 실제 매퍼 작업과 안전한 배포/롤백 계획은 [작업 보고서](../../artifacts/riot-v0.2.0-2026-10-28/README.md), [배포·롤백 계획](../../artifacts/riot-v0.2.0-2026-10-28/deployment-and-rollback.md)에 있다. 승인만으로 운영 버전을 자동 전환하지 않는다.


### Display patch releases

Run `node scripts/bump-patch.cjs` once for each approved patch (next: 0.2.3). It increments the displayVersion PATCH (internal manifest.version stays 0.2.0), synchronizes HTML/resource/cache versions and hashes, and refreshes the backend manifest. Do not rename the v0.2.0 data family, releaseId or client protocol. Record the resulting Git commit in the server code-backup deployment receipt.

Control Center packaging is manual-only. Actions uploads default off; if explicitly needed, development artifacts expire in 3 days and verification proofs in at most 7 days. Formal packages should be downloaded and preserved in GitHub Releases as a separate explicitly authorized release operation, rather than retained in Actions. Never delete existing artifacts without approval.
