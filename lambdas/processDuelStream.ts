import { DynamoDBStreamEvent } from 'aws-lambda';
import { AWSError } from 'aws-sdk/lib/error';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import ApiGatewayManagementApi from 'aws-sdk/clients/apigatewaymanagementapi';

const ddb = new DynamoDB();

const postDuelData = async (api: ApiGatewayManagementApi, tableName: string, connectionId: string, duel: { [key: string]: any }) => {
    try {
        await api.postToConnection({
                ConnectionId: connectionId,
                Data: JSON.stringify({
                    action: 'stream',
                    payload: duel,
                }),
            })
        .promise();
    } catch (e) {
        const { statusCode } = e as AWSError;
        console.error(e);
        console.log('The following duel data was attempted to be posted:');
        console.log(duel)

        if (statusCode === 410) {
            console.log(`Found stale connection, deleting ${connectionId}`);
            await ddb.deleteItem({ TableName: tableName, Key: { connectionId: { S: connectionId } } }).promise();
            // TODO: Update duel player Ids if necessary.
        } else {
            throw e;
        }
    }
}

export const handler = async (event: DynamoDBStreamEvent) => {
    const tableName = process.env.TABLE_NAME;
    const endpoint = process.env.ENDPOINT;

    if (!tableName) {
        throw new Error('tableName not specified in process.env.TABLE_NAME');
    }

    if (!endpoint) {
        throw new Error('endpoint not specified in process.env.ENDPOINT');
    }

    // const connectionData = await ddb.scan({ TableName: tableName, ProjectionExpression: 'connectionId' }).promise();

    const endpointUrl = new URL(endpoint);
    const apigwManagementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: endpointUrl.host + endpointUrl.pathname,
    });

    const postData = event.Records.map((r) => DynamoDB.Converter.unmarshall(r.dynamodb?.NewImage as DynamoDB.AttributeMap) ?? {});


    const postCalls = (postData).map(async duel => {
        const { playerAId, playerBId } = duel;
        if (playerAId) {
            await postDuelData(apigwManagementApi, tableName, playerAId, duel);
        }
        if (playerBId) {
            await postDuelData(apigwManagementApi, tableName, playerBId, duel);
        }
    });

    await Promise.all(postCalls);
};