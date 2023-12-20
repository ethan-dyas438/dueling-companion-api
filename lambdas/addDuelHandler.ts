import { APIGatewayProxyEvent } from 'aws-lambda';
import { AWSError } from 'aws-sdk/lib/error';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';
import ApiGatewayManagementApi from 'aws-sdk/clients/apigatewaymanagementapi';

const ddb = new DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION }); // TODO: Follow tutorial and simplify

export const handler = async (event: APIGatewayProxyEvent) => {
    let connectionData;

    const tableName = process.env.TABLE_NAME;

    if (!tableName) {
        throw new Error('tableName not specified in process.env.TABLE_NAME');
    }

    if (!event.body) {
        throw new Error('event body is missing');
    }

    try {
        connectionData = await ddb.scan({ TableName: tableName, ProjectionExpression: 'connectionId' }).promise();
    } catch (e) {
        let errorStack;
        console.error(e);

        if (e instanceof Error) {
            errorStack = e.stack;
        }
        return { statusCode: 500, body: errorStack };
    }

    const apigwManagementApi = new ApiGatewayManagementApi({
        apiVersion: '2018-11-29',
        endpoint: event.requestContext.domainName + '/' + event.requestContext.stage,
    });

    const postData = JSON.parse(event.body).data;

    const postCalls = (connectionData.Items ?? []).map(async ({ connectionId }) => {
    try {
        await apigwManagementApi.postToConnection({ ConnectionId: connectionId, Data: postData }).promise();
    } catch (e) {
        const { statusCode } = e as AWSError;
        console.error(e);

        if (statusCode === 410) {
            console.log(`Found stale connection, deleting ${connectionId}`);
            await ddb.delete({ TableName: tableName, Key: { connectionId } }).promise();
        } else {
            throw e;
        }
    }
    });

    try {
        await Promise.all(postCalls);
    } catch (e) {
        let errorStack;
        console.error(e);

        if (e instanceof Error) {
            errorStack = e.stack;
        }
        return { statusCode: 500, body: errorStack };
    }

    return { statusCode: 200, body: 'Data sent.' };
};