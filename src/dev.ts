import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { run, type Loader } from './eval'
import { serialize, type ZapRequest } from './types'

const PORT = Number(process.env.PORT ?? 3000)

const loader: Loader = (name: string) => readFile(`${name}.zap`, 'utf8')

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => (data += chunk.toString()))
    req.on('end', () => resolve(data || null))
  })
}


const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url!, `http://localhost:${PORT}`)
  const path = url.pathname
  const zapFile = `.${path}.zap`

  const zapReq: ZapRequest = {
    method: req.method!,
    path,
    params: [],
    query: Object.fromEntries(url.searchParams),
    headers: req.headers as Record<string, string>,
    body: await readBody(req),
  }

  try {
    const source = await readFile(zapFile, 'utf8')
    const zapRes = await run(source, zapReq, loader)
    res.writeHead(zapRes.status ?? 200, zapRes.headers)
    res.end(serialize(zapRes.body))
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.writeHead(404).end(`No handler: ${zapFile}`)
    } else {
      res.writeHead(500).end(err.message)
    }
  }
})

server.listen(PORT, () => console.log(`zap dev → http://localhost:${PORT}`))
