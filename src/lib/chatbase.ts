/**
 * Typed Chatbase API client.
 * All functions throw a ChatbaseError on non-2xx responses.
 */

import {
  chatbaseConversationsUrl,
} from './url';

const CHATBASE_API_BASE = 'https://www.chatbase.co/api/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

// Messages are embedded in each conversation from get-conversations.
// Only assistant messages consistently lack an id.
export interface ChatbaseEmbeddedMessage {
  id?: string;
  role: 'user' | 'assistant';
  type?: string;
  content: string;
  createdAt?: string;
  score?: number;
  source?: string;
}

export interface ChatbaseConversation {
  id: string;
  created_at: string;       // snake_case in current API
  last_message_at: string;  // snake_case in current API
  source?: string;
  country?: string;
  messages: ChatbaseEmbeddedMessage[];
}

export interface ChatbaseConversationsPage {
  data: ChatbaseConversation[];
  // No pagination key — use page param and stop when data.length < size
}

// Kept for feedback PATCH — still uses message id
export interface ChatbaseMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  feedback?: 'positive' | 'negative' | null;
  createdAt?: string;
}

export interface ChatbotUpdatePayload {
  sourceText?: string;
  instructions?: string;
}

export interface ChatbaseChatbotProfile {
  id: string;
  name: string;
  visibility: string;
  created_at: string;
  instructions: string;
  index_name: string;
  ip_limit: number;
  ip_limit_timeframe: number;
  ip_limit_message: string;
  initial_messages: string[];
  styles: {
    theme?: string;
    button_color?: string;
    align_chat_button?: string;
  } | null;
  model: string;
  last_message_at: string;
  num_of_characters: number;
  last_trained_at: string;
  status: string;
  temp: number;
  only_allow_on_added_domains: boolean;
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

const PAGE_SIZE = 100;

/**
 * Fetch ALL conversations for a chatbot using page-based pagination.
 * Messages are embedded in each conversation object.
 * Stops when a page returns fewer records than PAGE_SIZE.
 */
export async function fetchAllConversations(
  chatbotId: string,
): Promise<ChatbaseConversation[]> {
  const all: ChatbaseConversation[] = [];
  let page = 1;

  do {
    const url = chatbaseConversationsUrl(chatbotId, page);
    const result = await chatbaseFetch<ChatbaseConversationsPage>(url);
    all.push(...result.data);
    if (result.data.length < PAGE_SIZE) break;
    page++;
  } while (true);

  return all;
}

/**
 * Fetch all chatbot profiles from Chatbase via GET /get-chatbots.
 * Returns a map of chatbase ID → profile for easy lookup.
 */
export async function fetchAllChatbotProfiles(): Promise<Map<string, ChatbaseChatbotProfile>> {
  const res = await chatbaseFetch<{ chatbots: { data: ChatbaseChatbotProfile[]; error: unknown } }>(
    `${CHATBASE_API_BASE}/get-chatbots`,
  );
  const map = new Map<string, ChatbaseChatbotProfile>();
  for (const bot of res.chatbots.data ?? []) {
    map.set(bot.id, bot);
  }
  return map;
}

/**
 * POST source text to the chatbot's training data.
 * Uses /update-chatbot-data — confirmed working for v1 chatbots.
 *
 * IMPORTANT: Chatbase fully replaces sourceText on every call — it does NOT append.
 * Callers must fetch current accumulated text, append new content, and send the
 * full combined string. Do NOT pass chatbotName — it renames the bot display name.
 */
export async function updateChatbotData(
  chatbotId: string,
  sourceText: string,
): Promise<void> {
  await chatbaseFetch<unknown>(`${CHATBASE_API_BASE}/update-chatbot-data`, {
    method: 'POST',
    body: JSON.stringify({ chatbotId, sourceText }),
  });
}

/**
 * POST updated chatbot settings (instructions, model, etc).
 * Uses /update-chatbot-settings — confirmed working for v1 chatbots.
 */
export async function updateChatbotSettings(
  chatbotId: string,
  payload: Omit<ChatbotUpdatePayload, 'sourceText'>,
): Promise<void> {
  await chatbaseFetch<unknown>(`${CHATBASE_API_BASE}/update-chatbot-settings`, {
    method: 'POST',
    body: JSON.stringify({ chatbotId, ...payload }),
  });
}
