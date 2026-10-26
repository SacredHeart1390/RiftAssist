"""Use the documents skill renderer with this PC's Word PDF conversion adapter."""
from pathlib import Path
import importlib.util
import os
import shutil
import sys
import pypdfium2 as pdfium

HERE = Path(__file__).resolve().parent
DOCX = HERE / '리프트어시_고정도메인_운영안내_2026-10-21.docx'
PDF = HERE / 'word-render.pdf'
RENDERER = Path(r'C:\Users\user\.codex\plugins\cache\openai-primary-runtime\documents\26.1020.11127\skills\documents\render_docx.py')
os.environ['PATH'] = r'C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin' + os.pathsep + os.environ.get('PATH', '')
spec = importlib.util.spec_from_file_location('packaged_render_docx', RENDERER)
renderer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(renderer)

def word_pdf_adapter(input_path, user_profile, convert_tmp_dir, stem, verbose=False):
    assert Path(input_path).resolve() == DOCX.resolve()
    destination = Path(convert_tmp_dir) / (stem + '.pdf')
    shutil.copyfile(PDF, destination)
    return str(destination), 'Exported by hidden Word instance on Windows'

def render_each_page(pdf_path, **kwargs):
    result = []
    with pdfium.PdfDocument(pdf_path) as pdf:
        for i in range(len(pdf)):
            destination = Path(kwargs['output_folder']) / f'pdfium-{i + 1}.png'
            pg = pdf[i]
            bitmap = pg.render(scale=kwargs.get('dpi', 96) / 72)
            bitmap.to_pil().save(destination)
            bitmap.close()
            pg.close()
            result.append(str(destination))
    return result

renderer.convert_to_pdf = word_pdf_adapter
renderer.convert_from_path = render_each_page
sys.argv = [str(RENDERER), str(DOCX), '--output_dir', str(HERE / 'rendered'), '--dpi', '110']
renderer.main()
from pypdf import PdfReader
for i, pg in enumerate(PdfReader(PDF).pages, 1):
    txt = pg.extract_text()
    print(f'Page {i}: {len(txt)} characters | {txt[:95]!r}')
