from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import User
from app.services import reports as svc

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard")
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.dashboard(db, user)


@router.get("/pipeline")
def pipeline(pipeline_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.pipeline_summary(db, pipeline_id)


@router.get("/win-loss")
def win_loss(months: int = 12, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.win_loss(db, months)


@router.get("/practice-areas")
def practice_areas(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.by_practice_area(db)


@router.get("/origination")
def origination(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.origination(db)


@router.get("/referral-sources")
def referral_sources(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.referral_sources(db)


@router.get("/funnel")
def funnel(months: int = 12, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.funnel(db, months)


@router.get("/stage-velocity")
def stage_velocity(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.stage_velocity(db)


@router.get("/activity-leaderboard")
def activity_leaderboard(days: int = 30, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return svc.activity_leaderboard(db, days)
