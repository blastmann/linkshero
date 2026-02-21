import { LLM_AGGREGATE_MESSAGE, PUSH_MESSAGE } from '../shared/messages'
import type { LlmAggregateMessage, PushMessage } from '../shared/messages'
import { pushLinksToAria2 } from '../shared/rpc'
import { aggregateLinksWithLlm } from './llm'
import { ensureContextMenu, handleContextMenuClick } from './context-menu'

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu()
})

handleContextMenuClick()

const canUseSidePanel =
  typeof chrome.sidePanel !== 'undefined' &&
  typeof chrome.sidePanel.setPanelBehavior === 'function' &&
  typeof chrome.sidePanel.open === 'function'

if (canUseSidePanel) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(error => console.warn('[Links Hero] failed to enable side panel action behavior', error))

  chrome.action.onClicked.addListener(tab => {
    if (typeof tab.windowId !== 'number') {
      return
    }
    chrome.sidePanel
      .open({ windowId: tab.windowId })
      .catch(error => console.warn('[Links Hero] failed to open side panel from action click', error))
  })
} else {
  console.warn('[Links Hero] sidePanel API unavailable in current browser runtime')
}

chrome.runtime.onMessage.addListener(
  (message: PushMessage | LlmAggregateMessage, _sender, sendResponse) => {
    if (message?.type === PUSH_MESSAGE) {
      pushLinksToAria2(message.payload.links, message.payload.config)
        .then(result => sendResponse({ ok: true, result }))
        .catch(error =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
        )
      return true
    }

    if (message?.type === LLM_AGGREGATE_MESSAGE) {
      aggregateLinksWithLlm(message.payload.links, message.payload.context)
        .then(result => sendResponse(result))
        .catch(error =>
          sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
        )
      return true
    }

    return undefined
  }
)

