"""Pydantic models for SOC console."""
import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Literal

from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator


def utc_now() -> datetime:
    """Return timezone-aware UTC timestamps.

    ACTIRA stores timestamps in UTC. The frontend applies the user-selected
    display timezone from Settings → UI prefs.
    """
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- Users ----------
class UserBase(BaseModel):
    email: EmailStr
    name: str
    role: Literal["analyst", "senior_reviewer", "admin"] = "analyst"


class UserCreate(UserBase):
    """Internal/admin-style create (may include role for seed paths)."""
    password: str = Field(..., min_length=12, description="Min 12 chars; letter + number required")


class UserCreatePublic(BaseModel):
    """A-M3: public self-registration — no privileged role field."""
    email: EmailStr
    name: str
    password: str = Field(..., min_length=12, description="Min 12 chars; letter + number required")


class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    created_at: datetime = Field(default_factory=utc_now)


class UserInDB(User):
    password_hash: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ---------- IoCs ----------
class IoC(BaseModel):
    id: str = Field(default_factory=new_id)
    type: Literal["ip", "domain", "url", "hash_md5", "hash_sha1", "hash_sha256", "cve", "email"]
    value: str
    context: Optional[str] = None
    confidence: float = 0.9
    first_seen: datetime = Field(default_factory=utc_now)
    enrichment: Optional[Dict[str, Any]] = None
    threat_score: float = 0.0


# ---------- Incidents ----------
IncidentSeverity = Literal["low", "medium", "high", "critical"]
IncidentStatus = Literal["new", "in_progress", "pending_review", "approved", "rejected", "closed"]


class TimelineEvent(BaseModel):
    ts: datetime = Field(default_factory=utc_now)
    label: str
    detail: Optional[str] = None


class TechniqueEvidence(BaseModel):
    """Why a technique was inferred (rule, snippet, optional CES fields)."""
    model_config = ConfigDict(extra="ignore")
    rule: Optional[str] = None
    keyword: Optional[str] = None
    snippet: Optional[str] = None
    source_file: Optional[str] = None
    event_type: Optional[str] = None
    process: Optional[str] = None
    username: Optional[str] = None
    source_ip: Optional[str] = None
    domain: Optional[str] = None
    rationale: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None


