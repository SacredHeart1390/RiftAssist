# Control Center 5차 검증 보고서

2026-11-02 · 기반91ea6fbee75e670cd9432aad84c63520dafcaddb · feature/riot-api-v0.2 · 기존 Draft PR #1

[사용법·API 계약·운영 승인 조건·로컬 제보 보호·서명 비용](../../control-center/PHASE5.md).

## 구현과 경계

- 기존 v0.1.7 API를 변경하지 않고 시작/중지, stop→중지 확인→start 재시작, AI 전환, 8개 한도, 제보 상태·메모 계약과 사후 검증 coordinator를 준비했습니다. 기존 앱 소유 Node 개발 관리자·인증/서명·감사를 재사용합니다. 운영 UI/모델/target/HTTP 쓰기는 계속 차단하며 원격 변경 어댑터는 제공하지 않습니다.
- 일반 작업은 예/아니요, 조회는 무확인입니다. 중지/재시작 영향과 시작 시 모니터 부수효과를 표시합니다. 중복 실행을 막고 불확실한 변경·인증/통신/응답 손실 후 자동 재전송하지 않으며 새 상태 확인을 요구합니다. 미확정 backend journal은 자동 해제하지 않습니다.
- 수동 제보의 전체 요청 필드·기억 요약 표시, 로컬 등록/수정, revision 충돌/잠금/원자 저장, 암호화된 상태·메모 감사 이력을 구현했습니다. 운영/개발 API와 같은 목록에서 출처를 구분하고 로컬 편집을 서버 변경/평문 내보내기와 분리합니다. 실제 사용자 자료 자동 저장이나 업로드는 없습니다.
- 현재 사용자 DPAPI·전용 entropy·사용자 ACL을 재사용합니다. 고정 LocalAppData 저장소는 ZIP 업데이트/재실행에도 유지됩니다. 평문 우회/임의 삭제는 없으며 손상·한도 오류를 알립니다. 같은 사용자·관리자·메모리/프로필 유실 위험, 자동 만료/백업·삭제 UI 부재는 문서화했습니다. Codex DTO만 준비하고 실제 연결하지 않습니다.
- 매니페스트는 이미 asInvoker/uiAccess=false이며 변경하지 않았습니다. 실제 EXE의 서명/내장 매니페스트를 Windows CI에서 검사하도록 추가했습니다. 공인 서명/인증서 구매/신뢰 등록이나 보안 설정 변경은 하지 않습니다. 최신 서명 가격/지역 제약과 SmartScreen 평판의 한계를 공식 자료로 확인했습니다.
- 기존 자동 SSH/관리자 인증·제보 상세·카드/번역·개발 관리자·백업/감사·아이콘·ZIP 루트 EXE를 유지했습니다. OpenSSH 키 모의 서버의 종료 전송 경합도 client가 exit-status를 수신할 때까지 기다리도록 fixture에서 수정했습니다. 실제 SSH 정책/운영 경로를 바꾼 것이 아닙니다.

## 로컬 검증

| 검사 | 결과 |
| --- | --- |
| C# 기존155 + 5차22 | 177/177 |
| Node 회귀 | 132/132 |
| PC/모바일 웹 | 13/13 |
| v0.1.7 호환성 | 11/11 |
| Windows WPF 대상 교차 빌드 | 경고/오류0 |

총333/333. 새로운 검사는 기존 서명 Node 관리자와 변경 없는 v0.1.7 HTTP/인증 라우터에 합성 저장소·무해한 appHost를 주입해 변경/사후 확인, 인증 실패, 서버 중지/네트워크/적용 후 응답 손실·부분 재시작 실패, 확인·중복 차단, 운영 전송 전 거절을 검사합니다. 수동 제보는 합성 본문·테스트용 AES 보호 구현으로 재읽기/수정/충돌/잠금/손상·암호화 실패/원문 정확성을 검사합니다. Linux에서 실제 DPAPI·WPF 실행을 통과했다고 주장하지 않습니다.

