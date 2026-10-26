from pathlib import Path
import json
from collections import Counter
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATA = json.loads((HERE / 'review_cases.json').read_text(encoding='utf-8-sig'))
CASES = DATA['cases']
EVIDENCE = json.loads((ROOT / 'knowledge/evidence.json').read_text(encoding='utf-8-sig'))
RULES = {(r['documentId'], r['ruleId']): r for r in EVIDENCE}
SOURCES = json.loads((HERE / 'research/case-sources.json').read_text(encoding='utf-8-sig'))
SOURCE_IDS = {s['id'] for s in SOURCES}
assert len(CASES) == 21 and len({c['id'] for c in CASES}) == 21
assert Counter(c['category'] for c in CASES) == {'게임저징': 14, '대회저징': 7}
assert Counter(c['type'] for c in CASES) == {'기존 사례 재표현': 12, '핵심 조건 변경': 9}
for c in CASES:
    docid = 'core-rules' if c['id'].startswith('G') else 'tournament-rules'
    assert all((docid, rid) in RULES for rid in c['rules']), c['id']
    assert c['faq'] in SOURCE_IDS, c['id']
    if c['parent']:
        assert any(p['id'] == c['parent'] for p in CASES)

DOCX = HERE / 'Riftbound_Judge_Review_21_KO.docx'
TXT = HERE / 'Riftbound_Judge_Review_21_KO.txt'
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21), Cm(29.7)
sec.top_margin, sec.bottom_margin = Cm(1.8), Cm(1.7)
sec.left_margin, sec.right_margin = Cm(2), Cm(2)
sec.header_distance, sec.footer_distance = Cm(.7), Cm(.7)

def font(style, size, bold=False):
    style.font.name = 'Malgun Gothic'
    style.font.size = Pt(size)
    style.font.bold = bold
    style.font.italic = False
    style.font.color.rgb = RGBColor(0, 0, 0)
    rf = style.element.get_or_add_rPr().get_or_add_rFonts()
    for tag in ('ascii', 'hAnsi', 'eastAsia', 'cs'):
        rf.set(qn('w:' + tag), 'Malgun Gothic')

for sn, size, bold in [('Normal', 10.5, False), ('Title', 24, True),
                       ('Subtitle', 13, False), ('Heading 1', 17, True),
                       ('Heading 2', 12, True), ('Heading 3', 10.5, True)]:
    font(doc.styles[sn], size, bold)
normal = doc.styles['Normal'].paragraph_format
normal.space_after = Pt(5)
normal.line_spacing = 1.08
for name in ('Heading 1', 'Heading 2', 'Heading 3'):
    f = doc.styles[name].paragraph_format
    f.space_before = Pt(8)
    f.space_after = Pt(4)
    f.keep_with_next = True
doc.styles['Title'].paragraph_format.space_after = Pt(10)
doc.styles['Subtitle'].paragraph_format.space_after = Pt(12)
for border in list(doc.styles.element.iter(qn('w:pBdr'))):
    border.getparent().remove(border)
doc.core_properties.title = '리프트바운드 저징 AI 평가 문항'
doc.core_properties.subject = '게임저징 14개와 대회저징 7개에 대한 저지 검수'
doc.core_properties.author = 'Riftbound Judge AI 프로젝트'
doc.core_properties.keywords = 'Riftbound, judge, evaluation, Korean'

def p(text='', style=None):
    return doc.add_paragraph(text, style)

def field(label, text):
    para = p()
    para.add_run(label + '  ').bold = True
    para.add_run(text)
    return para

def link(para, label, url):
    rid = para.part.relate_to(url, RT.HYPERLINK, is_external=True)
    h = OxmlElement('w:hyperlink')
    h.set(qn('r:id'), rid)
    r = OxmlElement('w:r')
    pr = OxmlElement('w:rPr')
    clr = OxmlElement('w:color'); clr.set(qn('w:val'), '000000'); pr.append(clr)
    u = OxmlElement('w:u'); u.set(qn('w:val'), 'single'); pr.append(u)
    r.append(pr)
    t = OxmlElement('w:t'); t.text = label; r.append(t)
    h.append(r); para._p.append(h)

