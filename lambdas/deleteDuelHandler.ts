import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import S3 from 'aws-sdk/clients/s3';
import DynamoDB from 'aws-sdk/clients/dynamodb';

const ddb = new DynamoDB({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });
const s3 = new S3({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

const deleteS3Files = async (duelId: string, cardsBucket: string) => {
  const options: S3.ListObjectsRequest = {
    Bucket: cardsBucket,
    Prefix: duelId,
  };

  try {
    const duelCards = await s3.listObjects(options).promise();

    if (!duelCards.IsTruncated && duelCards.Contents && duelCards.Contents.length > 0) {
      const deleteOptions: S3.DeleteObjectsRequest = {
        Bucket: cardsBucket,
        Delete: {
          Objects: duelCards.Contents.map((duelCard) => ({ Key: duelCard.Key || '' }))
        }
      }

      await s3.deleteObjects(deleteOptions).promise();
    }
    console.log(
      `Files deleted from S3 bucket: "${process.env.CARDS_BUCKET_NAME
      }", with duelId: ${duelId}`
    );
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
    throw new Error('event body is missing');
  }

  const payload = JSON.parse(event.body).payload;

  try {
    await deleteS3Files(payload.duelId, cardsBucket);

    await ddb
      .deleteItem({
        TableName: tableName,
        Key: {
          duelId: { S: payload.duelId }
        },
        ConditionExpression: "playerAId = :playerId",
        ExpressionAttributeValues: {
          ":playerId": { S: event.requestContext.connectionId }
        }
      })
      .promise();
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: 'Failed to add duel: ' + JSON.stringify(err) };
  }

  return {
    statusCode: 200,
    body: 'Deleted Duel',
  };
};