# RiftAssist Control Center — Windows 관리 MVP

현재 SSH 조회 문제 수정 안내: [SSH-TROUBLESHOOTING.md](SSH-TROUBLESHOOTING.md). 실제 Azure에는 접속하지 않고 읽기 전용 명령·오류 분류·임시 루프백 SSH를 검증합니다.

현재 3차의 확인창·자동 감사 사유·대시보드·실제 연결 시험 방법은 [PHASE3.md](PHASE3.md)를 확인한다. 일반 변경은 예/아니요, 조회는 확인창 없이 수동 실행하며 최종 전환/백업 보호는 유지한다. 아래의 기존 카드/2차 절차 중 사유 입력·반복 확인 설명은 3차 안내로 대체한다.

2026-10-29 · v0.2.0 · 개발 브랜치 `feature/riot-api-v0.2` · 기존 Draft PR #1

Windows 10 22H2(build 19045 이상) x64를 대상으로 하는 C# WPF/.NET 10 데스크톱 앱이다. 브라우저·WebView·Electron을 사용하지 않는다. .NET 10 LTS와 기존 Node.js 24 검토 엔진을 조합했다. 카드 동기화·번역·승인 알고리즘을 C#으로 중복 구현하지 않고, 기존 `card-review-control`의 서명 메시지를 전용 자식 프로세스 파이프로 호출한다.

카드 검토·관리자 제어는 **앱이 직접 만든 별도 로컬 합성자료만** 다룬다. 2차에서는 WPF 운영 7개 탭과 기존 인증을 보존한 개발 관리자 API, Windows OpenSSH의 고정 읽기 전용 상태 조회 구조를 추가했다. 실제 Azure 접속은 별도 승인 전 실행하지 않으며 운영 관리자 포트·DB·키·사용자 기록·실제 Riot/OpenAI·GitHub 배포는 미연결이다. `v0.1.7`을 시작·정지하거나 운영 버전을 바꾸지 않는다. `ready: false`를 유지한다. [2차 기능 목록·인증 조사·SSH 설정/보안·미구현 항목](PHASE2.md)을 먼저 확인한다.

## 실행 및 패키징

검증된 Windows 개발 패키지 전체를 새 로컬 폴더에 풀고 `RiftAssist.ControlCenter.exe`를 실행한다. exe만 옮기면 실행 환경이 완성되지 않는다. `runtime/node.exe`, Node 라이선스, `backend/v0.2.0`, 해시 manifest가 함께 필요하다. 패키지는 .NET 자체 포함 방식으로 만들며 Windows 관리자 권한을 요구하지 않는다. 설치 프로그램/코드 서명/자동 업데이트는 아직 없다.

소스에서 패키지를 만들 때는 Windows x64, .NET 10 SDK, 신뢰할 수 있는 공식 Node.js 24 x64 배포본과 **같은 배포본의 LICENSE**가 필요하다. PowerShell에서 이 디렉터리로 이동한다.

```powershell
node scripts/protocol-vectors.cjs
node scripts/backend-manifest.cjs
dotnet build src/RiftAssist.ControlCenter/RiftAssist.ControlCenter.csproj -c Release
./scripts/Publish-Windows.ps1 -NodePath 'C:\Tools\node-v24\node.exe' -OutputDirectory 'C:\Builds\RiftAssist-ControlCenter-dev'
& 'C:\Builds\RiftAssist-ControlCenter-dev\RiftAssist.ControlCenter.exe'
```

출력 폴더는 새 경로여야 한다. 기존 폴더는 교체하지 않는다. 필요하면 `-NodeLicensePath`와 `-RequireTrustedNodeSignature`를 추가한다. 해시는 우발적인 파일 변조 검출용이며, 코드 서명이나 배포자 신뢰를 대신하지 않는다. 소스의 일반 `dotnet build`만으로 Node가 번들되지 않는다. Windows 스마트스크린 경고를 우회하거나 보안 정책을 바꾸는 설치 도구는 제공하지 않는다.

