# Multi-replica / HA validation runbook

Validates ACTIRA API scale-out against shared Mongo (and optional shared LanceDB).  
Companion: [MULTI_WORKER.md](../MULTI_WORKER.md), [SCALING.md](SCALING.md).

## Goals

1. **N ≥ 2 API pods** share one Mongo without duplicate job execution.
2. Auth throttle / lockouts stay consistent across pods.
3. Job payloads load from any pod (`ACTIRA_JOB_PAYLOAD_BACKEND=mongo`).
4. Health and readiness probes pass under rolling update.

## Topology (recommended)

| Role | Replicas | `ACTIRA_JOB_WORKER` | Notes |
|------|----------|---------------------|--------|
| API (stateless) | 2+ | `0` | Serves HTTP; no in-process queue consumer |
| Job worker | 1 | `1` | Claims Mongo queue; same image as API |
| MongoDB | 1 (or Atlas) | — | Required shared state |
| Frontend | 1+ | — | Static build; points at API Service |

Helm: set `jobWorker.enabled=true` and `replicaCount≥2` with `env.ACTIRA_JOB_WORKER=0` on the API Deployment (see `deployments/helm/actira/values-prod.yaml`).

## Preconditions checklist

- [ ] `ENV=production` (or staging), `SEED_DEMO_USERS=false`
- [ ] Strong `JWT_SECRET` (≥32 chars), not the lab default
- [ ] Shared `MONGO_URL` / `DB_NAME` on all API + worker pods
- [ ] `ACTIRA_JOB_PAYLOAD_BACKEND=mongo` (default)
- [ ] Exactly **one** process with `ACTIRA_JOB_WORKER=1` (or multiple workers only with atomic claim — prefer one)
- [ ] Ingress/LB idle timeout ≥ 60s for long uploads
- [ ] Frontend `REACT_APP_BACKEND_URL` = public API origin

## Validation procedure

### 1. Deploy N API + 1 worker

```bash
# Example Helm (cluster with Mongo URI secret already present)
helm upgrade --install actira ./deployments/helm/actira \
  -f ./deployments/helm/actira/values-prod.yaml \
  --set existingSecret=actira-secrets \
  --set image.repository=YOUR_REGISTRY/actira-backend \
  --set image.tag=1.1.0
```

Confirm:

```bash
kubectl get deploy -l app.kubernetes.io/name=actira
kubectl get pods -l app.kubernetes.io/name=actira -o wide
# Expect: actira-api × N Ready, actira-worker × 1 Ready
```

### 2. Probe health on every pod

```bash
for p in $(kubectl get pods -l app.kubernetes.io/component=api -o name); do
  kubectl exec ${p#pod/} -- wget -qO- http://127.0.0.1:8001/ready || exit 1
done
```

`/ready` should return 200 when Mongo is reachable.

### 3. Auth consistency (two pods)

Login twice through the Service (not a single pod). Confirm:

- Same email/password works
- After 5+ failed logins (lab only), lockout is shared (second pod also returns 429/lock)

### 4. Single job execution

1. Upload one log via UI or `POST /api/logs/upload`.
2. Watch job reach `done` **once**.
3. Inspect worker logs only for `[job …] batch pipeline` — API pods should not run the pipeline when `ACTIRA_JOB_WORKER=0`.

```bash
kubectl logs -l app.kubernetes.io/component=worker --tail=100
kubectl logs -l app.kubernetes.io/component=api --tail=50 | grep -i pipeline || true
```

### 5. Rolling update

```bash
kubectl rollout restart deploy/actira-api   # name may include release prefix
kubectl rollout status deploy/actira-api
```

During rollout: `/api/health` via Service should stay mostly available; no 5xx storm.

### 6. Load microbench (optional)

Against the Service / Ingress:

```bash
python benchmarks/run_benchmarks.py --profile light --base-url https://actira.example.com
python benchmarks/run_benchmarks.py --profile medium --base-url https://actira.example.com
```

Archive JSON under `benchmarks/reports/` and update notes in [LOAD_TEST_10_100.md](../../benchmarks/reports/LOAD_TEST_10_100.md).

## Pass / fail criteria

| Check | Pass |
|-------|------|
| All API pods Ready | Yes |
| Worker = 1 Ready | Yes |
| Upload completes once | Yes |
| No pipeline logs on API-only pods | Yes |
| Ready probe fails if Mongo down | Yes (kill Mongo briefly in staging) |
| light profile completes without 5xx > 1% | Yes |

## Rollback

See [ROLLBACK.md](ROLLBACK.md). Scale `replicaCount` to 1 and re-enable `ACTIRA_JOB_WORKER=1` on the single pod if needed for emergency single-node mode.

## Offline unit coverage

- `backend/tests/test_ha_multi_replica.py` — job worker flag matrix, payload backend default, Helm template hygiene.
