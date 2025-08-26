# CPAAutomation — OAuth-Friendly Integrations & Automations (MVP)

> This document specifies the **reduced-scope** Google integrations so we can pass OAuth verification **without** a full security assessment. It replaces user-inbox access with a **central inbound mailbox**, removes Drive read-all, and limits Drive to explicit file/folder selection via the Picker.

---

## 1) Goals & Non-Goals

### Goals

- Google OAuth approval with **minimal scopes**.
    
- Keep core features:
    
    - Import **explicitly selected** Drive files (no recursion).
        
    - Export results to a **user-selected Drive folder**.
        
    - Trigger automations by **emailing/forwarding attachments** to a central address.
        
- No breaking schema changes beyond light additions.
    

### Non-Goals (MVP)

- No user-granted Gmail access (no `gmail.readonly`/`gmail.modify` for end users).
    
- No Drive folder traversal or Drive-wide search.
    
- No vendor-direct ingestion routing (can follow later with subaddressing or per-tenant aliases).
    

---

## 2) OAuth & Permissions

### 2.1 Scopes we will request from **end users**

| Product      | Scope                                           | Why                                                                                          |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Google Drive | `https://www.googleapis.com/auth/drive.file`    | Read/write **only** on files/folders the user selects in the Picker or that the app creates. |

> **Removed**: `drive.readonly` (we don’t crawl folders), **all** Gmail user scopes.

### 2.2 Central mailbox access (Workspace-admin controlled)

We process emails sent to **`document@cpaautomation.ai`**, which is an **alias** or **group** that delivers to **`ianstewart@cpaautomation.ai`** for the MVP.

Access pattern (two acceptable options):

- **Service account + Domain-Wide Delegation (DWD)** impersonating `ianstewart@cpaautomation.ai` with scope `gmail.readonly`.  
    _End users do not grant Gmail scopes._
    
- _(Fallback)_ OAuth client on the single mailbox (manual grant by mailbox owner) — acceptable for MVP but DWD is cleaner and more scalable.
    

> We use **`gmail.readonly`** on the central mailbox only. We do **not** label or modify mails (keeps to read-only). If you later want to label processed mail, add `gmail.modify`.

### 2.3 Consent screen

- **Scopes shown to users:** only Drive scopes above.
    
- **Branding/Links:** privacy note and domain verification.
    

---

## 3) Product Behavior Changes

### 3.1 Drive Import

- **Picker configuration** (web):
    
    - Multi-file selection **enabled**.
        
    - **Folder selection disabled**.
        
    - No recursion or server-side listing beyond IDs the Picker returns.
        
- **Backend**:
    
    - Validate item kinds are files.
        
    - Import by ID using the user’s `drive.file` token.
        
    - ZIP handling remains in i/o worker (unpack in worker).
        

### 3.2 Drive Export

- **Picker** in **folder mode** to obtain a destination `folderId`.
    
- **Backend export** uses `files.create` with `parents: [folderId]` and the user’s `drive.file` token.
    

### 3.3 Automations via Central Mailbox

- Users **send or forward** attachments to `document@cpaautomation.ai`.
    
- We only process messages that:
    
    1. **Target the alias**: headers indicate `document@cpaautomation.ai` was a recipient, and
        
    2. **Match the owner**: `From:` equals the email of the user who connected Drive (or a verified alias), and
        
    3. **Pass filters** configured in the automation (subject, filename, mime, etc.).
        

**Header detection** (ingest vs personal mail):

- Accept if any of:
    
    - `To:` or `Cc:` contains `document@cpaautomation.ai` (case-insensitive), or
        
    - `Delivered-To:` equals `document@cpaautomation.ai` (covers BCC/alias delivery).
        
- Otherwise **ignore** (this protects `ianstewart@…` personal mail).
    

---

## 4) Frontend Changes (Next.js)

- **Upload page**:
    
    - Button: “Select from Drive” (multi-file, no folders).
        
    - Help text: “To ingest emails, forward attachments to **[document@cpaautomation.ai](mailto:document@cpaautomation.ai)** from your connected Google account.”
        
- **Results → Export**:
    
    - “Export to Drive”, opens folder picker to capture `folderId`.
        
- **Automations page**:
    
    - Gmail trigger type clarified as being **Central Mail**.

---

## 5) Backend & Data Model Changes

### 5.1 Tables (new/changed)

**A) `gmail_ingest_state`** — centralized cursor for the mailbox (replaces `integration_accounts.last_history_id`)

