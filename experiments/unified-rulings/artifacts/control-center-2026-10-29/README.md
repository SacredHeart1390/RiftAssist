# RiftAssist Control Center 1단계 구현·검증

2026-10-29 · 시작 커밋 `b8796a8` · `feature/riot-api-v0.2` · 기존 Draft PR #1 유지

[실행/설계 안내](../../control-center/README.md), [검증·Windows 10 체크리스트](../../control-center/WINDOWS-VALIDATION.md)를 함께 확인한다.

## 구현

네이티브 WPF/.NET 10 x64 GUI와 별도 .NET Core 라이브러리를 추가했다. 기존 v0.2.0 Node 모의 수집·번역·동기화·검토/승인·knowledge 엔진을 재사용한다. 신규/에라타/한국어 변경 목록, 전후 효과와 기계적 필드/출처/미발매/경고, 사유를 포함한 개별·일괄 결정, 승인 항목 구성, 별도 최종 활성화/롤백·미완료 결과 확인, 감사 조회를 제공한다. 공개 관리자 페이지나 웹 서버를 시작하지 않는다.

운영 경로 선택 없이 앱이 소유한 LocalAppData 합성 환경만 생성·재접속한다. 임시 HMAC 인증정보는 전용 파이프 bootstrap으로만 주며 인수·환경·파일·로그에 보관하지 않는다. 기존 FD3 계약을 유지하면서 Windows에 맞는 명시적 stdin bootstrap 옵션을 추가했다. Node 환경 허용 목록·bundle/runtime 해시·경로 링크 거절·현재 버전/후보 해시·경고 확인·기본 최종 권한 차단·타임아웃/불명확 결과 자동 재시도 금지를 적용했다.

## Linux에서 확정된 결과

| 대상 | 결과 | 증거 |
| --- | --- | --- |
| Node 회귀 | 124/124 | [로그](node-tests.tap) |
| 기존 웹 PC/모바일 E2E | 13/13 | [로그](e2e-tests.tap), `e2e/` 합성 화면 |
| v0.1.7 호환성 | 11/11 | [로그](legacy-tests.log) |
| C# HMAC/JSON·실제 Node 파이프·합성 승인/활성화/롤백 | 30/30 | [JSON](dotnet-tests.json), [로그](dotnet-tests.log) |
| Windows x64 WPF 앱 교차 빌드 | 오류/경고 0 | [로그](wpf-cross-build.log) |
| Windows WPF smoke 도구 교차 빌드 | 오류/경고 0 | [로그](wpf-smoke-cross-build.log) |
| 운영 코드/공유 자료 보존 | 일치 | [집계](preservation.json), [읽기 전용 검사기](verify-preservation.py) |

총 178개 통과, 실패/취소/skip 0. 실제 API 호출 0건. 네이티브 Windows/WPF 실행은 이 Linux 결과에 포함하지 않았다. JSON 서명 골든 벡터에서 발견한 큰 정수 C# 포맷 차이를 수정했고 JS 기준 최대 안전 정수·한글·이모지·결합 문자·제어문자·키 순서를 검증했다. 테스트는 전부 임시 합성 자료이며 운영 키/DB/사용자 기록을 열지 않았다.

v0.1.7의 main 대비 65개 파일 변경 0, shared active/활성 manifest·카드·규칙·저지와 SQLite 3개의 총 8개 해시 불변. 기존 `AGENTS.md` 미커밋 변경은 유지하고 이번 커밋에서 제외한다. `bin/obj/dist`, runtime, 로컬 설정·키·DB는 Git 제외 대상이다. 기존 추적 SQLite의 추적 제외/이력 정리는 실행하지 않았다.

## Windows 검증·배포 제한

Windows GitHub Actions를 추가했다. WPF 창을 실제 로드해 binding/비교 텍스트/PNG를 확인하고, C# 30개를 소스와 자체 포함 포터블 패키지 양쪽에서 실행한다. 결과가 나오면 이곳에 링크와 OS를 기록한다. Windows runner는 Windows 10 실기기 검증이 아니다. 일반 사용자 계정의 Windows 10 22H2 x64, DPI/한글 입력·키보드·버튼·동시 검토·네트워크 차단·복구·설치 경로 검증이 남아 있다.

포터블 개발 패키지만 준비하며 서명 설치 프로그램/자동 업데이트/공개 Release는 만들지 않는다. Azure·실제 관리자 인증·DPAPI/ACL·사용량/제보/Codex/GitHub 원격 기능은 미연결이다. 실제 Riot 승인 후 매퍼·권리/출처·한국어 계약을 확인하고 검토 후보로만 연결해야 한다. 실제 번역 의미 검증·공식 문체 자료 권한·활성화 이후 동기화 rebase는 후속 작업이다.

main 병합·자동 병합·Azure 수정/재시작·운영 배포·v0.1.7/운영 DB·키·카드 삭제/교체를 하지 않는다. 테스트 성공이나 Riot 승인이 자동 운영 전환을 허용하지 않는다.
