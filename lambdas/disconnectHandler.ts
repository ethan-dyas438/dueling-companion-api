import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { DocumentClient } from 'aws-sdk/clients/dynamodb';

const ddb = new DocumentClient({ apiVersion: '2012-08-10', region: process.env.AWS_REGION });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const tableName = process.env.TABLE_NAME;

  if (!tableName) {
    throw new Error('tableName not specified in process.env.TABLE_NAME');
  }

  const deleteParams = {
    TableName: tableName,
    Key: {
      connectionId: event.requestContext.connectionId,
    },
  };

  try {
    await ddb.delete(deleteParams).promise();
  } catch (err) {
    return { statusCode: 500, body: 'Failed to disconnect: ' + JSON.stringify(err) };
  }

  return { statusCode: 200, body: 'Disconnected.' };
};