# zap

> Drop a `.zap` file in S3. It becomes an API endpoint.

Drop `hello.zap` → GET `/hello` returns a response. Change the file → behavior changes instantly. No redeploy. No CI. No config.

---

## Setup

```bash
mkdir my-project && cd my-project
npx @kirkelliott/zap init
```

Provisions everything on your AWS account and prints a URL. Takes about 30 seconds. Requires AWS credentials — run `aws configure` first if you haven't.

```
  packaging runtime       ✓
  creating bucket         ✓  zap-a3f2b8c1
  creating kv table       ✓  zap-kv
  configuring iam         ✓
  deploying lambda        ✓
  creating endpoint       ✓

  → https://abc123.lambda-url.us-east-1.on.aws
```

---

## Deploy a handler

```bash
npx @kirkelliott/zap deploy hello.zap
```

Or install the CLI once and drop the `npx`:

```bash
npm install -g @kirkelliott/zap
zap deploy hello.zap
```

---

## The .zap format

A `.zap` file exports one function. The runtime rewrites `export default` to `module.exports` and runs it in a Node.js `vm` context — isolated from the Lambda environment, with only the globals listed below in scope.

```js
export default async (req) => {
  return { body: `hello ${req.query.name ?? 'world'}` }
}
```

### Request

```ts
req.method   // 'GET' | 'POST' | ...
req.path     // '/hello'
req.query    // { name: 'elliott' }
req.headers  // { 'content-type': '...' }
req.body     // string | null
```

### Response

```ts
{
  status?:  number                   // default 200
  headers?: Record<string, string>
  body?:    string | object          // objects become JSON automatically
}
```

---

## Globals

These are the only names in scope inside a `.zap` file.

**Injected by zap:**

| Name | What it does |
|---|---|
| `kv` | Persistent key/value storage (DynamoDB-backed) |
| `zap(name)` | Load another `.zap` from the same S3 bucket |

**Standard Node.js 20 globals passed through:**

| Name | What it does |
|---|---|
| `fetch` | HTTP requests |
| `crypto` | Web Crypto API |
| `URL`, `URLSearchParams` | URL parsing |
| `Buffer` | Binary data |
| `setTimeout`, `clearTimeout` | Timers |
| `console` | Logs to CloudWatch |
| `process.env` | Environment variables (`process` is not otherwise available) |

`require`, the file system, and the outer Lambda scope are not accessible.

---

## kv — storage that persists

```js
await kv.set('key', value)   // string, number, object, array — anything
await kv.get('key')          // returns the value, or null
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

No database to provision. It's just there.

---

## zap() — one handler can load another

```js
// utils/auth.zap
export default {
  verify: (token) => token === process.env.SECRET,
}
```

```js
// api.zap
export default async (req) => {
  const auth = await zap('utils/auth')
  if (!auth.verify(req.headers.authorization))
    return { status: 401, body: 'unauthorized' }
  return { body: 'ok' }
}
```

S3 is the module system. Drop a file in, import it anywhere.

---

## @cron — run on a schedule

First line `// @cron <expr>` turns any handler into a scheduled job. `zap deploy` wires up the EventBridge rule automatically.

```js
// @cron 0 * * * *
export default async () => {
  await kv.set('heartbeat', new Date().toISOString())
}
```

Standard cron syntax: `minute hour day month weekday`. `zap rm` removes the schedule when you remove the file.

---

## Examples

### CORS proxy

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

### Shared layout — imports in action

```js
// lib/page.zap — shared layout
export default (title, content) => ({
  headers: { 'content-type': 'text/html' },
  body: `<!doctype html><html>...${title}...${content}...</html>`,
})
```

```js
// iss.zap — ISS position, live
export default async (req) => {
  const page = await zap('lib/page')
  const { iss_position } = await (await fetch('http://api.open-notify.org/iss-now.json')).json()
  return page('ISS', `${iss_position.latitude} / ${iss_position.longitude}`)
}
```

```js
// astros.zap — who's in space right now
export default async (req) => {
  const page = await zap('lib/page')
  const { people } = await (await fetch('http://api.open-notify.org/astros.json')).json()
  return page('In space', people.map(p => p.name).join(', '))
}
```

