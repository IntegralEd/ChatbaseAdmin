'use client';

import { useState, useTransition } from 'react';
import { syncAll } from './actions';

export default function RunSyncButton() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  function handleClick() {
    setMessage('');
    setIsError(false);
    startTransition(async () => {
      const result = await syncAll();
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
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? 'Syncing...' : 'Sync Now'}
      </button>
      {message && (
        <span style={{ fontSize: '0.8rem', color: isError ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
