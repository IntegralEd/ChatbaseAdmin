/**
 * POST /api/sync/messages
 *
 * Syncs all messages for a given Chatbase conversation into Airtable.
 *
 * Body (required):
 *   { conversationId: string }   — Chatbase conversation external ID
 *
 * Flow:
 *   1. Require admin token
 *   2. Validate body with zod
 *   3. Create Sync_Job (status: running)
 *   4. Look up Airtable conversation record by Conversation_ID
 *   5. Paginate Chatbase messages API
 *   6. Upsert into Airtable Chatbase_Messages by Message_ID
 *      — each message linked to the Airtable conversation record
 *   7. Update Sync_Job
 *   8. Return { jobId, recordsProcessed }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminToken } from '@/lib/auth';
import { TABLES } from '@/lib/constants';
import { listRecords, createRecord, updateRecord, upsertRecords } from '@/lib/airtable';
import { fetchAllMessages } from '@/lib/chatbase';
import {
  messageToAirtableFields,
  syncJobStartFields,
  syncJobSuccessFields,
  syncJobErrorFields,
  type ConversationFields,
  type MessageFields,
  type SyncJobFields,
} from '@/lib/mappers';

const BodySchema = z.object({
  conversationId: z.string().min(1),
});

export async function POST(req: Request): Promise<NextResponse> {
  const authError = requireAdminToken(req);
  if (authError) return NextResponse.json(await authError.json(), { status: authError.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { conversationId } = parsed.data;

  // Create Sync_Job
  let jobRecord: Awaited<ReturnType<typeof createRecord<SyncJobFields>>>;
  try {
    jobRecord = await createRecord<SyncJobFields>(
      TABLES.SYNC_JOBS,
      syncJobStartFields('sync_messages'),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to create sync job: ${msg}` }, { status: 500 });
  }

  const jobId = jobRecord.id;

  try {
    // Find the Airtable conversation record
    const convRecords = await listRecords<ConversationFields>(TABLES.CONVERSATIONS, {
      filterByFormula: `{Conversation_ID} = "${conversationId}"`,
      maxRecords: 1,
    });

    if (convRecords.length === 0) {
      await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobErrorFields(`Conversation not found in Airtable: ${conversationId}`));
      return NextResponse.json({ error: `Conversation not found in Airtable: ${conversationId}` }, { status: 404 });
    }

    const conversationRecordId = convRecords[0].id;

    // Fetch all messages from Chatbase
    const messages = await fetchAllMessages(conversationId);

    const airtableRecords = messages.map((msg) => ({
      fields: messageToAirtableFields(msg, conversationRecordId),
    }));

    if (airtableRecords.length > 0) {
      await upsertRecords<MessageFields>(
        TABLES.MESSAGES,
        airtableRecords,
        ['Message_ID'],
      );
    }

    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobSuccessFields(airtableRecords.length));

    return NextResponse.json({ jobId, recordsProcessed: airtableRecords.length }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobErrorFields(msg)).catch(() => null);
    return NextResponse.json({ error: msg, jobId }, { status: 500 });
  }
}
// GET not supported — POST only
export function GET() { return new Response('Method Not Allowed', { status: 405 }); }
