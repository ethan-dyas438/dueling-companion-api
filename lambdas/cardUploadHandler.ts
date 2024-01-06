import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import DynamoDB from 'aws-sdk/clients/dynamodb';
import S3 from 'aws-sdk/clients/s3';

const ddb = new DynamoDB({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const s3 = new S3({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const uploadFileIntoS3 = async (file: string, cardKey: string, cardsBucket: string) => {
    const options: S3.PutObjectRequest = {
        Bucket: cardsBucket,
        Key: cardKey,
        Body: file,
    };

    try {
        const cardObject = await s3.putObject(options).promise();
        console.log(
            `File uploaded into S3 bucket: "${process.env.CARDS_BUCKET_NAME
            }", with key: ${cardKey}`
        );

        return `https://duelingcompanionapistack-cardsbucket685ecb20-krgsqvgjn692.s3.us-east-2.amazonaws.com/${cardKey}`
    } catch (err) {
        console.error(err);
        throw err;
    }
};

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const tableName = process.env.TABLE_NAME;
    const cardsBucket = process.env.CARDS_BUCKET_NAME;

    if (!tableName) {
        throw new Error('tableName not specified in process.env.TABLE_NAME');
    } else if (!cardsBucket) {
        throw new Error('cardsBucket not specified in process.env.CARDS_BUCKET_NAME');
    }

    if (!event.body) {
        return {
            statusCode: 400,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true
            },
            body: JSON.stringify({ message: 'Missing post data.' }),
        };
    }

    const payload = JSON.parse(event.body).payload;

    try {
        const duelResults = await ddb.query({
            TableName: tableName,
            KeyConditionExpression: "duelId = :duelId",
            FilterExpression: "playerAId = :playerId OR playerBId = :playerId",
            ExpressionAttributeValues: {
                ":playerId": { S: payload.playerId },
                ":duelId": { S: payload.duelId }
            }
        }).promise();

        if (duelResults.Items && duelResults.Items.length === 1) {
            const formattedDuel = DynamoDB.Converter.unmarshall(duelResults.Items[0] as DynamoDB.AttributeMap)

            if (payload.duelData.cardUpdate) {
                const { createdDuel, cardSlot, cardImage } = payload.duelData.cardUpdate
                const s3CardLink = await uploadFileIntoS3(
                    cardImage.dataUrl,
                    `${createdDuel ? 'playerA' : 'playerB'}${cardSlot}${payload.duelId}.${cardImage.format}`,
                    cardsBucket
                );

                if (createdDuel) {
                    formattedDuel.duelData.playerACards = {
                        ...formattedDuel.duelData.playerACards,
                        [`playerA${cardSlot}`]: s3CardLink
                    };
                } else {
                    formattedDuel.duelData.playerBCards = {
                        ...formattedDuel.duelData.playerBCards,
                        [`playerB${cardSlot}`]: s3CardLink
                    };
                }

                await ddb
                    .updateItem({
                        TableName: tableName,
                        Key: {
                            duelId: { S: payload.duelId }
                        },
                        UpdateExpression: "SET duelData = :duelData",
                        ConditionExpression: "playerAId = :playerId OR playerBId = :playerId",
                        ExpressionAttributeValues: {
                            ":playerId": { S: payload.playerId },
                            ":duelData": { M: DynamoDB.Converter.marshall(formattedDuel.duelData) }
                        }
                    })
                    .promise();
            }
        } else {
            throw new Error('Could not find valid duel to update with card data.');
        }
    } catch (err) {
        console.error(err);
        return {
            statusCode: 500,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials": true
            },
            body: 'Failed to update duel card: ' + JSON.stringify(err)
        };
    }

    return {
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": true
        },
        body: 'Updated Duel Card',
    };
};