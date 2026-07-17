from __future__ import annotations

import os
import unittest
from unittest.mock import patch

os.environ.setdefault("DATABASE_URL", "sqlite://")

from services.connector_service import ConnectorService


class ConnectorServiceConfigurationTests(unittest.TestCase):
    def test_connector_secrets_ignore_surrounding_whitespace(self) -> None:
        service = ConnectorService()

        with patch.dict(
            os.environ,
            {
                "OPENCONNECTOR_URL": " https://connect.cpaautomation.ai/\n",
                "OPENCONNECTOR_RUNTIME_TOKEN": " runtime-token\n",
                "OPENCONNECTOR_ADMIN_TOKEN": " admin-token\n",
            },
        ):
            self.assertEqual(service.base_url, "https://connect.cpaautomation.ai")
            self.assertEqual(service._runtime_token, "runtime-token")
            self.assertEqual(service._admin_token, "admin-token")
            self.assertTrue(service.is_configured())


if __name__ == "__main__":
    unittest.main()
