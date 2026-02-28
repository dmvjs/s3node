export default async (req) => {
  const key = req.query.key ?? 'default'
  const count = ((await kv.get(key)) ?? 0) + 1
  await kv.set(key, count)
  return { body: { key, count } }
}