```python
class GmailIngestState(Base):
    __tablename__ = "gmail_ingest_state"
    id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mailbox_email    = Column(String(255), unique=True, nullable=False)  # 'ianstewart@cpaautomation.ai'
    last_history_id  = Column(String(50))        # Gmail History cursor (if using watch)
    last_internal_dt = Column(BigInteger)        # Fallback cursor (ms since epoch)
    watch_channel_id = Column(String(255))       # if using watch + Pub/Sub
    watch_resource_id= Column(String(255))
    watch_expire_at  = Column(TIMESTAMP(timezone=True))
    updated_at       = Column(TIMESTAMP(timezone=True),
                               server_default=func.now(),
                               onupdate=func.now(),
                               nullable=False)
```

**B) `automations`** — simplified trigger & filters, **FK to integration account** (email source of truth)

```python
# In IntegrationAccount (authoritative Google identity)
class IntegrationAccount(Base):
    __tablename__ = "integration_accounts"
    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider   = Column(Enum("google_drive", name="integration_provider"), nullable=False)
    email      = Column(String(255), nullable=False)  # normalized account email (source of truth)
    # ... tokens, created_at/updated_at, etc.

# In Automation (reference integration)
class Automation(Base):
    __tablename__ = "automations"
    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id                = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # NEW: tie automation to a specific Drive integration (and thus its current email)
    integration_account_id = Column(UUID(as_uuid=True),
                                    ForeignKey("integration_accounts.id", ondelete="CASCADE"),
                                    nullable=False)

    # other existing fields...

    # relationships (optional for ORM convenience)
    integration_account    = relationship("IntegrationAccount")
```

> **Deprecate** `integration_accounts.last_history_id` (unused in code; drop in a later migration).

## 6) Worker Logic

### 6.1 Drive import (unchanged core; **no recursion**)

- In other to work with drive.file permissions, this will no longer recursively search for files within folders. Note that we will still allow ZIP file import.
    

---

### 6.2 Central Mail Ingest (**Gmail Pub/Sub watch**)

**Auth:** Service account with **Domain-Wide Delegation** impersonating `ianstewart@…` and scope `gmail.readonly`. (End users never grant Gmail scopes.)

#### 6.2.1 Watch lifecycle (setup & renewal)

1. On deploy (or via a maintenance task) call `users.watch` for the mailbox:
    
    - `topicName: projects/<PROJECT>/topics/<TOPIC>`
        
    - Optionally restrict by `labelIds`.
        
2. Persist in `gmail_ingest_state`:
    
    - `watch_resource_id`, `watch_expire_at`, and the returned **`historyId`** (as the new `last_history_id`).
        
3. Renew the watch **before** `watch_expire_at` or when you receive a sync/stop signal (message without a `historyId`). Update state accordingly.
    

#### 6.2.2 Pub/Sub push handler (Cloud Run service)

1. **Validate** Pub/Sub invocation (use Cloud Run Pub/Sub Invoker).
    
2. Decode message data → extract:
    
    - `emailAddress` (must match `gmail_ingest_state.mailbox_email`), and
        
    - `historyId` (may be absent on sync).
        
3. **Singleflight lock** per mailbox (Redis `SETNX` with TTL, e.g., 15 min). If lock already held:
    
    - **ACK** and return (another instance is draining backlog).
        

#### 6.2.3 Ingest loop (advance by history)

1. Load `cursor = gmail_ingest_state.last_history_id`.
    
2. Iterate Gmail History until caught up:
    
    ```
    do:
      resp = users.history.list(
        startHistoryId=cursor,
        historyTypes=['messageAdded','labelAdded'],
        maxResults=500,
        pageToken=...
      )
      process(resp.history)   # see 7.2.4
      cursor = resp.historyId # highest ID seen in this page
    while resp.nextPageToken
    ```
    
3. On success, persist `last_history_id = cursor`.
    

#### 6.2.4 Per-message processing

For each history entry (typically `messagesAdded`):

- Fetch message metadata (use `format='metadata'` with headers: `To`, `Cc`, `Delivered-To`, `From`, `Subject`).
    
- **Recipient check** → accept only if `document@cpaautomation.ai` is present in `To`/`Cc`, or `Delivered-To` equals that alias (covers BCC).
    
- **Sender check** → normalize `From` and ensure it equals a known `integration_accounts.email` (the Drive-connected user).
    
- Apply the user’s automation **filters** (`subjectContains`, `fileNameContains`, `mimeIncludes[]`).
    
- For each matched **attachment**:
    
    - **Idempotency**:
        
        ```sql
        INSERT INTO automation_processed_messages (automation_id, message_id, attachment_id)
        VALUES (:auto, :msg, :att)
        ON CONFLICT DO NOTHING
        ```
        
        If insert affected 0 rows → already processed; skip.
        
    - Download with `users.messages.attachments.get`, stream to **GCS**, create `source_files` rows attributed to that user/job.
        
- If ≥ 1 file imported for an automation:
    
    - Enqueue `run_initializer_worker(job_id)` then `export_worker(run_id, export_config)`.
        

