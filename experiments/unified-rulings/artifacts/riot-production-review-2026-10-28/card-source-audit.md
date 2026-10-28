# 카드 자료 출처·권한 감사

검토 기준: 2026-10-28 KST. 실제 운영 앱 기준 `releases/v0.1.7`. 자료 파일은 읽기 전용으로 확인했으며 삭제·교체·재수집·활성화하지 않았다. API 키·운영 사용자 DB·사용자 기록은 열거나 출력하지 않았다.

## 적용 정책과 판단 범위

- [Riot Riftbound 정책](https://developer.riotgames.com/policies/riftbound)의 **Implementation of Riftbound cards**, **Brand Integrity**, **Use Cases**와 [공식 개발 문서](https://developer.riotgames.com/docs/riftbound)의 **Digital Tools Policy**, **Other Design and Functionality Requirements**를 확인했다.
- 정책은 카드 등 Riftbound 자산의 Riot API 제공 출처를 요구하며 외부·비공식 자료 사용을 제한한다. 공식 영어 본문 또는 API 제공 공식 번역을 표시해야 한다. 공식 번역이 없어 자체 번역을 사용하는 경우에는 정확한 번역을 공식 영어 본문과 함께 표시해야 한다.
- 개발 문서는 서면 라이선스 또는 유효한 앱별 API 키와 API 연동을 설명한다. 공개 페이지 접근 가능 여부, 이미지 호스트가 Riot 도메인인지, 로컬 사용 플래그가 켜져 있는지는 이 권한의 증거가 아니다.
- 아래는 코드·자료 메타데이터와 정책의 대조 결과다. 승인을 받았거나 권리 침해가 최종 법적으로 확정되었다고 단정하지 않는다.

## 활성 자료의 관찰 결과

`knowledge-releases/active.json`이 가리키는 `2026-10-26-e14c666116dc/cards.json`을 확인했다. 카탈로그 버전은 `riftnaru-2026-10-18-0b8e475d8f90`, 수집 시각은 `2026-10-18T05:57:00.831Z`, 목록 표시는 `all-1527-artwork-listings-observed-2026-10-18`이다. 이는 **현재 공식 전체 카드 수·최신성의 보증이 아니다**.

| 항목 | 확인 결과 |
|---|---|
| 카드·아트워크 항목 수 | 1,527 |
| 저장된 수집 출처 | 전부 `riftnaru-public`, `www.riftnaru.com/cards/...` |
| 검증 표기 | 전부 `observed-public-page`, `textVerified: false` |
| 권한 표기 | 전부 `permissions.display: false`, `permissions.modelInput: false`, `rightsConfirmed: false`, `redistribution: false` |
| 프로토타입 표시 예외 | 전부 `prototypeUse.enabled: true` |
| 프로토타입 모델 입력 예외 | 1,489개 `modelInput: true`, 38개 false |
| 영어/한국어 본문 존재 | 각각 1,489개 존재, 38개 없음 |
| 번역 출처 상태 | 전부 `unofficial-riftnaru` |
| 이미지 주소 호스트 | `cmsassets.rgpub.io` 433개, `media.riftnaru.com` 1,094개 |
| 상태 | 전부 `source-observed`; 공식 출시/미출시 여부를 검증하는 상태가 아님 |

읽은 카드 파일의 SHA-256은 `8eec626a557995b9366242efeddd0b730ef5fe782b6a67b845ef3974a7d9c8c5`이다. 이 값은 내용 식별용이며 라이선스의 증거가 아니다.

## 실제 수집·사용 경로

1. `plans/card-browser-update-2026-10-21.md`에는 공개 카드 화면 수집 기록이 있다. `scripts/import-riftnaru.mjs` 및 릴리스 내 동명 스크립트는 출처 URL·수집일·영어/한국어 본문·이미지 URL을 가진 수집 JSON을 가져오도록 구현되어 있다. 최초 수집 세션의 모든 행위·약관 동의·권한은 이번 코드 감사만으로 증명할 수 없다.
2. 현 갱신 도구 `collectors/card-sync-v1/catalog.js`는 같은 RiftNaru 출처로 매핑하며 권한 false, 프로토타입 예외 true를 설정한다. `runner.js`는 파일 inbox 또는 제공 JSON 주소 모드를 지원한다. `publish.js`는 활성 자료를 기반으로 새 지식 릴리스를 만들고 게시할 수 있다. 이 수집기를 이번에 실행하지 않았다. 제공 JSON 모드가 구현되어 있다는 사실로 실제 제공 계약이 있다고 추론하지 않는다.
3. `releases/v0.1.7/src/cards.js`의 `localNaru` / `localEvidenceReady`는 위 프로토타입 예외로 권한 false여도 표시 및 AI 입력을 허용한다. 코드 주석도 로컬 사용 결정이 출처 권리자의 라이선스가 아니라고 설명한다.
4. `public/card-composer-ui3.js`는 이미지 URL을 `<img src>`에 넣어 브라우저가 직접 가져오게 한다. `loading=lazy`, `referrerPolicy=no-referrer`, 실패 시 대체 아이콘을 사용한다. 이 런타임 경로에서는 앱 서버 이미지 프록시·바이너리 재호스팅을 하지 않는다. 저장소 전체나 운영 인프라에 다른 이미지 사본이 전혀 없다고 보장하지 않는다.
5. 카드 상세를 펼치면 영어 `textEn`과 한국어 `textKo`가 있는 경우 둘 다 표시한다. 한국어는 공식 여부에 따라 라벨을 구분한다. 영어가 있어도 Riot API 공식 영어 원문 대조가 완료된 것은 아니다. 본문이 없는 38개는 모델 입력 준비 상태가 아니지만 검색·이미지 목록에는 나올 수 있다.
6. 같은 UI는 `community-source`에 대해 출처명·버전·원본 링크 일부를 숨긴다. 수집일과 API 응답의 출처 필드는 남는다. 출처 표시가 권한을 대신하지 않으며, 필요한 귀속 표시 조건이 있다면 별도로 재검토해야 한다.
7. `src/server.js`의 `inputText`는 모델 사용 가능 카드의 영어 본문·이름·속성·출처 메타데이터를 OpenAI 입력에 넣는다. 모델 프롬프트는 이를 커뮤니티 출처라고 설명한다. 번역 재이용·이미지 표시뿐 아니라 AI 입력에 대한 허용 범위도 확인해야 한다.

## 충돌 가능성 및 미확인 사항

| 우선순위 | 쟁점 | 심사 전 필요한 확인 |
|---|---|---|
| 높음 | 실제 활성 자료 1,527개가 Riot API 수집 경로가 아닌 외부 공개 페이지 출처 | 앱별 Production API 승인/서면 라이선스의 실제 상태·범위, 공식 자산 공급 경로와 이전 계획을 Riot에 확인 |
| 높음 | 권한 false인데 프로토타입 예외로 표시·모델 입력 | 공개 운영에 적용 가능한 Riot 및 제3자 권한을 확인. 플래그를 true로 바꾸는 것으로 해결할 수 없음 |
| 높음 | 영어 본문은 외부 관찰본, 한국어는 전부 RiftNaru 비공식 번역 | 공식 API 영어·정오표 대조, 공식 한국어 번역 존재 여부, 제3자 번역의 재사용 허가와 정확성 검토 |
| 높음 | 이미지 1,094개가 RiftNaru 호스트, 433개도 API 취득 증거 없음 | 이미지별 API 출처·이용 범위와 핫링크 허용 확인. Riot 호스트라는 사실만으로 승인 추정 금지 |
| 중간 | 38개 본문 없음, 전부 공식 출시/프리뷰 구분 미검증 | 해당 항목의 공식 본문·정식 출시 여부를 확인하고 미출시라면 명시적 표시 계획 검토 |
| 중간 | AI 판정 보조와 자동 규칙 집행의 경계 | 현재는 글로 참고 답변을 제공하며 게임 상태 강제 변경 코드가 확인되지 않았다. 그러나 AI 처리 순서 제시가 심사에서 수용되는지는 Riot에 사용 흐름과 함께 확인. 면책 고지만으로 승인 보장 불가 |
| 중간 | RiftJudge 사례·규칙 자료도 별도 출처·번역 캐시 사용 | Riot API 자산 사용 범위, 커뮤니티 사례 재사용·저장·AI 전송 조건을 함께 확인 |

[RiftNaru 이용약관](https://www.riftnaru.com/terms)은 한국어 카드 이름·본문을 비공식 번역으로 설명한다. 이번에 확인한 약관은 RiftAssist에 카드·번역·이미지의 재수집·재배포·AI 입력 권한을 부여했다는 증거가 아니다. RiftNaru의 연락처를 RiftAssist의 개인정보처리자 연락처로 전용하지 않았다.

## 보존한 것과 후속 결정

카드 파일, 수집 스냅샷, 이미지 URL, 갱신 설정, 프로토타입 예외, 활성 지식 포인터를 수정하지 않았다. 승인·권한이 확인된 뒤 공식 API 자료로의 매핑/이전, 영어 병기와 번역 정확성 점검, 미출시 표시 및 출처 표시 개선 범위를 별도 결정해야 한다. 이 보고서만으로 자료를 삭제하거나 정책 충족을 선언하지 않는다.
