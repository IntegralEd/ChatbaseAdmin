/**
 * URL builder helpers for Chatbase and Airtable APIs.
 * Centralises endpoint construction so route files stay clean.
 */

import { CHATBASE_API_BASE, AIRTABLE_BASE_ID } from './constants';

// ── Chatbase ──────────────────────────────────────────────────────────────────

// API uses page-based pagination (page=1,2,...), not cursor-based.
// Messages are embedded in each conversation — no separate messages endpoint needed.
export function chatbaseConversationsUrl(chatbotId: string, page = 1): string {
  const params = new URLSearchParams({ chatbotId, size: '100', page: String(page) });
  return `${CHATBASE_API_BASE}/get-conversations?${params.toString()}`;
}

export function chatbaseFeedbackUrl(conversationId: string, messageId: string): string {
  return `${CHATBASE_API_BASE}/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/feedback`;
}

export function chatbaseChatbotUrl(chatbotId: string): string {
  return `${CHATBASE_API_BASE}/chatbot/${encodeURIComponent(chatbotId)}`;
}

// ── Airtable ──────────────────────────────────────────────────────────────────

const AIRTABLE_BASE = 'https://api.airtable.com/v0';

export function airtableTableUrl(tableId: string, recordId?: string): string {
  const base = `${AIRTABLE_BASE}/${AIRTABLE_BASE_ID}/${tableId}`;
  return recordId ? `${base}/${encodeURIComponent(recordId)}` : base;
}

export function airtableListUrl(
  tableId: string,
  params: Record<string, string> = {},
): string {
  const searchParams = new URLSearchParams(params);
  const qs = searchParams.toString();
  return `${AIRTABLE_BASE}/${AIRTABLE_BASE_ID}/${tableId}${qs ? `?${qs}` : ''}`;
}

export function airtableUpsertUrl(tableId: string): string {
  return `${AIRTABLE_BASE}/${AIRTABLE_BASE_ID}/${tableId}`;
}
