# Cloudflare 임시 공개 연결

2026-10-19. 사용자가 실행 파일 준비와 연결을 요청했다.

- 실행 파일: `private/tools/cloudflared.exe`, 버전2026.10.1. 실제 명령 인수 호환성과 터널 등록 확인.
- 종료되어 있던 관리 프로그램3100을 다시 시작하고, 관리 API에서 hosting.provider=cloudflare-quick 저장 후 통합본3001·터널 시작.
- 연결 당시 URL: https://roberts-msgid-stuffed-elimination.trycloudflare.com
- 관리자 상태: appRunning=true, tunnel=connected, error빈값. 주소는 재시작 시 변경될 수 있다.

## 공개 HTTPS 요청 결과

| 경로/조건 | 결과 |
|---|---|
| `/` | 200, 리프트어시 페이지 |
| `/api/health` | 200, v0.1.1, public-beta, aiEnabled=true |
| `/api/cards/search?q=포로` | 200, 28개 결과 |
| `/api/status` | 404 |
| `/private/manager.key` | 404 |
| `/.env` | 404 |
| `/manager.js` | 404 |
| 다른 Origin의 POST `/api/ask` | 403, 모델 호출 전 거부 |

익명 세션 쿠키의 Secure 속성을 확인했다. 키/쿠키 값은 출력하지 않았다. 브라우저로 공개 주소의 화면 표시를 확인했다. [화면 기록](public-quick-2026-10-19.jpg).

이번 작업의 유료 AI 호출0. 휴대폰 모바일 데이터 접속·공개 URL의 실제 생성/번역은 아직 확인하지 않았다. 전체 보안 감사·룰링 정확도 검증을 수행한 것은 아니다. 원본3000·계정·결제·도메인·공유기 설정은 변경하지 않았다.

운영: `Open-Manager.cmd` → 서버 끄기/켜기/공개 주소 복사. 현재 설정에서 서버 켜기는 외부 공개도 시작한다. PC와 인터넷이 유지되어야 하며 재부팅 자동 시작은 등록하지 않았다.
