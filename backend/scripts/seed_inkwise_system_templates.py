#!/usr/bin/env python3
"""Seed Inkwise system templates from local DOCX files.

By default this script performs a dry run. Pass --apply to write changes.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TypeVar

from dotenv import load_dotenv
from sqlalchemy.exc import OperationalError

# Add backend directory to path
BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(REPO_ROOT / ".env")
load_dotenv()

from core.database import db_config  # noqa: E402
from models.inkwise_models import InkwiseSystemTemplate, InkwiseSystemTemplateCategory  # noqa: E402


DEFAULT_TEMPLATES_ROOT = REPO_ROOT / "inkwise_templates"
DEFAULT_CONVERTER_SCRIPT = BACKEND_DIR / "scripts" / "convert_inkwise_docx.cjs"
DOCX_SUFFIX = ".docx"


@dataclass(frozen=True)
class TemplateInput:
    source_path: Path
    relative_path: Path
    category_name: str
    title: str


@dataclass(frozen=True)
class ConvertedTemplate:
    source: TemplateInput
    content_json: dict[str, Any]
    warnings: list[dict[str, str]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed Inkwise system templates from inkwise_templates DOCX files")
    parser.add_argument("--templates-root", type=Path, default=DEFAULT_TEMPLATES_ROOT)
    parser.add_argument("--converter-script", type=Path, default=DEFAULT_CONVERTER_SCRIPT)
    parser.add_argument("--node-binary", default="node")
    parser.add_argument("--batch-size", type=int, default=25)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--only-category", action="append", default=[])
    parser.add_argument("--apply", action="store_true", help="Write changes to the database")
    return parser.parse_args()


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    return " ".join(normalized.replace("_", " ").split()).strip()


def derive_category_name(relative_path: Path) -> str:
    if len(relative_path.parts) < 2:
        raise ValueError(f"Template path must include a category folder: {relative_path}")
    return _normalize_text(relative_path.parent.name)


def derive_title(relative_path: Path) -> str:
    return _normalize_text(relative_path.stem)


def collect_template_inputs(*, templates_root: Path, only_categories: set[str], limit: int) -> list[TemplateInput]:
    if not templates_root.exists() or not templates_root.is_dir():
        raise FileNotFoundError(f"Templates root not found: {templates_root}")

    template_inputs: list[TemplateInput] = []
    for file_path in sorted(templates_root.rglob(f"*{DOCX_SUFFIX}")):
        if not file_path.is_file() or file_path.name.startswith("."):
            continue
        relative_path = file_path.relative_to(templates_root)
        category_name = derive_category_name(relative_path)
        if only_categories and category_name not in only_categories:
            continue
        template_inputs.append(
            TemplateInput(
                source_path=file_path,
                relative_path=relative_path,
                category_name=category_name,
                title=derive_title(relative_path),
            )
        )
        if limit > 0 and len(template_inputs) >= limit:
            break

    if not template_inputs:
        raise RuntimeError("No DOCX templates matched the requested filters")
    validate_no_duplicate_keys(template_inputs)
    return template_inputs


def validate_no_duplicate_keys(template_inputs: list[TemplateInput]) -> None:
    seen: dict[tuple[str, str], Path] = {}
    duplicates: list[str] = []
    for item in template_inputs:
        key = (item.category_name, item.title)
        previous = seen.get(key)
        if previous is not None:
            duplicates.append(
                f"Duplicate template key category={item.category_name!r} title={item.title!r}: {previous} and {item.relative_path}"
            )
            continue
        seen[key] = item.relative_path
    if duplicates:
        raise RuntimeError("\n".join(duplicates))


T = TypeVar("T")


def chunked(items: list[T], size: int) -> list[list[T]]:
    return [items[index : index + size] for index in range(0, len(items), max(1, size))]


def convert_templates(
    template_inputs: list[TemplateInput], *, node_binary: str, converter_script: Path, batch_size: int
) -> list[ConvertedTemplate]:
    if not converter_script.exists():
        raise FileNotFoundError(f"Converter script not found: {converter_script}")

    converted: list[ConvertedTemplate] = []
    inputs_by_path = {str(item.source_path.resolve()): item for item in template_inputs}
    for batch in chunked(template_inputs, batch_size):
        command = [node_binary, str(converter_script), *[str(item.source_path) for item in batch]]
        result = subprocess.run(
            command,
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "DOCX conversion failed\n"
                f"command: {' '.join(command)}\n"
                f"stdout: {result.stdout.strip()}\n"
                f"stderr: {result.stderr.strip()}"
            )

        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(f"Converter returned invalid JSON: {exc}\n{result.stdout[:1000]}") from exc

        if not isinstance(payload, list):
            raise RuntimeError("Converter payload must be a JSON array")

        for item in payload:
            source_path = str(Path(str(item.get("path") or "")).resolve())
            source = inputs_by_path.get(source_path)
            if source is None:
                raise RuntimeError(f"Converter returned unknown source path: {source_path}")
            content_json = item.get("content_json")
            warnings = item.get("warnings") or []
            validate_content_json(content_json=content_json, source=source)
            converted.append(
                ConvertedTemplate(
                    source=source,
                    content_json=content_json,
                    warnings=[
                        {
                            "type": str(message.get("type") or "warning"),
                            "message": str(message.get("message") or "").strip(),
                        }
                        for message in warnings
                        if str(message.get("message") or "").strip()
                    ],
                )
            )
    return converted


def validate_content_json(*, content_json: Any, source: TemplateInput) -> None:
    if not isinstance(content_json, dict):
        raise RuntimeError(f"Converted content_json is not an object for {source.relative_path}")
    if content_json.get("type") != "doc":
        raise RuntimeError(f"Converted content_json root is not a TipTap doc for {source.relative_path}")


def get_or_create_category(db: Any, *, name: str, apply_changes: bool) -> tuple[InkwiseSystemTemplateCategory, bool]:
    category = db.query(InkwiseSystemTemplateCategory).filter(InkwiseSystemTemplateCategory.name == name).one_or_none()
    if category is not None:
        return category, False
    category = InkwiseSystemTemplateCategory(name=name)
    if apply_changes:
        db.add(category)
        db.commit()
        db.refresh(category)
    return category, True


def get_existing_template_rows(db: Any, *, category_id: int, title: str) -> list[InkwiseSystemTemplate]:
    return (
        db.query(InkwiseSystemTemplate)
        .filter(InkwiseSystemTemplate.category_id == category_id, InkwiseSystemTemplate.title == title)
        .all()
    )


def apply_seed(converted_templates: list[ConvertedTemplate], *, apply_changes: bool) -> dict[str, Any]:
    db = db_config.get_session()
    stats: dict[str, Any] = {
        "db_checked": True,
        "db_error": None,
        "categories_created": 0,
        "categories_existing": 0,
        "templates_created": 0,
        "templates_updated": 0,
        "templates_unchanged": 0,
    }
    category_cache: dict[str, InkwiseSystemTemplateCategory] = {}

    try:
        for item in converted_templates:
            category = category_cache.get(item.source.category_name)
            created_category = False
            if category is None:
                category, created_category = get_or_create_category(
                    db, name=item.source.category_name, apply_changes=apply_changes
                )
                category_cache[item.source.category_name] = category
                stats["categories_created" if created_category else "categories_existing"] += 1

            category_id = int(category.id) if category.id is not None else None
            rows = get_existing_template_rows(db, category_id=category_id, title=item.source.title) if category_id else []
            if len(rows) > 1:
                raise RuntimeError(
                    f"Multiple system templates already exist for category={category.name!r} title={item.source.title!r}"
                )

            description = None
            if not rows:
                stats["templates_created"] += 1
                if apply_changes:
                    if category_id is None:
                        raise RuntimeError(f"Category {category.name!r} was not persisted before template insert")
                    template = InkwiseSystemTemplate(
                        category_id=category_id,
                        title=item.source.title,
                        description=description,
                        content_json=item.content_json,
                    )
                    db.add(template)
                    db.commit()
                continue

            template = rows[0]
            changed = (
                template.description != description
                or template.content_json != item.content_json
            )
            if changed:
                stats["templates_updated"] += 1
                if apply_changes:
                    template.description = description
                    template.content_json = item.content_json
                    db.commit()
            else:
                stats["templates_unchanged"] += 1
    except OperationalError as exc:
        db.rollback()
        if apply_changes:
            raise
        stats["db_checked"] = False
        stats["db_error"] = str(exc)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    return stats


def print_plan(converted_templates: list[ConvertedTemplate], *, apply_changes: bool, stats: dict[str, Any]) -> None:
    categories = sorted({item.source.category_name for item in converted_templates})
    warning_count = sum(len(item.warnings) for item in converted_templates)
    print(f"Mode: {'APPLY' if apply_changes else 'DRY RUN'}")
    print(f"Templates discovered: {len(converted_templates)}")
    print(f"Categories discovered: {len(categories)}")
    print("Category names:")
    for category in categories:
        count = sum(1 for item in converted_templates if item.source.category_name == category)
        print(f"- {category}: {count}")
    print(f"Conversion warnings: {warning_count}")
    if stats.get("db_checked"):
        print("Database summary:")
        print(f"- categories_created: {stats['categories_created']}")
        print(f"- categories_existing: {stats['categories_existing']}")
        print(f"- templates_created: {stats['templates_created']}")
        print(f"- templates_updated: {stats['templates_updated']}")
        print(f"- templates_unchanged: {stats['templates_unchanged']}")
    else:
        print("Database summary: skipped (database connection unavailable during dry run)")
        if stats.get("db_error"):
            print(f"- db_error: {stats['db_error']}")

    if warning_count:
        print("Sample conversion warnings:")
        shown = 0
        for item in converted_templates:
            if not item.warnings:
                continue
            for warning in item.warnings[:3]:
                print(f"- {item.source.relative_path}: [{warning['type']}] {warning['message']}")
                shown += 1
                if shown >= 10:
                    return


def main() -> None:
    args = parse_args()
    only_categories = {_normalize_text(value) for value in args.only_category if _normalize_text(value)}
    template_inputs = collect_template_inputs(
        templates_root=args.templates_root.resolve(),
        only_categories=only_categories,
        limit=max(0, int(args.limit)),
    )
    converted_templates = convert_templates(
        template_inputs,
        node_binary=args.node_binary,
        converter_script=args.converter_script.resolve(),
        batch_size=max(1, int(args.batch_size)),
    )
    stats = apply_seed(converted_templates, apply_changes=bool(args.apply))
    print_plan(converted_templates, apply_changes=bool(args.apply), stats=stats)
    if not args.apply:
        print("No database changes were written. Re-run with --apply to seed production data.")


if __name__ == "__main__":
    main()
