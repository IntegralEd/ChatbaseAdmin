/**
 * /admin/conversations — Conversation list
 *
 * Server component. Fetches all conversations from Airtable and renders
 * a paginated table. Each row links to the message thread.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecords } from '@/lib/airtable';
import { TABLES } from '@/lib/constants';
import type { ConversationFields } from '@/lib/mappers';

export const metadata: Metadata = { title: 'Conversations' };
export const revalidate = 60;

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default async function ConversationsPage() {
  let records: Awaited<ReturnType<typeof listRecords<ConversationFields>>> = [];
  let error: string | null = null;

  try {
    records = await listRecords<ConversationFields>(TABLES.CONVERSATIONS, {
      sort: [{ field: 'Started_At', direction: 'desc' }],
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <h1>Conversations</h1>

      {error && (
        <div className="alert alert-error">Failed to load conversations: {error}</div>
      )}

      {!error && records.length === 0 && (
        <p className="text-muted">No conversations found. Run a sync to pull data from Chatbase.</p>
      )}

      {records.length > 0 && (
        <>
          <p className="text-muted mb-1">{records.length} conversation{records.length !== 1 ? 's' : ''}</p>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Conversation ID</th>
                  <th>User Email</th>
                  <th>Started At</th>
                  <th>Messages</th>
                  <th>Last Synced</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/admin/conversations/${encodeURIComponent(r.fields.Conversation_ID ?? r.id)}`}>
                        <span className="truncate" style={{ maxWidth: 200 }}>
                          {r.fields.Conversation_ID ?? r.id}
                        </span>
                      </Link>
                    </td>
                    <td>{r.fields.User_Email ?? <span className="text-muted">—</span>}</td>
                    <td>{fmt(r.fields.Started_At)}</td>
                    <td>{r.fields.Message_Count ?? '—'}</td>
                    <td>{fmt(r.fields.Last_Synced)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
