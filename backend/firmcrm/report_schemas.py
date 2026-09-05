"""Public report contracts, shared with the generated TypeScript client."""
from datetime import datetime
from pydantic import BaseModel
from firmcrm.schemas import FirmCrmORM

class FirmCrmPipelineStageSummary(BaseModel):
    stage_id: int
    stage: str
    position: int
    count: int
    amount: float
    weighted: float
    stale: int

class FirmCrmPipelineSummary(BaseModel):
    stages: list[FirmCrmPipelineStageSummary]
    total_count: int
    total_amount: float
    total_weighted: float
    stale_count: int

class FirmCrmLostReasonCount(BaseModel):
    reason: str
    count: int

class FirmCrmMonthlyWinLoss(BaseModel):
    month: str
    won: float
    lost: float
    won_count: int
    lost_count: int

class FirmCrmWinLoss(BaseModel):
    won_count: int
    lost_count: int
    won_amount: float
    lost_amount: float
    win_rate: float | None
    avg_won_amount: float
    avg_days_to_close: float | None
    lost_reasons: list[FirmCrmLostReasonCount]
    monthly: list[FirmCrmMonthlyWinLoss]

class FirmCrmDashboardTask(FirmCrmORM):
    id: int
    subject: str
    due_at: datetime | None
    priority: str
    opportunity_id: int | None
    account_id: int | None
    account_name: str | None = None
    opportunity_name: str | None = None

class FirmCrmDashboard(BaseModel):
    kpis: dict[str, float | None]
    pipeline: FirmCrmPipelineSummary
    win_loss: FirmCrmWinLoss
    my_tasks: list[FirmCrmDashboardTask]
    generated_at: datetime

class FirmCrmStageVelocity(BaseModel):
    stage: str
    position: int
    avg_days: float
    n: int

class FirmCrmFunnel(BaseModel):
    leads: int
    qualified: int
    converted: int
    opportunities: int
    won: int
    by_source: list[dict[str, str | int]]
