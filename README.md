# zap

> Drop a `.zap` file in S3. It becomes an API endpoint. No redeploy, no CI, no infra changes.

Like PHP — but JavaScript, serverless, and runs free on AWS forever.

---

## How it works

One Lambda function runs permanently. When a request hits `/proxy`, the runtime fetches `proxy.zap` from your S3 bucket, evaluates it, and returns the response. Change the behavior by uploading a new file. That's the whole model.

## Local dev

```bash
npm install
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

**Built-ins available:** `fetch`, `URL`, `URLSearchParams`, `crypto`, `Buffer`, `console`, `setTimeout`, `process.env`

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
zap deploy <file|dir>   Upload .zap file(s) to S3
zap rm <name>           Remove a handler
zap ls                  List deployed handlers

Options:
  -b, --bucket <bucket>   S3 bucket (or set ZAP_BUCKET env var)
```

## Cost

Within AWS free tier limits this runs at **zero cost**:
- Lambda: 1M requests/month free (permanent)
- S3: 5GB storage + 20K reads/month free (permanent)

---

MIT
