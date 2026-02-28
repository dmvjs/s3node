// @cron 0 * * * *
export default async () => {
  const last = new Date().toISOString()
  await kv.set('heartbeat', last)
  console.log('heartbeat', last)
}
