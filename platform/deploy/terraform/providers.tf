# Providers talk to an EXISTING Kubernetes cluster via your kubeconfig.
# (Provisioning the cluster + managed Postgres/Redis/S3 is cloud-specific and left
#  to your platform team — feed their outputs into terraform.tfvars.)

provider "kubernetes" {
  config_path    = var.kubeconfig_path
  config_context = var.kube_context
}

provider "helm" {
  kubernetes {
    config_path    = var.kubeconfig_path
    config_context = var.kube_context
  }
}
