"""Real file/pin/bootstrap checks in a mapped temporary POSIX namespace.

Only the already-tested Node installer/probe subprocess boundary is mocked.
No actual system directory, service, private data or network is used.
"""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch


@unittest.skipUnless(os.name == "posix", "POSIX permission checks run on Ubuntu")
class Bootstrap(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="riftassist-bootstrap-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.site = "12345678-1234-1234-1234-123456789012"
        self.upload = self.root / "home" / ("riftassist-code-" + self.site)
        self.upload.mkdir(parents=True)
        self.code = self.upload / "capsule"
        self.code.mkdir()
        (self.code / "INSTALLATION-PLAN.json").write_text("synthetic plan")
        self.knowledge = self.upload / "knowledge/knowledge-releases"
        self.knowledge.mkdir(parents=True)
        (self.knowledge / "active.json").write_text('{"releaseId":"synthetic"}')
        self.profile = {"siteId": self.site, "root": str(self.root / "sites" / self.site),
                        "candidateData": str(self.root / "sites" / self.site / "data/v0.2.0"),
                        "knowledgeHash": "a" * 64}
        self.inventory = self.upload / "inventory.json"
        self.inventory.write_text(json.dumps(self.profile))
        digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
        self.packet = {"siteId": self.site, "inventoryHash": "b" * 64,
                       "inventoryFileSha256": digest(self.inventory), "planSha256": "c" * 64,
                       "capsuleFiles": {"INSTALLATION-PLAN.json": digest(self.code / "INSTALLATION-PLAN.json")},
                       "knowledgeFiles": {"knowledge-releases/active.json": digest(self.knowledge / "active.json")}}
        self.calls = []
        self.source = Path(__file__).with_name("one-shot-install.py").read_text()
        for old, new in [("/home/azureuser/riftassist-code-", str(self.root / "home/riftassist-code-")),
                         ("/var/lib/riftassist-replacement-upload", str(self.root / "upload")),
                         ("/etc/riftassist-replacement", str(self.root / "etc")),
                         ("/var/lib/riftassist-replacement/", str(self.root / "sites") + "/")]:
            self.source = self.source.replace(old, new)
        self.source = self.source.replace("root != root.parent", "root != Path(" + repr(str(self.root)) + ")")
        self.source = self.source.replace("meta.st_uid == 0", "meta.st_uid == os.getuid()")
        self.source = self.source.replace("os.geteuid() == 0", "os.geteuid() == os.getuid()")

    def process(self, args, **kwargs):
        self.calls.append(args)
        self.assertEqual(kwargs["env"], {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"})
        self.assertTrue(kwargs["capture_output"])
        if args[2].endswith("install-code.cjs"):
            Path(self.profile["candidateData"]).mkdir(parents=True)
        receipt = {"siteId": self.site, "inventoryHash": self.packet["inventoryHash"],
                   "sourceReady": True, "codeOnlyInstalled": True,
                   "rollbackReferenceHash": "d" * 64, "serviceChanged": False,
                   "caddyChanged": False, "operationalDataRead": False, "activePointerChanged": False}
        return types.SimpleNamespace(stdout=json.dumps(receipt).encode())

    def execute(self):
        out = io.StringIO()
        with patch("subprocess.run", self.process), contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
            try:
                exec(compile(self.source, "pinned-bootstrap-fixture", "exec"), {"INPUT": self.packet})
                return 0, out.getvalue()
            except SystemExit as error:
                return error.code, out.getvalue()

    def test_new_code_inventory_and_knowledge_only(self):
        code, out = self.execute()
        self.assertEqual(code, 0)
        self.assertFalse(json.loads(out)["operationalDataRead"])
        self.assertEqual(len(self.calls), 2)
        self.assertTrue((Path(self.profile["candidateData"]) / "knowledge-releases/active.json").is_file())

    def test_tampered_capsule_never_executes_node(self):
        (self.code / "INSTALLATION-PLAN.json").write_text("changed")
        self.assertEqual(self.execute()[0], 1)
        self.assertEqual(self.calls, [])

    def test_unexpected_symlink_and_hardlink_never_followed(self):
        for name, create in [("link", lambda p: p.symlink_to(self.inventory)),
                             ("hard", lambda p: os.link(self.inventory, p))]:
            file = self.code / name
            create(file)
            try:
                self.assertEqual(self.execute()[0], 1)
                self.assertEqual(self.calls, [])
            finally:
                file.unlink()

    def test_existing_inventory_is_never_overwritten(self):
        file = self.root / "etc/inventory.json"
        file.parent.mkdir()
        file.write_text("existing unrelated configuration")
        self.assertEqual(self.execute()[0], 1)
        self.assertEqual(file.read_text(), "existing unrelated configuration")
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
