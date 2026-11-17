# SSH 전용 운영 관리자 v0.2.11

서버 127.0.0.1:8765만 사용한다. Caddy·NSG 공개 포트 추가 없음. systemd 서비스는 공개 서비스와 독립적이고 자동 재시작·부팅 시작을 지원한다. SQLite readOnly + query_only + systemd 파일시스템 읽기 전용을 적용한다. WAL과 SHM은 운영 DB 옆의 기존 파일을 읽고 DB 복사본이나 immutable 모드를 사용하지 않는다. 스키마 변경·purge·checkpoint·설정 변경 없음.

집 PC PowerShell에서:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8765:127.0.0.1:8765 riftassist-azure
```

http://127.0.0.1:8765 에서 로그인한다. 기존 관리자 인증 수단을 사용한다. 인증 키·세션·본문을 터미널 로그나 파일에 출력하지 않는다. DB와 storage.key를 PC로 복사하지 않는다.

32바이트 난수 인증 키, HttpOnly/SameSite=Strict 쿠키, 일반 로그인 8시간 고정 만료, 로그인 속도 제한, Host·Origin 검증을 적용한다. HTTP 쿠키는 암호화된 SSH 터널 내부에서만 사용한다. 본문·세션·키를 로그에 남기지 않는다. localStorage/sessionStorage 및 응답 캐시는 사용하지 않는다. 인증 쿠키만 사용한다.

관리자 상태 확인은 서버 내부 `private/admin-probe.key`로 인증된 health 요청을 사용한다. 이 요청은 사용자 세션을 발급하거나 DB 통계를 변경하지 않는다. 일반 공개 health의 기존 접속 세션 동작은 유지한다. probe 키와 로그인 키는 서로 다르며 서버 내부에만 생성한다.

질문은 requests 기록, API 전송 시도는 calls 기록으로 집계한다. input_budget_exceeded/request_deadline은 전송 전 차단이므로 호출에서 제외한다. 네트워크 실패 시 공급자 수신·청구 여부는 확정할 수 없다. 토큰 합계는 확인된 값만 합산하며 미확인 호출 건수를 별도로 표시한다. 신규 접속은 session_counts이며 고유 방문자 수가 아니다. 질문 오류는 failed/server-error/error, processing은 진행 중, 나머지는 처리 완료다. 처리 완료가 판정의 정확성을 뜻하지 않는다.

v0.2.7의 금지 판정은 DB 기록 없이 반환되어 과거 질문 건수를 복원할 수 없다. v0.2.8부터 기존 요청 보존·중복 방지 흐름 안에서 금지 판정을 기록하며 추가 AI 호출은 없다. 질문 본문 7일·메타데이터 30일·제보 90일 정책은 유지한다. 제보 당시 저장된 snapshot은 기존 제보 보존 정책을 따른다. 삭제된 본문을 trace 등으로 복원하지 않는다.

## 질문·답변 기록

운영 현황 / 질문·답변 기록 / 사용자 제보 탭을 제공한다. GET /api/requests는 기본 최근 7일, 기본 20건·최대 50건이며 day(KST), range(7/30), status(success/failed/processing), ai(used/unused/unknown), offset, limit만 허용한다. 30일 내 후보 5,000건을 초과하면 날짜를 좁혀야 한다. 인증 세션당 기록 조회는 분당 30회로 제한한다. API 사용은 저장된 전송 시도이며 공급자 수신·과금을 확정하지 않는다.

GET /api/requests/:id는 저장된 최종 답변·근거·오류 및 안전한 처리 메타데이터를 제공한다. 7일 지난 본문은 DB에 정리 전 남아 있더라도 조회하지 않으며 trace 검색어·제보 사본·백업에서 복원하지 않는다. 호출은 trace.generationAttempts.callId와 동일 요청 소유자의 calls.id가 일치할 때만 연결한다. 명시적 연결이 없으면 시간·세션으로 추정하지 않는다. 토큰은 저장된 trace 집계 또는 정확히 연결된 calls의 확인된 값만 제공한다. 내부 사고 과정·소유자·중복 키·원시 trace는 제공하지 않는다.

본문은 textContent로 렌더링하고 출처는 HTTPS 링크만 수동 제공하며 이미지·외부 리소스를 자동 요청하지 않는다. 브라우저·응답은 no-store이고 대량 내보내기·새 DB·쓰기 API는 추가하지 않는다. 관리자 표시 버전은 기존 운영 health에서 읽어 공개 버전과 맞춘다.

## 신뢰한 기기 로그인 유지 (v0.2.11)

기본 해제된 체크박스를 선택해 키로 로그인하면 최초 로그인부터 30일 동안 이 기기를 기억한다. 미선택 로그인은 8시간이다. 로그인 확인이 끝날 때까지 로그인 폼을 숨기고, 상태 조회 실패와 미인증을 구분한다. 원본 키는 브라우저 저장소에 저장하지 않는다.

`riftadmin_session_v1`과 `riftadmin_trusted_v1`은 host-only /api 경로의 HttpOnly, SameSite=Strict 쿠키다. 현재 HTTP 루프백·SSH 터널에서는 Secure 쿠키의 브라우저별 호환성 차이로 Secure를 설정하지 않으며 HTTPS 연결에서는 설정한다. 원격 구간은 SSH가 암호화한다. 같은 주소(127.0.0.1 또는 localhost)로 접속해야 쿠키가 유지된다. 쿠키는 포트별로 격리되지 않으므로 로컬 서비스·OS·브라우저 프로필을 신뢰해야 한다. HttpOnly는 디스크/OS 접근자나 현재 유효 토큰의 최초 탈취 사용까지 막지 못한다. 공용·회사 PC에서는 선택하지 않는다.

장기 토큰은 128비트 임의 선택자와 256비트 비밀 값이며 서버에는 HMAC 해시·최초 발급/만료 시각·이전 해시만 보관한다. /api/session의 JSON POST가 기존 8시간 세션을 확인하거나 장기 토큰을 일회 회전해 새 세션을 발급한다. 30일 만료일은 자동 갱신으로 늘지 않는다. 중복 창의 15초 동시 갱신은 409로 거절하고 인증 권한을 주지 않는다. 이후 이미 사용된 토큰을 재사용하면 해당 기기와 자식 세션을 폐기한다. 잘못된 임의 검증 값은 알려진 기기를 폐기하지 못한다. 로그아웃과 로그인 유지 해제는 해당 기기의 상태를 원자적으로 폐기한다. 별도 기기에는 영향이 없다.

인증 상태는 systemd StateDirectory=/var/lib/riftassist-admin-auth (0700), trusted-devices.json (0600)에 별도 저장한다. 기존 운영 SQLite, storage.key, 관리자 키는 교체·수정하지 않는다. ProtectSystem=strict/ProtectHome=read-only를 유지하며 이 인증 상태 디렉터리만 추가로 쓴다. 상태 파일은 기존 관리자 키에 연결된 MAC로 무결성을 검사하고 손상/저장 실패 시 장기 인증을 허용하지 않는다. 정상 systemd 단일 프로세스가 전용 상태를 관리한다. 코드 롤백 시 상태 파일을 복원하지 않으며 과거 사본 복원으로 폐기 토큰을 되살리지 않는다. 관리자 키를 추후 교체하거나 파일이 손상된 경우 운영자가 서버에서 신뢰 상태를 별도 점검·초기화해야 한다. 이 패치는 키를 변경하지 않는다.

서버 재시작 후 장기 인증은 유지되며 일반 메모리 세션은 재인증이 필요할 수 있다. 인증 JSON POST에는 동일 Origin과 Content-Type: application/json이 필요하고 기존 10회/분 키 로그인 제한 및 60회/분 자동 인증 확인 제한을 적용한다. 원시 키·토큰·쿠키·질문은 로그에 남기지 않는다. 일반 운영 DB 읽기 전용 정책과 본문 보관 기간은 그대로다.

참고: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html , https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie , https://www.freedesktop.org/software/systemd/man/257/systemd.exec.html
