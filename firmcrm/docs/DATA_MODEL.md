# Data model

```
User ─┬─ owns ─▶ Account ─┬─ Contact (account_id)
      │                   ├─ Opportunity (account_id, primary_contact_id, stage_id, practice_area_id,
      │                   │      owner_id, originating_partner_id, responsible_partner_id,
      │                   │      referral_contact_id / referral_account_id, campaign_id)
      │                   │      ├─ StageHistory
      │                   │      ├─ ConflictCheck (opportunity_id, account_id)
      │                   │      └─ Engagement (created at Closed Won)
      │                   └─ Activity (account_id | contact_id | opportunity_id | lead_id)
      └─ Lead ── convert ──▶ Account + Contact (+ Opportunity)
Campaign ─ CampaignMember ─ Contact
PracticeArea (discipline, clearance_type) ◀─ Opportunity / Engagement / Lead / User
Pipeline ─ Stage (position, probability, is_won, is_lost)
RefreshToken (user_id, token_hash, family_id) · ImportJob · AuditLog
EthicalWall (entity_type account|opportunity, entity_id, reason, is_active) ─ EthicalWallMember ─ User
```

| Table | Purpose | Key rules |
|---|---|---|
| `users` | Firm staff | role enum; lockout fields; `must_change_password`; `password_changed_at` invalidates older JWTs |
| `practice_areas` | Service lines | `clearance_type` ∈ {conflict, independence, null} drives the Closed Won gate |
| `pipelines` / `stages` | Configurable sales process | exactly one won + one lost stage; stage probability applied on entry |
| `accounts` | Companies/individuals (client, prospect, former client, referral source, adverse party, vendor) | duplicate guard on name/alias (case-insensitive); archive flag; `is_public_company` flags independence relevance |
| `contacts` | People | partial unique index on active email; lifecycle enum |
| `leads` | Unqualified interest | status `new→contacted→qualified→(converted)` or `unqualified` (reason required); converted leads are read-only |
| `opportunities` | Pursuits | status open/won/lost; `engagement_letter_status`; `adverse_parties` JSON feeds conflict search; indexes on (status, stage), (owner, status) |
| `stage_history` | Stage transitions with days-in-previous | powers velocity report |
| `activities` | call/email/meeting/note/task | polymorphic via nullable FKs; non-task activity touches `last_activity_at` |
| `conflict_checks` | Conflict or independence clearance | status pending/clear/conflict/waived; `matches` JSON; waiver requires partner + note |
| `engagements` | Won work (matter) | `external_ref` for PSA/practice management; adverse parties persist for future searches |
| `campaigns` / `campaign_members` | Marketing attribution | member status enum; influenced pipeline and won computed from opportunities |
| `ethical_walls` / `ethical_wall_members` | Record-level restrictions | one active wall per record; creator always a member; non-members get 404; conflict search redacts |
| `refresh_tokens` | Sessions | hashed token, family for rotation/reuse detection |
| `import_jobs` | CSV import runs | dry-run flag, counts, row-level exceptions |
| `audit_log` | Immutable change record | actor, action, entity, before/after JSON, note |

Money fields are `FLOAT` estimated fees in the firm currency (`DEFAULT_CURRENCY`); they are planning numbers, not ledger values. Reconcile origination reporting to billed fees in the billing system before compensation use.
