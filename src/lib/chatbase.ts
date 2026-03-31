/**
 * Typed Chatbase API client.
 * All functions throw a ChatbaseError on non-2xx responses.
 */

import {
  chatbaseConversationsUrl,
  chatbaseMessagesUrl,
  chatbaseFeedbackUrl,
  chatbaseChatbotUrl,
} from './url';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChatbaseConversation {
  id: string;
  chatbotId: string;
  createdAt: string;
  updatedAt: string;
  customerEmail?: string | null;
  messageCount?: number;
}

export interface ChatbaseConversationsPage {
  data: ChatbaseConversation[];
  nextCursor?: string | null;
}

export interface ChatbaseMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  feedback?: 'positive' | 'negative' | null;
  createdAt: string;
}

export interface ChatbaseMessagesPage {
  data: ChatbaseMessage[];
  nextCursor?: string | null;
}

export interface ChatbaseFeedbackPayload {
  feedback: 'positive' | 'negative' | null;
}

export interface ChatbotUpdatePayload {
  sourceText?: string;
  instructions?: string;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class ChatbaseError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'ChatbaseError';
  }
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function chatbaseFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const apiKey = process.env.CHATBASE_API_KEY;
  if (!apiKey) throw new ChatbaseError('CHATBASE_API_KEY not configured', 500, '');

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new ChatbaseError(
      `Chatbase API error ${res.status}: ${text}`,
      res.status,
      text,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ChatbaseError('Failed to parse Chatbase response as JSON', 500, text);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch a single page of conversations for a chatbot.
 */
export async function fetchConversationsPage(
  chatbotId: string,
  cursor?: string,
): Promise<ChatbaseConversationsPage> {
  const url = chatbaseConversationsUrl(chatbotId, cursor);
  return chatbaseFetch<ChatbaseConversationsPage>(url);
}

/**
 * Fetch ALL conversations for a chatbot, following cursor pagination.
 */
export async function fetchAllConversations(
  chatbotId: string,
): Promise<ChatbaseConversation[]> {
  const all: ChatbaseConversation[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchConversationsPage(chatbotId, cursor);
    all.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return all;
}

/**
 * Fetch a single page of messages for a conversation.
 */
export async function fetchMessagesPage(
  conversationId: string,
  cursor?: string,
): Promise<ChatbaseMessagesPage> {
  const url = chatbaseMessagesUrl(conversationId, cursor);
  return chatbaseFetch<ChatbaseMessagesPage>(url);
}

/**
 * Fetch ALL messages for a conversation, following cursor pagination.
 */
export async function fetchAllMessages(
  conversationId: string,
): Promise<ChatbaseMessage[]> {
  const all: ChatbaseMessage[] = [];
  let cursor: string | undefined;

  do {
    const page = await fetchMessagesPage(conversationId, cursor);
    all.push(...page.data);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return all;
}

/**
 * PATCH feedback on a specific message.
 */
export async function patchMessageFeedback(
  conversationId: string,
  messageId: string,
  feedback: 'positive' | 'negative' | null,
): Promise<void> {
  const url = chatbaseFeedbackUrl(conversationId, messageId);
  const payload: ChatbaseFeedbackPayload = { feedback };
  await chatbaseFetch<unknown>(url, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH chatbot instructions and/or source text.
 */
export async function updateChatbot(
  chatbotId: string,
  payload: ChatbotUpdatePayload,
): Promise<void> {
  const url = chatbaseChatbotUrl(chatbotId);
  await chatbaseFetch<unknown>(url, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
