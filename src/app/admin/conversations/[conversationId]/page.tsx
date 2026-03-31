/**
 * /admin/conversations/[conversationId] — Message thread
 *
 * Server component: fetches conversation + messages from Airtable.
 * Feedback buttons are client islands (FeedbackButtons).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecords } from '@/lib/airtable';
import { TABLES } from '@/lib/constants';
import type { AirtableRecord } from '@/lib/airtable';
import type { ConversationFields, MessageFields } from '@/lib/mappers';
import FeedbackButtons from './FeedbackButtons';

interface Props {
  params: { conversationId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `Conversation ${decodeURIComponent(params.conversationId)}` };
}

export const revalidate = 30;

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default async function ConversationDetailPage({ params }: Props) {
  const conversationId = decodeURIComponent(params.conversationId);

  // Fetch conversation record
  const [convRecords, msgRecords] = await Promise.allSettled([
    listRecords<ConversationFields>(TABLES.CONVERSATIONS, {
      filterByFormula: `{Conversation_ID} = "${conversationId}"`,
      maxRecords: 1,
    }),
    listRecords<MessageFields>(TABLES.MESSAGES, {
      sort: [{ field: 'Created_At', direction: 'asc' }],
    }),
  ]);

  const conv = convRecords.status === 'fulfilled' ? convRecords.value[0] : null;

  // Filter messages that belong to this conversation by cross-referencing
  // the Conversation link field. Since filterByFormula on linked fields is
  // limited, we filter client-side after fetching.
  // For large datasets, consider storing Conversation_ID denormalized on Message.
  let messages: AirtableRecord<MessageFields>[] = [];
  if (msgRecords.status === 'fulfilled' && conv) {
    messages = msgRecords.value.filter((m) =>
      m.fields.Conversation?.includes(conv.id),
    );
  }

  return (
    <div>
      <div className="mb-1">
        <Link href="/admin/conversations">&larr; Back to conversations</Link>
      </div>

      <h1 style={{ wordBreak: 'break-all' }}>{conversationId}</h1>

      {conv && (
        <div className="card mb-2" style={{ display: 'inline-block', marginBottom: '1.5rem' }}>
          <table style={{ fontSize: '0.85rem' }}>
            <tbody>
              <tr><td style={{ color: 'var(--color-text-muted)', paddingRight: '1rem' }}>User ID</td><td>{conv.fields.User_ID || '—'}</td></tr>
              <tr><td style={{ color: 'var(--color-text-muted)' }}>Started</td><td>{fmt(conv.fields.Started_At)}</td></tr>
              <tr><td style={{ color: 'var(--color-text-muted)' }}>Messages</td><td>{conv.fields.Message_Count ?? messages.length}</td></tr>
              <tr><td style={{ color: 'var(--color-text-muted)' }}>Last message</td><td>{fmt(conv.fields.Last_Message_At)}</td></tr>
            </tbody>
          </table>
        </div>
      )}

      {!conv && (
        <div className="alert alert-warn">
          Conversation not found in Airtable. You may need to run a sync first.
        </div>
      )}

      <h2>Messages ({messages.length})</h2>

      {messages.length === 0 && (
        <p className="text-muted">
          No messages found.{' '}
          <Link href={`/api/sync/messages`}>Sync messages</Link> for this conversation via the API.
        </p>
      )}

      <div className="message-thread">
        {messages.map((msg) => (
          <div key={msg.id} className={`message-bubble ${msg.fields.Role ?? 'user'}`}>
            <div className="message-meta">
              <strong>{msg.fields.Role === 'assistant' ? 'Assistant' : 'User'}</strong>
              {' · '}
              {fmt(msg.fields.Created_At)}
              {msg.fields.Feedback && (
                <>
                  {' · '}
                  <span className={`badge badge-${msg.fields.Feedback}`}>
                    {msg.fields.Feedback}
                  </span>
                </>
              )}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{msg.fields.Content}</div>
            <div className="message-actions">
              <FeedbackButtons
                messageId={msg.fields.Message_ID ?? msg.id}
                conversationId={conversationId}
                currentFeedback={msg.fields.Feedback ?? null}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
