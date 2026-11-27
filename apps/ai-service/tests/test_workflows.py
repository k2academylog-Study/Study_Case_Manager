from datetime import date
from uuid import uuid4

from fastapi.testclient import TestClient
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command

from app.communication import approval_workflow, normalized_contact, snapshot_hash, thread
from app.main import app
from app.tools import calculate_performance


def test_health_and_unauthorized_webhook(monkeypatch):
    monkeypatch.setenv("META_APP_SECRET","test-only-credential")
    from app.config import config
    config.cache_clear()
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        assert client.post("/api/v1/webhooks/whatsapp",json={"entry":[]}).status_code == 403
        assert client.get("/api/v1/ai/assistant/conversations").status_code in (401,403,503)
    config.cache_clear()


def test_approval_interrupt_and_exact_hash():
    campaign=uuid4()
    graph=approval_workflow(InMemorySaver())
    key=thread(campaign)
    checksum=snapshot_hash([{"recipient_key":campaign,"channel":"email","body":"Approved text"}])
    assert snapshot_hash([{"recipient_key":campaign,"channel":"email","body":"Edited text"}])!=checksum
    state=graph.invoke({"campaign_id":str(campaign),"content_hash":checksum},key)
    assert state["__interrupt__"]
    final=graph.invoke(Command(resume={"content_hash":checksum,"decision":"approved"}),key)
    assert final["decision"]=="approved"


def test_contact_parsing():
    assert normalized_contact("whatsapp","+91 (999) 888-7777")=="+919998887777"
    assert normalized_contact("whatsapp","123") is None
    assert normalized_contact("email"," M@example.test ")=="m@example.test"
    assert normalized_contact("email","two@example.test, three@example.test") is None


def test_missing_scores_are_not_zero_and_excused_sessions_excluded():
    student,session,assignment,batch,subject,exam=(uuid4() for _ in range(6))
    day=date(2026,11,1)
    result=calculate_performance({
        "settings":{"exclude_excused":True},"today":day,"to":day,
        "students":[{"id":student}],"subjects":[{"id":subject,"name":"Mathematics"}],
        "staff_assignments":[{"id":assignment,"subject_id":subject,"batch_id":batch}],
        "student_enrollments":[{"student_id":student,"batch_id":batch,"starts_on":day,"ends_on":None}],
        "class_sessions":[{"id":session,"date":day,"staff_assignment_id":assignment}],
        "attendance_records":[{"student_id":student,"session_id":session,"status":"excused"}],
        "assessments":[{"id":exam,"assessment_on":day,"max_marks":50}],
        "assessment_scores":[{"assessment_id":exam,"student_id":student,"status":"absent","marks":None}],
    })[str(student)]
    assert result["eligible_sessions"]==0
    assert result["attendance"] is None
    assert result["average_assessment"] is None
    assert result["flags"]==[]
