import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { run, type Loader } from './eval'
import type { ZapRequest } from './types'

const s3 = new S3Client({})
const BUCKET = process.env.ZAP_BUCKET!

const loader: Loader = async (name: string): Promise<string> => {
  const key = `${name}.zap`
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  return Body!.transformToString()
}

function serialize(body: unknown): string {
  return typeof body === 'string' ? body : JSON.stringify(body)
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
  const req: ZapRequest = {
    method: event.requestContext.http.method,
    path: event.rawPath,
    query: Object.fromEntries(new URLSearchParams(event.rawQueryString ?? '').entries()),
    headers: event.headers as Record<string, string>,
    body: event.body ?? null,
  }

  try {
    const name = req.path.replace(/^\//, '')
    const source = await loader(name)
    const res = await run(source, req, loader)
    return {
      statusCode: res.status ?? 200,
      headers: res.headers,
      body: serialize(res.body),
    }
  } catch (err: any) {
    if (err.name === 'NoSuchKey') return { statusCode: 404, body: `No handler for ${req.path}` }
    return { statusCode: 500, body: err.message }
  }
}
