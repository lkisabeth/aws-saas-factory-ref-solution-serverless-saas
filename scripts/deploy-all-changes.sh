#!/bin/bash -e

# Check if email parameter is provided
if [[ -z "$1" ]]; then
  echo "Usage: ./deploy_changes.sh <system-admin-email>"
  exit 1
fi

# Set up environment variables
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

echo "🚀 Starting deployment process..."

# 1. Build and deploy frontend applications
echo "📦 Building frontend applications..."

# Build Application UI
cd client/Application
npm install
npm run build
echo "✅ Application UI build complete"

# Build Admin UI
cd ../Admin
npm install
npm run build
echo "✅ Admin UI build complete"

# 2. Deploy backend changes
echo "🔄 Deploying backend changes..."
cd ../../server

# Package and upload source code
echo "📦 Packaging and uploading source code..."
zip -r ${CDK_SOURCE_NAME} . -x ".git/*" -x "**/node_modules/*" -x "**/cdk.out/*"
export CDK_PARAM_COMMIT_ID=$(aws s3api put-object --bucket "${CDK_PARAM_S3_BUCKET_NAME}" --key "${CDK_SOURCE_NAME}" --body "./${CDK_SOURCE_NAME}" --output text)
rm ${CDK_SOURCE_NAME}

# Deploy infrastructure changes
cd cdk
npm install
npx cdk deploy serverless-saas-ref-arch-tenant-template-pooled --require-approval never

# 3. Update client applications
echo "📤 Deploying client applications..."
cd ../../client/client-template
npm install
npx cdk deploy --require-approval never

echo "✨ Deployment complete!"

# Display URLs
ADMIN_SITE_URL=$(aws cloudformation describe-stacks --stack-name ClientTemplateStack --query "Stacks[0].Outputs[?OutputKey=='adminSiteUrl'].OutputValue" --output text)
APP_SITE_URL=$(aws cloudformation describe-stacks --stack-name ClientTemplateStack --query "Stacks[0].Outputs[?OutputKey=='appSiteUrl'].OutputValue" --output text)

echo "🌐 Application URLs:"
echo "Admin site: $ADMIN_SITE_URL"
echo "Application site: https://$APP_SITE_URL"
