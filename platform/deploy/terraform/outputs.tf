output "namespace" {
  description = "Namespace the release was deployed into."
  value       = kubernetes_namespace.govux.metadata[0].name
}

output "release_name" {
  description = "Helm release name."
  value       = helm_release.govux.name
}

output "release_status" {
  description = "Helm release status."
  value       = helm_release.govux.status
}

output "next_steps" {
  description = "Post-deploy guidance."
  value       = <<-EOT
    Deployed GovUX release '${helm_release.govux.name}' to namespace '${kubernetes_namespace.govux.metadata[0].name}'.
    Verify:  kubectl -n ${kubernetes_namespace.govux.metadata[0].name} rollout status deploy/${helm_release.govux.name}-api
    Health:  kubectl -n ${kubernetes_namespace.govux.metadata[0].name} port-forward svc/${helm_release.govux.name}-api 8000:8000 && curl localhost:8000/healthz
    Reminder: confirm managed Postgres/Redis/S3 HA + backups, and run a restore drill before go-live.
  EOT
}
