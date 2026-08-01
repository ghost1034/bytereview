"""Fail-closed Hermes pre_tool_call policy for hosted runtimes."""

from __future__ import annotations

import json
import os
import time
import urllib.request

READ_ONLY_TOOLS = {
    "list_apps", "search_actions", "get_action_guide",
    "get_document_analysis_options", "list_document_analysis_templates",
    "list_document_analyses", "get_document_analysis_status",
    "get_document_analysis_results", "read_file", "list_files", "search_files",
    # Hermes' skill reader only returns the contents of an already-installed
    # skill. It cannot install, edit, enable, or remove skills.
    "skill_view",
}
APPROVAL_TOOLS = {
    "execute_action", "create_document_analysis", "prepare_document_uploads",
    "complete_document_uploads", "configure_document_analysis",
    "start_document_analysis", "export", "send_file", "upload_file",
    "skill_manage", "write_file", "patch",
}
READ_ONLY_TERMINAL_PREFIXES = (
    "pwd", "ls", "rg ", "grep ", "head ", "tail ", "wc ", "stat ",
    "file ", "du ", "df ", "sed -n ",
)
UNSAFE_SHELL_FRAGMENTS = (";", "&&", "||", "|", ">", "<", "`", "$(", "\n", "\r")


def _approval(tool_name: str, args: dict, task_id: str) -> dict:
    url = os.environ.get("HOSTED_APPROVAL_URL", "")
    if not url:
        return {"action": "block", "message": "Hosted approval service is unavailable."}
    action_id = str(args.get("actionId") or tool_name)
    payload = json.dumps({
        "run_id": task_id or "unknown",
        "action_id": action_id,
        "arguments": args,
    }).encode("utf-8")
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        try:
            request = urllib.request.Request(
                url,
                data=payload,
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=15) as response:
                decision = json.loads(response.read())
        except Exception:
            return {"action": "block", "message": "Hosted approval check failed closed."}
        if decision.get("status") == "approved" and decision.get("grant"):
            # Hermes passes the same args object onward to the MCP dispatcher.
            # These fields never came from the model and are stripped by the
            # connector before hashing or executing the actual action.
            if args.get("actionId") or tool_name in {
                "create_document_analysis", "prepare_document_uploads",
                "complete_document_uploads", "configure_document_analysis",
                "start_document_analysis",
            }:
                args["_hosted_run_id"] = task_id or "unknown"
                args["_hosted_approval_grant"] = decision["grant"]
            return None
        if decision.get("status") == "not_required":
            return None
        if decision.get("status") in {"denied", "expired", "consumed"}:
            return {"action": "block", "message": "The linked user denied or did not approve this action."}
        time.sleep(2)
    return {"action": "block", "message": "Hosted approval expired."}


def pre_tool_call(tool_name: str, args: dict, task_id: str = "", **kwargs):
    del kwargs
    try:
        normalized = str(tool_name).rsplit("__", 1)[-1].rsplit(".", 1)[-1]
        if normalized in READ_ONLY_TOOLS:
            return None
        if normalized in {"terminal", "shell", "bash"}:
            command = str((args or {}).get("command") or "").strip().lower()
            if command and command.startswith(READ_ONLY_TERMINAL_PREFIXES) and not any(
                fragment in command for fragment in UNSAFE_SHELL_FRAGMENTS
            ):
                return None
            return _approval(normalized, args or {}, task_id)
        if normalized in APPROVAL_TOOLS or (args or {}).get("actionId") or "export" in normalized:
            return _approval(normalized or "unknown", args or {}, task_id)
        # The hosted profile is intentionally allowlist-based. Hermes and MCP
        # servers may add tools independently of this image, so a tool that is
        # not explicitly classified read-only must never inherit read access by
        # accident; require the same short-lived Slack approval as a write.
        return _approval(normalized or "unknown", args or {}, task_id)
    except Exception:
        return {"action": "block", "message": "Hosted policy failed closed."}


def register(ctx):
    ctx.register_hook("pre_tool_call", pre_tool_call)
