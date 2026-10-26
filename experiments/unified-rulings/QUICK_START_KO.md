# 리프트어시 — 집에서 시작하기

갱신: 2026-10-20. **Cloudflare 임시 공개 연결 완료.** 현재 주소는 관리자 화면의 **공개 주소 복사**로 확인합니다. 10월20일09:54 확인 주소는 [리프트어시 임시 베타](https://robert-opportunity-options-jump.trycloudflare.com)이며 재시작하면 달라질 수 있습니다. 아래 1번 파일 준비는 이미 완료했습니다.

## 지금 사용할 수 있는 것

- 통합본 앱: [리프트어시 열기](http://127.0.0.1:3001/). 질문을 보내면 설정된 OpenAI API 사용료가 발생합니다.
- 관리: 이 폴더의 `Open-Manager.cmd`를 더블클릭합니다. 인증된 관리 화면에서 **서버 켜기 / 서버 끄기**, AI 중지, 한도, 제보, 백업을 관리합니다.
- 기존 `3000` 주소는 보존한 백업본입니다. 앞으로는 `3001`을 사용합니다.
- 오래된 화면이 보이면 새로고침합니다. 브라우저를 닫아도 관리 프로그램과 서버는 실행됩니다. PC 종료·절전·인터넷 끊김 때는 서비스를 사용할 수 없습니다.

현재 폴더:

```text
C:\Users\user\.codex\.chatgpt-projects\g-p-6ad1dd0b61bc8191a95d816389c6e577\experiments\unified-rulings
```

## 1. 최초 준비 — 완료, 다른 PC를 위한 참고

이번에 쓰는 것은 **Cloudflare Quick Tunnel 임시 주소**입니다. Cloudflare 계정, 결제 등록, 도메인 구매 없이 시험할 수 있습니다. 로그인이나 DNS 설정은 지금 하지 않아도 됩니다.

1. [Cloudflare 공식 다운로드 안내](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/#windows)를 엽니다.
2. **Windows → Executable → 64-bit → Download**를 선택합니다. `cloudflared-windows-amd64.exe`를 받습니다.
3. 파일 이름을 `cloudflared.exe`로 바꿉니다. 탐색기에서 확장자가 숨겨져 있으면 파일명 확장자를 표시한 뒤 변경합니다. 최종 이름이 `cloudflared.exe.exe`가 되지 않도록 합니다.
4. 이 폴더의 `Open-Tools-Folder.cmd`를 더블클릭합니다. 준비해 둔 `private\tools` 폴더가 열립니다. 그 안에 파일을 넣습니다.
5. 채팅에 **“Cloudflare 파일 준비 완료. 연결 작업 이어서 해줘.”**라고 알려 주세요. 파일을 넣는 것만으로는 외부에 공개되지 않습니다.

최종 위치:

```text
C:\Users\user\.codex\.chatgpt-projects\g-p-6ad1dd0b61bc8191a95d816389c6e577\experiments\unified-rulings\private\tools\cloudflared.exe
```

별도 설치 창을 진행하거나 실행 파일을 직접 더블클릭할 필요는 없습니다. 앱 관리 프로그램이 이 파일을 실행합니다. 다운로드가 차단되거나 실행 경고가 나오면 오류 문구를 알려 주세요.

## 2. 이후 함께 할 연결 순서

현재 Cloudflare 연결 설정을 저장했습니다. 이후 **서버 켜기**는 앱을 인터넷에 공개하고 **서버 끄기**는 앱과 연결을 함께 중지합니다. 아래는 처음 설정할 때의 순서입니다.

1. `Open-Manager.cmd`를 더블클릭합니다.
2. 서버가 실행 중이면 **서버 끄기**를 누릅니다.
3. **공개 주소 → 연결 방식 → Cloudflare 임시 주소 · 계정 없이 시험**을 선택합니다.
4. **주소 설정 저장**을 누릅니다. 주소는 자동 발급되므로 직접 입력하지 않습니다.
5. **서버 켜기**를 누릅니다. 연결 후 나타난 `https://…trycloudflare.com` 주소를 **공개 주소 복사**로 복사합니다.
6. 휴대폰의 와이파이를 끄고 모바일 데이터에서 그 주소를 열어 접속을 확인합니다. 답변·제보 연결은 필요한 최소 질문으로 확인합니다.
7. **서버 끄기**를 누르면 앱과 임시 연결이 함께 꺼집니다. 이후 **서버 켜기**에서는 새 주소가 나올 수 있습니다.

`127.0.0.1:3100`은 집 PC 관리자 전용입니다. 공유할 주소는 발급된 HTTPS 앱 주소입니다. `.env`, `private` 폴더, 관리자 인증 링크는 공유하지 않습니다.

## 임시 주소와 정식 주소의 차이

- Quick Tunnel은 시험용입니다. `riftassistant`처럼 이름을 지정하거나 임시 주소를 그대로 정식 도메인으로 승격할 수는 없습니다.
- 잘 돌아가면 원하는 도메인을 별도로 구매하고, Cloudflare 계정과 고정 Tunnel을 연결합니다. 앱·규칙·운영 DB는 집 PC에 계속 둘 수 있습니다. 원하는 도메인의 등록 가능 여부는 아직 확인하지 않았습니다.
- 임시 주소는 재연결 시 변경되고 가용성을 보장하지 않습니다. 동시에 처리 중인 요청 200개 제한과 SSE 미지원이 있습니다. 현재 앱의 답변 전달은 일반 JSON 응답입니다.
- 무료 터널과 별개로 OpenAI API 사용료, PC 전원·인터넷은 필요합니다. Windows의 cloudflared 업데이트는 수동입니다.

공식 기준: [Quick Tunnel 안내와 제한](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/), [Windows 다운로드](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/#windows).

## 다음 작업을 재개할 때

로컬 점검56개와 실제 Cloudflare 연결·공개 HTTPS 페이지/카드 검색·관리 경로 차단 확인을 마쳤습니다. 휴대폰 모바일 데이터 접속과 공개 URL에서의 실제 답변 확인이 다음 순서입니다. 이번 연결 확인에는 유료 AI 호출이 없었습니다. [외부 연결 기록](artifacts/public-connection-2026-10-19.md), [로컬 점검 기록](artifacts/home-preflight-2026-10-19.md), [운영 정책](HOME_HOSTING.md)을 참고합니다.
