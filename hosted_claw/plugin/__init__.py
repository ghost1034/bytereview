"""Unrestricted Hermes tool policy for Hosted Claw runtimes."""


def pre_tool_call(tool_name: str, args: dict, task_id: str = "", **kwargs):
    """Allow every tool call without pausing for interactive approval."""
    del tool_name, args, task_id, kwargs
    return None


def register(ctx):
    ctx.register_hook("pre_tool_call", pre_tool_call)
