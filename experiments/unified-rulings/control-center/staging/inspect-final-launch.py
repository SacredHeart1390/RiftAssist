"""PROPOSED single targeted source/config review. No execution, DB/key/env reads or writes."""
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess

DATA = '/home/azureuser/RiftAssist/experiments/unified-rulings'
MAIN, HELPER = 'riftassist.service', 'riftassist-autostart.service'
TARGETS = frozenset(p + '/riftassist-autostart.py' for p in
    ('/usr/local/bin', '/usr/local/sbin', '/usr/local/lib/riftassist', '/home/azureuser', DATA))
SAFE_STRINGS = frozenset(('key', 'cookie', 'Cookie', 'Set-Cookie', 'Content-Type', 'application/json', 'POST', 'GET',
    'utf-8', 'r', 'private', 'manager.key', 'ok', 'appRunning', 'changing', 'error',
    '/api/start', '/api/login', '/api/status', '/api/stop', DATA, DATA + '/private/manager.key',
    'http://127.0.0.1:3100', 'http://localhost:3100', *('http://' + h + ':3100/api/' + a
    for h in ('127.0.0.1', 'localhost') for a in ('start', 'login', 'status', 'stop'))))
SAFE_IMPORTS = frozenset(('json', 'time', 'pathlib', 'os', 'sys', 'urllib.request', 'urllib.error', 'http.client', 'subprocess', 'socket'))
PROPS = 'Id,FragmentPath,DropInPaths,ExecStart,User,Group,Type,Restart,Requires,Wants,BindsTo,After,PartOf,RootDirectory,RootImage,BindPaths,BindReadOnlyPaths,InaccessiblePaths,EnvironmentFiles'


def read_source(filename, limit):
    # Directory-FD traversal refuses symlinks in every component, including races.
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    fd = os.open('/', flags)
    try:
        parts = Path(filename).parts[1:]
        for part in parts[:-1]:
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
        file = os.open(parts[-1], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        try:
            before = os.fstat(file)
            if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
                raise ValueError('source-shape')
            data = os.read(file, limit + 1)
            after = os.fstat(file)
            if len(data) != before.st_size or len(data) > limit or (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns):
                raise ValueError('source-changed')
            return data, {'uid': after.st_uid, 'gid': after.st_gid, 'mode': oct(stat.S_IMODE(after.st_mode))}
        finally:
            os.close(file)
    finally:
        os.close(fd)


def identifier(value):
    return value if value and len(value) <= 48 and not re.search(r'(?:sk[-_]|gh[pousr]_|[a-f0-9]{32})', value, re.I) else 'REDACTED_IDENTIFIER'


class Redact(ast.NodeTransformer):
    def generic_visit(self, n):
        super().generic_visit(n)
        for key in ('name', 'id', 'attr', 'arg', 'asname'):
            if isinstance(getattr(n, key, None), str):
                setattr(n, key, identifier(getattr(n, key)))
        if isinstance(n, (ast.Global, ast.Nonlocal)):
            n.names = [identifier(x) for x in n.names]
        return n
    def visit_Constant(self, n):
        v = n.value
        if isinstance(v, str) and v in SAFE_STRINGS or v is None or isinstance(v, bool) or isinstance(v, int) and (0 <= v <= 300 or v in (3001, 3011, 3012, 3100)):
            return n
        return ast.copy_location(ast.Constant(value='[REDACTED_LITERAL]'), n)
    def visit_Name(self, n):
        n.id = identifier(n.id)
        return n
    def visit_Attribute(self, n):
        self.generic_visit(n)
        n.attr = identifier(n.attr)
        return n
    def visit_arg(self, n):
        self.generic_visit(n)
        n.arg = identifier(n.arg)
        return n
    def visit_alias(self, n):
        n.name = n.name if n.name in SAFE_IMPORTS else 'REDACTED_IMPORT'
        if n.asname:
            n.asname = identifier(n.asname)
        return n
    def visit_ImportFrom(self, n):
        n.module = n.module if n.module in SAFE_IMPORTS else 'REDACTED_IMPORT'
        # Imported symbol names are code identifiers, never source literal values.
        for alias in n.names:
            alias.name = identifier(alias.name)
            if alias.asname:
                alias.asname = identifier(alias.asname)
        return n
    def visit_FunctionDef(self, n):
        n.name = identifier(n.name)
        return self.generic_visit(n)
    visit_AsyncFunctionDef = visit_FunctionDef
    visit_ClassDef = visit_FunctionDef
    def visit_keyword(self, n):
        self.generic_visit(n)
        if n.arg:
            n.arg = identifier(n.arg)
        return n


def helper_review(fields):
    paths = set(re.findall(r'/[A-Za-z0-9_./-]+/riftassist-autostart\.py(?=\s|;|}|$)', fields.get('ExecStart', '')))
    if len(paths) != 1 or next(iter(paths)) not in TARGETS:
        return {'available': False, 'reason': 'helper-target-outside-fixed-scope', 'sourceRead': False}
    filename = next(iter(paths))
    try:
        data, metadata = read_source(filename, 32768)
        tree = ast.parse(data.decode('utf-8-sig'))  # Parse only; never imports, evaluates or executes helper.
        if not any(isinstance(n, (ast.Import, ast.ImportFrom, ast.Call)) for n in ast.walk(tree)):
            raise ValueError('not-python-program')
        text = ast.unparse(ast.fix_missing_locations(Redact().visit(tree)))
        if len(text) > 16384:
            raise ValueError('output-budget')
        return {'available': True, 'path': filename, 'sourceRead': True, 'sourceSha256': hashlib.sha256(data).hexdigest(),
                'metadata': metadata, 'redactedStructure': text, 'allOtherLiteralsRedacted': True,
                'runnableSource': False, 'executed': False, 'behaviorVerified': False}
    except (OSError, ValueError, SyntaxError, UnicodeError):
        return {'available': False, 'reason': 'helper-review-unavailable', 'sourceRead': False}


def units():
    try:
        r = subprocess.run(['/usr/bin/systemctl', 'show', MAIN, HELPER, '--no-pager', '--property=' + PROPS],
            stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False,
            env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'SYSTEMD_PAGER': 'cat'})
        if r.returncode or len(r.stdout) > 65536:
            return {}
        result = {}
        for block in r.stdout.decode('utf-8', errors='replace').strip().split('\n\n'):
            f = dict(line.split('=', 1) for line in block.splitlines() if '=' in line)
            if f.get('Id') in (MAIN, HELPER):
                result[f['Id']] = f
        return result
    except (OSError, subprocess.TimeoutExpired):
        return {}