#### 6.2.5 Recovery path (keep `last_internal_dt` as a safety net)

If `users.history.list(startHistoryId=cursor)` returns **404 (HistoryId too old)** or watch expired:

1. **Fallback poll** using time cursor:
    
    - List recent messages (e.g., `users.messages.list(q="newer_than:7d")`) and process those with `internalDate > last_internal_dt`, applying the same recipient/sender/filter logic and idempotency.
        
2. After backfill:
    
    - Call `users.watch` again to **re-seed** a fresh `historyId`.
        
    - Persist both `last_history_id` (from watch response) **and** bump `last_internal_dt` to the max `internalDate` processed.
        
3. Continue normal Pub/Sub processing.
    

#### 6.2.6 State advance & unlock

- On every successful drain, update:
    
    - `gmail_ingest_state.last_history_id = cursor`
        
    - `gmail_ingest_state.updated_at = now()`
        
    - Optionally `last_internal_dt = max(processed.internalDate)` (useful for sanity and recovery).
        
- **Release** the Redis lock. Return 200 so Pub/Sub **ACKs** the message.
    

**Header parsing helpers (Python):**

```python
def is_addressed_to_alias(headers: dict) -> bool:
    blob = ' '.join([headers.get('To',''), headers.get('Cc',''), headers.get('Delivered-To','')]).lower()
    return 'document@cpaautomation.ai' in blob

def normalized_sender(headers: dict) -> str:
    from email.utils import parseaddr
    return parseaddr(headers.get('From',''))[1].lower()
```

**Operational notes**

- Expect **duplicate** Pub/Sub notifications; idempotency table prevents double work.
    
- **Ordering** isn’t guaranteed; history paging ensures you catch all deltas.
    
- If you later add `gmail.modify` to label/archive processed mail, perform it **after** successful ingest (not part of read-only MVP).
    

---

### 6.3 Exports

- If `destType='gdrive'`, require `folderId`; create file with `parents: [folderId]` using the user’s Drive `drive.file` token.

---

## 7) Security, Privacy, & Compliance Notes

- **End users do not grant Gmail scopes.** Only Drive **file-scoped** permissions are requested.
    
- The **central mailbox** is under Workspace control; processing is limited to items explicitly addressed to `document@…`.
    
- We process emails only from **verified owners** (sender email matches a connected Drive integration).
    
- **Data retention:**
    
    - Emails remain in the central mailbox (read-only access) — we recommend an admin policy to auto-label/archive after N days or use `gmail.modify` later to label as processed.
        
    - GCS files retained per your existing policy (e.g., 90 days) and surfaced in the app.
        
- **PII disclosures**: Update privacy note accordingly.
    

---

## 8) Deployment & Configuration (GCP)

1. **OAuth consent**: Drive scopes only.
    
2. **Service account + DWD** _(preferred)_:
    
    - Create SA (e.g., `cpa-central-ingest@...`); enable **Domain-Wide Delegation**.
        
    - In Admin Console → Security → API controls → **Domain-wide delegation**:
        
        - Client ID = SA OAuth client.
            
        - Scopes: `https://www.googleapis.com/auth/gmail.readonly`.
            
3. **Alias/Group**:
    
    - Create `document@cpaautomation.ai` as alias of or group delivering to `ianstewart@…`.
        
4. **Secrets**:
    
    - Store SA JSON (or use Workload Identity + IAM perms), Drive OAuth client secrets, and database credentials in Secret Manager.
        
5. **Cloud Run**:
    
    - API & Web services as before.
        
    - **central_mail_ingest**:
        
        - As **Cloud Run Job** via **Cloud Scheduler** every 2 minutes, or as a **service** if using Gmail Watch.
            
        - Env: `GMAIL_INGEST_MAILBOX=ianstewart@cpaautomation.ai`.
            
6. **Redis/ARQ**: unchanged; ensure workers can reach Redis (public or VPC connector).
    

---

## 9) Migration Plan

1. **DB**
    
    - Add `gmail_ingest_state`.
        
    - Add/alter `automations` fields (`trigger_type`, `owner_email`, `filters`).
        
    - Create `automation_processed_messages`.
        
    - Stop reading `integration_accounts.last_history_id` (drop the column).
        
2. **Backend**
    
    - Remove user Gmail OAuth flows.
        
    - Add central mail ingest worker and endpoints.
        
    - Drive controllers: enforce Picker-only file IDs; export requires folderId.
        
3. **Frontend**
    
    - Update Drive Pickers (files only / folders only).
        
    - Automations UI: central mail pattern + verified sender display.
        
4. **Ops**
    
    - Create alias/group for `document@…`.
        
    - Configure DWD (or mailbox OAuth) and secrets.
        
    - Deploy; smoke test.
        

Rollback: revert to previous branch; no destructive migrations are required.

---
