"""
SQLAlchemy database models for ByteReview
Integration phase - supports multi-source ingestion, exports, and automations
"""
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportReturnType=false

from typing import Optional, cast

import enum

from sqlalchemy import Column, String, Integer, BigInteger, Boolean, Text, TIMESTAMP, ForeignKey, UUID, LargeBinary, ARRAY, CheckConstraint, Numeric, Date, Enum, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.mutable import MutableDict
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import expression, func, text
import uuid

Base = declarative_base()


# ---------------------------------------------------------------------------
# CPAAnalytics enums (Phase 5.1)
# ---------------------------------------------------------------------------


class AnalyticsUserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    ANALYST = "analyst"
    REVIEWER = "reviewer"
    VIEWER = "viewer"


class AnalyticsUserPersona(str, enum.Enum):
    STAFF_ACCOUNTANT = "staff_accountant"
    SENIOR_ACCOUNTANT = "senior_accountant"
    ACCOUNTING_MANAGER = "accounting_manager"
    CPA_PARTNER = "cpa_partner"


class AnalyticsProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    ARCHIVED = "archived"


class AnalyticsProjectModule(str, enum.Enum):
    VARIANCE = "variance"
    RECONCILIATION = "reconciliation"
    AMORTIZATION = "amortization"
    WATERFALL = "waterfall"
    IRS = "irs"
    GAAP = "gaap"
    ASSISTANT = "assistant"
    OTHER = "other"

