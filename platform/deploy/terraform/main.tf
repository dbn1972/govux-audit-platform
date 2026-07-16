# Validate the secret invariant at plan time (mirrors the app's prod boot assertion).
resource "terraform_data" "secret_guard" {
  lifecycle {
    precondition {
      condition     = var.jwt_secret != var.secret_key && var.jwt_secret != "" && var.secret_key != ""
      error_message = "jwt_secret and secret_key must both be set and MUST differ."
    }
  }
}

resource "kubernetes_namespace" "govux" {
  metadata {
    name = var.namespace
    labels = {
      "app.kubernetes.io/name"       = "govux"
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

# Terraform owns the Secret (kept out of Helm values / release state as plaintext).
resource "kubernetes_secret" "govux" {
  metadata {
    name      = "${var.release_name}-secrets"
    namespace = kubernetes_namespace.govux.metadata[0].name
  }
  type = "Opaque"
  data = {
    jwtSecret   = var.jwt_secret
    secretKey   = var.secret_key
    databaseUrl = var.database_url
    cruxApiKey  = var.crux_api_key
  }
}

resource "helm_release" "govux" {
  name      = var.release_name
  namespace = kubernetes_namespace.govux.metadata[0].name
  chart     = var.chart_path
  wait      = true
  timeout   = 600

  depends_on = [terraform_data.secret_guard, kubernetes_secret.govux]

  values = [yamlencode({
    existingSecret = kubernetes_secret.govux.metadata[0].name
    image = {
      registry = var.image_registry
      tag      = var.image_tag
    }
    config = {
      corsOrigins   = var.cors_origins
      redisUrl      = var.redis_url
      cacheRedisUrl = var.cache_redis_url
    }
    api    = { replicas = var.api_replicas }
    worker = { replicas = var.worker_replicas }
    ingress = {
      enabled = var.ingress_enabled
      host    = var.ingress_host
    }
  })]
}
