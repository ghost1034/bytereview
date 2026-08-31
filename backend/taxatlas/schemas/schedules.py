from datetime import datetime
from typing import Literal

from pydantic import Field

from taxatlas.schemas.common import UTCDatetimes


class JobScheduleOut(UTCDatetimes):
    job: str
    adapters: list[str]
    schedule_cron: str
    timezone: str
    label: str
    next_run_at: datetime | None = Field(
        description="Next scheduled batch trigger, not the start time of an individual source."
    )


class SourceSchedulesOut(UTCDatetimes):
    mode: Literal["cloud_run", "manual"]
    jobs: list[JobScheduleOut]
