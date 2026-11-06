# 원본 일치와 추가 경로 위험 분리 — 검증 기록

2026-11-06(한국). 사용자가 보고한 것은65개 코드 hash 일치 및 전체 referenceVerified=false다. 추가 경로 내용·이름을 확보했다고 주장하지 않는다. 실제 Azure 접속/운영 DB·키 접근/서비스 제어/유료 AI 호출은0이다. 새 조사 원문은 별도 승인 대기이며 실제 서버에서 실행하지 않았다.

로컬604개(중복 합산 없이 집계, Node230개는 v24.19.0과 공식 SHA256을 검증한 v24.22.1에서 각각 재검증): Node230(교체32+hardening26 포함), C#284, 양 버전 호환6, v017회귀11, 브라우저/모바일/PWA17, lab29, Python27. Python은 기존 조사/준비18 및 새 metadata probe9다. golden protocol/manifest/icon/65개 Git 감사, WPF cross-build(경고0/오류0)는 별도이며 중복 합산하지 않는다. Windows의 실제 WPF·패키지 시작/종료 및 실제 systemd는 GitHub CI 증거로 구분한다. Linux 디렉터리 FD의 실제 실행1건은 Windows에서 의도적으로 제외하고 Ubuntu에서 검증한다. Windows는 그 부분의 가상 IO 계약을 실행한다.

새 시험은65개 일치+추가 생성물/공개 파일/비밀 파일·디렉터리/기준 코드 변조·큰 목록을 구분하고, 추가 내용을 열거나 임의 이름을 출력하지 않는지 검증한다. 추가 경로가 있으면 기존 엄격한 receipt와 배포 gate는 계속 실패한다. fixture를 삭제/정리해 운영 상태를 대신 승인하지 않는다.

Node v24.22.1/UID·GID1000은 관찰 요약과 예시에 반영했다. 서비스 어댑터는 전체 Node 버전 pin 및 실제 사용자 identity 일치, helper absent/masked·inactive/failed·MainPID0·대기 Job 없음·cgroup 자식 없음과 stop/start 주변 재검사를 요구한다. enabled/inactive·activating·대기 작업·남은 writer·preflight 이후 변경 시 실제 서비스 명령 전 거절하는 합성 시험을 추가했다. 자동 mask/disable은 없다. 기존 설치 inventory는 nodeVersion을 검토해 포함하고 owner/승인 binding을 다시 발급해야 하며 자동 수정하지 않는다.

새 probe는 테스트 가상 IO와 실제 임시 POSIX 코드 디렉터리에서만 실행했다. 임시 DB/key 이름의 합성 파일도 열지 않았다. 원시 unit 인수/Environment/비밀 모형 값은 결과에서 제거하고 미확인 필드는 null로 둔다. 새 PowerShell scope는 기존 승인된 두 probe와 분리하며 Verify는 SSH0회, Inspect는 별도 승인 switch 및 SHA 일치가 필요하다. Windows 패키지 검사도 이 기본 차단을 검증한다.

disposable-ubuntu.json은 --network none Ubuntu24 컨테이너에서 실제 두 버전 앱을 같은 포트로 순차 기동·백업/독립 복원·복귀한 증거다. Caddy/TLS/원본 키·기록과 새 합성 제보2건을 보존했고 source ready=false다. systemd=false인 컨테이너 증거를 실제 systemd 시험으로 부르지 않는다. native Ubuntu CI가 별도로 단일 앱 unit 시험을 수행한다.

승인 범위·SHA·추가 경로 위험 표와 아직 필요한 실제 설치/복구/배포 절차는 [SOURCE-EXTRAS-AND-AUTOSTART.md](../../../SOURCE-EXTRAS-AND-AUTOSTART.md)를 따른다. 추가 경로 및 autostart 실제 동작 검토, 최종 운영 설정 hash, 실제 DB/키/스키마/백업·복구키 정책, 자료 권한·개인정보 운영 항목과 별도 설치·중단·배포 승인은 계속 차단 조건이다. 실제 Windows10 PC/PWA 및 Azure 운영 부하/설정 검증은 CI로 대신하지 않는다.
