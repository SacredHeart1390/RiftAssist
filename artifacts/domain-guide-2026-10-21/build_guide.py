from pathlib import Path
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.opc.constants import RELATIONSHIP_TYPE as RT

HERE = Path(__file__).resolve().parent
OUT = HERE / '리프트어시_고정도메인_운영안내_2026-10-21.docx'
doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Inches(8.5), Inches(11)
sec.top_margin, sec.bottom_margin = Inches(0.7), Inches(0.7)
sec.left_margin, sec.right_margin = Inches(0.8), Inches(0.8)
sec.header_distance, sec.footer_distance = Inches(0.3), Inches(0.3)

for name in ['Normal', 'Title', 'Subtitle', 'Heading 1', 'Heading 2', 'List Bullet']:
    st = doc.styles[name]
    st.font.name = '맑은 고딕'
    st._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'), '맑은 고딕')
    st.font.color.rgb = RGBColor(0, 0, 0)
normal = doc.styles['Normal']
normal.font.size = Pt(11)
normal.paragraph_format.line_spacing = Pt(16)
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.widow_control = True
doc.styles['Title'].font.size = Pt(23)
doc.styles['Title'].font.bold = True
doc.styles['Title'].paragraph_format.space_after = Pt(10)
doc.styles['Subtitle'].font.size = Pt(10)
doc.styles['Subtitle'].font.italic = False
doc.styles['Subtitle'].paragraph_format.space_after = Pt(12)
for name, size in [('Heading 1', 17), ('Heading 2', 12.5)]:
    st = doc.styles[name]
    st.font.size = Pt(size)
    st.font.bold = True
    st.paragraph_format.space_before = Pt(12)
    st.paragraph_format.space_after = Pt(7)
    st.paragraph_format.keep_with_next = True

header = sec.header.paragraphs[0]
header.text = '리프트어시  |  집 PC와 고정 도메인 연결'
header.style = doc.styles['Normal']
header.runs[0].font.size = Pt(8)
header.runs[0].font.color.rgb = RGBColor.from_string('666666')
foot = sec.footer.paragraphs[0]
foot.alignment = WD_ALIGN_PARAGRAPH.RIGHT
run = foot.add_run('2026.10.21  ·  ')
run.font.size = Pt(8)
field = OxmlElement('w:fldSimple')
field.set(qn('w:instr'), 'PAGE')
foot._p.append(field)

def p(text, bold=False, style=None):
    para = doc.add_paragraph(style=style)
    para.add_run(text).bold = bold
    return para

def h(text, level=2):
    return doc.add_heading(text, level=level)

def bullet(text):
    return p(text, style='List Bullet')

def page(title):
    title_para = h(title, 1)
    title_para.paragraph_format.page_break_before = True

def table(headers, rows, widths):
    t = doc.add_table(rows=1, cols=len(headers))
    t.autofit = False
    for cell, title, width in zip(t.rows[0].cells, headers, widths):
        cell.width = Inches(width)
        cell.text = title
    repeat = OxmlElement('w:tblHeader')
    t.rows[0]._tr.get_or_add_trPr().append(repeat)
    for row in rows:
        cells = t.add_row().cells
        for cell, text, width in zip(cells, row, widths):
            cell.width = Inches(width)
            cell.text = text
    for idx, row in enumerate(t.rows):
        no_split = OxmlElement('w:cantSplit')
        row._tr.get_or_add_trPr().append(no_split)
        for cell in row.cells:
            tcpr = cell._tc.get_or_add_tcPr()
            borders = OxmlElement('w:tcBorders')
            for edge in ['top', 'left', 'bottom', 'right']:
                el = OxmlElement('w:' + edge)
                for key, val in [('val', 'single'), ('sz', '4'), ('color', 'C9D2DB')]:
                    el.set(qn('w:' + key), val)
                borders.append(el)
            tcpr.append(borders)
            margins = OxmlElement('w:tcMar')
            for edge, value in [('top', '80'), ('bottom', '80'), ('left', '100'), ('right', '100')]:
                el = OxmlElement('w:' + edge)
                el.set(qn('w:w'), value)
                el.set(qn('w:type'), 'dxa')
                margins.append(el)
            tcpr.append(margins)
            if idx == 0:
                shade = OxmlElement('w:shd')
                shade.set(qn('w:fill'), 'E9EFF5')
                tcpr.append(shade)
            for para in cell.paragraphs:
                para.paragraph_format.space_after = Pt(2)
                para.paragraph_format.line_spacing = Pt(14)
                for run in para.runs:
                    run.font.size = Pt(10)
                    run.bold = idx == 0
    return t

