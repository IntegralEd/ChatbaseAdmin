/**
 * GET /api/cron/sync
 *
 * Called by Vercel Cron every 6 hours (see vercel.json).
 * Vercel sends Authorization: Bearer <CRON_SECRET> automatically.
 *
 * Syncs all conversations for all chatbots in Airtable.
 * Full message sync is intentionally excluded from cron — run manually
 * via the dashboard for large backlogs.
 */

import { NextResponse } from 'next/server';
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

export async function GET(req: Request): Promise<NextResponse> {
  // Vercel Cron auth — CRON_SECRET is set automatically in Vercel env
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let jobId = '';
  try {
    const job = await createRecord<SyncJobFields>(TABLES.SYNC_JOBS, syncJobStartFields());
    jobId = job.id;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  try {
    const chatbots = await listRecords<ChatbotFields>(TABLES.CHATBOTS);
    let total = 0;

    for (const chatbot of chatbots) {
      const chatbaseId = chatbot.fields.Chatbase_Chatbot_ID;
      if (!chatbaseId) continue;

      const conversations = await fetchAllConversations(chatbaseId);
      if (conversations.length === 0) continue;

      await upsertRecords<ConversationFields>(
        TABLES.CONVERSATIONS,
        conversations.map((c) => ({ fields: conversationToAirtableFields(c, chatbot.id) })),
        ['Conversation_ID'],
      );
      total += conversations.length;
    }

    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobSuccessFields(total));
    return NextResponse.json({ ok: true, recordsProcessed: total, jobId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateRecord<SyncJobFields>(TABLES.SYNC_JOBS, jobId, syncJobErrorFields(msg)).catch(() => null);
    return NextResponse.json({ error: msg, jobId }, { status: 500 });
  }
}
