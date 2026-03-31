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
interface UserEmailFields { email: string }

/** Look up Airtable Users record ID by email (primary key). */
async function findUserRecordId(email: string): Promise<string | undefined> {
  const safe = email.replace(/"/g, '');
  const users = await listRecords<UserEmailFields>(TABLES.USERS, {
    filterByFormula: `{email} = "${safe}"`,
    fields: ['email'],
    maxRecords: 1,
  });
  return users[0]?.id;
}

export interface SyncResult {
  ok: boolean;
  conversations: number;
  messages: number;
  jobId: string;
  error?: string;
}

/**
 * Sync conversations + embedded messages for all chatbots in Airtable.
 *
 * Incremental mode (default): skips conversations where last_message_at
 * hasn't changed AND the stored message count matches Chatbase.
 *
 * Force mode: re-syncs every conversation regardless. Use locally for
 * the initial backfill — Vercel Hobby will time out on large datasets.
 */
export async function syncAll(force = false, userEmail?: string): Promise<SyncResult> {
  let jobId = '';

  // Fetch chatbots + resolve user in parallel so we can link both to the sync job
  let chatbots;
  try {
    const [chatbotRecords, userRecordId] = await Promise.all([
      listRecords<ChatbotFields>(TABLES.CHATBOTS),
      userEmail ? findUserRecordId(userEmail) : Promise.resolve(undefined),
    ]);
    chatbots = chatbotRecords;
    const firstChatbotId = chatbots[0]?.id;
    const job = await createRecord<SyncJobFields>(
      TABLES.SYNC_JOBS,
      syncJobStartFields(firstChatbotId, userRecordId),
    );
    jobId = job.id;
  } catch (err) {
    return { ok: false, conversations: 0, messages: 0, jobId: '', error: String(err) };
  }

  try {
    // Load existing conversations for incremental diffing
    const existingConvRecords = await listRecords<ConversationFields>(TABLES.CONVERSATIONS, {
      fields: ['Conversation_ID', 'Last_Message_At', 'Message_Count'],
    });
    const existingConvMap = new Map(
      existingConvRecords.map((r) => [
        r.fields.Conversation_ID,
        {
          recordId: r.id,
          lastMessageAt: r.fields.Last_Message_At ?? '',
          messageCount: r.fields.Message_Count ?? 0,
        },
      ]),
    );

    let totalConversations = 0;
    let totalMessages = 0;

    for (const chatbot of chatbots) {
      const chatbaseId = chatbot.fields.Chatbase_Chatbot_ID;
      if (!chatbaseId) continue;

      const conversations = await fetchAllConversations(chatbaseId);
      if (conversations.length === 0) continue;

      // Incremental filter: only process new or changed conversations
      const toSync = force
        ? conversations
        : conversations.filter((c) => {
            const existing = existingConvMap.get(c.id);
            if (!existing) return true; // new conversation
            if (c.last_message_at > existing.lastMessageAt) return true; // new messages arrived
            // Re-sync if Airtable message count is 0 but Chatbase has messages
            if (existing.messageCount === 0 && (c.messages?.length ?? 0) > 0) return true;
            return false;
          });

      if (toSync.length === 0) continue;

      // Upsert conversations — response includes Airtable record IDs, no extra listRecords needed
      const convUpsert = await upsertRecords<ConversationFields>(
        TABLES.CONVERSATIONS,
        toSync.map((c) => ({ fields: conversationToAirtableFields(c, chatbot.id) })),
        ['Conversation_ID'],
      );
      totalConversations += toSync.length;

      // Build Chatbase ID → Airtable record ID map from upsert response
      const convIdToRecordId = new Map<string, string>(
        existingConvRecords.map((r) => [r.fields.Conversation_ID, r.id]),
      );
      convUpsert.records.forEach((r) => {
        if (r.fields.Conversation_ID) convIdToRecordId.set(r.fields.Conversation_ID, r.id);
      });

      // Collect ALL messages from all toSync conversations, then upsert in one pass
      const allMsgRecords = toSync.flatMap((conv) => {
        const convRecordId = convIdToRecordId.get(conv.id);
        return (conv.messages ?? [])
          .map((m) => embeddedMessageToAirtableFields(m, conv.id, convRecordId))
          .filter((f): f is Partial<MessageFields> => f !== null)
          .map((fields) => ({ fields }));
      });

      if (allMsgRecords.length > 0) {
        await upsertRecords<MessageFields>(TABLES.MESSAGES, allMsgRecords, ['Message_ID']);
        totalMessages += allMsgRecords.length;
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
