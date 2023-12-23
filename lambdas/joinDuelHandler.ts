import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import DynamoDB from 'aws-sdk/clients/dynamodb';

const ddb = new DynamoDB({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tableName = process.env.TABLE_NAME;

    if (!tableName) {
        throw new Error('tableName not specified in process.env.TABLE_NAME');
    }

    if (!event.body) {
        throw new Error('event body is missing');
    }

    const payload = JSON.parse(event.body).payload;

    try {
        await ddb
        .updateItem({
            TableName: tableName,
            Key: {
                duelId: { S: payload.duelId }
            },
            UpdateExpression: "SET playerBId = :playerId",
            ConditionExpression: "size(playerAId) > :zeroNumber AND size(playerBId) = :zeroNumber",
            ExpressionAttributeValues: {
                ":playerId": { S: event.requestContext.connectionId },
                ":zeroNumber": { N: "0" }
            }
        })
        .promise();
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: 'Failed to join duel: ' + JSON.stringify(err) };
    }

    return {
        statusCode: 200,
        body: 'Joined Duel',
    };
};