def hyperlink(label, url):
    para = doc.add_paragraph()
    para.paragraph_format.space_after = Pt(4)
    link = OxmlElement('w:hyperlink')
    link.set(qn('r:id'), para.part.relate_to(url, RT.HYPERLINK, is_external=True))
    run = OxmlElement('w:r')
    rp = OxmlElement('w:rPr')
    col = OxmlElement('w:color'); col.set(qn('w:val'), '185A8D'); rp.append(col)
    sz = OxmlElement('w:sz'); sz.set(qn('w:val'), '19'); rp.append(sz)
    fonts = OxmlElement('w:rFonts')
    fonts.set(qn('w:ascii'), '맑은 고딕'); fonts.set(qn('w:eastAsia'), '맑은 고딕'); rp.append(fonts)
    run.append(rp)
    text = OxmlElement('w:t'); text.text = label; run.append(text)
    link.append(run); para._p.append(link)

doc.add_heading('리프트어시 고정 도메인 운영 안내', 0)
p('작성 기준 2026년 10월 21일 · 집 PC 운영 방식 · 구매와 연결 작업 전 안내', style='Subtitle')
p('계획은 도메인을 하나 구매하고, Cloudflare Tunnel로 지금의 집 PC 서버에 연결하는 것입니다. 앱과 자료는 집 PC에 그대로 두고, 이용자에게 알려주는 주소를 고정합니다.', bold=True)
h('서비스가 연결되는 순서')
p('이용자 → https://riftassistant.com → Cloudflare → 집 PC의 리프트어시', bold=True)
p('riftassistant.com은 희망 주소의 예시입니다. 아직 구매 가능 여부와 가격을 확인하거나 소유권을 확보하지 않았습니다.')
bullet('도메인은 사이트의 주소입니다. 집 PC의 앱을 대신 실행해 주는 서버는 아닙니다.')
bullet('PC 전원·인터넷·앱·터널이 모두 켜져 있어야 이용자가 질문할 수 있습니다.')
bullet('현재 trycloudflare.com 임시 주소 자체를 구매한 주소로 바꾸거나 승격하는 방식은 아닙니다. 새 고정 주소를 연결합니다. [1]')
h('지금 완료된 것과 다음에 할 것')
p('현재 통합 앱 v0.1.4, 관리 페이지, 임시 공개 연결이 준비되어 있습니다. 고정 도메인 구매, 고정 터널 연결, 관리 프로그램의 고정 주소 운영 설정은 앞으로 진행할 작업입니다. 이 안내서를 만들면서 운영 설정을 변경하지는 않았습니다.')
h('누가 무엇을 맡는가')
table(['단계', '사용자', '제가 할 일'], [
    ('1 준비', '계정 생성과 이메일 인증', '선택 화면과 설정 항목 안내'),
    ('2 주소 구매', '이름·가격 확인 후 직접 결제', '구매 경로와 필요한 값 정리'),
    ('3 연결', '로그인·인증·관리자 승인', '앱 설정과 터널 연결 구성'),
    ('4 전환', '짧은 점검 시간 결정', '백업 후 전환과 연결 확인'),
    ('5 운영', 'PC 켜기·갱신·비용 관리', '운영 화면 보완과 장애 수정'),
], [0.85, 2.65, 3.4])

