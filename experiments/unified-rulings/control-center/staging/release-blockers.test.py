"""All inputs are synthetic. Never imports real service data or contacts Azure."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('blockers', Path(__file__).with_name('inspect-release-blockers.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class VirtualDirectories:
    def __init__(self, additions=None):
        self.nodes = {p: ('file', 0o644) for p in probe.KNOWN}
        self.nodes.update({p.rsplit('/', 1)[0]: ('directory', 0o755) for p in probe.KNOWN if '/' in p})
        self.nodes.update(additions or {})
        self.fds, self.opened = {}, []

    def open(self, name, flags, dir_fd=None):
        name = '' if dir_fd is None else str(name)
        if name and self.nodes.get(name, ('',))[0] != 'directory':
            raise OSError('synthetic no-follow refusal')
        self.opened.append(name)
        fd = len(self.fds) + 20
        while fd in self.fds:
            fd += 1
        self.fds[fd] = name
        return fd

    def fstat(self, fd):
        return SimpleNamespace(st_dev=1, st_ino=100 + len(self.fds[fd]), st_mtime_ns=1)

    def scandir(self, fd):
        parent = self.fds[fd]
        rows = []
        for name, (kind, mode) in self.nodes.items():
            if (name.rsplit('/', 1)[0] if '/' in name else '') != parent:
                continue
            info = SimpleNamespace(st_mode={'file': stat.S_IFREG, 'directory': stat.S_IFDIR, 'link': stat.S_IFLNK}[kind] | mode,
                                   st_nlink=1, st_uid=1000, st_gid=1000, st_size=42)
            rows.append(SimpleNamespace(name=name.split('/')[-1], stat=lambda follow_symlinks=False, info=info: info))
        class Entries:
            def __enter__(self):
                return iter(rows)
            def __exit__(self, *args):
                return False
        return Entries()


class Inspection(unittest.TestCase):
    def setUp(self):
        for flag in ('O_DIRECTORY', 'O_NOFOLLOW', 'O_NONBLOCK'):
            if not hasattr(os, flag):
                guard = patch.object(os, flag, 0, create=True)
                guard.start()
                self.addCleanup(guard.stop)

    def virtual(self, additions=None):
        v = VirtualDirectories(additions)
        with patch.object(Path, 'is_symlink', return_value=False), patch.object(probe.os, 'open', side_effect=v.open), patch.object(probe.os, 'close', side_effect=lambda fd: v.fds.pop(fd)), patch.object(probe.os, 'fstat', side_effect=v.fstat), patch.object(probe.os, 'scandir', side_effect=v.scandir), patch('builtins.open', side_effect=AssertionError('No file contents permitted')):
            return probe.layout(), v

    def test_fixed_paths_match_the_original_65_not_an_expanded_allowlist(self):
        reference = json.loads(Path(__file__).with_name('legacy-v017-baseline.json').read_text())
        self.assertEqual(probe.KNOWN, frozenset(reference['files']))
        self.assertEqual(len(probe.KNOWN), 65)

    def test_known_metadata_does_not_claim_hash_verification_or_deployment(self):
        result, v = self.virtual()
        self.assertEqual(result['knownPathsObserved'], 65)
        self.assertTrue(result['complete'])
        self.assertFalse(result['knownCodeHashesRechecked'])
        self.assertFalse(result['authorizedToDeploy'])
        self.assertEqual(set(v.opened), {'', 'src', 'public', 'scripts', 'manager-ui'})

    def test_private_unknown_files_and_directories_are_never_opened_or_named(self):
        result, v = self.virtual({'private': ('directory', 0o700), 'private/person-record.sqlite': ('file', 0o600), 'person-record.key': ('file', 0o600), 'node_modules': ('directory', 0o755)})
        encoded = json.dumps(result)
        self.assertNotIn('person-record', encoded)
        self.assertNotIn('private', v.opened)
        self.assertNotIn('node_modules', v.opened)
        self.assertEqual(len(result['additionalPaths']), 3)
        self.assertTrue(all(not x['contentRead'] and not x['acceptedAsCode'] for x in result['additionalPaths']))

    def test_public_extras_are_exposure_risks_including_generated_names(self):
        result, _ = self.virtual({'public/.DS_Store': ('file', 0o666), 'public/person-data.json': ('file', 0o644)})
        self.assertTrue(all(x['category'] == 'public-exposure-risk' for x in result['additionalPaths']))
        self.assertTrue(next(x for x in result['additionalPaths'] if x['label'] == '.DS_Store')['groupOrWorldWritable'])
        self.assertNotIn('person-data', json.dumps(result))

    def test_link_targets_and_unknown_subtrees_are_not_followed(self):
        result, v = self.virtual({'private-link': ('link', 0o777), 'new-folder': ('directory', 0o755), 'new-folder/hidden.sh': ('file', 0o755)})
        self.assertEqual(len(result['additionalPaths']), 2)
        self.assertNotIn('hidden.sh', json.dumps(result))
        self.assertTrue(all(not x['linkTargetRead'] for x in result['additionalPaths']))
        self.assertEqual(len(v.opened), 5)

    def test_large_layout_is_marked_incomplete_and_unknown_path_ids_are_not_reusable_capabilities(self):
        result, _ = self.virtual({'person-' + str(i): ('file', 0o644) for i in range(200)})
        self.assertFalse(result['complete'])
        self.assertIn('output-budget', result['issues'])
        self.assertEqual(len(result['additionalPaths']), 80)
        self.assertNotIn('person-', json.dumps(result))
        one, _ = self.virtual({'unclassified': ('file', 0o644)})
        two, _ = self.virtual({'unclassified': ('file', 0o644)})
        self.assertNotEqual(one['additionalPaths'][0]['id'], two['additionalPaths'][0]['id'])

    def test_unit_auth_arguments_environment_and_script_paths_are_not_emitted(self):
        raw = 'LoadState=loaded\nActiveState=inactive\nUnitFileState=enabled\nSubState=synthetic-secret-value\nEnvironment=synthetic-secret-value\nExecStart={ path=/bin/bash ; argv[]=/bin/bash -lc sleep 4 && curl /api/login -d synthetic-secret-value && cat /private/manager.key && curl /api/start ; }\nExecStartPost={ path=/usr/bin/node ; argv[]=/usr/bin/node /home/azureuser/secret-person.sh ; }\n'
        with patch.object(probe, 'run', return_value=raw):
            rows = probe.services()
        text = json.dumps(rows)
        self.assertNotIn('synthetic-secret-value', text)
        self.assertNotIn('secret-person', text)
        self.assertTrue(rows[1]['commands']['ExecStart']['mentionsAppStart'])
        self.assertTrue(rows[1]['commands']['ExecStart']['mentionsKeyFile'])
        self.assertFalse(rows[1]['commands']['ExecStart']['behaviorVerified'])
        self.assertTrue(rows[1]['autostartConflictUnresolved'])

    def test_systemctl_queries_are_fixed_and_cannot_change_services(self):
        with patch.object(probe.subprocess, 'run', return_value=SimpleNamespace(stdout=b'', returncode=0)) as command:
            rows = probe.services()
        self.assertIsNone(rows[0]['jobPending'])
        self.assertIsNone(rows[0]['mainPidPresent'])
        self.assertIsNone(rows[0]['dropInCount'])
        self.assertEqual(command.call_count, 3)
        for name, call in zip(probe.UNITS, command.call_args_list):
            self.assertEqual(call.args[0][:4], ['/usr/bin/systemctl', 'show', name, '--no-pager'])
            self.assertNotIn('Environment', call.args[0][-1])
            self.assertIs(call.kwargs['stderr'], probe.subprocess.DEVNULL)
            self.assertEqual(set(call.kwargs['env']), {'PATH', 'LC_ALL', 'SYSTEMD_PAGER'})

    @unittest.skipUnless(os.name == 'posix', 'Linux directory-FD execution is verified by Ubuntu CI; Windows runs virtual contracts')
    def test_actual_posix_descriptors_read_only_known_directories_never_file_contents(self):
        with tempfile.TemporaryDirectory(prefix='riftassist-extra-metadata-') as d:
            root = Path(d) / 'code'
            shutil.copytree(Path(__file__).resolve().parents[2] / 'releases/v0.1.7', root)
            (root / 'private').mkdir()
            (root / 'private/person-record.sqlite').write_text('synthetic-secret-value')
            (root / 'unknown-person.key').write_text('synthetic-secret-value')
            original, opened = os.open, []
            def directory_only(name, flags, *args, **kwargs):
                self.assertTrue(flags & os.O_DIRECTORY)
                self.assertTrue(flags & os.O_NOFOLLOW)
                opened.append(str(name))
                return original(name, flags, *args, **kwargs)
            with patch.object(probe, 'ROOT', root), patch.object(probe.os, 'open', side_effect=directory_only), patch('builtins.open', side_effect=AssertionError('No contents permitted')):
                result = probe.layout()
            self.assertTrue(result['complete'])
            self.assertEqual(result['knownPathsObserved'], 65)
            self.assertEqual(len(result['additionalPaths']), 2)
            self.assertEqual(len(opened), 5)
            self.assertNotIn('unknown-person', json.dumps(result))
            self.assertNotIn('synthetic-secret-value', json.dumps(result))


if __name__ == '__main__':
    unittest.main()
