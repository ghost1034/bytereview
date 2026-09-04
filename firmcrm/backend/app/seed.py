"""Demo seed: a mid-size multi-discipline firm (accounting + legal + advisory).

Usage: python -m app.seed --demo --reset
Deterministic (seeded RNG). Demo logins: *@demo.firm / Demo1234!Demo
"""

from __future__ import annotations

import argparse
import random
from datetime import timedelta

from sqlalchemy import select

from app.core import migrate
from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Account,
    Activity,
    Campaign,
    CampaignMember,
    ConflictCheck,
    Contact,
    Engagement,
    Lead,
    Opportunity,
    Pipeline,
    PracticeArea,
    Stage,
    StageHistory,
    User,
    utcnow,
)
from app.services import conflicts as conflict_svc

PW = "Demo1234!Demo"
R = random.Random(7)
NOW = utcnow()
TODAY = NOW.date()


def d(days_ago: int):
    return NOW - timedelta(days=days_ago)


def reset():
    """Drop everything and rebuild the schema through Alembic (never create_all)."""
    migrate.drop_everything(engine)
    migrate.upgrade_head()


def seed_demo():
    db = SessionLocal()
    try:
        if db.scalars(select(User)).first():
            print("already seeded; use --reset")
            return
        # ---- practice areas
        pa_defs = [
            ("Audit & Assurance", "accounting", "independence"), ("Tax Compliance & Planning", "accounting", None),
            ("Client Accounting Services", "accounting", None), ("Transaction Advisory", "advisory", None),
            ("Corporate & M&A", "legal", "conflict"), ("Commercial Litigation", "legal", "conflict"),
            ("Employment Law", "legal", "conflict"), ("Trusts & Estates", "legal", "conflict"),
            ("Real Estate", "legal", "conflict"), ("Forensic & Valuation", "advisory", None),
        ]
        pas = {n: PracticeArea(name=n, discipline=disc, clearance_type=ct) for n, disc, ct in pa_defs}
        db.add_all(pas.values())
        db.flush()
        PA = {n: p.id for n, p in pas.items()}

        # ---- users
        udefs = [
            ("admin@demo.firm", "Dana Whitfield", "admin", "Director of Operations", None),
            ("partner.tax@demo.firm", "Marcus Okafor", "partner", "Tax Partner", "Tax Compliance & Planning"),
            ("partner.audit@demo.firm", "Priya Raman", "partner", "Audit Partner", "Audit & Assurance"),
            ("partner.corp@demo.firm", "Elena Castellanos", "partner", "Corporate Partner", "Corporate & M&A"),
            ("partner.lit@demo.firm", "James Whitaker", "partner", "Litigation Partner", "Commercial Litigation"),
            ("manager@demo.firm", "Sofia Lindqvist", "manager", "Senior Manager, Advisory", "Transaction Advisory"),
            ("manager.cas@demo.firm", "Tomas Reyes", "manager", "CAS Practice Lead", "Client Accounting Services"),
            ("staff@demo.firm", "Aisha Bello", "staff", "Senior Associate", "Corporate & M&A"),
            ("staff2@demo.firm", "Noah Kim", "staff", "Tax Senior", "Tax Compliance & Planning"),
            ("marketing@demo.firm", "Grace Tanaka", "marketing", "Marketing & BD Manager", None),
        ]
        users = {}
        for email, name, role, title, pa in udefs:
            u = User(email=email, full_name=name, password_hash=hash_password(PW), role=role, title=title,
                     practice_area_id=PA.get(pa) if pa else None)
            db.add(u)
            users[email.split("@")[0]] = u
        db.flush()
        U = {k: v.id for k, v in users.items()}
        partners = [U["partner.tax"], U["partner.audit"], U["partner.corp"], U["partner.lit"]]
        owners = partners + [U["manager"], U["manager.cas"], U["staff"], U["staff2"]]

        # ---- pipeline
        pipe = Pipeline(name="Standard Pursuit", is_default=True)
        stage_defs = [("Identified", 10), ("Qualified", 25), ("Clearance", 40), ("Proposal", 60), ("Negotiation", 80),
                      ("Closed Won", 100), ("Closed Lost", 0)]
        pipe.stages = [Stage(name=n, position=i, probability=p, is_won=(n == "Closed Won"), is_lost=(n == "Closed Lost"))
                       for i, (n, p) in enumerate(stage_defs)]
        db.add(pipe)
        db.flush()
        S = {s.name: s for s in pipe.stages}
        open_stages = [S["Identified"], S["Qualified"], S["Clearance"], S["Proposal"], S["Negotiation"]]

        # ---- campaigns
        camps = [
            Campaign(name="Q2 State Tax Nexus Webinar", kind="webinar", status="completed", start_date=TODAY - timedelta(days=130),
                     end_date=TODAY - timedelta(days=130), budget=4000, actual_cost=3600, owner_id=U["marketing"],
                     practice_area_id=PA["Tax Compliance & Planning"]),
            Campaign(name="Founder Exit-Readiness Breakfast", kind="event", status="completed", start_date=TODAY - timedelta(days=75),
                     end_date=TODAY - timedelta(days=75), budget=12000, actual_cost=11250, owner_id=U["marketing"],
                     practice_area_id=PA["Transaction Advisory"]),
            Campaign(name="Employment Law Update Newsletter", kind="newsletter", status="active", start_date=TODAY - timedelta(days=200),
                     budget=6000, actual_cost=2800, owner_id=U["marketing"], practice_area_id=PA["Employment Law"]),
            Campaign(name="Fall Audit Committee Roundtable", kind="seminar", status="planned", start_date=TODAY + timedelta(days=40),
                     end_date=TODAY + timedelta(days=40), budget=9000, owner_id=U["marketing"], practice_area_id=PA["Audit & Assurance"]),
        ]
        db.add_all(camps)
        db.flush()

        # ---- accounts
        acc_defs = [
            ("Northwind Robotics Inc", "client", "Manufacturing", "$50M–$100M", U["partner.audit"], True),
            ("Halcyon Health Partners LLC", "client", "Healthcare", "$10M–$50M", U["partner.tax"], False),
            ("Brightline Logistics Corp", "client", "Manufacturing", "$100M–$500M", U["partner.corp"], False),
            ("Cedar & Stone Development", "client", "Real Estate", "$10M–$50M", U["partner.lit"], False),
            ("Meridian Family Office", "client", "Financial Services", "$1M–$10M", U["partner.tax"], False),
            ("Vantage Biotherapeutics", "client", "Life Sciences", "$50M–$100M", U["partner.audit"], True),
            ("Orchard Street Capital", "client", "Financial Services", "$10M–$50M", U["partner.corp"], False),
            ("Kestrel Outdoor Brands", "client", "Consumer", "$10M–$50M", U["partner.tax"], False),
            ("Summit Ridge Construction", "client", "Construction", "$50M–$100M", U["partner.lit"], False),
            ("Lumen Learning Foundation", "client", "Nonprofit", "$1M–$10M", U["partner.audit"], False),
            ("Atlas Freight Systems", "prospect", "Manufacturing", "$100M–$500M", U["partner.corp"], False),
            ("Pinecrest Dental Group", "prospect", "Healthcare", "$1M–$10M", U["manager.cas"], False),
            ("Quantum Loop Software", "prospect", "Software", "$10M–$50M", U["manager"], False),
            ("Riverbend Hospitality", "prospect", "Consumer", "$10M–$50M", U["partner.tax"], False),
            ("Solstice Energy Partners", "prospect", "Financial Services", "$50M–$100M", U["partner.audit"], True),
            ("Granite Peak Holdings", "prospect", "Real Estate", "$100M–$500M", U["partner.corp"], False),
            ("Beacon Analytics", "prospect", "Software", "$1M–$10M", U["staff"], False),
            ("Harrow & Finch Architects", "prospect", "Professional Services", "$1M–$10M", U["manager.cas"], False),
            ("Tidewater Marine Services", "former_client", "Manufacturing", "$10M–$50M", U["partner.lit"], False),
            ("Westbrook Advisors", "referral_source", "Financial Services", None, U["marketing"], False),
            ("First Harbor Bank", "referral_source", "Financial Services", None, U["partner.tax"], False),
            ("Calder & Ames LLP", "referral_source", "Professional Services", None, U["partner.corp"], False),
            ("Brightline Freight Holdings", "adverse_party", "Manufacturing", None, None, False),
            ("Ironclad Staffing Solutions", "adverse_party", "Professional Services", None, None, False),
        ]
        accounts: dict[str, Account] = {}
        for name, typ, ind, rev, owner, pub in acc_defs:
            a = Account(name=name, account_type=typ, industry=ind, revenue_band=rev, owner_id=owner,
                        originating_partner_id=owner if owner in partners else R.choice(partners),
                        is_public_company=pub, city=R.choice(["Seattle", "Portland", "Denver", "Austin", "Chicago", "Boston"]),
                        state=R.choice(["WA", "OR", "CO", "TX", "IL", "MA"]), risk_rating=R.choice(["low", "low", "medium", "high"]),
                        client_since=TODAY - timedelta(days=R.randint(200, 2500)) if typ == "client" else None,
                        website=f"https://{name.split()[0].lower()}.example.com", tags=[ind.lower()])
            a.created_at = d(R.randint(60, 900))
            db.add(a)
            accounts[name] = a
        accounts["Brightline Logistics Corp"].aliases = "Brightline Transport, BLC"
        db.flush()

        # ---- contacts
        first = ["Avery", "Jordan", "Morgan", "Riley", "Casey", "Quinn", "Taylor", "Reese", "Parker", "Hayden", "Rowan", "Emerson",
                 "Sawyer", "Blake", "Dakota", "Skyler", "Finley", "Harper", "Kendall", "Logan", "Peyton", "Sidney", "Ellis", "Marlowe"]
        last = ["Nguyen", "Patel", "Garcia", "Schmidt", "Okonkwo", "Fischer", "Brennan", "Ivanova", "Moreau", "Hassan", "Lindgren",
                "Campbell", "Alvarez", "Sato", "Dubois", "Walsh", "Mensah", "Kowalski", "Rosenberg", "Adeyemi", "Thornton", "Vasquez"]
        titles = ["CFO", "CEO", "Controller", "General Counsel", "COO", "VP Finance", "Founder", "Managing Partner", "Director of Finance",
                  "Head of People", "Treasurer", "Board Chair"]
        contacts: list[Contact] = []
        seen_emails: set[str] = set()
        for name, acc in accounts.items():
            if acc.account_type == "adverse_party":
                continue
            n = 3 if acc.account_type == "client" else 2 if acc.account_type == "prospect" else 1
            for j in range(n):
                c = Contact(first_name=R.choice(first), last_name=R.choice(last), title=R.choice(titles), account_id=acc.id,
                            owner_id=acc.owner_id or U["marketing"],
                            lifecycle={"client": "client", "prospect": "prospect", "former_client": "other",
                                       "referral_source": "referral_source"}.get(acc.account_type, "other"),
                            role="referral_source" if acc.account_type == "referral_source" else
                            ("decision_maker" if j == 0 else R.choice(["influencer", "champion", "gatekeeper"])),
                            phone=f"+1 (555) {R.randint(200,999)}-{R.randint(1000,9999)}")
                c.email = f"{c.first_name.lower()}.{c.last_name.lower()}@{name.split()[0].lower()}.example.com"
                if c.email in seen_emails:  # partial unique index on active contact emails
                    c.email = c.email.replace("@", f"{len(seen_emails)}@")
                seen_emails.add(c.email)
                c.created_at = acc.created_at
                db.add(c)
                contacts.append(c)
        db.flush()
        by_acc: dict[int, list[Contact]] = {}
        for c in contacts:
            by_acc.setdefault(c.account_id, []).append(c)
        referrers = [c for c in contacts if c.role == "referral_source"]
        accounts["Halcyon Health Partners LLC"].referral_contact_id = referrers[0].id
        accounts["Kestrel Outdoor Brands"].referral_contact_id = referrers[1].id

        # ---- opportunities (open + closed over last 12 months)
        opp_templates = [
            ("FY audit and 401(k) plan audit", "Audit & Assurance", "recurring", True, (90000, 220000)),
            ("Multi-state income & franchise tax compliance", "Tax Compliance & Planning", "recurring", True, (35000, 120000)),
            ("Outsourced accounting & monthly close", "Client Accounting Services", "retainer", True, (48000, 150000)),
            ("Sell-side financial due diligence", "Transaction Advisory", "fixed", False, (75000, 250000)),
            ("Series C financing – company counsel", "Corporate & M&A", "fixed", False, (60000, 180000)),
            ("Acquisition of regional competitor", "Corporate & M&A", "hourly", False, (120000, 400000)),
            ("Breach of supply agreement – defense", "Commercial Litigation", "hourly", False, (150000, 600000)),
            ("Executive separation & non-compete dispute", "Employment Law", "hourly", False, (40000, 120000)),
            ("Founder estate & succession plan", "Trusts & Estates", "fixed", False, (25000, 80000)),
            ("Mixed-use development – acquisition & leasing", "Real Estate", "hourly", False, (70000, 200000)),
            ("Purchase price dispute – forensic accounting", "Forensic & Valuation", "hourly", False, (60000, 180000)),
            ("R&D tax credit study", "Tax Compliance & Planning", "fixed", False, (30000, 90000)),
            ("SOX readiness & internal controls", "Audit & Assurance", "fixed", False, (80000, 200000)),
            ("Employee handbook & wage-hour compliance review", "Employment Law", "fixed", False, (15000, 45000)),
        ]
        lost_reasons = ["price", "selected competitor", "no decision", "timing", "conflict", "scope change"]
        competitors = ["BigFour LLP", "Regional Firm A", "AmLaw 100 Firm", "Boutique Firm", None]
        opps: list[Opportunity] = []
        pursuit_accounts = [a for a in accounts.values() if a.account_type in ("client", "prospect", "former_client")]

        def mk_opp(acc: Account, tmpl, status: str, created_days_ago: int, stage: Stage | None = None):
            title, pa, fee, rec, rng = tmpl
            amt = R.randrange(rng[0], rng[1], 5000)
            owner = acc.owner_id or R.choice(owners)
            opp = Opportunity(name=title, account_id=acc.id,
                              primary_contact_id=by_acc[acc.id][0].id if acc.id in by_acc else None,
                              pipeline_id=pipe.id, stage_id=(stage or S["Identified"]).id, practice_area_id=PA[pa],
                              owner_id=owner, originating_partner_id=acc.originating_partner_id,
                              responsible_partner_id=R.choice(partners), amount=amt, fee_type=fee, is_recurring=rec,
                              campaign_id=R.choice([None, None, camps[0].id, camps[1].id, camps[2].id]),
                              referral_contact_id=R.choice([None, None, None] + [r.id for r in referrers]))
            opp.created_at = d(created_days_ago)
            opp.probability = (stage or S["Identified"]).probability
            db.add(opp)
            db.flush()
            # stage history walk
            t = opp.created_at
            prev = None
            path = open_stages[: open_stages.index(stage) + 1] if stage in open_stages else open_stages
            if status == "lost":
                path = open_stages[: R.randint(2, 5)]
            for st in path:
                db.add(StageHistory(opportunity_id=opp.id, from_stage_id=prev, to_stage_id=st.id, changed_by_id=owner, changed_at=t,
                                    days_in_previous=None if prev is None else R.uniform(3, 25)))
                prev = st.id
                t = t + timedelta(days=R.randint(3, 25))
            if status in ("won", "lost"):
                final = S["Closed Won"] if status == "won" else S["Closed Lost"]
                db.add(StageHistory(opportunity_id=opp.id, from_stage_id=prev, to_stage_id=final.id, changed_by_id=owner, changed_at=t,
                                    days_in_previous=R.uniform(3, 25)))
                opp.stage_id = final.id
                opp.status = status
                opp.closed_at = min(t, NOW - timedelta(days=1))
                opp.probability = 100 if status == "won" else 0
                opp.engagement_letter_status = "signed" if status == "won" else R.choice(["drafted", "sent", "not_started"])
                if status == "lost":
                    opp.lost_reason = R.choice(lost_reasons)
                    opp.competitor = R.choice(competitors)
                opp.stage_entered_at = opp.closed_at
            else:
                opp.stage_entered_at = min(t, NOW - timedelta(days=R.randint(1, 30)))
                opp.expected_close = TODAY + timedelta(days=R.randint(-10, 120))
                opp.engagement_letter_status = R.choice(["not_started", "not_started", "drafted", "sent", "signed"])
                opp.next_step = R.choice(["Send proposal draft", "Schedule partner meeting", "Confirm scope with CFO",
                                          "Run conflict check", "Follow up on engagement letter", "Pricing review"])
                opp.last_activity_at = NOW - timedelta(days=R.choice([1, 2, 4, 7, 12, 18, 25, 35]))
            opps.append(opp)
            return opp

        # won (12), lost (9) over trailing 12 months
        for _ in range(12):
            acc = R.choice([a for a in pursuit_accounts if a.account_type == "client"])
            mk_opp(acc, R.choice(opp_templates), "won", R.randint(20, 360))
        for _ in range(9):
            mk_opp(R.choice(pursuit_accounts), R.choice(opp_templates), "lost", R.randint(45, 330))
        # open (16) across stages
        for _ in range(16):
            stage = R.choice(open_stages)
            mk_opp(R.choice(pursuit_accounts), R.choice(opp_templates), "open", R.randint(5, 120), stage)
        # Two hand-crafted conflict scenarios
        atlas = accounts["Atlas Freight Systems"]
        conflict_opp = mk_opp(atlas, opp_templates[6], "open", 30, S["Clearance"])
        conflict_opp.name = "Breach of supply agreement v. Brightline Freight"
        conflict_opp.adverse_parties = ["Brightline Freight Holdings", "Brightline Logistics Corp"]
        solstice = accounts["Solstice Energy Partners"]
        indep_opp = mk_opp(solstice, opp_templates[0], "open", 22, S["Clearance"])
        indep_opp.name = "First-year financial statement audit (public company)"
        # engagements for won
        for o in [o for o in opps if o.status == "won"]:
            db.add(Engagement(name=o.name, account_id=o.account_id, opportunity_id=o.id, practice_area_id=o.practice_area_id,
                              responsible_partner_id=o.responsible_partner_id, originating_partner_id=o.originating_partner_id,
                              fee_type=o.fee_type, annual_value=o.amount, start_date=o.closed_at.date(), status="active",
                              adverse_parties=["Ironclad Staffing Solutions"] if "Employment" in o.name else [],
                              external_ref=f"ENG-{1000 + o.id}"))
        db.flush()

        # ---- conflict checks
        cc1 = ConflictCheck(check_type="conflict", opportunity_id=conflict_opp.id, account_id=atlas.id, requested_by_id=U["staff"],
                            parties=["Atlas Freight Systems", "Brightline Freight Holdings", "Brightline Logistics Corp"], status="pending")
        cc1.matches = conflict_svc.filter_self(conflict_svc.search(db, cc1.parties), account_id=atlas.id, opportunity_id=conflict_opp.id)
        db.add(cc1)
        cc2 = ConflictCheck(check_type="independence", opportunity_id=indep_opp.id, account_id=solstice.id, requested_by_id=U["partner.audit"],
                            parties=["Solstice Energy Partners"], status="pending",
                            independence_attestation={"financial_interest": False, "family_relationship": True, "prior_employment": False,
                                                      "non_attest_services": False, "contingent_fees": False})
        cc2.matches = []
        db.add(cc2)
        for o in [o for o in opps if o.status == "open" and o.practice_area.clearance_type and o.stage.position >= 3 and o not in (conflict_opp, indep_opp)]:
            db.add(ConflictCheck(check_type=o.practice_area.clearance_type, opportunity_id=o.id, account_id=o.account_id,
                                 requested_by_id=o.owner_id, parties=[o.account.name], matches=[], status="clear",
                                 resolved_by_id=o.owner_id, resolved_at=o.stage_entered_at, resolution_note="Auto-cleared: no matches"))

        # ---- leads
        lead_sources = ["web", "referral", "event", "webinar", "cold", "partner"]
        companies = ["Copperfield Dental", "Nimbus Data Co", "Redwood Family Trust", "Bayside Craft Brewing", "Trellis Health",
                     "Oakline Fabrication", "Helix Ventures", "Marigold Senior Living", "Peregrine Aviation Services", "Stonebridge Capital",
                     "Fernwood Nursery", "Delta Vision Optics", "Castle Rock Media", "Ardent Fitness", "Juniper Legal Tech"]
        for co in companies:
            status = R.choice(["new", "new", "contacted", "qualified", "unqualified"])
            lead = Lead(first_name=R.choice(first), last_name=R.choice(last), company=co, title=R.choice(titles),
                        source=R.choice(lead_sources), status=status, practice_area_id=R.choice(list(PA.values())),
                        owner_id=R.choice(owners), estimated_value=R.randrange(15000, 200000, 5000), score=R.randint(10, 95),
                        campaign_id=R.choice([None, camps[0].id, camps[1].id]), need_summary=R.choice([
                            "Outgrowing bookkeeper; needs monthly close and tax", "Raising a round; needs company counsel",
                            "Received IRS notice; multi-state exposure", "Considering sale in 18 months", "Board requires first audit",
                            "Wage-and-hour complaint from former employee", "Estate plan for founder family"]),
                        unqualified_reason="Budget below minimum" if status == "unqualified" else None)
            lead.email = f"{lead.first_name.lower()}@{co.split()[0].lower()}.example.com"
            lead.created_at = d(R.randint(1, 90))
            db.add(lead)
        # a few converted leads over time
        for _ in range(6):
            o = R.choice([o for o in opps if o.status != "lost"])
            c = by_acc[o.account_id][0]
            lead = Lead(first_name=c.first_name, last_name=c.last_name, company=o.account.name, email=c.email, source=R.choice(lead_sources),
                        status="converted", practice_area_id=o.practice_area_id, owner_id=o.owner_id, estimated_value=o.amount,
                        converted_account_id=o.account_id, converted_contact_id=c.id, converted_opportunity_id=o.id,
                        converted_at=o.created_at, campaign_id=o.campaign_id, score=80)
            lead.created_at = o.created_at - timedelta(days=R.randint(3, 20))
            db.add(lead)

        # ---- activities
        subjects = {
            "call": ["Intro call", "Scoping call with CFO", "Follow-up on proposal", "Pricing discussion", "Reference check call"],
            "email": ["Sent engagement letter", "Proposal v2 sent", "Shared credentials deck", "Follow-up after meeting", "Requested PBC list"],
            "meeting": ["Discovery meeting", "Partner pitch", "Proposal presentation", "Lunch with GC", "Kickoff planning"],
            "note": ["Competitor is BigFour; price sensitive", "Board approval expected next month", "GC prefers fixed fee",
                     "Referral from Westbrook — keep them updated", "Needs independence review before proposal"],
            "task": ["Draft proposal", "Run conflict check", "Prepare engagement letter", "Send pricing options", "Schedule partner intro",
                     "Update CRM notes after meeting", "Confirm scope with audit committee chair"],
        }
        for o in opps:
            n = R.randint(2, 6)
            for _ in range(n):
                kind = R.choice(["call", "email", "meeting", "note", "task"])
                when = o.created_at + timedelta(days=R.randint(0, max(1, (min(o.closed_at or NOW, NOW) - o.created_at).days)))
                a = Activity(kind=kind, subject=R.choice(subjects[kind]), owner_id=o.owner_id, account_id=o.account_id,
                             opportunity_id=o.id, contact_id=o.primary_contact_id, occurred_at=when,
                             body=R.choice(["", "", "Discussed scope, timing, and fee expectations.", "Client asked for references in the same industry."]) or None)
                a.created_at = when
                if kind == "task":
                    a.due_at = when + timedelta(days=R.randint(1, 14))
                    if o.status != "open" or R.random() < 0.5:
                        a.completed_at = a.due_at
                    a.priority = R.choice(["normal", "normal", "high", "low"])
                db.add(a)
        # upcoming tasks for the manager/admin demo user
        for i, subj in enumerate(["Prepare Q3 pipeline review deck", "Call Atlas GC re: conflict waiver", "Review Solstice independence file",
                                  "Send Pinecrest CAS proposal", "Follow up: Quantum Loop due diligence scope"]):
            db.add(Activity(kind="task", subject=subj, owner_id=U["admin"] if i % 2 == 0 else U["manager"], account_id=atlas.id,
                            opportunity_id=conflict_opp.id if i == 1 else None, due_at=NOW + timedelta(days=i + 1),
                            priority="high" if i < 2 else "normal"))

        # ---- campaign members
        for camp in camps[:3]:
            pool = R.sample(contacts, k=min(len(contacts), R.randint(10, 18)))
            for c in pool:
                db.add(CampaignMember(campaign_id=camp.id, contact_id=c.id,
                                      status=R.choice(["invited", "registered", "attended", "attended", "no_show", "responded"])))
        db.commit()
        print(f"seeded: {len(accounts)} accounts, {len(contacts)} contacts, {len(opps)} opportunities")
        print("logins (password Demo1234!Demo):", ", ".join(u[0] for u in udefs))
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--demo", action="store_true")
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    if args.reset:
        reset()
    else:
        migrate.upgrade_head()
    if args.demo:
        seed_demo()
