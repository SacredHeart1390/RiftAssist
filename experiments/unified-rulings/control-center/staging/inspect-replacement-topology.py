"""Separate approval required. Metadata only: no files/DB/keys/env/journal reads or writes."""
import json
import re
import subprocess

UNITS = ('riftassist.service', 'riftassist-autostart.service', 'caddy.service')
PROPS = 'Id,LoadState,ActiveState,UnitFileState,ExecStart,FragmentPath,DropInPaths,User,Group,KillMode,ControlGroup,TriggeredBy,Triggers,Requires,Wants,After,Before'


def run(args):
    try:
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=5, check=False,
                           env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'SYSTEMD_PAGER': 'cat'})
        return r.stdout.decode('utf-8', errors='replace') if r.returncode == 0 and len(r.stdout) <= 65536 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def safe_path(value):
    if not re.fullmatch(r'/[A-Za-z0-9_./-]{1,300}', value or '') or '..' in value.split('/'):
        return None
    roots = ('/etc/systemd/system/', '/usr/lib/systemd/system/', '/lib/systemd/system/',
             '/etc/caddy/', '/home/azureuser/RiftAssist/', '/usr/local/bin/')
    return value if value.startswith(roots) else None


def exec_shape(raw):
    raw = raw or ''
    binary = re.search(r'(?:^|[ {;])path=([^ ;}]+)', raw)
    allowed = {'/usr/bin/node', '/usr/bin/caddy', '/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/curl', '/usr/bin/systemctl'}
    executable = binary.group(1) if binary and binary.group(1) in allowed else None
    config = re.search(r'(?:--config[= ]+)(/[A-Za-z0-9_./-]+)(?=\s|;|}|$)', raw)
    config_path = safe_path(config.group(1)) if config else None
    if config_path and not config_path.startswith('/etc/caddy/'):
        config_path = None
    scripts = [safe_path(p) for p in re.findall(r'/[A-Za-z0-9_./-]+\.(?:js|cjs|sh)(?=\s|;|}|$)', raw)]
    return {'executable': executable, 'configArgument': config_path,
            'referencedScriptPaths': sorted({p for p in scripts if p}),
            'mentionsLoginEndpoint': '/api/login' in raw, 'mentionsStartEndpoint': '/api/start' in raw,
            'mentionsStopEndpoint': '/api/stop' in raw, 'mentionsSleep': bool(re.search(r'\bsleep\b', raw)),
            'mentionsSystemctl': 'systemctl' in raw,
            'rawArgumentsEmitted': False, 'scriptContentsRead': False, 'behaviorVerified': False}


def inspect():
    units = []
    for name in UNITS:
        raw = run(['/usr/bin/systemctl', 'show', name, '--no-pager', '--property=' + PROPS])
        if raw is None:
            units.append({'unit': name, 'available': False})
            continue
        fields = dict(s.split('=', 1) for s in raw.splitlines() if '=' in s)
        row = {'unit': name, 'execShape': exec_shape(fields.get('ExecStart'))}
        for key in ['LoadState', 'ActiveState', 'UnitFileState', 'User', 'Group', 'KillMode']:
            v = fields.get(key, '')
            row[key] = v if re.fullmatch(r'[A-Za-z0-9_-]{0,64}', v) else None
        row['FragmentPath'] = safe_path(fields.get('FragmentPath'))
        row['DropInPaths'] = [safe_path(v) for v in fields.get('DropInPaths', '').split() if safe_path(v)]
        group = fields.get('ControlGroup', '')
        row['ControlGroup'] = group if re.fullmatch(r'/system\.slice/[A-Za-z0-9_.@-]+\.service', group) else None
        for key in ['TriggeredBy', 'Triggers', 'Requires', 'Wants', 'After', 'Before']:
            row[key] = [v for v in fields.get(key, '').split() if re.fullmatch(r'[A-Za-z0-9_.@-]+\.(?:target|service|socket|timer)', v)][:40]
        units.append(row)
    uid, gid, version = run(['/usr/bin/id', '-u', 'azureuser']), run(['/usr/bin/id', '-g', 'azureuser']), run(['/usr/bin/node', '--version'])
    return {'protocol': 'riftassist-replacement-topology-1', 'readOnly': True, 'units': units,
            'uid': int(uid.strip()) if uid and uid.strip().isdigit() else None,
            'gid': int(gid.strip()) if gid and gid.strip().isdigit() else None,
            'nodeVersion': version.strip() if version and re.fullmatch(r'v\d+\.\d+\.\d+\s*', version) else None,
            'notRead': ['DB', 'keys', 'user records', 'Environment', 'journal', 'referenced script contents', 'Caddy config contents'],
            'unknowns': ['Helper behavior requires code review if script or shell is referenced', 'Active Caddy config with env expansion/wrappers', '443 socket owning PID']}


if __name__ == '__main__':
    try:
        print(json.dumps(inspect(), ensure_ascii=True, separators=(',', ':')))
    except Exception:
        print(json.dumps({'protocol': 'riftassist-replacement-topology-1', 'readOnly': True, 'error': 'metadata-unavailable'}))
