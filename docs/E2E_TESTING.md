# ACTIRA End-to-End Testing (Playwright)

## Scope

| Spec                            | Coverage                                                                |
|---------------------------------|-------------------------------------------------------------------------|
| `frontend/e2e/smoke.spec.js`    | Login (analyst/admin), upload, incidents, settings RBAC, review, golden |
| `frontend/e2e/workflow.spec.js` | Dashboard, filters, analytics, knowledge, theme, logout, settings tabs  |

## Prerequisites

1. Mongo running (`docker compose up -d mongodb` or local mongod)
2. Backend:

```bash
cd backend
# Dual-gate seed: lab ENV AND SEED_DEMO_USERS (empty DB only)
set ENV=dev
set SEED_DEMO_USERS=true
set MONGO_URL=mongodb://localhost:27017
set JWT_SECRET=dev-long-secret-at-least-32-characters
set FORCE_MOCK_TI=true
python -m uvicorn server:app --host 127.0.0.1 --port 8001
```

3. Frontend:

```bash
cd frontend
# REACT_APP_BACKEND_URL=http://localhost:8001 in .env
npm start
```

4. Browsers:

```bash
cd frontend
npx playwright install chromium
```

## Run

```bash
cd frontend
npm run e2e
# or
npx playwright test
npx playwright test e2e/smoke.spec.js
npx playwright test --ui
```

Reports: `frontend/playwright-report/index.html`  
JUnit (config): `reports/playwright-junit.xml` (create `reports/` first)

## Credentials

Defaults (dev seed):

| Role    | Email                     | Password      |
|---------|---------------------------|---------------|
| Admin   | `admin@soc.example.com`   | `Admin123!`   |
| Analyst | `analyst@soc.example.com` | `Analyst123!` |

Override: `SMOKE_ADMIN_EMAIL`, `SMOKE_ADMIN_PASSWORD`, `SMOKE_ANALYST_*`.

## CI

`.github/workflows/e2e.yml` starts Mongo, backend, frontend, then Playwright (manual/weekly).

## Debugging

- `npx playwright test --debug`
- Traces on first retry (`trace: on-first-retry`)
- Screenshots on failure under `frontend/test-results/`

## Snapshot / visual

Not enabled by default (UI is dynamic). To add:

```js
await expect(page).toHaveScreenshot("dashboard.png", { maxDiffPixelRatio: 0.02 });
```

Store baselines under `frontend/e2e/__screenshots__/` when product design stabilizes.
