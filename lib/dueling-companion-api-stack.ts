import * as cdk from 'aws-cdk-lib';
import { WebSocketApi, WebSocketStage } from 'aws-cdk-lib/aws-apigatewayv2';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { StartingPosition } from 'aws-cdk-lib/aws-lambda';
import { ApiKey, ApiKeySourceType, Cors, LambdaIntegration, RestApi, UsagePlan } from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';

export class DuelingCompanionApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const cardsBucket = new s3.Bucket(this, 'CardsBucket', { publicReadAccess: true })

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
    const rejoinDuelHandler = new NodejsFunction(this, 'RejoinDuelHandler', {
      entry: 'lambdas/rejoinDuelHandler.ts',
      handler: 'handler',
      environment: {
        DUEL_TABLE_NAME: duelTable.tableName,
        CONNECTIONS_TABLE_NAME: connectionsTable.tableName,
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
    duelTable.grantReadWriteData(rejoinDuelHandler);
    connectionsTable.grantReadData(rejoinDuelHandler);
    duelTable.grantReadWriteData(updateDuelHandler);
    duelTable.grantReadWriteData(deleteDuelHandler);
    webSocketApi.addRoute('addDuel', {
      integration: new WebSocketLambdaIntegration('AddDuelHandler', addDuelHandler),
    });
    webSocketApi.addRoute('joinDuel', {
      integration: new WebSocketLambdaIntegration('JoinDuelHandler', joinDuelHandler),
    });
    webSocketApi.addRoute('rejoinDuel', {
      integration: new WebSocketLambdaIntegration('RejoinDuelHandler', rejoinDuelHandler),
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

    const restApiKey = new ApiKey(this, 'DuelRestApiKey');
    const restApi = new RestApi(this, 'DuelRestAPI', {
      restApiName: 'DuelRestAPI',
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
      deployOptions: {
        stageName: 'dev',
        description: 'Dev stage for testing Dueling Companion'
      },
      apiKeySourceType: ApiKeySourceType.HEADER,
    });
    const usagePlan = new UsagePlan(this, 'UsagePlan', {
      name: 'Usage Plan',
      apiStages: [
        {
          api: restApi,
          stage: restApi.deploymentStage,
        },
      ],
    });
    usagePlan.addApiKey(restApiKey);
    const getDuelHandler = new NodejsFunction(this, 'GetDuelHandler', {
      entry: 'lambdas/getDuelHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: duelTable.tableName,
      },
    });
    const cardUploadHandler = new NodejsFunction(this, 'CardUploadHandler', {
      entry: 'lambdas/cardUploadHandler.ts',
      handler: 'handler',
      environment: {
        TABLE_NAME: duelTable.tableName,
        CARDS_BUCKET_NAME: cardsBucket.bucketName,
      },
    });
    duelTable.grantReadData(getDuelHandler);
    duelTable.grantReadWriteData(cardUploadHandler);
    cardsBucket.grantReadWrite(cardUploadHandler);
    const duels = restApi.root.addResource('duels');
    const card = restApi.root.addResource('card');
    const duel = duels.addResource('{duelId}');
    const duelsIntegration = new LambdaIntegration(getDuelHandler);
    duel.addMethod('GET', duelsIntegration, {
      apiKeyRequired: true,
    });

    const cardIntegration = new LambdaIntegration(cardUploadHandler);
    card.addMethod('POST', cardIntegration, {
      apiKeyRequired: true,
    });
  }
}
