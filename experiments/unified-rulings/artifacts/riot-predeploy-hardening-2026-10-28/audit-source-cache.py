"""Audit only the source cache, using a disposable copy and aggregate output.

Never open operations.sqlite, invoke the runtime stores, print row values, or
checkpoint/recover/vacuum the original. WAL/SHM are copied with the main DB.
"""
from pathlib import Path
import hashlib
import json
import re
import shutil
import sqlite3
import tempfile

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'source-updates'
FILES = ['content.sqlite', 'content.sqlite-wal', 'content.sqlite-shm']
EXPECTED = {
    'state': {'name', 'value'},
    'documents': {'id', 'value'},
    'faqs': {'id', 'url', 'sitemap_modified', 'seen_cycle', 'fetched_modified',
             'content', 'body_hash', 'etag', 'last_modified', 'checked_at',
             'fetched_at', 'failures', 'retry_at', 'error', 'missing_count', 'removed'},
}

def signature(file):
    return {'bytes': file.stat().st_size, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}

def indicators(data):
    # Counts only. Email/IP matches may belong to public sources. Heuristics
    # neither establish private-data origin nor prove absence of secrets.
    return {
        'emailLike': len(re.findall(rb'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', data)),
        'ipv4Like': len(re.findall(rb'(?<![0-9])(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?![0-9])', data)),
        'credentialLike': len(re.findall(rb'\b(?:sk-[A-Za-z0-9_-]{20,}|RGAPI-[A-Za-z0-9-]{20,}|Bearer [A-Za-z0-9._-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)', data)),
        'sensitiveFieldLike': len(re.findall(rb'"(?:api[_-]?key|password|authorization|session[_-]?token|access[_-]?token)"\s*:', data, re.I)),
    }

def main():
    before = {name: signature(CACHE / name) for name in FILES}
    with tempfile.TemporaryDirectory(prefix='riftassist-source-audit-') as temporary:
        copy = Path(temporary)
        for name in FILES:
            if (CACHE / name).is_symlink():
                raise RuntimeError('Refusing a symlink; no file values were printed.')
            shutil.copyfile(CACHE / name, copy / name)
        copied = {name: signature(copy / name) for name in FILES}
        if before != copied or before != {name: signature(CACHE / name) for name in FILES}:
            raise RuntimeError('Source cache changed while copying; no database contents were printed.')
        raw_indicators = {name: indicators((copy / name).read_bytes()) for name in FILES}
        db = sqlite3.connect((copy / 'content.sqlite').as_uri() + '?mode=ro', uri=True)
        try:
            db.execute('PRAGMA query_only=ON')
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            known = tables.intersection(EXPECTED)
            schema_matches = tables == set(EXPECTED) and all(
                {row[1] for row in db.execute(f'PRAGMA table_info({table})')} == EXPECTED[table]
                for table in known)
            if not schema_matches:
                raise RuntimeError('Unexpected schema; audit stopped without printing table/row values.')
            counts = {table: db.execute(f'SELECT count(*) FROM {table}').fetchone()[0] for table in sorted(known)}
            integrity_ok = db.execute('PRAGMA quick_check').fetchall() == [('ok',)]
            text_indicators = dict.fromkeys(indicators(b''), 0)
            json_records = invalid_json = 0
            # These are source-cache values, not local user request/report tables.
            for query in ['SELECT value FROM state', 'SELECT value FROM documents',
                          'SELECT content FROM faqs WHERE content IS NOT NULL', 'SELECT error FROM faqs WHERE error IS NOT NULL']:
                for (value,) in db.execute(query):
                    for kind, count in indicators(value.encode()).items():
                        text_indicators[kind] += count
                    if 'SELECT error' not in query:
                        json_records += 1
                        try:
                            json.loads(value)
                        except (ValueError, TypeError):
                            invalid_json += 1
            summary = {'purpose': 'public-source synchronization cache and retry/publication state',
                       'schemaMatchesSyncStore': schema_matches, 'quickCheckPassed': integrity_ok,
                       'rowCounts': counts, 'jsonRecords': json_records, 'invalidJsonRecords': invalid_json,
                       'localOperationsTablesPresent': bool(tables.intersection({'requests', 'reports', 'calls', 'settings'})),
                       'logicalTextIndicators': text_indicators, 'rawFileIndicatorsIncludingWal': raw_indicators,
                       'originalFiles': before, 'originalFilesUnchanged': before == {name: signature(CACHE / name) for name in FILES},
                       'rawValuesPrinted': False,
                       'limits': 'Pattern matches may be public author data or version strings. No match is not proof of no sensitive data. Git history not scanned.'}
        finally:
            db.close()
    if not summary['originalFilesUnchanged']:
        raise RuntimeError('Original cache changed externally; do not claim an unchanged snapshot.')
    print(json.dumps(summary, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
