# zap

> Drop a `.zap` file in S3. It becomes an API endpoint.

You already know S3. You've been dropping files in buckets for years. This makes those files executable.

Drop `hello.zap` → GET `/hello` returns a response. Change the file → behavior changes instantly. No redeploy. No CI. No config.

---

## Setup

```bash
mkdir my-project && cd my-project
npx @kirkelliott/zap init
```

This provisions everything on your AWS account and prints a URL. Takes about 30 seconds. Requires AWS credentials — run `aws configure` first if you haven't.

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

A `.zap` file is a JavaScript module that exports one function. That function handles the request.

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

## Built-ins

These are available in every `.zap` file — no imports needed:

| Name | What it does |
|---|---|
| `fetch` | HTTP requests |
| `kv` | Persistent key/value storage |
| `zap(name)` | Load another `.zap` from the same bucket |
| `crypto` | Web Crypto API |
| `URL`, `URLSearchParams` | URL parsing |
| `Buffer` | Binary data |
| `console` | Logs to CloudWatch |
| `process.env` | Environment variables |

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

`zap init --env <name>` provisions a fully isolated stack — separate bucket, Lambda, and KV table — for each environment. Prod is the default.

```bash
zap init --env staging
zap deploy --env staging api.zap
```

Each environment gets its own URL. When you're happy with staging, promote to prod:

```bash
zap promote api --from staging --to prod
```

That's it. No traffic splitting config. No YAML. Just copy the file across.

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

One Lambda function runs permanently. Every request:

1. Parses the path — `/proxy` → `proxy.zap`
2. Fetches that file from S3
3. Evaluates it in a sandboxed JS environment
4. Calls the exported function with the request
5. Returns the response

Updating a handler means updating a file in S3. The runtime always reads fresh.

---

MIT

---

The file in S3 is just a carrier. You don't need it.

```js
// live.zap
export default async (req) => {
  if (!req.body) return { status: 400, body: 'POST a function' }
  return { body: await eval(`(${req.body})`)({ kv, fetch }) }
}
```

```bash
curl -X POST https://your-endpoint/live \
  -d 'async ({ kv }) => kv.get("visits")'
```

Deploy `live.zap` once. Then POST JavaScript directly — no S3, no CLI, no deploy step. The runtime running inside itself.

---

**[live demo →](https://zn2qgaqlofvauxmoncf36m4ynq0pfarj.lambda-url.us-east-1.on.aws/)**
