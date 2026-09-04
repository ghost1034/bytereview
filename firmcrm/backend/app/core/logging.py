"""Structured logging. JSON in production (one object per line, ready for any log shipper), text in development.
Every record carries request_id and user_id from context variables set by the request middleware."""

from __future__ import annotations

import contextvars
import logging
import sys

request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
user_id_ctx: contextvars.ContextVar[int | None] = contextvars.ContextVar("user_id", default=None)


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        record.user_id = user_id_ctx.get()
        return True


def configure_logging(level: str = "INFO", fmt: str = "text") -> None:
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(ContextFilter())
    if fmt == "json":
        from pythonjsonlogger.json import JsonFormatter

        handler.setFormatter(JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s %(request_id)s %(user_id)s",
            rename_fields={"asctime": "ts", "levelname": "level", "name": "logger"}, timestamp=False))
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-5s %(name)s [%(request_id)s] %(message)s"))
    root.addHandler(handler)
    root.setLevel(level.upper())
    # Quiet noisy libraries; uvicorn access log is redundant with our request log.
    logging.getLogger("uvicorn.access").disabled = True
    for noisy in ("sqlalchemy.engine", "httpx", "alembic"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
