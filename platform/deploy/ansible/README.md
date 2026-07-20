# GovUX — Ansible (Docker Compose deploy)

Repeatable, auditable deployment of the GovUX platform to a VM (or fleet) via Docker
Compose. Installs Docker, fetches the source, renders a vault-encrypted `.env`, runs
the pre-install validator, launches the production stack (migrations on boot), and
waits for `/healthz`.

> For multi-node HA, use the **Helm chart** on Kubernetes instead (this playbook runs a
> full stack per host).

## Layout

```
ansible/
  deploy.yml                     # the playbook
  ansible.cfg                    # sane defaults
  inventory.example.ini          # -> inventory.ini
  group_vars/all.example.yml     # -> group_vars/all.yml (ansible-vault encrypted)
  templates/env.j2               # renders platform/.env from vars
```

## Usage

```bash
cd platform/deploy/ansible
cp inventory.example.ini inventory.ini                 # set host(s)
cp group_vars/all.example.yml group_vars/all.yml       # set secrets, then:
ansible-vault encrypt group_vars/all.yml

ansible-playbook -i inventory.ini deploy.yml --ask-vault-pass
```

Re-running is safe (idempotent-ish): Docker install is guarded, source is synced,
`.env` re-rendered, and `docker compose up -d` reconciles.

## Secrets

All secrets live in `group_vars/all.yml`, **ansible-vault encrypted**. The `.env` is
rendered on the host at `0600` with `no_log: true`, and the pre-install validator
blocks the run if any secret is missing/weak/duplicated.

## Verify without hosts

```bash
ansible-playbook --syntax-check -i inventory.example.ini deploy.yml
ansible-lint deploy.yml
```
CI runs both on every PR.
