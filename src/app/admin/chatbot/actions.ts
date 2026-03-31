'use server';

import { TABLES } from '@/lib/constants';
import { listRecords, getRecord, updateRecord } from '@/lib/airtable';
import { updateChatbotData, updateChatbotSettings } from '@/lib/chatbase';
import {
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
 * Batches all pending Message_Reviews (Send_To_Chatbase=true, not yet sent,
 * Message_Feedback_Concat filled) into a single source-text block and pushes
 * it to Chatbase via POST /update-chatbot-data.
 *
 * Requires an Airtable formula field "Message_Feedback_Concat" on Message_Reviews:
 *   "When Agent said: " & {Response_Snippet_to_Improve}
 *   & CHAR(10) & "It should have said the following response instead: "
 *   & {Suggested_Response}
 */
export async function pushFeedbackAsSource(
  chatbotRecordId: string,
  userEmail?: string,
): Promise<FeedbackPushResult> {
  const chatbot = await getRecord<ChatbotFields>(TABLES.CHATBOTS, chatbotRecordId);
  const chatbaseId = chatbot.fields.Chatbase_Chatbot_ID;
  if (!chatbaseId) {
    return { ok: false, sent: 0, errors: 1, details: ['Chatbot has no Chatbase_Chatbot_ID'] };
  }

  const reviews = await listRecords<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, {
    filterByFormula: `AND({Send_To_Chatbase}=1, {Feedback_Sync_Status}!="sent", {Message_Feedback_Concat}!="")`,
  });

  console.log(`[pushFeedbackAsSource] chatbot=${chatbaseId} reviews=${reviews.length}`);

  if (reviews.length === 0) {
    return { ok: true, sent: 0, errors: 0, details: ['No pending feedback with Message_Feedback_Concat filled.'] };
  }

  const date = new Date().toISOString().slice(0, 10);
  const stamp = userEmail ? `${date} — ${userEmail}` : date;
  const header = `=== Corrective Feedback — ${stamp} ===\n`;
  const blocks = reviews
    .map((r) => `---\n${r.fields.Message_Feedback_Concat}`)
    .join('\n\n');
  const sourceText = `${header}\n${blocks}`;

  console.log(`[pushFeedbackAsSource] sourceText length=${sourceText.length}`);

  try {
    await updateChatbotData(chatbaseId, sourceText);
    const now = new Date().toISOString();
    await Promise.all(
      reviews.map((r) =>
        updateRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, r.id, {
          Feedback_Sync_Status: 'sent',
          Feedback_Sync_At: now,
        }),
      ),
    );
    return { ok: true, sent: reviews.length, errors: 0, details: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[pushFeedbackAsSource] error: ${msg}`);
    return { ok: false, sent: 0, errors: reviews.length, details: [msg] };
  }
}

/**
 * Toggle Send_To_Chatbase on a single review — called from the embed panel checkbox.
 */
export async function toggleSendToChatbase(
  reviewId: string,
  value: boolean,
): Promise<void> {
  await updateRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, reviewId, {
    Send_To_Chatbase: value,
  });
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

  const hasInstructions = !!change.fields.Proposed_Prompt_Text;
  const hasSource = !!change.fields.Proposed_Source_Change;

  if (!hasInstructions && !hasSource) {
    return { ok: false, error: 'No Proposed_Prompt_Text or Proposed_Source_Change to push' };
  }

  try {
    if (hasInstructions) {
      await updateChatbotSettings(chatbaseId, { instructions: change.fields.Proposed_Prompt_Text });
    }
    if (hasSource) {
      await updateChatbotData(chatbaseId, change.fields.Proposed_Source_Change!);
    }
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
