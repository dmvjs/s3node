export default async (req) => {
  const base = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers['host']}`
  const demos = [
    ['hello',    'hello world',               'GET'],
    ['counter',  'persistent counter',         'GET'],
    ['visitors', 'visitor count',              'GET'],
    ['iss',      'ISS position — live',        'GET'],
    ['astros',   'who\'s in space right now',  'GET'],
    ['echo',     'echo request details',       'GET'],
    ['proxy',    'cors proxy  ?url=https://…', 'GET'],
  ]

  return {
    headers: { 'content-type': 'text/html' },
    body: `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>zap</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e8e8f0; min-height: 100vh; padding: 4rem 2rem; }
    .wrap { max-width: 560px; margin: 0 auto; }
    h1 { font-size: 1.5rem; font-weight: 800; margin-bottom: 0.4rem; }
    .sub { color: #555; font-size: 0.875rem; margin-bottom: 3rem; }
    .sub a { color: #555; text-decoration: none; }
    .sub a:hover { color: #888; }

    .explainer { background: #13131a; border: 1px solid #1e1e2e; border-radius: 10px; padding: 1.5rem; margin-bottom: 3rem; }
    .explainer p { font-size: 0.875rem; color: #888; line-height: 1.6; margin-bottom: 1rem; }
    .explainer p strong { color: #ccc; }
    pre { background: #0a0a0f; border-radius: 6px; padding: 1rem; font-size: 0.8rem; line-height: 1.7; color: #a0a0c0; overflow-x: auto; }
    .comment { color: #444; }
    .kw { color: #7c7cff; }
    .str { color: #7fbb7f; }

    h2 { font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: #444; margin-bottom: 1rem; }
    ul { list-style: none; }
    li { display: flex; align-items: baseline; gap: 1rem; padding: 0.65rem 0; border-bottom: 1px solid #111; }
    li:last-child { border-bottom: none; }
    a.route { font-family: monospace; font-size: 0.875rem; color: #e8e8f0; text-decoration: none; }
    a.route:hover { color: #fff; text-decoration: underline; }
    span.desc { color: #555; font-size: 0.8rem; flex: 1; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>zap</h1>
  <p class="sub">Drop a .zap file in S3. It becomes an endpoint. &mdash; <a href="https://github.com/dmvjs/zap">github</a> &mdash; <a href="https://npmjs.com/package/@kirkelliott/zap">npm</a></p>

  <div class="explainer">
    <p>A <strong>.zap file</strong> is a JavaScript file you drop in an S3 bucket. The filename becomes the URL path. The function inside handles the request.</p>
    <pre><span class="comment">// hello.zap → /demo/hello</span>
<span class="kw">export default async</span> (req) => {
  <span class="kw">return</span> { body: <span class="str">'hello world'</span> }
}</pre>
    <p style="margin-bottom:0">That's it. No deploy step. No config. Change the file, the endpoint changes.</p>
  </div>

  <h2>Demos</h2>
  <ul>
    ${demos.map(([slug, desc]) => `<li>
      <a class="route" href="${base}/demo/${slug}">/demo/${slug}</a>
      <span class="desc">${desc}</span>
    </li>`).join('\n    ')}
  </ul>
</div>
</body>
</html>`,
  }
}
