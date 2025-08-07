"""
SQLAlchemy database models for ByteReview
Integration phase - supports multi-source ingestion, exports, and automations
"""
from sqlalchemy import Column, String, Integer, BigInteger, Boolean, Text, TIMESTAMP, ForeignKey, UUID, LargeBinary, ARRAY, CheckConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
import uuid

Base = declarative_base()

class User(Base):
    """App-specific user profile data linked to Firebase Auth"""
    __tablename__ = "users"
    
    id = Column(String(128), primary_key=True)  # Firebase UID
    email = Column(String(255), unique=True, nullable=False)
    display_name = Column(String(255))
    photo_url = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    templates = relationship("Template", back_populates="user", cascade="all, delete-orphan")
    extraction_jobs = relationship("ExtractionJob", back_populates="user", cascade="all, delete-orphan")
    integration_accounts = relationship("IntegrationAccount", back_populates="user", cascade="all, delete-orphan")
    automations = relationship("Automation", back_populates="user", cascade="all, delete-orphan")

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
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="templates")
    template_fields = relationship("TemplateField", back_populates="template", cascade="all, delete-orphan")
    extraction_jobs = relationship("ExtractionJob", back_populates="template")
    
    __table_args__ = (
        {"schema": None}  # Ensure unique constraint on (user_id, name)
    )

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
    template_id = Column(UUID(as_uuid=True), ForeignKey("templates.id", ondelete="SET NULL"))
    
    # Wizard/Configuration State
    config_step = Column(String(20), nullable=False, default='upload')  # 'upload', 'fields', 'review', 'submitted'
    
    # Processing Lifecycle State  
    status = Column(String(50), nullable=False, default='pending')  # 'pending', 'in_progress', 'partially_completed', 'completed', 'failed', 'cancelled'
    
    # Progress Tracking
    tasks_total = Column(Integer, nullable=False, default=0)
    tasks_completed = Column(Integer, nullable=False, default=0)
    tasks_failed = Column(Integer, nullable=False, default=0)
    
    # Activity and Concurrency Control
    last_active_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    version = Column(Integer, nullable=False, default=1)  # For optimistic locking
    
    persist_data = Column(Boolean, nullable=False, default=True)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    completed_at = Column(TIMESTAMP(timezone=True))
    
    # Relationships
    user = relationship("User", back_populates="extraction_jobs")
    template = relationship("Template", back_populates="extraction_jobs")
    job_fields = relationship("JobField", back_populates="job", cascade="all, delete-orphan")
    source_files = relationship("SourceFile", back_populates="job", cascade="all, delete-orphan")
    extraction_tasks = relationship("ExtractionTask", back_populates="job", cascade="all, delete-orphan")
    automations = relationship("Automation", back_populates="job", cascade="all, delete-orphan")
    job_exports = relationship("JobExport", back_populates="job", cascade="all, delete-orphan")
    automation_runs = relationship("AutomationRun", back_populates="job", cascade="all, delete-orphan")
    
    @property
    def is_resumable(self) -> bool:
        """A job is resumable if wizard not done OR processing incomplete/errored"""
        return (
            self.config_step != 'submitted' or 
            (self.status in ('in_progress', 'partially_completed', 'failed') and 
             self.tasks_completed < self.tasks_total)
        )
    
    @property 
    def progress_percentage(self) -> float:
        """Calculate progress with safety checks"""
        if self.config_step != 'submitted':
            # Wizard progress
            steps = ['upload', 'fields', 'review', 'submitted']
            try:
                step_index = steps.index(self.config_step)
                return min(100, max(0, (step_index / 3) * 100))
            except ValueError:
                return 0
        else:
            # Processing progress
            if self.tasks_total <= 0:
                return 100 if self.status == 'completed' else 0
            
            completed = max(0, self.tasks_completed)
            total = max(1, self.tasks_total)  # Prevent division by zero
            return min(100, (completed / total) * 100)

class JobField(Base):
    """Snapshot of fields used for a specific job, ensuring immutability"""
    __tablename__ = "job_fields"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
    field_name = Column(String(100), nullable=False)
    data_type_id = Column(String(50), ForeignKey("data_types.id"), nullable=False)
    ai_prompt = Column(Text, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    job = relationship("ExtractionJob", back_populates="job_fields")
    data_type = relationship("DataType", back_populates="job_fields")

class SourceFile(Base):
    """A single source file uploaded by the user"""
    __tablename__ = "source_files"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
    original_filename = Column(Text, nullable=False)
    original_path = Column(Text, nullable=False)
    gcs_object_name = Column(Text, unique=True, nullable=False)
    file_type = Column(String(100), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    status = Column(String(50), nullable=False, default='uploading')
    source_type = Column(String(20), nullable=False, default='upload')
    external_id = Column(Text)
    updated_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
    
    # Relationships
    job = relationship("ExtractionJob", back_populates="source_files")
    source_files_to_tasks = relationship("SourceFileToTask", back_populates="source_file", cascade="all, delete-orphan")

class ExtractionTask(Base):
    """A single unit of work to be sent to the AI"""
    __tablename__ = "extraction_tasks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
    processing_mode = Column(String(50), nullable=False, default='individual')  # 'individual' or 'combined'
    status = Column(String(50), nullable=False, default='pending')
    error_message = Column(Text)
    created_at = Column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
    processed_at = Column(TIMESTAMP(timezone=True))
    
    # Relationships
    job = relationship("ExtractionJob", back_populates="extraction_tasks")
    source_files_to_tasks = relationship("SourceFileToTask", back_populates="task", cascade="all, delete-orphan")
    extraction_result = relationship("ExtractionResult", back_populates="task", uselist=False, cascade="all, delete-orphan")

class SourceFileToTask(Base):
    """Many-to-many link table between files and tasks"""
    __tablename__ = "source_files_to_tasks"
    
    source_file_id = Column(UUID(as_uuid=True), ForeignKey("source_files.id", ondelete="CASCADE"), primary_key=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("extraction_tasks.id", ondelete="CASCADE"), primary_key=True)
    document_order = Column(Integer, nullable=False, default=0)
    
    # Relationships
    source_file = relationship("SourceFile", back_populates="source_files_to_tasks")
    task = relationship("ExtractionTask", back_populates="source_files_to_tasks")

class ExtractionResult(Base):
    """The structured data extracted from a single task"""
    __tablename__ = "extraction_results"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("extraction_tasks.id", ondelete="CASCADE"), unique=True, nullable=False)
    extracted_data = Column(JSONB, nullable=False)
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
    
    def get_access_token(self) -> str:
        """Decrypt and return access token"""
        if not self.access_token:
            return None
        from services.encryption_service import encryption_service
        return encryption_service.decrypt_token(self.access_token)
    
    def set_refresh_token(self, token: str):
        """Encrypt and store refresh token"""
        from services.encryption_service import encryption_service
        self.refresh_token = encryption_service.encrypt_token(token)
    
    def get_refresh_token(self) -> str:
        """Decrypt and return refresh token"""
        if not self.refresh_token:
            return None
        from services.encryption_service import encryption_service
        return encryption_service.decrypt_token(self.refresh_token)

class JobExport(Base):
    """Export operations for job results to various destinations"""
    __tablename__ = "job_exports"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
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
    job = relationship("ExtractionJob", back_populates="job_exports")

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
    job_id = Column(UUID(as_uuid=True), ForeignKey("extraction_jobs.id", ondelete="CASCADE"), nullable=False)
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
    job = relationship("ExtractionJob", back_populates="automation_runs")

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

