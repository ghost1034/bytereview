from __future__ import annotations

from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SKILL_RELATIVE_PATH = Path("profile/skills/integration-document-analysis/SKILL.md")
REQUIRED_MCP_TOOLS = {
    "list_apps",
    "search_actions",
    "get_action_guide",
    "execute_action",
    "get_document_analysis_options",
    "list_document_analysis_templates",
    "create_document_analysis",
    "prepare_document_uploads",
    "complete_document_uploads",
    "configure_document_analysis",
    "start_document_analysis",
    "get_document_analysis_status",
    "get_document_analysis_results",
}


def _skill(product: str) -> str:
    return (REPO_ROOT / "hermes" / product / SKILL_RELATIVE_PATH).read_text(encoding="utf-8")


def test_both_shipped_claws_include_the_one_prompt_workflow_skill() -> None:
    for product in ("accountingclaw", "legalclaw"):
        content = _skill(product)
        assert "name: integration-document-analysis" in content
        assert "from one natural-language request" in content
        assert "initial prompt is explicit approval" in content
        assert "without asking the user to repeat approval" in content
        for tool_name in REQUIRED_MCP_TOOLS:
            assert f"`{tool_name}`" in content


def test_workflow_skill_covers_transfer_safety_and_completion() -> None:
    content = _skill("accountingclaw")
    assert "Never give an arbitrary external URL" in content
    assert "Do not place document bytes in MCP JSON" in content
    assert "until `has_more=false`" in content
    assert "Never claim completion until the destination action confirms success" in content


def test_accounting_distribution_and_legal_refresh_keep_the_skill() -> None:
    accounting_distribution = (
        REPO_ROOT / "hermes/accountingclaw/profile/distribution.yaml"
    ).read_text(encoding="utf-8")
    legal_importer = (REPO_ROOT / "scripts/import-legalclaw-skills.py").read_text(encoding="utf-8")
    assert "skills/integration-document-analysis/" in accounting_distribution
    assert 'CPAA_MANAGED_SKILLS = {"integration-document-analysis"}' in legal_importer
