# 최소 라이브 출시 준비 검증 — 2026-11-09

기준 release/v0.2.0 5a38fd63 이후의 이 변경을 검증했다. 실제 Azure 연결/쓰기/설치/DB·키·사용자 기록/유료 API 호출은 0회이며 ready=false다. 이 문서는 배포 허가가 아니다.

| 로컬 검사 | 결과 |
|---|---|
| Node 앱·동기화·번역·검토·교체 | 244/244 |
| v017/v020 호환 행렬 | 6/6 |
| 변경하지 않은 v017 회귀 | 11/11 |
| 실제 Chromium PC·모바일·PWA | 17/17 |
| 기존 배포 lab | 29/29 |
| C# 프로토콜·모의 운영·격리 소스 회귀·loopback SSH | 284/284 |
| Python 읽기 조사·wrapper·메타데이터 | 31/31 |
| 합계(반복 실행/중복 플랫폼 제외) | **622/622** |

WPF/.NET10 Windows x64 교차 빌드는 오류/경고0이다. Linux에서는 WPF GUI를 실행하지 않았다. 실제 Windows10은 사용자 기기 확인이 필요하다. Windows/Ubuntu CI의 네이티브 WPF·systemd·패키지 결과는 **이 변경을 포함한 exact commit의 Actions**에서 별도로 확인한다.

외부망 없는 Ubuntu24.04 컨테이너에서 실제 v017/v020 manager/gateway/worker를 순차 기동해 같은 포트·한 서비스 구조, 실제 Caddy/TLS·설정 무변경, 암호화 SQLite 백업·독립 복원, 원본 보존·교체 이후 합성 제보2건 유지·rollback·과금 일시정지를 확인했다. 컨테이너 시험은 actualSystemd=false다. 실제 systemd는 별도 Ubuntu CI가 검증하며 운영 VM/실제 DB 시험으로 확대하지 않는다.

추가로 코드 전용 manual capsule 생성·모든 GNU SHA256SUMS·기대 schema(새 임시 DB만)·원본65개 Git baseline·아이콘 원본/7크기·112개 app manifest/87개 backend/43개 staging/4개 deployment payload를 확인했다. strict legacy 검증/자료 권한을 우회하지 않았다. staged 경로/민감 패턴 검사0건이며 전체 이력의 모든 비밀 부재 보장은 아니다.

처음 최소 규칙 후보 테스트의 합성 sentinel/AI 응답 fixture 두 오류를 보완했고 최종 전체가 통과했다. 새 소스가 미추적 상태일 때 Git tracked source export 시험에서 module 누락1건이 발생했다. 실제 커밋 대상에 새 파일을 포함한 뒤 C# 전체를 다시 통과시켰고 Codex의 고정 회귀 목록에도 최소 출시/버전 전환 검사를 추가했다. 실패한 검증을 성공으로 집계하지 않았다.

## 변경 요점과 남은 경계

- 최소 공개 범위: 승인 규칙·카드0/사례0, 원문 번역·외부 저지 검색 차단. KO/EN mock AI와 연결 제보 유지.
- 수동 SSH 일회성 엔진/외부 checksum pin, 상시 broker/포트/sudoers 불필요. 회사 PowerShell5.1 literal console 기본 SSH0회.
- .env 미보존 결함: 승인 후 암호화 archive 원본 보존, 새 데이터에 허용 설정만 복원; 미확인 설정/기존 drop-in drift는 차단. 키 존재만으로 live provider를 켜지 않는다.
- 초기 출시 전 noindex. 향후 버전 통합은 LIVE-ROADMAP.md 참조.
- Azure65개 hash 일치와 추가 경로 미확인은 분리한다. 추가 경로/autostart·실제 unit/config·데이터 크기/schema/키·자료 권리/개인정보 확정은 아직 필수다. 새 읽기 조사 승인과 실제 설치/백업/교체 승인은 서로 다르다.

첫 Windows CI에서 Linux 전용 trustedLocation 경로를 OS 기본 path.join으로 조합해 유효한 Ubuntu 경로를 거절했다. posix.join으로 고정해 수정했으며 Windows 경로/다른 site 허용으로 해결하지 않았다. 기존 본체/브라우저/Ubuntu systemd CI의 성공과 이 중간 Windows 실패를 구분한다. 최종 exact SHA의 CI 재검증이 필요하다. manual capsule에는 기존 verify 모듈도 hash-list에 포함해 GNU 검증 후 추가 파일까지 검사한다.

과금 보호를 추가 확인해 상속한 live 플래그가 있더라도 활성 AI 프로필은 liveProviderApproved가 없으면 거절하도록 보완했다. 키/플래그 보존을 신규 실행 승인으로 간주하지 않는다. 실제 API를 호출하지 않고 합성 설정으로 검증했다.
