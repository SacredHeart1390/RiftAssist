# RiftAssist v0.2.8 운영 배포 결과

확인일: 2026-11-16 KST. 브랜치 `feat/v0.2.8-admin-web`.
실제 배포 코드: `7350a9f48d484816a3f71c6c6fd9d21546bbd274`.
[최종 커밋 CI 성공](https://github.com/SacredHeart1390/RiftAssist/actions/runs/43734638216).

## 운영 상태와 접근

- 공개 사이트 https://riftassistant.app — 상단·하단 v0.2.8 BETA, API release/health 0.2.8, 내부 호환성 v0.2.0 유지.
- production/live, gpt-6-luna, 카드 1,527장, 기존 자료 버전·키·설정 유지.
- `riftassist.service`와 독립 `riftassist-admin.service` 모두 active. 관리자는 enabled, Restart=on-failure.
- 서버 관리자 바인딩은 `127.0.0.1:8765`. Caddy와 NSG 변경 없음. 공개 관리자 경로·외부 IP의 8765 접근 실패 확인.
- 집 PC SSH 별칭 `riftassist-azure`, 기존 홈 키와 검증된 호스트 지문 재사용. 새 SSH 키 발급 없음.
- 집 PC의 SSH 로컬 터널을 열고 실제 Edge 1280px/390px에서 관리자 인증·통계·제보 상세 조회 성공.
- 집 PC 주소: http://127.0.0.1:8765 . 작업 종료 시점 터널은 실행 중이다. PC 종료·SSH 종료 후에는 아래 명령으로 다시 연다.

```powershell
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:8765:127.0.0.1:8765 riftassist-azure
```

로그인 키는 서버에서 생성한 32바이트 난수다. 다른 PowerShell에서 클립보드에 복사하여 로그인하고 지운다. 저장소·문서에 키 자체는 기록하지 않는다.

```powershell
ssh riftassist-azure 'cat /etc/riftassist/admin-web.key' | Set-Clipboard
# 로그인 후
Set-Clipboard -Value ''
```

HttpOnly/SameSite=Strict 세션은 8시간 후 만료된다. Host·Origin 검증, 로그인 속도 제한, no-store/noindex 적용. SQLite readOnly/query_only와 systemd ProtectSystem=strict/ProtectHome=read-only를 적용했다. 관리자 상태 확인은 별도 서버 내부 probe 키를 사용하며 새 사용자 세션이나 운영 DB 기록을 만들지 않는다.

## 실제 데이터 대조

| 범위 | 질문 기록 | AI 호출 기록 | 입력 토큰 | 출력 토큰 | 토큰 미확인 호출 |
|---|---:|---:|---:|---:|---:|
| 오늘 | 0 | 0 | 0 | 0 | 0 |
| 최근 7일 | 21 | 26 | 171,075 | 23,217 | 0 |
| 최근 30일 | 109 | 148 | 719,825 | 123,616 | 1 |

KST 기준 일별 값 각각을 독립 SQL과 대조하여 일치 확인. AI 호출은 기존 calls의 전송 시도 기록이며 알려진 전송 전 차단을 제외한다. 공급자 수신 여부·실제 청구액을 확정하지 않는다. 신규 세션을 고유 방문자로 표시하지 않는다.

실제 제보 4건, 미해결 1건. 서버 내부에서 4건 모두 복호화·처리 이력을 읽었으며 집 PC 브라우저에서 실제 상세를 확인했다. 질문·답변 원문과 식별자는 보고서·스크린샷·검증 출력에 포함하지 않았다. 보존 정책은 본문 7일·메타데이터 30일·제보 90일 그대로다.

## 검증

- GitHub 최종 CI: 전체 회귀 371개, 관리자 12개, 호환성 3개, 구버전 11개, 브라우저 40개 모두 성공.
- 관리자 합성 검사: KST 경계, 질문/호출/세션 구분, 토큰·오류·제보 집계, 필터, 암호화 상세, 질문 연결, 보존 기간, WAL 최신 조회, 쓰기 거부, 인증·세션 만료·Host/Origin 검증.
- 실제 공개 사이트의 카드 검색과 실제 이미지 로딩 성공. 운영 서버에 배포된 지역별 금지 판정 모듈의 한국/글로벌 결과 확인. 질문 전체 흐름은 합성 API·브라우저 회귀에서 검증했다.
- 집 PC에서 SSH 터널·실제 관리자 인증·통계·제보 상세·모바일 가로 넘침 확인. 비인증 요청 401, 외부 관리자 포트와 공개 관리자 경로 차단 확인.
- 관리자 조회 전후 세션 통계 불변. 보존 대상 기존 기록과 설정·키의 해시 대조 성공. 운영 질문/제보 시험 레코드 생성 및 유료 OpenAI 호출 0회.

## 백업과 복구

서버 내부 백업:
`/home/azureuser/RiftAssist-v020-e06496b0/code-backups/patch028-before-7350a9f48d484816a3f71c6c6fd9d21546bbd274`

v0.2.7 교체 대상 코드, 온라인 일관 SQLite 백업, 대응 storage.key, 보존 검증 영수증을 0700 디렉터리에 보관했다. DB quick_check 성공. DB와 복호화 키를 집 PC나 GitHub로 전송하지 않았다. 코드 롤백은 이 백업의 code/를 복사하고 공개 서비스만 재시작하며 DB 복원은 수행하지 않는다. 초기 배포 검증의 변동 시각 비교 오탐에서 실제 코드 자동 롤백이 작동했고, 검증기 수정 후 최종 배포를 완료했다.

배포 영수증은 서버 `/home/azureuser/RiftAssist-v020-e06496b0/deployment-v028.json`에 기록했다.

## 제한

- 유료 OpenAI 실호출은 요청에 따라 실행하지 않았다. 기존 모델·설정 보존과 합성 생성 흐름을 검증했다.
- 실제 모바일 단말과 VM 재부팅은 하지 않았다. 390px 브라우저 검사와 systemd enabled 상태를 확인했다.
- v0.2.7의 기록되지 않은 규칙 기반 금지 판정은 과거 통계로 복원할 수 없다. v0.2.8부터 기존 요청 기록 흐름에 포함한다.
- 원본 동기화 폴더는 유지하고 `dev-v028` worktree에서 작업했다. 로컬 검증 로그·합성 화면은 worktree의 `tmp/admin-qa/`에 보관했다.