def table(headers, rows, widths):
    t = doc.add_table(rows=1, cols=len(headers))
    t.autofit = False
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        b = OxmlElement('w:' + edge)
        for key, value in [('val', 'single'), ('sz', '4'), ('color', 'D9D9D9')]:
            b.set(qn('w:' + key), value)
        borders.append(b)
    t._tbl.tblPr.append(borders)
    for i, width in enumerate(widths):
        t.columns[i].width = Cm(width)
    allrows = [headers] + rows
    for ri, values in enumerate(allrows):
        row = t.rows[0] if ri == 0 else t.add_row()
        pr = row._tr.get_or_add_trPr()
        pr.append(OxmlElement('w:cantSplit'))
        if ri == 0:
            pr.append(OxmlElement('w:tblHeader'))
        for i, text in enumerate(values):
            cell = row.cells[i]
            cell.width = Cm(widths[i])
            cell.vertical_alignment = 1
            shd = OxmlElement('w:shd')
            shd.set(qn('w:fill'), 'DCE6F1' if ri == 0 else ('F5F7F9' if ri % 2 == 0 else 'FFFFFF'))
            cell._tc.get_or_add_tcPr().append(shd)
            cp = cell.paragraphs[0]
            cp.paragraph_format.space_before = Pt(3)
            cp.paragraph_format.space_after = Pt(3)
            cp.paragraph_format.line_spacing = 1.0
            run = cp.add_run(str(text)); run.font.size = Pt(9.5); run.bold = ri == 0
    p().paragraph_format.space_after = Pt(0)
    return t

footer = sec.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
fr = footer.add_run('검수 전 초안  |  2026년 10월 17일  |  ')
fr.font.size = Pt(8)
fld = OxmlElement('w:fldSimple'); fld.set(qn('w:instr'), 'PAGE'); footer._p.append(fld)

p('리프트바운드 저징 AI 평가 문항', 'Title')
p('저지 검수용 질문과 판정 초안', 'Subtitle')
p('게임저징 14개와 대회저징 7개를 검토하는 자료입니다. 실제 RiftJudge 사례 12개를 바탕으로 기본 질문을 재표현하고, 그중 9개의 핵심 조건을 변경했습니다. 질문의 명확성, 처리 결론, 공식 근거가 맞는지 확인해 주세요.')
field('작성 기준', '2026년 10월 17일 · 문항 세트 v0.1 · 모든 문항 저지 검수 대기')
table(['구분', '기존 사례 재표현', '핵심 조건 변경', '합계'],
      [['게임저징', 8, 6, 14], ['대회저징', 4, 3, 7], ['전체', 12, 9, 21]], [5.6, 4.4, 4.4, 2.6])
p('검수 방법', 'Heading 2')
for text in [
    '1. 먼저 질문을 읽고 처리 방향을 판단한 다음, 아래 판정 초안과 근거를 대조해 주세요.',
    '2. 문항 끝의 세 항목을 표시하고, 수정이나 보류가 필요할 때만 짧게 이유를 적어 주세요.',
    '3. 긴 해설을 새로 작성할 필요는 없습니다. 결론 또는 조항을 바로잡는 한두 문장으로 충분합니다.',
    '4. 조건 변경 문항은 원형 ID와 함께 검토해 주세요. 기존 Q&A의 결론을 그대로 적용할 수 있는지 확인합니다.'
]: p(text)
p('자료와 판정의 기준', 'Heading 2')
p('공식 Rules Hub의 2026년 10월 9일판 코어 룰과 대회 규정, 10월 16일 적용 변경 사항을 기준으로 정리했습니다. 근거 설명은 한국어 요약이며 공식 원문은 링크로 확인할 수 있습니다. RiftJudge의 verified 표시는 커뮤니티 검증으로, Riot 공식 판정이나 이 평가 문항의 승인 상태를 뜻하지 않습니다.')
p('T04는 과거 Q&A의 종료 점수 설명과 현재 규정이 다른 사례입니다. 나머지 사례도 참고 당시 룰 버전과 현재 조항을 구분했습니다. 변형 문항이 사이트에 전혀 없는 새로운 질문인지 전수 확인한 것은 아닙니다.')
p('평가에 사용하는 방법', 'Heading 2')
p('API 연결 없이 먼저 문항과 기준 답안을 검수할 수 있습니다. 이후 앱에는 각 항목의 사용자 질문만 전달하고, 판정 초안과 저지 수정 사항은 별도의 채점 자료로 보관합니다. 저지가 승인한 항목만 확정 정답으로 사용하며, 보류 항목은 정답률 계산에서 제외합니다.')
p('이번 자료는 요청한 30개 중 첫 21개입니다. 남은 게임저징 6개와 대회저징 3개, 사진 문항은 포함하지 않았습니다. 같은 원형의 변형은 묶어서 평가하며, 21개 통과만으로 전체 서비스 정확도가 입증되지는 않습니다.')

