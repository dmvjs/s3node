export interface ZapRequest {
  method: string
  path: string
  params: string[]
  query: Record<string, string>
  headers: Record<string, string>
  body: string | null
}

export interface ZapResponse {
  status?: number
  headers?: Record<string, string>
  body?: unknown
}

export type ZapHandler = (req: ZapRequest) => ZapResponse | Promise<ZapResponse>

export function serialize(body: unknown): string {
  return typeof body === 'string' ? body : JSON.stringify(body)
}