def fingerprint(filename, marker):
    try:
        data, metadata = read_source(filename, 65536)
        if marker not in data:
            raise ValueError('source-type')
        return {'available': True, 'sha256': hashlib.sha256(data).hexdigest(), 'metadata': metadata,
                'rawContentEmitted': False, 'importsPresent': bool(re.search(rb'^\s*import\s', data, re.M)) if filename.endswith('Caddyfile') else None}
    except (OSError, ValueError):
        return {'available': False}


def inspect():
    f = units()
    main, helper = f.get(MAIN, {}), f.get(HELPER, {})
    relation = lambda fields, name, target: target in fields[name].split() if name in fields else None
    return {'protocol': 'riftassist-final-launch-1', 'readOnly': True,
            'main': {'available': bool(main), 'requiresHelper': relation(main, 'Requires', HELPER),
                     'bindsToHelper': relation(main, 'BindsTo', HELPER), 'wantsHelper': relation(main, 'Wants', HELPER),
                     'namespaceValuesEmpty': {k: not bool(main[k]) if k in main else None for k in
                        ('RootDirectory', 'RootImage', 'BindPaths', 'BindReadOnlyPaths', 'InaccessiblePaths', 'EnvironmentFiles')},
                     'dropInCount': len(main['DropInPaths'].split()) if 'DropInPaths' in main else None},
            'helper': helper_review(helper),
            'unitSource': fingerprint('/etc/systemd/system/riftassist.service', b'[Service]') if main.get('FragmentPath') == '/etc/systemd/system/riftassist.service' else {'available': False},
            'caddySource': fingerprint('/etc/caddy/Caddyfile', b'riftassistant.app'),
            'privateFilesOpened': 0, 'sensitiveFileContentsRead': False, 'helperCodeExecuted': False,
            'environmentValuesEmitted': False, 'authorizedToDeploy': False}


if __name__ == '__main__':
    try:
        print(json.dumps(inspect(), ensure_ascii=True, separators=(',', ':')))
    except Exception:
        print(json.dumps({'protocol': 'riftassist-final-launch-1', 'readOnly': True, 'error': 'review-unavailable', 'authorizedToDeploy': False}))
