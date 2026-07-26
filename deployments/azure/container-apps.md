# Azure Container Apps

## Outline

1. Build and push `actira-backend` / `actira-frontend` to ACR
2. Provision Azure Cosmos DB for Mongo API **or** Azure Database for MongoDB / Atlas
3. Create Container Apps Environment
4. Deploy API with secrets from Key Vault references
5. Deploy frontend with `REACT_APP_BACKEND_URL` pointing at API ingress
6. Enable HTTPS ingress

```bash
# Illustrative
az containerapp up -n actira-api -g rg-actira \
  --image myacr.azurecr.io/actira-backend:1.0.0 \
  --ingress external --target-port 8001 \
  --env-vars ENV=production DB_NAME=soc_console \
  --secrets jwt-secret=... mongo-url=...
```

Set `SEED_DEMO_USERS=false`. Use managed identity + Key Vault for production.
