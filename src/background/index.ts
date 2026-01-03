import { PUSH_MESSAGE } from '../shared/messages'
import type { PushMessage } from '../shared/messages'
import { pushLinksToAria2 } from '../shared/rpc'

chrome.runtime.onMessage.addListener((message: PushMessage, _sender, sendResponse) => {
  if (message?.type !== PUSH_MESSAGE) {
    return
  }

  pushLinksToAria2(message.payload.links, message.payload.config)
    .then(result => sendResponse({ ok: true, result }))
    .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }))

  return true
})

