import importlib.util
import io
import json
from pathlib import Path
import os
import tempfile
import unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('maintenance',Path(__file__).with_name('inspect-maintenance-metadata.py'))
probe=importlib.util.module_from_spec(spec);spec.loader.exec_module(probe)
class Inspection(unittest.TestCase):
    def fixture(self):
        t=tempfile.TemporaryDirectory(prefix='riftassist-maintenance-meta-');self.addCleanup(t.cleanup)
        root=Path(t.name);(root/'private').mkdir();(root/'.env').write_text('synthetic-private-do-not-emit');(root/'private/storage.key').write_text('synthetic-private-do-not-emit');return root
    def test_only_public_kernel_memory_counters_are_opened(self):
        root=self.fixture();opened=[]
        def allowed(file,*args,**kwargs):
            self.assertEqual(str(file),'/proc/meminfo');opened.append(str(file));return io.StringIO('MemAvailable: 1000 kB\n')
        with patch.object(probe,'ROOT',root),patch('builtins.open',side_effect=allowed):r=probe.inspect()
        self.assertEqual(opened,['/proc/meminfo']);self.assertEqual(r['privateFilesOpened'],0);self.assertEqual(r['memAvailableBytes'],1024000);self.assertFalse(r['schemaInspected']);self.assertFalse(r['authorizedToDeploy']);self.assertNotIn('synthetic-private-do-not-emit',json.dumps(r))
    def test_missing_files_are_metadata_absence_not_new_secrets(self):
        root=self.fixture()
        with patch.object(probe,'ROOT',root),patch('builtins.open',return_value=io.StringIO('')):r=probe.inspect()
        row=next(x for x in r['files'] if x['role']=='private/operations.sqlite');self.assertFalse(row['present']);self.assertIsNone(r['memAvailableBytes']);self.assertFalse(r['keyValuesRead'])
    def test_parent_links_block_private_metadata_traversal(self):
        root=self.fixture();original=Path.is_symlink
        with patch.object(probe,'ROOT',root),patch.object(Path,'is_symlink',lambda p:p==root/'private' or original(p)),patch('builtins.open',return_value=io.StringIO('')):r=probe.inspect()
        self.assertTrue(all(x.get('reason')=='parent-link' for x in r['files'] if x['role'].startswith('private/')))
if __name__=='__main__':unittest.main()
