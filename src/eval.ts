import vm from 'node:vm'
import type { ZapHandler, ZapRequest, ZapResponse } from './types'

const SANDBOX = {
  fetch,
  console,
  URL,
  URLSearchParams,
  crypto,
  Buffer,
  setTimeout,
  clearTimeout,
  process: { env: process.env },
}

function load(source: string): ZapHandler {
  const code = source.replace(/^export\s+default\s+/m, 'module.exports = ')
  const mod = { exports: {} as ZapHandler }
  vm.runInNewContext(code, { ...SANDBOX, module: mod, exports: mod.exports })
  return mod.exports
}

export async function run(source: string, req: ZapRequest): Promise<ZapResponse> {
  const handler = load(source)
  return handler(req)
}
