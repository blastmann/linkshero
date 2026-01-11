import { describe, expect, it, vi } from 'vitest'
import type { LinkItem, SiteRuleDefinition } from '../../src/shared/types'
import { requestScan } from '../../src/shared/scan-trigger'

function makeDeps() {
  const runtime = {
    getURL: vi.fn().mockReturnValue('chrome-extension://id/content.js'),
    lastError: null as null | { message?: string }
  }

  const tabs = {
    query: vi.fn(),
    sendMessage: vi.fn()
  }

  const scripting = {
    executeScript: vi.fn()
  }

  const webNavigation = {
    getAllFrames: vi.fn()
  }

  return { runtime, tabs, scripting, webNavigation }
}

describe('scan-trigger.requestScan', () => {
  it('dedupes links across frames by url', async () => {
    const deps = makeDeps()
    deps.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }, { frameId: 2 }])

    const links: LinkItem[] = [
      { id: '1', url: 'magnet:?a', title: 'A', sourceHost: 'example.com' },
      { id: '2', url: 'magnet:?a', title: 'A2', sourceHost: 'example.com' }
    ]

    deps.tabs.sendMessage.mockImplementation((_tabId, _msg, options, cb) => {
      deps.runtime.lastError = null
      if (options.frameId === 0) cb({ success: true, links: [links[0]] })
      else cb({ success: true, links: [links[1]] })
    })

    const rules: SiteRuleDefinition[] = []
    const result = await requestScan(123, rules, deps as any)
    expect(result).toHaveLength(1)
    expect(result[0].url).toBe('magnet:?a')
  })

  it('re-injects and retries when receiving end does not exist', async () => {
    const deps = makeDeps()
    deps.webNavigation.getAllFrames.mockResolvedValue([{ frameId: 0 }])

    let callCount = 0
    deps.tabs.sendMessage.mockImplementation((_tabId, _msg, _options, cb) => {
      callCount += 1
      if (callCount === 1) {
        deps.runtime.lastError = { message: 'Receiving end does not exist.' }
        cb(undefined)
        return
      }
      deps.runtime.lastError = null
      cb({
        success: true,
        links: [{ id: '1', url: 'magnet:?a', title: 'A', sourceHost: 'example.com' }]
      })
    })

    deps.scripting.executeScript.mockImplementation((_details, cb) => {
      deps.runtime.lastError = null
      cb?.([])
    })

    const result = await requestScan(123, [], deps as any)
    expect(result).toHaveLength(1)
    expect(deps.scripting.executeScript).toHaveBeenCalledTimes(1)
  })
})

