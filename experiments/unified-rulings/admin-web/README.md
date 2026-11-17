# SSH 전용 운영 관리자 v0.2.11

관리자 웹의 로그인 화면·키 입력·로그아웃·8시간 세션·30일 기기 토큰을 제거했다. Azure 127.0.0.1:8765만 사용하며 SSH 터널 접속 즉시 대시보드를 보여 준다. Caddy 경로·NSG 포트 추가 없음.

기존 SSH 연결 설정으로 실행한다.

~~~powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8765:127.0.0.1:8765 riftassist-azure
~~~

http://127.0.0.1:8765 를 열면 운영 현황 / 질문·답변 기록 / 사용자 제보 탭을 바로 사용한다. 브라우저 새로고침·재시작 및 관리자 서비스 재시작에도 별도 인증이나 만료가 없다. 터널이 끊기면 다시 SSH 연결해야 한다.

앱별 인증이 없으므로 SSH 계정 권한과 VM·터널을 보유한 PC의 로컬 접근 권한이 관리 자료의 접근 경계다. VM 로컬 접근자와 해당 PC에서 터널을 사용할 수 있는 프로세스도 자료를 열람할 수 있다. 이 화면을 공유 프록시나 공개 포트로 제공하면 안 된다.

## 접근 및 데이터 보호

루프백 원격 주소, 정확한 localhost/127.0.0.1 Host와 유효 포트, 동일 Origin, Sec-Fetch-Site를 검사한다. DNS rebinding Host와 Forwarded/X-Forwarded 요청은 거부한다. API는 GET만 제공하고 로그인·로그아웃·세션 경로는 404다. CORS를 허용하지 않으며 CSP frame-ancestors none, nosniff, no-referrer, noindex 및 모든 응답의 no-store를 유지한다.

운영 SQLite는 readOnly + query_only이며 스키마 변경·purge·checkpoint·쓰기 API가 없다. 기존 AES-GCM 읽기 로직을 재사용한다. 질문 본문 7일·메타데이터 30일·제보 90일은 그대로며, 만료된 본문은 trace·제보 사본·백업에서 복원하지 않는다. 관리자 health는 별도 기존 내부 probe 키를 사용하므로 일반 사용자 접속 통계를 늘리지 않는다.

질문 목록은 기본 20건·최대 50건, KST 날짜/최근 7·30일/상태/AI 사용 필터를 제공한다. 복호화 후보 5,000건을 초과하면 날짜를 좁혀야 한다. 기기 쿠키·세션 없이 전체 관리자 프로세스의 질문 조회를 분당 30회로 제한한다. 호출은 저장된 callId와 동일 소유자의 calls.id가 일치할 때만 연결하며 시간·세션으로 추정하지 않는다.

본문은 textContent로 렌더링하고 외부 이미지를 자동 요청하지 않는다. source 링크는 HTTPS만 제공한다. 앱은 쿠키·localStorage·sessionStorage를 사용하지 않는다. 이전 인증 쿠키는 무시하고 인증 키나 토큰 상태를 읽거나 갱신하지 않는다. 예전 관리자 키와 인증 상태 파일은 삭제하지 않고 비활성 상태로 보존한다. 기존 관리자 키를 사용하는 다른 서비스에도 영향을 주지 않는다.

systemd ProtectSystem=strict 및 ProtectHome=read-only를 유지한다. 기존 trusted-device.conf는 서버 내부 코드 백업으로 보존하고, SSH 전용 drop-in에서 이전 관리자 인증 환경변수를 unset하고 StateDirectory 쓰기 예외를 해제한다. /var/lib/riftassist-admin-auth 및 키 파일은 자동 삭제하지 않는다.

## 검증

합성 DB와 독립 브라우저 프로필로 무로그인·재시작·조회·Host/Origin·읽기 전용을 검사한다. 서버의 deploy-check.cjs는 키 입력 없이 실제 조회와 DB 행 불변을 검증하며 원문·키를 출력하지 않는다. 테스트 프로필이나 운영 DB를 GitHub/CI 아티팩트로 업로드하지 않는다.
