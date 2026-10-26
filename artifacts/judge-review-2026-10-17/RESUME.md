# 21문항 작성 재개 기록

## 최신 상태 — 재개 후 완료

2026-10-17 사용자의 재개 요청 후 TXT/DOCX 문서 작업을 완료했다. Word에서 내보낸 PDF를 번들 PDFium으로 렌더링하고 최종 24페이지를 확인했다. 미리보기에서 일부 반복 텍스트가 빠져 보였지만 정상 표시된 단일 페이지 이미지와 최종 이미지가 픽셀 단위로 동일하며, 해당 부분을 확대한 이미지에서 전체 글자를 확인했다. 원본 DOCX와 TXT에는 모두 21개 질문이 들어 있다. 아래 미해결 기록은 중단 당시의 이력이며 현재의 차단 사유가 아니다.

다음 사용자 작업: 저지에게 DOCX를 전달해 검수받기. 모든 판정은 검수 전 초안이며 사람 승인이나 API 평가를 완료했다고 간주하지 않는다. 재작성·재수집은 필요 없다.

2026-10-17: 사용자가 한도 소진 전 중단을 요청했다. 실제 Codex 5시간 한도 98% 사용, 주간 32% 사용 상태를 확인하고 작업을 중단했다. 사용자가 재개를 요청하면 아래부터 이어간다. 자동 재개 작업은 예약하지 않았다.

## 완료된 초안

- Riftbound_Judge_Review_21_KO.txt / Riftbound_Judge_Review_21_KO.docx 생성.
- 게임 14개(기본 G01–G08, 변형 G09–G14), 대회 7개(기본 T01–T04, 변형 T05–T07).
- 각 문항: 질문, 처리 결론 초안, 공식 조항 링크, 이유, 금지 결론, 확인 질문, 실제 RiftJudge 사례 링크·버전·차이, 저지 체크 및 수정란.
- 총 21개는 독립된 21개 원형이 아니다. 기본 12개와 변형 9개를 묶어서 평가해야 한다. 모든 정답은 사람 검수 대기. API 호출/평가 및 저지 검수는 하지 않았다.
- 질문만 나중에 앱에 전달하고 정답 초안은 별도 채점 자료로 보관한다. 나머지 게임6/대회3 문항은 요청 범위 밖이다.

## 근거 조사

- knowledge/evidence.json의 공식 영어/한국어 조항을 사용. 온라인 공식 Rules Hub에서 2026-10-09 PDF와 10-16 적용 변경을 대조했다.
- RiftJudge 실제 사례 ID: 게임 6583,12774,7050,1833,7227,2808,6578,3662 / 대회 10723,7895,2764,4557.
- 원문은 research/case-sources.json, 검색은 research/search-results.json. 재수집 불필요.
- T04 FAQ 4557의 시간 종료 후 점수 판정은 옛 설명이다. 현재 TR 408.2.b의 2점 차 조건을 우선하며 문서에 명시했다.
- T02/T06 외부 메모 허용 경계는 시작패를 뽑기 전(멀리건 전), TR 416.5. T07은 개인 부스터팩을 대가로 무승부를 제안하는 Bribery 조건.

## 남은 작업: Word 표시 점검

- build_review.py가 review_cases.json에서 두 문서를 생성한다.
- 문서 자체는 24페이지: 표지1, 목록2, 문항3–23, 출처24. 빈 페이지와 제목 장식선은 이미 수정했다.
- export_word.ps1로 숨김 Word COM에서 읽기 전용으로 열어 research/word-render.pdf를 내보냈다. 일반 sandbox COM 호출은 실패했지만 require_escalated에서 성공했다. 해당 인스턴스만 종료하도록 finally 처리한다.
- render_review.py는 Documents 스킬의 render_docx.py를 import해 Word PDF 변환 어댑터와 번들 Poppler를 사용한다. LibreOffice는 설치되어 있지 않으며 사용자 설치 LibreOffice를 찾지 않는다.
- 최신 이미지: research/render-final/page-1.png … page-24.png. research/render/는 구버전이다.
- **미해결:** 최신 이미지의 page4(G02), page6(G04)에 반복되는 글자/소제목이 누락되어 보인다. page1,2,3,5,7은 전체가 보인다. PDF 또는 래스터 변환 문제인지 문서 문제인지 아직 확정하지 않았다. 내용이 DOCX와 PDF 텍스트에는 있으나 시각 검증 완료를 주장하면 안 된다.
- 한 Poppler 프로세스당 한 페이지만 처리하도록 render_review.py를 바꿨지만 page4/6 누락은 여전히 보였다. 이 방법으로 해결됐다고 판단하지 말 것.
- pdftocairo.exe를 번들 Poppler 경로에서 시도했으나 실행 파일이 없었다. fitz도 설치되어 있지 않다. PDF 텍스트 추출 한글은 CMap 때문에 깨지므로 시각 확인의 대체물이 아니다.
- 원인을 해결한 뒤 최종 24페이지 전체를 1~3장씩 직접 확인한다. 마지막 6이미지 묶음은 컨텍스트 초과로 잘렸으므로 점검 완료로 세지 않는다.
- Documents 스킬을 이미 적용했고 artifact operation marker 성공 호출은 1회 완료했다. 다시 호출하지 않는다. 출력용 파일에는 QA PDF/PNG/스크립트를 포함하지 않는다.

## 실행 환경

- Python: C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe
- Poppler: C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/Library/bin
- Documents 스킬: C:/Users/user/.codex/plugins/cache/openai-primary-runtime/documents/26.1015.12040/skills/documents/SKILL.md
- 스킬 renderer: 같은 경로의 render_docx.py.

## 최종 전달 전

1. Word 글자 표시 문제 해결 및 최종 전체 페이지 시각 확인.
2. WORKING_BRIEF.md 상태 갱신. 필요하면 DEVLOG.md에 짧은 결과만 기록.
3. 사용자에게 TXT/DOCX 링크와 게임14/대회7 구성, 저지 검수 전 초안임을 안내. 기존 21개를 다시 만들거나 조사 전체를 반복할 필요 없음.
