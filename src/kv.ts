import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb'

const TABLE = process.env.ZAP_TABLE ?? 'zap-kv'
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}))

export const kv = {
  get: async (key: string): Promise<unknown> => {
    const { Item } = await db.send(new GetCommand({ TableName: TABLE, Key: { k: key } }))
    return Item?.v ?? null
  },
  set: async (key: string, value: unknown): Promise<void> => {
    await db.send(new PutCommand({ TableName: TABLE, Item: { k: key, v: value } }))
  },
  del: async (key: string): Promise<void> => {
    await db.send(new DeleteCommand({ TableName: TABLE, Key: { k: key } }))
  },
}
