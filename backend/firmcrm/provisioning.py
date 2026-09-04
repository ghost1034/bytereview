from sqlalchemy import select
from models.db_models import User as PlatformUser
from firmcrm.models import User, FirmCrmSettings, PracticeArea, Pipeline, Stage
from firmcrm.core.errors import Forbidden

PRACTICE_AREAS = [
    ('Audit & Assurance', 'accounting', 'independence'), ('Tax Compliance & Planning', 'accounting', None),
    ('Client Accounting Services', 'accounting', None), ('Transaction Advisory', 'advisory', None),
    ('Corporate & M&A', 'legal', 'conflict'), ('Commercial Litigation', 'legal', 'conflict'),
    ('Employment Law', 'legal', 'conflict'), ('Trusts & Estates', 'legal', 'conflict'),
    ('Real Estate', 'legal', 'conflict'), ('Forensic & Valuation', 'advisory', None),
]
STAGES = [('Identified',10), ('Qualified',25), ('Clearance',40), ('Proposal',60), ('Negotiation',80), ('Closed Won',100), ('Closed Lost',0)]

def provision(db, user_id):
    firm = db.info['firm_id']
    settings = db.get(FirmCrmSettings, firm)
    if settings is None:
        settings = FirmCrmSettings(firm_id=firm)
        db.add(settings)
        db.add_all([PracticeArea(firm_id=firm, name=name, discipline=discipline, clearance_type=clearance) for name, discipline, clearance in PRACTICE_AREAS])
        pipeline = Pipeline(firm_id=firm, name='Standard Pursuit', is_default=True)
        pipeline.stages = [Stage(firm_id=firm, name=name, position=i, probability=p, is_won=name=='Closed Won', is_lost=name=='Closed Lost') for i,(name,p) in enumerate(STAGES)]
        db.add(pipeline)
        db.flush()
    db.info["settings"] = settings
    platforms = db.scalars(select(PlatformUser).where(PlatformUser.firm_id == firm)).all()
    # Remove stale role grants when a member leaves, so rejoining starts as staff.
    # This internal Core write is explicitly firm-scoped; no caller supplies its IDs.
    roster = User.__table__
    stale = roster.c.firm_id == firm
    stale = stale & roster.c.id.not_in([platform.id for platform in platforms])
    removed = db.connection().execute(roster.delete().where(stale)).rowcount
    if removed:
        settings.access_revision += 1
    # Populate pickers from the existing firm directory; never create identities.
    for platform in platforms:
        member = db.get(User, platform.id)
        if member is None:
            member = User(firm_id=firm, id=platform.id, role='staff', is_active=True)
            db.add(member)
        member.full_name = platform.display_name or platform.email
        member.email = platform.email
        member.title = platform.title
    db.flush()
    actor = db.get(User, user_id)
    if actor is None or not actor.is_active:
        raise Forbidden('CRM membership is inactive')
    platform = db.get(PlatformUser, user_id)
    # Effective administration is derived, not persisted as a role grant.
    from sqlalchemy.orm.attributes import set_committed_value
    if getattr(platform.role, 'value', platform.role) == 'admin':
        set_committed_value(actor, 'role', 'admin')
    return actor, settings
