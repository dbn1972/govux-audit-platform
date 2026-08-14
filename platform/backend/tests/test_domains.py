import uuid

from app import models


def test_register_rejects_non_gov(client, ctx):
    r = client.post("/v1/domains", headers=ctx["headers"],
                    json={"url": "example.com"})
    assert r.status_code == 400


def test_register_and_verify_gov_domain(client, ctx, monkeypatch):
    from app.services import verification
    url = f"svc{uuid.uuid4().hex[:6]}.nic.in"
    r = client.post("/v1/domains", headers=ctx["headers"],
                    json={"url": url, "service_category": "transactional"})
    assert r.status_code == 201
    body = r.json()
    assert body["verify_status"] == "pending"
    assert body["verify_token"].startswith("govux-verify=")

    # ownership proof is real now — simulate the token being present in DNS TXT
    monkeypatch.setattr(verification, "verify", lambda host, token, method: True)
    v = client.post(f"/v1/domains/{body['id']}/verify",
                    headers=ctx["headers"], json={"method": "dns_txt"})
    assert v.status_code == 200 and v.json()["verify_status"] == "verified"


def test_verify_fails_when_token_absent(client, ctx, monkeypatch):
    from app.services import verification
    url = f"nov{uuid.uuid4().hex[:6]}.gov.in"
    body = client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).json()
    monkeypatch.setattr(verification, "verify", lambda host, token, method: False)
    v = client.post(f"/v1/domains/{body['id']}/verify",
                    headers=ctx["headers"], json={"method": "dns_txt"})
    assert v.status_code == 200 and v.json()["verify_status"] == "failed"


def test_register_duplicate_conflict(client, ctx):
    url = f"dup{uuid.uuid4().hex[:6]}.gov.in"
    assert client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).status_code == 201
    assert client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).status_code == 409


def test_list_domains(client, ctx, verified_domain):
    r = client.get("/v1/domains", headers=ctx["headers"])
    assert r.status_code == 200
    assert any(d["url"] == verified_domain.url for d in r.json())


def test_verify_missing_domain(client, ctx):
    r = client.post(f"/v1/domains/{uuid.uuid4()}/verify",
                    headers=ctx["headers"], json={"method": "dns_txt"})
    assert r.status_code == 404


def test_pending_domain_exposes_its_verify_token_but_verified_does_not(client, ctx, monkeypatch):
    """The DNS-TXT value used to come back ONLY from the registration response,
    so navigating away lost it — and since DNS can take 30 minutes to propagate,
    navigating away is the normal case. A pending domain could then never be
    verified (re-registering 409s) and so could never be audited.

    Verified domains get None: the token has served its purpose and there is no
    reason to keep handing it out."""
    from app.services import cache, verification
    url = f"res{uuid.uuid4().hex[:6]}.gov.in"

    r = client.post("/v1/domains", headers=ctx["headers"], json={"url": url})
    assert r.status_code == 201, r.text
    token = r.json()["verify_token"]
    assert token.startswith("govux-verify=")

    cache.invalidate_prefix("domains")
    listed = {d["url"]: d for d in client.get("/v1/domains", headers=ctx["headers"]).json()}
    assert listed[url]["verify_status"] == "pending"
    assert listed[url]["verify_token"] == token      # survives a page reload

    monkeypatch.setattr(verification, "verify", lambda host, tok, method: True)
    assert client.post(f"/v1/domains/{r.json()['id']}/verify", headers=ctx["headers"],
                       json={"method": "dns_txt"}).status_code == 200

    cache.invalidate_prefix("domains")
    listed = {d["url"]: d for d in client.get("/v1/domains", headers=ctx["headers"]).json()}
    assert listed[url]["verify_status"] == "verified"
    assert listed[url]["verify_token"] is None


def test_verification_cannot_be_bypassed_by_naming_an_unimplemented_method(client, ctx):
    """`method` used to be a free string and `sso_mapping` returned True, so any
    signed-in user could register an unclaimed .gov.in domain and self-verify it
    without proving anything — then audit a site they do not control. The two
    real proofs are the only accepted values."""
    url = f"byp{uuid.uuid4().hex[:6]}.gov.in"
    d = client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).json()

    for bogus in ("sso_mapping", "trust_me", ""):
        r = client.post(f"/v1/domains/{d['id']}/verify", headers=ctx["headers"],
                        json={"method": bogus})
        assert r.status_code == 422, f"{bogus!r} was accepted: {r.text}"

    # and the service itself fails closed even if called directly
    from app.services import verification
    assert verification.verify(url, d["verify_token"], "sso_mapping") is False
    assert verification.verify(url, d["verify_token"], "anything-else") is False

    from app.services import cache
    cache.invalidate_prefix("domains")
    listed = {x["url"]: x for x in client.get("/v1/domains", headers=ctx["headers"]).json()}
    assert listed[url]["verify_status"] == "pending"      # never flipped


