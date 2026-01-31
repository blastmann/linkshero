import { DEFAULT_ARIA2_ENDPOINT } from './constants'
import type { Aria2Config, LinkItem, PushOutcome } from './types'
import { t } from './i18n'

interface RpcBody {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: unknown[]
}

interface RpcError {
  code: number
  message: string
}

interface RpcResponse<T> {
  result?: T
  error?: RpcError
}

type MulticallEntry =
  | [{ result: string }]
  | [{ faultCode: number; faultString: string }]
  | string[]

const JSONRPC_VERSION = '2.0'

function normalizeConfig(config: Aria2Config): Aria2Config {
  return {
    endpoint: (config.endpoint || DEFAULT_ARIA2_ENDPOINT).trim() || DEFAULT_ARIA2_ENDPOINT,
    token: config.token?.trim()
  }
}

async function sendRpcRequest<T>(config: Aria2Config, method: string, params?: unknown[]): Promise<T> {
  const body: RpcBody = {
    jsonrpc: JSONRPC_VERSION,
    id: crypto.randomUUID(),
    method,
    params
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  const payload = (await response.json()) as RpcResponse<T>
  if (payload.error) {
    throw new Error(payload.error.message || t('rpcAriaError'))
  }

  if (typeof payload.result === 'undefined') {
    throw new Error(t('rpcNoResponse'))
  }

  return payload.result
}

function buildAddUriParams(url: string, token?: string, dir?: string) {
  const options: Record<string, unknown> = {}
  if (dir) {
    options.dir = dir
  }

  const params: unknown[] = [[url], options]
  if (token) {
    params.unshift(`token:${token}`)
  }
  return params
}

function parseMulticall(entries: MulticallEntry[], links: LinkItem[]): PushOutcome {
  const failures: Array<{ url: string; reason: string }> = []
  let success = 0

  entries.forEach((entry, index) => {
    const link = links[index]
    const first = Array.isArray(entry) ? entry[0] : entry

    if (first && typeof first === 'object' && 'faultCode' in first) {
      failures.push({
        url: link?.url ?? 'unknown',
        reason: (first as { faultString?: string }).faultString ?? t('rpcUnknownError')
      })
      return
    }

    success += 1
  })

  return { succeeded: success, failed: failures }
}

async function pushViaMulticall(links: LinkItem[], config: Aria2Config): Promise<PushOutcome> {
  const calls = links.map(link => ({
    methodName: 'aria2.addUri',
    params: buildAddUriParams(link.url, config.token, config.dir)
  }))

  const result = await sendRpcRequest<MulticallEntry[]>(config, 'system.multicall', [calls])
  return parseMulticall(result, links)
}

async function pushSequentially(links: LinkItem[], config: Aria2Config): Promise<PushOutcome> {
  const failures: Array<{ url: string; reason: string }> = []
  let success = 0

  for (const link of links) {
    try {
      await sendRpcRequest<string>(
        config,
        'aria2.addUri',
        buildAddUriParams(link.url, config.token, config.dir)
      )
      success += 1
    } catch (error) {
      failures.push({
        url: link.url,
        reason: error instanceof Error ? error.message : t('rpcUnknownError')
      })
    }
  }

  return { succeeded: success, failed: failures }
}

export async function pushLinksToAria2(links: LinkItem[], inputConfig: Aria2Config): Promise<PushOutcome> {
  if (!links.length) {
    return { succeeded: 0, failed: [] }
  }

  const config = normalizeConfig(inputConfig)

  try {
    return await pushViaMulticall(links, config)
  } catch (error) {
    console.warn('[Links Hero] multicall failed, fallback to sequential', error)
    return await pushSequentially(links, config)
  }
}

