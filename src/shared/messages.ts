import type { PushRequestPayload, SiteRuleDefinition } from './types'

export const SCAN_MESSAGE = 'links-hero/scan'
export const PUSH_MESSAGE = 'links-hero/push'
export const LLM_AGGREGATE_MESSAGE = 'links-hero/llm-aggregate'

export interface ScanMessage {
  type: typeof SCAN_MESSAGE
  rules?: SiteRuleDefinition[]
}

export interface PushMessage {
  type: typeof PUSH_MESSAGE
  payload: PushRequestPayload
}

export interface LlmAggregateMessage {
  type: typeof LLM_AGGREGATE_MESSAGE
  payload: {
    links: PushRequestPayload['links']
    context: { host: string; url: string }
  }
}

