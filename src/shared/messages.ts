import type { PushRequestPayload, SiteRuleDefinition, TemplateDefinition } from './types'

export const SCAN_MESSAGE = 'links-hero/scan'
export const PUSH_MESSAGE = 'links-hero/push'
export const APPLY_TEMPLATE_MESSAGE = 'links-hero/apply-template'
export const CLEAR_TEMPLATE_MESSAGE = 'links-hero/clear-template'
export const LLM_AGGREGATE_MESSAGE = 'links-hero/llm-aggregate'

export interface ScanMessage {
  type: typeof SCAN_MESSAGE
  rules?: SiteRuleDefinition[]
}

export interface PushMessage {
  type: typeof PUSH_MESSAGE
  payload: PushRequestPayload
}

export interface ApplyTemplateMessage {
  type: typeof APPLY_TEMPLATE_MESSAGE
  template: TemplateDefinition
}

export interface ClearTemplateMessage {
  type: typeof CLEAR_TEMPLATE_MESSAGE
}

export interface LlmAggregateMessage {
  type: typeof LLM_AGGREGATE_MESSAGE
  payload: {
    links: PushRequestPayload['links']
    context: { host: string; url: string }
  }
}

