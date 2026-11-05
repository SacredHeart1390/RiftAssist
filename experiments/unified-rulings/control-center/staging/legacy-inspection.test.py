import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2] / 'releases/v0.1.7'
spec = importlib.util.spec_from_file_location('legacy_probe', Path(__file__).with_name('inspect-legacy-source.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Inspection(unittest.TestCase):
    def setUp(self):
        # Target is Ubuntu; Windows unit fixtures use only known regular private temp files.
        for name in ['O_NOFOLLOW', 'O_NONBLOCK']:
            if not hasattr(os, name):
                guard = patch.object(os, name, 0, create=True)
                guard.start()
                self.addCleanup(guard.stop)

    def fixture(self):
        temporary = tempfile.TemporaryDirectory(prefix='riftassist-source-probe-test-')
        root = Path(temporary.name) / 'code'
        shutil.copytree(ROOT, root)
        self.addCleanup(temporary.cleanup)
        return root

    def test_exact_known_source_matches_node_deployment_fingerprint(self):
        root = self.fixture()
        with patch.object(probe, 'ROOT', root):
            result = probe.inspect()
        self.assertTrue(result['referenceVerified'])
        script = "console.log(require(process.argv[1]).receipt(process.argv[2]).hash)"
        value = subprocess.check_output(['node', '-e', script, str(Path(__file__).with_name('legacy-v017.cjs')), str(root)], text=True).strip()
        self.assertEqual(result['deploymentCodeHash'], value)

    def test_unknown_sensitive_file_is_not_opened_or_named(self):
        root = self.fixture()
        (root / 'private-fixture.key').write_text('synthetic-secret-not-for-output')
        with patch.object(probe, 'ROOT', root):
            value = probe.inspect()
        self.assertFalse(value['referenceVerified'])
        self.assertNotIn('synthetic-secret-not-for-output', json.dumps(value))
        self.assertNotIn('private-fixture.key', json.dumps(value))

    def test_known_file_tamper_and_missing_source_block_readiness(self):
        root = self.fixture()
        file = root / 'src/paths.js'
        file.write_bytes(file.read_bytes() + b'\n// synthetic drift\n')
        with patch.object(probe, 'ROOT', root):
            value = probe.inspect()
        self.assertFalse(value['referenceVerified'])
        self.assertIsNone(value['deploymentCodeHash'])
        file.unlink()
        with patch.object(probe, 'ROOT', root):
            self.assertFalse(probe.inspect()['referenceVerified'])

    def test_link_to_unknown_content_is_never_followed(self):
        root = self.fixture()
        target = root.parent / 'synthetic-storage.key'
        target.write_text('synthetic-secret-not-for-output')
        file = root / 'src/paths.js'
        file.unlink()
        os.link(target, file)  # Windows-compatible link refusal test; nlink must be one.
        with patch.object(probe, 'ROOT', root):
            value = probe.inspect()
        self.assertFalse(value['referenceVerified'])
        self.assertNotIn('synthetic-secret-not-for-output', json.dumps(value))


if __name__ == '__main__':
    unittest.main()
