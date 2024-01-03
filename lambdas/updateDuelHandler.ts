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
        const duelResults = await ddb.query({
            TableName: tableName,
            KeyConditionExpression: "duelId = :duelId",
            FilterExpression: "playerAId = :playerId OR playerBId = :playerId",
            ExpressionAttributeValues: {
                ":playerId": { S: event.requestContext.connectionId },
                ":duelId": { S: payload.duelId }
            }
        }).promise();

        if (duelResults.Items && duelResults.Items.length === 1) {
            const formattedDuel = DynamoDB.Converter.unmarshall(duelResults.Items[0] as DynamoDB.AttributeMap)

            if (payload.duelData.currentPlayer) {
                formattedDuel.duelData.currentPlayer = payload.duelData.currentPlayer
            }
            if (payload.duelData.playerReady) {
                formattedDuel.duelData.playerReady = {
                    ...formattedDuel.duelData.playerReady,
                    ...payload.duelData.playerReady
                }
            }
            if (payload.duelData.playerLifePoints) {
                formattedDuel.duelData.playerLifePoints = {
                    ...formattedDuel.duelData.playerLifePoints,
                    ...payload.duelData.playerLifePoints
                }
            }
            if (payload.duelData.playerACards) { }
            if (payload.duelData.playerBCards) { }
            if (payload.duelData.extraMonsterOne) { }
            if (payload.duelData.extraMonsterTwo) { }

            await ddb
                .updateItem({
                    TableName: tableName,
                    Key: {
                        duelId: { S: payload.duelId }
                    },
                    UpdateExpression: "SET duelData = :duelData",
                    ConditionExpression: "playerAId = :playerId OR playerBId = :playerId",
                    ExpressionAttributeValues: {
                        ":playerId": { S: event.requestContext.connectionId },
                        ":duelData": { M: DynamoDB.Converter.marshall(formattedDuel.duelData) }
                    }
                })
                .promise();
        } else {
            throw new Error('Could not find valid duel to update.');
        }
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: 'Failed to update duel: ' + JSON.stringify(err) };
    }

    return {
        statusCode: 200,
        body: 'Updated Duel',
    };
};