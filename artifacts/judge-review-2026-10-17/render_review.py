"""Use the packaged DOCX renderer with a Word PDF conversion adapter on Windows.

The selected Windows runtime has no bundled LibreOffice. The document is exported
by a hidden Word instance, then the skill's rasterization code and bundled
PDFium generate the review images. Apparent repeated-text omissions in tool
previews were cross-checked with native-size crops and pixel comparisons.
No installed LibreOffice is invoked.
"""
from pathlib import Path
import importlib.util
import json
import os
import re
import shutil
import sys

HERE = Path(__file__).resolve().parent
PDF = HERE / 'research/word-render.pdf'
DOCX = HERE / 'Riftbound_Judge_Review_21_KO.docx'
RENDERER = Path(r'C:\Users\user\.codex\plugins\cache\openai-primary-runtime\documents\26.1015.12040\skills\documents\render_docx.py')
POPPLER = r'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin'
os.environ['PATH'] = POPPLER + os.pathsep + os.environ.get('PATH', '')
assert PDF.exists() and PDF.stat().st_size > 0
spec = importlib.util.spec_from_file_location('packaged_render_docx', RENDERER)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)

def word_pdf_adapter(input_path, user_profile, convert_tmp_dir, stem, verbose=False):
    assert Path(input_path).resolve() == DOCX.resolve()
    destination = Path(convert_tmp_dir) / (stem + '.pdf')
    shutil.copyfile(PDF, destination)
    return str(destination), 'PDF exported by Microsoft Word on Windows'

renderer.convert_to_pdf = word_pdf_adapter
import pypdfium2 as pdfium

def render_each_page(pdf_path, **kwargs):
    # Use the bundled PDFium renderer for the final visual inspection.
    result = []
    with pdfium.PdfDocument(pdf_path) as document:
        for i in range(len(document)):
            destination = Path(kwargs['output_folder']) / f'pdfium-{i + 1}.png'
            page = document[i]
            bitmap = page.render(scale=kwargs.get('dpi', 96) / 72)
            bitmap.to_pil().save(destination)
            bitmap.close()
            page.close()
            result.append(str(destination))
    return result

renderer.convert_from_path = render_each_page
sys.argv = [str(RENDERER), str(DOCX), '--output_dir', str(HERE / 'research/render-final'), '--dpi', '96']
renderer.main()
from pdf2image import pdfinfo_from_path
print(json.dumps({'rendered_pages': pdfinfo_from_path(str(PDF))['Pages']}, ensure_ascii=False))

try:
    from pypdf import PdfReader
    pages = PdfReader(str(PDF)).pages
    summary = [{'page': i + 1, 'chars': len(page.extract_text()), 'ids': sorted(set(re.findall(r'\b[GT]\d{2}\b', page.extract_text())))} for i, page in enumerate(pages)]
    (HERE / 'research/page-summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(summary, ensure_ascii=False))
except ImportError:
    print('Optional PDF text extractor unavailable; page images are the layout review source.')