GitHub Actions의 **Control Center validation**은 Windows runner에서 빌드·실제 WPF 창 로드·C#/Node 검증·포터블 패키지를 검사한다. 성공한 실행의 `RiftAssist-ControlCenter-win-x64-development` 아티팩트를 사용할 수 있다. 이것은 GitHub Release나 운영 배포가 아니다. Windows runner 검사와 실제 Windows 10 PC 검사는 구분한다. 상세 결과·수동 체크리스트는 [Windows 검증 안내](WINDOWS-VALIDATION.md)에 기록한다.

## 검토 흐름

1. **새 합성자료 만들기**를 누르면 `%LOCALAPPDATA%\RiftAssist\ControlCenter\Sandboxes\<GUID>` 아래 새 개발 환경을 만든다. 모의 수집·번역·동기화로 신규 카드/에라타/한국어 변경 후보를 만들고 기존 검토 엔진에 등록한다. 활성 포인터는 초기 합성자료를 유지한다.
2. 목록에서 변경을 골라 영어/한국어 효과, 이름, 비용·능력치·기호·키워드, 출처·공개 근거, 미발매 상태, 번역 출처/검증 경고를 비교한다. 모의 자료와 비공식 번역임을 표시한다. 10개 단위 페이지와 현재 페이지 검색을 제공한다.
3. 체크한 항목을 **승인·거절·보류**하고 사유를 남긴다. 일괄 검토는 현재 보이는 페이지 범위다. 승인 시 경고를 확인해야 하며 차단 오류는 승인할 수 없다. 카드 데이터와 번역 후보는 별개 항목이다. 번역을 반영하려면 대응 카드 데이터 승인이 필요하다.
4. **승인 항목으로 별도 후보 구성**은 모든 페이지의 검토 버전을 확인해 승인 항목만 구성한다. 제외 항목과 기존 자료 유지 범위를 다시 확인한다. 이 단계도 활성화하지 않는다.
5. 최종 활성화/롤백을 시험하려면 연결 전에 **최종 승인 권한 (로컬)**을 명시적으로 선택한다. 별도 탭에서 대상 폴더·승인본 해시·복귀 기준을 확인하고 사유·체크박스·정확한 문구(`개발 자료 활성화` / `개발 자료 되돌리기`)로 확정한다. 여기서 바뀌는 것은 **선택한 합성 개발 폴더의 포인터뿐**이다.
6. 감사 탭에서 영속 작업 기록과 사유를 조회한다. 하단에는 현재 실행의 최근 100개 결과 코드/요청 ID만 표시한다. 재접속 시 기존 승인·사유·패키지를 읽으며 자료를 다시 만들거나 자동 활성화하지 않는다.

종료하거나 연결 해제해도 자료는 삭제하지 않는다. MVP에는 개발 데이터 자동 삭제 기능이 없다. 검토 사유는 개발 폴더의 감사 기록에 남으므로 키·개인정보·실제 사용자 질문을 입력하지 않는다. 실제 동기화는 이 화면에서 실행하지 않는다. 활성화 후 다음 동기화의 기준 재설정(rebase)은 후속 설계가 필요하다.

## 경계와 장애 처리

