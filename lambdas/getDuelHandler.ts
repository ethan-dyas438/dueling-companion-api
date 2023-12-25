import { APIGatewayProxyEvent, APIGatewayProxyResultV2 } from 'aws-lambda';
import DynamoDB from 'aws-sdk/clients/dynamodb';

const ddb = new DynamoDB({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResultV2> {
    const duelId = event.pathParameters?.duelId;
    const tableName = process.env.TABLE_NAME;

    if (!tableName) {
        throw new Error('tableName not specified in process.env.TABLE_NAME');
    }

    if (!duelId) {
        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true
            },
            body: JSON.stringify({ message: 'Missing path parameter: duelId' }),
        };
    }

    try {
        const result = await ddb.getItem({
                TableName: tableName,
                Key: {
                    duelId: { S: duelId },
                },
            }).promise();

        if (!result.Item) {
            return {
                statusCode: 404,
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Credentials": true
                },
            };
        }
    
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true
            },
            body: "Found Duel",
        };
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true
            },
            body: 'Failed to find duel: ' + JSON.stringify(err)
        };
    }
}