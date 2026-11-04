"""Disposable synthetic SSH endpoint on 127.0.0.1 only; never execute a remote command.

All key files are freshly generated under the caller's disposable test root.
No Azure, database, user data, real key, shell command, HTTP or API access.
"""
import getpass
import json
import logging
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import selectors
import time
import paramiko

logging.disable(logging.CRITICAL)
root = Path(sys.argv[1])
mode = sys.argv[2]
listener = socket.socket()
listener.bind(('127.0.0.1', 0))
listener.listen(2)
port = listener.getsockname()[1]
host_key = paramiko.RSAKey.generate(2048)
client_key = paramiko.RSAKey.generate(2048)
identity = root / 'synthetic key.pem'
client_key.write_private_key_file(str(identity))
if os.name == 'nt':
    owner = os.environ.get('USERDOMAIN', '') + '\\' + getpass.getuser()
    subprocess.run(['icacls.exe', str(identity), '/inheritance:r', '/grant:r', owner + ':(F)'],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
else:
    identity.chmod(0o600)
known_key = paramiko.RSAKey.generate(2048) if mode == 'host-mismatch' else host_key
(root / 'known hosts').write_text(f'[127.0.0.1]:{port} {known_key.get_name()} {known_key.get_base64()}\n', encoding='utf-8')

class MockServer(paramiko.ServerInterface):
    def __init__(self):
        self.command = None
        self.ready = threading.Event()
    def check_auth_publickey(self, username, key):
        if mode != 'denied' and username == 'synthetic_user' and key == client_key:
            return paramiko.AUTH_SUCCESSFUL
        return paramiko.AUTH_FAILED
    def get_allowed_auths(self, username):
        return 'publickey'
    def check_channel_request(self, kind, channel_id):
        return paramiko.OPEN_SUCCEEDED if kind == 'session' else paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
    def check_channel_direct_tcpip_request(self, channel_id, origin, destination):
        if mode == 'admin-proxy' and destination == ('127.0.0.1', 3100):
            self.ready.set()
            return paramiko.OPEN_SUCCEEDED
        return paramiko.OPEN_FAILED_ADMINISTRATIVELY_PROHIBITED
    def check_channel_exec_request(self, channel, command):
        self.command = command
        self.ready.set()
        return command == b'sh -s'

print(json.dumps({'port': port}), flush=True)
connection, _ = listener.accept()
transport = paramiko.Transport(connection)
transport.add_server_key(host_key)
server = MockServer()
try:
    transport.start_server(server=server)
    channel = transport.accept(15)
    if channel is not None and server.ready.wait(10):
        if mode == 'admin-proxy':
            # Only the local synthetic Node server supplied by the test runner; never production.
            upstream = socket.create_connection(('127.0.0.1', int(sys.argv[3])), timeout=10)
            selector = selectors.DefaultSelector()
            selector.register(channel, selectors.EVENT_READ, upstream)
            selector.register(upstream, selectors.EVENT_READ, channel)
            active = True
            while active:
                for entry, _ in selector.select(15):
                    data = entry.fileobj.recv(8192)
                    if not data:
                        active = False
                        break
                    entry.data.sendall(data)
            upstream.close()
            selector.close()
            channel.close()
            transport.close()
            time.sleep(30)
            sys.exit(0)
        channel.settimeout(10)
        chunks = []
        while True:
            part = channel.recv(4096)
            if not part:
                break
            chunks.append(part)
            if sum(map(len, chunks)) > 16000:
                raise ValueError('Oversize fixture input')
        if mode.startswith('key-'):
            expected = (root / 'expected-input.txt').read_bytes()
            if b''.join(chunks) != expected or server.command != b'sh -s':
                channel.send_exit_status(91)
            elif mode == 'key-missing':
                channel.send_exit_status(71)
            elif mode == 'key-invalid':
                channel.sendall(b'invalid mock value')
                channel.send_exit_status(0)
            else:
                channel.sendall(b'a' * 64)
                channel.send_exit_status(0)
            channel.shutdown_write()
            channel.close()
            # Allow OpenSSH to consume exit-status before the mock transport closes.
            deadline = time.monotonic() + 2
            while transport.is_active() and time.monotonic() < deadline:
                time.sleep(0.02)
            transport.close()
            time.sleep(30)
            sys.exit(0)
        expected = (root / 'expected-input.txt').read_bytes()
        if b''.join(chunks) != expected or server.command != b'sh -s':
            channel.send_exit_status(91)
        else:
            (root / 'stdin-verified').write_text('verified')
            channel.send_stderr(b'RIFTASSIST_STATUS_STARTED\n')
            if mode == 'drop':
                time.sleep(0.2)
                transport.close()
            elif mode == 'remote-error':
                channel.send_stderr(b'sh: syntax error synthetic-sensitive-output\n')
                channel.send_exit_status(2)
            else:
                status = ('protocol=riftassist-status-1\nuptime_seconds=3600.5\nmemory_total_kib=4194304\n'
                          'memory_available_kib=3145728\ndisk_total_kib=67108864\ndisk_available_kib=54525952\n'
                          'cpu_percent=12.50\nservice=active\napp_http=200\nhttps_http=200\n')
                channel.sendall(b'invalid output\n' if mode == 'bad-output' else status.encode('utf-8'))
                channel.send_exit_status(0)
        if not channel.closed:
            channel.shutdown_write()
            channel.close()
    time.sleep(0.3)
except (EOFError, OSError, paramiko.SSHException):
    pass
finally:
    transport.close()
    listener.close()
# Keep the process alive until the test runner collects its result and terminates it.
time.sleep(30)