page('먼저 사용자가 준비할 일')
h('1단계 Cloudflare 계정 준비')
p('Cloudflare 웹사이트에서 본인 이메일로 가입하고 이메일 인증을 완료합니다. 기존 계정이 있다면 그대로 사용하면 됩니다. 계정 복구 수단을 보관하고 2단계 인증도 설정하는 것을 권장합니다.')
p('비밀번호·인증코드는 직접 입력합니다. 저에게는 가입과 인증을 마쳤다는 사실만 알려주시면 됩니다.')
h('2단계 도메인 구매')
p('가장 단순한 경로는 Cloudflare Registrar에서 도메인을 구매하는 것입니다. 도메인과 연결 설정을 같은 계정에서 관리할 수 있습니다. 다른 등록업체에서 구매해도 연결은 가능합니다. [2][3]')
bullet('Cloudflare 대시보드에서 도메인 등록 메뉴를 열고 원하는 이름을 검색합니다.')
bullet('riftassistant.com이 등록 가능하면 신규 등록비와 다음 해 갱신비를 모두 확인합니다. 이미 등록된 이름이면 다른 이름이나 확장자를 선택합니다.')
bullet('처음에는 1년 등록으로 시작해도 됩니다. 등록자 정보와 결제 정보를 본인이 입력하고 구매를 완료합니다.')
bullet('등록자 이메일 확인 안내가 오면 완료하고, 자동 갱신과 결제수단 상태를 확인합니다. Cloudflare는 기본적으로 자동 갱신을 켭니다. [2]')
p('도메인 구매는 주소를 일정 기간 사용하는 계약입니다. 계속 쓰려면 갱신해야 합니다. 정확한 금액은 선택한 이름의 결제 화면에서 확인해야 합니다.')
h('다른 업체에서 샀다면 추가할 일')
p('Cloudflare에 도메인을 추가하고 Free 플랜을 선택한 뒤, Cloudflare가 알려주는 네임서버 주소를 구매처에 입력합니다. 네임서버는 이 도메인의 연결 정보를 관리하는 곳을 지정하는 설정입니다. [3]')
p('제가 화면별 입력값을 안내할 수 있고, 구매처 로그인과 최종 변경은 사용자가 직접 할 수 있습니다. 기존에 이메일이나 다른 사이트에 쓰던 도메인이라면 기존 DNS 기록을 먼저 보존합니다.')
h('여기까지 준비되면 알려줄 내용')
p('“도메인은 ○○○이고, Cloudflare 계정과 이메일 인증을 마쳤어. Cloudflare에서 샀어.”처럼 알려주세요. 다른 업체에서 구매했다면 업체명과 Cloudflare의 활성화 상태도 알려주세요.', bold=True)
p('도메인 이름은 공유해도 됩니다. API 키·비밀번호·터널 비밀 토큰은 채팅에 붙이지 않습니다.')

page('이어서 제가 연결할 일')
h('3단계 현재 앱을 고정 주소에 맞게 준비')
p('먼저 앱 설정과 운영 데이터의 복구 가능한 사본을 준비합니다. 그다음 앱이 새 도메인에서 오는 요청을 정상적으로 받도록 허용 주소를 설정하고, 관리자에 새 공개 주소가 표시되도록 구성합니다.')
p('현재 관리 프로그램은 임시 터널을 자동으로 켜는 방식입니다. 외부에서 관리하는 터널을 연결할 설정은 있으나, 그 설정만으로 고정 터널이 생성되거나 실행되지는 않습니다. 고정 터널의 실행·상태 표시를 함께 준비해야 합니다.')
h('4단계 Cloudflare에 고정 터널 생성')
p('로그인된 Cloudflare 대시보드의 Networking → Tunnels → Create Tunnel에서 집 PC용 터널을 만듭니다. 이름은 riftassi-home처럼 알아보기 쉽게 지정하면 됩니다. 화면 명칭은 개편될 수 있습니다. [4]')
table(['항목', '이번 프로젝트에서 사용할 값'], [
    ('서버 환경', 'Windows · 집 PC에 설치된 cloudflared 사용'),
    ('공개 호스트 이름', '구매한 도메인 예: riftassistant.com'),
    ('연결할 로컬 서비스', 'http://127.0.0.1:3001'),
    ('공개하지 않을 주소', '관리 페이지 3100 · 기존 백업 앱 3000'),
    ('이용자 로그인', '없음 · URL을 아는 사람이 바로 사용'),
], [1.65, 5.25])
p('터널 설치 안내에서 Windows를 선택하고 커넥터를 등록합니다. 저는 명령과 저장 위치를 준비하고 연결을 구성합니다. 사용자는 로그인·인증과 Windows 관리자 승인처럼 본인 조작이 필요한 단계만 진행하면 됩니다.')
p('대시보드에서 연결이 Healthy가 되면 Routes → Add route → Published application에 공개 호스트와 로컬 서비스 주소를 등록합니다. 외부 HTTPS 주소와 집 PC 내부의 http 주소는 구분합니다. [4]')
h('터널을 계속 유지하는 방식')
p('고정 터널의 커넥터는 Windows 서비스로 등록하는 방식을 우선 검토합니다. 앱의 “서버 켜기·끄기”와 터널 연결 상태는 별도로 관리하되, 관리 화면에서 둘 다 확인할 수 있게 준비합니다.')
p('이 구조에서는 공유기 포트 개방이나 고정 공인 IP가 필요하지 않습니다. 집 PC가 Cloudflare로 연결을 맺습니다. Cloudflare Tunnel은 모든 플랜에서 제공되므로 기본 연결은 Free 플랜을 기준으로 준비합니다. [5]')
p('주의할 연결 값은 3001입니다. 내부 작업 서버인 3011·3012나 관리자 3100을 도메인의 대상으로 연결하지 않습니다.', bold=True)

