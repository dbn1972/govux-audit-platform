# Versioning, Release & Support Policy

## Semantic Versioning

Releases follow [Semantic Versioning 2.0.0](https://semver.org/): **MAJOR.MINOR.PATCH**.

- **MAJOR** — incompatible API changes, DB migrations that aren't
  backward-compatible, or removed features. Read the upgrade notes first.
- **MINOR** — backward-compatible features and additive, backward-compatible
  migrations.
- **PATCH** — backward-compatible bug and security fixes only.

The current application version is `appVersion` in
`platform/deploy/helm/govux/Chart.yaml`; the Helm chart itself is versioned
separately (`version`). The audit **engine** carries its own version
(`engine_version`, surfaced on every report) so results are traceable to the
methodology that produced them.

## The public contract

What SemVer guarantees stability for:

- The **HTTP API surface** — frozen by a contract snapshot test
  (`tests/test_openapi_contract.py`); any change to a route or its response codes
  must be intentional and is caught in CI.
- The **GovUX Score methodology** — weights and banding are versioned; a scoring
  change that moves numbers is a MINOR/MAJOR event, never a silent patch.
- The **database schema** — changed only via Alembic migrations kept in sync with
  `db/schema.sql` and the ORM.

## Release process (maintainers)

1. Update `CHANGELOG.md` (Keep a Changelog format; move `Unreleased` → the version).
2. Bump `appVersion` (and chart `version` if the chart changed).
3. Ensure CI is green (all jobs) and regenerate the [SBOM](SBOM.md).
4. Tag `vMAJOR.MINOR.PATCH`; attach the merged SBOM and release notes.
5. Publish upgrade notes if any manual step is required (see [UPGRADING.md](UPGRADING.md)).

## Supported versions & End-of-Life

| Line | Status | Gets |
|---|---|---|
| Latest MINOR | **Active** | features, fixes, security |
| Previous MINOR | **Maintenance** | security + critical fixes |
| Older | **End-of-Life** | none — upgrade recommended |

Security fixes target the Active and Maintenance lines; see
[SECURITY.md](../SECURITY.md) for the reporting process. Operators should stay on
a supported line and plan upgrades before their line reaches EOL.

## Deprecation

Features are deprecated for at least one MINOR release before removal, announced
in `CHANGELOG.md` with a migration path. Removals happen only in a MAJOR release.
