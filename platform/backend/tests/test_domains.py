import uuid


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
