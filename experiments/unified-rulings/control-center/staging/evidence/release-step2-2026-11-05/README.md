# 출시 준비 2단계 검증 기록

2026-11-05 Asia/Seoul · release/v0.2.0 · 기준4ce1178. develop3d16e48 / feature955f6e8 / maina69dff6과 v01765파일을 보존한다. 운영 DB/키·사용자 기록을 열거나 복사하지 않았고 실제 Azure 접속0회다. `staging/inspect-azure.py`도 실제 VM/공개 사이트에서 실행하지 않았다. Python 검사는 합성 응답만 사용한다.

[읽기 조사 명령·예상 결과·영향 및 승인 범위](../../../AZURE-INSPECTION.md) · [구조·실제/모의·권리/출시 가능성·수동 설치 승인](../../../STAGING.md)

## 구현

Windows 고정 SSH stdin 어댑터와 별도 설치 활성화/프로필·site·inventory/개별 승인, root-owned 고정 broker endpoint, source commit·package pin, 서버 HMAC 계획/기한·CAS·lock·중복/미확정 조회·hash-chain audit을 추가했다. 파일/셸/unit/port를 임의 요청하는 프로토콜은 없다. production 환경은 지원하지 않는다. 기존 WPF 배포 화면은 합성 전용이며 실제 SSH는 자동 활성화하지 않는다.

실제 Node manager/gateway/worker를 새 DB/키/knowledge 루트에서 ready=false로 기동하고, 별도 Caddy loopback HTTPS/검증 CA·사전 config 검증·include CAS/reload·실패 복귀를 구현했다. 기존 운영 Caddy/443/riftassist.service/3100은 대상이 아니다. 새 broker 설치·systemd unit 등록·권한 부여는 실행하지 않았다.

SQLite online backup·AES 봉인·별도 프로세스 integrity/암호문 복호화 probe와 storage/sessions/manager key 보존은 서버 내부 private에 한정한다. rollback은 이전 app/route 선택이며 새 DB/키/제보를 덮거나 지우지 않는다. 실제 v017의 /api/health가 세션 수를 갱신하는 점을 확인해 조사와 기존 일반 SSH 상태 조회는 정적 /로 바꿨다. 운영 v017 코드는 그대로다.

## 로컬 검증

Node163/163(새 staging23 포함), v017/v020 검색·AI·제보 matrix6/6, v017회귀11/11, 웹 PC/모바일/PWA13/13, 종전 배포29/29, C#274/274, 합성 inspection7/7 = **503/503**. staging23은 Node163에 포함되어 이중 합산하지 않는다. WPF 교차 빌드 오류0/경고0. GUI 실제 실행·Windows10 실기기는 로컬 Linux에서 검증했다고 주장하지 않는다.

Ubuntu24.04 code-only 컨테이너 --network none에서 실제 선택 v020 앱·기존 인증/상태·mock AI/합성 제보·빈 카드권한 제한·Caddy TLS·암호화 복원·실제 v017 서버 원본 direct-worker fixture로 라우팅 복귀와 새 제보1건 보존을 확인했다. 컨테이너는 actualSystemd=false다. 실제 운영 manager topology/라이브 rollback 검증으로 해석하지 않는다. proxy 내부 CA를 전역 trust에 설치하지 않았고 TLS 검증을 끄지 않았다. Docker에는 코드만 넣고 실제 사용자 자료/키/DB나 운영 소켓을 mount하지 않았다.

Native Ubuntu systemd 및 Windows GUI/패키지 CI는 이 branch의 exact SHA Actions에서 후속 확인한다. 실제 Codex 추론, 작업별 수정PR 게시, 실제 Riot/OpenAI API, 실제 Azure는 실행하지 않는다. 증거에는 code/합성 test/집계 metadata만 담으며 runtime backup·키·SQLite를 포함하지 않는다. source-scan은 변경된 source 파일의 경로/패턴 검사로 전체 Git 이력의 무비밀 보증은 아니다. 검사기의 기존 규칙/범위는 약화하지 않았다.

## 시험 사례와 남은 승인

새23개는 설치/대상/포트 거절, 승인·서명/기한/해시·구버전, 경로 제한, 실제 암호화 snapshot·WAL·독립 restore, backup/start/health/route/post-health·rollback 실패, CAS 복귀, 동시·중복·미확정 owner·audit 변조, 새 제보/키 보존, 임의 DataRoot 거절을 검증한다. 기존 sync/번역/카드검토/관리자/제보 회귀는 종전 suite에 포함한다. 모든 질문/제보/키는 새 합성 fixture다.

[AZURE-INSPECTION.md](../../../AZURE-INSPECTION.md)의 읽기 조사만 먼저 승인받아야 한다. 실제 unit/Caddy/DataRoot·노드 runtime와 별도 staging host/UID·ports·hash를 확인한 뒤 고정 설치안/서버 보안 검토·설치 승인·staging 시험 승인이 각각 필요하다. 현 구성에는 라이브 production writer, 운영 Caddy 전환, 실제 사용자 DB migration/restore, 지속 slot 회전/기록 병합이 없다. crash stale lock은 자동 삭제하지 않는다.

기존 카드/이미지/번역 이용 권한, 현재 규칙·사례 및 AI 정확성, 개인정보 운영자 연락처/법적 정보·처리 근거, 오프호스트 backup/key 보관·RPO/RTO, 실제 도메인 브라우저/PWA 전환·복귀를 확정해야 한다. API 승인/CI·합성 성공만으로 배포하지 않으며 source/candidate ready=false를 유지한다.
