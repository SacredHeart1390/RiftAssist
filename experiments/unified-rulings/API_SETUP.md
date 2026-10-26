# OpenAI API 연결 초안 — Riftbound v0.1

갱신일: 2026-10-18. 사용자가 집 PC `.env`에 키를 저장했고 `OPENAI_GENERATION_ENABLED=true`로 활성화했습니다. 서버 재시작 후 gpt-6-luna로 실제 질문1건 생성 성공: 입력2926/출력593토큰. 기록은 `artifacts/api-connection-2026-10-18.md`. 아래 발급 절차와 계정 확인표는 최초 준비 당시의 기록입니다. 현재 키를 다시 발급할 필요는 없습니다.

## 현재 준비 방향

사용자는 OpenAI만 사용하기로 결정했습니다. 이미 생성한 API 프로젝트 `Riftbound_Judge_API`에 결제 사용 가능 상태를 확인하고, 프로젝트 API 키를 집 PC의 서버에 연결합니다.

프로젝트 생성이나 키 발급만으로 결제가 활성화되는 것은 아닙니다. 계정 상태를 먼저 확인한 뒤 필요한 항목만 준비합니다. 현재 앱의 `gpt-6-luna`는 초기 연결용 설정이며, 최종 운영 모델은 실제 저징 질문에 대한 인용 정확도와 답변 품질을 검증한 뒤 결정합니다.

## 최초 준비 당시 계정 확인표

연결 준비 중 Chrome에서 로그인된 OpenAI Platform과 아래 프로젝트를 확인했습니다. 결제·한도 변경은 사용자가 준비될 때 진행합니다. OpenAI Developers 플러그인 설치는 이 직접 연결 방식의 필수 조건이 아닙니다.

| 항목 | 확인 위치 | 상태 |
| --- | --- | --- |
| `Riftbound_Judge_API` 프로젝트 | 프로젝트 선택 메뉴/Settings | Chrome에서 직접 확인 |
| 결제 수단과 잔액 | Organization Billing | 미확인·변경 보류 |
| 자동 충전 여부 | Billing의 충전 설정 | 미확인·변경 보류 |
| 사용 티어와 모델 접근 | Organization Limits | 미확인 |
| 프로젝트 지출 한도 | 프로젝트 Limits | 미확인·변경 보류 |
| API 키 존재 및 권한 | 프로젝트 API keys | 준비 시 목록 0개 확인. 발급 폼만 작성, 생성 미완료 |

전용 키 이름 `riftbound-local-v01`, 프로젝트 `Riftbound_Judge_API`, Restricted 권한의 Responses Write / List models Read로 발급 폼을 준비했습니다. 키 생성 버튼은 누르지 않았습니다. 앱의 답변 생성에는 Responses 쓰기 권한이 필요합니다.

## 1. 준비할 것

