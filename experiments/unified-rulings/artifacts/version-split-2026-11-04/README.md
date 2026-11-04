# 버전 분리 및 라이브 출시 준비 결과

2026-11-04 Asia/Seoul. 기준8차 완료 `955f6e8fb85692e274a3ba919486dacf6440433c`. Windows10 합성 배포·암호화 백업 복원·v017 routing rollback/데이터 보존은 사용자가 완료했다고 보고했다. 실제 Azure 배포 검증으로 해석하지 않는다.

## 브랜치

- `feature/riot-api-v0.2`와 Draft PR #1: 기존 head/base/draft를 유지한다. main 병합 없음.
- `release/v0.2.0`: v020 출시 안정화, CC의 신규 Codex 작업/합성 catalog 대상은 release branch. 데이터 권한/운영 준비 전 ready=false.
- `develop/v0.3.0`: v030 별도 코드, 개발 차수0, 앱/CC0.3.0. v020 코드는 그대로 보존한다. 다음 완료부터0.3.1/0.3.2. 자동 차수 증가 없음.
- 두 브랜치는 같은 phase8 SHA에서 출발했다. 공통 출시 보완은 develop에 cherry-pick했고 main/feature로 병합하지 않았다. 두 새 branch만 GitHub에 보존한다.

## 구현

schema1 legacy 카드의 구조 호환성을 원본 변경/허가 승격/DB 이관 없이 검사한다. 이미지 permissions.image를 텍스트 display와 분리하고 미발매 공개 근거를 runtime에서 확인한다. community 자료를 licensed/official로 재표시하지 않는다. ready=false/개발 fixture의 production 실행과 민감 runtime 파일의 symlink/hardlink를 store 열기 전에 거절한다. 정확한 commit의 권리·개인정보·실제 앱 staging·topology/Caddy/broker·DB분리/backup/rollback 준비 보고서도 배포 허가를 발급하지 않는다.

v030은 별도 환경 마커/.dev-data,3300/3301·worker3311/3312,세션/관리 쿠키와 Control Center 개발 LocalAppData namespace를 사용한다. 기존 실제 SSH/로그인 설정·기록은 자동 복사하지 않는다. staging/production 시작도 차단한다. 차수 도구는 exact SHA 테스트 증거와 clean develop branch를 확인하고 코드 metadata/hash만 갱신한다. 격리 Git fixture에서 적용/재적용 거절을 시험했다. 이번 실제 branch 버전은0.3.0이다.

## 검증

| 로컬 검사 | release/v020 | develop/v030 |
|---|---:|---:|
| Node 전체 |140/140|147/147|
| 카드 검색·AI·제보 matrix |6/6(v017,v020)|9/9(v017,v020,v030)|
| v017 판정 회귀 |11/11|11/11|
| 브라우저 PC/모바일·법적 고지·제보·PWA |13/13|13/13|
| 배포/백업/롤백 합성 환경 |29/29|29/29|
| C#/Node·기존 관리자 계약·loopback SSH |263/263|263/263|
| 총계 |462/462|472/472|

WPF 교차 빌드 두 branch 오류0/경고0. backend85·deployment4·HMAC/한국어JSON vectors6·7개 크기 아이콘도 검사했다. release Windows GitHub runner는 별도 source269/packaged268, WPF smoke·ZIP최상위 EXE·실제 EXE 실행/종료·아이콘 검사를 통과했다(`release-windows-ci.json`의 SHA에 한정). 최신 브랜치 CI는 각 Actions 화면에서 exact SHA를 확인한다. GitHub Windows runner와 Windows10 실기기 검사는 구분한다. v030 Windows10 실기기·실제 Codex 추론/작업PR·Azure 접속/배포는 이번에 실행하지 않았다.

## 실제 출시 전 필수

[BRANCHING.md](../../BRANCHING.md)에 단계별 범위와 실제/합성 표를 기록했다. 제한 브로커·SSH 쓰기 연결/설치, 승인된 systemd 프로세스/포트/DataRoot·Caddy inventory, 실제 선택 앱 staging 기동, 운영 형식·키의 보안 백업/독립 restore, drain·신규 제보 보존·실제 routing rollback 훈련이 필요하다. v017 makeBackup은 purge를 먼저 하므로 읽기 전용 조사용으로 쓰지 않는다. 구버전에 새 DB를 덮거나 역마이그레이션하지 않는다. 키/사용자 기록은 GitHub/Codex/일반 로그로 보내지 않는다.

권한 확인 legacy 데이터·이미지·번역/모델 입력 범위와 개인정보처리자 연락처/법적 정보/처리 근거를 운영자가 확정해야 한다. Riot API 미승인은 미승인 legacy 데이터 이용을 허용하지 않는다. 공식 API 전환은 승인/mapper/공개/언어/에라타 검증 후 별도 진행한다. 준비 검증을 마치고 exact 출시 commit과 배포 계획에 사용자가 별도로 승인해야 실제 운영 활성화가 가능하다.

## 보존

기존 v01765파일과 공유 공개 자료/SQLite 캐시3개 포함8해시 불변. 원본 feature의 미커밋 AGENTS 변경 보존/제외. 새 worktree는 sparse 코드만 checkout하며 실제 카드·DB/키·사용자 기록을 복사하지 않는다. 민감 경로/패턴 검사 결과0건은 제한된 staged 검사이며 저장소 전체 이력 무비밀 보증이 아니다. 기존 tracked SQLite3개는 이번 commit 대상이 아니며 과거 이력의 추적 해제/정리는 별도 작업이다.

실제 Azure 변경·접속/재시작/배포, 운영 DB/키 접근·수정·복사·삭제, main 병합, 유료 API, 실제 Riot 연결 없음. Markdown 원본 보고서를 유지했고 사용자 컴퓨터 바탕화면에는 이 클라우드에서 직접 저장하지 않았다.
