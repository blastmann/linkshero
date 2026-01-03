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

- `src/popup`：Popup UI（打开即自动扫描）
- `src/options`：插件配置页（aria2、模板）
- `src/content`：扫描脚本（按需注入）
- `src/background`：Service Worker，负责 aria2 RPC
- `src/shared`：跨端通用类型与工具

## 配置

点击 Popup 右上角“打开配置页”或在扩展详情页进入 Options，可设置 aria2 RPC 地址、token、下载目录以及站点模板；所有配置保存在 `chrome.storage.sync`。

