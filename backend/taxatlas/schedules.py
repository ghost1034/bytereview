"""Shared recurring-job schedule for deployment, workers, and the monitoring API.

Run this file directly to emit scheduler ID, cron, timezone, and Cloud Run job
as tab-separated deployment input. Keep it independent of application imports.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta


@dataclass(frozen=True)
class JobSchedule:
    job: str
    scheduler_id: str
    adapters: tuple[str, ...]
    hour: int | None
    minute: int = 0
    timezone: str = "UTC"

    @property
    def cron(self) -> str:
        return "* * * * *" if self.hour is None else f"{self.minute} {self.hour} * * *"

    @property
    def label(self) -> str:
        if self.hour is None:
            return "Every minute"
        return f"Daily at {self.hour:02d}:{self.minute:02d} UTC"

    def next_run(self, now: datetime) -> datetime:
        now = now.astimezone(UTC)
        if self.hour is None:
            return now.replace(second=0, microsecond=0) + timedelta(minutes=1)
        candidate = now.replace(hour=self.hour, minute=self.minute, second=0, microsecond=0)
        return candidate if candidate > now else candidate + timedelta(days=1)


# Retain the deployed Scheduler resource IDs so upgrades update existing jobs
# instead of leaving the old hourly/six-hourly/weekly triggers active as well.
JOB_SCHEDULES = (
    JobSchedule("crawl", "taxatlas-crawl-hourly", ("rss", "html", "json", "fixture"), 0),
    JobSchedule("crawl-news", "taxatlas-news-six-hourly", ("news",), 0, 10),
    JobSchedule("crawl-browser", "taxatlas-browser-six-hourly", ("browser",), 0, 25),
    JobSchedule("rates-watch", "taxatlas-rate-watch-weekly", ("rates_table",), 3, 40),
    JobSchedule("dispatch", "taxatlas-dispatch-minute", (), None),
)


def schedule_for_adapter(adapter: str) -> JobSchedule | None:
    return next((schedule for schedule in JOB_SCHEDULES if adapter in schedule.adapters), None)


if __name__ == "__main__":
    for schedule in JOB_SCHEDULES:
        print(f"{schedule.scheduler_id}\t{schedule.cron}\t{schedule.timezone}\ttaxatlas-{schedule.job}")