class User(Base):
    """App-specific user profile data linked to Firebase Auth"""
    __tablename__ = "users"

    id = Column(String(128), primary_key=True)  # Firebase UID
    email = Column(String(255), unique=True, nullable=False)
    phone_number = Column(String(32), unique=True, nullable=True)
    phone_verified_at = Column(TIMESTAMP(timezone=True), nullable=True)
    display_name = Column(String(255))
    photo_url = Column(Text)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="SET NULL"), nullable=True)
    role = Column(
        Enum(AnalyticsUserRole, name="analytics_user_role", create_type=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        server_default=AnalyticsUserRole.ANALYST.value,
    )
    persona = Column(
        Enum(AnalyticsUserPersona, name="analytics_user_persona", create_type=False, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
    )
    title = Column(String(255), nullable=True)
    welcome_tour_seen_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    templates = relationship("Template", back_populates="user", cascade="all, delete-orphan")
    form_fill_templates = relationship("FormFillTemplate", back_populates="user", cascade="all, delete-orphan")
    form_fill_runs = relationship("FormFillRun", back_populates="user", cascade="all, delete-orphan")
    extraction_jobs = relationship("ExtractionJob", back_populates="user", cascade="all, delete-orphan")
    integration_accounts = relationship("IntegrationAccount", back_populates="user", cascade="all, delete-orphan")
    automations = relationship("Automation", back_populates="user", cascade="all, delete-orphan")
    billing_account = relationship("BillingAccount", back_populates="user", uselist=False, cascade="all, delete-orphan")
    firm = relationship("Firm", back_populates="users")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    assigned_projects = relationship(
        "Project",
        back_populates="assignee",
        foreign_keys="Project.assigned_to_user_id",
    )
    activation_keys = relationship("ActivationKey", back_populates="user", cascade="all, delete-orphan")

class ActivationKey(Base):
    """Per-user AccountingClaw activation key.

    A user redeems an activation code in the web app and is issued a personal,
    revocable key (``cpaa_live_<random>``). The AccountingClaw container exchanges
    this key at startup (POST /api/activation/resolve) for the real build-time
    ``CPAA_BUNDLE_SECRET`` that decrypts the bundled skills.

    Only a SHA-256 hash of the full key is stored; the plaintext key is shown to
    the user exactly once at activation. ``key_lookup`` is a non-secret prefix of
    the random part used for an indexed O(1) lookup at resolve time, after which
    the full key is verified with a constant-time hash comparison.
    """
    __tablename__ = "activation_keys"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    key_lookup = Column(String(16), nullable=False, unique=True)  # non-secret lookup handle
    key_hash = Column(String(64), nullable=False)  # sha256 hex of the full key
    key_prefix = Column(String(24), nullable=False)  # masked value for display, e.g. "cpaa_live_AbCd…"
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)  # non-null => revoked
    last_resolved_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_resolved_fingerprint = Column(String(128), nullable=True)
    resolve_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Future hooks (not implemented yet): expires_at, seat_limit, license_token.

    user = relationship("User", back_populates="activation_keys")

    __table_args__ = (
        # A user may hold at most one active (non-revoked) key at a time. Revoked
        # rows are retained for history, so this is a partial unique index.
        Index(
            "uq_activation_keys_active_user",
            "user_id",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )


class ActivationCode(Base):
    """A six-digit code that may be redeemed for an AccountingClaw activation key.

    Replaces the single universal CPAA_ACTIVATION_CODE env value. Multiple codes may
    be valid at once; each is reusable by many users and can be disabled by flipping
    ``active`` to false. Codes are managed directly in the database (insert/update).
    """
    __tablename__ = "activation_codes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code = Column(String(6), nullable=False, unique=True)  # the six-digit code, plaintext
    active = Column(Boolean, nullable=False, server_default=expression.true())
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class DataType(Base):
    """Canonical list of supported data types for extraction"""
    __tablename__ = "data_types"
    
    id = Column(String(50), primary_key=True)  # e.g., 'date_ymd', 'currency'
    display_name = Column(String(100), nullable=False)  # e.g., 'Date (YYYY-MM-DD)'
    base_json_type = Column(String(20), nullable=False)  # 'string', 'number', 'integer', 'boolean'
    json_format = Column(String(50))  # Optional: 'date', 'email', 'uri' for JSON Schema validation
    description = Column(Text)  # For UI tooltips
    display_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    template_fields = relationship("TemplateField", back_populates="data_type")
    job_fields = relationship("JobField", back_populates="data_type")

class SystemPrompt(Base):
    """System-level prompt templates for AI interaction"""
    __tablename__ = "system_prompts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), unique=True, nullable=False)  # e.g., 'default_extraction_v2'
    template_text = Column(Text, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

class Template(Base):
    """User-created template for a specific kind of extraction"""
    __tablename__ = "templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)  # Nullable for public templates
    name = Column(String(255), nullable=False)
    description = Column(Text)  # Add description field
    is_public = Column(Boolean, nullable=False, default=False)  # Add is_public field
    template_type = Column(String(50), nullable=False, default='extraction')  # 'extraction' or 'cpe'
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    # Relationships
    user = relationship("User", back_populates="templates")
    template_fields = relationship("TemplateField", back_populates="template", cascade="all, delete-orphan")
    job_runs = relationship("JobRun", back_populates="template")

    __table_args__ = (
        {"schema": None}  # Ensure unique constraint on (user_id, name)
    )


class FormFillTemplate(Base):
    """Reusable target document template for Form Fill."""
    __tablename__ = "form_fill_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    original_filename = Column(Text, nullable=False)
    file_type = Column(String(100), nullable=False)
    allow_docx_table_expansion = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    fill_chronologically = Column(Boolean, nullable=False, default=True, server_default=expression.true())
    gcs_object_name = Column(Text, unique=True, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    page_count = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="form_fill_templates")
    runs = relationship("FormFillRun", back_populates="target_template")


class FormFillRun(Base):
    """Single Form Fill request and its generated output."""
    __tablename__ = "form_fill_runs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), nullable=False, default="pending")
    source_mode = Column(String(50), nullable=False)
    source_filename = Column(Text)
    source_file_type = Column(String(100))
    source_gcs_object_name = Column(Text)
    source_file_size_bytes = Column(BigInteger)
    source_payload = Column(MutableDict.as_mutable(JSONB), nullable=True)
    source_job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="SET NULL"), nullable=True)
    source_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="SET NULL"), nullable=True)
    source_task_id = Column(UUID(as_uuid=True), ForeignKey("extraction_tasks.id", ondelete="SET NULL"), nullable=True)
    target_mode = Column(String(50), nullable=False)
    target_template_id = Column(UUID(as_uuid=True), ForeignKey("form_fill_templates.id", ondelete="SET NULL"), nullable=True)
    target_filename = Column(Text, nullable=False)
    target_file_type = Column(String(100), nullable=False)
    allow_docx_table_expansion = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    fill_chronologically = Column(Boolean, nullable=False, default=True, server_default=expression.true())
    target_gcs_object_name = Column(Text, nullable=False)
    target_file_size_bytes = Column(BigInteger, nullable=False)
    target_page_count = Column(Integer, nullable=True)
    output_format = Column(String(20), nullable=False)
    repeat_mode = Column(String(50), nullable=False, default="all_sources", server_default="all_sources")
    total_outputs = Column(Integer, nullable=False, default=1, server_default="1")
    completed_outputs = Column(Integer, nullable=False, default=0, server_default="0")
    failed_outputs = Column(Integer, nullable=False, default=0, server_default="0")
    usage_basis = Column(String(32), nullable=True)
    usage_pages = Column(Integer, nullable=True)
    source_record_config = Column(MutableDict.as_mutable(JSONB), nullable=True)
    processing_strategy = Column(String(50))
    warnings = Column(JSONB, nullable=True)
    fill_plan = Column(MutableDict.as_mutable(JSONB), nullable=True)
    result_gcs_object_name = Column(Text)
    result_filename = Column(Text)
    result_file_type = Column(String(100))
    error_message = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    completed_at = Column(TIMESTAMP(timezone=True))

    user = relationship("User", back_populates="form_fill_runs")
    target_template = relationship("FormFillTemplate", back_populates="runs")
    source_files = relationship(
        "FormFillSourceFile",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="FormFillSourceFile.display_order",
    )
    outputs = relationship(
        "FormFillOutput",
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="FormFillOutput.record_index",
    )


