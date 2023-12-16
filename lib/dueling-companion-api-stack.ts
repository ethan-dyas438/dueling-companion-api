import * as cdk from 'aws-cdk-lib';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';

export class DuelingCompanionApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const connectionsTable = new dynamodb.Table(this, 'WebsocketConnections', {
      partitionKey: { name: 'connectionId', type: dynamodb.AttributeType.STRING },
    });

    const connectHandler = new NodejsFunction(this, 'ConnectHandler', {
      entry: 'lambdas/connectHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: connectionsTable.tableName,
      },
    });

    const disconnectHandler = new NodejsFunction(this, 'DisconnectHandler', {
      entry: 'lambdas/disconnectHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: connectionsTable.tableName,
      },
    });

    const webSocketApi = new WebSocketApi(this, 'DuelWebsocketApi', {
      connectRouteOptions: { integration: new WebSocketLambdaIntegration('DuelConnectHandler', connectHandler) },
      disconnectRouteOptions: { integration: new WebSocketLambdaIntegration('DuelDisconnectHandler', disconnectHandler) },
    });

    const devApiStage = new WebSocketStage(this, 'DevStage', {
      webSocketApi,
      stageName: 'dev',
      autoDeploy: true,
    });

    connectionsTable.grantReadWriteData(connectHandler);

    // webSocketApi.addRoute('addDuel', {
    //   integration: new WebSocketLambdaIntegration('AddDuelHandler', addDuelHandler),
    // });

    // const connectionsArns = this.formatArn({
    //   service: 'execute-api',
    //   resourceName: `${devApiStage.stageName}/POST/*`,
    //   resource: webSocketApi.apiId,
    // });
    
    // addDuelHandler.addToRolePolicy(
    //   new PolicyStatement({ actions: ['execute-api:ManageConnections'], resources: [connectionsArns] })
    // );
  }
}
