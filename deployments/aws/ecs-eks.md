# AWS ECS / EKS

## ECS (Fargate)

- Task definition: backend container port 8001
- Secrets from AWS Secrets Manager / SSM
- ALB target group health `/health`
- Mongo: DocumentDB (compat caveats) or Atlas

## EKS

- Apply `deployments/kubernetes` or Helm chart
- IRSA for Secrets Manager
- Ingress ALB controller + ACM certs

```bash
helm upgrade --install actira deployments/helm/actira \
  --namespace actira --create-namespace \
  --set image.repository=<ecr>/actira-backend \
  --set image.tag=1.0.0
```