class FormFillSourceFile(Base):
    """Uploaded source file attached to a Form Fill run."""
    __tablename__ = "form_fill_source_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("form_fill_runs.id", ondelete="CASCADE"), nullable=False)
    original_filename = Column(Text, nullable=False)
    file_type = Column(String(100), nullable=False)
    gcs_object_name = Column(Text, unique=True, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    run = relationship("FormFillRun", back_populates="source_files")


class FormFillOutput(Base):
    """Single generated document within a Form Fill run."""
    __tablename__ = "form_fill_outputs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id = Column(UUID(as_uuid=True), ForeignKey("form_fill_runs.id", ondelete="CASCADE"), nullable=False)
    record_index = Column(Integer, nullable=False)
    record_label = Column(Text, nullable=False)
    record_payload = Column(MutableDict.as_mutable(JSONB), nullable=True)
    status = Column(String(50), nullable=False, default="pending", server_default="pending")
    warnings = Column(JSONB, nullable=True)
    fill_plan = Column(MutableDict.as_mutable(JSONB), nullable=True)
    result_gcs_object_name = Column(Text)
    result_filename = Column(Text)
    result_file_type = Column(String(100))
    error_message = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    completed_at = Column(TIMESTAMP(timezone=True))

    run = relationship("FormFillRun", back_populates="outputs")

class TemplateField(Base):
    """Specific fields defined within a user's template"""
    __tablename__ = "template_fields"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id", ondelete="CASCADE"), nullable=False)
    field_name = Column(String(100), nullable=False)
    data_type_id = Column(String(50), ForeignKey("data_types.id"), nullable=False)
    ai_prompt = Column(Text, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    template = relationship("Template", back_populates="template_fields")
    data_type = relationship("DataType", back_populates="template_fields")

class ExtractionJob(Base):
    """A single extraction job, representing one user session"""
    __tablename__ = "extraction_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255))  # User-friendly, nullable name
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    job_type = Column(String(50), nullable=False, default='extraction')  # 'extraction' or 'cpe'

    # Activity and Concurrency Control
    last_active_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    version = Column(Integer, nullable=False, default=1)  # For optimistic locking

    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    # Relationships
    user = relationship("User", back_populates="extraction_jobs")
    job_runs = relationship("JobRun", back_populates="job", cascade="all, delete-orphan")
    automations = relationship("Automation", back_populates="job", cascade="all, delete-orphan")
    
    @property
    def latest_run(self):
        """Get the latest job run"""
        if not self.job_runs:
            return None
        return max(self.job_runs, key=lambda run: run.created_at)
    
    @property
    def is_resumable(self) -> bool:
        """A job is resumable if latest run is resumable"""
        latest = self.latest_run
        if not latest:
            return False
        return latest.is_resumable
    
    @property 
    def progress_percentage(self) -> float:
        """Calculate progress based on latest run"""
        latest = self.latest_run
        if not latest:
            return 0
        return latest.progress_percentage

class JobRun(Base):
    """A single run of an extraction job, allowing multiple executions"""
    __tablename__ = "job_runs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id", ondelete="SET NULL"))
    # When this run was created in append mode, reference the source run it copied from
    append_from_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="SET NULL"), nullable=True)
    
    # Wizard/Configuration State
    config_step = Column(String(20), nullable=False, default='upload')  # 'upload', 'fields', 'review', 'submitted'
    
    # Processing Lifecycle State  
    status = Column(String(50), nullable=False, default='pending')  # 'pending', 'in_progress', 'partially_completed', 'completed', 'failed', 'cancelled'
    
    # Progress Tracking
    tasks_total = Column(Integer, nullable=False, default=0)
    tasks_completed = Column(Integer, nullable=False, default=0)
    tasks_failed = Column(Integer, nullable=False, default=0)
    
    # Configuration
    persist_data = Column(Boolean, nullable=False, default=True)
    # Run-level description of extraction purpose (copied from template or edited by user)
    description = Column(Text)
    
    # Timestamps
    last_active_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(TIMESTAMP(timezone=True))
    
    # Relationships
    job = relationship("ExtractionJob", back_populates="job_runs")
    template = relationship("Template", back_populates="job_runs")
    job_fields = relationship("JobField", back_populates="job_run", cascade="all, delete-orphan")
    source_files = relationship("SourceFile", back_populates="job_run", cascade="all, delete-orphan")
    extraction_tasks = relationship("ExtractionTask", back_populates="job_run", cascade="all, delete-orphan")
    job_exports = relationship("JobExport", back_populates="job_run", cascade="all, delete-orphan")
    automation_runs = relationship("AutomationRun", back_populates="job_run", cascade="all, delete-orphan")
    
    @property
    def is_resumable(self) -> bool:
        """A run is resumable if wizard not done OR processing incomplete/errored"""
        return (
            self.config_step != 'submitted' or 
            (self.status in ('in_progress', 'partially_completed', 'failed') and 
             self.tasks_completed < self.tasks_total)
        )
    
    @property 
    def progress_percentage(self) -> float:
        """Calculate progress with safety checks"""
        current_step = cast(str, self.config_step)
        tasks_total = cast(int, self.tasks_total)
        tasks_completed = cast(int, self.tasks_completed)
        current_status = cast(str, self.status)

        if current_step != 'submitted':
            # Wizard progress
            steps = ['upload', 'fields', 'review', 'submitted']
            try:
                step_index = steps.index(current_step)
                return min(100, max(0, (step_index / 3) * 100))
            except ValueError:
                return 0
        else:
            # Processing progress
            if tasks_total <= 0:
                return 100 if current_status == 'completed' else 0
            
            completed = max(0, tasks_completed)
            total = max(1, tasks_total)  # Prevent division by zero
            return min(100, (completed / total) * 100)

