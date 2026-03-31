'use server';

/**
 * Server actions for admin sync operations.
 * These run on the server — env vars are accessible, no token exposure to browser.
 */

import { TABLES } from '@/lib/constants';
import { listRecords, createRecord, updateRecord, upsertRecords } from '@/lib/airtable';
import { fetchAllConversations, fetchAllMessages } from '@/lib/chatbase';
import {
  conversationToAirtableFields,
  messageToAirtableFields,
  syncJobStartFields,
  syncJobSuccessFields,
  syncJobErrorFields,
  type ChatbotFields,
  type ConversationFields,
  type MessageFields,
  type SyncJobFields,
} from '@/lib/mappers';

export interface SyncResult {
  ok: boolean;
  conversations: number;
  messages: number;
  jobId: string;
  error?: string;
}

/**
 * Full sync: conversations + messages for all chatbots in Airtable.
 * Called from RunSyncButton via server action — token never touches the browser.
 */
export async function syncAll(): Promise<SyncResult> {
  // Create sync job record
  let jobId = '';
  try {
    const job = await createRecord<SyncJobFields>(TABLES.SYNC_JOBS, syncJobStartFields());
    jobId = job.id;
  } catch (err) {
    return { ok: false, conversations: 0, messages: 0, jobId: '', error: String(err) };
  }

  try {
    const chatbots = await listRecords<ChatbotFields>(TABLES.CHATBOTS);
    let totalConversations = 0;
    let totalMessages = 0;

    for (const chatbot of chatbots) {
      const chatbaseId = chatbot.fields.Chatbase_Chatbot_ID;
      if (!chatbaseId) continue;

      // ── Sync conversations ────────────────────────────────────────────────
      const conversations = await fetchAllConversations(chatbaseId);

      if (conversations.length > 0) {
        await upsertRecords<ConversationFields>(
          TABLES.CONVERSATIONS,
          conversations.map((c) => ({ fields: conversationToAirtableFields(c, chatbot.id) })),
          ['Conversation_ID'],
        );
        totalConversations += conversations.length;
      }

      // ── Sync messages for each conversation ───────────────────────────────
      // Fetch current Airtable records to get record IDs for linking
      const atConvRecords = await listRecords<ConversationFields>(TABLES.CONVERSATIONS, {
        filterByFormula: `{Conversation_ID} != ""`,
      });
      const convIdToRecordId = new Map(atConvRecords.map((r) => [r.fields.Conversation_ID, r.id]));

      for (const conv of conversations) {
        const messages = await fetchAllMessages(conv.id);
        if (messages.length === 0) continue;

        const convRecordId = convIdToRecordId.get(conv.id);
        await upsertRecords<MessageFields>(
          TABLES.MESSAGES,
          messages.map((m) => ({ fields: messageToAirtableFields(m, convRecordId) })),
          ['Message_ID'],
        );
        totalMessages += messages.length;
      }
    }

    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobSuccessFields(totalConversations + totalMessages));
    return { ok: true, conversations: totalConversations, messages: totalMessages, jobId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobErrorFields(msg)).catch(() => null);
    return { ok: false, conversations: 0, messages: 0, jobId, error: msg };
  }
}
