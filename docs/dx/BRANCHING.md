# Branching Strategy

## Default branch

`main` — protected; CI must pass.

## Branch names

| Prefix      | Use                |
|-------------|--------------------|
| `feat/`     | Features           |
| `fix/`      | Bugs               |
| `sec/`      | Security           |
| `docs/`     | Documentation      |
| `chore/`    | Tooling/deps       |
| `refactor/` | No behavior change |

Example: `feat/api-v1-mount`, `sec/lockout-audit`.

## Long-lived branches

Avoid. Prefer short-lived PRs. Release tags: `vMAJOR.MINOR.PATCH` (semver).
