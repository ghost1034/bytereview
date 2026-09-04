"""Practice areas and pipelines/stages (admin-configurable reference data)."""

from __future__ import annotations
from firmcrm.core.routing import FirmCrmRoute

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from firmcrm.api.common import get_or_404
from firmcrm.core.audit import record
from firmcrm.core.db import get_db
from firmcrm.core.deps import get_current_user, require_role
from firmcrm.core.errors import DomainError
from firmcrm.models import Opportunity, Pipeline, PracticeArea, Stage, User
from firmcrm.schemas import FirmCrmPipelineIn, FirmCrmPipelineOut, FirmCrmPracticeAreaIn, FirmCrmPracticeAreaOut, FirmCrmStageIn, FirmCrmStageOut

router = APIRouter(route_class=FirmCrmRoute, tags=["reference"])


@router.get("/practice-areas", response_model=list[FirmCrmPracticeAreaOut])
def list_practice_areas(active_only: bool = False, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(PracticeArea)
    if active_only:
        stmt = stmt.where(PracticeArea.is_active.is_(True))
    return db.scalars(stmt.order_by(PracticeArea.discipline, PracticeArea.name)).all()


@router.post("/practice-areas", response_model=FirmCrmPracticeAreaOut, status_code=201)
def create_practice_area(body: FirmCrmPracticeAreaIn, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    pa = PracticeArea(**body.model_dump())
    db.add(pa)
    db.flush()
    record(db, actor_id=actor.id, action="practice_area.create", entity_type="practice_area", entity_id=pa.id, after=body.model_dump())
    db.commit()
    return pa


@router.patch("/practice-areas/{pa_id}", response_model=FirmCrmPracticeAreaOut)
def update_practice_area(pa_id: int, body: FirmCrmPracticeAreaIn, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    pa = get_or_404(db, PracticeArea, pa_id)
    before = {k: getattr(pa, k) for k in body.model_dump()}
    for k, v in body.model_dump().items():
        setattr(pa, k, v)
    record(db, actor_id=actor.id, action="practice_area.update", entity_type="practice_area", entity_id=pa.id, before=before, after=body.model_dump())
    db.commit()
    return pa


@router.get("/pipelines", response_model=list[FirmCrmPipelineOut])
def list_pipelines(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.scalars(select(Pipeline).order_by(Pipeline.is_default.desc(), Pipeline.name)).all()


@router.post("/pipelines", response_model=FirmCrmPipelineOut, status_code=201)
def create_pipeline(body: FirmCrmPipelineIn, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    _validate_stages(body.stages)
    if body.is_default:
        for p in db.scalars(select(Pipeline)).all():
            p.is_default = False
    p = Pipeline(name=body.name, is_default=body.is_default)
    p.stages = [Stage(**s.model_dump()) for s in body.stages]
    db.add(p)
    db.flush()
    record(db, actor_id=actor.id, action="pipeline.create", entity_type="pipeline", entity_id=p.id, after=body.model_dump())
    db.commit()
    return p


@router.post("/pipelines/{pipeline_id}/stages", response_model=FirmCrmStageOut, status_code=201)
def add_stage(pipeline_id: int, body: FirmCrmStageIn, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    p = get_or_404(db, Pipeline, pipeline_id)
    _validate_stages([*p.stages, body])
    st = Stage(pipeline_id=p.id, **body.model_dump())
    db.add(st)
    db.flush()
    record(db, actor_id=actor.id, action="stage.create", entity_type="stage", entity_id=st.id, after=body.model_dump())
    db.commit()
    return st


@router.patch("/stages/{stage_id}", response_model=FirmCrmStageOut)
def update_stage(stage_id: int, body: FirmCrmStageIn, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    st = get_or_404(db, Stage, stage_id)
    siblings = db.scalars(select(Stage).where(Stage.pipeline_id == st.pipeline_id)).all()
    _validate_stages([body if sibling.id == st.id else sibling for sibling in siblings])
    if (body.is_won, body.is_lost) != (st.is_won, st.is_lost):
        raise DomainError("Terminal stage behavior cannot change; create a new pipeline", code="stage_in_use")
    before = {k: getattr(st, k) for k in body.model_dump()}
    for k, v in body.model_dump().items():
        setattr(st, k, v)
    record(db, actor_id=actor.id, action="stage.update", entity_type="stage", entity_id=st.id, before=before, after=body.model_dump())
    db.commit()
    return st


@router.delete("/stages/{stage_id}", status_code=204)
def delete_stage(stage_id: int, db: Session = Depends(get_db), actor: User = Depends(require_role("admin"))):
    st = get_or_404(db, Stage, stage_id)
    _validate_stages(db.scalars(select(Stage).where(Stage.pipeline_id == st.pipeline_id, Stage.id != st.id)).all())
    if db.scalars(select(Opportunity).where(Opportunity.stage_id == st.id)).first():
        raise DomainError("Stage has opportunities; move them first", code="stage_in_use")
    record(db, actor_id=actor.id, action="stage.delete", entity_type="stage", entity_id=st.id, before={"name": st.name})
    db.delete(st)
    db.commit()


def _validate_stages(stages: list[FirmCrmStageIn]) -> None:
    if len(stages) < 2:
        raise DomainError("A pipeline needs at least two stages")
    if sum(1 for s in stages if s.is_won) != 1 or sum(1 for s in stages if s.is_lost) != 1:
        raise DomainError("A pipeline needs exactly one won stage and one lost stage")