p('문항 목록', 'Heading 1').paragraph_format.page_break_before = True
p('G는 게임저징, T는 대회저징입니다. 기본은 기존 사례 재표현, 변형은 핵심 조건 변경입니다.')
table(['ID', '유형', '원형', '주제'], [[c['id'], '기본' if not c['parent'] else '변형', c['parent'] or '—', c['title']] for c in CASES], [1.5, 1.5, 1.5, 12.5])
p('검수자 이름  ____________________    검수일  ____________________')
p('검수 기준으로 사용한 공식 문서 버전  ____________________________________')

lines = ['리프트바운드 저징 AI 평가 문항', '저지 검수용 질문과 판정 초안',
         '기준일: 2026-10-17 / v0.1 / 모든 문항 저지 검수 대기',
         '구성: 게임저징 14개(기본8+변형6), 대회저징 7개(기본4+변형3). 사진 제외.',
         '공식 문서: 2026-10-09판 및 2026-10-16 적용 변경 사항. 근거 설명은 한국어 요약.',
         'RiftJudge verified는 커뮤니티 검증이며 이 평가 문항의 저지 승인이 아닙니다.',
         '사용: 사용자 질문만 앱에 입력합니다. 아래 정답 초안과 검수 결과는 생성 모델에 전달하지 않습니다.',
         '미검수·보류 문항은 확정 정답률 계산에서 제외합니다. 원형과 변형은 묶어서 평가합니다.',
         '검수: 결론 / 근거 / 정보 충분 여부를 표시하고 필요한 수정만 한두 문장 적어 주세요.',
         '주의: T04의 과거 Q&A 종료 점수 설명은 현재 규정과 다릅니다.', '']

for c in CASES:
    p(c['id'] + ' ' + c['title'], 'Heading 1').paragraph_format.page_break_before = True
    p(c['category'] + '  |  ' + c['type'] + '  |  ' + ('원형 ' + c['parent'] if c['parent'] else '기본 문항') + '  |  검수 대기')
    p('사용자 질문', 'Heading 2')
    p(c['question'])
    field('조건 비교', c['change'])
    p('평가용 정답 초안', 'Heading 2')
    field('필수 결론', c['answer'])
    docid = 'core-rules' if c['id'].startswith('G') else 'tournament-rules'
    prefix = 'CR' if c['id'].startswith('G') else 'TR'
    first = RULES[(docid, c['rules'][0])]
    rp = p(); rp.add_run('필수 근거  ').bold = True
    rp.add_run(prefix + ' ')
    for i, ruleid in enumerate(c['rules']):
        if i: rp.add_run(', ')
        r = RULES[(docid, ruleid)]
        link(rp, ruleid, r['pdfUrlEn'] + '#page=' + str(r['pageEn']))
    rp.add_run('  ·  ')
    link(rp, '한국어 원문', first['pdfUrlKo'] + '#page=' + str(first['pageKo']))
    p(c['reason'])
    field('금지 결론', c['forbidden'])
    field('확인 질문', c['clarification'])
    p('관련 RiftJudge 사례', 'Heading 2')
    fp = p()
    link(fp, 'FAQ #' + str(c['faq']) + ' 원문 보기', 'https://app.riftjudge.com/questions/' + str(c['faq']))
    fp.add_run('  ·  verified  ·  ' + c['faq_version'])
    p(c['source_note'])
    p('저지 검수', 'Heading 2')
    p('처리 결론  □ 맞음  □ 수정 필요  □ 판단 보류')
    p('근거 적합성  □ 적합  □ 수정 필요  □ 추가 근거 필요')
    p('상황 정보  □ 충분  □ 추가 조건 필요')
    p('수정된 결론 또는 누락 조건  __________________________________________')
    p('__________________________________________________________________')
    p('최종 상태  □ 승인  □ 수정 후 승인  □ 보류     검수자  ______________')

    lines += ['=' * 68, c['id'] + ' ' + c['title'],
              c['category'] + ' / ' + c['type'] + ' / 원형: ' + (c['parent'] or '없음') + ' / 검수 대기',
              '[사용자 질문]', c['question'], '[조건 비교]', c['change'],
              '[평가용 정답 초안]', '필수 결론: ' + c['answer'],
              '필수 근거: ' + prefix + ' ' + ', '.join(c['rules']),
              '적용 이유: ' + c['reason'], '금지 결론: ' + c['forbidden'],
              '확인 질문: ' + c['clarification'],
              '영문 공식 문서: ' + first['pdfUrlEn'] + '#page=' + str(first['pageEn']),
              '한국어 공식 문서: ' + first['pdfUrlKo'] + '#page=' + str(first['pageKo']),
              '관련 사례: https://app.riftjudge.com/questions/' + str(c['faq']),
              '조회 당시 상태: verified / ' + c['faq_version'],
              '원본과의 관계: ' + c['source_note'], '[저지 검수]',
              '처리 결론: [ ] 맞음 [ ] 수정 필요 [ ] 판단 보류',
              '근거 적합성: [ ] 적합 [ ] 수정 필요 [ ] 추가 근거 필요',
              '상황 정보: [ ] 충분 [ ] 추가 조건 필요',
              '수정된 결론 또는 누락 조건: __________________________________',
              '최종 상태: [ ] 승인 [ ] 수정 후 승인 [ ] 보류 / 검수자: __________', '']

