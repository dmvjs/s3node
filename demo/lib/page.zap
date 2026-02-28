export default (title, content) => ({
  headers: { 'content-type': 'text/html' },
  body: `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #0a0a0f; color: #e8e8f0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2rem; }
    h1 { font-size: 1rem; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: #666; margin-bottom: 2rem; }
    .card { background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; padding: 2.5rem 3rem; min-width: 360px; max-width: 520px; width: 100%; }
    .value { font-size: 2.5rem; font-weight: 700; letter-spacing: -0.03em; line-height: 1.1; margin-bottom: 0.5rem; }
    .label { font-size: 0.75rem; color: #555; letter-spacing: 0.08em; text-transform: uppercase; }
    .row { margin-bottom: 1.75rem; }
    .row:last-child { margin-bottom: 0; }
    .tag { display: inline-block; background: #1e1e2e; border-radius: 6px; padding: 0.35rem 0.75rem; font-size: 0.875rem; margin: 0.2rem 0.2rem 0.2rem 0; }
    .dim { color: #444; font-size: 0.75rem; margin-top: 2rem; text-align: center; }
    a { color: #555; text-decoration: none; }
    a:hover { color: #888; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="card">${content}</div>
  <p class="dim">powered by <a href="https://github.com/dmvjs/zap">zap</a></p>
</body>
</html>`,
})
