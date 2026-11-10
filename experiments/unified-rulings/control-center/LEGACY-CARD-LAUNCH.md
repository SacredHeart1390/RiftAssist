# v0.2.0 카드 포함 출시 복원 · 2026-11-10 KST

목표는 **기존 v017 카드 형식/기능 + v020 개선사항**이다. rules-only는 개발·회귀용 보조 도구이며 v020 출시의 기본값이나 대체안이 아니다. START-RELEASE.cmd와 기존 A→C 교체/암호화 백업/독립 복원/clean65 복귀를 재사용한다. main/develop/feature/PR1·실제 Azure는 변경하지 않는다.

## 실제 로컬 참조 조사

대상은 기존 작업 폴더의 공개 knowledge-releases다. **Azure 운영본과 동일하다고 검증한 결과가 아니다.** 운영 DB/키/사용자 기록을 열거나 원본/active pointer/캐시를 수정하지 않았다. 실제 자료를 Git·CI로 복사하지 않았다.

| 항목 | 관찰 |
|---|---|
| active release | 2026-10-26-e14c666116dc |
| 지식 manifest | schemaVersion1, compatibleSchema2, validated |
| 카드 저장 | SQLite가 아닌 cards.json, schemaVersion1, 1,527개 |
| 카드 버전 | riftnaru-2026-10-18-0b8e475d8f90 |
| 출처 / 번역 | 전부 riftnaru-public / unofficial-riftnaru |
| 영문 / 한국어 본문 | 각각1,489개. 본문 없는38개도 원본 유지 |
| 기존 공개/모델 권한 | 각각 true 0개, rightsConfirmed true 0개 |
| 이미지 URL 호스트 | cmsassets.rgpub.io 433개, media.riftnaru.com 1,094개 |
| 규칙 / 제3자 사례 | manifest에3,487개 /11,794개. 보존과 공개 권한은 별개 |
| cards.json SHA256 | 8eec626a557995b9366242efeddd0b730ef5fe782b6a67b845ef3974a7d9c8c5 |

동일 원본을 v017/v020 normalizer로 검사해 기존 필드 값 변경0개, 카드 수1,527→1,527, 본문 품질상 modelReady1,489→1,489를 확인했다. 추가 기본 필드는 permissions.image/translation=false, source.cardId/cardVersion/cardRevision/publishedAt다. source/ID/번역/능력치/원문은 유지된다. modelReady나 prototypeUse는 자료 이용 허가가 아니다. 이미지 호스트도 권한 증거가 아니다. import-riftnaru.mjs의 출처 표시는 공개 페이지 관찰이며 Riot API에서 받은 공식 자료라는 뜻이 아니다.

## 복원한 경로

- `src/legacy-card-release.prepareLegacyKnowledge(sourceRoot, freshCandidate, review)`는 기존 active manifest/세 JSON의 해시·구조를 검사한다. 세 데이터 파일을 **원본 bytes 그대로** 새 후보에 복사하고 새 manifest에 원본 pointer/manifest 해시·출처와 별도 검토를 기록한다. source pointer/원본/운영 DB는 수정하지 않는다. 합성 카드나 빈 카탈로그로 대체하지 않는다.
- review는 exact commit·세 파일 SHA256·실제 reference와 enabled scope별 reference를 요구한다. rulesDisplay/rulesModelInput/cardsDisplay/cardsModelInput/koreanDisplay/koreanModelInput/images/judgeCases/externalJudge/sourceTranslations를 구분한다. 권한 미확인 자료를 지우거나 출처/permissions/prototypeUse/textVerified를 바꾸지 않는다.
- production launcher는 고정한 지식 manifest에 따라 `legacy-reviewed`를 선택한다. API 키 없이 한국어/영어 검색, ID 선택·동명이인 처리, 카드 근거·능력치·영문 AI 입력, 질문·연결 제보를 지원한다. 한국어 전송 권한이 없으면 공개 화면과 별개로 모델용 이름/번역·용어집을 제외한다. 본문이 부족한 카드는 판정을 보류한다.
- runtime accessReview는 원본 권한과 구분한다. 기존 한국어는 unofficial-riftnaru로 유지한다. 이미지/한국어/제3자 사례·외부 검색·자동 번역은 각각 허가된 범위만 노출/전송한다. 규칙 모델 입력 권한이 없으면 AI 생성 자체를 막는다.
- 기존 카드 검토/AI 번역/동기화 mock/Control Center·보안·제보·배포 엔진은 유지한다. Riot 모의 어댑터 코드는 후속 v030 계약/회귀를 위해 보존하되 v020 기동 경로에서 import하지 않는다. production 실제 수집은 키 조회/네트워크 전에 거절한다. develop 브랜치 수정이나 실제 API 호출은 없다.

## 출시 조건 구분

**기술:** v017의 JSON/ID/active 구조와 SQLite 운영 저장소를 호환시킨다. 카드0개/rules-only/공식 API를 필수로 강제한 실행 gate를 legacy 후보 검증으로 교체했다. store schema 변경·역 migration은 하지 않는다. 실제 DB·설정·키 호환성은 기존 C의 backup/restore probe가 검사한다. C 중지 전에는 기존 서버의 active release ID·원본 manifest·규칙/카드/사례 파일 해시를 후보의 원본 참조와 비교한다. Azure 자료가 로컬 참조와 다르면 중지 전에 차단한다. 중지 직후에도 다시 검사해 확인/정지 사이의 변경을 탐지한다. 정지 후 원본이 달라졌다면 새 버전을 기동하거나 미검증 자료로 강제 복귀하지 않고 recovery-required로 보존한다.

**권리:** API 키 미발급 자체는 v020 기술 기동 조건이 아니다. 반대로 키가 있다고 RiftNaru 번역·이미지·사례 사용이 허가되는 것도 아니다. Riot 영문/자산·앱 정책 적용과 RiftNaru 한국어/번역·이미지·제3자 사례의 공개·외부 AI 사용 근거는 별도로 검토한다. [Riot 정책](https://developer.riotgames.com/policies/riftbound)과 [문서](https://developer.riotgames.com/docs/riftbound)의 조건을 무시하거나 허가가 확인됐다고 단정하지 않는다. 실제 증거가 없으면 access와 ready를 해제하지 않는다. 이것은 카드 기능을 없애거나 v030 공식 API 개발을 기다리는 기본 일정과 다르다.

**운영:** 실제 개인정보처리자/연락처·고지, 백업30일·접근자1인의 실제 보관/분리 복구키 방법, 불변 inventory/CI/source-ready와 유지보수 승인이 필요하다. rollback 자료 공개 범위도 권리 검토에 포함한다. 이번에는 실제 private 데이터 접근·설치·서비스 중단·유료 호출을 하지 않는다.

## 확정 로드맵

v017 현재 라이브 → v020 기존 카드 포함 출시 → v02n 라이브 개선 → v030 Riot 허가 후 공식 API 카드 연동 개발 → v040 최신 v02n + 공식 API 결과 통합 → v100 정식/SEO. 순서를 바꾸거나 새 VM·상시 병렬 운영을 요구하지 않는다.
