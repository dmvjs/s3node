export default async (req) => {
  const url = req.query.url
  if (!url) return { status: 400, body: 'Missing ?url=' }

  const upstream = await fetch(url, { headers: { 'user-agent': 'zap-proxy/1.0' } })
  return {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'text/plain',
      'access-control-allow-origin': '*',
    },
    body: await upstream.text(),
  }
}
