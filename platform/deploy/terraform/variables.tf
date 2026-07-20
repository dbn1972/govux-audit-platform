variable "kubeconfig_path" {
  description = "Path to the kubeconfig for the target cluster."
  type        = string
  default     = "~/.kube/config"
}

variable "kube_context" {
  description = "kubeconfig context to use (empty = current)."
  type        = string
  default     = ""
}

variable "namespace" {
  description = "Kubernetes namespace for the GovUX release."
  type        = string
  default     = "govux"
}

variable "release_name" {
  description = "Helm release name."
  type        = string
  default     = "govux"
}

variable "chart_path" {
  description = "Path to the GovUX Helm chart (relative to this module)."
  type        = string
  default     = "../helm/govux"
}

variable "image_registry" {
  description = "Image registry prefix WITH trailing slash (e.g. registry.gov.in/), or empty."
  type        = string
  default     = ""
}

variable "image_tag" {
  description = "Image tag for the backend + frontend images."
  type        = string
  default     = "1.1"
}

# ── Secrets (managed by Terraform into a K8s Secret; the chart references it) ──
variable "jwt_secret" {
  description = "Signs access tokens + OTP/refresh HMACs. Strong, non-default, MUST differ from secret_key."
  type        = string
  sensitive   = true
}

variable "secret_key" {
  description = "Encrypts SMTP/CAPTCHA secrets at rest. MUST differ from jwt_secret."
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "Full Postgres DSN incl. credentials (external/managed DB)."
  type        = string
  sensitive   = true
}

variable "crux_api_key" {
  description = "Optional Chrome UX Report API key (blank = lab-only performance)."
  type        = string
  sensitive   = true
  default     = ""
}

# ── Non-secret config ─────────────────────────────────────────────────────────
variable "cors_origins" {
  description = "Allowed browser origin(s) for the credentialed API."
  type        = string
  default     = "https://govux.gov.in"
}

variable "redis_url" {
  description = "Durable queue Redis URL (external/managed, AOF-persisted)."
  type        = string
}

variable "cache_redis_url" {
  description = "Separate cache Redis URL."
  type        = string
}

variable "api_replicas" {
  type    = number
  default = 2
}

variable "worker_replicas" {
  type    = number
  default = 3
}

variable "ingress_enabled" {
  type    = bool
  default = true
}

variable "ingress_host" {
  type    = string
  default = "govux.gov.in"
}
