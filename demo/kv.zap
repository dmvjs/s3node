export default async (req) => {
  const { key, value } = req.query

  if (!key) return { status: 400, body: 'Missing ?key=' }

  if (req.method === 'DELETE') {
    await kv.del(key)
    return { body: { deleted: key } }
  }

  if (value !== undefined) {
    await kv.set(key, value)
    return { body: { set: key, value } }
  }

  const stored = await kv.get(key)
  return { body: { key, value: stored } }
}
