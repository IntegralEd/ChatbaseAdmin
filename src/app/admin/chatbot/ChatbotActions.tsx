'use client';

import { useState, useTransition } from 'react';
import { syncAll, pushFeedbackAsSource, pushPromptChange } from './actions';

// ── Sync button ───────────────────────────────────────────────────────────────

export function SyncButton() {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);

  function handleClick() {
    setMsg('');
    setIsErr(false);
    startTransition(async () => {
      const r = await syncAll(false);
      if (r.ok) {
        setMsg(`Synced ${r.conversations} conversations, ${r.messages} messages.`);
        setIsErr(false);
      } else {
        setMsg(r.error ?? 'Sync failed');
        setIsErr(true);
      }
    });
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.75rem', alignItems: 'center' }}>
      <button className="btn btn-primary btn-sm" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Syncing...' : 'Sync Now'}
      </button>
      {msg && (
        <span style={{ fontSize: '0.8rem', color: isErr ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {msg}
        </span>
      )}
    </span>
  );
}

// ── Push feedback as source text ──────────────────────────────────────────────

export function PushFeedbackButton({ chatbotRecordId }: { chatbotRecordId: string }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);

  function handleClick() {
    setMsg('');
    setIsErr(false);
    startTransition(async () => {
      const r = await pushFeedbackAsSource(chatbotRecordId);
      if (r.ok) {
        setMsg(r.sent === 0 ? (r.details[0] ?? 'Nothing to send.') : `Sent ${r.sent} review(s) as source.`);
        setIsErr(false);
      } else {
        setMsg(`Error: ${r.details.join('; ')}`);
        setIsErr(true);
      }
    });
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.75rem', alignItems: 'center' }}>
      <button className="btn btn-primary btn-sm" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Sending...' : 'Send Feedback as Source'}
      </button>
      {msg && (
        <span style={{ fontSize: '0.8rem', color: isErr ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {msg}
        </span>
      )}
    </span>
  );
}

// ── Push a single prompt change ───────────────────────────────────────────────

export function PushPromptButton({
  changeId,
  chatbotRecordId,
}: {
  changeId: string;
  chatbotRecordId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);

  function handleClick() {
    setMsg('');
    setIsErr(false);
    startTransition(async () => {
      const r = await pushPromptChange(changeId, chatbotRecordId);
      if (r.ok) {
        setMsg('Pushed');
        setIsErr(false);
      } else {
        setMsg(r.error ?? 'Failed');
        setIsErr(true);
      }
    });
  }

  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
      <button className="btn btn-sm btn-primary" onClick={handleClick} disabled={isPending}>
        {isPending ? 'Pushing...' : 'Push'}
      </button>
      {msg && (
        <span style={{ fontSize: '0.75rem', color: isErr ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {msg}
        </span>
      )}
    </span>
  );
}
