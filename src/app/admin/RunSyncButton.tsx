'use client';

import { useState, useTransition } from 'react';
import { syncAll } from './actions';

export default function RunSyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  function run(force: boolean) {
    setMessage('');
    setIsError(false);
    startTransition(async () => {
      const result = await syncAll(force);
      if (result.ok) {
        setMessage(`Synced ${result.conversations} conversations, ${result.messages} messages.`);
        setIsError(false);
      } else {
        setMessage(result.error ?? 'Sync failed');
        setIsError(true);
      }
    });
  }

  return (
    <div className="flex-row">
      <button
        className="btn btn-primary btn-sm"
        onClick={() => run(false)}
        disabled={isPending}
        title="Incremental — skips already-synced conversations"
      >
        {isPending ? 'Syncing...' : 'Sync Now'}
      </button>
      <button
        className="btn btn-sm"
        onClick={() => run(true)}
        disabled={isPending}
        title="Re-syncs all conversations and messages — run locally for initial backfill"
        style={{ marginLeft: '0.5rem' }}
      >
        Full Sync
      </button>
      {message && (
        <span style={{ fontSize: '0.8rem', color: isError ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
