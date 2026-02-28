export default async (req) => {
  return {
    body: {
      method: req.method,
      path: req.path,
      query: req.query,
      headers: req.headers,
      body: req.body,
    },
  }
}
