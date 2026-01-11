import { expect, test } from '@playwright/test'
import http from 'node:http'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

let server: http.Server | undefined
let baseUrl = ''

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

test.afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()))
})

