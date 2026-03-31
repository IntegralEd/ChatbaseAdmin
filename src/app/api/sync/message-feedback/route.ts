/**
 * POST /api/sync/message-feedback
 *
 * Syncs feedback for a single message: updates Chatbase AND Airtable.
 *
 * Body (required):
 *   { messageId: string, conversationId: string, feedback: "positive" | "negative" | null }
 *
 * Flow:
 *   1. Require admin token
 *   2. Validate body with zod
 *   3. PATCH Chatbase feedback endpoint
 *   4. Update Airtable Chatbase_Messages.Feedback field
 *   5. Return { success: true }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminToken } from '@/lib/auth';
import { TABLES } from '@/lib/constants';
import { listRecords, updateRecord } from '@/lib/airtable';
import { patchMessageFeedback } from '@/lib/chatbase';
import type { MessageFields } from '@/lib/mappers';

const FeedbackSchema = z.object({
  messageId: z.string().min(1),
  conversationId: z.string().min(1),
  feedback: z.union([z.literal('positive'), z.literal('negative'), z.null()]),
});

type FeedbackBody = z.infer<typeof FeedbackSchema>;

export async function POST(req: Request): Promise<NextResponse> {
  const authError = requireAdminToken(req);
  if (authError) return NextResponse.json(await authError.json(), { status: authError.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = FeedbackSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { messageId, conversationId, feedback }: FeedbackBody = parsed.data;

  try {
    // 1. Update Chatbase
    await patchMessageFeedback(conversationId, messageId, feedback);

    // 2. Find and update Airtable record
    const records = await listRecords<MessageFields>(TABLES.MESSAGES, {
      filterByFormula: `{Message_ID} = "${messageId}"`,
      maxRecords: 1,
    });

    if (records.length > 0) {
      // Airtable singleSelect cannot be set to null via the API — use empty string to clear
      await updateRecord<MessageFields>(TABLES.MESSAGES, records[0].id, {
        Feedback_Chatbase: feedback ?? undefined,
      } as Partial<MessageFields>);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
// GET not supported — POST only
export function GET() { return new Response('Method Not Allowed', { status: 405 }); }
