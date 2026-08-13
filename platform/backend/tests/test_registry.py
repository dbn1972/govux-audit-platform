"""National register bulk import.

The steward dashboards (national / league / ministries / states) are all built to
report on the whole .gov.in estate, but nothing could load more than a handful of
domains. These tests pin the import contract, and especially the two properties
that keep the register trustworthy: a dry run must write nothing, and an imported
domain must NOT be treated as owner-verified.
"""
import uuid
from app import models, security

HEADER = "url,organisation,org_type,state_code,category\n"


def _csv(*rows):
    return HEADER + "".join(r + "\n" for r in rows)


def _post(client, headers, body):
    return client.post("/v1/admin/registry/import", headers=headers, json=body)


def test_requires_steward_role(client, db):
    org = models.Organisation(name=f"R{uuid.uuid4().hex[:6]}", org_type="department")
    db.add(org); db.flush()
    u = models.User(email=f"own.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role="owner")
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), "owner", str(dev.id))
    r = _post(client, {"Authorization": f"Bearer {tok}"},
              {"csv": _csv("a.gov.in,Dept A"), "dry_run": True})
    assert r.status_code == 403


def test_dry_run_reports_without_writing_anything(client, ctx, db):
    tag = uuid.uuid4().hex[:8]
    before_d = db.query(models.Domain).count()
    before_o = db.query(models.Organisation).count()

    body = _csv(f"a{tag}.gov.in,Ministry {tag},ministry,DL,transactional",
                f"b{tag}.nic.in,Ministry {tag},ministry,DL,informational")
    r = _post(client, ctx["headers"], {"csv": body, "dry_run": True})
    assert r.status_code == 200
    out = r.json()
    assert out["dry_run"] is True
    assert out["imported"] == 2 and out["invalid"] == 0
    assert out["new_organisations"] == [f"Ministry {tag}"]

    # the whole point of a preview: nothing landed
    assert db.query(models.Domain).count() == before_d
    assert db.query(models.Organisation).count() == before_o


def test_real_import_creates_orgs_and_domains(client, ctx, db):
    tag = uuid.uuid4().hex[:8]
    body = _csv(f"x{tag}.gov.in,Ministry {tag},ministry,KA,transactional",
                f"y{tag}.gov.in,Ministry {tag},ministry,KA,",
                f"z{tag}.nic.in,Board {tag},psu,,informational")
    out = _post(client, ctx["headers"], {"csv": body, "dry_run": False}).json()
    assert out["imported"] == 3 and out["duplicates"] == 0 and out["invalid"] == 0
    assert sorted(out["new_organisations"]) == [f"Board {tag}", f"Ministry {tag}"]

    # one organisation reused across its two domains, not duplicated
    ministry = db.query(models.Organisation).filter_by(name=f"Ministry {tag}").one()
    assert ministry.org_type == "ministry" and ministry.state_code == "KA"
    assert db.query(models.Domain).filter_by(org_id=ministry.id).count() == 2

    d = db.query(models.Domain).filter_by(url=f"x{tag}.gov.in").one()
    assert d.service_category == "transactional" and d.tld == "gov.in"
    assert db.query(models.Domain).filter_by(url=f"z{tag}.nic.in").one().tld == "nic.in"


def test_imported_domains_are_never_pre_verified(client, ctx, db):
    """Registry listing is not proof of ownership — DNS-TXT verification must
    stay the only path to `verified`, or anyone could audit anyone's domain."""
    tag = uuid.uuid4().hex[:8]
    _post(client, ctx["headers"],
          {"csv": _csv(f"v{tag}.gov.in,Dept {tag}"), "dry_run": False})
    assert db.query(models.Domain).filter_by(url=f"v{tag}.gov.in").one().verify_status == "pending"


def test_duplicates_within_file_and_against_db_are_skipped(client, ctx, db):
    tag = uuid.uuid4().hex[:8]
    host = f"dup{tag}.gov.in"
    first = _post(client, ctx["headers"],
                  {"csv": _csv(f"{host},Dept {tag}"), "dry_run": False}).json()
    assert first["imported"] == 1

    # same host again: once already in the DB, and twice more inside one file
    again = _post(client, ctx["headers"],
                  {"csv": _csv(f"{host},Dept {tag}", f"{host},Dept {tag}"),
                   "dry_run": False}).json()
    assert again["imported"] == 0 and again["duplicates"] == 2
    assert db.query(models.Domain).filter_by(url=host).count() == 1


def test_non_gov_and_malformed_rows_are_rejected_with_row_numbers(client, ctx, db):
    tag = uuid.uuid4().hex[:8]
    body = _csv(f"good{tag}.gov.in,Dept {tag}",
                "evil.example.com,Dept X",          # not a gov domain
                ",Dept Y",                          # missing url
                f"bad{tag}.gov.in,",                # missing organisation
                f"ug{tag}.gov.in,Dept Z,wizard")    # unknown org_type
    out = _post(client, ctx["headers"], {"csv": body, "dry_run": False}).json()
    assert out["imported"] == 1 and out["invalid"] == 4
    rows = {e["row"] for e in out["errors"]}
    assert rows == {3, 4, 5, 6}                      # row 1 is the header
    assert not db.query(models.Domain).filter_by(url="evil.example.com").first()


def test_full_urls_and_odd_casing_are_normalised(client, ctx, db):
    tag = uuid.uuid4().hex[:8]
    body = _csv(f"HTTPS://WWW.N{tag}.GOV.IN/some/path?x=1,Dept {tag}")
    out = _post(client, ctx["headers"], {"csv": body, "dry_run": False}).json()
    assert out["imported"] == 1
    assert db.query(models.Domain).filter_by(url=f"www.n{tag}.gov.in").one()


def test_missing_columns_and_empty_body_are_clear_errors(client, ctx):
    assert _post(client, ctx["headers"],
                 {"csv": "organisation\nDept A\n"}).status_code == 400   # no url column
    assert _post(client, ctx["headers"],
                 {"csv": "url,organisation\n"}).status_code == 400       # header only


def test_row_limit_is_enforced(client, ctx):
    body = HEADER + "".join(f"h{i}.gov.in,Dept {i}\n" for i in range(5001))
    r = _post(client, ctx["headers"], {"csv": body, "dry_run": True})
    assert r.status_code == 400 and "5000" in r.json()["detail"]
