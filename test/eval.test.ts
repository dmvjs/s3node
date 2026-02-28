import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { evalModule, run } from '../src/eval'

const noLoader = async (_: string): Promise<string> => { throw new Error('unexpected loader call') }

describe('evalModule', () => {
  it('rewrites export default and returns the export', () => {
    assert.equal(evalModule('export default 42', noLoader), 42)
  })

  it('executes a function export', () => {
    const fn = evalModule('export default (x) => x * 2', noLoader) as (x: number) => number
    assert.equal(fn(5), 10)
  })

  it('executes an async handler', async () => {
    const fn = evalModule('export default async (x) => x + 1', noLoader) as (x: number) => Promise<number>
    assert.equal(await fn(2), 3)
  })

  it('provides fetch in scope', () => {
    const fn = evalModule('export default () => typeof fetch', noLoader) as () => string
    assert.equal(fn(), 'function')
  })

  it('provides URL in scope', () => {
    const fn = evalModule('export default () => new URL("https://example.com").hostname', noLoader) as () => string
    assert.equal(fn(), 'example.com')
  })

  it('provides Buffer in scope', () => {
    const fn = evalModule('export default () => Buffer.from("hi").toString("hex")', noLoader) as () => string
    assert.equal(fn(), '6869')
  })

  it('provides process.env in scope', () => {
    process.env._ZAP_TEST = 'ok'
    const fn = evalModule('export default () => process.env._ZAP_TEST', noLoader) as () => string
    assert.equal(fn(), 'ok')
    delete process.env._ZAP_TEST
  })

  it('does not expose require', () => {
    const fn = evalModule('export default () => typeof require', noLoader) as () => string
    assert.equal(fn(), 'undefined')
  })

  it('does not expose process.exit', () => {
    const fn = evalModule('export default () => typeof process.exit', noLoader) as () => string
    assert.equal(fn(), 'undefined')
  })

  it('resolves zap() via the loader', async () => {
    const loader = async (name: string) => `export default '${name}-loaded'`
    const fn = evalModule('export default async () => zap("utils/auth")', loader) as () => Promise<string>
    assert.equal(await fn(), 'utils/auth-loaded')
  })
})

describe('run', () => {
  it('calls the handler with the request', async () => {
    const source = 'export default async (req) => ({ body: req.query.name })'
    const req = { method: 'GET', path: '/test', query: { name: 'world' }, headers: {}, body: null }
    const res = await run(source, req as any, noLoader)
    assert.equal(res.body, 'world')
  })

  it('handler can set status', async () => {
    const source = 'export default async () => ({ status: 201, body: "created" })'
    const req = { method: 'POST', path: '/test', query: {}, headers: {}, body: null }
    const res = await run(source, req as any, noLoader)
    assert.equal(res.status, 201)
  })
})
