#!/bin/bash -e

# Check if email parameter is provided
if [[ -z "$1" ]]; then
  echo "Usage: ./deploy-changes.sh <system-admin-email>"
  exit 1
fi

# Get the absolute path to the server directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
SERVER_DIR="$( cd "$SCRIPT_DIR/.." &> /dev/null && pwd )"

export CDK_PARAM_SYSTEM_ADMIN_EMAIL="$1"
export CDK_PARAM_TENANT_ID="pooled"
export REGION=$(aws configure get region)
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export CDK_PARAM_S3_BUCKET_NAME="serverless-saas-${ACCOUNT_ID}-${REGION}"
export CDK_SOURCE_NAME="source.zip"

export CDK_PARAM_CONTROL_PLANE_SOURCE='sbt-control-plane-api'
export CDK_PARAM_ONBOARDING_DETAIL_TYPE='Onboarding'
export CDK_PARAM_PROVISIONING_DETAIL_TYPE=$CDK_PARAM_ONBOARDING_DETAIL_TYPE
export CDK_PARAM_OFFBOARDING_DETAIL_TYPE='Offboarding'
export CDK_PARAM_DEPROVISIONING_DETAIL_TYPE=$CDK_PARAM_OFFBOARDING_DETAIL_TYPE
export CDK_PARAM_PROVISIONING_EVENT_SOURCE="sbt-application-plane-api"
export CDK_PARAM_APPLICATION_NAME_PLANE_SOURCE="sbt-application-plane-api"

echo "Packaging and uploading source code..."
cd "$SERVER_DIR"
zip -r ${CDK_SOURCE_NAME} . -x ".git/*" -x "**/node_modules/*" -x "**/cdk.out/*"
export CDK_PARAM_COMMIT_ID=$(aws s3api put-object --bucket "${CDK_PARAM_S3_BUCKET_NAME}" --key "${CDK_SOURCE_NAME}" --body "./${CDK_SOURCE_NAME}" --output text)
rm ${CDK_SOURCE_NAME}

echo "Deploying infrastructure changes..."
cd "$SERVER_DIR/cdk"
npm install
npx cdk deploy serverless-saas-ref-arch-tenant-template-pooled --require-approval never

echo "Deployment complete!"
