<!-- Thanks for contributing. Keep PRs focused; describe what and why. -->

## What & why
<!-- What does this change do, and why is it needed? Link any issue. -->

Closes #

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / tech debt
- [ ] Docs
- [ ] Security

## How verified
<!-- Commands run, results. For UI changes attach before/after screenshots. -->
- [ ] `docker compose exec api pytest` passes (coverage ≥ 80%)
- [ ] `docker compose exec web npx tsc --noEmit` clean
- [ ] `python3 platform/scripts/verify_screens.py` passes
- [ ] Added/updated tests for the changed paths

## Invariants checklist
- [ ] Score path stays deterministic & LLM/ML-free (ML advisory only)
- [ ] Legal compliance verdict remains separate from the UX band
- [ ] Audits remain async (202 + queue), never inline
- [ ] `.gov.in`/`.nic.in` restriction preserved (code + DB)
- [ ] Schema change kept in sync: `schema.sql` ⇄ `models.py` ⇄ Alembic

## Security considerations
<!-- Any authz/authn/SSRF/secret/PII impact? If none, say "none". -->
