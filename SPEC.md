# Links Hero (下载链接收集器 + aria2下载调用插件)

我希望从零开始实现一个辅助下载的Chrome插件。

## 1) MVP 功能清单（按优先级）

### P0（必须有：一周内可做出可用版本）

1. **当前页扫描器**

   * 扫描 `a[href^="magnet:"]`、`a[href$=".torrent"]`、以及可选的普通下载链接（HTTP/HTTPS）
   * 去重（按 href 去重）
   * 结果列表展示：标题（可从链接文本/同一行提取）、URL、来源页面域名

2. **结果选择与批量操作**

   * 全选/全不选
   * 复制所选到剪贴板（纯文本，每行一个链接）
   * 导出所选为 `.txt`（可选）

3. **aria2 推送（JSON-RPC）**

   * 配置 aria2 RPC URL（默认 `http://127.0.0.1:6800/jsonrpc` 或用户自填）
   * 可选：RPC token（`token:xxxx`）
   * 批量添加：优先用 `system.multicall`，失败则逐个 `aria2.addUri`
   * 推送结果反馈：成功/失败数量、失败原因简要（网络错误/认证失败/aria2 返回错误）

4. **最小化权限 + 用户可控**

   * 默认只在用户点击扩展按钮时对当前页面执行扫描（`activeTab` + `scripting`）
   * 站点增强（注入 checkbox）放到 P1，避免一开始就要全站内容脚本权限

---

### P1（强差异化：你说的“列表页难批量”）

5. **页面内“任务篮子”浮层（注入 UI）**

   * 在列表页每行注入 checkbox（或在行首加小图标）
   * 支持：shift 连选、全选本页、反选
   * 一键“加入篮子”，篮子里显示已选条目数

6. **站点规则/模板（让通用真正可用）**

   * 允许用户为某个站点保存“行选择器、链接选择器、标题选择器”等规则
   * 允许导入/导出模板 JSON（便于分享）

---

### P2（锦上添花）

7. **过滤与整理**

   * 关键词包含/排除
   * 按标题/大小排序（前提是站点能提到大小字段）

8. **分组推送**

   * 支持设置 aria2 options：`dir`、`out`、`header`、`max-connection-per-server` 等（先做最常用 `dir` 就够）

---

## 2) Manifest v3 权限最小化建议

### 推荐的最小权限集合

* `permissions`：

  * `"scripting"`：点击按钮后对当前 tab 注入脚本扫描 DOM
  * `"activeTab"`：允许在用户触发时访问当前页面
  * `"storage"`：保存 aria2 RPC 配置、站点模板
  * （可选）`"clipboardWrite"`：如果你用 `navigator.clipboard.writeText` 可能不需要额外权限，但在一些场景下加上更稳
  * （可选）`"downloads"`：如果你要导出 .txt 文件（也可用 `Blob + <a download>` 规避）

* `host_permissions`（**尽量不要写 `<all_urls>`**）：

  * **不写或只写你需要访问的 aria2 endpoint**，比如：

    * `"http://127.0.0.1:6800/*"`
    * `"http://localhost:6800/*"`
  * 如果用户可能填远程 aria2（内网 NAS），建议用：

    * `optional_host_permissions`: `["http://*/*", "https://*/*"]`
    * 在用户首次保存远程地址时调用 `chrome.permissions.request` 让用户显式授权

### 你最应该避免的

* 一上来就申请 `<all_urls>` + 常驻 content_scripts（审核和用户信任都会更难）
* 后台静默抓取“浏览历史/页面内容”并上报（高风险）

---

## 3) 推荐架构（实现起来简单且审核友好）

1. **Popup（扩展按钮弹窗）**

   * “扫描当前页”
   * 结果列表 + 选择
   * “复制 / 导出 / 推送 aria2”
   * “站点模板：启用/编辑”

2. **Service Worker（后台）**

   * 负责 aria2 JSON-RPC 请求
   * 负责持久化 storage（配置/模板）
   * 可选：context menu（“发送所选链接到 aria2”）

3. **Content Script（仅在用户触发/模板启用时注入）**

   * DOM 扫描、模板解析
   * P1 的 checkbox 注入和交互

---

## 4) aria2 JSON-RPC 调用要点（批量最好用 multicall）

* 单个添加（概念）：

  * `aria2.addUri`，参数：`[ [uri1, uri2], options ]`
* 批量添加（推荐）：

  * `system.multicall`，每个 call 都是 `aria2.addUri`

