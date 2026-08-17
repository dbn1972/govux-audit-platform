// GovUX Audit Platform — Jenkins deploy pipeline (develop → EC2 via SSM)
// Replaces `aws ssm wait` with a robust poll loop that won't time out on builds.

pipeline {
    agent any

    environment {
        AWS_REGION       = 'ap-south-2'
        INSTANCE_ID      = 'i-0cc2319aa694bef7a'
        DEPLOY_TIMEOUT   = '600'   // seconds — 10 min for docker build
        POLL_INTERVAL    = '15'    // seconds between status checks
        APP_DIR          = '/opt/govux/app'
        COMPOSE_DIR      = '/opt/govux/app/platform'
        ENV_FILE         = '/opt/govux/config/.env'
        GIT_BRANCH       = 'develop'
        GIT_REPO         = 'https://github.com/dbn1972/govux-audit-platform.git'
    }

    stages {
        stage('Git Checkout') {
            steps {
                git branch: "${GIT_BRANCH}", url: "${GIT_REPO}"
            }
        }

        stage('Update Code on EC2') {
            steps {
                script {
                    def cmd = """
                        if [ ! -d ${APP_DIR}/.git ]; then
                            rm -rf ${APP_DIR} && git clone -b ${GIT_BRANCH} ${GIT_REPO} ${APP_DIR};
                        else
                            cd ${APP_DIR} && git fetch origin && git checkout ${GIT_BRANCH} && git reset --hard origin/${GIT_BRANCH};
                        fi
                    """.stripIndent().trim()

                    ssmRunAndWait(cmd, 120)  // 2 min is plenty for git pull
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    def cmd = "cd ${COMPOSE_DIR} && docker compose -f docker-compose.prod.yml --env-file ${ENV_FILE} up -d --build --remove-orphans"
                    ssmRunAndWait(cmd, DEPLOY_TIMEOUT.toInteger())
                }
            }
        }

        stage('Post-Deploy Config') {
            steps {
                script {
                    // Configure SMTP settings directly in the database.
                    // This breaks the chicken-and-egg: can't sign in to configure SMTP,
                    // can't get OTP without SMTP configured.
                    def cmd = """cd ${COMPOSE_DIR} && docker compose -f docker-compose.prod.yml exec -T db psql -U \\\${POSTGRES_USER} -d \\\${POSTGRES_DB} -c "
INSERT INTO app_settings (key, value) VALUES
  ('email_provider', 'smtp'),
  ('email_from', 'support.ux4g@digitalindia.gov.in'),
  ('smtp_host', 'smtp.mgovcloud.in'),
  ('smtp_port', '465'),
  ('smtp_user', 'support.ux4g@digitalindia.gov.in')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
" """
                    ssmRunAndWait(cmd, 30)

                    // SMTP password is encrypted at rest via Fernet in the app layer.
                    // Insert it through the API's own encryption path by exec-ing into
                    // the api container (which has the GOVUX_SECRET_KEY for Fernet).
                    def pwdCmd = """cd ${COMPOSE_DIR} && docker compose -f docker-compose.prod.yml exec -T api python -c "
from app.services import settings_store
from app.database import SessionLocal
db = SessionLocal()
settings_store.set_value('smtp_password', 'AK5eP44DE3u8', db, user_id=None)
db.close()
print('smtp_password configured (encrypted)')
" """
                    ssmRunAndWait(pwdCmd, 30)
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def cmd = """
                        for i in \$(seq 1 40); do
                            if curl -sf http://localhost:8000/readyz >/dev/null 2>&1 && \\
                               curl -sf http://localhost:3000/login >/dev/null 2>&1; then
                                echo "Stack healthy"; exit 0;
                            fi
                            sleep 5
                        done
                        echo "Health check timed out"; exit 1
                    """.stripIndent().trim()

                    ssmRunAndWait(cmd, 210)  // 3.5 min for services to start
                }
            }
        }
    }

    post {
        success { echo 'GovUX Deployment Succeeded' }
        failure { echo 'GovUX Deployment Failed' }
        always  { cleanWs() }
    }
}

// ─── Helper: send SSM command and poll until terminal state ───────────────────
def ssmRunAndWait(String command, int timeoutSeconds) {
    def commandId = sh(
        script: """
            aws ssm send-command \\
                --region ${AWS_REGION} \\
                --instance-ids ${INSTANCE_ID} \\
                --document-name AWS-RunShellScript \\
                --parameters '{"commands":["${command.replace("'", "'\\''").replace('"', '\\"')}"]}' \\
                --timeout-seconds ${timeoutSeconds} \\
                --query "Command.CommandId" \\
                --output text
        """,
        returnStdout: true
    ).trim()

    echo "SSM Command ID: ${commandId} (timeout: ${timeoutSeconds}s)"

    def elapsed = 0
    def pollInterval = POLL_INTERVAL.toInteger()

    while (elapsed < timeoutSeconds) {
        sleep(pollInterval)
        elapsed += pollInterval

        def status = sh(
            script: """
                aws ssm get-command-invocation \\
                    --region ${AWS_REGION} \\
                    --command-id ${commandId} \\
                    --instance-id ${INSTANCE_ID} \\
                    --query "Status" \\
                    --output text 2>/dev/null || echo "Pending"
            """,
            returnStdout: true
        ).trim()

        echo "[${elapsed}s] SSM status: ${status}"

        if (status == 'Success') {
            echo "Command completed successfully in ${elapsed}s"
            return
        }

        if (status in ['Failed', 'TimedOut', 'Cancelled', 'Cancelling']) {
            // Grab error output for diagnostics
            def errOutput = sh(
                script: """
                    aws ssm get-command-invocation \\
                        --region ${AWS_REGION} \\
                        --command-id ${commandId} \\
                        --instance-id ${INSTANCE_ID} \\
                        --query "StandardErrorContent" \\
                        --output text 2>/dev/null | head -c 3000
                """,
                returnStdout: true
            ).trim()

            error("SSM command ${status}: ${errOutput}")
        }
    }

    error("SSM command timed out after ${timeoutSeconds}s (command may still be running on instance). Command ID: ${commandId}")
}
