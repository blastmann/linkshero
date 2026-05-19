import { expect, type Page, test } from '@playwright/test'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

let server: http.Server | undefined
let baseUrl = ''

async function mockChromeI18n(page: Page) {
  await page.addInitScript(() => {
    const messages: Record<string, string> = {
      actionTitle: 'Links Hero',
      popupErrorEnv: '请在扩展环境中打开 Popup',
      optTitle: 'Links Hero 设置',
      optDesc: '管理 aria2 配置。',
      optLoading: '加载中...',
      sectAria: 'aria2 配置',
      lblRpc: 'RPC 地址',
      lblToken: 'Token（可选）',
      lblDir: '下载目录（可选）',
      btnSave: '保存配置',
      btnSaving: '保存中...',
      sectRules: '站点规则（用于扫描）',
      noRules: '暂无站点规则，将使用通用扫描规则。'
    }

    ;(window as any).chrome = {
      i18n: {
        getMessage: (key: string, substitutions?: string | string[]) => {
          const values = Array.isArray(substitutions)
            ? substitutions
            : substitutions
              ? [substitutions]
              : []
          return (messages[key] ?? key).replace(/\$(\d+)/g, (_, index) => values[Number(index) - 1] ?? '')
        },
        getUILanguage: () => 'zh_CN'
      }
    }
  })
}

async function mockPopupChrome(page: Page) {
  await page.addInitScript(() => {
    const messages: Record<string, string> = {
      actionTitle: 'Links Hero',
      popupScanning: '正在扫描当前页面...',
      scanSuccess: '已扫描 $1 条链接',
      scanSuccessToast: '已扫描 $1 条',
      headerLoading: '加载中...',
      headerCaptured: '已捕获 $1 条链接',
      btnSettings: '设置',
      btnRescan: '重新扫描',
      sectBatch: '批量操作',
      btnSelectAll: '全选',
      btnSelectNone: '全不选',
      btnCopy: '复制所选',
      btnImportClipboard: '从剪贴板导入',
      btnExport: '导出 .txt',
      btnPush: '推送 aria2',
      summaryStats: '显示 $1 / 共 $2 条，已选 $3 条（来源：$4）',
      sectFilter: '快速过滤',
      filterExpand: '展开',
      filterCollapse: '收起',
      kindMagnet: '磁链',
      kindTorrent: '种子',
      kindHttp: '直链',
      chipTitle: '$1：$2 条',
      filterHit: '命中 $1 / $2',
      sectList: '链接列表',
      listEmptyInit: '扫描后会在这里显示链接',
      listEmptyFilter: '没有链接符合当前过滤条件',
      copySuccess: '已复制 $1 条链接',
      copySuccessToast: '已复制 $1 条',
      copyFailed: '复制失败',
      pushing: '正在推送到 aria2...',
      pushSuccess: '已成功推送 $1 条链接',
      pushSuccessToast: '已推送 $1 条',
      pushPartial: '已推送 $1 条，失败 $2 条',
      pushPartialToast: '推送失败 $1 条，成功 $2 条',
      pushFailedGeneric: '推送失败'
    }
    const scanLinks = [
      { id: '1', url: 'magnet:?xt=urn:btih:aaa', title: 'AAA Magnet', sourceHost: 'example.com' },
      { id: '2', url: 'https://example.com/file.zip', title: 'BBB Http', sourceHost: 'example.com' }
    ]
    const storageListeners: Array<(changes: Record<string, unknown>, areaName: string) => void> = []

    ;(window as any).__copiedText = ''
    ;(window as any).__lastRuntimeMessage = null
    ;(window as any).__emitAria2ConfigChange = (config: unknown) => {
      storageListeners.forEach(listener =>
        listener({ 'linksHero.aria2Config': { newValue: config } }, 'sync')
      )
    }
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as any).__copiedText = text
        },
        readText: async () => ''
      }
    })

    ;(window as any).chrome = {
      i18n: {
        getMessage: (key: string, substitutions?: string | string[]) => {
          const values = Array.isArray(substitutions)
            ? substitutions
            : substitutions
              ? [substitutions]
              : []
          return (messages[key] ?? key).replace(/\$(\d+)/g, (_, index) => values[Number(index) - 1] ?? '')
        },
        getUILanguage: () => 'zh_CN'
      },
      runtime: {
        lastError: undefined,
        getURL: (path: string) => `/${path}`,
        sendMessage: (message: unknown, callback: (response: unknown) => void) => {
          ;(window as any).__lastRuntimeMessage = message
          const payload = (message as any)?.payload
          callback({ ok: true, result: { succeeded: payload?.links?.length ?? 0, failed: [] } })
        }
      },
      storage: {
        sync: {
          get: (_keys: unknown, callback: (result: Record<string, unknown>) => void) => callback({}),
          set: (_items: unknown, callback?: () => void) => callback?.()
        },
        onChanged: {
          addListener: (listener: (changes: Record<string, unknown>, areaName: string) => void) => {
            storageListeners.push(listener)
          },
          removeListener: (listener: (changes: Record<string, unknown>, areaName: string) => void) => {
            const index = storageListeners.indexOf(listener)
            if (index >= 0) {
              storageListeners.splice(index, 1)
            }
          }
        }
      },
      tabs: {
        query: (_query: unknown, callback: (tabs: unknown[]) => void) =>
          callback([{ id: 1, url: 'https://example.com/page' }]),
        sendMessage: (
          _tabId: number,
          _message: unknown,
          _options: unknown,
          callback: (response: unknown) => void
        ) => callback({ success: true, links: scanLinks }),
        onActivated: { addListener: () => undefined, removeListener: () => undefined },
        onUpdated: { addListener: () => undefined, removeListener: () => undefined }
      },
      scripting: {
        executeScript: (_details: unknown, callback: () => void) => callback()
      },
      webNavigation: {
        getAllFrames: async () => [{ frameId: 0 }]
      }
    }
  })
}