Both pages share `lib/page.zap`. Update that one file in S3 — both pages change instantly. S3 is the module system.

---

## Environments

Each environment is a fully isolated AWS stack — its own S3 bucket, Lambda function, KV table, and URL. `prod` is the default. No flags needed for prod.

```bash
# spin up staging (takes ~30 seconds, same as init)
zap init --env staging

# deploy and test there
zap deploy --env staging api.zap
curl https://staging-url.lambda-url.us-east-1.on.aws/api

# promote to prod when ready
zap promote api --from staging --to prod
```

`promote` copies the file from one bucket to the other. The prod URL is live instantly.

`.zaprc` stores each environment under its own key:

```json
{
  "prod":    { "bucket": "zap-a3f2b8c1", "url": "https://abc.lambda-url…", … },
  "staging": { "bucket": "zap-f9e2d4c7", "url": "https://xyz.lambda-url…", … }
}
```

Every command accepts `--env`:

```bash
zap ls --env staging
zap rollback api --env staging
zap rm old-handler --env staging
```

---

## rollback — undo a deploy

Every `zap deploy` creates a new S3 version. Roll back to the previous one instantly:

```bash
zap rollback hello
# ↩  hello  restored to 2026-02-28T19:35:00.000Z
```

Works per-environment: `zap rollback hello --env staging`

No revert commits. No redeploy. The old code is live immediately.

---

## Observability

Every request emits a structured JSON log line to CloudWatch:

```json
{"handler":"hello","method":"GET","status":200,"ms":43,"requestId":"abc-123"}
```

Every cache refresh (S3 fetch) logs the handler, ETag, and last-modified timestamp:

```json
{"cache":"refresh","handler":"hello","etag":"\"d41d8cd9\"","modified":"2026-02-28T19:35:00.000Z"}
```

The `requestId` correlates with Lambda's own `REPORT` line, which adds total duration, billed duration, and memory. Nothing to configure — it's all in CloudWatch Logs.

Query with CloudWatch Logs Insights:

```
filter ispresent(handler)
| stats avg(ms), count() as reqs by handler
| sort avg(ms) desc
```

---

## CLI

```
zap init [--env <env>]              Provision AWS and deploy the runtime
zap deploy <file|dir> [--env <env>] Upload .zap file(s) to S3
zap promote <name> [--from] [--to]  Copy a handler between environments
zap rollback <name> [--env <env>]   Restore the previous version of a handler
zap rm <name> [--env <env>]         Remove a handler (and its cron rule)
zap ls [--env <env>]                List deployed handlers
zap demo [--env <env>]              Deploy the built-in demo handlers
zap repair [--env <env>]            Fix Lambda permissions if the URL stops working
```

`init` writes a `.zaprc` to the project directory. All other commands read bucket and region from it — no flags needed.

---

## What gets created

`zap init` provisions six things on your AWS account:

| Resource | What it is |
|---|---|
| S3 bucket | Where your `.zap` files live |
| DynamoDB table | Backs `kv` |
| IAM role | Lets Lambda read S3 and write DynamoDB |
| Lambda function | The runtime that runs your handlers |
| Lambda Function URL | Your public HTTPS endpoint |
| EventBridge rules | One per `@cron` handler |

---

## Cost

All within the AWS permanent free tier:

| Service | Free tier |
|---|---|
| Lambda | 1M requests/month, 400K GB-seconds |
| S3 | 5GB, 20K GET requests/month |
| DynamoDB | 25 WCU/RCU, 25GB |
| EventBridge | 14M scheduled invocations/month |

---

## How it works

One Lambda function (Node.js 20) runs permanently. Every request:

1. Parses the path — `/hello` → fetches `hello.zap` from S3
2. Rewrites `export default` to `module.exports`
3. Runs the code in a `vm.runInNewContext` sandbox with the globals listed above
4. Calls the exported function with the request
5. Returns the response

Source is cached in Lambda memory for 5 seconds. Deploys propagate within 5 seconds on warm containers.

---

MIT

---

**[live demo →](https://zn2qgaqlofvauxmoncf36m4ynq0pfarj.lambda-url.us-east-1.on.aws/)**
