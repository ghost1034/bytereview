from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def deployment_tools(tmp_path: Path):
    """Exercise the real shell entrypoints without contacting any cloud service."""
    log = tmp_path / "calls.jsonl"
    stub = f"""#!{sys.executable}
import json, os, sys
args = sys.argv[1:]
with open(os.environ['DEPLOY_TEST_LOG'], 'a') as out:
    out.write(json.dumps([os.path.basename(sys.argv[0]), *args]) + '\\n')
if args[:3] == ['run', 'jobs', 'execute'] and args[3] == 'taxatlas-seed':
    sys.exit(int(os.environ.get('DEPLOY_TEST_SEED_EXIT', '0')))
if args[:3] == ['scheduler', 'jobs', 'describe']:
    sys.exit(int(os.environ.get('DEPLOY_TEST_SCHEDULE_EXISTS', '0')))
if args[:2] == ['auth', 'list']:
    print('deployer@example.com')
if args[:3] == ['run', 'services', 'describe']:
    print('https://api.example.com')
"""
    for tool in ("gcloud", "docker"):
        executable = tmp_path / tool
        executable.write_text(stub)
        executable.chmod(0o755)
    env = {
        "PATH": f"{tmp_path}:{os.environ['PATH']}",
        "HOME": str(tmp_path),
        "DEPLOY_TEST_LOG": str(log),
        "PROJECT_ID": "test-project",
        "REGION": "us-central1",
        "HOSTED_CLAW_ENABLED": "false",
        "TAXATLAS_API_IMAGE": "registry/backend:test",
        "TAXATLAS_BROWSER_IMAGE": "registry/taxatlas-browser:test",
    }

    def run(script: str, *args: str, **overrides: str):
        result = subprocess.run(
            ["bash", str(ROOT / "scripts" / script), *args],
            cwd=ROOT,
            env={**env, **overrides},
            text=True,
            capture_output=True,
            timeout=30,
        )
        calls = [json.loads(line) for line in log.read_text().splitlines()]
        return result, calls

    return run


@pytest.mark.parametrize("schedule_exists", ["0", "1"])
def test_jobs_have_runtime_config_and_seed_before_schedules(deployment_tools, schedule_exists):
    result, calls = deployment_tools(
        "deploy-taxatlas-jobs.sh", DEPLOY_TEST_SCHEDULE_EXISTS=schedule_exists
    )
    assert result.returncode == 0, result.stderr
    jobs = [c for c in calls if c[1:4] == ["run", "jobs", "deploy"]]
    assert len(jobs) == 7
    for job in jobs:
        assert "--set-cloudsql-instances=test-project:us-central1:cpaautomation-db" in job
        assert "--vpc-connector=cpa-svpc" in job
        assert "--vpc-egress=private-ranges-only" in job
        assert "--set-secrets=DATABASE_URL=DATABASE_URL:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest" in job
        assert "--tasks=1" in job and "--parallelism=1" in job
        assert any("TAXATLAS_PUBLIC_URL=https://cpaautomation.ai" in arg for arg in job)
    browser = next(c for c in jobs if c[4] == "taxatlas-crawl-browser")
    assert "--image=registry/taxatlas-browser:test" in browser
    assert "--memory=2Gi" in browser and "--cpu=2" in browser
    assert any("TAXATLAS_BROWSER_ENABLED=true" in arg for arg in browser)
    bindings = [c for c in calls if c[1:4] == ["run", "jobs", "add-iam-policy-binding"]]
    assert len(bindings) == 7
    seed = next(i for i, c in enumerate(calls) if c[1:5] == ["run", "jobs", "execute", "taxatlas-seed"])
    action = "update" if schedule_exists == "0" else "create"
    schedules = [(i, c) for i, c in enumerate(calls) if c[1:4] == ["scheduler", "jobs", action]]
    assert len(schedules) == 5
    assert all(i > seed for i, _ in schedules)
    assert all("--oauth-service-account-email=cpaautomation-runner@test-project.iam.gserviceaccount.com" in c for _, c in schedules)


def test_failed_seed_does_not_activate_schedules(deployment_tools):
    result, calls = deployment_tools("deploy-taxatlas-jobs.sh", DEPLOY_TEST_SEED_EXIT="1")
    assert result.returncode != 0
    assert not any(c[1:3] == ["scheduler", "jobs"] for c in calls)


def test_job_deploy_preserves_explicit_shared_runtime_configuration(deployment_tools):
    key = "projects/test-project/locations/us-central1/keyRings/shared/cryptoKeys/tokens"
    secrets = "DATABASE_URL=DATABASE_URL:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,TAXATLAS_SMTP_PASSWORD=SMTP:latest"
    result, calls = deployment_tools(
        "deploy-taxatlas-jobs.sh", KMS_KEY_RESOURCE_NAME=key,
        TAXATLAS_JOB_SECRETS=secrets, VPC_CONNECTOR="custom-vpc",
        TAXATLAS_PUBLIC_URL="https://custom.example.com",
    )
    assert result.returncode == 0, result.stderr
    jobs = [c for c in calls if c[1:4] == ["run", "jobs", "deploy"]]
    for job in jobs:
        assert f"--set-secrets={secrets}" in job
        assert "--vpc-connector=custom-vpc" in job
        assert any(f"KMS_KEY_RESOURCE_NAME={key}" in arg for arg in job)
        assert any("TAXATLAS_PUBLIC_URL=https://custom.example.com" in arg for arg in job)


@pytest.mark.parametrize("target,environment,expected", [
    ("--backend-only", "production", True),
    ("--frontend-only", "production", False),
    ("--backend-only", "staging", False),
])
def test_standard_deploy_includes_jobs_after_migration_only_in_production_backend(
    deployment_tools, target, environment, expected
):
    result, calls = deployment_tools(
        "deploy-services.sh", target, "--skip-build", "--image-tag", "release-test",
        "--environment", environment,
    )
    assert result.returncode == 0, result.stderr
    jobs = [(i, c) for i, c in enumerate(calls) if c[1:4] == ["run", "jobs", "deploy"]]
    assert bool(jobs) is expected
    if expected:
        migration = next(i for i, c in enumerate(calls) if c[1:5] == ["run", "jobs", "execute", "cpa-inkwise-migrate"])
        assert all(i > migration for i, _ in jobs)
        browser = next(c for _, c in jobs if c[4] == "taxatlas-crawl-browser")
        assert "--image=us-central1-docker.pkg.dev/test-project/cpa-docker/taxatlas-browser:release-test" in browser


def test_backend_build_includes_browser_image(deployment_tools):
    result, calls = deployment_tools("build-images.sh", "release-test", "--backend-only")
    assert result.returncode == 0, result.stderr
    builds = [c for c in calls if c[:3] == ["docker", "buildx", "build"]]
    assert len(builds) == 2
    assert any("backend/Dockerfile.taxatlas-browser" in c for c in builds)
    assert all("linux/amd64" in c for c in builds)
