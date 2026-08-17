import groovy.json.JsonOutput

def runSSM(String command, int maxWaitSeconds = 300) {
    def parameters = JsonOutput.toJson([commands: [command]])

    def commandId = sh(
        script: """
            aws ssm send-command \
                --region ${AWS_REGION} \
                --instance-ids ${INSTANCE_ID} \
                --document-name AWS-RunShellScript \
                --parameters '${parameters}' \
                --timeout-seconds ${maxWaitSeconds} \
                --query "Command.CommandId" \
                --output text
        """,
        returnStdout: true
    ).trim()

    echo "SSM Command ID : ${commandId} (timeout: ${maxWaitSeconds}s)"

    def elapsed = 0
    def pollInterval = 15

    while (elapsed < maxWaitSeconds) {
        sleep(pollInterval)
        elapsed += pollInterval

        def status = sh(
            script: """
                aws ssm get-command-invocation \
                    --region ${AWS_REGION} \
                    --command-id ${commandId} \
                    --instance-id ${INSTANCE_ID} \
                    --query "Status" \
                    --output text 2>/dev/null || echo "Pending"
            """,
            returnStdout: true
        ).trim()

        echo "[${elapsed}s] Status: ${status}"

        if (status == 'Success') {
            echo "Command completed in ${elapsed}s"
            return
        }

        if (status in ['Failed', 'TimedOut', 'Cancelled', 'Cancelling']) {
            def errOutput = sh(
                script: """
                    aws ssm get-command-invocation \
                        --region ${AWS_REGION} \
                        --command-id ${commandId} \
                        --instance-id ${INSTANCE_ID} \
                        --query "StandardErrorContent" \
                        --output text 2>/dev/null | head -c 3000
                """,
                returnStdout: true
            ).trim()
            error("SSM command ${status}: ${errOutput}")
        }
    }

    error("Timed out after ${maxWaitSeconds}s — command may still be running. ID: ${commandId}")
}

pipeline {
    agent any

    environment {
        AWS_REGION  = "ap-south-2"
        INSTANCE_ID = "i-0cc2319aa694bef7a"
        GIT_URL     = "https://github.com/dbn1972/govux-audit-platform.git"
        GIT_BRANCH  = "${BRANCH_NAME}"
        REMOTE_DIR  = "/opt/govux/app"
        ENV_FILE    = "/opt/govux/config/.env"
    }

    stages {
        stage('Git Checkout') {
            steps {
                checkout([$class: 'GitSCM',
                    branches: [[name: "*/${GIT_BRANCH}"]],
                    userRemoteConfigs: [[url: "${GIT_URL}"]]])
            }
        }

        stage('Update Code on EC2') {
            steps {
                script {
                    runSSM(
                        "if [ ! -d ${REMOTE_DIR}/.git ]; then " +
                        "rm -rf ${REMOTE_DIR} && " +
                        "git clone -b ${GIT_BRANCH} ${GIT_URL} ${REMOTE_DIR}; " +
                        "else " +
                        "cd ${REMOTE_DIR} && " +
                        "git fetch origin && " +
                        "git checkout ${GIT_BRANCH} && " +
                        "git reset --hard origin/${GIT_BRANCH}; " +
                        "fi",
                        120
                    )
                }
            }
        }

        stage('Deploy') {
            steps {
                script {
                    runSSM(
                        "cd ${REMOTE_DIR}/platform && " +
                        "docker compose -f docker-compose.prod.yml " +
                        "--env-file ${ENV_FILE} " +
                        "up -d --build --remove-orphans",
                        600
                    )
                }
            }
        }

        stage('Configure SMTP') {
            steps {
                script {
                    runSSM(
                        "docker exec -i \$(docker ps -qf name=platform-db-1) psql -U govux -d govux <<'EOSQL'\n" +
                        "INSERT INTO app_settings (key, value) VALUES\n" +
                        "  ('email_provider', 'smtp'),\n" +
                        "  ('email_from', 'support.ux4g@digitalindia.gov.in'),\n" +
                        "  ('smtp_host', 'smtp.mgovcloud.in'),\n" +
                        "  ('smtp_port', '465'),\n" +
                        "  ('smtp_user', 'support.ux4g@digitalindia.gov.in')\n" +
                        "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\n" +
                        "EOSQL",
                        30
                    )

                    runSSM(
                        "docker exec -i \$(docker ps -qf name=platform-api-1) python <<'EOPY'\n" +
                        "from app.services import settings_store\n" +
                        "from app.database import SessionLocal\n" +
                        "db = SessionLocal()\n" +
                        "settings_store.set_value('smtp_password', 'AK5eP44DE3u8', db, user_id=None)\n" +
                        "db.close()\n" +
                        "print('smtp_password configured')\n" +
                        "EOPY",
                        30
                    )
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    runSSM(
                        "for i in \$(seq 1 12); do " +
                        "STATUS=\$(docker inspect --format={{.State.Health.Status}} platform-api-1 2>/dev/null || echo not_found); " +
                        "echo API_health_status=\$STATUS; " +
                        "if [ \"\$STATUS\" = \"healthy\" ]; then " +
                        "echo API_Health_Check_Passed; " +
                        "exit 0; " +
                        "fi; " +
                        "sleep 10; " +
                        "done; " +
                        "echo API_Health_Check_Failed; " +
                        "docker logs --tail 50 platform-api-1; " +
                        "exit 1",
                        180
                    )
                }
            }
        }
    }

    post {
        success {
            echo "GovUX Deployment Successful"
        }
        failure {
            echo "GovUX Deployment Failed"
        }
        always {
            cleanWs()
        }
    }
}