page('고정 주소로 전환하고 운영하는 순서')
h('5단계 짧은 점검 시간에 첫 전환')
p('계정 준비·도메인 구매·연결 파일 준비는 기존 베타를 운영하면서 할 수 있습니다. 다만 현재 코드는 앱이 꺼진 상태에서 공개 주소 설정을 바꾸며, 공개 주소도 한 개를 기준으로 처리합니다. 첫 고정 주소 전환을 무중단이라고 약속할 수는 없습니다.')
bullet('사용자와 점검 시간을 정하고, 제가 기존 설정·데이터·실행 버전을 보존합니다.')
bullet('앱을 잠깐 멈춰 새 공개 주소와 터널 방식을 적용한 뒤 다시 켭니다.')
bullet('제가 새 주소의 HTTPS 접속, 카드 검색, 질문·제보 경로, 관리자 비공개 상태를 확인합니다. 실제 AI 질문 확인에는 평소와 같은 API 비용이 듭니다.')
bullet('사용자는 휴대폰 Wi-Fi를 끄고 모바일 데이터로 새 주소에 접속해 화면과 질문 1건을 확인합니다. 동작이 확인되면 새 주소를 공유합니다.')
p('문제가 생기면 저장해 둔 설정으로 되돌립니다. 임시 터널을 다시 만들면 예전 임시 주소가 유지되지 않을 수 있어, 복구 후 주소를 다시 안내해야 합니다.')
h('6단계 평소에는 이렇게 사용')
table(['상황', '사용자가 할 일과 결과'], [
    ('서비스 시작', '집 PC와 인터넷을 켜고 통합본 Open-Manager.cmd 실행 → 서버 켜기 → 앱과 터널 상태 확인'),
    ('주소 공유', '고정 주소를 한 번 공유. 같은 도메인과 연결 설정을 유지하면 재시작 후에도 주소 동일'),
    ('서비스 중지', '관리 화면에서 서버 끄기. 도메인은 유지되지만 방문자는 앱을 사용할 수 없음'),
    ('PC 재부팅', '터널 서비스의 자동 시작과 앱 자동 시작은 별개. 앱 자동 시작을 추가하기 전에는 관리 화면에서 시작'),
    ('패치 적용', '기존 앱 교체 방식 활용. 관리 프로그램·연결 구조 변경은 별도 점검이 필요할 수 있음'),
], [1.2, 5.7])
h('PC에서 한 번 정할 설정')
p('서비스할 시간에는 자동 절전·최대 절전으로 서버가 멈추지 않도록 설정합니다. 화면만 끄는 것은 괜찮습니다. Windows 업데이트나 재부팅 후에는 앱과 터널 상태를 다시 확인합니다. 현재 안내 단계에서 전원 설정을 바꾸지는 않았습니다.')
p('터널 서비스가 연결되어 있어도 앱을 끄면 답변은 제공되지 않습니다. 반대로 앱만 켜져 있고 터널이 끊기면 외부에서 접속할 수 없습니다.', bold=True)