# ---------- competing claims (ownership by proof, not by arriving first) ------
def _other_org_user(db, role="owner"):
    """A user in a DIFFERENT organisation, with auth headers."""
    from app import security
    org = models.Organisation(name=f"Rival {uuid.uuid4().hex[:6]}", org_type="department")
    db.add(org); db.flush()
    u = models.User(email=f"r.{uuid.uuid4().hex[:6]}@nic.in", org_id=org.id, role=role)
    db.add(u); db.flush()
    dev = models.Device(user_id=u.id, device_pubkey="pk"); db.add(dev); db.commit()
    tok = security.issue_access_token(str(u.id), role, str(dev.id))
    return org, {"Authorization": f"Bearer {tok}"}


def test_two_organisations_may_both_claim_the_same_host(client, ctx, db):
    """The old global UNIQUE made this a 409, so whoever registered first owned
    the host forever — without ever proving anything. Registration is a claim."""
    url = f"cnt{uuid.uuid4().hex[:6]}.gov.in"
    a = client.post("/v1/domains", headers=ctx["headers"], json={"url": url})
    assert a.status_code == 201
    _, rival = _other_org_user(db)
    b = client.post("/v1/domains", headers=rival, json={"url": url})
    assert b.status_code == 201, b.text
    # distinct claims, distinct tokens — each must prove control independently
    assert a.json()["id"] != b.json()["id"]
    assert a.json()["verify_token"] != b.json()["verify_token"]


def test_one_organisation_cannot_stack_duplicate_claims(client, ctx):
    url = f"dup{uuid.uuid4().hex[:6]}.gov.in"
    assert client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).status_code == 201
    r = client.post("/v1/domains", headers=ctx["headers"], json={"url": url})
    assert r.status_code == 409 and "pending claim" in r.json()["detail"]


def test_proving_ownership_supersedes_every_competing_claim(client, ctx, db, monkeypatch):
    from app.services import verification, cache
    url = f"win{uuid.uuid4().hex[:6]}.gov.in"
    mine = client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).json()
    rival_org, rival = _other_org_user(db)
    theirs = client.post("/v1/domains", headers=rival, json={"url": url}).json()

    monkeypatch.setattr(verification, "verify", lambda host, tok, method: True)
    r = client.post(f"/v1/domains/{mine['id']}/verify", headers=ctx["headers"],
                    json={"method": "dns_txt"})
    assert r.status_code == 200
    assert r.json()["verify_status"] == "verified"
    assert r.json()["superseded_claims"] == 1

    db.expire_all()
    # the loser is `superseded`, not `failed` — their token was never the problem
    assert db.get(models.Domain, theirs["id"]).verify_status == "superseded"

    # and the host is now closed to new claims
    cache.invalidate_prefix("domains")
    again = client.post("/v1/domains", headers=rival, json={"url": url})
    assert again.status_code == 409 and "another organisation" in again.json()["detail"]


def test_only_one_verified_row_per_host_at_the_database_level(client, ctx, db, monkeypatch):
    """Belt and braces: even if the router logic were bypassed, the partial
    unique index refuses a second verified row for the same host."""
    from sqlalchemy.exc import IntegrityError
    from app.services import verification
    url = f"idx{uuid.uuid4().hex[:6]}.gov.in"
    mine = client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).json()
    rival_org, rival = _other_org_user(db)
    theirs = client.post("/v1/domains", headers=rival, json={"url": url}).json()

    monkeypatch.setattr(verification, "verify", lambda host, tok, method: True)
    client.post(f"/v1/domains/{mine['id']}/verify", headers=ctx["headers"], json={"method": "dns_txt"})

    db.expire_all()
    loser = db.get(models.Domain, theirs["id"])
    loser.verify_status = "verified"
    try:
        db.commit()
        assert False, "a second verified row for the same host was allowed"
    except IntegrityError:
        db.rollback()


# ---------- steward oversight -------------------------------------------------
def test_claims_listing_flags_contested_hosts_and_needs_a_steward(client, ctx, db):
    url = f"see{uuid.uuid4().hex[:6]}.gov.in"
    client.post("/v1/domains", headers=ctx["headers"], json={"url": url})
    _, rival = _other_org_user(db)
    client.post("/v1/domains", headers=rival, json={"url": url})

    # an ordinary owner may not inspect other organisations' claims
    _, plain = _other_org_user(db, role="owner")
    assert client.get("/v1/domains/claims", headers=plain).status_code == 403

    body = client.get("/v1/domains/claims", headers=ctx["headers"],
                      params={"contested_only": True}).json()
    row = next(i for i in body["items"] if i["url"] == url)
    assert row["contested"] is True and len(row["claims"]) == 2
    assert all(c["org_name"] for c in row["claims"])        # named, so a human can adjudicate


