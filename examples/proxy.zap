export default async (req) => {
  const url = req.query.url
  if (!url) return { status: 400, body: 'Missing ?url= parameter' }

  const upstream = await fetch(url, {
    method: req.method === 'GET' ? 'GET' : req.method,
    headers: { 'user-agent': 'zap-proxy/1.0' },
    body: req.body ?? undefined,
  })

  return {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'access-control-allow-origin': '*',
    },
    body: await upstream.text(),
  }
}
