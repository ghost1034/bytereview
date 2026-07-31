"""Local quarantine helpers used before mounting Slack or generated files."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

MAX_BYTES = 50 * 1024 * 1024
ALLOWED = {".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"}
TENANT_UID = int(os.getenv("HOSTED_CLAW_TENANT_UID", "65532"))


class UnsafeArtifact(ValueError):
    pass


def safe_destination(root: Path, filename: str) -> Path:
    if Path(filename).name != filename or Path(filename).suffix.lower() not in ALLOWED:
        raise UnsafeArtifact("Unsupported filename")
    root = root.resolve()
    destination = (root / filename).resolve(strict=False)
    if destination.parent != root:
        raise UnsafeArtifact("Path traversal rejected")
    return destination


def scan_with_clamav(path: Path) -> None:
    stat = path.lstat()
    if path.is_symlink() or not path.is_file():
        raise UnsafeArtifact("Only regular files may enter a tenant workspace")
    if stat.st_size < 1 or stat.st_size > MAX_BYTES:
        raise UnsafeArtifact("File exceeds hosted attachment limits")
    result = subprocess.run(
        ["clamdscan", "--fdpass", "--no-summary", str(path)],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if result.returncode != 0:
        raise UnsafeArtifact("Malware scan rejected the file")


def promote_clean_file(quarantine_path: Path, workspace_root: Path, filename: str) -> Path:
    scan_with_clamav(quarantine_path)
    workspace_root.mkdir(parents=True, exist_ok=True)
    os.chown(workspace_root, TENANT_UID, TENANT_UID)
    os.chmod(workspace_root, 0o700)
    destination = safe_destination(workspace_root, filename)
    os.replace(quarantine_path, destination)
    os.chown(destination, TENANT_UID, TENANT_UID)
    os.chmod(destination, 0o600)
    return destination
