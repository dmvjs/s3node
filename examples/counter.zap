export default async (req) => {
  const count = ((await kv.get('visits')) ?? 0) + 1
  await kv.set('visits', count)
  return { body: { visits: count } }
}
