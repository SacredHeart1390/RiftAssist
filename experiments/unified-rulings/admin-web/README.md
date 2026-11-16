# SSH 전용 운영 관리자 v0.2.10

서버 127.0.0.1:8765만 사용한다. Caddy·NSG 공개 포트 추가 없음. systemd 서비스는 공개 서비스와 독립적이고 자동 재시작·부팅 시작을 지원한다. SQLite readOnly + query_only + systemd 파일시스템 읽기 전용을 적용한다. WAL과 SHM은 운영 DB 옆의 기존 파일을 읽고 DB 복사본이나 immutable 모드를 사용하지 않는다. 스키마 변경·purge·checkpoint·설정 변경 없음.

집 PC PowerShell에서:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8765:127.0.0.1:8765 riftassist-azure
```

http://127.0.0.1:8765 에서 로그인한다. 기존 관리자 인증 수단을 사용한다. 인증 키·세션·본문을 터미널 로그나 파일에 출력하지 않는다. DB와 storage.key를 PC로 복사하지 않는다.

32바이트 난수 인증 키, HttpOnly/SameSite=Strict 쿠키, 8시간 고정 만료, 로그인 속도 제한, Host·Origin 검증을 적용한다. HTTP 쿠키는 암호화된 SSH 터널 내부에서만 사용한다. 본문·세션·키를 로그에 남기지 않는다. 브라우저 저장소 및 캐시를 사용하지 않는다.

관리자 상태 확인은 서버 내부 `private/admin-probe.key`로 인증된 health 요청을 사용한다. 이 요청은 사용자 세션을 발급하거나 DB 통계를 변경하지 않는다. 일반 공개 health의 기존 접속 세션 동작은 유지한다. probe 키와 로그인 키는 서로 다르며 서버 내부에만 생성한다.

질문은 requests 기록, API 전송 시도는 calls 기록으로 집계한다. input_budget_exceeded/request_deadline은 전송 전 차단이므로 호출에서 제외한다. 네트워크 실패 시 공급자 수신·청구 여부는 확정할 수 없다. 토큰 합계는 확인된 값만 합산하며 미확인 호출 건수를 별도로 표시한다. 신규 접속은 session_counts이며 고유 방문자 수가 아니다. 질문 오류는 failed/server-error/error, processing은 진행 중, 나머지는 처리 완료다. 처리 완료가 판정의 정확성을 뜻하지 않는다.

v0.2.7의 금지 판정은 DB 기록 없이 반환되어 과거 질문 건수를 복원할 수 없다. v0.2.8부터 기존 요청 보존·중복 방지 흐름 안에서 금지 판정을 기록하며 추가 AI 호출은 없다. 질문 본문 7일·메타데이터 30일·제보 90일 정책은 유지한다. 제보 당시 저장된 snapshot은 기존 제보 보존 정책을 따른다. 삭제된 본문을 trace 등으로 복원하지 않는다.

## 질문·답변 기록

운영 현황 / 질문·답변 기록 / 사용자 제보 탭을 제공한다. GET /api/requests는 기본 최근 7일, 기본 20건·최대 50건이며 day(KST), range(7/30), status(success/failed/processing), ai(used/unused/unknown), offset, limit만 허용한다. 30일 내 후보 5,000건을 초과하면 날짜를 좁혀야 한다. 인증 세션당 기록 조회는 분당 30회로 제한한다. API 사용은 저장된 전송 시도이며 공급자 수신·과금을 확정하지 않는다.

GET /api/requests/:id는 저장된 최종 답변·근거·오류 및 안전한 처리 메타데이터를 제공한다. 7일 지난 본문은 DB에 정리 전 남아 있더라도 조회하지 않으며 trace 검색어·제보 사본·백업에서 복원하지 않는다. 호출은 trace.generationAttempts.callId와 동일 요청 소유자의 calls.id가 일치할 때만 연결한다. 명시적 연결이 없으면 시간·세션으로 추정하지 않는다. 토큰은 저장된 trace 집계 또는 정확히 연결된 calls의 확인된 값만 제공한다. 내부 사고 과정·소유자·중복 키·원시 trace는 제공하지 않는다.

본문은 textContent로 렌더링하고 출처는 HTTPS 링크만 수동 제공하며 이미지·외부 리소스를 자동 요청하지 않는다. 브라우저·응답은 no-store이고 대량 내보내기·새 DB·쓰기 API는 추가하지 않는다. 관리자 표시 버전은 기존 운영 health에서 읽어 공개 버전과 맞춘다.
