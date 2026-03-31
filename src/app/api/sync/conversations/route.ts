/**
 * POST /api/sync/conversations
 *
 * Syncs Chatbase conversations into Airtable.
 *
 * Body (optional):
 *   { chatbotId?: string }
 *   If chatbotId is provided, only that chatbot is synced.
 *   Otherwise, all chatbots in Airtable Chatbase_Chatbots are synced.
 *
 * Flow:
 *   1. Require admin token
 *   2. Create Sync_Job (status: running)
 *   3. Fetch chatbot(s) from Airtable to get external Chatbase IDs
 *   4. Paginate Chatbase /conversations API
 *   5. Upsert into Airtable Chatbase_Conversations by Conversation_ID
 *   6. Update Sync_Job (status: success|error)
 *   7. Return { jobId, recordsProcessed, status }
 */

import { NextResponse } from 'next/server';
import { requireAdminToken } from '@/lib/auth';
import { TABLES } from '@/lib/constants';
import { listRecords, createRecord, updateRecord, upsertRecords } from '@/lib/airtable';
import { fetchAllConversations } from '@/lib/chatbase';
import {
  conversationToAirtableFields,
  syncJobStartFields,
  syncJobSuccessFields,
  syncJobErrorFields,
  type ChatbotFields,
  type ConversationFields,
  type SyncJobFields,
} from '@/lib/mappers';

interface SyncConversationsBody {
  chatbotId?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const authError = requireAdminToken(req);
  if (authError) return NextResponse.json(await authError.json(), { status: authError.status });

  let body: SyncConversationsBody = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as SyncConversationsBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Create Sync_Job
  let jobRecord: Awaited<ReturnType<typeof createRecord<SyncJobFields>>>;
  try {
    jobRecord = await createRecord<SyncJobFields>(
      TABLES.SYNC_JOBS,
      syncJobStartFields('sync_conversations'),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to create sync job: ${msg}` }, { status: 500 });
  }

  const jobId = jobRecord.id;

  try {
    // Fetch chatbot records from Airtable
    let chatbotRecords = await listRecords<ChatbotFields>(TABLES.CHATBOTS);

    if (body.chatbotId) {
      // Filter to just the requested chatbot (match by Chatbase__Idenitifer)
      chatbotRecords = chatbotRecords.filter(
        (r) => r.fields.Chatbase__Idenitifer === body.chatbotId,
      );
      if (chatbotRecords.length === 0) {
        await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobErrorFields(`Chatbot not found: ${body.chatbotId}`));
        return NextResponse.json({ error: `Chatbot not found in Airtable: ${body.chatbotId}` }, { status: 404 });
      }
    }

    let totalRecords = 0;

    for (const chatbot of chatbotRecords) {
      const chatbaseId = chatbot.fields.Chatbase__Idenitifer;
      if (!chatbaseId) continue;

      const conversations = await fetchAllConversations(chatbaseId);

      const airtableRecords = conversations.map((conv) => ({
        fields: conversationToAirtableFields(conv, chatbot.id),
      }));

      if (airtableRecords.length > 0) {
        await upsertRecords<ConversationFields>(
          TABLES.CONVERSATIONS,
          airtableRecords,
          ['Conversation_ID'],
        );
        totalRecords += airtableRecords.length;
      }
    }

    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobSuccessFields(totalRecords));

    return NextResponse.json({ jobId, recordsProcessed: totalRecords, status: 'success' }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobErrorFields(msg)).catch(() => null);
    return NextResponse.json({ error: msg, jobId }, { status: 500 });
  }
}
// GET not supported — POST only
export function GET() { return new Response('Method Not Allowed', { status: 405 }); }
