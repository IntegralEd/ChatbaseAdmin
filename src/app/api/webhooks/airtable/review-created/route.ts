/**
 * POST /api/webhooks/airtable/review-created
 *
 * Receives an Airtable automation webhook when a Message_Review record
 * is created or updated.
 *
 * The INTERNAL_ADMIN_TOKEN is used as the webhook secret — configure Airtable
 * automation to send `Authorization: Bearer <token>` in the request headers.
 *
 * Expected payload (Airtable automation "Run a script" or "Send a webhook"):
 *   { recordId: string }   — the Message_Review record ID
 *
 * Flow:
 *   1. Require admin token
 *   2. Extract Message_Review record ID from body
 *   3. Fetch the review from Airtable (includes linked Message)
 *   4. Fetch the linked Chatbase_Messages record to get Message_ID + Conversation link
 *   5. If Rating is "positive", call /api/sync/message-feedback to sync to Chatbase
 *   6. Return { received: true }
 */

import { NextResponse } from 'next/server';
import { requireAdminToken } from '@/lib/auth';
import { TABLES } from '@/lib/constants';
import { getRecord, listRecords } from '@/lib/airtable';
import type { MessageReviewFields, MessageFields, ConversationFields } from '@/lib/mappers';

interface WebhookBody {
  recordId?: string;
}

export async function POST(req: Request): Promise<NextResponse> {
  const authError = requireAdminToken(req);
  if (authError) return NextResponse.json(await authError.json(), { status: authError.status });

  let body: WebhookBody = {};
  try {
    const text = await req.text();
    if (text) body = JSON.parse(text) as WebhookBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { recordId } = body;
  if (!recordId) {
    return NextResponse.json({ error: 'Missing recordId in webhook payload' }, { status: 400 });
  }

  try {
    // Fetch the Message_Review record
    const review = await getRecord<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, recordId);
    const { Rating, Message: messageLinks } = review.fields;

    if (!messageLinks || messageLinks.length === 0) {
      // No linked message — nothing to sync
      return NextResponse.json({ received: true, synced: false, reason: 'No linked message' });
    }

    // Only sync feedback to Chatbase if rating is positive
    if (Rating !== 'positive') {
      return NextResponse.json({ received: true, synced: false, reason: `Rating is "${Rating}", not positive` });
    }

    // Fetch the linked Chatbase_Messages record
    const messageRecordId = messageLinks[0];
    const messageRecord = await getRecord<MessageFields>(TABLES.MESSAGES, messageRecordId);
    const { Message_ID, Conversation: convLinks } = messageRecord.fields;

    if (!Message_ID) {
      return NextResponse.json({ received: true, synced: false, reason: 'Message has no Message_ID' });
    }

    // Resolve the Chatbase conversation external ID from the linked conversation record
    let conversationId: string | null = null;
    if (convLinks && convLinks.length > 0) {
      const convRecord = await getRecord<ConversationFields>(TABLES.CONVERSATIONS, convLinks[0]);
      conversationId = convRecord.fields.Conversation_ID ?? null;
    }

    if (!conversationId) {
      return NextResponse.json({ received: true, synced: false, reason: 'Could not resolve Chatbase conversation ID' });
    }

    // Call the internal feedback sync endpoint
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000';

    const syncRes = await fetch(`${baseUrl}/api/sync/message-feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.INTERNAL_ADMIN_TOKEN}`,
      },
      body: JSON.stringify({
        messageId: Message_ID,
        conversationId,
        feedback: 'positive',
      }),
    });

    if (!syncRes.ok) {
      const errText = await syncRes.text();
      return NextResponse.json(
        { received: true, synced: false, error: errText },
        { status: 500 },
      );
    }

    return NextResponse.json({ received: true, synced: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ received: true, synced: false, error: msg }, { status: 500 });
  }
}
