import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function loadThemeCss(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const themePath = path.resolve(here, '../../src/shared/theme.css')
  return fs.readFileSync(themePath, 'utf-8')
}

async function getCssVar(page: import('@playwright/test').Page, name: string) {
  return page.evaluate(varName => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName)
    return value.trim()
  }, name)
}

test('theme.css switches tokens between light and dark color schemes', async ({ page }) => {
  const css = loadThemeCss()

  await page.setContent(`<html><head><style>${css}</style></head><body>ok</body></html>`)

  await page.emulateMedia({ colorScheme: 'light' })
  const lightBg = await getCssVar(page, '--bg')
  const lightText = await getCssVar(page, '--text')

  await page.emulateMedia({ colorScheme: 'dark' })
  const darkBg = await getCssVar(page, '--bg')
  const darkText = await getCssVar(page, '--text')

  expect(lightBg).not.toBe(darkBg)
  expect(lightText).not.toBe(darkText)
})

