export default async (req) => {
  const base = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers['host']}`
  const demos = [
    ['hello', 'hello world'],
    ['counter', 'persistent counter'],
    ['visitors', 'visitor count'],
    ['echo', 'echo request details'],
    ['kv', 'key/value store'],
    ['proxy', 'cors proxy — add ?url='],
  ]
  return {
    headers: { 'content-type': 'text/html' },
    body: `<!doctype html>
<html>
<head><meta charset="utf-8"><title>zap</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; max-width: 520px; margin: 5rem auto; padding: 0 2rem; color: #111; }
  h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.25rem; }
  .sub { color: #666; font-size: 0.875rem; margin: 0 0 2.5rem; }
  .sub a { color: #666; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: flex; align-items: baseline; gap: 1rem; padding: 0.6rem 0; border-bottom: 1px solid #f0f0f0; }
  li:last-child { border-bottom: none; }
  a.route { font-family: monospace; font-size: 0.9rem; color: #111; text-decoration: none; }
  a.route:hover { text-decoration: underline; }
  span { color: #999; font-size: 0.8rem; }
</style>
</head>
<body>
  <h1>zap demos</h1>
  <p class="sub">Drop a .zap file in S3. It becomes an endpoint. &mdash; <a href="https://github.com/dmvjs/s3node">github</a></p>
  <ul>
    ${demos.map(([slug, desc]) => `<li><a class="route" href="${base}/demo/${slug}">/demo/${slug}</a><span>${desc}</span></li>`).join('\n    ')}
  </ul>
</body>
</html>`,
  }
}
