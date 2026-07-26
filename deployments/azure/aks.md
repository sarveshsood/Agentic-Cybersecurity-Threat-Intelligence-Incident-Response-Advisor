# Azure AKS

1. `az aks create` / existing cluster
2. `kubectl apply -f deployments/kubernetes/` or `helm install`
3. Use Azure Key Vault Provider for Secrets Store CSI
4. Ingress with AGIC or nginx + cert-manager
5. Mongo: Atlas or self-managed on Azure

See [../kubernetes/](../kubernetes/) and [../helm/actira/](../helm/actira/).