class JobField(Base):
    """Snapshot of fields used for a specific job run, ensuring immutability"""
    __tablename__ = "job_fields"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="CASCADE"), nullable=False)
    field_name = Column(String(100), nullable=False)
    data_type_id = Column(String(50), ForeignKey("data_types.id"), nullable=False)
    ai_prompt = Column(Text, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    job_run = relationship("JobRun", back_populates="job_fields")
    data_type = relationship("DataType", back_populates="job_fields")

class SourceFile(Base):
    """A single source file uploaded by the user"""
    __tablename__ = "source_files"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="CASCADE"), nullable=False)
    original_filename = Column(Text, nullable=False)
    original_path = Column(Text, nullable=False)
    gcs_object_name = Column(Text, unique=True, nullable=False)
    file_type = Column(String(100), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    page_count = Column(Integer, nullable=True)  # Number of pages in the file (for PDFs)
    status = Column(String(50), nullable=False, default='uploading')
    source_type = Column(String(20), nullable=False, default='upload')
    external_id = Column(Text)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    job_run = relationship("JobRun", back_populates="source_files")
    source_files_to_tasks = relationship("SourceFileToTask", back_populates="source_file", cascade="all, delete-orphan")

class ExtractionTask(Base):
    """A single unit of work to be sent to the AI"""
    __tablename__ = "extraction_tasks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="CASCADE"), nullable=False)
    processing_mode = Column(String(50), nullable=False, default='individual')  # 'individual' or 'combined'
    status = Column(String(50), nullable=False, default='pending')
    error_message = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    processed_at = Column(TIMESTAMP(timezone=True))
    # Result set ordering within a run: 0 for original, 1+ for each appended set
    result_set_index = Column(Integer, nullable=False, default=0)
    
    # Relationships
    job_run = relationship("JobRun", back_populates="extraction_tasks")
    source_files_to_tasks = relationship("SourceFileToTask", back_populates="task", cascade="all, delete-orphan")
    extraction_result = relationship("ExtractionResult", back_populates="task", uselist=False, cascade="all, delete-orphan")

class SourceFileToTask(Base):
    """Many-to-many link table between files and tasks"""
    __tablename__ = "source_files_to_tasks"
    
    source_file_id = Column(UUID(as_uuid=True), ForeignKey("source_files.id", ondelete="CASCADE"), primary_key=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("extraction_tasks.id", ondelete="CASCADE"), primary_key=True)
    
    # Relationships
    source_file = relationship("SourceFile", back_populates="source_files_to_tasks")
    task = relationship("ExtractionTask", back_populates="source_files_to_tasks")

class ExtractionResult(Base):
    """The structured data extracted from a single task"""
    __tablename__ = "extraction_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("extraction_tasks.id", ondelete="CASCADE"), unique=True, nullable=False)
    # Use MutableDict so SQLAlchemy reliably persists in-place JSON mutations
    # (row edits/deletes, row_id backfills, manual rows, etc.).
    extracted_data = Column(MutableDict.as_mutable(JSONB), nullable=False)
    processed_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    
    # Relationships
    task = relationship("ExtractionTask", back_populates="extraction_result")

# ===================================================================
# Integration Phase Models
# ===================================================================

class IntegrationAccount(Base):
    """OAuth credentials for third-party integrations (Google, Microsoft, etc.)"""
    __tablename__ = "integration_accounts"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(30), nullable=False)
    scopes = Column(ARRAY(Text), nullable=False)
    access_token = Column(LargeBinary)  # AES-GCM encrypted
    refresh_token = Column(LargeBinary)  # AES-GCM encrypted
    expires_at = Column(TIMESTAMP(timezone=True))
    email = Column(String(255), nullable=True)  # User's email for sender matching
    last_history_id = Column(String(50), nullable=True)  # Gmail history ID for incremental sync
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Constraints
    __table_args__ = (
        CheckConstraint("provider IN ('google', 'microsoft')", name="check_provider"),
    )
    
    # Relationships
    user = relationship("User", back_populates="integration_accounts")
    
    def set_access_token(self, token: str):
        """Encrypt and store access token"""
        from services.encryption_service import encryption_service
        self.access_token = encryption_service.encrypt_token(token)
    
    def get_access_token(self) -> Optional[str]:
        """Decrypt and return access token"""
        encrypted_access_token = cast(Optional[bytes], self.access_token)
        if encrypted_access_token is None:
            return None
        from services.encryption_service import encryption_service
        return encryption_service.decrypt_token(encrypted_access_token)
    
    def set_refresh_token(self, token: str):
        """Encrypt and store refresh token"""
        from services.encryption_service import encryption_service
        self.refresh_token = encryption_service.encrypt_token(token)
    
    def get_refresh_token(self) -> Optional[str]:
        """Decrypt and return refresh token"""
        encrypted_refresh_token = cast(Optional[bytes], self.refresh_token)
        if encrypted_refresh_token is None:
            return None
        from services.encryption_service import encryption_service
        return encryption_service.decrypt_token(encrypted_refresh_token)

