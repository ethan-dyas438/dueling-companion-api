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

    const duelData = {
        currentPlayer: { S: "" },
        playerReady: {
            M: {
                A: { BOOL: false },
                B: { BOOL: false },
            }
        },
        playerLifePoints: { 
            M: {
                A: { N: "4000" },
                B: { N: "4000" },
            }
        },
        playerACards: { M: {} },
        playerBCards: { M: {} },
        extraMonsterOne: { S: "" },
        extraMonsterTwo: { S: "" }

    };

    // Calculate the expireAt time (7 days from now) in epoch second format
    const oneWeekExpiration = Math.floor((new Date().getTime() + 7 * 24 * 60 * 60 * 1000) / 1000);

    try {
        await ddb
        .putItem({
            TableName: tableName,
            Item: {
            duelId: { S: payload.duelId },
            playerAId: { S: event.requestContext.connectionId },
            playerBId: { S: "" },
            duelData: { M: duelData },
            duelExpiration: { N: oneWeekExpiration.toString() }
            },
        })
        .promise();
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: 'Failed to add duel: ' + JSON.stringify(err) };
    }

    return {
        statusCode: 200,
        body: 'Added Duel',
    };
};