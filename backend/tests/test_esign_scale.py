from datetime import datetime, timedelta, timezone

import pytest

from services.esign.envelope_service import EsignError
from services.esign.scale_service import bulk_headers, validate_bulk_csv


SNAPSHOT = {
    "recipient_roles": [
        {"label": "Client Signer", "role": "signer", "routing_order": 1},
        {"label": "Firm Reviewer", "role": "approver", "routing_order": 2},
    ],
    "fields": [
        {"properties": {"data_label": "engagement_amount", "sender_prefill": ""}},
        {"properties": {"data_label": "signer_value"}},
    ],
}


def test_bulk_headers_are_version_specific():
    assert bulk_headers(SNAPSHOT) == [
        "envelope_title", "message", "expires_in_days", "reminder_interval_hours",
        "client_signer_name", "client_signer_email", "firm_reviewer_name", "firm_reviewer_email",
        "engagement_amount", "schedule_at", "schedule_timezone",
    ]


def test_bulk_csv_normalizes_and_accepts_mixed_schedules():
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    schedule = (now + timedelta(hours=2)).isoformat()
    header = ",".join(bulk_headers(SNAPSHOT))
    content = (header + "\nAgreement,,30,24,Jane Client,JANE@example.com,Ray Reviewer,ray@example.com,1250,,\n"
        f"Scheduled,,,48,A Client,a@example.com,R Reviewer,r@example.com,99,{schedule},America/Los_Angeles\n").encode()
    rows = validate_bulk_csv(content, SNAPSHOT, now=now)
    assert len(rows) == 2
    assert rows[0]["normalized"]["client_signer_email"] == "jane@example.com"
    assert rows[0]["errors"] == [] and rows[0]["scheduled_at"] is None
    assert rows[1]["errors"] == [] and rows[1]["scheduled_at"] == now + timedelta(hours=2)


def test_bulk_csv_collects_row_errors_without_rejecting_job():
    now = datetime(2026, 7, 19, 12, tzinfo=timezone.utc)
    header = ",".join(bulk_headers(SNAPSHOT))
    content = (header + "\nBad,,0,,Same,same@example.com,Same,same@example.com,,,\n").encode()
    row = validate_bulk_csv(content, SNAPSHOT, now=now)[0]
    assert "recipient emails must be unique" in ";".join(row["errors"])
    assert "expires_in_days" in ";".join(row["errors"])


def test_bulk_csv_requires_exact_headers_and_utf8():
    with pytest.raises(EsignError, match="headers must exactly match"):
        validate_bulk_csv(b"name,email\nA,a@example.com\n", SNAPSHOT)
    with pytest.raises(EsignError, match="UTF-8"):
        validate_bulk_csv(b"\xff\xfe", SNAPSHOT)


def test_nonexistent_dst_local_time_is_invalid():
    header = ",".join(bulk_headers(SNAPSHOT))
    content = (header + "\nDST,,,24,Jane,jane@example.com,Ray,ray@example.com,,2027-03-14T02:30:00,America/Los_Angeles\n").encode()
    rows = validate_bulk_csv(content, SNAPSHOT, now=datetime(2027, 3, 1, tzinfo=timezone.utc))
    assert "daylight saving" in ";".join(rows[0]["errors"])