1. [OpenAI Platform](https://platform.openai.com/)에 로그인할 계정. 기존 ChatGPT 계정으로 로그인할 수 있지만, 이 앱의 API 사용 요금은 ChatGPT 구독과 별도입니다.
2. Platform Billing에서 요구하는 결제 수단과 사용 가능한 API 잔액/한도. 선불 충전 방식이라면 화면에 표시되는 최소 충전액을 확인합니다.
3. 생성해 둔 이 앱 전용 API 프로젝트: `Riftbound_Judge_API`.
4. 해당 프로젝트의 일반 API 키. 예시 이름: `riftbound-local-v01`. 조직 관리용 Admin API 키는 필요하지 않습니다.

프로젝트는 ChatGPT 사이드바 프로젝트와 별개인 API 사용량·권한 관리 단위입니다. 준비 단계에서는 서비스 도메인이나 공개 서버가 필요하지 않습니다.

## 2. 결제와 사용 한도

먼저 Organization Billing에서 기존 결제 수단과 잔액을 확인합니다. 선불 충전 방식이라면 처음에는 화면이 허용하는 범위에서 USD 5~10 정도의 소액으로 시작하는 것을 제안합니다. 이것은 제안이며 실제 구매는 아직 하지 않았습니다. 공식 문서상 총 크레딧 구매 USD 5가 Build 티어의 자격 기준입니다. 적용 결과와 모델 권한은 Limits에서 확인합니다. 테스트 기간에는 자동 충전을 끈 상태로 시작하는 것을 제안합니다.

Platform Settings에서 해당 프로젝트를 선택하고 Limits를 엽니다. 초안 예산은 월 USD 10으로 제안합니다. 이는 테스트 예산 예시이며 예상 청구액이나 필요한 최소 충전액은 아닙니다.

- Spend → Edit spend limit → Monthly spend limit에 원하는 금액을 설정합니다.
- 해당 금액에서 요청을 중단하려면 `Enforce a hard limit`를 켭니다.
- Spend alert는 알림만 보내며 API 요청을 중단하지 않습니다.
- Hard limit도 반영 지연으로 소액 초과가 발생할 수 있습니다.
- 실제 설정 가능 여부는 계정 권한과 현재 Platform 화면을 확인합니다.

## 3. 키 발급

1. [API keys](https://platform.openai.com/api-keys)에서 이 앱의 API 프로젝트를 선택합니다.
2. 새 secret key를 생성합니다.
3. 제한 권한을 사용한다면 Responses 생성 요청(`POST /v1/responses`)에 필요한 쓰기 권한을 허용합니다. Read only 권한으로는 답변을 생성할 수 없습니다.
4. 발급된 키를 아래 `.env`에 직접 저장합니다. 키를 채팅, 스크린샷, 프런트엔드 소스에 넣지 않습니다.

## 4. 집 PC 설정 파일에 입력

파일 위치:

```text
C:\Users\user\.codex\.chatgpt-projects\g-p-6ad1dd0b61bc8191a95d816389c6e577\.env
```

이미 키가 빈 상태인 파일을 준비했습니다. 첫 설정 줄의 `=` 뒤에 키를 붙여 넣습니다.

```dotenv
OPENAI_API_KEY=발급받은_실제_키
OPENAI_MODEL=gpt-6-luna
OPENAI_GENERATION_ENABLED=false
OPENAI_REASONING_EFFORT=low
LOG_CONTENT=false
```

위 키 값은 설명용이며 그대로 사용하면 안 됩니다. `gpt-6-luna`는 현재 앱의 초기 연결용 모델입니다. 실제 계정의 모델 접근 권한과 저징 답변 품질은 연결 후 확인해야 합니다. `LOG_CONTENT=false`는 질문·답변 본문을 저장하지 않고 처리 메타데이터만 남깁니다.

지금은 `OPENAI_GENERATION_ENABLED=false`를 유지합니다. 키를 저장해도 OpenAI 생성 API를 호출하지 않으며 공식 룰·RiftJudge 근거 검색만 사용합니다. 이 옵션을 생략해도 생성은 꺼집니다. 사진도 브라우저에서 전송하지 않습니다.

원격으로 작업 중이면 반드시 집 PC의 이 파일을 편집해야 합니다. 직장 PC/노트북에 별도 `.env`를 만들어도 집 서버에는 적용되지 않습니다. 파일은 평문이므로 파일 접근 권한이 있는 사람은 키를 읽을 수 있습니다. 현재 `.gitignore`는 `.env`를 제외하도록 설정되어 있습니다.

## 5. 저장 후 적용 및 확인

이 채팅에 키 내용 없이 “키 저장했어”라고 알려주면 서버를 재시작해 키 설정 여부만 확인할 수 있습니다. 직접 실행할 경우 기존 서버를 종료한 뒤 프로젝트 폴더에서 `npm start`로 실행합니다. `.env`는 서버 시작 시 읽으므로 저장만으로 실행 중인 서버에 반영되지 않습니다. 기존 프로세스 환경변수가 있다면 `.env`보다 우선합니다.

확인은 다음 순서로 진행합니다.

1. `GET http://127.0.0.1:3000/api/health`의 `aiConfigured`는 키 존재 여부, `aiGenerationEnabled`는 생성 스위치, `aiEnabled`는 두 조건이 모두 켜졌는지를 뜻합니다. 키 유효성·모델 접근·결제 성공을 보장하지 않습니다. 이 조회는 OpenAI를 호출하지 않습니다.
2. 결제와 사용 한도를 준비한 뒤에만 `.env`의 `OPENAI_GENERATION_ENABLED=true`로 바꾸고 서버를 재시작합니다. 그 뒤 간단한 규칙 질문을 1회 보내 실제 API 응답과 사용 토큰을 확인합니다. 이 단계에는 API 비용이 발생하며 아직 실행하지 않았습니다.
3. 추천 처리 방법, 이유, 실제 조회한 코어룰 조항과 RiftJudge 사례 인용이 함께 표시되는지 확인합니다. 관련 사례를 찾지 못하면 사례를 만들어내면 안 됩니다.
4. 사진 첨부와 대회 상황 질문을 차례로 확인합니다.

`localhost:3000`은 서버가 실행 중인 집 PC의 주소입니다. 직장 브라우저에서 같은 주소를 입력하면 직장 기기를 가리킵니다. 이 채팅의 집 PC 실행 도구로 연결 확인을 진행할 수 있습니다.

## 노트북에서 이어갈 때

- 2026-10-18 이후 사용자는 노트북에서 작업할 예정입니다. 현재 작업 파일은 위 집 PC 경로에 있습니다. 자동 파일 이전·원격 연결·서버 자동 시작을 설정한 것은 아닙니다.
- 집 PC에 연결된 실행 환경으로 이어간다면 같은 폴더의 `WORKING_BRIEF.md`부터 읽습니다. 노트북에서 채팅이 보인다는 사실만으로 집 PC 파일 접근이 보장되지는 않으므로 실행 환경과 경로를 먼저 확인합니다.
- 노트북에서 서버를 별도로 실행하려면 앱 파일과 로컬 색인을 별도로 준비하고 API 키도 해당 기기의 서버 설정에 직접 저장해야 합니다. `.env`를 채팅·공유 문서에 복사하지 않습니다.

## 6. 연결이 실패할 때

| 결과 | 확인할 사항 |
| --- | --- |
| `aiConfigured: false` | 집 PC의 `.env` 위치, 빈 키, 서버 재시작 여부 |
| `aiGenerationEnabled: false` / `ai-paused` | 의도적인 생성 중지 상태. 결제·한도 준비 후 활성화 및 서버 재시작 |
| 인증 오류 또는 `401` | 잘못 복사된 키, 취소/만료된 키 |
| 권한 오류 또는 `403` | 프로젝트 및 API 키의 Responses 쓰기 권한 |
| 모델 접근 오류 | `OPENAI_MODEL`의 모델 ID와 API 프로젝트의 사용 권한 |
| 잔액/월 한도 관련 `429` | Billing 잔액, 조직·프로젝트 한도, API 오류 코드 |
| 요청/토큰 속도 관련 `429` | 호출 간격과 프로젝트 rate limit |
| `no-evidence` | API 키 문제가 아니라 질문과 관련된 공식 룰 검색 실패 |

## 공식 문서

- [API 시작하기](https://developers.openai.com/api/docs/quickstart)
- [API 키 관리와 운영 준비](https://developers.openai.com/api/docs/guides/production-best-practices)
- [사용 티어와 모델별 요청 한도](https://developers.openai.com/api/docs/guides/rate-limits)
- [사용 금액 알림과 Hard limit](https://developers.openai.com/api/docs/guides/spend-limits)
- [ChatGPT 사용량과 API 요금 구분](https://learn.chatgpt.com/docs/pricing)
- [모델 API 변경 이력](https://developers.openai.com/api/docs/changelog)