function contentType(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8'
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8'
  if (filePath.endsWith('.svg')) return 'image/svg+xml'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

test.beforeAll(async () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const distDir = path.resolve(here, '../../dist')

  server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0] || '/'
    const safePath = urlPath === '/' ? '/popup.html' : urlPath
    const filePath = path.resolve(distDir, `.${safePath}`)
    if (!filePath.startsWith(distDir)) {
      res.statusCode = 403
      res.end('Forbidden')
      return
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }
    res.statusCode = 200
    res.setHeader('Content-Type', contentType(filePath))
    res.end(fs.readFileSync(filePath))
  })

  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject)
    server!.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start http server')
  }
  baseUrl = `http://127.0.0.1:${address.port}`
})

test('popup.html renders without crashing in non-extension context', async ({ page }) => {
  await mockChromeI18n(page)

  await page.goto(`${baseUrl}/popup.html`)
  await expect(page.getByText('Links Hero')).toBeVisible()
  // In non-extension context, popup should show a friendly error message.
  await expect(page.getByText('请在扩展环境中打开 Popup')).toBeVisible()
})

test('options.html renders without crashing in non-extension context', async ({ page }) => {
  await mockChromeI18n(page)

  await page.goto(`${baseUrl}/options.html`)
  await expect(page.getByText('Links Hero 设置')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'aria2 配置' })).toBeVisible()
})

test('popup copy selected only copies links that match active filters', async ({ page }) => {
  await mockPopupChrome(page)

  await page.goto(`${baseUrl}/popup.html`)

  await expect(page.getByText('AAA Magnet', { exact: true })).toBeVisible()
  await expect(page.getByText('BBB Http', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /磁链/ }).click()

  await expect(page.getByText('AAA Magnet', { exact: true })).toBeVisible()
  await expect(page.getByText('BBB Http', { exact: true })).toBeHidden()

  await page.getByRole('button', { name: '复制所选' }).click()

  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText))
    .toBe('magnet:?xt=urn:btih:aaa')
})

test('popup uses updated aria2 endpoint from storage changes when pushing', async ({ page }) => {
  await mockPopupChrome(page)

  await page.goto(`${baseUrl}/popup.html`)

  await expect(page.getByText('AAA Magnet', { exact: true })).toBeVisible()

  await page.evaluate(() => {
    ;(window as any).__emitAria2ConfigChange({
      endpoint: 'http://192.168.1.10:6800/jsonrpc',
      token: 'secret',
      dir: 'D:\\Downloads'
    })
  })

  await expect(page.getByText(/aria2: http:\/\/192\.168\.1\.10:6800\/jsonrpc/)).toBeVisible()

  await page.getByRole('button', { name: '推送 aria2' }).click()

  await expect
    .poll(() =>
      page.evaluate(() => (window as any).__lastRuntimeMessage?.payload?.config?.endpoint)
    )
    .toBe('http://192.168.1.10:6800/jsonrpc')
})

test.afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()))
})

