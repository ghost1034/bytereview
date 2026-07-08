#!/usr/bin/env python3
"""Imports the LegalClaw skills from HHHHHejia/awesome-legal-aiagent-skills.

Regenerates hermes/legalclaw/profile/skills/ from a checkout of the source
repo, converting each task's SKILL.md frontmatter (Parthenon format: name,
task_id, description, activates_for) into the Hermes skill format used by the
Claw Series profiles. Archived skill revisions (SKILL_v0.md / SKILL_v1.md) and
the repo's _template are not imported; skill bodies are kept verbatim.

Usage:
  python3 scripts/import-legalclaw-skills.py [--source <checkout-dir>]

Without --source, the pinned commit is cloned into a temp dir first.
"""
import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

SOURCE_REPO = "https://github.com/HHHHHejia/awesome-legal-aiagent-skills.git"
# Pin the import so re-runs are reproducible; bump deliberately to take updates.
SOURCE_COMMIT = "19c01cd63fc9f204bd53bdab6da3724e47437add"
DEST = pathlib.Path(__file__).resolve().parent.parent / "hermes/legalclaw/profile/skills"

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.S)


def parse_frontmatter(text: str) -> dict:
    match = FRONTMATTER_RE.match(text)
    if not match:
        raise ValueError("missing frontmatter")
    fields = {}
    for line in match.group(1).splitlines():
        m = re.match(r"^([a-z_]+):\s*(.*)$", line)
        if m:
            fields[m.group(1)] = m.group(2).strip()
    return fields


def load_skills(source: pathlib.Path) -> list[dict]:
    skills = []
    for path in sorted(source.glob("**/SKILL.md")):
        parts = path.relative_to(source).parts
        if parts[0] in ("_template", ".git"):
            continue
        text = path.read_text(encoding="utf-8")
        fm = parse_frontmatter(text)
        body = FRONTMATTER_RE.sub("", text, count=1).lstrip("\n")
        task_id = fm.get("task_id") or "/".join(parts[:-1])
        skills.append(
            {
                "name": fm["name"],
                "task_id": task_id,
                "area": task_id.split("/")[0],
                "description": fm["description"],
                "body": body,
            }
        )
    return skills


def assign_slugs(skills: list[dict]) -> None:
    """Prefer the source's skill name; fall back to the full task_id path for
    the handful of names that collide across practice areas (or are literal
    scenario-NN labels)."""
    counts = {}
    for skill in skills:
        counts[skill["name"]] = counts.get(skill["name"], 0) + 1
    for skill in skills:
        name = skill["name"]
        if counts[name] > 1 or re.fullmatch(r"scenario-\d+", name):
            skill["slug"] = skill["task_id"].replace("/", "--")
        else:
            skill["slug"] = name
    slugs = [s["slug"] for s in skills]
    dupes = {s for s in slugs if slugs.count(s) > 1}
    if dupes:
        raise SystemExit(f"slug collisions after fallback: {sorted(dupes)}")


def render_skill(skill: dict) -> str:
    return (
        "---\n"
        f"name: {skill['slug']}\n"
        f"description: {json.dumps(skill['description'])}\n"
        "version: 0.1.0\n"
        "platforms: [linux]\n"
        "metadata:\n"
        "  hermes:\n"
        f"    tags: [legal, {skill['area']}]\n"
        "    category: legal\n"
        f"    source_task: {skill['task_id']}\n"
        "required_environment_variables:\n"
        "  - name: CPAA_ACTIVATION_KEY\n"
        "    prompt: CPAAutomation.ai activation key\n"
        "    required_for: premium skill access\n"
        "---\n\n"
        f"{skill['body']}"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=pathlib.Path, help="existing checkout of the source repo")
    args = parser.parse_args()

    tmp = None
    source = args.source
    if source is None:
        tmp = tempfile.mkdtemp(prefix="legalclaw-skills-")
        source = pathlib.Path(tmp)
        subprocess.run(["git", "clone", SOURCE_REPO, str(source)], check=True)
        subprocess.run(["git", "-C", str(source), "checkout", SOURCE_COMMIT], check=True)

    try:
        skills = load_skills(source)
        if len(skills) < 1000:
            raise SystemExit(f"expected 1000+ skills, found {len(skills)} — wrong source dir?")
        assign_slugs(skills)

        if DEST.exists():
            shutil.rmtree(DEST)
        for skill in skills:
            skill_dir = DEST / skill["slug"]
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").write_text(render_skill(skill), encoding="utf-8")

        areas = {}
        for skill in skills:
            areas[skill["area"]] = areas.get(skill["area"], 0) + 1
        print(f"Imported {len(skills)} skills into {DEST}")
        for area, count in sorted(areas.items(), key=lambda kv: -kv[1]):
            print(f"  {count:4d}  {area}")
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