Windows는 기존 OS별 차이와 Linux 제보 symlink1개 대신 실제 DPAPI1개를 실행하므로 C#176개를 예상합니다. native WPF에서는 입력 폼·같은 목록의 출처·실제 DPAPI 저장/수정·새 모델/저장소 재열기·메모 유지·본문 로그 부재·운영 버튼 차단·간단한 영향 확인을 검사하도록 추가했습니다. 아래 Windows CI에서 실제 실행을 확인했습니다.

## 보존과 후속 사항

main a69dff6 대비 v0.1.7 65파일 불변. 공유 active/manifest/cards/rules/judge·추적 SQLite3개 합계8해시 불변. v0.2.0 Node107개/payload83개와 ready=false 유지. 공개 자료/캐시 해시만 비교했고 운영 DB/암호화 키·사용자 기록은 접근하지 않았습니다. AGENTS.md 기존 미커밋 변경 보존/제외.

개발/CI는 실제 Azure 조회·서버 제어/설치/배포, main 병합, 실제 유료 API를 실행하지 않습니다. 실제 운영 쓰기 활성화는 별도 사용자 승인 후 제한 어댑터 구현·검증이 필요합니다. systemd와 manager 자식/포트/appRelease 소유 관계, 구형 시작 경로의 모니터/터널 부수효과를 먼저 확인해야 합니다. 서버 read/write 범위 인증, 멱등성/revision/원자적 restart·운영 감사 API는 별도 개선 과제입니다.

실제 Windows10 기기와 운영 조회는 사용자 후속 확인 사항입니다. 4차 실제 자동 인증·제보 조회 성공은 사용자 확인 이력이며 이번 개발자가 접속한 결과가 아닙니다. 문서는 Markdown 원본으로 보존하며 클라우드에서 사용자 바탕화면에 직접 저장할 수 없습니다.

## Windows 실행 검증·새 패키지

실행 코드 **5856e6ca38769ca38d8aa8a7cf699ae401b157c5**의 [Control Center CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41404472071)와 [규칙 회귀 CI](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41404472033)가 성공했습니다.

- Windows Server2025 C# 소스/추출 패키지 각각 **176/176**, Ubuntu24.04 **177/177** 통과.
- native WPF: 실제 DPAPI로 합성 수동 제보 등록·수정·새 모델/저장소 재열기·메모 유지, 입력 폼/한글 binding·같은 목록 출처 구분·운영 버튼 차단을 통과했습니다. 기존 자동 SSH 인증/재인증/복구·DPAPI 로그인·제보 상세·카드 검사를 유지하며 **binding 오류0**입니다.
- ZIP 루트 EXE·runtime/backend·아이콘 리소스/창 핸들, 추출 EXE 직접 실행·정상 종료를 통과했습니다. 설정 없는 기본 시작의 자동 자식0개를 확인했습니다.
- 배포용 EXE의 **Get-AuthenticodeSignature=NotSigned**, 내장 매니페스트 **asInvoker/uiAccess=false**를 실제 Windows에서 확인했습니다. 공인 서명이나 보안/신뢰 설정 변경은 하지 않았습니다. 게시자/평판 경고가 사라졌다고 주장하지 않습니다.

**[새 Windows 실행 패키지 다운로드](https://github.com/SacredHeart1390/RiftAssist/actions/runs/41404472071/artifacts/13122623874)** — `RiftAssist-ControlCenter-v0.2.0-win-x64.zip`, 101,665,948바이트(약102MB), GitHub 권한 필요. 전체를 새 폴더에 풀어 최상위 EXE를 실행하세요. 동일 Windows 사용자의 기존 LocalAppData 설정/제보 저장소를 지우지 마세요. SHA256 `d7e19bef88e8b7ed1348f4f021ac0e1e9d0ba9c635c17f22e27f2c3026e220f4`, 만료 UTC2027-01-31.

집계와 한계는 [windows-ci.json](windows-ci.json)에 보존했습니다. 이후 문서/증거 정리 커밋은 실행 코드를 변경하지 않습니다. 실제 Windows10 물리 기기의 EXE 재실행·운영 읽기 조회는 사용자 후속 확인이며 운영 변경 활성화는 별도 승인/개발 단계입니다.
