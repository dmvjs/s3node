import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { evalModule, run, type Loader } from './eval'
import type { ZapRequest } from './types'

const s3 = new S3Client({})
const BUCKET = process.env.ZAP_BUCKET!

const loader: Loader = async (name: string): Promise<string> => {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${name}.zap` }))
  return Body!.transformToString()
}

function serialize(body: unknown): string {
  return typeof body === 'string' ? body : JSON.stringify(body)
}

export const handler = async (event: any): Promise<any> => {
  // Cron invocation from EventBridge
  if (event?.zap?.cron) {
    const source = await loader(event.zap.cron)
    const fn = evalModule(source, loader) as () => Promise<void>
    await fn()
    return
  }

  // HTTP invocation from Function URL
  const e = event as APIGatewayProxyEventV2
  const req: ZapRequest = {
    method: e.requestContext.http.method,
    path: e.rawPath,
    query: Object.fromEntries(new URLSearchParams(e.rawQueryString ?? '').entries()),
    headers: e.headers as Record<string, string>,
    body: e.body ?? null,
  }

  try {
    const source = await loader(req.path.replace(/^\//, ''))
    const res = await run(source, req, loader)
    return { statusCode: res.status ?? 200, headers: res.headers, body: serialize(res.body) }
  } catch (err: any) {
    if (err.name === 'NoSuchKey') return { statusCode: 404, body: `No handler for ${req.path}` }
    return { statusCode: 500, body: err.message }
  }
}
