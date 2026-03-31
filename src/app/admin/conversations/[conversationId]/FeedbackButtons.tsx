'use client';

import { useState } from 'react';

interface Props {
  messageId: string;
  conversationId: string;
  currentFeedback: 'positive' | 'negative' | null;
}

/**
 * Client component — posts feedback updates to /api/sync/message-feedback.
 * Requires the caller to have the INTERNAL_ADMIN_TOKEN available via a
 * server action or session cookie in production. For this internal tool,
 * we rely on the fact that the app itself is access-controlled (Vercel
 * Password Protection or VPN).
 *
 * The token is NOT embedded in client JS — the API route validates it
 * server-side. This component posts without a token, which will return 401
 * unless the app is fronted by a proxy that injects the header, or this is
 * replaced with a Next.js Server Action.
 *
 * TODO: Replace fetch call with a server action to keep token server-side.
 */
export default function FeedbackButtons({ messageId, conversationId, currentFeedback }: Props) {
  const [feedback, setFeedback] = useState<'positive' | 'negative' | null>(currentFeedback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function updateFeedback(value: 'positive' | 'negative' | null) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sync/message-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, conversationId, feedback: value }),
      });
      if (res.status === 401) {
        setError('Auth required — use API directly.');
        return;
      }
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Failed');
        return;
      }
      setFeedback(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button
        className={`btn btn-sm ${feedback === 'positive' ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => updateFeedback('positive')}
        disabled={loading || feedback === 'positive'}
        title="Mark positive"
      >
        Positive
      </button>
      <button
        className={`btn btn-sm ${feedback === 'negative' ? 'btn-danger' : 'btn-secondary'}`}
        onClick={() => updateFeedback('negative')}
        disabled={loading || feedback === 'negative'}
        title="Mark negative"
      >
        Negative
      </button>
      {feedback !== null && (
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => updateFeedback(null)}
          disabled={loading}
          title="Clear feedback"
        >
          Clear
        </button>
      )}
      {error && <span style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}>{error}</span>}
    </div>
  );
}
