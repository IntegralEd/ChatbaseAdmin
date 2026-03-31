/**
 * /admin/prompt-changes — Prompt Change Requests
 *
 * SCHEMA NOTE:
 * Prompt_Change_Requests.Source_Message_Links links to Chatbase_CONVERSATIONS
 * (tblV1K2KQUrI8PAmt), NOT Chatbase_Messages. The field name is misleading.
 * This is a known schema mismatch documented in src/lib/mappers.ts.
 *
 * Actual field names (from schema-registry.csv):
 *   Change_Title, Problem_Observed, Change_Type, Proposed_Prompt_Text,
 *   Proposed_Source_Change, Change_Status, Pushed_Datetime, Chatbase_Update_Result
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecords } from '@/lib/airtable';
import { TABLES } from '@/lib/constants';
import type { PromptChangeRequestFields } from '@/lib/mappers';

export const metadata: Metadata = { title: 'Prompt Changes' };
export const revalidate = 60;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    open: 'badge-running',
    pending: 'badge-default',
    approved: 'badge-success',
    applied: 'badge-success',
    pushed: 'badge-success',
    rejected: 'badge-error',
  };
  return `badge ${map[status?.toLowerCase()] ?? 'badge-default'}`;
}

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return iso; }
}

function snippet(text: string | undefined, max = 120): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

export default async function PromptChangesPage() {
  let records: Awaited<ReturnType<typeof listRecords<PromptChangeRequestFields>>> = [];
  let error: string | null = null;

  try {
    records = await listRecords<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, {
      sort: [{ field: 'Change_Title', direction: 'asc' }],
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <h1>Prompt Change Requests</h1>

      {/* Source_Message_Links now correctly links to Chatbase_Messages (schema fixed 2026-03-30) */}

      {error && (
        <div className="alert alert-error">Failed to load prompt changes: {error}</div>
      )}

      {!error && records.length === 0 && (
        <p className="text-muted">No prompt change requests found.</p>
      )}

      {records.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Problem Observed</th>
                <th>Proposed Prompt</th>
                {/* Source_Message_Links links to Conversations — see schema note above */}
                <th>Linked Conversations</th>
                <th>Pushed At</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.fields.Change_Title ?? '—'}</strong></td>
                  <td>{r.fields.Change_Type ?? '—'}</td>
                  <td>
                    <span className={statusBadge(r.fields.Change_Status ?? '')}>
                      {r.fields.Change_Status ?? '—'}
                    </span>
                  </td>
                  <td>
                    <span title={r.fields.Problem_Observed} style={{ maxWidth: 200, display: 'inline-block' }}>
                      {snippet(r.fields.Problem_Observed, 80)}
                    </span>
                  </td>
                  <td>
                    <span title={r.fields.Proposed_Prompt_Text} style={{ maxWidth: 260, display: 'inline-block' }}>
                      {snippet(r.fields.Proposed_Prompt_Text)}
                    </span>
                  </td>
                  <td>
                    {/* Source_Message_Links → Chatbase_Conversations (not messages) */}
                    {r.fields.Source_Message_Links?.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                        {r.fields.Source_Message_Links.map((convId) => (
                          <Link key={convId} href={`/admin/conversations/${encodeURIComponent(convId)}`}>
                            {convId.slice(0, 12)}…
                          </Link>
                        ))}
                      </div>
                    ) : '—'}
                  </td>
                  <td>{fmt(r.fields.Pushed_Datetime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
