"""Synthetic source review; no real Azure, helper execution or private contents."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('final_launch', Path(__file__).with_name('inspect-final-launch.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)
TARGET = '/usr/local/bin/riftassist-autostart.py'
SOURCE = b'import time, json\nfrom pathlib import Path\nsecret = "development-mock-only"\nkey = Path("/private/unknown.key").read_text()\ntime.sleep(3)\nprint(key)\n'


class FinalInspection(unittest.TestCase):
    def test_redacted_structure_preserves_calls_but_never_evaluates_or_reads_their_paths(self):
        with patch.object(probe, 'read_source', return_value=(SOURCE, {'mode': '0o644'})) as read, patch('builtins.open', side_effect=AssertionError('No referenced files permitted')):
            r = probe.helper_review({'ExecStart': '/usr/bin/python3 ' + TARGET + ' ;'})
        self.assertEqual(read.call_args.args[0], TARGET)
        self.assertTrue(r['sourceRead'])
        self.assertFalse(r['executed'])
        self.assertFalse(r['behaviorVerified'])
        self.assertIn('time.sleep(3)', r['redactedStructure'])
        self.assertIn('print(key)', r['redactedStructure'])
        for value in ('development-mock-only', '/private/unknown.key'):
            self.assertNotIn(value, json.dumps(r))

    def test_unknown_script_targets_are_never_opened_or_guessed(self):
        with patch.object(probe, 'read_source', side_effect=AssertionError('No fallback search')):
            r = probe.helper_review({'ExecStart': '/private/riftassist-autostart.py ;'})
        self.assertFalse(r['available'])
        self.assertFalse(r['sourceRead'])

    def test_invalid_python_never_exports_raw_contents(self):
        with patch.object(probe, 'read_source', return_value=(b'not valid python: synthetic-do-not-emit', {})):
            r = probe.helper_review({'ExecStart': TARGET + ' ;'})
        self.assertFalse(r['available'])
        self.assertNotIn('synthetic-do-not-emit', json.dumps(r))

    def test_unit_query_is_fixed_and_environment_values_are_not_requested(self):
        raw = b'Id=riftassist.service\nRequires=riftassist-autostart.service\nEnvironment=synthetic-do-not-emit\n\nId=riftassist-autostart.service\nExecStart=/usr/bin/python3 /usr/local/bin/riftassist-autostart.py ;\n'
        with patch.object(probe.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=raw)) as call:
            fields = probe.units()
        self.assertEqual(call.call_args.args[0][2:4], [probe.MAIN, probe.HELPER])
        props = call.call_args.args[0][-1].split('=', 1)[1].split(',')
        self.assertNotIn('Environment', props)
        with patch.object(probe, 'units', return_value=fields), patch.object(probe, 'helper_review', return_value={'available': False}), patch.object(probe, 'fingerprint', return_value={'available': False}):
            r = probe.inspect()
        self.assertNotIn('synthetic-do-not-emit', json.dumps(r))
        self.assertTrue(r['main']['requiresHelper'])
        self.assertIsNone(r['main']['bindsToHelper'])
        self.assertFalse(r['authorizedToDeploy'])

    def test_configuration_fingerprints_do_not_export_configuration_values(self):
        text = b'[Service]\nEnvironment=OPENAI_API_KEY=synthetic-do-not-emit\n'
        with patch.object(probe, 'read_source', return_value=(text, {})):
            r = probe.fingerprint('/etc/systemd/system/riftassist.service', b'[Service]')
        self.assertTrue(r['available'])
        self.assertNotIn('synthetic-do-not-emit', json.dumps(r))

    @unittest.skipUnless(os.name == 'posix', 'Ubuntu executes the actual no-follow descriptor proof')
    def test_descriptor_reader_refuses_links_without_reading_their_contents(self):
        with tempfile.TemporaryDirectory(prefix='riftassist-final-source-') as d:
            source = Path(d) / 'source.py'
            source.write_bytes(SOURCE)
            data, _ = probe.read_source(str(source), 32768)
            self.assertEqual(data, SOURCE)
            link = Path(d) / 'link.py'
            link.symlink_to(source)
            with patch.object(probe.os, 'read', side_effect=AssertionError('Link must fail before read')):
                with self.assertRaises(OSError):
                    probe.read_source(str(link), 32768)


if __name__ == '__main__':
    unittest.main()
