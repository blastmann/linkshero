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
      resultsTitle: 'Links Hero 扫描结果',
      headerLoading: '加载中...',
      headerCaptured: '已捕获 $1 条链接',
      resultsLoaded: '已加载 $1 条链接',
      resultsEmpty: '没有扫描结果',
      resultsNoData: '没有数据',
      openConfig: '打开设置',
      sectBatch: '批量操作',
      btnSelectAll: '全选',
      btnSelectNone: '全不选',
      btnCopy: '复制所选',
      btnExport: '导出 .txt',
      btnPush: '推送 aria2',
      summaryStats: '显示 $1 / 共 $2 条，已选 $3 条（来源：$4）',
      sectFilter: '快速过滤',
      kindMagnet: '磁链',
      kindTorrent: '种子',
      kindHttp: '直链',
      filterHit: '命中 $1 / $2',
      inputInclude: '包含关键词（全部匹配）',
      inputPlaceholder: '输入后按 Enter',
      inputExclude: '排除关键词（任意匹配）',
      labelSort: '排序',
      sortDefault: '默认',
      sortAsc: '标题 A→Z',
      sortDesc: '标题 Z→A',
      btnClearFilter: '清除过滤',
      sectList: '链接列表',
      listEmptyFilter: '没有链接符合当前过滤条件',
      copySuccess: '已复制 $1 条链接',
      copySuccessToast: '已复制 $1 条',
      copyFailed: '复制失败',
      tagDelete: '删除关键词',
      tagInputHelper: 'Enter 添加关键词，逗号可批量添加'
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
    const safePath = urlPath === '/' ? '/results.html' : urlPath
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

test('results.html renders with injected test data (non-extension env)', async ({ page }) => {
  await mockChromeI18n(page)
  await page.addInitScript(() => {
    ;(window as any).__linksHeroTestData = {
      scanResult: {
        createdAt: 1,
        tabId: 1,
        tabUrl: 'https://example.com/',
        links: [{ id: '1', url: 'magnet:?xt=urn:btih:aaa', title: 'AAA', sourceHost: 'example.com' }]
      }
    }
  })

  await page.goto(`${baseUrl}/results.html`)

  await expect(page.getByText('Links Hero 扫描结果')).toBeVisible()
  await expect(page.getByText('AAA', { exact: true })).toBeVisible()
  await expect(page.getByText('magnet:?xt=urn:btih:aaa', { exact: true })).toBeVisible()
})

test('copy selected only copies links that match active filters', async ({ page }) => {
  await mockChromeI18n(page)
  await page.addInitScript(() => {
    ;(window as any).__copiedText = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          ;(window as any).__copiedText = text
        }
      }
    })
    ;(window as any).__linksHeroTestData = {
      scanResult: {
        createdAt: 1,
        tabId: 1,
        tabUrl: 'https://example.com/',
        links: [
          { id: '1', url: 'magnet:?xt=urn:btih:aaa', title: 'AAA Release', sourceHost: 'example.com' },
          { id: '2', url: 'magnet:?xt=urn:btih:bbb', title: 'BBB Release', sourceHost: 'example.com' }
        ]
      }
    }
  })

  await page.goto(`${baseUrl}/results.html`)

  await page
    .locator('.tag-input')
    .filter({ hasText: '包含关键词（全部匹配）' })
    .locator('input')
    .fill('AAA')
  await page.keyboard.press('Enter')

  await expect(page.getByText('AAA Release', { exact: true })).toBeVisible()
  await expect(page.getByText('BBB Release', { exact: true })).toBeHidden()

  await page.getByRole('button', { name: '复制所选' }).click()

  await expect
    .poll(() => page.evaluate(() => (window as any).__copiedText))
    .toBe('magnet:?xt=urn:btih:aaa')
})

test.afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()))
})

