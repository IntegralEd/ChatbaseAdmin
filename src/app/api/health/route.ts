import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/constants';

// GET /api/health — no auth required
export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
    },
    { status: 200 },
  );
}
