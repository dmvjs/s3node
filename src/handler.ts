import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { evalModule, run, type Loader } from './eval'
import { serialize, type ZapRequest } from './types'

const s3 = new S3Client({})
const BUCKET = process.env.ZAP_BUCKET!
const TTL = 5_000

const cache = new Map<string, { source: string; at: number }>()

const loader: Loader = async (name: string): Promise<string> => {
  const hit = cache.get(name)
  if (hit && Date.now() - hit.at < TTL) return hit.source
  const { Body, ETag, LastModified } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${name}.zap` }))
  const source = await Body!.transformToString()
  cache.set(name, { source, at: Date.now() })
  console.log(JSON.stringify({ cache: 'refresh', handler: name, etag: ETag, modified: LastModified?.toISOString() }))
  return source
}


export const handler = async (event: Record<string, any>, context: { awsRequestId: string }): Promise<unknown> => {
  const start = Date.now()

  // Cron invocation from EventBridge
  if (event?.zap?.cron) {
    try {
      const source = await loader(event.zap.cron)
      const fn = evalModule(source, loader) as () => Promise<void>
      await fn()
      console.log(JSON.stringify({ type: 'cron', handler: event.zap.cron, ms: Date.now() - start, requestId: context.awsRequestId }))
    } catch (err: any) {
      console.error(`cron error [${event.zap.cron}]:`, err.message)
    }
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

  const key = req.path === '/' ? 'index' : req.path.replace(/^\//, '')

  try {
    const source = await loader(key)
    const res = await run(source, req, loader)
    const status = res.status ?? 200
    console.log(JSON.stringify({ handler: key, method: req.method, status, ms: Date.now() - start, requestId: context.awsRequestId }))
    return { statusCode: status, headers: res.headers, body: serialize(res.body) }
  } catch (err: any) {
    const status = err.name === 'NoSuchKey' ? 404 : 500
    console.log(JSON.stringify({ handler: key, method: req.method, status, ms: Date.now() - start, requestId: context.awsRequestId }))
    return { statusCode: status, body: status === 404 ? `No handler for ${req.path}` : err.message }
  }
}
