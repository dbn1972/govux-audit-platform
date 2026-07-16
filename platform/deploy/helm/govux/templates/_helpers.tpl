{{/* Chart name */}}
{{- define "govux.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully qualified app name */}}
{{- define "govux.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "govux.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* Common labels */}}
{{- define "govux.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
app.kubernetes.io/name: {{ include "govux.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels for a component (arg: dict "root" . "component" "api") */}}
{{- define "govux.selectorLabels" -}}
app.kubernetes.io/name: {{ include "govux.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* ServiceAccount name */}}
{{- define "govux.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "govux.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Secret name (created or existing) */}}
{{- define "govux.secretName" -}}
{{- if .Values.existingSecret -}}
{{- .Values.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "govux.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/* Backend image ref */}}
{{- define "govux.backendImage" -}}
{{- printf "%s%s:%s" .Values.image.registry .Values.image.backendRepository .Values.image.tag -}}
{{- end -}}

{{/* Web image ref */}}
{{- define "govux.webImage" -}}
{{- printf "%s%s:%s" .Values.image.registry .Values.image.webRepository .Values.image.tag -}}
{{- end -}}

{{/* Common env for all backend workloads (secrets + config, no plaintext) */}}
{{- define "govux.backendEnv" -}}
- name: GOVUX_ENV
  value: {{ .Values.env | quote }}
- name: GOVUX_REDIS_URL
  valueFrom:
    configMapKeyRef: { name: {{ include "govux.fullname" . }}-config, key: redisUrl }
- name: GOVUX_CACHE_REDIS_URL
  valueFrom:
    configMapKeyRef: { name: {{ include "govux.fullname" . }}-config, key: cacheRedisUrl }
- name: GOVUX_CORS_ORIGINS
  valueFrom:
    configMapKeyRef: { name: {{ include "govux.fullname" . }}-config, key: corsOrigins }
- name: GOVUX_DATABASE_URL
  valueFrom:
    secretKeyRef: { name: {{ include "govux.secretName" . }}, key: databaseUrl }
- name: GOVUX_JWT_SECRET
  valueFrom:
    secretKeyRef: { name: {{ include "govux.secretName" . }}, key: jwtSecret }
- name: GOVUX_SECRET_KEY
  valueFrom:
    secretKeyRef: { name: {{ include "govux.secretName" . }}, key: secretKey }
- name: GOVUX_CRUX_API_KEY
  valueFrom:
    secretKeyRef: { name: {{ include "govux.secretName" . }}, key: cruxApiKey, optional: true }
{{- end -}}
