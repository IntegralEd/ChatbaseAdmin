'use server';

import { TABLES } from '@/lib/constants';
import { listRecords, getRecord, createRecord, updateRecord } from '@/lib/airtable';
import { updateChatbotData, updateChatbotSettings } from '@/lib/chatbase';
import {
  type MessageReviewFields,
  type PromptChangeRequestFields,
  type ChatbotFields,
  type SyncJobFields,
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
    filterByFormula: `AND({Send_To_Chatbase}=1, {Change_Status}="Approved", {Message_Feedback_Concat}!="")`,
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

  // Create Sync_Job to record this push
  const job = await createRecord<SyncJobFields>(TABLES.SYNC_JOBS, {
    Job_Type: 'feedback_push',
    Started_At: new Date().toISOString(),
    Chatbot_Link: [chatbotRecordId],
    Feedback_Reviews_Link: reviews.map((r) => r.id),
    Feedback_Reviews_Count: String(reviews.length),
    Feedback_Text_Transmitted: sourceText,
  });

  try {
    await updateChatbotData(chatbaseId, chatbot.fields.Chatbot_Name ?? chatbaseId, sourceText);
    const now = new Date().toISOString();
    await Promise.all([
      updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, job.id, {
        Completed_At: now,
        Records_Imported: String(reviews.length),
      }),
      ...reviews.map((r) =>
        updateRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, r.id, {
          Change_Status: 'Pushed',
          Feedback_Sync_At: now,
          Sync_Jobs: [job.id],
        }),
      ),
    ]);
    return { ok: true, sent: reviews.length, errors: 0, details: [] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[pushFeedbackAsSource] error: ${msg}`);
    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, job.id, {
      Completed_At: new Date().toISOString(),
      Error_Log: msg,
    }).catch(() => null);
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

/**
 * Approve a message review — sets Change_Status to 'Approved'.
 */
export async function approveMessageReview(reviewId: string): Promise<void> {
  await updateRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, reviewId, {
    Change_Status: 'Approved',
  });
}

/**
 * Reject a message review — sets Change_Status to 'Rejected' and clears Send_To_Chatbase.
 */
export async function rejectMessageReview(reviewId: string): Promise<void> {
  await updateRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, reviewId, {
    Change_Status: 'Rejected',
    Send_To_Chatbase: false,
  });
}

/**
 * Reject a prompt change — sets Change_Status to 'Rejected'.
 */
export async function rejectPromptChange(changeId: string): Promise<void> {
  await updateRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId, {
    Change_Status: 'Rejected',
    Queue_For_Push: false,
  });
}

/**
 * Approve a prompt change — sets Change_Status to 'Approved'.
 */
export async function approvePromptChange(changeId: string): Promise<void> {
  await updateRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId, {
    Change_Status: 'Approved',
  });
}

/**
 * Toggle Queue_For_Push on a single prompt change — called from the embed panel checkbox.
 */
export async function toggleQueueForPush(
  changeId: string,
  value: boolean,
): Promise<void> {
  await updateRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId, {
    Queue_For_Push: value,
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

  const transmittedText = [
    hasInstructions ? `[Instructions]\n${change.fields.Proposed_Prompt_Text}` : '',
    hasSource ? `[Source Change]\n${change.fields.Proposed_Source_Change}` : '',
  ].filter(Boolean).join('\n\n');

  // Create Sync_Job to record this push
  const job = await createRecord<SyncJobFields>(TABLES.SYNC_JOBS, {
    Job_Type: 'prompt_push',
    Started_At: new Date().toISOString(),
    Chatbot_Link: [chatbotRecordId],
    Prompt_Changes_Link: [changeId],
    Prompt_Changes_Count: '1',
    Prompt_Text_Transmitted: transmittedText,
  });

  try {
    if (hasInstructions) {
      await updateChatbotSettings(chatbaseId, { instructions: change.fields.Proposed_Prompt_Text });
    }
    if (hasSource) {
      await updateChatbotData(chatbaseId, chatbot.fields.Chatbot_Name ?? chatbaseId, change.fields.Proposed_Source_Change!);
    }
    const now = new Date().toISOString();
    await Promise.all([
      updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, job.id, {
        Completed_At: now,
        Records_Imported: '1',
      }),
      updateRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId, {
        Change_Status: 'Pushed',
        Pushed_Datetime: now,
        Chatbase_Update_Result: 'success',
        Sync_Jobs: [job.id],
      }),
    ]);
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await Promise.all([
      updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, job.id, {
        Completed_At: new Date().toISOString(),
        Error_Log: msg,
      }),
      updateRecord<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, changeId, {
        Chatbase_Update_Result: `error: ${msg}`,
      }),
    ]).catch(() => null);
    return { ok: false, error: msg };
  }
}
