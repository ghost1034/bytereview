from datetime import datetime, timezone
from unittest.mock import MagicMock

from routes.admin import (
    _ACTIVITY_SOURCES,
    _activity_source_query,
    _activity_source_timeline_query,
    _activity_status,
    _activity_timeline_granularity,
)


def _source(table_name: str):
    return next(source for source in _ACTIVITY_SOURCES if source["table"] == table_name)


def test_activity_source_query_normalizes_user_and_record_metadata():
    count_result = MagicMock()
    count_result.scalar_one.return_value = 1
    rows_result = MagicMock()
    rows_result.mappings.return_value = [{
        "record_id": "run-123",
        "activity_timestamp": datetime(2026, 7, 27, 18, 30, tzinfo=timezone.utc),
        "activity_title": "Quarterly packet.pdf",
        "activity_action": "Run started",
        "activity_status": "completed",
        "activity_user_id": "user-123",
        "activity_user_email": "admin@example.com",
        "activity_user_name": "Avery Admin",
        "activity_actor_email": None,
    }]
    db = MagicMock()
    db.execute.side_effect = [count_result, rows_result]

    total, rows = _activity_source_query(
        db,
        _source("form_fill_runs"),
        fetch_limit=50,
        user_id="user-123",
        from_time=datetime(2026, 7, 1, tzinfo=timezone.utc),
        to_time=None,
        status="completed",
        search="Quarterly",
    )

    assert total == 1
    assert rows == [{
        "id": "form_fill_runs:run-123",
        "record_id": "run-123",
        "table": "form_fill_runs",
        "product": "form-fill",
        "product_label": "Form Fill",
        "kind": "Form Fill run",
        "title": "Quarterly packet.pdf",
        "action": "Run started",
        "status": "completed",
        "timestamp": "2026-07-27T18:30:00+00:00",
        "user": {
            "id": "user-123",
            "email": "admin@example.com",
            "display_name": "Avery Admin",
        },
    }]


def test_activity_status_uses_source_specific_boolean_labels():
    assert _activity_status(_source("connector_action_logs"), True) == "Succeeded"
    assert _activity_status(_source("connector_action_logs"), False) == "Failed"
    assert _activity_status(_source("automations"), True) == "Enabled"
    assert _activity_status(_source("automations"), False) == "Disabled"


def test_activity_timeline_granularity_tracks_selected_range():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert _activity_timeline_granularity(start, datetime(2026, 1, 2, tzinfo=timezone.utc)) == "hour"
    assert _activity_timeline_granularity(start, datetime(2026, 2, 1, tzinfo=timezone.utc)) == "day"
    assert _activity_timeline_granularity(start, datetime(2027, 1, 1, tzinfo=timezone.utc)) == "week"
    assert _activity_timeline_granularity(start, datetime(2029, 1, 1, tzinfo=timezone.utc)) == "month"
    assert _activity_timeline_granularity(None, None) == "month"


def test_activity_timeline_query_normalizes_database_buckets():
    result = MagicMock()
    result.mappings.return_value = [
        {
            "activity_bucket": datetime(2026, 7, 27, tzinfo=timezone.utc),
            "activity_count": 14,
        }
    ]
    db = MagicMock()
    db.execute.return_value = result

    points = _activity_source_timeline_query(
        db,
        _source("form_fill_runs"),
        granularity="day",
        user_id=None,
        from_time=datetime(2026, 7, 1, tzinfo=timezone.utc),
        to_time=None,
        status=None,
        search=None,
    )

    assert points == [{"timestamp": "2026-07-27T00:00:00+00:00", "count": 14}]
    db.execute.assert_called_once()