class JobExport(Base):
    """Export operations for job run results to various destinations"""
    __tablename__ = "job_exports"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="CASCADE"), nullable=False)
    dest_type = Column(String(15), nullable=False)
    file_type = Column(String(10), nullable=False)
    status = Column(String(20), nullable=False, default='pending')
    external_id = Column(Text)  # Drive file ID or Gmail message ID
    error_message = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Constraints
    __table_args__ = (
        CheckConstraint("dest_type IN ('download', 'gdrive', 'gmail')", name="check_dest_type"),
        CheckConstraint("file_type IN ('csv', 'xlsx')", name="check_file_type"),
    )
    
    # Relationships
    job_run = relationship("JobRun", back_populates="job_exports")

class Automation(Base):
    """Automated workflows triggered by external events"""
    __tablename__ = "automations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(Text, nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=True)
    trigger_type = Column(String(30), nullable=False)  # 'gmail_attachment' for v1
    trigger_config = Column(JSONB, nullable=False)
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
    processing_mode = Column(String(50), nullable=False, default='individual')  # 'individual' or 'combined'
    # Whether each automation run should append results from the previous run
    append_results = Column(Boolean, nullable=False, default=False)
    dest_type = Column(String(30), nullable=True)  # 'gdrive', 'gmail' when present, NULL when no export
    export_config = Column(JSONB, nullable=True)  # MUST be NULL when dest_type is NULL
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="automations")
    job = relationship("ExtractionJob", back_populates="automations")
    automation_runs = relationship("AutomationRun", back_populates="automation", cascade="all, delete-orphan")

