'use server';

import { TABLES } from '@/lib/constants';
import { listRecords, createRecord, updateRecord, upsertRecords } from '@/lib/airtable';
import { fetchAllConversations } from '@/lib/chatbase';
import {
  conversationToAirtableFields,
  embeddedMessageToAirtableFields,
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
 * Full sync: conversations + embedded messages for all chatbots in Airtable.
 * Messages come embedded in the get-conversations response — no separate API call needed.
 */
export async function syncAll(): Promise<SyncResult> {
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

      const conversations = await fetchAllConversations(chatbaseId);
      if (conversations.length === 0) continue;

      // Upsert conversations
      await upsertRecords<ConversationFields>(
        TABLES.CONVERSATIONS,
        conversations.map((c) => ({ fields: conversationToAirtableFields(c, chatbot.id) })),
        ['Conversation_ID'],
      );
      totalConversations += conversations.length;

      // Look up Airtable record IDs for linking messages
      const atConvRecords = await listRecords<ConversationFields>(TABLES.CONVERSATIONS, {
        filterByFormula: `{Conversation_ID} != ""`,
      });
      const convIdToRecordId = new Map(atConvRecords.map((r) => [r.fields.Conversation_ID, r.id]));

      // Upsert embedded messages
      for (const conv of conversations) {
        if (!conv.messages?.length) continue;
        const convRecordId = convIdToRecordId.get(conv.id);

        const msgRecords = conv.messages
          .map((m) => embeddedMessageToAirtableFields(m, conv.id, convRecordId))
          .filter((f): f is Partial<MessageFields> => f !== null)
          .map((fields) => ({ fields }));

        if (msgRecords.length > 0) {
          await upsertRecords<MessageFields>(TABLES.MESSAGES, msgRecords, ['Message_ID']);
          totalMessages += msgRecords.length;
        }
      }
    }

    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobSuccessFields(totalConversations, totalMessages));
    return { ok: true, conversations: totalConversations, messages: totalMessages, jobId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobErrorFields(msg)).catch(() => null);
    return { ok: false, conversations: 0, messages: 0, jobId, error: msg };
  }
}
