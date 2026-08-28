"""Start namespaced TaxAtlas Cloud Run Jobs for administrator crawl requests."""

from __future__ import annotations

import os

from core.runtime import is_production


def job_for_adapter(adapter: str) -> str:
    if adapter == "browser":
        return "crawl-browser"
    if adapter == "news":
        return "crawl-news"
    if adapter == "rates_table":
        return "rates-watch"
    return "crawl"


def start_job(job: str) -> str:
    if not is_production():
        return "local"
    project = os.environ["GOOGLE_CLOUD_PROJECT_ID"]
    region = os.getenv("CLOUD_RUN_REGION") or os.getenv("GOOGLE_CLOUD_REGION", "us-central1")
    env_name = f"TAXATLAS_{job.upper().replace('-', '_')}_JOB"
    job_name = os.getenv(env_name, f"taxatlas-{job}")
    from google.cloud import run_v2

    name = f"projects/{project}/locations/{region}/jobs/{job_name}"
    operation = run_v2.JobsClient().run_job(name=name)
    return operation.operation.name
