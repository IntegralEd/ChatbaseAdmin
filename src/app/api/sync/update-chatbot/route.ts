/**
 * POST /api/sync/update-chatbot
 *
 * Updates a chatbot's instructions and/or source text in Chatbase,
 * then updates the corresponding Airtable record.
 *
 * Body:
 *   {
 *     chatbotId: string,       — Chatbase external ID (Chatbase_Chatbot_ID)
 *     sourceText?: string,
 *     instructions?: string,
 *     dryRun?: boolean         — if true, return the payload without calling Chatbase
 *   }
 *
 * Flow:
 *   1. Require admin token
 *   2. zod validate
 *   3. If dryRun=true, return what would be sent
 *   4. PATCH Chatbase chatbot API
 *   5. Update Airtable Chatbase_Chatbots record (Source_Text, Instructions, Last_Synced)
 *   6. Return { success: true, dryRun, applied }
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdminToken } from '@/lib/auth';
import { TABLES } from '@/lib/constants';
import { listRecords, updateRecord } from '@/lib/airtable';
import { updateChatbotSettings, updateChatbotData } from '@/lib/chatbase';
import type { ChatbotFields } from '@/lib/mappers';

const UpdateChatbotSchema = z.object({
  chatbotId: z.string().min(1),
  chatbotName: z.string().optional(),  // required by Chatbase update-chatbot-data; falls back to chatbotId
  sourceText: z.string().optional(),
  instructions: z.string().optional(),
  dryRun: z.boolean().optional().default(false),
});

type UpdateChatbotBody = z.infer<typeof UpdateChatbotSchema>;

export async function POST(req: Request): Promise<NextResponse> {
  const authError = requireAdminToken(req);
  if (authError) return NextResponse.json(await authError.json(), { status: authError.status });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = UpdateChatbotSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { chatbotId, chatbotName, sourceText, instructions, dryRun }: UpdateChatbotBody = parsed.data;
  const resolvedName = chatbotName ?? chatbotId;

  if (!sourceText && !instructions) {
    return NextResponse.json(
      { error: 'At least one of sourceText or instructions must be provided' },
      { status: 400 },
    );
  }

  const payload: { sourceText?: string; instructions?: string } = {};
  if (sourceText !== undefined) payload.sourceText = sourceText;
  if (instructions !== undefined) payload.instructions = instructions;

  if (dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      applied: false,
      wouldSend: { chatbotId, ...payload },
    });
  }

  try {
    // Update Chatbase — settings and data are separate endpoints
    if (instructions !== undefined) await updateChatbotSettings(chatbotId, { instructions });
    if (sourceText !== undefined) await updateChatbotData(chatbotId, sourceText);

    // Find Airtable record by Chatbase_Chatbot_ID (double underscore, misspelled)
    const records = await listRecords<ChatbotFields>(TABLES.CHATBOTS, {
      filterByFormula: `{Chatbase_Chatbot_ID} = "${chatbotId}"`,
      maxRecords: 1,
    });

    if (records.length > 0) {
      const airtableFields: Partial<ChatbotFields> = {};
      if (instructions !== undefined) airtableFields['Chatbots instructions'] = instructions;
      // sourceText has no direct Airtable field — Chatbase is the source of truth
      if (Object.keys(airtableFields).length > 0) {
        await updateRecord<ChatbotFields>(TABLES.CHATBOTS, records[0].id, airtableFields);
      }
    }

    return NextResponse.json({ success: true, dryRun: false, applied: true }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
// GET not supported — POST only
export function GET() { return new Response('Method Not Allowed', { status: 405 }); }
