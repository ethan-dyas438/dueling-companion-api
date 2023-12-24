import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import DynamoDB from 'aws-sdk/clients/dynamodb';

const ddb = new DynamoDB({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const duelTableName = process.env.DUEL_TABLE_NAME;
    const connectionsTableName = process.env.CONNECTIONS_TABLE_NAME;

    if (!duelTableName || !connectionsTableName) {
        throw new Error('Both the duel and connections table names need be added as environment variables.');
    }

    if (!event.body) {
        throw new Error('event body is missing');
    }

    const payload = JSON.parse(event.body).payload;

    try {
        const connectionResult = await ddb.getItem({
            TableName: connectionsTableName,
            Key: {
                connectionId: { S: payload.oldConnectionId }
            }
        }).promise();

        const duelResults = await ddb.query({
            TableName: duelTableName,
            KeyConditionExpression: "duelId = :duelId",
            FilterExpression: "playerAId = :oldConnectionId OR playerBId = :oldConnectionId",
            ExpressionAttributeValues: {
                ":oldConnectionId": { S: payload.oldConnectionId },
                ":duelId": { S: payload.duelId }
            }
        }).promise();


        if (!connectionResult.Item && duelResults.Items && duelResults.Items.length === 1) {
            const formattedDuel = DynamoDB.Converter.unmarshall(duelResults.Items[0] as DynamoDB.AttributeMap)
            const idToUpdate = formattedDuel.playerAId === payload.oldConnectionId ? 'playerAId' : 'playerBId'

            await ddb
                .updateItem({
                    TableName: duelTableName,
                    Key: {
                        duelId: { S: payload.duelId }
                    },
                    UpdateExpression: "SET #updatedPlayerId = :playerId",
                    ConditionExpression: "playerAId = :oldConnectionId OR playerBId = :oldConnectionId",
                    ExpressionAttributeNames: {
                        "#updatedPlayerId": idToUpdate
                    },
                    ExpressionAttributeValues: {
                        ":playerId": { S: event.requestContext.connectionId },
                        ":oldConnectionId": { S: payload.oldConnectionId }
                    }
                }).promise();
        } else {
            throw new Error('Could not find valid duel for player to rejoin.');
        }
    } catch (err) {
        console.error(err);
        return { statusCode: 500, body: 'Failed to rejoin duel: ' + JSON.stringify(err) };
    }

    return {
        statusCode: 200,
        body: 'Rejoined Duel',
    };
};