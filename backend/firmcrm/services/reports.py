"""Reporting aggregates. All figures derive from CRM tables; no hidden transformations."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from firmcrm.models import (
    Account,
    Activity,
    ConflictCheck,
    Contact,
    Engagement,
    Lead,
    Opportunity,
    PracticeArea,
    Stage,
    StageHistory,
    User,
    utcnow,
)
from firmcrm.services.opportunities import is_stale


def _names(db: Session, model, ids: set[int], attr="name") -> dict[int, str]:
    if not ids:
        return {}
    return {r.id: getattr(r, attr) for r in db.scalars(select(model).where(model.id.in_(ids))).all()}


def pipeline_summary(db: Session, pipeline_id: int | None = None) -> dict:
    q = select(Opportunity).where(Opportunity.status == "open")
    if pipeline_id:
        q = q.where(Opportunity.pipeline_id == pipeline_id)
    opps = db.scalars(q).all()
    stages = {s.id: s for s in db.scalars(select(Stage)).all()}
    by_stage: dict[int, dict] = {}
    for o in opps:
        st = stages[o.stage_id]
        b = by_stage.setdefault(st.id, {"stage_id": st.id, "stage": st.name, "position": st.position, "count": 0,
                                        "amount": 0.0, "weighted": 0.0, "stale": 0})
        b["count"] += 1
        b["amount"] += o.amount
        b["weighted"] += o.amount * o.probability / 100
        b["stale"] += 1 if is_stale(db, o) else 0
    rows = sorted(by_stage.values(), key=lambda r: r["position"])
    return {
        "stages": rows,
        "total_count": len(opps),
        "total_amount": sum(o.amount for o in opps),
        "total_weighted": sum(o.amount * o.probability / 100 for o in opps),
        "stale_count": sum(1 for o in opps if is_stale(db, o)),
    }


def win_loss(db: Session, months: int = 12) -> dict:
    since = utcnow() - timedelta(days=30 * months)
    closed = db.scalars(select(Opportunity).where(Opportunity.status.in_(["won", "lost"]),
                                                  Opportunity.closed_at >= since)).all()
    won = [o for o in closed if o.status == "won"]
    lost = [o for o in closed if o.status == "lost"]
    reasons: dict[str, int] = defaultdict(int)
    for o in lost:
        reasons[o.lost_reason or "unspecified"] += 1
    monthly: dict[str, dict] = defaultdict(lambda: {"won": 0.0, "lost": 0.0, "won_count": 0, "lost_count": 0})
    for o in closed:
        k = o.closed_at.strftime("%Y-%m")
        monthly[k][o.status] += o.amount
        monthly[k][f"{o.status}_count"] += 1
    total = len(closed)
    return {
        "won_count": len(won), "lost_count": len(lost),
        "won_amount": sum(o.amount for o in won), "lost_amount": sum(o.amount for o in lost),
        "win_rate": round(len(won) / total, 3) if total else None,
        "avg_won_amount": round(sum(o.amount for o in won) / len(won), 2) if won else 0,
        "avg_days_to_close": round(sum((o.closed_at - o.created_at).days for o in won) / len(won), 1) if won else None,
        "lost_reasons": sorted([{"reason": k, "count": v} for k, v in reasons.items()], key=lambda r: -r["count"]),
        "monthly": [{"month": k, **v} for k, v in sorted(monthly.items())],
    }


def by_practice_area(db: Session) -> list[dict]:
    pas = {p.id: p.name for p in db.scalars(select(PracticeArea)).all()}
    rows: dict[int | None, dict] = {}
    for o in db.scalars(select(Opportunity)).all():
        r = rows.setdefault(o.practice_area_id, {"practice_area": pas.get(o.practice_area_id, "Unassigned"),
                                                 "open_count": 0, "open_amount": 0.0, "weighted": 0.0,
                                                 "won_count": 0, "won_amount": 0.0, "lost_count": 0})
        if o.status == "open":
            r["open_count"] += 1
            r["open_amount"] += o.amount
            r["weighted"] += o.amount * o.probability / 100
        elif o.status == "won":
            r["won_count"] += 1
            r["won_amount"] += o.amount
        else:
            r["lost_count"] += 1
    for r in rows.values():
        closed = r["won_count"] + r["lost_count"]
        r["win_rate"] = round(r["won_count"] / closed, 3) if closed else None
    return sorted(rows.values(), key=lambda r: -(r["open_amount"] + r["won_amount"]))


def origination(db: Session) -> list[dict]:
    """Origination credit: won amount + open weighted pipeline by originating partner."""
    users = {u.id: u.full_name for u in db.scalars(select(User)).all()}
    rows: dict[int | None, dict] = {}
    for o in db.scalars(select(Opportunity)).all():
        r = rows.setdefault(o.originating_partner_id, {"partner": users.get(o.originating_partner_id, "Unattributed"),
                                                       "open_count": 0, "open_weighted": 0.0, "won_count": 0,
                                                       "won_amount": 0.0, "recurring_won": 0.0})
        if o.status == "open":
            r["open_count"] += 1
            r["open_weighted"] += o.amount * o.probability / 100
        elif o.status == "won":
            r["won_count"] += 1
            r["won_amount"] += o.amount
            if o.is_recurring:
                r["recurring_won"] += o.amount
    for r in rows.values():
        r["clients_originated"] = 0
    acc_counts = db.execute(select(Account.originating_partner_id, func.count()).where(Account.account_type == "client")
                            .group_by(Account.originating_partner_id)).all()
    for pid, n in acc_counts:
        rows.setdefault(pid, {"partner": users.get(pid, "Unattributed"), "open_count": 0, "open_weighted": 0.0,
                              "won_count": 0, "won_amount": 0.0, "recurring_won": 0.0, "clients_originated": 0})
        rows[pid]["clients_originated"] = n
    return sorted(rows.values(), key=lambda r: -(r["won_amount"] + r["open_weighted"]))


def referral_sources(db: Session) -> list[dict]:
    """Who sends us work: referral contact / account -> opportunities, won amount."""
    contacts = {c.id: c for c in db.scalars(select(Contact)).all()}
    accounts = {a.id: a.name for a in db.scalars(select(Account)).all()}
    rows: dict[str, dict] = {}
    for o in db.scalars(select(Opportunity)).all():
        if not (o.referral_contact_id or o.referral_account_id):
            continue
        if o.referral_contact_id and o.referral_contact_id in contacts:
            c = contacts[o.referral_contact_id]
            key, name, org = f"c{c.id}", c.full_name, accounts.get(c.account_id) if c.account_id else None
        elif o.referral_account_id in accounts:
            key, name, org = f"a{o.referral_account_id}", accounts[o.referral_account_id], None
        else:
            continue  # Do not disclose an inaccessible referral source.
        r = rows.setdefault(key, {"source": name, "organization": org, "referrals": 0, "won_count": 0, "won_amount": 0.0,
                                  "open_amount": 0.0, "kind": "contact" if key.startswith("c") else "account",
                                  "id": int(key[1:])})
        r["referrals"] += 1
        if o.status == "won":
            r["won_count"] += 1
            r["won_amount"] += o.amount
        elif o.status == "open":
            r["open_amount"] += o.amount
    return sorted(rows.values(), key=lambda r: (-r["won_amount"], -r["referrals"]))


def funnel(db: Session, months: int = 12) -> dict:
    since = utcnow() - timedelta(days=30 * months)
    leads = db.scalars(select(Lead).where(Lead.created_at >= since)).all()
    converted_ids = {lead.converted_opportunity_id for lead in leads if lead.converted_opportunity_id is not None}
    opps = db.scalars(select(Opportunity).where(Opportunity.id.in_(converted_ids))).all()
    src: dict[str, dict] = defaultdict(lambda: {"leads": 0, "converted": 0, "won": 0})
    for lead in leads:
        src[lead.source]["leads"] += 1
        if lead.status == "converted":
            src[lead.source]["converted"] += 1
    won_from_lead = {o.id for o in opps if o.status == "won"}
    for lead in leads:
        if lead.converted_opportunity_id in won_from_lead:
            src[lead.source]["won"] += 1
    return {
        "leads": len(leads),
        "qualified": sum(1 for l in leads if l.status in ("qualified", "converted")),
        "converted": sum(1 for l in leads if l.status == "converted"),
        "opportunities": len(opps),
        "won": sum(1 for o in opps if o.status == "won"),
        "by_source": [{"source": k, **v} for k, v in sorted(src.items(), key=lambda kv: -kv[1]["leads"])],
    }


def stage_velocity(db: Session) -> list[dict]:
    stages = {s.id: s for s in db.scalars(select(Stage)).all()}
    agg: dict[int, list[float]] = defaultdict(list)
    for h in db.scalars(select(StageHistory).where(StageHistory.days_in_previous.is_not(None))).all():
        if h.from_stage_id:
            agg[h.from_stage_id].append(h.days_in_previous)
    out = []
    for sid, days in agg.items():
        st = stages.get(sid)
        if st:
            out.append({"stage": st.name, "position": st.position, "avg_days": round(sum(days) / len(days), 1), "n": len(days)})
    return sorted(out, key=lambda r: r["position"])


def activity_leaderboard(db: Session, days: int = 30) -> list[dict]:
    since = utcnow() - timedelta(days=days)
    users = {u.id: u.full_name for u in db.scalars(select(User)).all()}
    rows = db.execute(select(Activity.owner_id, Activity.kind, func.count()).where(Activity.occurred_at >= since)
                      .group_by(Activity.owner_id, Activity.kind)).all()
    agg: dict[int | None, dict] = {}
    for uid, kind, n in rows:
        r = agg.setdefault(uid, {"user": users.get(uid, "?"), "call": 0, "email": 0, "meeting": 0, "note": 0, "task": 0, "total": 0})
        r[kind] = r.get(kind, 0) + n
        r["total"] += n
    return sorted(agg.values(), key=lambda r: -r["total"])


def dashboard(db: Session, user: User) -> dict:
    now = utcnow()
    my_open = db.scalars(select(Opportunity).where(Opportunity.status == "open", Opportunity.owner_id == user.id)).all()
    all_open = db.scalars(select(Opportunity).where(Opportunity.status == "open")).all()  # aggregate KPIs: firm-wide
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    won_mtd = db.scalars(select(Opportunity).where(Opportunity.status == "won", Opportunity.closed_at >= month_start)).all()
    q_start = now.replace(month=((now.month - 1) // 3) * 3 + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    won_qtd = db.scalars(select(Opportunity).where(Opportunity.status == "won", Opportunity.closed_at >= q_start)).all()
    closing_30 = [o for o in all_open if o.expected_close and (o.expected_close - now.date()).days <= 30]
    # Honest period-over-period comparisons: same elapsed window in the prior period.
    elapsed_q = now - q_start
    prev_q_start = (q_start - timedelta(days=1)).replace(day=1)
    prev_q_start = prev_q_start.replace(month=((prev_q_start.month - 1) // 3) * 3 + 1)
    won_prev_qtd = db.scalars(select(Opportunity).where(Opportunity.status == "won", Opportunity.closed_at >= prev_q_start,
                                                        Opportunity.closed_at < prev_q_start + elapsed_q)).all()
    elapsed_m = now - month_start
    prev_m_start = (month_start - timedelta(days=1)).replace(day=1)
    won_prev_mtd = db.scalars(select(Opportunity).where(Opportunity.status == "won", Opportunity.closed_at >= prev_m_start,
                                                        Opportunity.closed_at < prev_m_start + elapsed_m)).all()
    d30, d60 = now - timedelta(days=30), now - timedelta(days=60)
    leads_30 = db.scalar(select(func.count()).select_from(Lead).where(Lead.created_at >= d30)) or 0
    leads_prev_30 = db.scalar(select(func.count()).select_from(Lead).where(Lead.created_at >= d60, Lead.created_at < d30)) or 0
    opps_30 = db.scalar(select(func.count()).select_from(Opportunity).where(Opportunity.created_at >= d30)) or 0
    opps_prev_30 = db.scalar(select(func.count()).select_from(Opportunity).where(Opportunity.created_at >= d60, Opportunity.created_at < d30)) or 0

    def pct(cur: float, prev: float) -> float | None:
        return None if not prev else round((cur - prev) / prev * 100, 1)
    tasks = db.scalars(select(Activity).where(Activity.kind == "task", Activity.completed_at.is_(None),
                                              Activity.owner_id == user.id).order_by(Activity.due_at).limit(10)).all()
    acc_names = {a.id: a.name for a in db.scalars(select(Account).where(Account.id.in_({t.account_id for t in tasks if t.account_id} or {-1}))).all()}
    opp_names = {o.id: o.name for o in db.scalars(select(Opportunity).where(Opportunity.id.in_({t.opportunity_id for t in tasks if t.opportunity_id} or {-1}))).all()}
    new_leads = db.scalar(select(func.count()).select_from(Lead).where(Lead.status == "new")) or 0
    pending_checks = db.scalar(select(func.count()).select_from(ConflictCheck).where(ConflictCheck.status == "pending")) or 0
    active_eng = db.scalar(select(func.count()).select_from(Engagement).where(Engagement.status == "active")) or 0
    clients = db.scalar(select(func.count()).select_from(Account).where(Account.account_type == "client")) or 0
    return {
        "kpis": {
            "open_pipeline": sum(o.amount for o in all_open),
            "weighted_pipeline": sum(o.amount * o.probability / 100 for o in all_open),
            "open_count": len(all_open),
            "my_open_count": len(my_open),
            "my_open_amount": sum(o.amount for o in my_open),
            "won_mtd": sum(o.amount for o in won_mtd),
            "won_qtd": sum(o.amount for o in won_qtd),
            "won_qtd_count": len(won_qtd),
            "won_qtd_prior": sum(o.amount for o in won_prev_qtd),
            "won_qtd_delta_pct": pct(sum(o.amount for o in won_qtd), sum(o.amount for o in won_prev_qtd)),
            "won_mtd_delta_pct": pct(sum(o.amount for o in won_mtd), sum(o.amount for o in won_prev_mtd)),
            "new_leads_30d": leads_30,
            "new_leads_30d_delta_pct": pct(leads_30, leads_prev_30),
            "new_opps_30d": opps_30,
            "new_opps_30d_delta_pct": pct(opps_30, opps_prev_30),
            "closing_30_amount": sum(o.amount for o in closing_30),
            "closing_30_count": len(closing_30),
            "stale_count": sum(1 for o in all_open if is_stale(db, o)),
            "new_leads": new_leads,
            "pending_clearances": pending_checks,
            "active_engagements": active_eng,
            "clients": clients,
        },
        "pipeline": pipeline_summary(db),
        "win_loss": win_loss(db, 6),
        "my_tasks": [{"id": t.id, "subject": t.subject, "due_at": t.due_at, "priority": t.priority,
                      "opportunity_id": t.opportunity_id, "account_id": t.account_id,
                      "account_name": acc_names.get(t.account_id), "opportunity_name": opp_names.get(t.opportunity_id)} for t in tasks],
        "generated_at": datetime.now(UTC),
    }
