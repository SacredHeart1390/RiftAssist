# Control Center 8차 개발·검증 기록

2026-11-04 Asia/Seoul. 기존 feature/riot-api-v0.2 / Draft PR #1. [기능/구조·사용법·실제/모의 경계·운영 활성화·실기기 검증·버전 분리 계획](../../control-center/PHASE8.md).

## 구현

WPF 배포·롤백 탭과 GitHub 개발 커밋/CI 선택·코드 패키지/해시, 실제 Node/SQLite 온라인 백업·AES-GCM·복원 probe, 별도 합성 릴리스/DB/키·loopback 모의 HTTP 서비스·라우팅 CAS, 이력/실패/중복/중단 재조회를 추가했다. 실제 Azure 쓰기는 전송 전에 차단하며 UI에도 활성화 스위치가 없다. Ubuntu systemd/Caddy는 모의 IO 계약이고 실제 SSH 배포 브로커 설치/쓰기는 미구현이다. 운영 경로/unit/인증서를 추정하여 조작하지 않았다.

lab health는 선택 코드의 무결성과 모의 HTTP/admin/mock AI/저장 검증이며 **선택한 RiftAssist 앱 자체를 새로운 실제 unit에서 기동한 시험은 아니다.** 해당 앱의 기존 회귀와 GitHub CI 증거는 별도로 확인한다. 전체 운영 blue-green/HTTPS/복구 시험은 staging 후속이다.

롤백은 이전 앱/route를 선택하고 양쪽 DB·키·전환 이후 기록을 보존한다. 역 migration/덮어쓰기/운영 DB 복원은 없다. 암호화 백업과 wrapping key는 별도 private 경계이며 실제 자료를 GitHub/모델로 보내지 않는다. 백업 API makeBackup은 purge/키 복사 부수효과가 있어 기존 운영 관리자에 호출하지 않았다.

7차 도구에 Windows Job Object kill-on-close·현재 사용자 DPAPI 소유 receipt를 추가했다. stdin 전 보호, 정상 취소/앱 crash 하위 프로세스 종료, 이전 owner의 named Job 조회/승인 정리·살아 있는 owner 보존·임의 PID kill 금지를 구현했다. 수정/게시 미확정 이력은 자동 재실행하지 않는다. 실제 Codex 추론/런타임 수정 PR 게시 시험은 하지 않았다.

## 로컬 결과

| 검사 | 결과 |
| --- | --- |
| C# 기존252 + 배포 통합11 | 263/263 |
| 신규 Node 배포/백업/롤백·Ubuntu 계약 | 29/29 |
| 기존 Node 카드/번역/동기화/검토/운영 회귀 | 132/132 |
| PC/모바일 웹 | 13/13 |
| v017 판정 호환 | 11/11 |
| Windows WPF/smoke 교차 빌드 | 오류·경고0 |

총448/448. SQLite WAL 포함 snapshot/복호화 가능한 복원, 손상 새 DB rollback, precheck/디스크·백업·중간 전송·기동·health·route·post-health·복귀 실패, response-loss/중단·owner lock·같은 op 중복, owner/consent/hash/stale 검사를 포함한다. HTTP/mock AI·systemd/Caddy IO·GitHub metadata는 합성/모의다. Native C#→Node 프로토콜의 실제 코드 패키지/배포/암호화 백업 검증/롤백을 별도로 실행했다.

Windows CI에서는 기존7차+배포 화면 승인/거절·조회 무확인·운영 차단, 부모만 강제 종료하는 실제 Node 트리/Job receipt, 소스/추출 패키지 C#, 루트 EXE/아이콘/실행·종료를 추가 검증한다. 결과와 새 링크는 CI 완료 후 추가한다. 실제 회사 Windows10·Codex 추론·GitHub 오류 수정 PR·Azure는 개발자가 시험하지 않았다.

## 보존·미확인

v017 65파일/main 불변, 공유 active/공개 자료·추적 SQLite3개 포함8해시 불변, v020 Node107/payload83·ready=false 유지. 운영 DB/키/사용자 기록을 읽거나 복사·수정·삭제하지 않았다. 비교는 공개 자료/캐시의 해시만 사용한다. 기존 AGENTS.md 변경을 보존/커밋 제외한다. 실제 Azure 접속/변경/재시작/배포·main 병합·유료 API·Riot 실제 연동0회다.

실제 unit ExecStart/프로세스 소유/포트·DataRoot·Caddy import/TLS 구성이 미확인이다. 별도 조사/설치 승인, 제한 서버 브로커/원격 어댑터, 선택 앱의 실제 staging 기동/인증/AI 예산·실제 backup/키 보관/restore·제보 보존 훈련이 운영 활성화 필수다. 현재 green lab 결과는 운영 배포 허가가 아니다.

release/v0.2.0 / develop/v0.3.0 분리는 별도 사용자 승인 전 수행하지 않았다. 이후 v03n 개발 차수 완료 시 patch 증가, Riot 승인·권한 확인 자료/번역·API 계약 검증과 v1.0.0 준비를 별도로 진행한다. 미승인 리프트나루 자료를 v020 공개 데이터로 복사하지 않는다.

문서는 Markdown 원본으로 보관한다. 클라우드에서 사용자 바탕화면에 직접 복사하지 않았다.
