# Links Hero

Chrome 扩展，按照 `SPEC.md` 的 MVP 要求实现以下功能：

- 扫描当前页面的 `magnet:`、`.torrent` 以及 HTTP/HTTPS 下载链接
- 去重并展示列表，支持全选/反选
- 复制或导出所选链接
- 将所选链接通过 aria2 JSON-RPC (`system.multicall` 优先) 推送

## 开发

```bash
npm install
npm run dev   # 仅调试 Popup UI
npm run build # 生成 dist/，在 Chrome 中以“加载已解压扩展”方式导入
```

## 目录

- `src/popup`：Popup UI 入口
- `src/content`：扫描脚本（按需注入）
- `src/background`：Service Worker，负责 aria2 RPC
- `src/shared`：跨端通用类型与工具

## 配置

Popup 中可设置 aria2 RPC 地址（默认 `http://127.0.0.1:6800/jsonrpc`）与 token，设置保存在 `chrome.storage.sync`。

