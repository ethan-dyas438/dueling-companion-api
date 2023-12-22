import { DynamoDBStreamEvent } from 'aws-lambda';
import { AWSError } from 'aws-sdk/lib/error';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import ApiGatewayManagementApi from 'aws-sdk/clients/apigatewaymanagementapi';

const ddb = new DynamoDB();

export const handler = async (event: DynamoDBStreamEvent) => {
    const tableName = process.env.TABLE_NAME;
    const endpoint = process.env.ENDPOINT;

    if (!tableName) {
        throw new Error('tableName not specified in process.env.TABLE_NAME');
    }

    if (!endpoint) {
        throw new Error('endpoint not specified in process.env.ENDPOINT');
    }

    const connectionData = await ddb.scan({ TableName: tableName, ProjectionExpression: 'connectionId' }).promise();

    const endpointUrl = new URL(endpoint);
    const apigwManagementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: endpointUrl.host + endpointUrl.pathname,
    });

    const postData = event.Records.map((r) => DynamoDB.Converter.unmarshall(r.dynamodb?.NewImage as DynamoDB.AttributeMap) ?? {});

    const postCalls = (connectionData.Items ?? []).map(async ({ connectionId }) => {
        try {
            await apigwManagementApi
                .postToConnection({
                    ConnectionId: connectionId.S!,
                    Data: JSON.stringify({
                        action: 'stream',
                        payload: postData,
                    }),
                })
            .promise();
        } catch (e) {
            const { statusCode } = e as AWSError;
            console.error(e);

            if (statusCode === 410) {
                console.log(`Found stale connection, deleting ${connectionId}`);
                await ddb.deleteItem({ TableName: tableName, Key: { connectionId } }).promise();
            } else {
                throw e;
            }
        }
    });

    await Promise.all(postCalls);
};