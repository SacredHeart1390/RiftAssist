# 출시 우선 브랜치와 확정 로드맵

2026-11-09 갱신. 현재 작업은 **release/v0.2.0**에서만 한다. `feature/riot-api-v0.2`와 Draft PR #1, `main`, `develop/v0.3.0`은 보존한다. 현재 라이브는 v0.1.7이며 브랜치 준비/CI 성공은 실제 교체 승인이 아니다.

## 현재 우선순위

기존 Azure VM의 v0.1.7을 중지하고 v0.2.0 한 버전만 실행한다. 같은 도메인·Caddy·3001/3100·기존 관리자 인증을 유지한다. 별도 VM이나 병렬 staging을 요구하지 않는다. 초기 출시는 [수동 SSH + 검증된 일회성 교체 절차](control-center/MANUAL-LIVE-RELEASE.md)를 우선한다. Control Center 자동 배포 UI/상시 broker/sudoers 완성은 필수 gate가 아니다. 실제 설치/DB·키·설정 처리/서비스 교체/복구 쓰기는 각각 승인 범위를 확정한 후에만 한다.

[현재 출시 범위](control-center/MINIMUM-LIVE-SCOPE.md)는 **기존 v017 카드 DB/검색·질문·판정 + v020 개선사항**이다. 카드 없는 rules-only로 축소하지 않는다. API 키와 자료 이용 권한을 구분하며 검토된 legacy 자료를 사용한다. [실제 조사와 호환 경로](control-center/LEGACY-CARD-LAUNCH.md)를 따른다. ready=false와 자료/개인정보/백업·운영 검증을 유지한다.

## 라이브 이후

확정 순서는 **v0.2.0 카드 포함 라이브 → v0.2.n 라이브 개선 → Riot 허가 후 v0.3.0 공식 API 카드 연동 개발 → 최신 v0.2.n과 공식 API 결과를 v0.4.0에 통합 → v1.0.0 정식/SEO**이다. 태그/유지보수 브랜치 전략, 선택 통합 및 SEO 조건은 [LIVE-ROADMAP.md](control-center/LIVE-ROADMAP.md)를 따른다. 이번 작업에서는 미래 코드/브랜치/태그를 만들지 않는다.

`develop/v0.3.0`은 기존 분리 개발 자료로 보존한다. 기존 차수 버전 도구와 독립 개발 데이터/쿠키/포트/Control Center 설정을 출시용으로 덮어쓰지 않는다. v0.4.0을 만들 때 전체 develop을 복사하지 않고 최신 라이브 개선을 우선 보존하며 검증된 Riot 관련 기능만 선택 통합한다.

## 보존 경계

v0.1.7 소스/원본 manifest/운영 DB·키·사용자 기록/knowledge active.json/추적 SQLite 캐시를 바꾸지 않는다. 운영 백업은 Git/Actions/Codex로 보내지 않는다. 기존 feature 작업 폴더의 미커밋 변경도 보존한다. 문서는 Markdown/일반 텍스트 원본이며 사용자 바탕화면은 이 클라우드에서 접근하지 않는다. Windows ZIP 최상위에도 최신 문서를 넣는다.
