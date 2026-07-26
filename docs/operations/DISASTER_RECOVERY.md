# Disaster Recovery

## Scenarios

| Scenario            | RTO*    | RPO*        | Action                         |
|---------------------|---------|-------------|--------------------------------|
| API container crash | minutes | 0           | Restart deployment             |
| Mongo primary loss  | hours   | last backup | Restore dump / Atlas PITR      |
| Region loss         | days    | backup      | Redeploy compose/k8s + restore |
| Secret compromise   | hours   | 0           | Rotate all keys + JWT          |

\*Targets for **pilot**; negotiate SLAs for production.

## Recovery steps (Mongo)

1. Provision new Mongo
2. `mongorestore`
3. Deploy API with correct `MONGO_URL`
4. Reindex KB vectors if LanceDB empty
5. Verify health + admin login
6. Rotate secrets if breach-related  
