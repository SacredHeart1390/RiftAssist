import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('topology', Path(__file__).with_name('inspect-replacement-topology.py'))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class Inspection(unittest.TestCase):
    def test_inline_auth_values_are_not_emitted(self):
        raw = '{ path=/bin/bash ; argv[]=/bin/bash -c sleep 3 && curl /api/login -d secret-fixture-value && curl /api/start ; }'
        result = probe.exec_shape(raw)
        self.assertNotIn('secret-fixture-value', json.dumps(result))
        self.assertTrue(result['mentionsLoginEndpoint'])
        self.assertTrue(result['mentionsStartEndpoint'])
        self.assertFalse(result['behaviorVerified'])

    def test_caddy_config_is_only_a_sanitized_argument(self):
        result = probe.exec_shape('{ path=/usr/bin/caddy ; argv[]=/usr/bin/caddy run --config /etc/caddy/Caddyfile ; }')
        self.assertEqual(result['configArgument'], '/etc/caddy/Caddyfile')
        self.assertIsNone(probe.exec_shape('--config /etc/caddy/../../private/key')['configArgument'])
        self.assertIsNone(probe.exec_shape('--config $CONFIG')['configArgument'])

    def test_commands_are_fixed_and_environment_free(self):
        with patch.object(probe, 'run', return_value=None) as run:
            result = probe.inspect()
            self.assertEqual(run.call_count, 6)
            for call in run.call_args_list:
                self.assertNotIn('Environment', ' '.join(call.args[0]))
            self.assertTrue(result['readOnly'])

    def test_sensitive_unrecognized_fields_and_stderr_are_excluded(self):
        raw = 'LoadState=loaded\nEnvironment=secret-fixture-value\nWorkingDirectory=secret-fixture-value\nUser=azureuser\nExecStart={ path=/bin/sh ; argv[]=/bin/sh -c echo secret-fixture-value ; }\n'
        with patch.object(probe, 'run', return_value=raw):
            value = json.dumps(probe.inspect())
            self.assertNotIn('secret-fixture-value', value)


if __name__ == '__main__':
    unittest.main()
