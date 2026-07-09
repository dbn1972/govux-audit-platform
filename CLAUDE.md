# CLAUDE.md — GovUX Audit Platform (steering)

Self-service UX/compliance audit platform for Indian `.gov.in`/`.nic.in` sites (GIGW 3.0,
WCAG 2.2 AA, UX4G, CWV → 0–100 GovUX Score). Code: **`platform/`** (read `platform/CLAUDE.md`).

## Never break
1. Score path deterministic & LLM-free; weights sum 100; ML/LLM advisory only.
2. Legal compliance verdict SEPARATE from UX band; automated-only ⇒ max `partially_compliant`.
3. Audits async: `POST /v1/audits` → 202+task_id → Redis-Streams worker. Never inline.
4. Access `*.gov.in`/`*.nic.in` only (email+domain), enforced in code AND a DB CHECK.
5. Schema change ⇒ `db/schema.sql` ⇄ `app/models.py` ⇄ Alembic, kept in sync.

## Work efficiently (keeps token cost low)
- Grep/Glob to locate; Read with `offset`/`limit`. Don't read whole files/dirs for a few lines.
- Broad multi-file search ⇒ delegate to the Explore/general-purpose subagent (only its conclusion returns).
- Never re-read a file you just edited. Cite `path:line`; don't paste code back. Batch independent calls.
- Verify narrowly (the one affected test, not the suite); source is bind-mounted so edits are live — don't rebuild to see them.
- Answer directly in prose; no preamble.

## Depth on demand (don't load unless needed)
Under `platform/docs/`: `ARCHITECTURE.md` (arch, conventions, gap map) · `API.md` (endpoints, auth) ·
`GOTCHAS.md` (bring-up, dev-loop, engine). Spec: the BRD v1.1 docx in repo root.