p('출처와 검수 후 사용', 'Heading 1').paragraph_format.page_break_before = True
p('공식 자료', 'Heading 2')
for label, url in [
    ('Riftbound 공식 Rules Hub', 'https://playriftbound.com/en-us/rules-hub/'),
    ('코어 룰 영문 2026년 10월 9일판', RULES[('core-rules','167')]['pdfUrlEn']),
    ('코어 룰 한국어 2026년 10월 9일판', RULES[('core-rules','167')]['pdfUrlKo']),
    ('대회 규정 영문 2026년 10월 9일판', RULES[('tournament-rules','416.5')]['pdfUrlEn']),
    ('대회 규정 한국어 2026년 10월 9일판', RULES[('tournament-rules','416.5')]['pdfUrlKo']),
    ('10월 16일 적용 코어 룰 변경 사항', 'https://playriftbound.com/en-us/news/announcements/core-rules-radiance-patch-notes-effective-october-16-2026/'),
    ('10월 16일 적용 대회 규정 변경 사항', 'https://playriftbound.com/en-us/news/announcements/october-2026-tournament-rules-changelog/')
]:
    link(p(), label, url)
    lines.append(label + ': ' + url)
p('RiftJudge 사례 목록', 'Heading 2')
for c in [x for x in CASES if not x['parent']]:
    para = p()
    link(para, 'FAQ #' + str(c['faq']), 'https://app.riftjudge.com/questions/' + str(c['faq']))
    para.add_run('  ' + c['id'] + '  ' + c['title'])
    para.paragraph_format.space_after = Pt(3)
p('검수 후 정답 등록', 'Heading 2')
p('승인된 문항에는 검수자, 검수일, 적용 문서 버전과 수정된 기준 답안을 기록합니다. 규칙이 개정되면 영향받는 문항을 다시 검토합니다. 원형과 변형의 질문·정답은 평가 파일에 보관하고 운영 검색 자료에 자동 편입하지 않습니다.')
p('검수 대기 상태를 표시한 본 문서는 앱의 실제 답변 정확도를 측정한 결과 보고서가 아닙니다. API 연결과 실제 질의 실행은 별도 단계입니다.')

doc.save(DOCX)
TXT.write_text('\n'.join(lines) + '\n', encoding='utf-8-sig')
manifest = {'case_count':len(CASES), 'game':14, 'tournament':7, 'base':12, 'variants':9,
            'reference_rules_present':True, 'source_faqs':len({c['faq'] for c in CASES}),
            'review_status':'pending_human_review', 'outputs':[str(DOCX),str(TXT)]}
(HERE / 'research/build-summary.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(manifest, ensure_ascii=False))
