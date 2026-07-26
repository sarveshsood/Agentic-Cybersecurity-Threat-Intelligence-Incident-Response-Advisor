# Patch Management

## Cadence

| Stream                 | Cadence     |
|------------------------|-------------|
| Critical security deps | 48–72h      |
| Minor deps             | Monthly     |
| Base images            | Monthly     |
| App release            | Semver tags |

## Process

1. Dependabot / pip-audit / npm audit findings
2. Patch in branch + tests
3. Stage deploy
4. Production deploy + smoke
5. Note in CHANGELOG

## SBOM

Generate on release:

```bash
# example with cyclonedx or syft when installed
syft dir:backend -o spdx-json > reports/sbom-backend.json
```

CI security workflow should retain audit artifacts.
