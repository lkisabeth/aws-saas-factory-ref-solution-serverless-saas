import { PythonFunction } from '@aws-cdk/aws-lambda-python-alpha';
import { Duration, Aws } from 'aws-cdk-lib';
import {
  PolicyStatement,
  ManagedPolicy,
  Role,
  ServicePrincipal,
  Effect,
} from 'aws-cdk-lib/aws-iam';
import { Runtime, LayerVersion } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import { RestApi, LambdaIntegration, AuthorizationType } from 'aws-cdk-lib/aws-apigateway';
import { Microservice } from './microservice';
import { IdentityDetails } from '../interfaces/identity-details';

export interface ServicesProps {
  idpDetails: IdentityDetails;
  restApi: RestApi;
  lambdaReserveConcurrency: number;
  lambdaCanaryDeploymentPreference: string;
  isPooledDeploy: boolean;
  lambdaServerlessSaaSLayers: LayerVersion;
  tenantScopedAccessRole: Role;
}

export class Services extends Construct {
  public readonly productMicroservice: Microservice;
  public readonly orderMicroservice: Microservice;

  constructor(scope: Construct, id: string, props: ServicesProps) {
    super(scope, id);

    const productMicroserviceResource = props.restApi.root.addResource('products');
    const orderMicroserviceResource = props.restApi.root.addResource('orders');

    const srcPath = process.cwd() + '/../src';

    this.productMicroservice = new Microservice(this, 'ProductMicroservice', {
      lambdaReserveConcurrency: props.lambdaReserveConcurrency,
      index: 'product_service.py',
      handlers: {
        getAll: 'get_products',
        create: 'create_product',
        get: 'get_product',
        update: 'update_product',
        delete: 'delete_product',
      },
      serviceName: 'ProductService',
      lambdaCanaryDeploymentPreference: props.lambdaCanaryDeploymentPreference,
      isPooledDeploy: props.isPooledDeploy,
      lambdaServerlessSaaSLayers: props.lambdaServerlessSaaSLayers,
      entry: srcPath + '/ProductService',
      sortKey: 'productId',
      apiGatewayResource: productMicroserviceResource,
      tableNameEnvKey: 'PRODUCT_TABLE_NAME',
    });
    this.productMicroservice.table.grantReadWriteData(props.tenantScopedAccessRole);

    this.orderMicroservice = new Microservice(this, 'OrderMicroservice', {
      lambdaReserveConcurrency: props.lambdaReserveConcurrency,
      index: 'order_service.py',
      handlers: {
        getAll: 'get_orders',
        create: 'create_order',
        get: 'get_order',
        update: 'update_order',
        delete: 'delete_order',
      },
      serviceName: 'OrderService',
      lambdaCanaryDeploymentPreference: props.lambdaCanaryDeploymentPreference,
      isPooledDeploy: props.isPooledDeploy,
      lambdaServerlessSaaSLayers: props.lambdaServerlessSaaSLayers,
      entry: srcPath +'/OrderService',
      sortKey: 'orderId',
      apiGatewayResource: orderMicroserviceResource,
      tableNameEnvKey: 'ORDER_TABLE_NAME',
    });
    this.orderMicroservice.table.grantReadWriteData(props.tenantScopedAccessRole);

    const userManagementExecRole = new Role(this, 'userManagementExecRole', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });
    userManagementExecRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
    );
    userManagementExecRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLambdaInsightsExecutionRolePolicy')
    );
    userManagementExecRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName('AWSXrayWriteOnlyAccess')
    );

    if (props.idpDetails.name == 'Cognito') {
      userManagementExecRole.addToPolicy(
        new PolicyStatement({
          actions: [
            'cognito-idp:AdminDeleteUser',
            'cognito-idp:AdminEnableUser',
            'cognito-idp:AdminCreateUser',
            'cognito-idp:CreateGroup',
            'cognito-idp:AdminDisableUser',
            'cognito-idp:AdminAddUserToGroup',
            'cognito-idp:GetGroup',
            'cognito-idp:AdminUpdateUserAttributes',
            'cognito-idp:AdminGetUser',
            'cognito-idp:ListUsers',
            'cognito-idp:ListUsersInGroup',
            'cognito-idp:AdminListGroupsForUser',
          ],
          effect: Effect.ALLOW,
          resources: [
            `arn:aws:cognito-idp:${Aws.REGION}:${Aws.ACCOUNT_ID}:userpool/${props.idpDetails.details.userPoolId}`,
          ],
        })
      );
    }

    const users = props.restApi.root.addResource('users');
    const userManagementServices = new PythonFunction(this, 'AppPlaneUserManagementServices', {
      entry: srcPath +  '/UserManagementService',
      runtime: Runtime.PYTHON_3_10,
      index: 'user_management.py',
      handler: 'lambda_handler',
      timeout: Duration.seconds(60),
      role: userManagementExecRole,
      layers: [props.lambdaServerlessSaaSLayers],
      environment: {
        IDP_DETAILS: JSON.stringify(props.idpDetails),
      },
    });

    users.addMethod('POST', new LambdaIntegration(userManagementServices));
    users.addMethod('GET', new LambdaIntegration(userManagementServices));
    const userNameResource = users.addResource('{username}');
    userNameResource.addMethod('GET', new LambdaIntegration(userManagementServices));
    userNameResource.addMethod('PUT', new LambdaIntegration(userManagementServices));
    userNameResource.addMethod('DELETE', new LambdaIntegration(userManagementServices));
    userNameResource
      .addResource('disable')
      .addMethod('DELETE', new LambdaIntegration(userManagementServices));
    userNameResource
      .addResource('enable')
      .addMethod('PUT', new LambdaIntegration(userManagementServices));

    const aiConciergeService = new PythonFunction(this, 'AIConciergeService', {
      entry: srcPath + '/AIConciergeService',
      runtime: Runtime.PYTHON_3_10,
      index: 'ai_concierge.py',
      handler: 'lambda_handler',
      timeout: Duration.seconds(300),
      layers: [props.lambdaServerlessSaaSLayers],
      environment: {
        IDP_DETAILS: JSON.stringify(props.idpDetails),
      },
    });

    aiConciergeService.addToRolePolicy(
      new PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${Aws.REGION}:${Aws.ACCOUNT_ID}:secret:OpenAI_API_Key-*`],
      })
    );

    const aiConcierge = props.restApi.root.addResource('ai-concierge');
    aiConcierge.addMethod('POST', new LambdaIntegration(aiConciergeService), {
      authorizationType: AuthorizationType.CUSTOM,
      apiKeyRequired: true
    });
  }
}
