"""Read-only metadata probe. Review and approve BEFORE sending it to Azure.

No stdin commands/options; no environment, process command-line, journal, DB or key reads.
ASCII source/output also works through Windows PowerShell 5 native pipelines.
"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import ssl
import subprocess
import time

PORTS = {443, 3001, 3011, 3012, 3100}
DEADLINE = time.monotonic() + 45
PROPS = ('Id,LoadState,ActiveState,SubState,UnitFileState,User,Group,WorkingDirectory,'
         'ExecStart,MainPID,ControlGroup,Restart,RestartUSec,NRestarts,StartLimitBurst,'
         'StartLimitIntervalUSec,TimeoutStartUSec,TimeoutStopUSec,KillMode,FragmentPath,'
         'DropInPaths,WantedBy,Requires,Wants,After')
SAFE_ROOTS = ('/home/azureuser/RiftAssist', '/opt/riftassist', '/srv/riftassist', '/var/lib/riftassist')

def run(args):
    try:
        if time.monotonic() >= DEADLINE:
            return None
        r = subprocess.run(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                           stderr=subprocess.DEVNULL, timeout=max(0.1, min(6, DEADLINE-time.monotonic())), check=False,
                           env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'SYSTEMD_PAGER': 'cat'})
        if len(r.stdout) > 2 * 1024 * 1024:
            return None
        return r.stdout.decode('utf-8', errors='replace') if r.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None

def safe_path(value, system=False):
    if not re.fullmatch(r'/[A-Za-z0-9_./-]{1,400}', value or '') or '..' in value.split('/'):
        return None
    if system and value.startswith(('/etc/systemd/system/', '/usr/lib/systemd/system/', '/lib/systemd/system/', '/etc/caddy/')):
        return value
    return value if any(value == root or value.startswith(root + '/') for root in SAFE_ROOTS) else None

def exec_metadata(raw):
    # Never emit argv, shell -c bodies, assignments or unrecognised executable paths.
    m = re.search(r'(?:^|[ {;])path=([^ ;}]+)', raw or '')
    binary = m.group(1) if m else None
    if binary and binary not in {'/usr/bin/node', '/usr/local/bin/node', '/bin/node', '/usr/bin/nodejs', '/usr/bin/bash', '/bin/bash', '/bin/sh', '/usr/bin/caddy', '/usr/bin/npm'}:
        binary = None
    script = None
    for value in re.findall(r'/[A-Za-z0-9_./-]+/src/(?:manager|server)\.js', raw or ''):
        if safe_path(value):
            script = value
            break
    return {'executable': binary, 'entryScript': script, 'arguments': 'omitted',
            'shellBodyReviewed': False, 'rawExecStartEmitted': False}

def units_metadata():
    listed = run(['/usr/bin/systemctl', 'list-units', '--all', '--plain', '--no-legend', '--no-pager']) or ''
    names = {'riftassist.service', 'caddy.service'}
    for line in listed.splitlines():
        unit = line.split()[0] if line.split() else ''
        if re.fullmatch(r'riftassist[A-Za-z0-9_.@-]*\.(?:service|socket|timer)', unit):
            names.add(unit)
    result = []
    numeric = {'MainPID', 'NRestarts', 'StartLimitBurst'}
    for name in sorted(names)[:24]:
        raw = run(['/usr/bin/systemctl', 'show', name, '--no-pager', '--property=' + PROPS])
        if raw is None:
            result.append({'unit': name, 'available': False})
            continue
        values = dict(line.split('=', 1) for line in raw.splitlines() if '=' in line)
        row = {'unit': name, 'available': True, 'execStart': exec_metadata(values.get('ExecStart'))}
        for key in ['LoadState', 'ActiveState', 'SubState', 'UnitFileState', 'Restart', 'KillMode']:
            v = values.get(key, '')
            row[key] = v if re.fullmatch(r'[a-z0-9-]{0,40}', v) else None
        for key in ['User', 'Group']:
            v = values.get(key, '')
            row[key] = v if re.fullmatch(r'[A-Za-z0-9_-]{0,64}', v) else None
        for key in numeric:
            row[key] = int(values[key]) if values.get(key, '').isdigit() else None
        row['WorkingDirectory'] = safe_path(values.get('WorkingDirectory'))
        row['FragmentPath'] = safe_path(values.get('FragmentPath'), system=True)
        # Dependencies are unit identifiers only; descriptions and Environment are never requested.
        for key in ['WantedBy', 'Requires', 'Wants', 'After']:
            row[key] = [s for s in values.get(key, '').split() if re.fullmatch(r'[A-Za-z0-9_.@-]+\.(?:target|service|socket|timer)', s)][:40]
        row['timeouts'] = {key: values.get(key) if re.fullmatch(r'[0-9a-z .]+', values.get(key, '')) else None for key in ['RestartUSec', 'TimeoutStartUSec', 'TimeoutStopUSec', 'StartLimitIntervalUSec']}
        result.append(row)
    return result

def process_metadata(units):
    all_processes = {}
    for entry in Path('/proc').iterdir():
        if time.monotonic() >= DEADLINE:
            break
        if not entry.name.isdigit():
            continue
        try:
            raw = (entry / 'stat').read_text()
            parts = raw[raw.rfind(')') + 2:].split()
            all_processes[int(entry.name)] = int(parts[1])
        except (OSError, ValueError, IndexError):
            pass
    selected = {u['MainPID'] for u in units if isinstance(u.get('MainPID'), int) and u['MainPID'] > 0}
    for _ in range(8):
        selected |= {pid for pid, parent in all_processes.items() if parent in selected}
    rows = []
    for pid in sorted(selected)[:64]:
        row = {'pid': pid, 'parentPid': all_processes.get(pid), 'dataRootEvidence': [], 'cwd': None}
        try:
            row['cwd'] = safe_path(os.readlink('/proc/' + str(pid) + '/cwd'))
            comm = Path('/proc', str(pid), 'comm').read_text().strip()
            row['role'] = comm if comm in {'node', 'nodejs', 'caddy', 'bash', 'sh'} else 'other'
            for fd in Path('/proc', str(pid), 'fd').iterdir():
                if time.monotonic() >= DEADLINE:
                    break
                try:
                    target = os.readlink(fd)
                    if Path(target).name in {'operations.sqlite', 'operations.sqlite-wal', 'operations.sqlite-shm'} and safe_path(target):
                        row['dataRootEvidence'].append(str(Path(target).parent.parent))
                except OSError:
                    pass
            row['dataRootEvidence'] = sorted(set(row['dataRootEvidence']))
        except OSError:
            row['metadataPermissionLimited'] = True
        rows.append(row)
    return rows

def listeners_metadata():
    raw = run(['/usr/bin/ss', '-ltnpH']) or ''
    rows = []
    for line in raw.splitlines():
        columns = line.split()
        if len(columns) < 5:
            continue
        local = columns[3]
        port = local.rsplit(':', 1)[-1]
        if not port.isdigit() or int(port) not in PORTS:
            continue
        host = local.rsplit(':', 1)[0].strip('[]')
        rows.append({'port': int(port), 'binding': 'loopback' if host in {'127.0.0.1', '::1'} else 'wildcard-or-other',
                     'pids': [int(x) for x in re.findall(r'pid=(\d+)', line)],
                     'managerInternetExposureConcern': int(port) == 3100 and host not in {'127.0.0.1', '::1'}})
    return rows

def caddy_metadata():
    # Only this reviewed config path. No includes are opened; no cert/key/env expansion.
    file = Path('/etc/caddy/Caddyfile')
    if not file.is_file() or file.is_symlink():
        return {'reviewedPathAvailable': False, 'actualConfigPathConfirmed': False}
    try:
        if file.stat().st_size > 65536:
            return {'reviewedPathAvailable': False}
        content = file.read_bytes()
        text = content.decode('utf-8', errors='replace')
        imports = []
        upstreams = []
        for line in text.splitlines():
            s = line.strip()
            if re.fullmatch(r'import /etc/caddy/[A-Za-z0-9_./*?-]+', s) and '..' not in s.split('/'):
                imports.append(s[7:])
            m = re.fullmatch(r'reverse_proxy (127\.0\.0\.1:\d{2,5})(?:\s*\{)?', s)
            if m:
                upstreams.append(m.group(1))
        return {'reviewedPathAvailable': True, 'actualConfigPathConfirmed': False,
                'sha256': hashlib.sha256(content).hexdigest(), 'imports': imports,
                'loopbackUpstreams': upstreams, 'knownDomainMentioned': 'riftassistant.app' in text,
                'includesRead': False, 'certificatesOrKeysRead': False, 'rawConfigEmitted': False}
    except OSError:
        return {'reviewedPathAvailable': False, 'permissionLimited': True}

def resources():
    values = {}
    try:
        for line in Path('/proc/meminfo').read_text().splitlines():
            parts = line.split()
            if parts[0] in {'MemTotal:', 'MemAvailable:'}:
                values[parts[0][:-1] + 'KiB'] = int(parts[1])
        values['uptimeSeconds'] = float(Path('/proc/uptime').read_text().split()[0])
        def cpu():
            p = [int(x) for x in Path('/proc/stat').read_text().splitlines()[0].split()[1:9]]
            return sum(p), p[3] + p[4]
        a, idle_a = cpu()
        time.sleep(0.2)
        b, idle_b = cpu()
        values['cpuPercent'] = round(100 * (1 - (idle_b - idle_a) / max(1, b - a)), 2)
    except (OSError, ValueError, IndexError):
        values['procUnavailable'] = True
    disk = shutil.disk_usage('/')
    values.update(diskTotalBytes=disk.total, diskFreeBytes=disk.free)
    return values

def public_https():
    if time.monotonic() >= DEADLINE:
        return {'available': False, 'timeBudgetExceeded': True}
    conn = http.client.HTTPSConnection('riftassistant.app', timeout=max(0.1, min(5, DEADLINE-time.monotonic())), context=ssl.create_default_context())
    try:
        conn.request('GET', '/', headers={'User-Agent': 'RiftAssist-approved-readonly-inventory'})
        response = conn.getresponse()
        return {'status': response.status, 'tlsVerified': True, 'bodyReadOrSaved': False}
    except (OSError, http.client.HTTPException):
        return {'available': False, 'detailSuppressed': True}
    finally:
        conn.close()

def inspect():
    units = units_metadata()
    return {'protocol': 'riftassist-inventory-1', 'readOnly': True, 'units': units,
            'processes': process_metadata(units), 'listeners': listeners_metadata(),
            'resources': resources(), 'caddy': caddy_metadata(), 'publicHttps': public_https(),
            'notRead': ['Environment', '/proc/*/environ', '/proc/*/cmdline', 'journal', 'database contents', 'keys', 'user questions'],
            'unknowns': ['Data root if fd metadata unavailable', 'Caddy include contents and actual active config path', 'manager hosting/appRelease database settings', 'deployed sources vs repository', '/api/health not requested because v017 allocates sessions']}

if __name__ == '__main__':
    try:
        print(json.dumps(inspect(), ensure_ascii=True, separators=(',', ':')))
    except Exception:
        print(json.dumps({'protocol': 'riftassist-inventory-1', 'readOnly': True, 'error': 'metadata-unavailable', 'detailSuppressed': True}))
