from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
BUILD_SCRIPT = REPO_ROOT / "scripts" / "build-hosted-claw-images.sh"
REMOTE_SCRIPT = REPO_ROOT / "infra" / "hosted-claw" / "deploy-images.sh"
SERVICE_DEPLOY_SCRIPT = REPO_ROOT / "scripts" / "deploy-services.sh"
DIGEST = "sha256:" + ("a" * 64)


def _write_executable(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")
    path.chmod(0o755)


class HostedClawReleaseScriptTests(unittest.TestCase):
    def test_release_smoke_and_dispatcher_are_fail_closed_for_native_cron(self) -> None:
        remote = REMOTE_SCRIPT.read_text(encoding="utf-8")
        service_deploy = SERVICE_DEPLOY_SCRIPT.read_text(encoding="utf-8")
        self.assertIn("load_cron_scheduler('cpaa-hosted')", remote)
        self.assertIn('smoke_native_cron "$accounting_image"', remote)
        self.assertIn('smoke_native_cron "$legal_image"', remote)
        self.assertIn('scheduler_name="hosted-claw-cron-dispatch"', service_deploy)
        self.assertIn('--schedule="* * * * *"', service_deploy)
        self.assertIn('--oidc-service-account-email="$HOSTED_CLAW_WORKER_SERVICE_ACCOUNT"', service_deploy)
        self.assertIn("configure-cron-monitoring.sh", service_deploy)

    def test_build_only_uses_source_controlled_pinned_bases_for_all_images(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            docker_log = tmp_path / "docker.log"
            _write_executable(
                tmp_path / "gcloud",
                """#!/usr/bin/env bash
set -eu
case "$*" in
  "auth list"*) echo "release@example.com" ;;
  *) ;;
esac
""",
            )
            _write_executable(
                tmp_path / "docker",
                f"#!/usr/bin/env bash\nprintf '%s\\n' \"$*\" >> \"{docker_log}\"\n",
            )
            env = os.environ.copy()
            env["PATH"] = f"{tmp_path}:{env['PATH']}"
            result = subprocess.run(
                [str(BUILD_SCRIPT), "--build-only", "--image-tag", "release-test"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            calls = docker_log.read_text(encoding="utf-8")
            self.assertEqual(calls.count("buildx build"), 4)
            self.assertIn("nousresearch/hermes-agent@sha256:", calls)
            self.assertIn("PYTHON_BASE_IMAGE=python@sha256:", calls)
            self.assertIn("CADDY_BASE_IMAGE=caddy@sha256:", calls)

    def test_deploy_only_resolves_digests_discovers_worker_and_invokes_remote_helper(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            log = tmp_path / "gcloud.log"
            _write_executable(
                tmp_path / "gcloud",
                f"""#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "{log}"
case "$*" in
  "auth list"*) echo "release@example.com" ;;
  *"artifacts docker images describe"*) echo "{DIGEST}" ;;
  *"compute instance-groups managed list-instances"*) echo "hosted-worker-1" ;;
  *"compute scp"*) ;;
  *"compute ssh"*) ;;
  *"compute instance-groups managed describe"*) echo "True" ;;
  *) echo "Unexpected gcloud invocation: $*" >&2; exit 1 ;;
esac
""",
            )
            env = os.environ.copy()
            env["PATH"] = f"{tmp_path}:{env['PATH']}"
            result = subprocess.run(
                [str(BUILD_SCRIPT), "--deploy-only", "--image-tag", "release-test"],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            calls = log.read_text(encoding="utf-8")
            self.assertIn("compute instance-groups managed list-instances", calls)
            self.assertIn("compute scp", calls)
            self.assertIn("compute ssh", calls)
            self.assertIn(f"hosted-supervisor@{DIGEST}", result.stdout)

    def test_remote_deploy_updates_images_and_keeps_rollback_backup(self) -> None:
        self._run_remote_deploy(expect_success=True)

    def test_remote_deploy_restores_environment_when_smoke_check_fails(self) -> None:
        self._run_remote_deploy(expect_success=False)

    def _run_remote_deploy(self, *, expect_success: bool) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            control_root = tmp_path / "control"
            control_root.mkdir()
            (control_root / "active-turns").write_text("0\n", encoding="ascii")
            env_file = tmp_path / "worker.env"
            original = (
                "HOSTED_CLAW_SUPERVISOR_IMAGE=old-supervisor\n"
                "HOSTED_ACCOUNTINGCLAW_IMAGE=old-accounting\n"
                "HOSTED_LEGALCLAW_IMAGE=old-legal\n"
                "HOSTED_CLAW_PROXY_IMAGE=old-proxy\n"
                "SECRET_VALUE=preserved\n"
            )
            env_file.write_text(original, encoding="utf-8")

            supervisor = "registry/hosted-supervisor@sha256:" + ("1" * 64)
            accounting = "registry/hosted-accountingclaw@sha256:" + ("2" * 64)
            legal = "registry/hosted-legalclaw@sha256:" + ("3" * 64)
            proxy = "registry/hosted-proxy@sha256:" + ("4" * 64)
            _write_executable(
                tmp_path / "docker",
                """#!/usr/bin/env bash
set -eu
if [ "$1" = inspect ]; then
  printf '%s\n' "$MOCK_SUPERVISOR_IMAGE"
elif [ "$1" = run ] && [ "${MOCK_FAIL_RUN:-false}" = true ]; then
  exit 1
fi
""",
            )
            _write_executable(tmp_path / "systemctl", "#!/usr/bin/env bash\nexit 0\n")
            env = os.environ.copy()
            env.update(
                {
                    "HOSTED_CLAW_ENV_FILE": str(env_file),
                    "HOSTED_CLAW_CONTROL_ROOT": str(control_root),
                    "DOCKER_BIN": str(tmp_path / "docker"),
                    "SYSTEMCTL_BIN": str(tmp_path / "systemctl"),
                    "MOCK_SUPERVISOR_IMAGE": supervisor,
                    "MOCK_FAIL_RUN": "false" if expect_success else "true",
                }
            )
            result = subprocess.run(
                [
                    str(REMOTE_SCRIPT),
                    "release-test",
                    supervisor,
                    accounting,
                    legal,
                    proxy,
                    "5",
                ],
                cwd=REPO_ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )

            backups = list(tmp_path.glob("worker.env.pre-release-test-*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual(backups[0].read_text(encoding="utf-8"), original)
            self.assertFalse((control_root / "deploy-drain").exists())
            if expect_success:
                self.assertEqual(result.returncode, 0, result.stderr)
                deployed = env_file.read_text(encoding="utf-8")
                self.assertIn(f"HOSTED_CLAW_SUPERVISOR_IMAGE={supervisor}", deployed)
                self.assertIn(f"HOSTED_ACCOUNTINGCLAW_IMAGE={accounting}", deployed)
                self.assertIn("SECRET_VALUE=preserved", deployed)
            else:
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(env_file.read_text(encoding="utf-8"), original)


if __name__ == "__main__":
    unittest.main()