- 앱 소유 GUID·환경 마커·정해진 상위 폴더만 열며 임의 경로/운영 DB 선택 UI가 없다. 심볼릭 링크/Windows reparse point를 거절한다. Node와 번들 소스 해시를 확인한다.
- Node 자식 프로세스에는 환경변수를 허용 목록으로만 전달한다. API/관리자/SSH 키와 `NODE_OPTIONS`를 상속하지 않는다. 앱/관리자 웹 서버나 HTTP/TCP listener를 시작하지 않는다.
- 세션마다 임의 HMAC 키를 만들고 전용 stdin의 첫 줄로만 전달한다. 키를 인수·환경변수·파일·감사 로그·화면에 남기지 않는다. 다음 줄부터 기존 서명 요청 계약이다. 기존 FD3 bootstrap도 유지한다. 종료 시 참조를 버리지만 관리 메모리의 모든 사본을 안전 삭제한다고 보장하지 않는다.
- 기본 권한은 조회/검토/구성/감사이며 최종 활성화와 롤백은 별도 선택이다. 이것은 **로컬 개발 세션 권한**이며 Windows 사용자 인증·다중 운영자 신원 증명이 아니다. 감사 actor도 `local-development-operator`다.
- HMAC은 JS `stable`과 같은 키 순서·UTF-8·JSON 문자열 규칙이다. **64자리 hex 문자를 UTF-8 텍스트 키로 사용**하며 hex decode하지 않는다. NFC 정규화를 하지 않는다. 잘못된 Unicode/중복 JSON 키/소수/JS 안전 정수 범위 밖의 서명 숫자는 거절한다. 응답은 검증한 로컬 자식 프로세스의 전용 파이프를 신뢰하며 원격 프로토콜 보안을 주장하지 않는다.
- 요청 ID/후보 fingerprint/revision/패키지 digest/현재 활성 버전을 검사한다. 변경 뒤에는 새로 읽는다. 응답 오류·30초 제한·자식 종료로 결과가 불명확하면 쓰기를 자동 재시도하지 않는다. 재연결하여 현재 버전과 감사 기록을 먼저 확인한다.
- 미완료 최종 작업은 별도 **복구 상태 확인**으로 현재 포인터와 의도를 대조한다. 포인터를 자동 전환하지 않는다. 감사 오류/잠금이 있으면 기존 [검토 엔진 복구 지침](../releases/v0.2.0/card-review.md)을 따른다. 임의로 잠금·이력을 삭제하지 않는다.

## 구성과 향후 확장

| 구성 | 역할 |
| --- | --- |
| `src/RiftAssist.ControlCenter` | 네이티브 WPF 창, 비교·선택·확인 대화상자, 작업 상태 |
| `src/RiftAssist.ControlCenter.Core` | DTO, 검토 조정, 전용 파이프, JS 호환 HMAC, 앱 소유 개발 경로 |
| `../releases/v0.2.0` | 재사용하는 모의 수집·번역·동기화·검토·knowledge 엔진 |
| `tests` / `fixtures` | C# 검증, WPF 창 검사, 공개 합성 서명 벡터 |
| `scripts` | 고정 번들 해시, 벡터 재생성, Windows 개발 패키징 |

`IReviewTransport`와 `ReviewCoordinator`로 화면과 전송/검토를 분리했다. 2차의 `DevelopmentOperations`는 별도 operations 권한으로 기존 개발 관리자 인증 API를 호출하고 `RemoteMonitor`/`ISshRunner`는 명령이 고정된 SSH 상태 조회만 제공한다. 실제 운영 관리자·원격 제어·실제 과금/제보·Codex·GitHub 배포는 미연결이다. 원격 제어 확장 전에는 서버 측 신원·역할·최소 권한, 비밀 저장(DPAPI/Credential Manager 등), TLS/기기 신뢰, 재생 방지·감사 보관, 명령 허용 목록, 승인/배포 분리, 서버 백업·복구를 별도로 설계·검증해야 한다.

실제 Riot 승인 후 endpoint/매퍼·출처/이미지 이용 조건·공개 상태·한국어 제공 계약을 검증하고 후보 경로에 연결해야 한다. 실제 번역 공급자는 호출 예산·캐시·비용 동의와 독립적인 의미 검토가 필요하다. 승인만으로 카드/운영 버전을 전환하지 않는다. 기존 리프트나루 카드/번역을 공식 자료·용어집·데모로 혼합하지 않았다. 번들에는 기존 고정 규칙 회귀 fixture가 포함되므로 공개 재배포 전 관련 이용 조건도 별도 확인한다. 합성 번역 결과는 실제 카드 번역 정확성의 증거가 아니다.