page('비용과 준비 완료 기준')
h('어떤 비용이 필요한가')
table(['항목', '지출 방식', '관리 주체'], [
    ('도메인', '등록·갱신 비용. 정확한 가격은 구매 화면에서 확인', '사용자'),
    ('Cloudflare 연결', '기본 Tunnel은 Free 플랜 기준. 유료 부가 기능은 필요 시 별도 선택', '사용자 선택'),
    ('OpenAI API', '실제 질문·답변·번역 사용량에 따른 기존 API 비용', '사용자 결제 · 제가 집계 기능 보완'),
    ('집 PC', '전기와 기존 인터넷 비용. 별도 호스팅 서버 임대는 이번 구성에 없음', '사용자'),
], [1.15, 3.85, 1.9])
h('연결이 끝났다고 보는 기준')
bullet('구매한 주소가 Cloudflare에서 활성화되고, HTTPS로 리프트어시가 열립니다.')
bullet('집 밖 네트워크에서 카드 검색·질문·제보를 사용할 수 있고 관리 페이지는 외부에 노출되지 않습니다.')
bullet('관리 화면에서 서버를 껐다 켠 뒤에도 같은 주소로 다시 사용할 수 있습니다.')
bullet('연결 장애와 앱 중지 상태를 구분할 수 있고, 기존 상태로 돌아가는 절차가 보관되어 있습니다.')
h('운영할 때 기억할 점')
p('집 PC를 끄면 서비스도 중단됩니다. PC를 끈 채 서비스하려면 앱을 다른 서버로 옮기는 별도 작업이 필요합니다.')
p('우선 구매한 기본 주소 하나로 시작할 수 있습니다. www는 필요하면 기본 주소로 이동하도록 추가합니다.')
p('검색 노출은 도메인 연결 이후에 별도로 준비합니다. 고정 주소가 안정된 뒤 사이트 정보·검색 등록을 준비해도 검색 결과 반영 시점은 보장할 수 없습니다.')
h('지금 사용자가 할 일')
p('Cloudflare 가입·인증 → 원하는 도메인과 등록·갱신 가격 확인 → 직접 구매 → 구매한 주소와 준비 상태 알려주기. 그다음 제가 연결 준비를 마치고, 함께 전환 시간을 정하면 됩니다.', bold=True)
h('확인한 공식 안내')
hyperlink('[1] Cloudflare Quick Tunnels 임시 시험 연결', 'https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/')
hyperlink('[2] Cloudflare Registrar 도메인 등록', 'https://developers.cloudflare.com/registrar/get-started/register-domain/')
hyperlink('[3] 다른 업체의 도메인을 Cloudflare에 추가', 'https://developers.cloudflare.com/fundamentals/manage-domains/add-site/')
hyperlink('[4] Cloudflare Tunnel 생성과 공개 경로 연결', 'https://developers.cloudflare.com/tunnel/get-started/')
hyperlink('[5] Cloudflare Tunnel 제공 범위와 연결 구조', 'https://developers.cloudflare.com/tunnel/')

doc.core_properties.title = '리프트어시 고정 도메인 운영 안내'
doc.core_properties.subject = '집 PC 서버와 Cloudflare Tunnel을 사용하는 고정 주소 연결 절차와 역할 분담'
doc.core_properties.author = '리프트어시 프로젝트'
doc.core_properties.keywords = '리프트어시, 도메인, Cloudflare, 집 PC, 운영 안내'
# Suppress template paragraph borders and Word's East Asian document-grid snapping.
for st in doc.styles:
    for border in list(st._element.iter(qn('w:pBdr'))):
        border.getparent().remove(border)
for para in list(doc.paragraphs) + [p for t in doc.tables for row in t.rows for cell in row.cells for p in cell.paragraphs]:
    pp = para._p.get_or_add_pPr()
    grid = OxmlElement('w:snapToGrid')
    grid.set(qn('w:val'), '0')
    pp.append(grid)
    for border in list(pp.findall(qn('w:pBdr'))):
        pp.remove(border)
doc.save(OUT)
print(OUT)
