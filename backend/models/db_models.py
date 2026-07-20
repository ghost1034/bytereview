"""
SQLAlchemy database models for ByteReview
Integration phase - supports multi-source ingestion, exports, and automations
"""
# pyright: reportArgumentType=false, reportAttributeAccessIssue=false, reportGeneralTypeIssues=false, reportOptionalMemberAccess=false, reportReturnType=false

from typing import Optional, cast

import enum

from sqlalchemy import Column, String, Integer, BigInteger, Boolean, Text, TIMESTAMP, ForeignKey, UUID, LargeBinary, ARRAY, CheckConstraint, Numeric, Date, Enum, Index, UniqueConstraint
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
    connector_connections = relationship("ConnectorConnection", back_populates="user", cascade="all, delete-orphan")
    connector_tokens = relationship("ConnectorToken", back_populates="user", cascade="all, delete-orphan")

class ActivationKey(Base):
    """Per-user AccountingClaw activation key.

    A user redeems an activation code in the web app and is issued a personal,
    revocable key (``cpaa_live_<random>``). The AccountingClaw container exchanges
    this key at startup (POST /api/activation/resolve) for the real build-time
    ``CPAA_BUNDLE_SECRET`` that decrypts the bundled skills. Desktop installs
    exchange the same key (POST /api/activation/bundle) for a short-lived signed
    URL to the plaintext profile bundle instead.

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
    last_resolved_install_type = Column(String(16), nullable=True)  # 'docker' | 'desktop'
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
    chrona_devices = relationship("ChronaDevice", back_populates="firm", cascade="all, delete-orphan")
    chrona_pairing_codes = relationship("ChronaPairingCode", back_populates="firm", cascade="all, delete-orphan")


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


# ===================================================================
# Chrona Integration Models
# ===================================================================

class ChronaDevice(Base):
    """A paired Chrona desktop install that syncs timeline cards into a firm.

    Pairing flow: a manager mints a short-lived pairing code in the dashboard,
    the Chrona user enters it, and the backend issues a long-lived scoped device
    token (``chrona_dev_<random>``). Chrona users do NOT get Firebase accounts.

    Token storage mirrors ActivationKey: only a SHA-256 hash is stored, with
    ``token_lookup`` (a non-secret prefix of the random part) for an indexed
    O(1) lookup and ``token_prefix`` as a masked display value. Setting
    ``revoked_at`` immediately cuts the device off (lookup filters on it).
    """
    __tablename__ = "chrona_devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False, index=True)
    paired_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    display_name = Column(String(255), nullable=False)
    token_lookup = Column(String(16), nullable=False, unique=True)  # non-secret lookup handle
    token_hash = Column(String(64), nullable=False)  # sha256 hex of the full token
    token_prefix = Column(String(24), nullable=False)  # masked value for display, e.g. "chrona_dev_AbCd…"
    platform = Column(String(32), nullable=True)  # 'darwin' | 'win32' | 'linux'
    app_version = Column(String(32), nullable=True)
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)  # non-null => revoked
    last_seen_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_sync_at = Column(TIMESTAMP(timezone=True), nullable=True)
    sync_count = Column(Integer, nullable=False, server_default="0")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    firm = relationship("Firm", back_populates="chrona_devices")
    timeline_cards = relationship("ChronaTimelineCard", back_populates="device", cascade="all, delete-orphan")


class ChronaPairingCode(Base):
    """Short-lived, single-use code that pairs a Chrona install to a firm.

    Minted by a manager in the dashboard (with the device's display name),
    valid for ~15 minutes, consumed exactly once by POST /api/chrona/sync/pair.
    """
    __tablename__ = "chrona_pairing_codes"

    code = Column(String(8), primary_key=True)  # normalized (uppercase, no ambiguous chars)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False, index=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    display_name = Column(String(255), nullable=False)  # the device created from this code inherits it
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    consumed_at = Column(TIMESTAMP(timezone=True), nullable=True)  # non-null => used
    consumed_device_id = Column(UUID(as_uuid=True), ForeignKey("chrona_devices.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    firm = relationship("Firm", back_populates="chrona_pairing_codes")


class ChronaTimelineCard(Base):
    """A timeline card synced from a Chrona device.

    Chrona card ids are local SQLite autoincrement ints, unique only per device,
    so ingestion UPSERTs on (device_id, source_card_id). ``content_hash`` lets
    the server skip no-op writes when a device resends unchanged cards.
    ``day_key`` is the device's LOCAL day, stored verbatim — never re-bucket by
    UTC. Screenshots/videos never leave the device; text fields only.
    """
    __tablename__ = "chrona_timeline_cards"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id = Column(UUID(as_uuid=True), ForeignKey("chrona_devices.id", ondelete="CASCADE"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)  # denormalized for fast firm queries
    source_card_id = Column(BigInteger, nullable=False)  # Chrona's local autoincrement id
    content_hash = Column(String(64), nullable=False)  # sha256 of the synced content fields
    title = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    detailed_summary = Column(Text, nullable=True)
    category = Column(String(64), nullable=False)
    subcategory = Column(String(64), nullable=True)
    start_ts = Column(BigInteger, nullable=False)  # epoch, stored verbatim from Chrona
    end_ts = Column(BigInteger, nullable=False)
    day_key = Column(Date(), nullable=False)  # device-local day, stored verbatim
    is_deleted = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    source_created_at = Column(TIMESTAMP(timezone=True), nullable=True)  # card's created_at on the device
    synced_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    device = relationship("ChronaDevice", back_populates="timeline_cards")

    __table_args__ = (
        Index("uq_chrona_cards_device_source", "device_id", "source_card_id", unique=True),
        Index("ix_chrona_cards_firm_day", "firm_id", "day_key"),
        Index(
            "ix_chrona_cards_device_day_active",
            "device_id",
            "day_key",
            postgresql_where=text("is_deleted = FALSE"),
        ),
        Index("ix_chrona_cards_firm_category", "firm_id", "category"),
    )


# ===================================================================
# E-Signature (esign) enums
# ===================================================================


class EsignEnvelopeStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    SEND_FAILED = "send_failed"
    SENT = "sent"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DECLINED = "declined"
    VOIDED = "voided"
    EXPIRED = "expired"


class EsignSigningType(str, enum.Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"


class EsignRecipientRole(str, enum.Enum):
    SIGNER = "signer"
    CC = "cc"
    APPROVER = "approver"
    CERTIFIED_DELIVERY = "certified_delivery"
    AGENT = "agent"
    EDITOR = "editor"
    WITNESS = "witness"
    IN_PERSON_SIGNER = "in_person_signer"


class EsignRecipientStatus(str, enum.Enum):
    PENDING = "pending"
    NOTIFIED = "notified"
    VIEWED = "viewed"
    CONSENTED = "consented"
    SIGNED = "signed"
    APPROVED = "approved"
    DELIVERED = "delivered"
    MANAGED = "managed"
    DECLINED = "declined"


class EsignFieldType(str, enum.Enum):
    SIGNATURE = "signature"
    INITIALS = "initials"
    DATE_SIGNED = "date_signed"
    TEXT = "text"
    CHECKBOX = "checkbox"
    AUTO_FILL = "auto_fill"
    ATTACHMENT = "attachment"
    RADIO = "radio"
    DROPDOWN = "dropdown"
    FORMULA = "formula"
    STAMP = "stamp"
    DATE = "date"
    NUMBER = "number"
    FIRST_NAME = "first_name"
    LAST_NAME = "last_name"
    FULL_NAME = "full_name"
    EMAIL = "email"
    COMPANY = "company"
    TITLE = "title"
    NOTE = "note"


class EsignSignatureType(str, enum.Enum):
    DRAWN = "drawn"
    TYPED = "typed"
    UPLOADED = "uploaded"


class EsignEventType(str, enum.Enum):
    CREATED = "created"
    SENT = "sent"
    VIEWED = "viewed"
    CONSENT_GIVEN = "consent_given"
    SIGNED = "signed"
    DECLINED = "declined"
    VOIDED = "voided"
    COMPLETED = "completed"
    REMINDER_SENT = "reminder_sent"
    SEALED = "sealed"
    EXPIRED = "expired"
    EXPIRATION_WARNING = "expiration_warning"
    CORRECTED = "corrected"
    REASSIGNED = "reassigned"
    APPROVED = "approved"
    DELIVERED = "delivered"
    MANAGER_ACTION = "manager_action"
    WITNESS_CONFIGURED = "witness_configured"
    HOST_HANDOFF = "host_handoff"
    GUEST_INVITATION_EXCHANGED = "guest_invitation_exchanged"
    GUEST_CONSENT_GIVEN = "guest_consent_given"
    ROUTING_ADVANCED = "routing_advanced"
    SCHEDULED = "scheduled"
    UNSCHEDULED = "unscheduled"
    SEND_FAILED = "send_failed"
    ACCESS_GRANTED = "access_granted"
    ACCESS_REVOKED = "access_revoked"
    OWNERSHIP_TRANSFERRED = "ownership_transferred"
    WEBHOOK_TEST = "webhook.test"


def _esign_enum(enum_cls, type_name: str):
    return Enum(
        enum_cls,
        name=type_name,
        create_type=False,
        values_callable=lambda x: [e.value for e in x],
    )


# ===================================================================
# E-Signature (esign) models
# ===================================================================


class EsignEnvelope(Base):
    """An e-signature envelope: one or more PDFs sent for signing.

    Once sent, envelopes are never hard-deleted (void instead) — the
    append-only esign_events audit trail references them with
    ondelete=RESTRICT, which is the legally correct retention behavior for
    signed documents. Drafts are the one exception: nothing has been signed,
    so they can be deleted outright (see migration 043).
    """
    __tablename__ = "esign_envelopes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="RESTRICT"), nullable=True)
    source_type = Column(String(20), nullable=False, default="manual", server_default="manual")
    source_id = Column(UUID(as_uuid=True), nullable=True)
    template_id = Column(UUID(as_uuid=True), ForeignKey("esign_templates.id", ondelete="SET NULL"), nullable=True)
    template_version_id = Column(UUID(as_uuid=True), ForeignKey("esign_template_versions.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=True)
    status = Column(
        _esign_enum(EsignEnvelopeStatus, "esign_envelope_status"),
        nullable=False,
        server_default=EsignEnvelopeStatus.DRAFT.value,
    )
    signing_type = Column(
        _esign_enum(EsignSigningType, "esign_signing_type"),
        nullable=False,
        server_default=EsignSigningType.SEQUENTIAL.value,
    )
    # Sender-selected display format shared by editable dates and date-signed.
    date_format = Column(String(32), nullable=False, default="MM/DD/YYYY", server_default="MM/DD/YYYY")
    current_routing_order = Column(Integer, nullable=True)  # set when sent
    routing_version = Column(Integer, nullable=False, default=1, server_default="1")
    # Optimistic concurrency token for mutable draft authoring. This is
    # intentionally separate from routing_version, which protects sent
    # ceremony actions and recipient evidence.
    draft_revision = Column(Integer, nullable=False, default=1, server_default="1")
    allow_reassignment = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    # Access policy is snapshotted per envelope so already-sent envelopes keep
    # their original account-authenticated ceremony after email-link signing
    # becomes the default.
    recipient_access_mode = Column(String(32), nullable=False, default="email_link", server_default="email_link")
    # Snapshot of the ESIGN/UETA consent disclosure shown to signers; immutable
    # per envelope so consent records can be tied to the exact text.
    consent_disclosure_text = Column(Text, nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    reminder_interval_hours = Column(Integer, nullable=True)
    last_reminder_at = Column(TIMESTAMP(timezone=True), nullable=True)
    expiration_warning_sent_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_reason = Column(Text, nullable=True)
    sealed_gcs_object_name = Column(Text, nullable=True)
    sealed_sha256 = Column(String(64), nullable=True)
    certificate_gcs_object_name = Column(Text, nullable=True)
    # Completion is a durable state machine. An envelope remains in progress
    # until its sealed object has been uploaded and the seal worker commits.
    sealing_state = Column(String(24), nullable=False, default="not_ready", server_default="not_ready")
    sealing_last_error = Column(Text, nullable=True)
    sealing_started_at = Column(TIMESTAMP(timezone=True), nullable=True)
    sent_at = Column(TIMESTAMP(timezone=True), nullable=True)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    voided_at = Column(TIMESTAMP(timezone=True), nullable=True)
    scheduled_at = Column(TIMESTAMP(timezone=True), nullable=True)
    schedule_timezone = Column(String(64), nullable=True)
    schedule_claimed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    send_error_code = Column(String(64), nullable=True)
    send_error_message = Column(Text, nullable=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("esign_brand_profiles.id", ondelete="SET NULL"), nullable=True)
    brand_snapshot = Column(MutableDict.as_mutable(JSONB), nullable=True)
    settings_snapshot = Column(MutableDict.as_mutable(JSONB), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    documents = relationship(
        "EsignDocument",
        back_populates="envelope",
        cascade="all, delete-orphan",
        order_by="EsignDocument.display_order",
    )
    recipients = relationship(
        "EsignRecipient",
        back_populates="envelope",
        cascade="all, delete-orphan",
        order_by="EsignRecipient.routing_order",
    )
    fields = relationship("EsignField", back_populates="envelope", cascade="all, delete-orphan")
    events = relationship(
        "EsignEvent",
        back_populates="envelope",
        order_by="EsignEvent.created_at",
    )
    grants = relationship("EsignEnvelopeGrant", back_populates="envelope", cascade="all, delete-orphan")
    email_deliveries = relationship("EsignEmailDelivery", cascade="all, delete-orphan")
    work_items = relationship("EsignWorkItem", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_esign_envelopes_user_created", "user_id", "created_at"),
        Index("ix_esign_envelopes_firm_sent", "firm_id", "sent_at"),
        Index("ix_esign_envelopes_firm_status_source", "firm_id", "status", "source_type"),
        Index("ix_esign_envelopes_schedule_due", "status", "scheduled_at"),
    )


class EsignDocument(Base):
    """A single PDF within an envelope. The original object is immutable."""
    __tablename__ = "esign_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    original_filename = Column(Text, nullable=False)
    gcs_object_name = Column(Text, unique=True, nullable=False)
    original_sha256 = Column(String(64), nullable=False)
    flattened_gcs_object_name = Column(Text, nullable=True)
    flattened_sha256 = Column(String(64), nullable=True)
    page_count = Column(Integer, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    envelope = relationship("EsignEnvelope", back_populates="documents")
    fields = relationship("EsignField", back_populates="document", cascade="all, delete-orphan")


class EsignRecipient(Base):
    """A signer or CC party on an envelope, keyed by lowercased email."""
    __tablename__ = "esign_recipients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=True)  # always lowercased; null for unresolved placeholders
    name = Column(String(255), nullable=True)
    # Resolved lazily on the recipient's first authenticated access.
    recipient_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    role = Column(
        _esign_enum(EsignRecipientRole, "esign_recipient_role"),
        nullable=False,
        server_default=EsignRecipientRole.SIGNER.value,
    )
    routing_order = Column(Integer, nullable=False, default=1)
    role_label = Column(String(255), nullable=True)
    template_role_id = Column(UUID(as_uuid=True), nullable=True)
    private_message = Column(Text, nullable=True)
    managed_by_recipient_id = Column(
        UUID(as_uuid=True), ForeignKey("esign_recipients.id", ondelete="RESTRICT"), nullable=True
    )
    witness_for_recipient_id = Column(
        UUID(as_uuid=True), ForeignKey("esign_recipients.id", ondelete="RESTRICT"), nullable=True
    )
    witness_mode = Column(String(16), nullable=True)
    host_name = Column(String(255), nullable=True)
    host_email = Column(String(255), nullable=True)
    host_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    allow_reassignment = Column(Boolean, nullable=False, default=False, server_default=expression.false())
    status = Column(
        _esign_enum(EsignRecipientStatus, "esign_recipient_status"),
        nullable=False,
        server_default=EsignRecipientStatus.PENDING.value,
    )
    viewed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    consented_at = Column(TIMESTAMP(timezone=True), nullable=True)
    signed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    declined_at = Column(TIMESTAMP(timezone=True), nullable=True)
    declined_reason = Column(Text, nullable=True)
    action_completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    # Temporary adopted artifacts used by Finish Later. Cleared on submit.
    draft_marks = Column(MutableDict.as_mutable(JSONB), nullable=True)
    identity_changed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    envelope = relationship("EsignEnvelope", back_populates="recipients")
    fields = relationship("EsignField", back_populates="recipient", cascade="all, delete-orphan")
    signature_records = relationship("EsignSignatureRecord", back_populates="recipient")
    consent_records = relationship("EsignConsentRecord", back_populates="recipient")
    managed_by = relationship("EsignRecipient", remote_side=[id], foreign_keys=[managed_by_recipient_id])
    witness_for = relationship("EsignRecipient", remote_side=[id], foreign_keys=[witness_for_recipient_id])

    __table_args__ = (
        Index(
            "uq_esign_recipients_envelope_email", "envelope_id", "email", unique=True,
            postgresql_where=text("email IS NOT NULL"),
        ),
        Index("ix_esign_recipients_email", "email"),
        Index("ix_esign_recipients_template_role", "envelope_id", "template_role_id"),
    )


class EsignRecipientChange(Base):
    """Immutable recipient correction/reassignment evidence."""
    __tablename__ = "esign_recipient_changes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    # Deliberately not an FK: removed recipients retain their immutable UUID in
    # the assignment chain without an ON DELETE mutation of this append-only row.
    recipient_id = Column(UUID(as_uuid=True), nullable=True)
    envelope_version = Column(Integer, nullable=False)
    change_type = Column(String(64), nullable=False)
    actor_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(255), nullable=True)
    reason = Column(Text, nullable=False)
    before_snapshot = Column(JSONB, nullable=True)
    after_snapshot = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("ix_esign_recipient_changes_envelope", "envelope_id", "created_at"),)


class EsignGuestInvitation(Base):
    """Hashed bearer invitation for a recipient ceremony or completed copy."""
    __tablename__ = "esign_guest_invitations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), nullable=False)
    purpose = Column(String(32), nullable=False, default="ceremony", server_default="ceremony")
    token_sha256 = Column(String(64), unique=True, nullable=False)
    routing_version = Column(Integer, nullable=False)
    expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    exchanged_at = Column(TIMESTAMP(timezone=True), nullable=True)
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        Index("ix_esign_guest_invitations_recipient", "recipient_id"),
        Index(
            "uq_esign_guest_invitations_active_purpose",
            "recipient_id", "purpose", unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )


class EsignGuestSession(Base):
    """Hashed guest-cookie session with idle/absolute expiry and one-time completion."""
    __tablename__ = "esign_guest_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), nullable=False)
    invitation_id = Column(UUID(as_uuid=True), ForeignKey("esign_guest_invitations.id", ondelete="RESTRICT"), nullable=False)
    token_sha256 = Column(String(64), unique=True, nullable=False)
    csrf_sha256 = Column(String(64), nullable=False)
    routing_version = Column(Integer, nullable=False)
    last_seen_at = Column(TIMESTAMP(timezone=True), nullable=False)
    idle_expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    absolute_expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    consumed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("ix_esign_guest_sessions_recipient", "recipient_id"),)


class EsignField(Base):
    """A placed input field. Coordinates are fractions of page size (0..1),
    top-left origin; page_number is a 0-based page index within the document."""
    __tablename__ = "esign_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey("esign_documents.id", ondelete="CASCADE"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("esign_recipients.id", ondelete="CASCADE"), nullable=False)
    field_type = Column(_esign_enum(EsignFieldType, "esign_field_type"), nullable=False)
    page_number = Column(Integer, nullable=False)  # 0-based page index
    pos_x = Column(Numeric(12, 10), nullable=False)
    pos_y = Column(Numeric(12, 10), nullable=False)
    width = Column(Numeric(12, 10), nullable=False)
    height = Column(Numeric(12, 10), nullable=False)
    required = Column(Boolean, nullable=False, default=True, server_default=expression.true())
    label = Column(String(255), nullable=True)
    value = Column(Text, nullable=True)
    # In-progress value saved by the signer ("Finish Later"); cleared when the
    # final value is written at submit. Never part of the sealed evidence.
    draft_value = Column(Text, nullable=True)
    properties = Column(
        MutableDict.as_mutable(JSONB),
        nullable=False,
        default=dict,
        server_default=expression.text("'{}'::jsonb"),
    )
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    envelope = relationship("EsignEnvelope", back_populates="fields")
    document = relationship("EsignDocument", back_populates="fields")
    recipient = relationship("EsignRecipient", back_populates="fields")
    attachments = relationship("EsignSignerAttachment", back_populates="field")

    __table_args__ = (
        CheckConstraint("pos_x >= 0 AND pos_x <= 1", name="ck_esign_fields_pos_x"),
        CheckConstraint("pos_y >= 0 AND pos_y <= 1", name="ck_esign_fields_pos_y"),
        CheckConstraint("width > 0 AND width <= 1", name="ck_esign_fields_width"),
        CheckConstraint("height > 0 AND height <= 1", name="ck_esign_fields_height"),
        CheckConstraint("page_number >= 0", name="ck_esign_fields_page_number"),
        Index("ix_esign_fields_envelope", "envelope_id"),
    )


class EsignSignerAttachment(Base):
    """Signer-supplied evidence retained with the completed envelope."""
    __tablename__ = "esign_signer_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("esign_recipients.id", ondelete="RESTRICT"), nullable=False)
    field_id = Column(UUID(as_uuid=True), ForeignKey("esign_fields.id", ondelete="RESTRICT"), nullable=False)
    gcs_object_name = Column(Text, nullable=False)
    original_filename = Column(Text, nullable=False)
    sha256 = Column(String(64), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    content_type = Column(String(100), nullable=False)
    uploaded_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    field = relationship("EsignField", back_populates="attachments")

    __table_args__ = (Index("ix_esign_signer_attachments_envelope", "envelope_id"),)


class EsignSignatureRecord(Base):
    """The 'Adopt and Sign' artifact for one signer. Never updated/deleted."""
    __tablename__ = "esign_signature_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("esign_recipients.id", ondelete="RESTRICT"), nullable=False)
    signature_type = Column(_esign_enum(EsignSignatureType, "esign_signature_type"), nullable=False)
    image_gcs_object_name = Column(Text, nullable=True)
    image_sha256 = Column(String(64), nullable=True)
    typed_text = Column(Text, nullable=True)
    typed_font = Column(String(100), nullable=True)
    # Adopted initials: text always recorded (explicit or derived at adoption);
    # image only when the signer uploaded/drew dedicated initials.
    initials_text = Column(String(20), nullable=True)
    initials_type = Column(_esign_enum(EsignSignatureType, "esign_signature_type"), nullable=True)
    initials_typed_font = Column(String(100), nullable=True)
    initials_image_gcs_object_name = Column(Text, nullable=True)
    initials_image_sha256 = Column(String(64), nullable=True)
    # Schema-v2 stamps are independent from the normal signature image.
    stamp_type = Column(_esign_enum(EsignSignatureType, "esign_signature_type"), nullable=True)
    stamp_image_gcs_object_name = Column(Text, nullable=True)
    stamp_image_sha256 = Column(String(64), nullable=True)
    adopted_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    recipient = relationship("EsignRecipient", back_populates="signature_records")


class EsignConsentRecord(Base):
    """ESIGN/UETA consent-to-electronic-records record. Never updated/deleted."""
    __tablename__ = "esign_consent_records"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    recipient_id = Column(UUID(as_uuid=True), ForeignKey("esign_recipients.id", ondelete="RESTRICT"), nullable=False)
    consent_text_sha256 = Column(String(64), nullable=False)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    consented_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    recipient = relationship("EsignRecipient", back_populates="consent_records")


class EsignEvent(Base):
    """Append-only audit trail. A Postgres trigger (migrations 039/043)
    raises on any UPDATE, and on DELETE unless the envelope is still a draft;
    the RESTRICT envelope FK means only drafts can ever be hard-deleted."""
    __tablename__ = "esign_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    event_type = Column(_esign_enum(EsignEventType, "esign_event_type"), nullable=False)
    actor_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(255), nullable=True)  # denormalized snapshot
    # Immutable recipient UUID snapshot. No FK: recipient correction may remove
    # an outstanding slot without mutating this append-only audit evidence.
    recipient_id = Column(UUID(as_uuid=True), nullable=True)
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    mfa_verified = Column(Boolean, nullable=True)
    mfa_method = Column(String(32), nullable=True)
    mfa_phone_last4 = Column(String(4), nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    envelope = relationship("EsignEnvelope", back_populates="events")

    __table_args__ = (
        Index("ix_esign_events_envelope_created", "envelope_id", "created_at"),
    )


class EsignTemplate(Base):
    """Reusable envelope layout. Fields bind to a recipient role index which is
    materialized to concrete recipients when an envelope is instantiated."""
    __tablename__ = "esign_templates"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=True)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("esign_brand_profiles.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    title = Column(String(255), nullable=True)  # default envelope title
    message = Column(Text, nullable=True)  # default envelope message
    signing_type = Column(
        _esign_enum(EsignSigningType, "esign_signing_type"),
        nullable=False,
        server_default=EsignSigningType.SEQUENTIAL.value,
    )
    date_format = Column(String(32), nullable=False, default="MM/DD/YYYY", server_default="MM/DD/YYYY")
    draft_revision = Column(Integer, nullable=False, default=1, server_default="1")
    # Ordered list of recipient roles: [{"label": "Client", "role": "signer", "routing_order": 1}, ...]
    recipient_roles = Column(JSONB, nullable=False, default=list, server_default=expression.text("'[]'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    archived_at = Column(TIMESTAMP(timezone=True), nullable=True)

    user = relationship("User")
    documents = relationship(
        "EsignTemplateDocument",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="EsignTemplateDocument.display_order",
    )
    fields = relationship("EsignTemplateField", back_populates="template", cascade="all, delete-orphan")
    versions = relationship("EsignTemplateVersion", back_populates="template", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_esign_templates_user", "user_id"),
    )


class EsignTemplateDocument(Base):
    __tablename__ = "esign_template_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("esign_templates.id", ondelete="CASCADE"), nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    original_filename = Column(Text, nullable=False)
    gcs_object_name = Column(Text, unique=True, nullable=False)
    sha256 = Column(String(64), nullable=False)
    page_count = Column(Integer, nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    template = relationship("EsignTemplate", back_populates="documents")
    fields = relationship("EsignTemplateField", back_populates="document", cascade="all, delete-orphan")


class EsignTemplateField(Base):
    """Template field bound to recipient_index into EsignTemplate.recipient_roles."""
    __tablename__ = "esign_template_fields"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("esign_templates.id", ondelete="CASCADE"), nullable=False)
    template_document_id = Column(UUID(as_uuid=True), ForeignKey("esign_template_documents.id", ondelete="CASCADE"), nullable=False)
    recipient_index = Column(Integer, nullable=False)
    # Stable role binding. recipient_index remains as a read-time compatibility
    # fallback for legacy mutable templates and immutable published snapshots.
    recipient_role_id = Column(UUID(as_uuid=True), nullable=True)
    field_type = Column(_esign_enum(EsignFieldType, "esign_field_type"), nullable=False)
    page_number = Column(Integer, nullable=False)  # 0-based page index
    pos_x = Column(Numeric(12, 10), nullable=False)
    pos_y = Column(Numeric(12, 10), nullable=False)
    width = Column(Numeric(12, 10), nullable=False)
    height = Column(Numeric(12, 10), nullable=False)
    required = Column(Boolean, nullable=False, default=True, server_default=expression.true())
    label = Column(String(255), nullable=True)
    properties = Column(
        MutableDict.as_mutable(JSONB),
        nullable=False,
        default=dict,
        server_default=expression.text("'{}'::jsonb"),
    )
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    template = relationship("EsignTemplate", back_populates="fields")
    document = relationship("EsignTemplateDocument", back_populates="fields")

    __table_args__ = (
        CheckConstraint("pos_x >= 0 AND pos_x <= 1", name="ck_esign_template_fields_pos_x"),
        CheckConstraint("pos_y >= 0 AND pos_y <= 1", name="ck_esign_template_fields_pos_y"),
        CheckConstraint("width > 0 AND width <= 1", name="ck_esign_template_fields_width"),
        CheckConstraint("height > 0 AND height <= 1", name="ck_esign_template_fields_height"),
        CheckConstraint("page_number >= 0", name="ck_esign_template_fields_page_number"),
        CheckConstraint("recipient_index >= 0", name="ck_esign_template_fields_recipient_index"),
        Index("ix_esign_template_fields_role", "template_id", "recipient_role_id"),
    )


class EsignTemplateVersion(Base):
    """Immutable published snapshot used by every scaled-send workflow."""
    __tablename__ = "esign_template_versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id = Column(UUID(as_uuid=True), ForeignKey("esign_templates.id", ondelete="CASCADE"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    version = Column(Integer, nullable=False)
    snapshot = Column(JSONB, nullable=False)
    published_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    published_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    template = relationship("EsignTemplate", back_populates="versions")
    __table_args__ = (
        Index("uq_esign_template_versions_number", "template_id", "version", unique=True),
        Index("ix_esign_template_versions_firm", "firm_id", "published_at"),
    )


class EsignBulkJob(Base):
    __tablename__ = "esign_bulk_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    template_version_id = Column(UUID(as_uuid=True), ForeignKey("esign_template_versions.id", ondelete="RESTRICT"), nullable=False)
    status = Column(String(32), nullable=False, server_default="validating")
    kind = Column(String(20), nullable=False, default="bulk", server_default="bulk")
    default_schedule_at = Column(TIMESTAMP(timezone=True), nullable=True)
    default_schedule_timezone = Column(String(64), nullable=True)
    total_rows = Column(Integer, nullable=False, server_default="0")
    valid_rows = Column(Integer, nullable=False, server_default="0")
    invalid_rows = Column(Integer, nullable=False, server_default="0")
    processed_rows = Column(Integer, nullable=False, server_default="0")
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    confirmed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)

    rows = relationship("EsignBulkRow", back_populates="job", cascade="all, delete-orphan")
    __table_args__ = (Index("ix_esign_bulk_jobs_firm_created", "firm_id", "created_at"),)


class EsignBulkRow(Base):
    __tablename__ = "esign_bulk_rows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("esign_bulk_jobs.id", ondelete="CASCADE"), nullable=False)
    row_number = Column(Integer, nullable=False)
    idempotency_key = Column(String(64), nullable=False, unique=True)
    normalized_input = Column(JSONB, nullable=False)
    status = Column(String(32), nullable=False)
    attempts = Column(Integer, nullable=False, server_default="0")
    error_code = Column(String(64), nullable=True)
    error_message = Column(Text, nullable=True)
    scheduled_at = Column(TIMESTAMP(timezone=True), nullable=True)
    schedule_timezone = Column(String(64), nullable=True)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="SET NULL"), nullable=True, unique=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    job = relationship("EsignBulkJob", back_populates="rows")
    __table_args__ = (
        Index("uq_esign_bulk_rows_job_row", "job_id", "row_number", unique=True),
        Index("ix_esign_bulk_rows_job_status", "job_id", "status"),
    )


class EsignPowerForm(Base):
    __tablename__ = "esign_powerforms"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    template_version_id = Column(UUID(as_uuid=True), ForeignKey("esign_template_versions.id", ondelete="RESTRICT"), nullable=False)
    brand_id = Column(UUID(as_uuid=True), ForeignKey("esign_brand_profiles.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(255), nullable=False)
    public_token_sha256 = Column(String(64), nullable=False, unique=True)
    state = Column(String(20), nullable=False, server_default="active")
    starts_at = Column(TIMESTAMP(timezone=True), nullable=True)
    ends_at = Column(TIMESTAMP(timezone=True), nullable=True)
    submission_cap = Column(Integer, nullable=True)
    submission_count = Column(Integer, nullable=False, server_default="0")
    role_config = Column(JSONB, nullable=False)
    public_fields = Column(JSONB, nullable=False, server_default=expression.text("'[]'::jsonb"))
    instructions = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (Index("ix_esign_powerforms_firm", "firm_id", "created_at"),)


class EsignPowerFormSubmission(Base):
    __tablename__ = "esign_powerform_submissions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    powerform_id = Column(UUID(as_uuid=True), ForeignKey("esign_powerforms.id", ondelete="RESTRICT"), nullable=False)
    status = Column(String(24), nullable=False, server_default="pending_verification")
    normalized_input = Column(JSONB, nullable=False)
    initiating_email = Column(String(255), nullable=False)
    verification_token_sha256 = Column(String(64), nullable=False, unique=True)
    verification_expires_at = Column(TIMESTAMP(timezone=True), nullable=False)
    verified_at = Column(TIMESTAMP(timezone=True), nullable=True)
    consumed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="SET NULL"), nullable=True, unique=True)
    consent = Column(Boolean, nullable=False, server_default=expression.false())
    ip_address = Column(String(64), nullable=True)
    user_agent = Column(Text, nullable=True)
    attempt_count = Column(Integer, nullable=False, server_default="0")
    last_error = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (Index("ix_esign_powerform_submissions_form", "powerform_id", "created_at"),)


class EsignWorkItem(Base):
    """Transactional outbox item for durable envelope lifecycle work."""
    __tablename__ = "esign_work_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=True)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=False)
    kind = Column(String(32), nullable=False)
    idempotency_key = Column(String(255), nullable=False, unique=True)
    state = Column(String(24), nullable=False, default="queued", server_default="queued")
    attempt_count = Column(Integer, nullable=False, default=0, server_default="0")
    next_attempt_at = Column(TIMESTAMP(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    claimed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_error = Column(Text, nullable=True)
    payload = Column(MutableDict.as_mutable(JSONB), nullable=False, default=dict, server_default=expression.text("'{}'::jsonb"))
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("envelope_id", "kind", name="uq_esign_work_items_envelope_kind"),
        Index("ix_esign_work_items_due", "state", "next_attempt_at"),
    )


class EsignEmailDelivery(Base):
    """Durable, independently retryable outbound email delivery."""
    __tablename__ = "esign_email_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=True)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=True)
    recipient_id = Column(UUID(as_uuid=True), nullable=True)
    kind = Column(String(48), nullable=False)
    to_email = Column(String(255), nullable=False)
    subject = Column(Text, nullable=False)
    html_body = Column(Text, nullable=False)
    text_body = Column(Text, nullable=False)
    idempotency_key = Column(String(255), nullable=False, unique=True)
    state = Column(String(24), nullable=False, default="queued", server_default="queued")
    attempt_count = Column(Integer, nullable=False, default=0, server_default="0")
    next_attempt_at = Column(TIMESTAMP(timezone=True), nullable=False, default=func.now(), server_default=func.now())
    last_error = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    delivered_at = Column(TIMESTAMP(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_esign_email_deliveries_due", "state", "next_attempt_at"),
        Index("ix_esign_email_deliveries_envelope", "envelope_id", "created_at"),
    )


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


# ---------------------------------------------------------------------------
# OpenConnector integrations (broker over the self-hosted runtime)
#
# The runtime at OPENCONNECTOR_URL is single-tenant: connections are global,
# distinguished only by connectionName. The backend brokers multi-tenancy by
# naming every runtime connection u_{user_id} / u_{user_id}__{label} and
# injecting that alias on every call. These tables are the Postgres side of
# that contract: per-user listing/status (the runtime has no per-user view),
# OAuth-app availability for the catalog UI, Claw MCP tokens, and audit.
# Credential values themselves are never stored here — they live encrypted in
# the runtime's SQLite.
# ---------------------------------------------------------------------------


class ConnectorConnection(Base):
    """A user's connection to one OpenConnector provider service.

    Mirror row only: existence/status/labels for dashboards and lookups. The
    actual credential is stored (encrypted) by the runtime under
    ``connection_name``. ``status`` is 'pending' while an OAuth grant is in
    flight, then 'active'; 'error' marks connections the runtime rejected.
    """
    __tablename__ = "connector_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    service = Column(String(100), nullable=False)  # runtime service slug, e.g. 'github'
    connection_name = Column(String(200), nullable=False, unique=True)  # u_{user_id}[__{label_slug}]
    label = Column(String(100), nullable=True)  # user-facing name for extra connections
    auth_type = Column(String(30), nullable=False)  # 'oauth2' | 'api_key' | 'custom_credential'
    status = Column(String(20), nullable=False, server_default="pending")
    error_message = Column(Text, nullable=True)
    last_verified_at = Column(TIMESTAMP(timezone=True), nullable=True)
    last_used_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="connector_connections")

    __table_args__ = (
        CheckConstraint(
            "auth_type IN ('oauth2', 'api_key', 'custom_credential', 'no_auth')",
            name="ck_connector_connections_auth_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'active', 'error', 'revoked')",
            name="ck_connector_connections_status",
        ),
        # One default (label-less) connection per user+service; labeled extras
        # are unique by name. NULLs are distinct in Postgres, hence coalesce.
        Index(
            "uq_connector_connections_user_service_label",
            "user_id",
            "service",
            text("coalesce(label, '')"),
            unique=True,
        ),
    )


class ConnectorOAuthConfig(Base):
    """Mirror of a runtime-global provider OAuth app registration.

    The runtime stores the actual clientId/clientSecret (one OAuth app per
    service, shared by all users). This row only records that the service is
    OAuth-ready so the catalog UI can badge providers without an admin call to
    the runtime. ``client_id_hint`` is a truncated, non-secret display value.
    """
    __tablename__ = "connector_oauth_configs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service = Column(String(100), nullable=False, unique=True)
    client_id_hint = Column(String(64), nullable=True)
    enabled = Column(Boolean, nullable=False, server_default=expression.true())
    configured_by = Column(String(128), nullable=True)  # admin identifier, informational
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class ConnectorToken(Base):
    """Per-user bearer token for the Claw MCP proxy (/api/connector/mcp).

    Same storage scheme as ActivationKey: only a SHA-256 hash is kept, with an
    indexed non-secret prefix for O(1) lookup and constant-time verification.
    Minted during Claw activation (named ``claw:{fingerprint}``, rotating older
    tokens of the same name) or manually from the integrations page. Grants
    access ONLY to the MCP proxy — never to the broker REST routes.
    """
    __tablename__ = "connector_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_lookup = Column(String(16), nullable=False, unique=True)  # non-secret lookup handle
    token_hash = Column(String(64), nullable=False)  # sha256 hex of the full token
    token_prefix = Column(String(24), nullable=False)  # masked value for display, e.g. "cpaa_conn_AbCd…"
    name = Column(String(128), nullable=True)  # e.g. 'claw:<fingerprint>' or a user-chosen label
    last_used_at = Column(TIMESTAMP(timezone=True), nullable=True)
    revoked_at = Column(TIMESTAMP(timezone=True), nullable=True)  # non-null => revoked
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    user = relationship("User", back_populates="connector_tokens")


class ConnectorActionLog(Base):
    """Audit trail of connector action executions across all entry points."""
    __tablename__ = "connector_action_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    source = Column(String(20), nullable=False)  # 'web' | 'platform' | 'mcp'
    service = Column(String(100), nullable=False)
    action_id = Column(String(200), nullable=False)  # e.g. 'github.get_current_user'
    connection_name = Column(String(200), nullable=True)
    success = Column(Boolean, nullable=True)  # null when the runtime was unreachable
    status_code = Column(Integer, nullable=True)
    duration_ms = Column(Integer, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint("source IN ('web', 'platform', 'mcp')", name="ck_connector_action_logs_source"),
        Index("ix_connector_action_logs_user_created", "user_id", "created_at"),
    )


# ===================================================================
# E-Signature firm administration
# ===================================================================


class EsignFirmSettings(Base):
    __tablename__ = "esign_firm_settings"

    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), primary_key=True)
    version = Column(Integer, nullable=False, default=1, server_default="1")
    default_brand_id = Column(UUID(as_uuid=True), ForeignKey("esign_brand_profiles.id", ondelete="SET NULL"), nullable=True)
    date_format = Column(String(32), nullable=False, server_default="MM/DD/YYYY")
    signing_type = Column(String(20), nullable=False, server_default="sequential")
    expiration_days = Column(Integer, nullable=True, server_default="30")
    reminder_interval_hours = Column(Integer, nullable=True, server_default="72")
    allow_reassignment = Column(Boolean, nullable=False, server_default=expression.true())
    sender_overrides = Column(MutableDict.as_mutable(JSONB), nullable=False, default=dict, server_default=expression.text("'{}'::jsonb"))
    features = Column(MutableDict.as_mutable(JSONB), nullable=False, default=dict, server_default=expression.text("'{}'::jsonb"))
    updated_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class EsignBrandAsset(Base):
    __tablename__ = "esign_brand_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    gcs_object_name = Column(Text, nullable=False, unique=True)
    content_type = Column(String(32), nullable=False)
    sha256 = Column(String(64), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (Index("ix_esign_brand_assets_firm", "firm_id", "created_at"),)


class EsignBrandProfile(Base):
    __tablename__ = "esign_brand_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    logo_asset_id = Column(UUID(as_uuid=True), ForeignKey("esign_brand_assets.id", ondelete="RESTRICT"), nullable=True)
    primary_color = Column(String(7), nullable=False, server_default="#1D4ED8")
    accent_color = Column(String(7), nullable=False, server_default="#0F172A")
    email_header = Column(Text, nullable=True)
    email_footer = Column(Text, nullable=True)
    reply_to_address = Column(String(255), nullable=True)
    signing_welcome_text = Column(Text, nullable=True)
    support_url = Column(Text, nullable=True)
    active = Column(Boolean, nullable=False, server_default=expression.true())
    allowed_profile_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    __table_args__ = (UniqueConstraint("firm_id", "name", name="uq_esign_brand_profiles_firm_name"),)


class EsignPermissionProfile(Base):
    __tablename__ = "esign_permission_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    capabilities = Column(MutableDict.as_mutable(JSONB), nullable=False, default=dict)
    built_in_key = Column(String(32), nullable=True)
    locked = Column(Boolean, nullable=False, server_default=expression.false())
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("firm_id", "name", name="uq_esign_permission_profiles_firm_name"),
        UniqueConstraint("firm_id", "built_in_key", name="uq_esign_permission_profiles_builtin"),
    )


class EsignPermissionAssignment(Base):
    __tablename__ = "esign_permission_assignments"

    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), primary_key=True)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    profile_id = Column(UUID(as_uuid=True), ForeignKey("esign_permission_profiles.id", ondelete="RESTRICT"), nullable=False)
    assigned_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class EsignEnvelopeGrant(Base):
    __tablename__ = "esign_envelope_grants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(128), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    access_level = Column(String(16), nullable=False)
    granted_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    envelope = relationship("EsignEnvelope", back_populates="grants")
    __table_args__ = (
        UniqueConstraint("envelope_id", "user_id", name="uq_esign_envelope_grants_user"),
        CheckConstraint("access_level IN ('view', 'manage')", name="ck_esign_envelope_grants_level"),
        Index("ix_esign_envelope_grants_user", "firm_id", "user_id"),
    )


class EsignWebhookConfiguration(Base):
    __tablename__ = "esign_webhook_configurations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="CASCADE"), nullable=True)
    endpoint_url = Column(Text, nullable=False)
    enabled = Column(Boolean, nullable=False, server_default=expression.true())
    event_filters = Column(ARRAY(String(64)), nullable=False, default=list)
    include_completed_documents = Column(Boolean, nullable=False, server_default=expression.false())
    secret_current = Column(Text, nullable=False)
    secret_previous = Column(Text, nullable=True)
    secret_previous_expires_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    disabled_at = Column(TIMESTAMP(timezone=True), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    __table_args__ = (Index("ix_esign_webhook_configurations_scope", "firm_id", "envelope_id", "enabled"),)


class EsignWebhookDelivery(Base):
    __tablename__ = "esign_webhook_deliveries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    configuration_id = Column(UUID(as_uuid=True), ForeignKey("esign_webhook_configurations.id", ondelete="RESTRICT"), nullable=False)
    event_id = Column(UUID(as_uuid=True), ForeignKey("esign_events.id", ondelete="RESTRICT"), nullable=False)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="CASCADE"), nullable=False)
    envelope_id = Column(UUID(as_uuid=True), ForeignKey("esign_envelopes.id", ondelete="RESTRICT"), nullable=False)
    payload = Column(MutableDict.as_mutable(JSONB), nullable=False)
    status = Column(String(24), nullable=False, server_default="pending")
    attempt_count = Column(Integer, nullable=False, server_default="0")
    next_attempt_at = Column(TIMESTAMP(timezone=True), nullable=True, server_default=func.now())
    claimed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=True)
    terminal_at = Column(TIMESTAMP(timezone=True), nullable=True)
    manual_retry_by_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    __table_args__ = (
        UniqueConstraint("configuration_id", "event_id", name="uq_esign_webhook_delivery_event"),
        Index("ix_esign_webhook_deliveries_due", "status", "next_attempt_at"),
        Index("ix_esign_webhook_deliveries_firm", "firm_id", "created_at"),
    )


class EsignWebhookAttempt(Base):
    __tablename__ = "esign_webhook_attempts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    delivery_id = Column(UUID(as_uuid=True), ForeignKey("esign_webhook_deliveries.id", ondelete="RESTRICT"), nullable=False)
    attempt_number = Column(Integer, nullable=False)
    started_at = Column(TIMESTAMP(timezone=True), nullable=False)
    completed_at = Column(TIMESTAMP(timezone=True), nullable=False)
    duration_ms = Column(Integer, nullable=False)
    result = Column(String(24), nullable=False)
    http_status = Column(Integer, nullable=True)
    response_excerpt = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (UniqueConstraint("delivery_id", "attempt_number", name="uq_esign_webhook_attempt_number"),)


class EsignAdminEvent(Base):
    __tablename__ = "esign_admin_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    firm_id = Column(UUID(as_uuid=True), ForeignKey("firms.id", ondelete="RESTRICT"), nullable=False)
    actor_user_id = Column(String(128), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String(255), nullable=True)
    event_type = Column(String(64), nullable=False)
    target_type = Column(String(32), nullable=True)
    target_id = Column(String(128), nullable=True)
    details = Column(MutableDict.as_mutable(JSONB), nullable=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    __table_args__ = (Index("ix_esign_admin_events_firm_created", "firm_id", "created_at"),)
