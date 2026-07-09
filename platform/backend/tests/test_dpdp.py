from app.services import dpdp


def test_aligned_policy_scores_high():
    good = ("We collect personal data for the stated purpose based on your consent. "
            "You may withdraw consent at any time and exercise your right to access, "
            "correction and erasure. Grievance redressal is available; contact our Data "
            "Protection Officer. We retain data only as long as required and apply security "
            "safeguards including encryption. We do not share with any third party without "
            "consent. For children under 18 we obtain verifiable parental consent. You may "
            "complain to the Data Protection Board under the Digital Personal Data Protection "
            "Act 2023.")
    r = dpdp.assess(good)
    assert r.status == "aligned" and r.score >= 85 and not r.findings


def test_empty_policy_flags_everything():
    r = dpdp.assess("")
    assert r.status == "not_aligned"
    assert len(r.findings) == r.total
    assert all(f["guideline"] == "DPDP-2023" for f in r.findings)


def test_partial_policy():
    weak = ("This site collects personal data. We use cookies and take security seriously. "
            "See our terms.")
    r = dpdp.assess(weak)
    # has notice/security but misses consent-withdrawal, rights, grievance, children, board…
    assert r.status in ("partially_aligned", "not_aligned")
    keys = {f["title"] for f in r.findings}
    assert any("withdraw" in k.lower() for k in keys)
    assert any("children" in k.lower() for k in keys)


def test_assess_urls_injected_fetch():
    r = dpdp.assess_urls("https://x.gov.in/privacy", "https://x.gov.in/tos",
                         fetch=lambda u: "consent withdraw grievance")
    assert r.total == len(dpdp.REQUIREMENTS)
    assert "consent" in r.present
