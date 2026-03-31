/**
 * POST /api/sync/messages — DEPRECATED
 *
 * The Chatbase API now embeds messages in the get-conversations response.
 * Messages sync automatically via /api/sync/conversations or the dashboard.
 */
import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    { error: 'Deprecated. Messages are embedded in conversations and synced automatically.' },
    { status: 410 },
  );
}

export function GET() {
  return new Response('Method Not Allowed', { status: 405 });
}
