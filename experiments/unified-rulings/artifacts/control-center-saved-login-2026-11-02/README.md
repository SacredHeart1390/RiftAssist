# 관리자 로그인 저장·자동 연결·제보 상세 수정 검증

2026-11-02. 기반 d1395e3797cbecd81d809983f0e1fb31a9ecc704, feature/riot-api-v0.2, 기존 Draft PR #1. 기존 AGENTS.md 미커밋 변경은 보존/커밋 제외합니다. 실제 Azure/운영 관리자/운영 DB·키·사용자 자료는 조회하거나 변경하지 않았습니다.

[사용 방법·DPAPI 보관 위치·보호 범위·업데이트·삭제·남는 위험](../../control-center/AUTOLOGIN.md).

## 구현/수정

- 로그인 기억과 시작 시 자동 연결은 각각 사용자 opt-in이며 기본 꺼짐입니다. 저장하지 않으면 메모리 전용 로그인을 유지하고 자격증명 저장소 쓰기를 요구하지 않습니다. 저장은 인증 성공 후 사용자 범위 DPAPI 암호문으로만 합니다.
- 대상/인증 방식별 키 슬롯은 EXE/ZIP/버전과 분리한 고정 LocalAppData 경로를 사용합니다. 새 패키지에서도 재사용하며 다른 대상/방식에 재사용하지 않습니다. 쿠키·SSH 개인키 내용은 저장하지 않습니다.
- 시작 시 저장 키 연결은 명시적으로 켠 대상에서 한 번만 실행하고 상태만 조회합니다. 제보는 자동으로 읽지 않습니다. 저장 정보 삭제, 자동 연결 끄기, 키 변경 시 재입력, 실패 시 자동 연결 해제를 지원합니다. 운영 쓰기/배포는 비활성 상태입니다.
- client-admin-response 원인: 실제 v0.1.7 content는 description/expected/tags/language 객체인데 이전 클라이언트와 fixture는 문자열로 가정했습니다. 실제 객체 투영 및 모의 라우터 fixture를 수정하고 문자열/없는 스냅샷 호환·크기/태그 제한을 유지했습니다.
- 같은 Windows 사용자 앱/관리자·메모리 접근·계정/프로필/DPAPI 키 유실·OS 백업/로밍·서버 전체 관리자 키 권한의 한계와 전용 read-only 인증 전환 구조를 문서화했습니다. 키/쿠키/원시 응답을 로그·설정·Git에 저장하지 않습니다. 암호문도 Git 제외합니다.

## 로컬 결과

| 검사 | 결과 |
| --- | --- |
| C# 기존120 + 로그인/제보15 | 135/135 |
| Node 회귀 | 132/132 |
| PC/모바일 웹 | 13/13 |
| 수정하지 않은 v0.1.7 호환성 | 11/11 |
| Windows 대상 WPF 교차 빌드 | 경고/오류0 |

총 **291/291**, 실패/취소/skip0. Linux에서는 암호화 저장·실제 WPF 실행을 통과했다고 주장하지 않습니다. Windows CI는 Linux POSIX3개 대신 ProgramData1개 및 실제 DPAPI3개를 실행하므로 C#136개를 예상합니다.

합성 키와 메모리 vault로 기본 꺼짐/인증 성공 전 미저장/보호 저장 실패 시 평문 우회 없음/JSON 비밀 없음/저장 재사용·삭제/키 변경·네트워크 실패/대상·방식 분리를 검사합니다. 실제 v0.1.7 HTTP 라우터는 바이트 그대로 읽되 DB/키/수집기/서비스/타이머를 합성 구현으로 바꾸고, 실제 SSH는 임시 키의 127.0.0.1 모의 서버만 연결합니다. 제보 본문도 합성 자료입니다.

## 보존

main a69dff6 대비 v0.1.7 65파일 불변. 공유 active/manifest/cards/rules/judge·추적 SQLite3개 합계8해시 불변. v0.2.0 Node107개/payload83개 및 ready=false 유지. 공개 자료/캐시는 보존 해시만 비교하며 실제 운영 DB/암호화 키·사용자 기록은 열거나 변경하지 않았습니다. main 병합/자동 병합, Azure 변경/시작/중지/재시작/배포, 실제 유료 API 호출 없음.

## Windows 패키지/후속 확인

실행 코드 **e3800ebd22df3d51ab73e81f4236fcce1d7e1285**의 [Windows/Ubuntu CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41393466124)와 [기존 회귀 CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41393466137)가 성공했습니다.

- Windows Server2025 소스/추출 패키지 C# 각각 **136/136**. 실제 현재 사용자 DPAPI protect/unprotect·암호문 평문 부재·재생성 vault 재사용·다른 대상 entropy 거절·사용자 ACL·삭제를 통과했습니다.
- native WPF: 저장/자동 연결 opt-in·기본 무접속·저장 키 연결·새 창/버전 재사용·시작1회·제보 자동 조회 없음·삭제·연결 후 상태 실패의 자동 해제, 기존 카드/관리 기능·한글/아이콘을 확인했습니다. **binding 오류0**.
- ZIP 루트 EXE/runtime/backend, 아이콘 리소스와 창/작업표시줄 핸들, 추출 EXE 직접 시작/정상 종료·기본 시작 자동 자식 **0개**를 확인했습니다.
- Ubuntu24.04 C# **135/135**. OS별3개 POSIX 대 Windows ProgramData1+DPAPI3 차이를 구분합니다. 모든 SSH는 합성 키의 loopback 서버이며 실제 운영 관리자 자료를 사용하지 않았습니다.

**[새 Windows 실행 패키지 다운로드](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41393466124/artifacts/13118297862)** — RiftAssist-ControlCenter-v0.2.0-win-x64.zip, 약102MB, GitHub 권한 필요. 전체 파일을 새 폴더에 풀어 최상위 RiftAssist.ControlCenter.exe를 실행합니다. 기존 Windows 사용자 LocalAppData를 지우지 않으면 새 ZIP에서도 설정/저장 정보를 재사용합니다. SHA256 ad7cc9a252aa46e3e36b717a82d642c19b10895a455923c4f398240c7a9f366a, artifact 만료 UTC 2027-01-31.

[windows-ci.json](windows-ci.json)에 집계와 한계를 기록했습니다. 패키지는 위 실행 코드 SHA이며 이후 증거/문서만 정리한 커밋과 실행 코드는 동일합니다. 실제 회사 Windows10·운영 키·제보로의 확인은 사용자 후속 단계입니다. 개발자는 실제 Azure 연결을 실행하지 않았습니다.
