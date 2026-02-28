# zap

> Drop a `.zap` file in S3. It becomes an API endpoint.

Like PHP — but JavaScript, serverless, and free on AWS forever.

One Lambda function runs permanently as the runtime. When a request arrives at `/proxy`, it fetches `proxy.zap` from your S3 bucket, evaluates it, and returns the response. To change behavior, upload a new file. No redeploy. No CI. No infra changes.

---

## Quick start

```bash
git clone https://github.com/dmvjs/s3node && cd s3node
npm install
npm run init
```

`init` provisions the full AWS stack and prints your endpoint URL. Requires AWS credentials (`aws configure`). Takes about 30 seconds.

```
  building runtime        ✓
  creating bucket         ✓  zap-a3f2b8c1
  creating kv table       ✓  zap-kv
  configuring iam         ✓
  deploying lambda        ✓
  creating endpoint       ✓

  → https://abc123.lambda-url.us-east-1.on.aws
```

---

## Local dev

```bash
npm run dev    # → http://localhost:3000
```

Place `.zap` files in the project root. `GET /proxy` maps to `./proxy.zap`. Uses real DynamoDB for `kv` — same table as production.

---

## The .zap format

A `.zap` file exports a default async function. That function is the handler.

```js
export default async (req) => {
  return { status: 200, body: 'hello' }
}
```

### Request

```ts
req.method   // 'GET' | 'POST' | 'PUT' | 'DELETE' | ...
req.path     // '/proxy'
req.query    // Record<string, string>  e.g. { url: 'https://...' }
req.headers  // Record<string, string>
req.body     // string | null
```

### Response

```ts
{
  status?:  number                   // default 200
  headers?: Record<string, string>
  body?:    string | object          // objects are JSON-serialized
}
```

### Built-ins

Everything available globally inside every `.zap` file:

| Name | Description |
|---|---|
| `fetch` | Standard web `fetch` |
| `kv` | Persistent key/value store (DynamoDB) |
| `zap(name)` | Import another `.zap` file from S3 |
| `crypto` | Web Crypto API |
| `URL`, `URLSearchParams` | URL utilities |
| `Buffer` | Node.js Buffer |
| `console` | Logging (goes to CloudWatch) |
| `setTimeout`, `clearTimeout` | Timers |
| `process.env` | Environment variables |

---

## kv — persistent storage

`kv` is a built-in key/value store backed by DynamoDB. No setup, no imports, no config — it's just there.

```js
await kv.set('key', value)   // value can be string, number, object, array
await kv.get('key')          // returns the value, or null if not found
await kv.del('key')          // delete
```

```js
// counter.zap
export default async (req) => {
  const count = ((await kv.get('visits')) ?? 0) + 1
  await kv.set('visits', count)
  return { body: { visits: count } }
}
```

---

## zap() — imports

Any `.zap` file can import another using `zap(name)`. S3 is the module registry.

```js
// utils/greet.zap
export default {
  hello: (name) => `hello ${name}`,
}
```

```js
// api.zap
export default async (req) => {
  const greet = await zap('utils/greet')
  return { body: greet.hello(req.query.name ?? 'world') }
}
```

`zap('utils/greet')` fetches `utils/greet.zap` from the same bucket. Imports can be nested — a `.zap` file can `zap()` other `.zap` files. The bucket is the module system.

---

## @cron — scheduled handlers

Add `// @cron <expr>` as the first line. When deployed, `zap deploy` automatically creates an EventBridge rule that triggers the handler on schedule.

```js
// @cron 0 * * * *
export default async () => {
  await kv.set('heartbeat', new Date().toISOString())
  console.log('tick')
}
```

Standard 5-field cron expressions (`minute hour day month weekday`). `zap rm` removes the EventBridge rule alongside the S3 file.

Cron handlers receive no request argument. All built-ins (`kv`, `fetch`, `zap()`, etc.) are available.

---

## Examples

### CORS proxy

Fetch any remote URL server-side, bypassing browser CORS restrictions.

```js
// proxy.zap
export default async (req) => {
  const url = req.query.url
  if (!url) return { status: 400, body: 'Missing ?url=' }

  const upstream = await fetch(url)
  return {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/plain',
      'access-control-allow-origin': '*',
    },
    body: await upstream.text(),
  }
}
```

```
GET https://your-endpoint/proxy?url=https://api.example.com/data
```

### Stateful counter

```js
// counter.zap
export default async (req) => {
  const count = ((await kv.get('visits')) ?? 0) + 1
  await kv.set('visits', count)
  return { body: { visits: count } }
}
```

### Hourly heartbeat

```js
// @cron 0 * * * *
export default async () => {
  await kv.set('heartbeat', new Date().toISOString())
}
```

---

## CLI

```
zap init                        Provision AWS infra and deploy the runtime
zap deploy <file|directory>     Upload .zap file(s) to S3
zap rm <name>                   Remove a handler (and its cron rule if any)
zap ls                          List deployed handlers
```

**Options**

```
-r, --region <region>    AWS region for init  (default: us-east-1)
-b, --bucket <bucket>    S3 bucket name       (default: reads from .zaprc)
```

After `init`, a `.zaprc` file is written to the project root. All subsequent commands read the bucket name and function ARN from it automatically — no flags needed.

---

## AWS infrastructure

Everything provisioned by `npm run init`:

| Resource | Purpose |
|---|---|
| S3 bucket | Stores `.zap` files |
| DynamoDB table (`zap-kv`) | Backs the `kv` built-in |
| IAM role (`zap-runtime-role`) | Lambda execution role |
| Lambda function (`zap-runtime`, Node 20) | The runtime |
| Lambda Function URL | Public HTTPS endpoint — no API Gateway |
| EventBridge rules | One per `@cron` handler (created on deploy) |

---

## Cost

Runs within AWS always-free tier limits at zero cost for typical personal or small-team usage:

| Service | Free tier |
|---|---|
| Lambda | 1M requests/month, 400K GB-seconds — permanent |
| S3 | 5GB storage, 20K GET requests/month — permanent |
| DynamoDB | 25 WCU/RCU, 25GB storage — permanent |
| EventBridge | 14M scheduled invocations/month — permanent |

---

## How it works

The runtime is a single Lambda function. On each HTTP request:

1. Parse the URL path → derive the S3 key (`/proxy` → `proxy.zap`)
2. Fetch the `.zap` source from S3
3. Evaluate it in a `vm` sandbox with the built-in globals
4. Call the exported handler with the request
5. Return the response

For `@cron` handlers, EventBridge sends `{ zap: { cron: "handler-name" } }` as the Lambda payload. The runtime detects this and invokes the handler with no request argument.

`zap(name)` inside a handler triggers the same fetch-and-eval cycle recursively, with the same loader — so the entire module graph lives in S3.

---

MIT
