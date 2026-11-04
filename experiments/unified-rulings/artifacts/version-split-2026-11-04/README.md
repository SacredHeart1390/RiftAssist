# 버전 분리·출시 안정화 기록

2026-11-04 Asia/Seoul. 8차 완료 기준955f6e8. 사용자가 Windows10 합성 v020 배포·암호화 복원·v017 라우팅 복귀와 기록 보존 성공을 보고했다. 실제 Azure/앱 staging 성공으로 확대 해석하지 않는다.

release/v0.2.0은 코드/법적·운영 안정화, develop/v0.3.0은 다음 개발을 준비한다. feature/riot-api-v0.2와 Draft PR #1은 head/base 그대로 보존한다. [정책·출시 필수 해결 사항](../../BRANCHING.md).

## release/v0.2.0

- schema1 legacy 카드의 구조적 호환성을 원본 변경/권한 승격/이관 없이 검사한다.
- 이미지 permission을 display와 분리하고 미발매 공개 근거를 runtime에서 재확인한다. 미확인 community 자료는 계속 제한한다.
- ready=false/development fixture의 production 시작과 링크/공유된 민감 파일을 store 열기 전에 거절한다.
- exact commit/시험·실제 앱 staging·자료 권리/개인정보·unit/Caddy/브로커·DB 분리/backup/rollback 확인을 순수 readiness 보고서로 제공한다. 보고서는 배포 허가가 아니다.
- Control Center의 새 작업/합성 catalog 기준을 release branch로 고정한다. 기존 feature 대상 이력은 자동 재개하지 않는다.

로컬: Node140/140, v017·v020 카드/AI/제보 matrix6/6, v017 판정11/11, 웹13/13, 배포29/29, C#263/263 = **462/462**. 기존 관리자 인증/상세/제어 계약은 C#·Node 기존 통합 검사에 포함한다. 실제 사용자 자료를 쓰지 않고 합성/모의 API만 사용했다. Windows WPF 교차 빌드는 오류/경고0이며 실제 Windows CI 결과는 별도 기록한다.

## 개발·출시 남은 작업

v030은 독립 family/data/settings/port/cookie와 차수0으로 시작한다. 차수 완료 전 v031로 올리지 않는다. branch만 만들었다고 출시 준비 완료로 표시하지 않는다.

운영 unit ExecStart·소유 프로세스/포트·DataRoot·Caddy import/TLS는 아직 직접 확인하지 않았다. 실제 SSH 쓰기/제한 브로커 설치·선택 앱 staging 기동·운영 schema/암호화키/backup restore·제보 보존/rollback 훈련·권한 확인 데이터·개인정보 법적 정보·정확한 출시 commit 검증과 별도 배포 승인이 필요하다. 이번 작업은 Azure 접속/변경, 운영 DB/키 복사/수정, main 병합, 유료 API, Riot 실제 연결을 수행하지 않는다.

원본 feature 작업 폴더와 미커밋 AGENTS 변경을 보존하고 sparse 코드 작업 폴더를 사용한다. 추적 캐시·운영 카드 자료를 새 runtime에 복사하지 않는다. 문서는 Markdown 원본이며 사용자 바탕화면에는 직접 저장하지 않았다.
