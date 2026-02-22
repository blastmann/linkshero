# Links Hero

中文说明：[`README.zh-CN.md`](./README.zh-CN.md)

A Chrome extension that scans downloadable links on the current page, lets you filter in batch, and pushes selected links to aria2.

## Features

- Automatically scans `magnet:`, `.torrent`, and likely-download HTTP/HTTPS links from the active tab
- Supports site rules (built-in presets + generic rule), including "list page -> detail page" follow-up scanning
- Supports multi-frame scanning, deduplication, select all/none, copy, export `.txt`, and clipboard import
- Supports filtering by keywords (include/exclude), link type (magnet/torrent/http), and title sorting
- Supports right-click context menu scan and reviewing results in standalone `results.html`
- Supports pushing selected links to aria2 JSON-RPC (prefers `system.multicall`, falls back to single calls)
- Supports bilingual UI (`auto` / `zh_CN` / `en`)

## Usage

- Click extension action: opens the main UI in Side Panel and auto-scans current page
- Right-click page menu: `Links Hero: Find valid links on current page`, then opens results page
- Options page: configure aria2 RPC endpoint, token, download directory, language, etc.

> On first visit to a site, host permission may be required. Allow it when prompted.

## Development & Build

```bash
npm install
npm run dev        # Vite dev (UI debugging)
npm run typecheck  # TypeScript checks
npm run test       # Vitest unit tests
npm run test:e2e   # Playwright E2E tests
npm run build      # build into dist/
```

After build, open `chrome://extensions`, enable Developer mode, click "Load unpacked", and select `dist/`.

## Project Structure

- `src/background`: service worker (message routing, aria2 push, context menu, side panel behavior)
- `src/content`: content script and scanning engine (rule matching, extraction, dedupe, follow-up fetch)
- `src/popup`: side panel main UI (scan, filters, batch actions)
- `src/results`: result page UI for context-menu-triggered scans
- `src/options`: options page (aria2, language, rule display)
- `src/shared`: shared types, storage, i18n, message contracts, utilities
- `public/manifest.json`: extension manifest and permissions

## Storage

- Persistent config uses `chrome.storage.sync` (aria2 config, site rules, language, etc.)
- Temporary scan result for results page uses `chrome.storage.session`

