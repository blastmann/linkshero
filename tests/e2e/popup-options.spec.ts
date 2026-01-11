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
  await page.goto(`${baseUrl}/popup.html`)
  await expect(page.getByText('Links Hero')).toBeVisible()
  // In non-extension context, popup should show a friendly error message.
  await expect(page.getByText('请在扩展环境中打开 Popup')).toBeVisible()
})

test('options.html renders without crashing in non-extension context', async ({ page }) => {
  await page.goto(`${baseUrl}/options.html`)
  await expect(page.getByText('Links Hero 设置')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'aria2 配置' })).toBeVisible()
})

test.afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()))
})

