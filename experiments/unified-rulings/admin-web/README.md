# SSH 전용 운영 관리자 v0.2.8

서버 127.0.0.1:8765만 사용한다. Caddy·NSG 공개 포트 추가 없음. systemd 서비스는 공개 서비스와 독립적이고 자동 재시작·부팅 시작을 지원한다. SQLite readOnly + query_only + systemd 파일시스템 읽기 전용을 적용한다. WAL과 SHM은 운영 DB 옆의 기존 파일을 읽고 DB 복사본이나 immutable 모드를 사용하지 않는다. 스키마 변경·purge·checkpoint·설정 변경 없음.

집 PC PowerShell에서:

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8765:127.0.0.1:8765 riftassist-azure
```

http://127.0.0.1:8765 에서 로그인한다. 인증 키는 서버에만 생성된다. 새 PowerShell에서 아래 명령으로 클립보드에 받아 로그인 후 지운다. storage.key와 DB는 가져오지 않는다.

```powershell
ssh riftassist-azure 'cat /etc/riftassist/admin-web.key' | Set-Clipboard
# 로그인 후
Set-Clipboard -Value ''
```

32바이트 난수 인증 키, HttpOnly/SameSite=Strict 쿠키, 8시간 고정 만료, 로그인 속도 제한, Host·Origin 검증을 적용한다. HTTP 쿠키는 암호화된 SSH 터널 내부에서만 사용한다. 본문·세션·키를 로그에 남기지 않는다. 브라우저 저장소 및 캐시를 사용하지 않는다.

관리자 상태 확인은 서버 내부 `private/admin-probe.key`로 인증된 health 요청을 사용한다. 이 요청은 사용자 세션을 발급하거나 DB 통계를 변경하지 않는다. 일반 공개 health의 기존 접속 세션 동작은 유지한다. probe 키와 로그인 키는 서로 다르며 서버 내부에만 생성한다.

질문은 requests 기록, API 전송 시도는 calls 기록으로 집계한다. input_budget_exceeded/request_deadline은 전송 전 차단이므로 호출에서 제외한다. 네트워크 실패 시 공급자 수신·청구 여부는 확정할 수 없다. 토큰 합계는 확인된 값만 합산하며 미확인 호출 건수를 별도로 표시한다. 신규 접속은 session_counts이며 고유 방문자 수가 아니다. 질문 오류는 failed/server-error/error, processing은 진행 중, 나머지는 처리 완료다. 처리 완료가 판정의 정확성을 뜻하지 않는다.

v0.2.7의 금지 판정은 DB 기록 없이 반환되어 과거 질문 건수를 복원할 수 없다. v0.2.8부터 기존 요청 보존·중복 방지 흐름 안에서 금지 판정을 기록하며 추가 AI 호출은 없다. 질문 본문 7일·메타데이터 30일·제보 90일 정책은 유지한다. 제보 당시 저장된 snapshot은 기존 제보 보존 정책을 따른다. 삭제된 본문을 trace 등으로 복원하지 않는다.
