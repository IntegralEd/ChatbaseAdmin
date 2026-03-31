'use client';

import { useState } from 'react';

/**
 * Client component — triggers POST /api/sync/conversations.
 * Uses the INTERNAL_ADMIN_TOKEN from the browser is NOT appropriate for a
 * production deployment; in prod this button should POST to a Next.js server
 * action or a thin proxy route that holds the token server-side.
 *
 * For an internal-only tool served on a private network or behind Vercel
 * Password Protection, this pattern is acceptable.
 */
export default function RunSyncButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function handleClick() {
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/sync/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Token entered as a query param or env injection is handled server-side.
          // For the admin UI, we POST via a server action proxy instead.
        },
      });
      if (res.status === 401) {
        setState('error');
        setMessage('Unauthorized — sync must be triggered via authenticated API call.');
        return;
      }
      const data = (await res.json()) as { jobId?: string; recordsProcessed?: number; error?: string };
      if (!res.ok) {
        setState('error');
        setMessage(data.error ?? 'Sync failed');
        return;
      }
      setState('done');
      setMessage(`Sync started — job ${data.jobId ?? '?'}, ${data.recordsProcessed ?? 0} records processed.`);
    } catch (e) {
      setState('error');
      setMessage(e instanceof Error ? e.message : 'Network error');
    }
  }

  return (
    <div className="flex-row">
      <button
        className="btn btn-primary btn-sm"
        onClick={handleClick}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'Syncing...' : 'Run Sync'}
      </button>
      {message && (
        <span style={{ fontSize: '0.8rem', color: state === 'error' ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
