# Links Hero

English README: [`README.md`](./README.md)

一个 Chrome 扩展：扫描当前页面下载链接，批量筛选后推送到 aria2。

## 当前功能

- 自动扫描当前标签页中的 `magnet:`、`.torrent` 和疑似下载型 HTTP/HTTPS 链接
- 支持站点规则（内置常见站点规则 + 通用规则），并支持“列表页跟进详情页”抓取
- 支持多帧扫描、去重、全选/全不选、复制、导出 `.txt`、从剪贴板导入
- 支持按关键词（包含/排除）、链接类型（磁链/种子/直链）、标题排序进行过滤
- 支持右键菜单发起扫描，并在独立结果页 `results.html` 查看和二次处理
- 支持将选中链接推送到 aria2 JSON-RPC（优先 `system.multicall`，失败回退单条）
- 支持中英文界面（`auto` / `zh_CN` / `en`）

## 使用方式

- 点击扩展图标：在侧边栏打开主界面并自动扫描当前页
- 页面右键菜单：`Links Hero：查找当前页面有效链接`，扫描后打开结果页
- 配置页：设置 aria2 RPC 地址、Token、下载目录、语言等

> 首次访问某站点可能需要授权 host 权限，按提示允许即可。

## 开发与构建

```bash
npm install
npm run dev        # Vite dev（前端页面调试）
npm run typecheck  # TypeScript 检查
npm run test       # Vitest 单元测试
npm run test:e2e   # Playwright E2E
npm run build      # 生成 dist/
```

构建后在 `chrome://extensions` 开启开发者模式，选择“加载已解压的扩展程序”，指向 `dist/`。

## 项目结构

- `src/background`：Service Worker（消息分发、aria2 推送、右键菜单、侧边栏行为）
- `src/content`：内容脚本与扫描引擎（规则匹配、提取、去重、详情页跟进）
- `src/popup`：侧边栏主 UI（扫描、过滤、批量操作）
- `src/results`：右键扫描后的结果页 UI
- `src/options`：配置页（aria2、语言、规则展示）
- `src/shared`：通用类型、存储、i18n、消息、工具函数
- `public/manifest.json`：扩展清单与权限声明

## 存储说明

- 配置使用 `chrome.storage.sync`（如 aria2、站点规则、语言）
- 临时扫描结果（用于结果页）使用 `chrome.storage.session`
