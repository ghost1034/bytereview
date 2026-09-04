from __future__ import annotations
from firmcrm.core.routing import FirmCrmRoute

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from firmcrm.core.db import get_db
from firmcrm.core.deps import get_current_user
from firmcrm.models import User
from firmcrm.services import reports as svc
from firmcrm.report_schemas import FirmCrmDashboard, FirmCrmPipelineSummary, FirmCrmWinLoss, FirmCrmStageVelocity, FirmCrmFunnel

router = APIRouter(route_class=FirmCrmRoute, prefix="/reports", tags=["reports"])


@router.get("/dashboard", response_model=FirmCrmDashboard)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.dashboard(db, user)


@router.get("/pipeline", response_model=FirmCrmPipelineSummary)
def pipeline(pipeline_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.pipeline_summary(db, pipeline_id)


@router.get("/win-loss", response_model=FirmCrmWinLoss)
def win_loss(months: int = 12, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.win_loss(db, months)


@router.get("/practice-areas", response_model=list[dict[str, str | float | None]])
def practice_areas(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.by_practice_area(db)


@router.get("/origination", response_model=list[dict[str, str | float | None]])
def origination(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.origination(db)


@router.get("/referral-sources", response_model=list[dict[str, str | float | None]])
def referral_sources(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.referral_sources(db)


@router.get("/funnel", response_model=FirmCrmFunnel)
def funnel(months: int = 12, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.funnel(db, months)


@router.get("/stage-velocity", response_model=list[FirmCrmStageVelocity])
def stage_velocity(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.stage_velocity(db)


@router.get("/activity-leaderboard", response_model=list[dict[str, str | float | None]])
def activity_leaderboard(days: int = 30, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.activity_leaderboard(db, days)