**token 处理**：aria2 常见写法是把 token 放在 params 的第一个参数：`"token:YOURTOKEN"`（而不是 header）。

你 MVP 可以这样做：

* 如果有 token：每个 method 调用 params 里第一个元素加 `"token:xxx"`
* 没有 token：params 直接是 `[uris, options]`

---

## 5) 站点规则/模板数据结构（JSON Schema 设计）

目标：用同一套模板支持“列表行 + 字段提取 + 链接提取”。

### 模板对象（建议）

```json
{
  "id": "template_001",
  "name": "Generic Table List",
  "enabled": true,
  "match": {
    "hostSuffix": ["example.com"],
    "pathRegex": ".*"
  },
  "mode": "row", 
  "selectors": {
    "row": "table tr",
    "link": "a[href^='magnet:'], a[href$='.torrent']",
    "title": "a[href^='magnet:'], a[href$='.torrent']",
    "size": ".size",
    "seed": ".seed",
    "leech": ".leech"
  },
  "extract": {
    "linkAttr": "href",
    "titleSource": "text",
    "titleFallback": "rowText",
    "trim": true
  },
  "post": {
    "dedupeBy": "link",
    "normalizeMagnet": true
  }
}
```

### 字段解释

* `match`：决定模板对哪些页面生效（host/path）
* `mode`：

  * `"page"`：只扫全页链接（P0）
  * `"row"`：按行结构化提取（P1）
* `selectors.row`：列表行的根节点
* `selectors.link`：在 row 内找链接（magnet/torrent）
* `selectors.title`：标题字段（可与 link 相同）
* `extract.titleSource`：

  * `"text"`：取 `textContent`
  * `"attr"`：取属性（那就配 `titleAttr`）
* `titleFallback`：找不到 title 时用整行文本
* `post.normalizeMagnet`：可选，把 magnet 里多余参数排序/清理，便于去重

> MVP 里你可以先只支持 `row/link/title` 三个选择器，其它字段先留着不实现。

---

## 6) “列表页批量化体验”交互清单（P1 的核心差异）

1. 行首插入 checkbox（不破坏原站点点击逻辑）
2. 支持快捷选择：

   * 单击：切换当前行
   * Shift+单击：范围选择
   * Ctrl/Cmd+单击：多选
3. 顶部工具条：

   * 已选数量
   * 全选/清空
   * 加入篮子 / 从篮子移除
   * 推送 aria2

---

## 7) Chrome Web Store 上架文案与合规清单（避免踩雷）

**描述定位**（建议关键词）：

* “链接收集器 / 下载任务整理 / 与 aria2 集成 / 批量导出”
* 举例使用场景用中性合法内容：

  * “开源镜像、Linux ISO、大文件列表页、资源目录页”

**必须准备**：

* 隐私说明：

  * 如果你不上传任何数据：明确写“所有处理在本地完成，不收集浏览历史/不上传页面内容”
  * 如果你要做模板分享/云同步：那就必须有隐私政策、数据收集披露（能不做先别做）

**权限解释**：

* 为什么需要 `activeTab`/`scripting`（仅在用户点击扫描时读取当前页 DOM）
* 为什么需要访问 aria2 URL（发送下载任务）

---

## 8) 测试清单（上线前 30 分钟自测就能过大半坑）

1. 扫描不同页面类型：

   * 简单页面（少量 magnet）
   * 长列表（上百条 magnet）
   * 动态加载（滚动加载后再扫描）
2. 去重与标题提取：

   * 同一 magnet 多处出现
   * 链接文本为空、title 在同一行其它节点里
3. aria2 推送：

   * 无 token / 有 token
   * aria2 关闭（连接失败提示）
   * token 错误（认证失败提示）
4. 权限：

   * 首次使用是否只在当前页生效
   * 可选 host 权限请求逻辑是否正确（如果你做了）

---

## 9) 你现在可以直接开工的最小交付物（建议顺序）

1. MVP：**Popup 扫描当前页 + 列表 + 复制/导出**
2. 加上：**Service Worker 调 aria2 JSON-RPC**
3. 再加：**模板系统（只做 host/path + row/link/title）**
4. 最后：**页面内 checkbox 注入（P1）**

## 10) 技术栈

1. 使用 TypeScript + Vite

## 11) 开始前必须做的事

1. 必须先初始化管理好我的git仓库，如（README.md、.gitignore等）
