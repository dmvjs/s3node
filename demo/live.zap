export default async (req) => {
  if (!req.body) return { status: 400, body: 'POST a function' }
  return { body: await eval(`(${req.body})`)({ kv, fetch }) }
}
