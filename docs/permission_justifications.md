# Chrome Web Store 權限使用說明 (Permission Justifications)

請將以下內容填寫至 Chrome Web Store 開發者儀表板的「隱私權實務規範」(Privacy practices) > 「權限理由」(Justification for permissions) 欄位中。

### activeTab
**理由**: 當使用者點擊擴充功能圖示時，需要此權限來暫時存取當前標籤頁，以便掃描頁面中的下載連結。
**Justification**: Used to grant temporary access to the current tab when the user clicks the extension icon, allowing the extension to scan for download links on the active page without requiring broad host permissions.

### contextMenus
**理由**: 用於在網頁右鍵選單中添加「發送選取連結到 Aria2」或「掃描此頁面」的快捷選項。
**Justification**: Used to add items to the browser's context menu, enabling users to quickly scan the current page or send selected links to Aria2 via right-click actions.

### notifications
**理由**: 當推送到 Aria2 的任務成功或失敗時，使用通知向使用者提供即時反饋。
**Justification**: Used to provide immediate feedback to the user via system notifications when a download task is successfully sent to Aria2 or if a connection error occurs.

### scripting
**理由**: 用於將內容腳本 (content script) 動態注入到當前標籤頁及其子框架 (iframes) 中，以解析和提取下載連結。
**Justification**: Used to dynamically inject the content scanner script into the active tab and its frames to identify and extract download links from the DOM.

### storage
**理由**: 用於在本地保存使用者的偏好設定，包括 Aria2 RPC 地址、下載目錄設定以及網站掃描模板。
**Justification**: Used to locally store user preferences, including Aria2 RPC configuration, download directory settings, and custom site scanning templates.

### tabs
**理由**: 需要此權限來獲取當前活動標籤頁的 ID，以便與該標籤頁建立通訊並執行掃描腳本。
**Justification**: Required to retrieve the ID of the active tab to establish communication channels and execute the link release scanning script within that specific tab.

### webNavigation
**理由**: 用於獲取當前頁面中所有框架 (frames) 的資訊，確保能夠掃描到嵌套在 iframe 中的下載連結。
**Justification**: Used to retrieve information about all frames within the current page, ensuring that download links located inside nested iframes are also detected and scanned.

### Single Purpose (單一用途)
**說明**: Links Hero 是一個專注於「大量下載連結管理」的工具。它的核心且唯一目的是協助使用者從網頁中掃描、篩選並提取下載連結（如 Magnet、Torrent、ISO），並將其批次傳送至 Aria2 下載器。我們不提供其他與此核心目的無關的功能。
**Justification**: Links Hero is a dedicated tool for 'bulk download link management'. Its single and core purpose is to help users scan, filter, and extract download links (e.g., Magnet, Torrent, ISO) from web pages and batch send them to the Aria2 downloader. We do not provide features unrelated to this core purpose.

### Site Access / Host Permissions (網站存取權限)
**理由 (針對 localhost/127.0.0.1)**: 本擴充功能需要存取 \http://localhost:6800/*\ 和 \http://127.0.0.1:6800/*\，這是 Aria2 下載器預設的 JSON-RPC 介面地址。擴充功能必須能連線至此網址，才能將使用者選取的下載任務指令傳送給 Aria2 程式執行。
**Justification**: The extension requires access to \http://localhost:6800/*\ and \http://127.0.0.1:6800/*\, which are the default JSON-RPC interface addresses for the Aria2 downloader. Access to these URLs is essential for sending download task instructions from the extension to the user's local Aria2 instance.

### Remote Code (遠端程式碼)
**注意**: Manifest V3 通常禁止使用遠端程式碼。如果您在審核表單中看到了此問題，請先確認您是否在「是否使用遠端程式碼」選項中勾選了「否」。如果您必須填寫，請使用以下說明：
**說明**: 本擴充功能**不使用**任何遠端託管的程式碼 (Remote Hosted Code)。所有的邏輯腳本都已打包在擴充功能內部。我們僅透過標準的 \etch\ API 呼叫使用者設定的 Aria2 JSON-RPC 介面，這屬於資料傳輸而非程式碼執行。
**Justification**: This extension does **NOT** use any remote hosted code. All logic scripts are bundled within the extension package. We only perform standard \etch\ API calls to the user-configured Aria2 JSON-RPC interface, which constitutes data transmission, not remote code execution.

