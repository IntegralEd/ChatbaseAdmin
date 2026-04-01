/**
 * /admin/chatbot?recordId=<Airtable chatbot record ID>
 *
 * Per-chatbot action panel — designed to be embedded in Softr as an iframe.
 * URL pattern: /admin/chatbot?recordId=rectmocM99t0RBss5
 *
 * Shows:
 *   • Chatbot info + Sync Now
 *   • Pending message feedback queue  (Send_To_Chatbase=true, not yet sent)
 *   • Pending prompt change queue     (Change_Status = open | pending | approved)
 */

import type { Metadata } from 'next';
import { listRecords, getRecord } from '@/lib/airtable';
import { TABLES } from '@/lib/constants';
import {
  type ChatbotFields,
  type MessageReviewFields,
  type PromptChangeRequestFields,
} from '@/lib/mappers';
import { SyncButton, PushFeedbackButton, PushPromptButton } from './ChatbotActions';

export const metadata: Metadata = { title: 'Chatbot Panel' };

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default async function ChatbotPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const recordId = typeof searchParams.recordId === 'string' ? searchParams.recordId : null;

  if (!recordId) {
    return (
      <div>
        <h2>Missing recordId</h2>
        <p>Pass the Airtable chatbot record ID as a query param: <code>?recordId=recXXX</code></p>
      </div>
    );
  }

  // Fetch in parallel
  const [chatbotResult, reviewsResult, changesResult] = await Promise.allSettled([
    getRecord<ChatbotFields>(TABLES.CHATBOTS, recordId),
    listRecords<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, {
      filterByFormula: `AND({Send_To_Chatbase}=1, {Feedback_Sync_Status}!="sent")`,
      sort: [{ field: 'Feedback_Sync_Status', direction: 'asc' }],
    }),
    listRecords<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, {
      filterByFormula: `OR({Change_Status}="open",{Change_Status}="pending",{Change_Status}="approved")`,
      sort: [{ field: 'Change_Title', direction: 'asc' }],
    }),
  ]);

  if (chatbotResult.status === 'rejected') {
    return (
      <div>
        <h2>Chatbot not found</h2>
        <p style={{ color: 'var(--color-danger)' }}>
          Record ID <code>{recordId}</code> not found in Chatbase_Chatbots table.
        </p>
      </div>
    );
  }

  const chatbot = chatbotResult.value;
  const reviews = reviewsResult.status === 'fulfilled' ? reviewsResult.value : [];
  const changes = changesResult.status === 'fulfilled' ? changesResult.value : [];

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex-row mb-2" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0 }}>{chatbot.fields.Chatbot_Name ?? 'Chatbot'}</h1>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            Chatbase ID: {chatbot.fields.Chatbase_Chatbot_ID ?? '—'} &nbsp;·&nbsp; Airtable: {recordId}
          </p>
        </div>
        <SyncButton />
      </div>

      {/* ── Message Feedback Queue ──────────────────────────────────────────── */}
      <section className="mb-2">
        <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>
            Message Feedback Queue
            <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--color-muted)', marginLeft: '0.5rem' }}>
              ({reviews.length} pending)
            </span>
          </h2>
          <PushFeedbackButton chatbotRecordId={recordId} />
        </div>

        {reviews.length === 0 ? (
          <p className="text-muted" style={{ marginTop: '0.5rem' }}>No pending feedback reviews.</p>
        ) : (
          <div className="card table-wrap" style={{ marginTop: '0.75rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Rating</th>
                  <th>Issue Type</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span style={{
                        color: r.fields.Internal_Rating?.toLowerCase() === 'positive'
                          ? 'var(--color-success)'
                          : r.fields.Internal_Rating?.toLowerCase() === 'negative'
                          ? 'var(--color-danger)'
                          : undefined,
                        fontWeight: 600,
                      }}>
                        {r.fields.Internal_Rating ?? '—'}
                      </span>
                    </td>
                    <td>{r.fields.Issue_Type ?? '—'}</td>
                    <td>
                      <span>
                        {r.fields.Change_Status || 'Requested'}
                      </span>
                    </td>
                    <td className="truncate" title={r.fields.Internal_Notes ?? ''}>
                      {r.fields.Internal_Notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Prompt Change Queue ─────────────────────────────────────────────── */}
      <section>
        <h2 style={{ margin: '0 0 0.75rem' }}>
          Prompt Change Queue
          <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--color-muted)', marginLeft: '0.5rem' }}>
            ({changes.length} queued)
          </span>
        </h2>

        {changes.length === 0 ? (
          <p className="text-muted">No queued prompt changes.</p>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Pushed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.fields.Change_Title ?? '—'}</td>
                    <td>{c.fields.Change_Type ?? '—'}</td>
                    <td>{c.fields.Change_Status ?? '—'}</td>
                    <td>{fmt(c.fields.Pushed_Datetime)}</td>
                    <td>
                      <PushPromptButton changeId={c.id} chatbotRecordId={recordId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
