/**
 * URL builder helpers for Chatbase and Airtable APIs.
 * Centralises endpoint construction so route files stay clean.
 */

import { CHATBASE_API_BASE, AIRTABLE_BASE_ID } from './constants';

// ── Chatbase ──────────────────────────────────────────────────────────────────

export function chatbaseConversationsUrl(chatbotId: string, cursor?: string): string {
  const params = new URLSearchParams({ chatbotId, size: '50' });
  if (cursor) params.set('cursor', cursor);
  return `${CHATBASE_API_BASE}/conversations?${params.toString()}`;
}

export function chatbaseMessagesUrl(conversationId: string, cursor?: string): string {
  const params = new URLSearchParams({ size: '100' });
  if (cursor) params.set('cursor', cursor);
  return `${CHATBASE_API_BASE}/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`;
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