def test_steward_can_release_a_squatted_claim_but_never_a_verified_domain(
        client, ctx, db, monkeypatch, verified_domain):
    url = f"sqt{uuid.uuid4().hex[:6]}.gov.in"
    _, squatter = _other_org_user(db)
    claim = client.post("/v1/domains", headers=squatter, json={"url": url}).json()

    assert client.delete(f"/v1/domains/claims/{claim['id']}",
                         headers=ctx["headers"]).status_code == 204
    assert db.get(models.Domain, claim["id"]) is None
    # released, so the host is claimable again
    assert client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).status_code == 201

    # proven ownership is not a steward's to revoke — it would orphan audit history
    r = client.delete(f"/v1/domains/claims/{verified_domain.id}", headers=ctx["headers"])
    assert r.status_code == 409 and "verified" in r.json()["detail"]


# ---------- steward override --------------------------------------------------
def test_force_verify_is_steward_only_and_demands_a_written_reason(client, ctx, db):
    """The override used to ride on `sso_mapping`, which verify() returned True
    for unconditionally — so any signed-in user could self-verify any unclaimed
    domain. It is now a steward action that puts someone on record."""
    url = f"fv{uuid.uuid4().hex[:6]}.gov.in"
    d = client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).json()

    _, owner = _other_org_user(db, role="owner")
    assert client.post(f"/v1/domains/{d['id']}/force-verify", headers=owner,
                       json={"reason": "we own this, honestly"}).status_code == 403

    # a reason is mandatory and must actually say something
    for bad in ({}, {"reason": ""}, {"reason": "because"}):
        r = client.post(f"/v1/domains/{d['id']}/force-verify", headers=ctx["headers"], json=bad)
        assert r.status_code == 422, f"{bad!r} was accepted"


def test_force_verify_records_the_override_distinctly_from_a_proof(client, ctx, db):
    from app.services import cache
    url = f"ov{uuid.uuid4().hex[:6]}.gov.in"
    d = client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).json()

    r = client.post(f"/v1/domains/{d['id']}/force-verify", headers=ctx["headers"],
                    json={"reason": "DNS held by a third-party vendor; ownership confirmed by letter"})
    assert r.status_code == 200, r.text
    assert r.json()["verify_status"] == "verified"
    # never mistakable for a DNS/file proof — "verified but unproven" stays queryable
    assert r.json()["verify_method"] == "steward_override"

    db.expire_all()
    assert db.get(models.Domain, d["id"]).verify_method == "steward_override"

    # and the actor + justification are on record
    entry = (db.query(models.AuditLog)
               .filter(models.AuditLog.action == "domain_force_verified",
                       models.AuditLog.target == url).first())
    assert entry is not None
    assert entry.actor_id == ctx["user"].id
    assert "third-party vendor" in entry.detail["reason"]

    cache.invalidate_prefix("domains")
    listed = {x["url"]: x for x in client.get("/v1/domains", headers=ctx["headers"]).json()}
    assert listed[url]["verify_method"] == "steward_override"


def test_force_verify_settles_competing_claims_and_respects_a_real_proof(
        client, ctx, db, monkeypatch):
    from app.services import verification
    url = f"cf{uuid.uuid4().hex[:6]}.gov.in"
    mine = client.post("/v1/domains", headers=ctx["headers"], json={"url": url}).json()
    _, rival = _other_org_user(db)
    theirs = client.post("/v1/domains", headers=rival, json={"url": url}).json()

    # an override still decides the host, exactly as a proof does
    r = client.post(f"/v1/domains/{mine['id']}/force-verify", headers=ctx["headers"],
                    json={"reason": "ministry confirmed ownership in writing"})
    assert r.status_code == 200 and r.json()["superseded_claims"] == 1
    db.expire_all()
    assert db.get(models.Domain, theirs["id"]).verify_status == "superseded"

    # ...but it must never override someone who actually PROVED ownership
    other_url = f"pr{uuid.uuid4().hex[:6]}.gov.in"
    proven = client.post("/v1/domains", headers=rival, json={"url": other_url}).json()
    monkeypatch.setattr(verification, "verify", lambda host, tok, method: True)
    client.post(f"/v1/domains/{proven['id']}/verify", headers=rival, json={"method": "dns_txt"})

    late = models.Domain(org_id=ctx["org"].id, url=other_url, tld="gov.in",
                         verify_status="pending", verify_token="x", created_by=ctx["user"].id)
    db.add(late); db.commit()
    r = client.post(f"/v1/domains/{late.id}/force-verify", headers=ctx["headers"],
                    json={"reason": "we believe this one is ours as well"})
    assert r.status_code == 409 and "already proven" in r.json()["detail"]


def test_force_verify_refuses_an_already_verified_domain(client, ctx, verified_domain):
    r = client.post(f"/v1/domains/{verified_domain.id}/force-verify", headers=ctx["headers"],
                    json={"reason": "belt and braces, just in case"})
    assert r.status_code == 409 and "already verified" in r.json()["detail"]
