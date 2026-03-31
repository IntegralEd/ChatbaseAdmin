/**
 * GET /api/cron/sync
 *
 * Called by Vercel Cron daily (see vercel.json).
 * Vercel sends Authorization: Bearer <CRON_SECRET> automatically.
 *
 * Uses incremental sync — only processes new or changed conversations.
 */

import { NextResponse } from 'next/server';
import { syncAll } from '@/app/admin/actions';

export async function GET(req: Request): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await syncAll(false);
  if (result.ok) {
    return NextResponse.json({ ok: true, conversations: result.conversations, messages: result.messages, jobId: result.jobId });
  }
  return NextResponse.json({ error: result.error, jobId: result.jobId }, { status: 500 });
}
