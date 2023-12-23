import * as cdk from 'aws-cdk-lib';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';

// TODO: Add a standard rest API for querying duels that will then allow a user to join a duel
// TODO: Use connectionIds as playerIds and then the connection table can be removed in favor of the duels table and then updates to an item should only be sent to the two players
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
    connectionsTable.grantReadWriteData(disconnectHandler);


    const duelTable = new dynamodb.Table(this, 'DuelTable', {
      partitionKey: { name: 'duelId', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_IMAGE,
      timeToLiveAttribute: 'duelExpiration'
    });
    const addDuelHandler = new NodejsFunction(this, 'AddDuelHandler', {
      entry: 'lambdas/addDuelHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: duelTable.tableName,
      },
    });
    const joinDuelHandler = new NodejsFunction(this, 'JoinDuelHandler', {
      entry: 'lambdas/joinDuelHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: duelTable.tableName,
      },
    });
    const updateDuelHandler = new NodejsFunction(this, 'UpdateDuelHandler', {
      entry: 'lambdas/updateDuelHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: duelTable.tableName,
      },
    });
    const deleteDuelHandler = new NodejsFunction(this, 'DeleteDuelHandler', {
      entry: 'lambdas/deleteDuelHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: duelTable.tableName,
      },
    });
    duelTable.grantReadWriteData(addDuelHandler);
    duelTable.grantReadWriteData(joinDuelHandler);
    duelTable.grantReadWriteData(updateDuelHandler);
    duelTable.grantReadWriteData(deleteDuelHandler);
    webSocketApi.addRoute('addDuel', {
      integration: new WebSocketLambdaIntegration('AddDuelHandler', addDuelHandler),
    });
    webSocketApi.addRoute('joinDuel', {
      integration: new WebSocketLambdaIntegration('JoinDuelHandler', joinDuelHandler),
    });
    webSocketApi.addRoute('updateDuel', {
      integration: new WebSocketLambdaIntegration('UpdateDuelHandler', updateDuelHandler),
    });
    webSocketApi.addRoute('deleteDuel', {
      integration: new WebSocketLambdaIntegration('AddDuelHandler', deleteDuelHandler),
    });

    const processDuelStreamFn = new NodejsFunction(this, 'ProcessDuelStream', {
      entry: 'lambdas/processDuelStream.ts',
      environment: {
        TABLE_NAME: connectionsTable.tableName,
        ENDPOINT: devApiStage.url,
      },
    });
    const connectionsArns = this.formatArn({
      service: 'execute-api',
      resourceName: `${devApiStage.stageName}/POST/*`,
      resource: webSocketApi.apiId,
    });
  
    processDuelStreamFn.addToRolePolicy(
      new PolicyStatement({ actions: ['execute-api:ManageConnections'], resources: [connectionsArns] })
    );
    connectionsTable.grantReadWriteData(processDuelStreamFn);
    processDuelStreamFn.addEventSource(
      new DynamoEventSource(duelTable, {
        startingPosition: StartingPosition.TRIM_HORIZON,
        batchSize: 5,
        retryAttempts: 10,
      })
    );
  }
}
