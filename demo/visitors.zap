export default async (req) => {
  const count = ((await kv.get('visitors')) ?? 0) + 1
  await kv.set('visitors', count)
  return {
    headers: { 'content-type': 'text/html' },
    body: `<!doctype html>
<html>
<head><meta charset="utf-8"><title>visitors</title>
<style>
  body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #000; color: #fff; }
  h1 { font-size: 20vw; font-weight: 900; letter-spacing: -0.05em; }
  p { position: fixed; bottom: 2rem; font-size: 1rem; opacity: 0.4; }
</style>
</head>
<body>
  <h1>${count}</h1>
  <p>visitors</p>
</body>
</html>`
  }
}
