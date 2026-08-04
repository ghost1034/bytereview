"""Local quarantine helpers used before mounting Slack or generated files."""

from __future__ import annotations

import os
import stat
import subprocess
import zipfile
from pathlib import Path

MAX_BYTES = 50 * 1024 * 1024
ALLOWED = {".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg", ".zip"}
ARCHIVE_ALLOWED = {".pdf", ".docx", ".pptx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"}
MAX_ARCHIVE_FILES = 200
MAX_ARCHIVE_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
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
        # Stream through the mounted daemon socket. The host daemon cannot
        # traverse tenant-private directories, and file-descriptor passing is
        # rejected across the container confinement boundary.
        ["clamdscan", "--stream", "--no-summary", str(path)],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if result.returncode != 0:
        raise UnsafeArtifact("Malware scan rejected the file")


def validate_zip_archive(path: Path) -> None:
    """Reject traversal, links, nested archives, and expansion bombs."""
    try:
        with zipfile.ZipFile(path, "r") as archive:
            members = [member for member in archive.infolist() if not member.is_dir()]
            if not members or len(members) > MAX_ARCHIVE_FILES:
                raise UnsafeArtifact("ZIP file count is outside hosted limits")
            total_size = 0
            for member in members:
                member_path = Path(member.filename)
                mode = member.external_attr >> 16
                if (
                    member.flag_bits & 0x1
                    or member_path.is_absolute()
                    or ".." in member_path.parts
                    or "\\" in member.filename
                    or stat.S_ISLNK(mode)
                    or member_path.suffix.lower() not in ARCHIVE_ALLOWED
                ):
                    raise UnsafeArtifact("ZIP contains an unsafe member")
                total_size += member.file_size
                if total_size > MAX_ARCHIVE_UNCOMPRESSED_BYTES:
                    raise UnsafeArtifact("ZIP expands beyond hosted limits")
            bad_member = archive.testzip()
            if bad_member is not None:
                raise UnsafeArtifact("ZIP integrity check failed")
    except (zipfile.BadZipFile, OSError) as exc:
        raise UnsafeArtifact("Invalid ZIP archive") from exc


def promote_clean_file(quarantine_path: Path, workspace_root: Path, filename: str) -> Path:
    scan_with_clamav(quarantine_path)
    if quarantine_path.suffix.lower() == ".zip":
        validate_zip_archive(quarantine_path)
    workspace_root.mkdir(parents=True, exist_ok=True)
    os.chown(workspace_root, TENANT_UID, TENANT_UID)
    os.chmod(workspace_root, 0o700)
    destination = safe_destination(workspace_root, filename)
    os.replace(quarantine_path, destination)
    os.chown(destination, TENANT_UID, TENANT_UID)
    os.chmod(destination, 0o600)
    return destination
