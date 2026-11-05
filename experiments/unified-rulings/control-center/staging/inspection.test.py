"""Synthetic-only checks. Importing the probe never connects to Azure/public HTTPS."""
import importlib.util
import json
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('probe', Path(__file__).with_name('inspect-azure.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class Inspection(unittest.TestCase):
    def test_exec_omits_inline_credentials_and_shell_body(self):
        marker = 'synthetic-sensitive-fixture-only'
        raw = '{ path=/usr/bin/node ; argv[]=/usr/bin/node /home/azureuser/RiftAssist/experiments/unified-rulings/releases/v0.1.7/src/manager.js ' + '--' + 'token' + '=' + marker + ' ; }'
        result = probe.exec_metadata(raw)
        self.assertNotIn(marker, json.dumps(result))
        self.assertEqual(result['executable'], '/usr/bin/node')
        self.assertTrue(result['entryScript'].endswith('src/manager.js'))
        self.assertEqual(result['arguments'], 'omitted')
        self.assertIsNone(probe.exec_metadata('{ path=/private/' + marker + '/node ; }')['executable'])

    def test_no_environment_journal_key_or_question_commands(self):
        calls = []
        def run(args):
            calls.append(args)
            if 'list-units' in args:
                return 'riftassist.service loaded active running synthetic\nother.service loaded active running do not emit description'
            return 'Id=riftassist.service\nMainPID=0\nEnvironment=synthetic-sensitive-fixture-only\nUser=azureuser\nActiveState=active\nWorkingDirectory=/home/azureuser/RiftAssist/experiments/unified-rulings\nExecStart={ path=/usr/bin/node ; argv[]=/usr/bin/node --token=synthetic-sensitive-fixture-only ; }'
        with patch.object(probe, 'run', run):
            result = probe.units_metadata()
        output = json.dumps(result)
        self.assertNotIn('synthetic-sensitive-fixture-only', output)
        self.assertNotIn('other.service', output)
        self.assertTrue(all(a[0] == '/usr/bin/systemctl' for a in calls))
        self.assertTrue(all('Environment' not in arg and 'journal' not in arg for a in calls for arg in a))

    def test_unsafe_paths_and_unknown_data_roots_are_not_guessed(self):
        self.assertIsNone(probe.safe_path('/home/azureuser/.ssh/id_ed25519'))
        self.assertIsNone(probe.safe_path('/home/azureuser/RiftAssist/../.ssh/key'))
        self.assertIsNone(probe.safe_path('/unknown/path/operations.sqlite'))
        self.assertEqual(probe.safe_path('/home/azureuser/RiftAssist/experiments/unified-rulings/private/operations.sqlite'), '/home/azureuser/RiftAssist/experiments/unified-rulings/private/operations.sqlite')

    def test_listener_projection_discards_upstream_strings_and_flags_public_manager(self):
        raw = 'LISTEN 0 128 0.0.0.0:3100 0.0.0.0:* users:(("synthetic-sensitive-fixture-only",pid=123,fd=9))\nLISTEN 0 128 127.0.0.1:3001 0.0.0.0:* users:(("node",pid=456,fd=8))'
        with patch.object(probe, 'run', return_value=raw):
            rows = probe.listeners_metadata()
        self.assertNotIn('synthetic-sensitive-fixture-only', json.dumps(rows))
        self.assertTrue(rows[0]['managerInternetExposureConcern'])
        self.assertFalse(rows[1]['managerInternetExposureConcern'])
        self.assertEqual(rows[1]['pids'], [456])

    def test_https_status_never_reads_response_body_or_disables_tls(self):
        class Response:
            status = 200
            def read(self, *args):
                raise AssertionError('Body must not be read')
        connections = []
        class Connection:
            def __init__(self, host, **kw):
                self.host = host
                self.kw = kw
                self.check = kw['context'].check_hostname
                self.verify = kw['context'].verify_mode
                connections.append(self)
            def request(self, method, route, **kw):
                assert method == 'GET' and route == '/'
            def getresponse(self): return Response()
            def close(self): pass
        with patch.object(probe.http.client, 'HTTPSConnection', Connection):
            self.assertEqual(probe.public_https()['status'], 200)
        self.assertTrue(connections[0].check)
        self.assertEqual(connections[0].verify, probe.ssl.CERT_REQUIRED)
        self.assertNotIn('/api/login', Path(probe.__file__).read_text())

    def test_caddy_projection_does_not_emit_directive_secrets_or_open_includes(self):
        with tempfile.TemporaryDirectory(prefix='riftassist-inspection-test-') as root:
            file = Path(root) / 'Caddyfile'
            file.write_text('riftassistant.app {\n reverse_proxy 127.0.0.1:3001\n tls { dns example synthetic-sensitive-fixture-only }\n import /etc/caddy/site.conf\n}\n')
            original = probe.Path
            with patch.object(probe, 'Path', lambda value: file if value == '/etc/caddy/Caddyfile' else original(value)):
                result = probe.caddy_metadata()
            self.assertNotIn('synthetic-sensitive-fixture-only', json.dumps(result))
            self.assertFalse(result['includesRead'])
            self.assertFalse(result['certificatesOrKeysRead'])
            self.assertEqual(result['loopbackUpstreams'], ['127.0.0.1:3001'])

    def test_source_is_ascii_and_entry_is_explicit(self):
        source = Path(probe.__file__).read_bytes()
        source.decode('ascii')
        self.assertNotIn(b'shell=True', source)
        self.assertIn(b"if __name__ == '__main__':", source)

if __name__ == '__main__':
    unittest.main()
