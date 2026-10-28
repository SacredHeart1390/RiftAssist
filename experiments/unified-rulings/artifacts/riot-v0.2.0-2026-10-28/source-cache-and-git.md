# 수집 캐시와 안전한 Git 추적 제외

`source-updates/content.sqlite`, `content.sqlite-wal`, `content.sqlite-shm`은 v0.1.7 계열 `src/sync-store.js`가 공개 출처 수집에 사용하는 SQLite 본체·트랜잭션 WAL·공유 메모리 인덱스다. `private/operations.sqlite`의 사용자 질문·제보 저장소와 다른 경로/스키마다.

이번에는 원본을 SQLite로 열지 않았다. 세 파일을 임시 디렉터리에 함께 복사하고 복사 전후 원본 해시가 같은지 확인한 뒤 사본을 읽기 전용으로 열었다. 수집기·운영 서버·checkpoint·vacuum·원본 복구는 실행하지 않았다.

확인된 테이블은 `faqs` 11,794행, `documents` 11행, `state` 7행이다. 공개 자료 본문과 원본 주소, ETag·수집 시각·재시도/누락 상태, 문서/게시 상태를 저장하는 코드와 스키마가 일치하며 로컬 사용자 요청/제보/호출 테이블은 없다. 읽은 JSON 11,812건은 파싱 가능했고 quick_check도 통과했다.

논리 데이터와 본체/WAL/SHM 바이트에 대한 제한적 이메일·IP·키/토큰·민감 필드명 패턴 검사는 모두 0건이었다. 원문·행 값·작성자 정보·비밀값은 출력하지 않았다. **이 검사는 민감 정보 부재나 재배포 권한을 보장하지 않는다.** 공개 커뮤니티 글에는 작성자 식별정보 등이 있을 수 있고 삭제 페이지/미탐지 패턴과 Git 과거 이력은 별도 검토 대상이다.

집계 결과·원본 파일 해시는 [감사 결과](../riot-predeploy-hardening-2026-10-28/source-cache-summary.json), 사본만 읽는 재현 도구는 [감사 스크립트](../riot-predeploy-hardening-2026-10-28/audit-source-cache.py)에 있다. v0.2.0 개발 루트에는 이 DB나 WAL/SHM을 복사하지 않았다.

## 제안하는 추적 제외 절차 — 실행하지 않음

이미 적용한 `.gitignore`의 `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`, `private/`, `*.key`는 신규 파일을 제외한다. `git check-ignore --no-index`로 대상 세 경로의 규칙 적용을 확인했다. 이미 추적된 파일은 ignore만으로 빠지지 않으므로 향후 승인된 Git 정리 작업에서 저장소 루트 기준으로 다음을 사용한다.

```sh
git rm --dry-run --cached -- experiments/unified-rulings/source-updates/content.sqlite experiments/unified-rulings/source-updates/content.sqlite-wal experiments/unified-rulings/source-updates/content.sqlite-shm
git rm --cached -- experiments/unified-rulings/source-updates/content.sqlite experiments/unified-rulings/source-updates/content.sqlite-wal experiments/unified-rulings/source-updates/content.sqlite-shm
git diff --cached --stat
```

`--cached`는 Git 인덱스에서만 제외하므로 작업 폴더의 세 파일을 지우지 않는다. `-f`를 붙이거나 `git rm`에서 `--cached`를 생략하지 않는다. staged/working 상태가 달라 거절되면 강제로 진행하지 말고 기존 변경부터 확인한다. 이 단계에서 서비스 중지나 원본 DB 읽기/변경은 필요하지 않다.

이후 파일 존재·해시, 세 파일의 `git ls-files` 제외와 `.gitignore` 적용, 배포 패키지의 DB·키 미포함을 점검한 뒤 커밋 여부를 검토한다. **이번에는 Git 인덱스 변경, 커밋, push를 하지 않았다.** 인덱스 제외 커밋을 배포 도구가 ‘운영 서버 파일 삭제’로 해석하지 않도록 소스와 런타임 볼륨도 분리해야 한다.

이미 커밋된 과거 blob은 새 추적 제외 커밋으로 지워지지 않는다. 과거 비밀 노출이 확인되면 별도 키 교체 및 승인된 이력 정리/협업자 조율이 필요하다. 근거 없이 force push나 이력 재작성을 제안된 명령에 포함하지 않았다.
