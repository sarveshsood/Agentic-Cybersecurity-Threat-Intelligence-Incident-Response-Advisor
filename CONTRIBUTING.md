# Contributing to ACTIRA

Thanks for contributing. Full developer loop: [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) · DX
pack: [docs/dx/](docs/dx/).

## Quick start for contributors

```bash
# One-command lab stack (Docker)
./scripts/start-demo.sh
# Windows PowerShell:
#   .\scripts\start-demo.ps1
```

Or see [docs/dx/LOCAL_DEVELOPMENT.md](docs/dx/LOCAL_DEVELOPMENT.md).

## Workflow

1. Fork / branch from `main` (`feat/…`, `fix/…`, `docs/…`, `sec/…`)
2. Implement with tests
3. Run `make ci-fast` (or relevant pytest suite)
4. Open PR using the template
5. Address review checklist items

**UI rule:** tooltips / HelpTips are a **prerequisite** — use design-system
`tipTitle`/`tipBody`, `PaneLabel`, or `DsButton tooltip=` so help is wired by default.
See [docs/dx/TOOLTIP_PREREQUISITE.md](docs/dx/TOOLTIP_PREREQUISITE.md).

Details: [docs/dx/GIT_WORKFLOW.md](docs/dx/GIT_WORKFLOW.md), [docs/dx/PR_GUIDELINES.md](docs/dx/PR_GUIDELINES.md).

## Code of conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

## Security

Never open public issues for vulnerabilities — [SECURITY.md](SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the MIT License.