class TechniqueMitigation(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str


class ATTACKTechnique(BaseModel):
    """MITRE ATT&CK technique or sub-technique with drill-down metadata."""
    model_config = ConfigDict(extra="ignore")
    technique_id: str  # e.g. T1110 or T1110.003
    name: str
    tactic: str
    confidence: float = 0.7
    parent_id: Optional[str] = None  # e.g. T1110 when technique_id is T1110.003
    matched_keywords: List[str] = []
    matched_rules: List[str] = []
    evidence: List[TechniqueEvidence] = []
    platforms: List[str] = []
    data_sources: List[str] = []
    mitigations: List[TechniqueMitigation] = []
    url: Optional[str] = None
    description: Optional[str] = None
    related_iocs: List[str] = []
    source: Optional[str] = None  # keyword | ces | ioc | llm


class PlaybookStep(BaseModel):
    order: int
    phase: Literal["containment", "eradication", "recovery", "lessons_learned"]
    action: str
    citation_ids: List[str] = []  # references to KB docs


class Playbook(BaseModel):
    id: str = Field(default_factory=new_id)
    steps: List[PlaybookStep] = []
    grounding_score: float = 0.0  # cited_steps / total_steps
    # A-L5: unique citation ids / steps (diversity of sources, not just any cite)
    citation_quality: float = 0.0
    generated_at: datetime = Field(default_factory=utc_now)
    llm_provider: str = "anthropic"
    llm_model: str = "claude-sonnet-4-6"


# ---------- Investigation Workspace (v1.4) ----------
NoteKind = Literal["note", "finding", "recommendation"]


class LinkedEventRef(BaseModel):
    model_config = ConfigDict(extra="ignore")
    timeline_event_id: Optional[str] = None
    timestamp: Optional[str] = None
    source_file: Optional[str] = None
    event_type: Optional[str] = None
    actor: Optional[str] = None
    target: Optional[str] = None
    summary_hash: Optional[str] = None


class WorkspaceNote(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    kind: NoteKind = "note"
    title: Optional[str] = Field(None, max_length=200)
    body: str = Field(..., min_length=1, max_length=8192)
    tags: List[str] = Field(default_factory=list, max_length=20)
    linked_iocs: List[str] = Field(default_factory=list)
    linked_techniques: List[str] = Field(default_factory=list)
    linked_event_refs: List[LinkedEventRef] = Field(default_factory=list, max_length=20)
    author_id: Optional[str] = None
    author_email: Optional[str] = None
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
    pinned: bool = False


class NoteCreate(BaseModel):
    """Request body — never trust client author_* / id fields."""

    model_config = ConfigDict(extra="ignore")
    kind: NoteKind = "note"
    title: Optional[str] = Field(None, max_length=200)
    body: str = Field(..., min_length=1, max_length=8192)
    tags: List[str] = Field(default_factory=list, max_length=20)
    linked_iocs: List[str] = Field(default_factory=list)
    linked_techniques: List[str] = Field(default_factory=list)
    linked_event_refs: List[LinkedEventRef] = Field(default_factory=list, max_length=20)
    pinned: bool = False

    @field_validator("tags")
    @classmethod
    def _tag_item_length(cls, v: List[str]) -> List[str]:
        for t in v or []:
            if not t or len(t) > 64:
                raise ValueError("each tag must be 1–64 characters")
        return v


class NoteUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    kind: Optional[NoteKind] = None
    title: Optional[str] = Field(None, max_length=200)
    body: Optional[str] = Field(None, min_length=1, max_length=8192)
    tags: Optional[List[str]] = Field(None, max_length=20)
    linked_iocs: Optional[List[str]] = None
    linked_techniques: Optional[List[str]] = None
    linked_event_refs: Optional[List[LinkedEventRef]] = Field(None, max_length=20)
    pinned: Optional[bool] = None

    @field_validator("tags")
    @classmethod
    def _tag_item_length(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        for t in v:
            if not t or len(t) > 64:
                raise ValueError("each tag must be 1–64 characters")
        return v


class WorkspaceRca(BaseModel):
    model_config = ConfigDict(extra="ignore")
    narrative: str = ""
    hypothesis: Optional[str] = None
    confidence: float = 0.5
    evidence: List[str] = Field(default_factory=list)
    mitre_refs: List[str] = Field(default_factory=list)
    unknowns: List[str] = Field(default_factory=list)
    generated_at: Optional[datetime] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    fallback: bool = False
    fallback_reason: Optional[str] = None


class Workspace(BaseModel):
    model_config = ConfigDict(extra="ignore")
    version: int = 1
    notes: List[WorkspaceNote] = Field(default_factory=list)
    rca: Optional[WorkspaceRca] = None


class Incident(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    title: str
    source_log_id: Optional[str] = None
    created_by: str  # user id
    created_at: datetime = Field(default_factory=utc_now)
    severity: IncidentSeverity = "medium"
    status: IncidentStatus = "new"
    iocs: List[IoC] = []
    techniques: List[ATTACKTechnique] = []
    timeline: List[TimelineEvent] = []
    threat_score: float = 0.0
    playbook: Optional[Playbook] = None
    hitl_required: bool = False
    reviewer_id: Optional[str] = None
    reviewer_notes: Optional[str] = None
    summary: Optional[str] = None
    # A-P5: formalize fields previously attached outside the model
    correlation: Optional[Dict[str, Any]] = None
    files_meta: List[Dict[str, Any]] = []
    workspace: Optional[Workspace] = None


# ---------- Log Jobs ----------
class LogJob(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    filename: str
    size: int
    format: str = "auto"
    mode: Literal["single", "batch", "zip"] = "single"
    files: List[str] = []
    expanded_files: List[str] = []
    files_meta: List[Dict[str, Any]] = []
    status: Literal[
        "queued", "parsing", "extracting", "enriching", "correlating", "generating", "done", "failed"] = "queued"
    progress: int = 0
    created_by: str
    created_at: datetime = Field(default_factory=utc_now)
    incident_ids: List[str] = []
    error: Optional[str] = None


# ---------- Audit ----------
class AuditEvent(BaseModel):
    id: str = Field(default_factory=new_id)
    ts: datetime = Field(default_factory=utc_now)
    actor_id: str
    actor_email: str
    action: str
    target_type: str
    target_id: str
    detail: Dict[str, Any] = {}


# ---------- Settings ----------
# Secret fields are stored in MongoDB (and optionally synced to backend/.env).
# GET /settings never returns raw values — only has_* booleans.
SECRET_SETTINGS_FIELDS = (
    "anthropic_api_key",
    "openai_api_key",
    "gemini_api_key",
    "groq_api_key",
    "abuseipdb_key",
    "virustotal_key",
    "greynoise_key",
    "threatfox_key",
    "otx_api_key",
    "shodan_api_key",
    "cohere_api_key",
    "slack_webhook_url",
)


class Settings(BaseModel):
    """Global runtime settings. Extra JSON keys from the UI are ignored."""
    model_config = ConfigDict(extra="ignore")

    # LLM
    llm_provider: Literal["openai", "anthropic", "gemini", "groq"] = "anthropic"
    llm_model: str = "claude-sonnet-4-6"
    llm_temperature: float = 0.2
    llm_token_budget_monthly: int = 0  # 0 = unlimited
    # Cross-provider fallback when primary fails (requires fallback provider key)
    llm_fallback_enabled: bool = True
    llm_fallback_provider: Optional[Literal["openai", "anthropic", "gemini", "groq", "none"]] = "anthropic"
    # Provider keys (UI → MongoDB; blank on update keeps previous value)
    # Send the sentinel __CLEAR__ (or use POST /settings/clear-secrets) to wipe a key.
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    # HiTL / correlation
    grounding_threshold: float = 0.7
    hitl_severity_min: IncidentSeverity = "critical"
    auto_approve_grounding_min: float = 0.9  # if grounding >= this AND severity < critical → auto-approve
    correlation_window_minutes: int = 30
    # Threat intel
    abuseipdb_key: Optional[str] = None
    virustotal_key: Optional[str] = None
    greynoise_key: Optional[str] = None
    threatfox_key: Optional[str] = None
    otx_api_key: Optional[str] = None
    shodan_api_key: Optional[str] = None
    # RAG / re-rank (Cohere) — secret key never returned on GET
    cohere_api_key: Optional[str] = None
    cohere_rerank_enabled: bool = True  # when True and key set, re-rank hybrid hits
    # ATT&CK: optional LLM refine of technique list (allow-list validated; default off for CI/cost)
    llm_technique_refine: bool = False
    # Investigator: partially redact IoC values in LLM prompts (A-L4)
    llm_redact_iocs: bool = False
    # Notifications
    slack_webhook_url: Optional[str] = None
    email_alerts_to: Optional[str] = None
    # Security
    session_timeout_hours: int = 24
    failed_login_lockout: int = 5
    # Data retention
    incident_retention_days: int = 90
    enrichment_cache_ttl_hours: int = 24


# Explicit clear sentinel for secret fields on PUT /settings (blank keeps previous).
SETTINGS_CLEAR_SENTINEL = "__CLEAR__"


# ---------- Review Actions ----------
class ReviewAction(BaseModel):
    action: Literal["approve", "reject", "edit_and_approve"]
    notes: Optional[str] = None
    edited_playbook: Optional[Playbook] = None
