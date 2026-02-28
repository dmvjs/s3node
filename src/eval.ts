import vm from 'node:vm'
import type { ZapHandler, ZapRequest, ZapResponse } from './types'

export type Loader = (name: string) => Promise<string>

const BASE_SANDBOX = {
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

function evalModule(source: string, loader: Loader): unknown {
  const code = source.replace(/^export\s+default\s+/m, 'module.exports = ')
  const mod = { exports: {} as unknown }
  vm.runInNewContext(code, {
    ...BASE_SANDBOX,
    module: mod,
    exports: mod.exports,
    zap: (name: string) => loader(name).then(src => evalModule(src, loader)),
  })
  return mod.exports
}

export async function run(source: string, req: ZapRequest, loader: Loader): Promise<ZapResponse> {
  const handler = evalModule(source, loader) as ZapHandler
  return handler(req)
}
