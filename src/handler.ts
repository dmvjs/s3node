import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda'
import { evalModule, run, type Loader } from './eval'
import { serialize, type ZapRequest } from './types'

const s3 = new S3Client({})
const BUCKET = process.env.ZAP_BUCKET!

const loader: Loader = async (name: string): Promise<string> => {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `${name}.zap` }))
  return Body!.transformToString()
}


export const handler = async (event: Record<string, any>): Promise<unknown> => {
  // Cron invocation from EventBridge
  if (event?.zap?.cron) {
    try {
      const source = await loader(event.zap.cron)
      const fn = evalModule(source, loader) as () => Promise<void>
      await fn()
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

  try {
    const key = req.path === '/' ? 'index' : req.path.replace(/^\//, '')
    const source = await loader(key)
    const res = await run(source, req, loader)
    return { statusCode: res.status ?? 200, headers: res.headers, body: serialize(res.body) }
  } catch (err: any) {
    if (err.name === 'NoSuchKey') return { statusCode: 404, body: `No handler for ${req.path}` }
    return { statusCode: 500, body: err.message }
  }
}
