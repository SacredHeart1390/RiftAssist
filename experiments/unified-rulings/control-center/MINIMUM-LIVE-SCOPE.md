# v0.2.0 최소 라이브 범위

2026-11-10 한국. 최우선은 기존 VM의 v017→v020 단일 교체다. Control Center 자동화, 상시 broker/sudoers 설치, 별도 VM/staging 운영은 필수 조건이 아니다. 다만 [공식 Riftbound 문서](https://developer.riotgames.com/docs/riftbound)의 Digital Tools Policy는 서면 라이선스 또는 유효한 앱 전용 API 키를 요구한다. API 미사용·카드0개·공개 PDF만으로 앱/규칙 이용 허가를 대체하지 않는다. API 승인 대기 중에는 적용 가능한 별도 서면 허가가 확인돼야 하며 공개/AI 처리 권한은 구분하여 검토한다. 실제 운영·ready 변경 승인은 여전히 필요하다.

| 기능 | 최소 출시 |
|---|---|
| AI 룰링/KO·EN/규칙 검색·근거 | 권한·현재성이 확인된 규칙과 승인된 기존 OpenAI 설정으로 유지. 자료/근거가 부족하면 확정 판정하지 않음 |
| 오류 제보·기존 기록·관리자 | 기존 schema/key 및 한도·AI 플래그 보존. 새 데이터 경로 복원, 3100 loopback/정상 인증 유지 |
| 카드/이미지/카드 번역 | 권한 확인분만 허용. 빠른 초기 출시에는 카드0개인 approved-rules-only 후보를 선택할 수 있음 |
| 제3자 저지 사례·원문 번역 | 최소 rules-only 모드에서는 로컬 사례/외부 RiftJudge 검색/번역 API 모두 차단. 미확인 자료를 공식 자료로 재표시하지 않음 |
| PC/모바일/PWA/쿠키 | 기존 UI·네트워크 오류·버전 전환·원래 cookie owner/만료 유지. 새 Windows10 PC/실제 도메인 검수는 별도 |
| 자동 수집·Riot 연결·고급 CC 자동화 | 초기 출시에 불필요하며 개발본 보존, 실제 연결/배포 안 함 |
| 검색 색인 | v020 응답 noindex,nofollow. robots는 공개 페이지의 noindex 확인을 허용하고 /api/ 수집을 거절. 접근 통제 수단은 아님 |

`src/minimum-release.js`는 기존 stageRelease/loadRelease를 재사용해 카드·사례가 없는 **별도 검토 후보**만 만든다. 입력 규칙 전체 hash와 display/modelInput 권한 검토 reference가 필요하다. 실제 허가를 독립 검증하거나 부여하는 기능이 아니며 테스트 reference는 허가가 아니다. 기존 디렉터리/active pointer/DB/키를 사용하지 않고 활성화도 하지 않는다. 공급 자료의 번역·출처·현재성도 운영자가 확인한다. 실제 승인 자료는 이번 작업에서 수집하지 않았다.

```javascript
// 검토한 로컬 공개 규칙만 제공. 운영 DataRoot를 절대 넣지 않는다.
const result = await require('./src/minimum-release').stageMinimumRules(freshCandidateDirectory, {
  rules: reviewedRules,
  review: {status:'verified', reference:actualRightsReviewReference, commit:reviewedCommit,
           rulesSha256:reviewedRulesSha256, display:true, modelInput:true}
});
```

결과는 reviewRequired=true, activePointerChanged=false, authorizedToDeploy=false다. 카드·사례가 섞였거나 규칙 hash가 다른 상태를 rules-only로 표시하면 로더가 거절한다. 임의 card permission 상향/리프트나루 자료 수입은 없다. 최소 모드에서도 AI 요청은 승인된 유료 서비스와 개인정보 조건을 충족한 뒤 실제 사용자 요청에만 실행한다. 개발·자동 테스트는 합성 응답만 사용한다.

rights/privacy/실제 schema·암호화·백업·복구·서버 구성은 필수다. 연락처/법적 근거/전송·보관 조건을 v1.0까지 미룰 수 없다. 실제 규칙 자료도 이용 권한이 확인되지 않았다면 출시를 차단한다. Riot API 대기와 이미 가진 자료의 권한 확인은 서로 다른 사안이다.

`release-readiness`는 manual-ssh일 때 broker 대신 검증된 manualProcedure를 요구한다. approved-rules-only이면 0개 카드/사례·외부 사례/원문 번역 차단 증거를 요구하고 Riot API 승인을 요구하지 않는다. 나머지 필수 gate와 ready=false 거절은 그대로며 어떤 보고서도 운영 허가가 아니다.
