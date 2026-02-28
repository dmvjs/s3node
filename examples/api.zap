export default async (req) => {
  const greet = await zap('examples/greet')
  const name = req.query.name ?? 'world'
  return { body: greet.hello(name) }
}
