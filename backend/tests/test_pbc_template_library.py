from __future__ import annotations

from services.pbc_template_library import PBC_TEMPLATE_LIBRARY


def test_pbc_library_covers_core_engagement_types_with_unique_names():
    names = [definition.name for definition in PBC_TEMPLATE_LIBRARY]

    assert len(PBC_TEMPLATE_LIBRARY) >= 15
    assert len(names) == len(set(names))
    assert {definition.engagement_type for definition in PBC_TEMPLATE_LIBRARY} == {
        "audit", "tax", "bookkeeping", "advisory", "other"
    }


def test_pbc_library_items_are_ready_to_instantiate():
    allowed_priorities = {"low", "normal", "high", "urgent"}

    for definition in PBC_TEMPLATE_LIBRARY:
        assert len(definition.items) >= 14, definition.name
        assert len({item["title"] for item in definition.items}) == len(definition.items)
        for request in definition.items:
            assert request["category"].strip()
            assert request["title"].strip()
            assert request["priority"] in allowed_priorities
            assert isinstance(request["expected_formats"], list)


def test_legacy_audit_template_is_now_comprehensive():
    annual_audit = next(
        definition for definition in PBC_TEMPLATE_LIBRARY
        if definition.name == "Annual financial statement audit"
    )

    assert len(annual_audit.items) >= 30
    assert len({item["category"] for item in annual_audit.items}) >= 10
