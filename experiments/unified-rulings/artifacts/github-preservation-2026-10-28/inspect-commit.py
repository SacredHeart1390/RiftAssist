"""Inspect candidate/staged files; print aggregate findings, never matched values.

This is a scoped pattern/path check, not a complete repository-history audit.
Runtime databases, keys and process environments are not opened.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[4]
ART = Path(__file__).resolve().parent
PREFIXES = (
    'experiments/unified-rulings/releases/v0.2.0/',
    'experiments/unified-rulings/tests/',
    'experiments/unified-rulings/artifacts/riot-production-review-2026-10-28/',
    'experiments/unified-rulings/artifacts/riot-predeploy-hardening-2026-10-28/',
    'experiments/unified-rulings/artifacts/riot-v0.2.0-2026-10-28/',
    'experiments/unified-rulings/artifacts/github-preservation-2026-10-28/',
    'experiments/unified-rulings/artifacts/card-translation-2026-10-28/',
    'experiments/unified-rulings/artifacts/card-sync-2026-10-28/',
    'experiments/unified-rulings/artifacts/card-review-2026-10-28/',
    'experiments/unified-rulings/control-center/',
    'experiments/unified-rulings/artifacts/control-center-2026-10-29/',
    'experiments/unified-rulings/artifacts/control-center-phase2-2026-10-29/',
    'experiments/unified-rulings/artifacts/control-center-phase3-2026-10-31/',
)
EXACT = {'.github/workflows/rules-tests.yml', '.github/workflows/control-center.yml', 'experiments/unified-rulings/.gitignore'}
PATTERNS = {
    'provider-token': rb'\b(?:sk-(?:proj-|admin-)?[A-Za-z0-9_-]{20,}|RGAPI-[A-Za-z0-9-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,})',
    'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----',
    'aws-access-key': rb'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b',
    'url-credential': rb'https?://[^\s/\x22\x27:]+:[^\s/\x22\x27@]+@',
    'credential-literal': rb'''(?i)\b(?:OPENAI_API_KEY|RIOT_API_KEY|api_?key|admin_?key|password|secret|token)\s*[=:]\s*["']([^"'\r\n]{8,})["']''',
}
SYNTHETIC = (
    b'sk-regression-dummy-not-a-real-key', b'development-mock-only',
    b'synthetic-token', b'invalid-test-credential',
)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--staged', action='store_true')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if args.staged:
        paths = git('diff', '--cached', '--name-only', '-z').split(b'\0')
    else:
        paths = git('ls-files', '--modified', '--others', '--exclude-standard', '-z').split(b'\0')
    names = sorted(set(p.decode() for p in paths if p))
    findings = []
    png = text = total = 0
    for name in names:
        p = Path(name)
        denied = (name not in EXACT and not name.startswith(PREFIXES)) or bool(
            set(p.parts).intersection({'private', '.dev-data', '.ssh', '.aws', 'source-updates', 'knowledge-releases'})
        ) or p.name.startswith('.env') or re.search(r'\.(?:sqlite(?:-wal|-shm)?|db(?:-wal|-shm)?|key|pem|p12|pfx)$', name, re.I)
        if denied:
            findings.append({'path': name, 'rule': 'excluded-path'}); continue
        target = ROOT / name
        if target.is_symlink():
            findings.append({'path': name, 'rule': 'symlink'}); continue
        data = git('show', ':' + name) if args.staged else target.read_bytes()
        total += len(data)
        if data.startswith(b'SQLite format 3\0'):
            findings.append({'path': name, 'rule': 'database-magic'}); continue
        if name.endswith('.png'):
            if not data.startswith(b'\x89PNG\r\n\x1a\n'):
                findings.append({'path': name, 'rule': 'unexpected-binary'})
            png += 1
        else:
            try:
                data.decode('utf-8')
            except UnicodeDecodeError:
                findings.append({'path': name, 'rule': 'unexpected-binary'}); continue
            text += 1
        for dummy in SYNTHETIC:
            data = data.replace(dummy, b'SYNTHETIC_TEST_CREDENTIAL')
        for kind, pattern in PATTERNS.items():
            matches = list(re.finditer(pattern, data))
            if kind == 'credential-literal':
                matches = [match for match in matches if match.group(1) != b'SYNTHETIC_TEST_CREDENTIAL']
            if matches:
                findings.append({'path': name, 'rule': kind})
    result = {'scope': 'staged' if args.staged else 'working-tree-candidates',
              'mainSha': git('rev-parse', 'origin/main').decode().strip(),
              'branch': git('branch', '--show-current').decode().strip(),
              'files': len(names), 'bytes': total, 'textFiles': text, 'syntheticTestScreenshots': png,
              'findings': findings, 'findingCount': len(findings),
              'syntheticCredentialAllowlist': 'Four exact, nonfunctional test strings only',
              'limitations': 'Scoped path/pattern inspection only; no guarantee of all-secret absence or historical blob removal.'}
    Path(args.output).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if findings:
        raise SystemExit(1)

if __name__ == '__main__':
    main()
