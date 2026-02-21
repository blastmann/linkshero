import { describe, expect, it, vi } from 'vitest'
import type { LinkItem } from '../../src/shared/types'
import { CONTEXT_MENU_ID, ensureContextMenu, runScanFromContextMenu } from '../../src/background/context-menu'
import { STORAGE_KEYS } from '../../src/shared/constants'

function createChromeMock() {
  const contextMenus = {
    removeAll: vi.fn((cb: () => void) => cb()),
    create: vi.fn(),
    onClicked: { addListener: vi.fn() }
  }

  const runtime = { getURL: vi.fn((p: string) => `chrome-extension://id/${p}`) }
  const tabs = { create: vi.fn().mockResolvedValue(undefined) }
  const storage = { session: { set: vi.fn().mockResolvedValue(undefined) } }
  const notifications = { create: vi.fn() }

  return { contextMenus, runtime, tabs, storage, notifications }
}

describe('background context menu', () => {
  it('ensureContextMenu creates the menu item', async () => {
    const chromeMock = createChromeMock()
    ensureContextMenu({ chrome: chromeMock as any })
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(chromeMock.contextMenus.removeAll).toHaveBeenCalledTimes(1)
    expect(chromeMock.contextMenus.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: CONTEXT_MENU_ID })
    )
  })

  it('runScanFromContextMenu stores results in session and opens results.html', async () => {
    const chromeMock = createChromeMock()

    const links: LinkItem[] = [
      { id: '1', url: 'magnet:?a', title: 'A', sourceHost: 'example.com' },
      { id: '2', url: 'magnet:?b', title: 'B', sourceHost: 'example.com' }
    ]

    await runScanFromContextMenu(10, 'https://example.com/', {
      chrome: chromeMock as any,
      isInjectableUrlFn: () => true,
      getSiteRulesFn: vi.fn().mockResolvedValue([]),
      injectScannerFn: vi.fn().mockResolvedValue(undefined),
      requestScanFn: vi.fn().mockResolvedValue(links)
    })

    expect(chromeMock.storage.session.set).toHaveBeenCalledTimes(1)
    expect(chromeMock.storage.session.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [STORAGE_KEYS.lastScanResult]: expect.objectContaining({
          tabId: 10,
          tabUrl: 'https://example.com/',
          count: 2
        })
      })
    )
    expect(chromeMock.tabs.create).toHaveBeenCalledWith({
      url: 'chrome-extension://id/results.html'
    })
  })
})

