# zap

> Drop a `.zap` file in S3. It becomes an API endpoint. No redeploy, no CI, no infra changes.

Like PHP — but JavaScript, serverless, and runs free on AWS forever.

---

## How it works

One Lambda function runs permanently. When a request hits `/proxy`, the runtime fetches `proxy.zap` from your S3 bucket, evaluates it, and returns the response. Change the behavior by uploading a new file. That's the whole model.

## Quick start

```bash
git clone https://github.com/dmvjs/s3node && cd s3node
npm install
npm run init
```

That's it. `init` builds the runtime, creates an S3 bucket, provisions a Lambda with a public URL, and prints the endpoint. AWS credentials must be configured (`aws configure`).

## Local dev

```bash
npm run dev         # → http://localhost:3000
```

Put `.zap` files in the project root. `GET /proxy` maps to `./proxy.zap`.

## Writing a .zap file

A `.zap` file is a JS module with a default export — an async function that receives a request and returns a response.

```js
export default async (req) => {
  return { status: 200, body: 'hello' }
}
```

**Request shape**

```ts
req.method   // 'GET' | 'POST' | ...
req.path     // '/proxy'
req.query    // { url: 'https://...' }
req.headers  // { 'content-type': '...' }
req.body     // string | null
```

**Response shape**

```ts
{ status?, headers?, body? }
// body can be a string or any JSON-serializable value
```

**Built-ins available:** `fetch`, `URL`, `URLSearchParams`, `crypto`, `Buffer`, `console`, `setTimeout`, `process.env`, `kv`

**`kv`** — persistent key/value store backed by DynamoDB (always free tier):

```js
await kv.set('key', { any: 'value' })   // store anything
await kv.get('key')                      // retrieve it
await kv.del('key')                      // delete it
```

```js
// counter.zap — stateful endpoint, zero config
export default async (req) => {
  const count = ((await kv.get('visits')) ?? 0) + 1
  await kv.set('visits', count)
  return { body: { visits: count } }
}
```

**Scheduled handlers** — add `// @cron <expr>` at the top. `zap deploy` wires up EventBridge automatically:

```js
// @cron 0 * * * *
export default async () => {
  await kv.set('heartbeat', new Date().toISOString())
}
```

Standard 5-field cron expressions. No extra config.

**Importing other `.zap` files** — use `zap(name)` to load any other `.zap` from the same bucket:

```js
// greet.zap
export default {
  hello: (name) => `hello ${name}`,
}

// api.zap
export default async (req) => {
  const greet = await zap('greet')
  return { body: greet.hello(req.query.name ?? 'world') }
}
```

S3 is the module registry. `zap('utils/math')` loads `utils/math.zap` from the bucket.

## Example — CORS proxy

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
GET https://your-lambda-url/proxy?url=https://api.example.com/data
```

Browser CORS restrictions don't apply — the request is made server-side.

## Deploy to AWS

**Infrastructure needed:**
- S3 bucket (set `ZAP_BUCKET` env var on the Lambda)
- Lambda function (Node 20, handler: `dist/handler.handler`, `ZAP_BUCKET` env var set)
- Lambda Function URL (auth: NONE) — free, no API Gateway required

**Upload handlers with the CLI:**

```bash
export ZAP_BUCKET=my-bucket

zap deploy proxy.zap        # upload one file
zap deploy ./handlers       # upload a whole directory
zap ls                      # list deployed handlers
zap rm proxy                # remove a handler
```

## CLI

```
zap init                Provision AWS infra and deploy the runtime
zap deploy <file|dir>   Upload .zap file(s) to S3
zap rm <name>           Remove a handler
zap ls                  List deployed handlers

Options:
  -r, --region <region>   AWS region (init, default: us-east-1)
  -b, --bucket <bucket>   S3 bucket (or set ZAP_BUCKET, or run init)
```

After `init`, a `.zaprc` file is saved locally. `deploy`, `rm`, and `ls` read the bucket from it automatically.

## Cost

Within AWS free tier limits this runs at **zero cost**:
- Lambda: 1M requests/month free (permanent)
- S3: 5GB storage + 20K reads/month free (permanent)

---

MIT
