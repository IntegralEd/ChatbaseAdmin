'use server';

import { TABLES } from '@/lib/constants';
import { listRecords, getRecord, updateRecord } from '@/lib/airtable';
import { patchMessageFeedback, updateChatbot } from '@/lib/chatbase';
import type { ChatbotUpdatePayload } from '@/lib/chatbase';
import {
  type MessageFields,
  type ConversationFields,
  type MessageReviewFields,
  type PromptChangeRequestFields,
  type ChatbotFields,
} from '@/lib/mappers';
import { syncAll } from '@/app/admin/actions';

export { syncAll };

// ── Push pending message feedback to Chatbase ─────────────────────────────────

export interface FeedbackPushResult {
  ok: boolean;
  sent: number;
  errors: number;
  details: string[];
}

/**
 * Sends all pending Message_Reviews (Send_To_Chatbase=true, not yet sent)
 * to Chatbase as positive/negative feedback, then marks each as 'sent'.
 */
export async function pushPendingFeedback(): Promise<FeedbackPushResult> {
  const reviews = await listRecords<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, {
    filterByFormula: `AND({Send_To_Chatbase}=1, {Feedback_Sync_Status}!="sent")`,
  });

  if (reviews.length === 0) return { ok: true, sent: 0, errors: 0, details: [] };

  // Collect unique linked message and conversation record IDs
  const msgRecordIdSet: Record<string, true> = {};
  reviews.flatMap((r) => r.fields.Message_Link ?? []).forEach((id) => { msgRecordIdSet[id] = true; });
  const msgRecordIds = Object.keys(msgRecordIdSet);

  const msgFormula =
    msgRecordIds.length === 1
      ? `RECORD_ID()="${msgRecordIds[0]}"`
      : `OR(${msgRecordIds.map((id) => `RECORD_ID()="${id}"`).join(',')})`;

  const messages = await listRecords<MessageFields>(TABLES.MESSAGES, {
    filterByFormula: msgFormula,
    fields: ['Message_ID', 'Conversation_Link'],
  });
  const messageMap = new Map(messages.map((m) => [m.id, m]));

  const convRecordIdSet: Record<string, true> = {};
  messages.flatMap((m) => m.fields.Conversation_Link ?? []).forEach((id) => { convRecordIdSet[id] = true; });
  const convRecordIds = Object.keys(convRecordIdSet);

  const convFormula =
    convRecordIds.length === 1
      ? `RECORD_ID()="${convRecordIds[0]}"`
      : `OR(${convRecordIds.map((id) => `RECORD_ID()="${id}"`).join(',')})`;

  const conversations = await listRecords<ConversationFields>(TABLES.CONVERSATIONS, {
    filterByFormula: convFormula,
    fields: ['Conversation_ID'],
  });
  const convMap = new Map(conversations.map((c) => [c.id, c]));

  let sent = 0;
  let errors = 0;
  const details: string[] = [];

  for (const review of reviews) {
    const msgRecordId = review.fields.Message_Link?.[0];
    if (!msgRecordId) {
      details.push(`Review ${review.id}: no message linked`);
      errors++;
      continue;
    }

    const message = messageMap.get(msgRecordId);
    if (!message?.fields.Message_ID) {
      details.push(`Review ${review.id}: message record missing or no Message_ID`);
      errors++;
      continue;
    }

    const convRecordId = message.fields.Conversation_Link?.[0];
    const conv = convRecordId ? convMap.get(convRecordId) : undefined;
    if (!conv?.fields.Conversation_ID) {
      details.push(`Review ${review.id}: conversation not found`);
      errors++;
      continue;
    }

    const ratingRaw = (review.fields.Internal_Rating ?? '').toLowerCase();
    const feedback: 'positive' | 'negative' | null =
      ratingRaw === 'positive' ? 'positive' : ratingRaw === 'negative' ? 'negative' : null;

    try {
      await patchMessageFeedback(conv.fields.Conversation_ID, message.fields.Message_ID, feedback);
      await updateRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, review.id, {
        Feedback_Sync_Status: 'sent',
        Feedback_Sync_At: new Date().toISOString(),
      });
      sent++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      details.push(`Review ${review.id}: ${msg}`);
      await updateRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, review.id, {
        Feedback_Sync_Status: 'error',
      }).catch(() => null);
      errors++;
    }
  }

  return { ok: errors === 0, sent, errors, details };
}

// ── Push a single prompt change to Chatbase ───────────────────────────────────

export interface PromptPushResult {
  ok: boolean;
  error?: string;
}

/**
 * Pushes a Prompt_Change_Request to Chatbase (instructions and/or source text),
 * then marks the change as 'pushed'.
 */
export async function pushPromptChange(
  changeId: string,
  chatbotRecordId: string,
): Promise<PromptPushResult> {
  const [change, chatbot] = await Promise.all([
    getRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId),
    getRecord<ChatbotFields>(TABLES.CHATBOTS, chatbotRecordId),
  ]);

  const chatbaseId = chatbot.fields.Chatbase_Chatbot_ID;
  if (!chatbaseId) return { ok: false, error: 'Chatbot has no Chatbase_Chatbot_ID' };

  const payload: ChatbotUpdatePayload = {};
  if (change.fields.Proposed_Prompt_Text) payload.instructions = change.fields.Proposed_Prompt_Text;
  if (change.fields.Proposed_Source_Change) payload.sourceText = change.fields.Proposed_Source_Change;

  if (!payload.instructions && !payload.sourceText) {
    return { ok: false, error: 'No Proposed_Prompt_Text or Proposed_Source_Change to push' };
  }

  try {
    await updateChatbot(chatbaseId, payload);
    await updateRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId, {
      Change_Status: 'pushed',
      Pushed_Datetime: new Date().toISOString(),
      Chatbase_Update_Result: 'success',
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId, {
      Chatbase_Update_Result: `error: ${msg}`,
    }).catch(() => null);
    return { ok: false, error: msg };
  }
}
