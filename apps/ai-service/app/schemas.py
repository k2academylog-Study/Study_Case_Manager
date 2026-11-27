from datetime import date, datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Filters(Input):
    class_id: UUID | None = None
    batch_id: UUID | None = None
    subject_id: UUID | None = None
    staff_id: UUID | None = None
    student_id: UUID | None = None
    from_date: date | None = None
    to_date: date | None = None

    @model_validator(mode="after")
    def period(self):
        if self.from_date and self.to_date and self.from_date > self.to_date:
            raise ValueError("Invalid reporting period.")
        return self

class Analyze(Filters):
    request_id: UUID

class AssistantQuery(Input):
    request_id: UUID
    conversation_id: UUID | None = None
    question: str = Field(min_length=1, max_length=4000, pattern=r"\S")

class QueryTool(Input):
    tool: Literal["student_profiles","attendance","topic_attendance","assessments","assignments","observations","staff_schedule","teaching_hours","syllabus","pending_records","calendar","class_performance","batch_performance","subject_performance"]
    student_name: str | None = Field(default=None,max_length=100)
    class_name: str | None = Field(default=None,max_length=100)
    batch_name: str | None = Field(default=None,max_length=100)
    subject_name: str | None = Field(default=None,max_length=100)
    from_date: date | None = None
    to_date: date | None = None
    threshold: float | None = Field(default=None,ge=0,le=100)

class AssistantPlan(Input):
    tools: list[QueryTool] = Field(max_length=5)
    handoff: Literal["none","performance","communication","student_report","staff_report","class_report"] = "none"

class AssistantAnswer(Input):
    body: str = Field(max_length=7000)
    source_tools: list[str] = Field(max_length=5)
    follow_up: list[str] = Field(max_length=3)

class Finding(Input):
    student_id: UUID
    summary: str = Field(max_length=1250)
    recommendations: list[str] = Field(max_length=6)
    evidence_keys: list[str] = Field(min_length=1,max_length=12)

class AnalysisAnswer(Input):
    findings: list[Finding] = Field(max_length=30)

class DraftRequest(Input):
    request_id: UUID
    command: str = Field(min_length=1, max_length=4000, pattern=r"\S")
    channel: Literal["email","whatsapp"]
    staff_ids: list[UUID] = Field(default_factory=list,max_length=300)
    student_id: UUID | None = None
    template_id: UUID | None = None
    report_id: UUID | None = None

class DraftIntent(Input):
    selection: Literal["all","named","subject","class","batch","pending_attendance","pending_marks","delayed_syllabus","timetable_changes","guardian","unclear"]
    subject_name: str | None = Field(default=None,max_length=100)
    class_name: str | None = Field(default=None,max_length=100)
    batch_name: str | None = Field(default=None,max_length=100)
    staff_names: list[str] = Field(default_factory=list,max_length=30)
    personalized: bool = False

class DraftContent(Input):
    subject: str = Field(min_length=1,max_length=160)
    body: str = Field(min_length=1,max_length=3000)
    template_variables: list[str] = Field(default_factory=list,max_length=12)

class CampaignAction(Input):
    campaign_id: UUID
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    when: datetime | None = None
    recurring_days: int | None = Field(default=None,ge=1,le=365)

class EditDraft(Input):
    campaign_id: UUID
    content_hash: str = Field(pattern=r"^[a-f0-9]{64}$")
    subject: str | None = Field(default=None,max_length=160)
    body: str | None = Field(default=None,max_length=3000)
    template_variables: list[str] | None = Field(default=None,max_length=12)


class TemplateRequest(Input):
    name: str = Field(min_length=1,max_length=120)
    channel: Literal["email","whatsapp"]
    body: str = Field(min_length=1,max_length=3000)
    subject: str | None = Field(default=None,max_length=160)
    provider_name: str | None = Field(default=None,pattern=r"^[a-z0-9_]{1,120}$")
    language: str | None = Field(default=None,pattern=r"^[a-z]{2,3}(_[A-Z]{2})?$")

class Intervention(Input):
    student_id: UUID
    staff_id: UUID
    issue: str = Field(min_length=1,max_length=250)
    evidence: str | None = Field(default=None,max_length=8000)
    action: str = Field(min_length=1,max_length=8000)
    target_on: date
    followup_on: date | None = None
    status: Literal["proposed","approved","in_progress","completed","follow_up_required"]
    outcome: str | None = Field(default=None,max_length=8000)
    notes: str | None = Field(default=None,max_length=8000)

