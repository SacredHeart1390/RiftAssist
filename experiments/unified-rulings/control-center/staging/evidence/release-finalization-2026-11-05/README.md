# 단일 서비스 출시 준비 후속 검증

release/v0.2.0, 2026-11-05. 합성 자료만 사용했다. Azure 접속·운영 DB/키 접근·실제 배포·유료 AI 호출은0이다. source ready=false다.

local-summary.json의583개는 Node219(기존 staging/교체 및 새 hardening/전환 시험 포함), C#284, v017/v020 matrix6, v017 회귀11, PC/모바일/PWA17, 배포 lab29, Python17의 합계다. protocol vector6·manifest/icon/audit 검사·WPF cross-build는 별도 검사이며 중복 합산하지 않는다. Windows의 추가 전용 proof와 실제 systemd/Caddy 시험은 GitHub CI 결과로 구분한다. 로컬 WPF 컴파일을 GUI 실행으로 표기하지 않는다.

검사 명령은 tests/package.json의 test/test:compat/test:legacy/test:e2e, control-center/tests의 C# proof 프로젝트, staging/*.test.py와 scripts/preparation.test.py, deployment/lab.test.cjs, scripts/audit-v017-baseline.py 및 각 manifest verifier다. 테스트 브라우저는 외부 origin을 차단하며 mock OpenAI/RiftJudge만 사용한다.

새 검증: backup-only qualification/서명·승인·중복·응답 손실, 완료 감사 실패 상태 보상, 읽기 reconcile, RAM/디스크·필수 키·설정 보호, 구 manager 정상 인증과 단일 app-start, 외부 override 보호, 코드 외 파일 거절, code-only 패키지/독립 restore 자식 의존성/hash pin, 기존 signed cookie owner/만료와 기본 개발 격리, 새 UI/구 서버 전환·수동 재시도 idempotency·PWA rollback marker·캐시 용량/접근 실패.

disposable-ubuntu.json은 Ubuntu24 컨테이너 --network none에서 실제 manager/gateway/worker 두 버전을 같은 포트로 순차 실행하고 Caddy/TLS·암호화 백업/독립 restore·구/신 제보 보존·롤백 후 AI 일시 중지를 검증한 메타데이터다. 생성된 DB·키·인증서·백업·질문/제보는 컨테이너 안에서만 생성/제거했다. systemd는 컨테이너 proof에서 false이며 실제 systemd는 Ubuntu CI가 별도로 검증한다.

v017은65개 고정 Git 원본과64개 manifest 선언을 검사했다.9개 runtime(전체10개) 불일치는 정확한 LF/CRLF 해시로 설명되며 원본 수정/검증 해제 없이 고정 reference를 유지한다. 실제 서버의 referenceVerified 결과는 사용자 승인된 두 조사 실행 결과를 기다린다.

남은 차단/설치·DB qualification·최종 배포 승인과 수동 복구 범위는 control-center 최상위의 [RELEASE-CHECKLIST.md](../../../RELEASE-CHECKLIST.md), [REPLACEMENT.md](../../../REPLACEMENT.md)를 따른다. 실제 metadata가 없는데 UID/GID·unit/helper·Node/Caddy 경로를 확정하지 않는다. 실제 설치·일반 lock 제거·운영 DB 덮어쓰기 명령은 실행하지 않았다.
