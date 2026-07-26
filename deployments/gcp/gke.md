# GCP GKE

1. Build to Artifact Registry
2. GKE cluster + Workload Identity
3. Secret Manager → mounted env
4. Helm install ACTIRA chart
5. Cloud Load Balancing + Managed certs
6. Mongo: Atlas (recommended) or self-managed

Ensure `CORS_ORIGINS` matches Cloud Run/GFE frontend URL if split.
