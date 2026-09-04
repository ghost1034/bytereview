import csv
import io

from .conftest import login


def _csv(rows, headers):
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=headers)
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue().encode()


def test_export_requires_manager_and_streams_csv(client, admin):
    staff = login(client, "staff@demo.firm")
    assert client.get("/api/firmcrm/export/accounts.csv", headers=staff).status_code == 403
    r = client.get("/api/firmcrm/export/accounts.csv", headers=admin)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert len(rows) >= 24 and "name" in rows[0] and "owner" in rows[0]
    assert client.get("/api/firmcrm/export/unicorns.csv", headers=admin).status_code == 422
    audit = client.get("/api/firmcrm/admin/audit?entity_type=export", headers=admin).json()["items"]
    assert audit and audit[0]["action"] == "export.accounts"
    # opportunities export includes computed weighted column
    r = client.get("/api/firmcrm/export/opportunities.csv", headers=admin)
    row = next(csv.DictReader(io.StringIO(r.text)))
    assert "weighted" in row and "stage" in row


def test_import_template(client, admin):
    r = client.get("/api/firmcrm/import/template/contacts.csv", headers=admin)
    assert r.status_code == 200 and r.text.startswith("first_name,last_name,email")


def test_import_dry_run_reports_exceptions_and_writes_nothing(client, admin):
    before = client.get("/api/firmcrm/accounts?limit=1", headers=admin).json()["total"]
    rows = [
        {"name": "Imported Co One", "account_type": "prospect", "owner_email": "partner.tax@demo.firm", "tags": "import;demo", "is_public_company": "yes"},
        {"name": "Bad Type Co", "account_type": "martian"},
        {"name": "Imported Co One", "account_type": "client"},  # duplicate within file
        {"name": "", "account_type": "prospect"},  # missing name
        {"name": "Unknown Owner Co", "owner_email": "nobody@demo.firm"},
    ]
    data = _csv(rows, ["name", "account_type", "owner_email", "tags", "is_public_company", "bogus_col"])
    r = client.post("/api/firmcrm/import/accounts", files={"file": ("accounts.csv", data, "text/csv")}, data={"dry_run": "true"}, headers=admin)
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["dry_run"] is True and job["total_rows"] == 5 and job["created_rows"] == 1 and job["skipped_rows"] == 4
    msgs = " | ".join(e["message"] for e in job["exceptions"])
    assert any(e["field"] == "account_type" and "Input should be" in e["message"] for e in job["exceptions"])
    assert any(e["field"] == "name" and e["row"] == 5 for e in job["exceptions"])
    assert "duplicate name within file" in msgs and "no user with email" in msgs
    assert any("ignored unknown columns" in e["message"] for e in job["exceptions"])
    rows_by_num = {e["row"] for e in job["exceptions"] if e["row"]}
    assert rows_by_num == {3, 4, 5, 6}
    # Nothing persisted
    assert client.get("/api/firmcrm/accounts?limit=1", headers=admin).json()["total"] == before
    assert client.get("/api/firmcrm/accounts?q=Imported%20Co", headers=admin).json()["total"] == 0
    # Exceptions report downloadable
    rep = client.get(f"/api/firmcrm/import/jobs/{job['id']}/exceptions.csv", headers=admin)
    assert rep.status_code == 200 and "duplicate name within file" in rep.text


def test_import_commit_is_idempotent_upsert(client, admin):
    headers = ["first_name", "last_name", "email", "title", "account_name", "role", "lifecycle"]
    rows = [{"first_name": "Imp", "last_name": "Orted", "email": "imp.orted@example.com", "title": "CFO", "account_name": "Northwind Robotics Inc", "role": "decision_maker", "lifecycle": "client"},
            {"first_name": "Second", "last_name": "Row", "email": "second.row@example.com", "title": "Controller", "account_name": "Does Not Exist", "role": "influencer", "lifecycle": "prospect"}]
    r = client.post("/api/firmcrm/import/contacts", files={"file": ("c.csv", _csv(rows, headers), "text/csv")}, data={"dry_run": "false"}, headers=admin)
    assert r.status_code == 200, r.text
    job = r.json()
    assert job["created_rows"] == 1 and job["skipped_rows"] == 1
    c = client.get("/api/firmcrm/contacts?q=imp.orted", headers=admin).json()["items"][0]
    assert c["title"] == "CFO" and c["account_name"] == "Northwind Robotics Inc"
    # Re-import with a changed title: updates in place, no duplicate
    rows[0]["title"] = "Chief Financial Officer"
    rows[1]["account_name"] = "Northwind Robotics Inc"
    r = client.post("/api/firmcrm/import/contacts", files={"file": ("c.csv", _csv(rows, headers), "text/csv")}, data={"dry_run": "false"}, headers=admin)
    job = r.json()
    assert job["updated_rows"] == 1 and job["created_rows"] == 1 and job["skipped_rows"] == 0
    assert client.get("/api/firmcrm/contacts?q=imp.orted", headers=admin).json()["total"] == 1
    assert client.get("/api/firmcrm/contacts?q=imp.orted", headers=admin).json()["items"][0]["title"] == "Chief Financial Officer"
    jobs = client.get("/api/firmcrm/import/jobs", headers=admin).json()
    assert jobs["total"] >= 3
    audit = client.get("/api/firmcrm/admin/audit?action=import.", headers=admin).json()["items"]
    assert len(audit) >= 2


def test_import_leads_with_practice_area(client, admin):
    headers = ["first_name", "last_name", "company", "email", "source", "practice_area", "estimated_value", "score"]
    rows = [{"first_name": "Lead", "last_name": "One", "company": "Import Leads Inc", "email": "lead@importleads.example.com", "source": "event",
             "practice_area": "Audit & Assurance", "estimated_value": "55000", "score": "70"},
            {"first_name": "Lead", "last_name": "Two", "company": "Import Leads Inc", "email": "lead2@importleads.example.com", "source": "carrier-pigeon",
             "practice_area": "Nope", "estimated_value": "-5", "score": "700"}]
    r = client.post("/api/firmcrm/import/leads", files={"file": ("l.csv", _csv(rows, headers), "text/csv")}, data={"dry_run": "false"}, headers=admin)
    job = r.json()
    assert job["created_rows"] == 1 and job["skipped_rows"] == 1
    fields = {e["field"] for e in job["exceptions"]}
    assert "practice_area" in fields
    lead = client.get("/api/firmcrm/leads?q=importleads", headers=admin).json()["items"][0]
    assert lead["practice_area_name"] == "Audit & Assurance" and lead["estimated_value"] == 55000


def test_import_rejects_bad_files(client, admin):
    r = client.post("/api/firmcrm/import/accounts", files={"file": ("x.csv", b"", "text/csv")}, data={"dry_run": "true"}, headers=admin)
    assert r.status_code == 400
    r = client.post("/api/firmcrm/import/accounts", files={"file": ("x.csv", b"foo,bar\n1,2\n", "text/csv")}, data={"dry_run": "true"}, headers=admin)
    assert r.status_code == 400 and "missing required columns" in r.json()["detail"]
