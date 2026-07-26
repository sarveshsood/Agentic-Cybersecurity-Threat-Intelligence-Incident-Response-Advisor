# Deployments

| Target               | Path                                               |
|----------------------|----------------------------------------------------|
| Docker Compose       | [`../docker-compose.yml`](../docker-compose.yml)   |
| Kubernetes manifests | [kubernetes/](kubernetes/)                         |
| Helm chart           | [helm/actira/](helm/actira/)                       |
| Azure Container Apps | [azure/container-apps.md](azure/container-apps.md) |
| Azure AKS            | [azure/aks.md](azure/aks.md)                       |
| AWS ECS/EKS          | [aws/ecs-eks.md](aws/ecs-eks.md)                   |
| GCP GKE              | [gcp/gke.md](gcp/gke.md)                           |

**Note:** Cloud guides are **runbooks + sample manifests**, not turnkey production Terraform. Customize for your
networking, IAM, and secrets.
