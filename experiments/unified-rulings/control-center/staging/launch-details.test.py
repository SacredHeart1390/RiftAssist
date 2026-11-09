"""Synthetic metadata only; never reads Azure or private data."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('launch_details', Path(__file__).with_name('inspect-launch-details.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class LaunchDetails(unittest.TestCase):
    def test_known_lock_name_is_identity_only_and_never_accepted_as_code(self):
        s = SimpleNamespace(st_mode=stat.S_IFREG | 0o666, st_uid=1000, st_gid=1000, st_nlink=1)
        r = probe.identity('package-lock.json', '', s)
        self.assertEqual(r['name'], 'package-lock.json')
        self.assertTrue(r['groupOrWorldWritable'])
        self.assertFalse(r['acceptedAsCode'])
        self.assertFalse(r['contentRead'])

    def test_unknown_names_stay_redacted_even_if_the_extension_is_executable(self):
        s = SimpleNamespace(st_mode=stat.S_IFREG | 0o777, st_uid=1000, st_gid=1000, st_nlink=1)
        r = probe.identity('person-fixture.json', '', s)
        self.assertEqual(r['name'], 'redacted')
        self.assertEqual(r['extension'], '.json')
        self.assertNotIn('person-fixture', json.dumps(r))

    def test_command_hints_do_not_emit_keys_payloads_or_unknown_script_paths(self):
        raw = '/bin/bash -lc sleep 3; curl http://127.0.0.1:3100/api/login -d synthetic-private-value; cat /private/manager.key; curl http://localhost:3100/api/start; /home/person-fixture/start-private.sh; chmod 777 /private/file'
        r = probe.command_hints(raw)
        text = json.dumps(r)
        for denied in ['synthetic-private-value', 'person-fixture', 'start-private.sh', '/private/file']:
            self.assertNotIn(denied, text)
        self.assertEqual(r['hints'][:2], ['delay', 'managerLogin'])
        self.assertIn('fileWriteWords', r['hints'])
        self.assertFalse(r['behaviorVerified'])
        self.assertTrue(r['referencedScripts'][0]['otherIdentityRedacted'])

    def test_only_one_fixed_unit_and_command_properties_are_queried(self):
        with patch.object(probe.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout=b'ExecStart=synthetic-private-value\n')) as call:
            result = probe.helper()
        self.assertEqual(call.call_count, 1)
        self.assertEqual(call.call_args.args[0][2], 'riftassist-autostart.service')
        self.assertNotIn('Environment', call.call_args.args[0][-1])
        self.assertIs(call.call_args.kwargs['stderr'], probe.subprocess.DEVNULL)
        self.assertNotIn('synthetic-private-value', json.dumps(result))

    def test_missing_service_or_metadata_cannot_become_an_approval(self):
        with patch.object(probe, 'layout', side_effect=OSError()), patch.object(probe, 'helper', return_value={'available': False}):
            r = probe.inspect()
        self.assertFalse(r['authorizedToDeploy'])
        self.assertFalse(r['layout']['complete'])
        self.assertEqual(r['privateFilesOpened'], 0)

    @unittest.skipUnless(os.name == 'posix', 'Ubuntu verifies actual no-follow directory descriptors')
    def test_no_extra_contents_or_dependency_children_opened(self):
        with tempfile.TemporaryDirectory(prefix='riftassist-launch-metadata-') as d:
            root = Path(d) / 'code'
            source = Path(__file__).resolve().parents[2] / 'releases/v0.1.7'
            for name in probe.KNOWN:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source / name, target)
            (root / 'node_modules').mkdir()
            (root / 'node_modules/private-fixture').write_text('synthetic-private-value')
            (root / 'package-lock.json').write_text('synthetic-private-value')
            original = os.open
            def directories_only(name, flags, *args, **kwargs):
                self.assertTrue(flags & os.O_DIRECTORY)
                self.assertTrue(flags & os.O_NOFOLLOW)
                self.assertNotEqual(name, 'node_modules')
                return original(name, flags, *args, **kwargs)
            with patch.object(probe, 'ROOT', root), patch.object(probe.os, 'open', side_effect=directories_only), patch('builtins.open', side_effect=AssertionError('Contents forbidden')):
                r = probe.layout()
            self.assertTrue(r['complete'])
            self.assertEqual(r['knownPathsObserved'], 65)
            self.assertEqual({x['name'] for x in r['extras']}, {'node_modules', 'package-lock.json'})
            self.assertNotIn('synthetic-private-value', json.dumps(r))


if __name__ == '__main__':
    unittest.main()