class AutomationRun(Base):
    """Individual executions of an automation"""
    __tablename__ = "automation_runs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id = Column(UUID(as_uuid=True), ForeignKey("automations.id", ondelete="CASCADE"), nullable=False)
    job_run_id = Column(UUID(as_uuid=True), ForeignKey("job_runs.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(20), nullable=False, default='pending')  # pending, running, completed, failed
    error_message = Column(Text)
    
    # Import tracking
    imports_total = Column(Integer, nullable=True)
    imports_successful = Column(Integer, nullable=True)
    imports_failed = Column(Integer, nullable=True)
    imports_processed = Column(Integer, nullable=True)
    imports_processing_failed = Column(Integer, nullable=True)
    
    triggered_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(TIMESTAMP(timezone=True))
    
    # Relationships
    automation = relationship("Automation", back_populates="automation_runs")
    job_run = relationship("JobRun", back_populates="automation_runs")

class AutomationProcessedMessage(Base):
    """Track which Gmail messages have been processed by which automations"""
    __tablename__ = "automation_processed_messages"
    
    # Match the existing table structure exactly
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    automation_id = Column(UUID(as_uuid=True), ForeignKey("automations.id", ondelete="CASCADE"), nullable=False)
    message_id = Column(String(255), nullable=False)  # Gmail message ID
    processed_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    
    # Relationships
    automation = relationship("Automation")
    
    # Add unique constraint to prevent duplicates
    __table_args__ = (
        # Prevent duplicate processing of same message by same automation
        CheckConstraint("automation_id IS NOT NULL AND message_id IS NOT NULL", name="check_automation_message_required"),
    )

class CentralMailboxState(Base):
    """Track processing state for the central document@cpaautomation.ai mailbox"""
    __tablename__ = "central_mailbox_state"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    mailbox_address = Column(String(255), nullable=False, unique=True)
    last_history_id = Column(String(50), nullable=True)  # Cursor for users.history.list
    last_internal_dt = Column(BigInteger, nullable=True)  # Fallback time cursor (ms since epoch) for 404 recovery
    watch_expire_at = Column(TIMESTAMP(timezone=True), nullable=True)  # From users.watch().expiration
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

# ===================================================================
# Billing & Subscription Models
# ===================================================================

class SubscriptionPlan(Base):
    """Plan catalog and Stripe mapping"""
    __tablename__ = "subscription_plans"
    
    code = Column(Text, primary_key=True)  # 'free'|'basic'|'pro'
    display_name = Column(Text, nullable=False)
    pages_included = Column(Integer, nullable=False)
    automations_limit = Column(Integer, nullable=False)
    overage_cents = Column(Integer, nullable=False)  # 0 for free
    stripe_product_id = Column(Text, nullable=True)  # NULL for 'free'
    stripe_price_recurring_id = Column(Text, nullable=True)
    stripe_price_metered_id = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    billing_accounts = relationship("BillingAccount", back_populates="plan")

class BillingAccount(Base):
    """One row per user; free users: plan_code='free', no Stripe IDs"""
    __tablename__ = "billing_accounts"
    
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    plan_code = Column(Text, ForeignKey("subscription_plans.code"), nullable=False)
    stripe_customer_id = Column(Text, nullable=True)  # NULL until first upgrade
    stripe_subscription_id = Column(Text, nullable=True)  # NULL for free
    current_period_start = Column(TIMESTAMP(timezone=True), nullable=True)  # from Stripe for paid; calendar month for free
    current_period_end = Column(TIMESTAMP(timezone=True), nullable=True)
    status = Column(Text, nullable=False, default='active')  # 'active','past_due','canceled','paused'
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="billing_account")
    plan = relationship("SubscriptionPlan", back_populates="billing_accounts")

class UsageEvent(Base):
    """Authoritative, append-only usage events"""
    __tablename__ = "usage_events"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    occurred_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    source = Column(Text, nullable=False)  # 'extraction_task', 'manual_adjustment', etc.
    task_id = Column(UUID(as_uuid=True), ForeignKey("extraction_tasks.id", ondelete="SET NULL"), nullable=True)  # NULL for manual adjustments
    inkwise_ingestion_id = Column(UUID(as_uuid=True), ForeignKey("inkwise_source_ingestions.id", ondelete="SET NULL"), nullable=True)
    form_fill_run_id = Column(UUID(as_uuid=True), ForeignKey("form_fill_runs.id", ondelete="SET NULL"), nullable=True)
    pages = Column(Integer, nullable=False)
    # Raw token usage for analytics LLM calls (NULL for page-based sources like
    # extraction / Form Fill / Inkwise). Billing still uses `pages`; these are
    # for durable token tracking and reporting only.
    prompt_tokens = Column(Integer, nullable=True)
    output_tokens = Column(Integer, nullable=True)
    total_tokens = Column(Integer, nullable=True)
    stripe_reported = Column(Boolean, nullable=False, default=False)
    stripe_record_id = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    
    __table_args__ = (
        CheckConstraint("pages >= 0", name="check_pages_non_negative"),
    )
    
    # Relationships
    user = relationship("User")
    task = relationship("ExtractionTask")
    form_fill_run = relationship("FormFillRun")

class UsageCounter(Base):
    """Cached totals per active period (fast UI reads)"""
    __tablename__ = "usage_counters"

    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    period_start = Column(TIMESTAMP(timezone=True), primary_key=True)
    period_end = Column(TIMESTAMP(timezone=True), nullable=False)
    pages_total = Column(Integer, nullable=False, default=0)
    # Cached sum of raw tokens consumed by analytics calls this period.
    tokens_total = Column(BigInteger, nullable=False, default=0, server_default="0")

    # Relationships
    user = relationship("User")


# ===================================================================
# CPAAnalytics Models
# ===================================================================

class Firm(Base):
    """Accounting firm — top-level multi-tenancy boundary for analytics data."""
    __tablename__ = "firms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    users = relationship("User", back_populates="firm")
    clients = relationship("Client", back_populates="firm", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="firm", cascade="all, delete-orphan")
    analyses = relationship("Analysis", back_populates="firm", cascade="all, delete-orphan")
    reconciliations = relationship("Reconciliation", back_populates="firm", cascade="all, delete-orphan")
    amortizations = relationship("Amortization", back_populates="firm", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="firm", cascade="all, delete-orphan")
    journal_entries = relationship("JournalEntry", back_populates="firm", cascade="all, delete-orphan")
    audit_logs = relationship("AnalyticsAuditLog", back_populates="firm", cascade="all, delete-orphan")
    comments = relationship("AnalyticsComment", back_populates="firm", cascade="all, delete-orphan")
    invite_code = relationship(
        "FirmInviteCode",
        back_populates="firm",
        cascade="all, delete-orphan",
        uselist=False,
    )


class FirmInviteCode(Base):
    """Six-character code that lets new users join an existing analytics firm."""

    __tablename__ = "firm_invite_codes"

    code = Column(String(6), primary_key=True)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    firm = relationship("Firm", back_populates="invite_code")


class Client(Base):
    """Client (customer) of an accounting firm."""
    __tablename__ = "clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    industry = Column(String(255), nullable=True)
    contact_name = Column(String(255), nullable=True)
    contact_email = Column(String(255), nullable=True)
    contact_phone = Column(String(64), nullable=True)
    fiscal_year_end = Column(String(32), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    firm = relationship("Firm", back_populates="clients")
    projects = relationship("Project", back_populates="client")
    analyses = relationship("Analysis", back_populates="client")
    reconciliations = relationship("Reconciliation", back_populates="client")
    amortizations = relationship("Amortization", back_populates="client")
    chat_sessions = relationship("ChatSession", back_populates="client")
    journal_entries = relationship("JournalEntry", back_populates="client")


class Project(Base):
    """Engagement or workstream tied to a client."""
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    assigned_to_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    status = Column(
        Enum(AnalyticsProjectStatus, name="analytics_project_status", create_type=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        server_default=AnalyticsProjectStatus.DRAFT.value,
    )
    module = Column(
        Enum(AnalyticsProjectModule, name="analytics_project_module", create_type=False, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        server_default=AnalyticsProjectModule.OTHER.value,
    )
    due_date = Column(Date(), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    firm = relationship("Firm", back_populates="projects")
    client = relationship("Client", back_populates="projects")
    assignee = relationship(
        "User",
        back_populates="assigned_projects",
        foreign_keys=[assigned_to_user_id],
    )


class Analysis(Base):
    """Variance or Waterfall analysis row."""
    __tablename__ = "analyses"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    type = Column(String(32), nullable=False)  # 'variance' | 'waterfall'
    name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="draft", server_default="draft")
    config = Column(JSONB, nullable=True)
    data = Column(JSONB, nullable=True)
    results = Column(JSONB, nullable=True)
    memo_content = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("type IN ('variance', 'waterfall')", name="ck_analyses_type"),
    )

    firm = relationship("Firm", back_populates="analyses")
    client = relationship("Client", back_populates="analyses")


class Reconciliation(Base):
    """Multi-source transaction reconciliation."""
    __tablename__ = "reconciliations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    name = Column(String(255), nullable=False)
    status = Column(String(50), nullable=False, default="draft", server_default="draft")
    source_a = Column(JSONB, nullable=True)
    source_b = Column(JSONB, nullable=True)
    rules = Column(JSONB, nullable=True)
    match_groups = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    firm = relationship("Firm", back_populates="reconciliations")
    client = relationship("Client", back_populates="reconciliations")


class Amortization(Base):
    """Asset / lease / loan / intangible amortization schedule."""
    __tablename__ = "amortizations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=False)
    asset_name = Column(String(255), nullable=False)
    asset_type = Column(String(64), nullable=False)  # 'fixed_asset'|'lease'|'loan'|'intangible'|'software'
    cost_basis = Column(Numeric(18, 2), nullable=True)
    salvage_value = Column(Numeric(18, 2), nullable=True)
    useful_life_months = Column(Integer, nullable=True)
    gaap_method = Column(String(64), nullable=True)
    tax_method = Column(String(64), nullable=True)
    start_date = Column(Date(), nullable=True)
    vendor = Column(String(255), nullable=True)
    status = Column(String(50), nullable=False, default="draft", server_default="draft")
    approval_status = Column(String(50), nullable=False, default="pending", server_default="pending")
    type_specific = Column(JSONB, nullable=True)
    schedule = Column(JSONB, nullable=True)
    tax_schedule = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    firm = relationship("Firm", back_populates="amortizations")
    client = relationship("Client", back_populates="amortizations")
    journal_entries = relationship("JournalEntry", back_populates="amortization", cascade="all, delete-orphan")


class ChatSession(Base):
    """IRS / GAAP research chat or AI assistant conversation."""
    __tablename__ = "chat_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    bot_type = Column(String(32), nullable=False)  # 'irs' | 'gaap' | 'assistant'
    title = Column(String(400), nullable=True)
    messages = Column(JSONB, nullable=False, default=list, server_default=expression.text("'[]'::jsonb"))
    # Documents uploaded to the session: [{id, name, text, summary?, extractedData?}]
    uploaded_docs = Column(JSONB, nullable=False, default=list, server_default=expression.text("'[]'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        CheckConstraint("bot_type IN ('irs', 'gaap', 'assistant')", name="ck_chat_sessions_bot_type"),
    )

    firm = relationship("Firm", back_populates="chat_sessions")
    user = relationship("User", back_populates="chat_sessions")
    client = relationship("Client", back_populates="chat_sessions")


class JournalEntry(Base):
    """Period journal entries generated from amortization schedules."""
    __tablename__ = "journal_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(UUID(as_uuid=True), ForeignKey("clients.id", ondelete="SET NULL"), nullable=True)
    amortization_id = Column(UUID(as_uuid=True), ForeignKey("amortizations.id", ondelete="CASCADE"), nullable=True)
    period = Column(String(32), nullable=False)
    entries = Column(JSONB, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    firm = relationship("Firm", back_populates="journal_entries")
    client = relationship("Client", back_populates="journal_entries")
    amortization = relationship("Amortization", back_populates="journal_entries")


class AnalyticsAuditLog(Base):
    """Per-action audit trail scoped to a firm."""
    __tablename__ = "analytics_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(128), nullable=False)
    details = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    firm = relationship("Firm", back_populates="audit_logs")


class AnalyticsComment(Base):
    """Generic comment thread keyed by (firm_id, entity_type, entity_id).

    Designed for reuse across analytics modules — e.g. entity_type='variance_row'
    with entity_id='<analysis_id>:<row_id>'. Replies use parent_comment_id;
    @mentions are stored as a JSONB array of Firebase UIDs. Soft delete via
    deleted_at.
    """
    __tablename__ = "analytics_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    entity_type = Column(String(48), nullable=False)
    entity_id = Column(String(128), nullable=False)
    parent_comment_id = Column(
        UUID(as_uuid=True), ForeignKey("analytics_comments.id", ondelete="CASCADE"), nullable=True
    )
    author_user_id = Column(
        String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=False
    )
    body = Column(Text, nullable=False)
    mentioned_user_ids = Column(
        JSONB, nullable=False, default=list, server_default=expression.text("'[]'::jsonb")
    )
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(
        TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    deleted_at = Column(TIMESTAMP(timezone=True), nullable=True)

    firm = relationship("Firm", back_populates="comments")
