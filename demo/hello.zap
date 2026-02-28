export default async (req) => {
  const name = req.query.name ?? 'world'
  return { body: { message: `hello ${name}`, time: new Date().toISOString() } }
}
