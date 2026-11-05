# 기존 VM 단일 서비스 교체 검증

release/v0.2.0 · 기준14019c9. 단일 VM/서비스, 짧은 중단 허용, 기존 Caddy/HTTPS/3001/3100 유지 방식으로 구현했다. 별도 VM/상시 병렬 운영을 요구하지 않는다. 실제 Azure 접속/변경/DB·키 접근/유료 API는0회이며 사용자 제공 조사 요약만 사용했다.

[구조·확인된 구성·교체/백업/롤백·차단 사항·추가 조사 승인안](../../../REPLACEMENT.md). 기존 inspect-azure.py 원문/SHA256은 그대로다. 새 followup 원문은 미승인/미실행 상태이며 별도 승인이 필요하다.

로컬 **550/550**: Node195(새 교체32 포함)+호환6+v017회귀11+브라우저13+기존 배포29+C#281+기존 조사7+추가 topology조사4+소스조사4. 공유 vault/최종 교체55와 최종 교체32도 통과했다. WPF 교차 빌드는 오류/경고0이고 native GUI는 Linux에서 실행했다고 주장하지 않는다.

Ubuntu24.04 code-only --network none 컨테이너에서 실제 v017 manager/gateway/worker → 완전 중지 → 일관성 봉인 backup/독립 restore → 실제 v020 manager/gateway/worker → 중지/backup → v017 복귀를 검증했다. 같은 포트를 재사용하고 Caddy config/route는 바꾸지 않았다. 기존 제보1과 새 DB의 제보2(기존1+새1), storage/sessions/manager 키 보존을 확인했다. v017 소스는 수정하지 않고 임시 worker port만 test preload로 메모리 주입했으며 collector는 fixture owner PID로 억제했다. 외부 AI는 mock이다. 컨테이너 actualSystemd=false이며 exact SHA의 Ubuntu CI가 별도 앱 unit1개로 실제 systemd를 검증한다.

고정 합성 IO의 실패 주입은 preflight/중지/미종료/예산/backup/복원·schema/전용설정/기동·health/복귀·복귀실패, 승인 변조·기한·원본/키/새기록 보존·중복·강제중단 lock/이력 재조회·감사 변조를 포함한다. 별도 Ubuntu adapter의 실제 전용 override 파일 CAS·원복도 임시 파일/모의 systemctl로 시험했다. Windows SSH는 고정 endpoint·한국어 JSON·별도 승인·원격 결과 유실/예외의 uncertain/no-retry를 검사한다.

실제 Windows10 기기·Azure 전환/유료 AI 품질·실제 운영 자료/원복은 이번 검증에 포함하지 않는다. 운영 autostart 실제 동작·활성 Caddy 경로·unit/drop-ins/KillMode·UID/GID/Node24·DB schema/크기/기타 설정·자료 권리/개인정보·메모리/복구키 보관·실제 도메인/PWA/쿠키 검수가 남는다. ready=false이며 설치/실제 교체는 별도 승인 전 차단한다. 최종 native Windows/Ubuntu 결과는 exact SHA의 Actions에서 확인한다.

재개 후 실제 staged/unstaged 파일과 이전 로그를 보존하고 기준14019c9에서 이어갔다. 원본 Git tree의65파일·manifest64개를 감사해 기존9개와 추가script1개가 모두 정확한 CRLF/LF 차이임을 입증했다. 고정 원본65개의 정확한 hash 목록/기준 파일 hash를 별도로 pin하며 런타임 정규화/관찰값만을 정답으로 삼는 fallback은 없다. [자세한 근거·미확인 생성 commit·추가 승인안](../../../LEGACY-BASELINE.md). 실제 Azure 코드 비교는 아직 실행하지 않아 배포 차단을 유지한다.

8d89bd7 첫 원격 CI: Ubuntu C#281 및 실제 systemd 앱unit1개·동일 포트·Caddy 무변경·백업/복원·구버전 복귀/제보 보존은 통과했다. Windows는 rehearsal 경로 검사가 Windows 구분자까지 거절해 새 suite30/32가 setup에서 실패했다. 운영 Linux 경로 검사는 그대로 두고 temp namespace에 한정한 rehearsal의 native 경로/공백 처리를 보완한다. 최종 exact SHA CI 결과는 Actions에서 별도 확인한다. 실패를 운영 검증 성공으로 표기하지 않는다.
