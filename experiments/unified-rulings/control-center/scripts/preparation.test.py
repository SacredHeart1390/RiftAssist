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
    def test_new_scope_is_separate_from_the_approved_original_probes_and_defaults_to_blocked(self):
        s=(ROOT/'scripts/Invoke-AdditionalInspection.ps1').read_text()
        digest=hashlib.sha256((ROOT/'staging/inspect-release-blockers.py').read_bytes()).hexdigest()
        self.assertIn(digest,s)
        self.assertIn("[switch]$Approved",s)
        self.assertLess(s.index("if($Mode -eq 'Inspect' -and !$Approved)"),s.index('$ssh=Join-Path'))
        self.assertIn('StrictHostKeyChecking=yes',s)
        self.assertNotIn('inspect-release-blockers.py',(ROOT/'scripts/Invoke-ReleasePreparation.ps1').read_text())
    def test_console_is_literal_and_uses_current_directory_without_executing_a_script_file(self):
        s=(ROOT/'INSPECT-CONSOLE.txt').read_text()
        self.assertIn('function Invoke-RiftAssistPredeploymentInspection',s)
        self.assertIn('[string]$PackageDirectory=(Get-Location).Path',s)
        self.assertIn('Invoke-RiftAssistPredeploymentInspection -Mode Verify',s)
        self.assertNotIn('Invoke-Expression',s)
        self.assertNotIn('Set-ExecutionPolicy',s)
        self.assertNotIn('ScriptBlock]::Create',s)
        self.assertNotIn('ExecutionPolicy Bypass',s)
        self.assertIn('3fce265ce5d45dec329f79f31a4b08122b84bd37bc32240a25f2ce2dfc7c328a',s)
if __name__=='__main__':unittest.main()
