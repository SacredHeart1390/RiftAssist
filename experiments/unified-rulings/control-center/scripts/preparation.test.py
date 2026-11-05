"""Offline inspection wrapper contract; no shell or SSH execution."""
import hashlib
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
class Preparation(unittest.TestCase):
    def test_approved_sources_are_identical_to_the_approved_git_commit(self):
        for name, digest in [('inspect-replacement-topology.py','6d0a68ff75eeccc45235d5607b72704ef9079f159d94f1fc52bf74acd36cbfa1'),('inspect-legacy-source.py','5d353f19ff44ff1218ddfdc5b09e4fa5a2126f29c6fa24fc9404cb56d2a98166')]:
            self.assertEqual(hashlib.sha256((ROOT/'staging'/name).read_bytes()).hexdigest(), digest)
            # Hashes are fixed here rather than requiring deep Git history in CI.
            self.assertIn(digest, (ROOT/'scripts/Invoke-ReleasePreparation.ps1').read_text())
    def test_both_sources_precede_ssh_and_only_two_readonly_modes_exist(self):
        s=(ROOT/'scripts/Invoke-ReleasePreparation.ps1').read_text()
        self.assertLess(s.index('foreach($check in $checks)'),s.index('$ssh=Join-Path'))
        self.assertLess(s.index("if($Mode -eq 'Verify')"),s.index('$ssh=Join-Path'))
        self.assertIn("[ValidateSet('Verify','Inspect')]",s)
        self.assertIn('StrictHostKeyChecking=yes',s)
        self.assertNotIn('StrictHostKeyChecking=no',s)
        self.assertEqual(s.count("'python3 -B -'"),1)
        self.assertNotIn('Start-Transcript',s)
        self.assertNotIn('Set-Content',s)
        self.assertNotIn('sudo ',s)
if __name__=='__main__':unittest.main()
