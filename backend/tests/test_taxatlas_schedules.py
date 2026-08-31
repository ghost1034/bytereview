from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from taxatlas.api.deps import get_principal
from taxatlas.api.v1.sources import router
from taxatlas.cloud_jobs import job_for_adapter
from taxatlas.jobs import ADAPTERS
from taxatlas.schedules import JOB_SCHEDULES, schedule_for_adapter


@pytest.mark.parametrize("schedule", [s for s in JOB_SCHEDULES if s.adapters], ids=lambda s: s.job)
def test_every_crawl_repeats_after_exactly_24_hours_including_dst(schedule):
    now = datetime(2026, 11, 1, 0, 30, tzinfo=ZoneInfo("America/Los_Angeles"))
    upcoming = schedule.next_run(now)
    following = schedule.next_run(upcoming)
    assert now < upcoming <= now.astimezone(UTC) + timedelta(days=1)
    assert upcoming.tzinfo == UTC
    assert following - upcoming == timedelta(hours=24)
    assert (upcoming.hour, upcoming.minute, upcoming.second) == (schedule.hour, schedule.minute, 0)


def test_notification_dispatch_remains_every_minute():
    schedule = next(s for s in JOB_SCHEDULES if s.job == "dispatch")
    assert schedule.cron == "* * * * *"
    assert schedule.next_run(datetime(2026, 8, 31, 23, 59, 59, tzinfo=UTC)) == datetime(2026, 9, 1, tzinfo=UTC)


def test_schedule_and_manual_job_routing_cover_every_worker_adapter():
    for job, adapters in ADAPTERS.items():
        for adapter in adapters:
            assert schedule_for_adapter(adapter).job == job
            assert job_for_adapter(adapter) == job
    assert schedule_for_adapter("unknown") is None


@pytest.mark.parametrize("environment,mode", [("production", "cloud_run"), ("local", "manual")])
def test_schedule_endpoint_reports_effective_batches_without_source_crons(monkeypatch, environment, mode):
    monkeypatch.setenv("ENVIRONMENT", environment)
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_principal] = lambda: object()
    # Exercise routing as well as serialization: /schedules must not resolve as a source ID.
    with TestClient(app) as client:
        response = client.get("/sources/schedules")
    assert response.status_code == 200
    body = response.json()
    assert body["mode"] == mode
    assert len(body["jobs"]) == 5
    for job, schedule in zip(body["jobs"], JOB_SCHEDULES):
        assert job["schedule_cron"] == schedule.cron
        assert job["adapters"] == list(schedule.adapters)
        assert job["timezone"] == "UTC"
        assert job["label"] == schedule.label
        assert (job["next_run_at"] is not None) == (mode == "cloud_run")
        if job["next_run_at"]:
            assert datetime.fromisoformat(job["next_run_at"]).utcoffset() == timedelta(0)


def test_schedule_endpoint_keeps_source_authentication():
    def deny():
        raise HTTPException(status_code=401)

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_principal] = deny
    with TestClient(app) as client:
        assert client.get("/sources/schedules").status_code == 401
