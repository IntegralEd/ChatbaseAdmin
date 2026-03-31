/**
 * /admin/sync-jobs — Sync Job Log
 *
 * Server component. Shows all sync jobs, newest first.
 */

import type { Metadata } from 'next';
import { listRecords } from '@/lib/airtable';
import { TABLES } from '@/lib/constants';
import type { SyncJobFields } from '@/lib/mappers';

export const metadata: Metadata = { title: 'Sync Jobs' };
export const revalidate = 30;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    success: 'badge-success',
    error: 'badge-error',
    running: 'badge-running',
  };
  return `badge ${map[status] ?? 'badge-default'}`;
}

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch { return iso; }
}

function duration(start: string | undefined, end: string | undefined): string {
  if (!start || !end) return '—';
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 0) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  } catch { return '—'; }
}

export default async function SyncJobsPage() {
  let records: Awaited<ReturnType<typeof listRecords<SyncJobFields>>> = [];
  let error: string | null = null;

  try {
    records = await listRecords<SyncJobFields>(TABLES.SYNC_JOBS, {
      sort: [{ field: 'Started_At', direction: 'desc' }],
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div>
      <h1>Sync Jobs</h1>

      {error && (
        <div className="alert alert-error">Failed to load sync jobs: {error}</div>
      )}

      {!error && records.length === 0 && (
        <p className="text-muted">No sync jobs found.</p>
      )}

      {records.length > 0 && (
        <>
          <p className="text-muted mb-1">{records.length} job{records.length !== 1 ? 's' : ''}</p>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Triggered By</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Records</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td><code style={{ fontSize: '0.8rem' }}>{r.fields.Job_Type ?? '—'}</code></td>
                    <td>
                      <span className={statusBadge(r.fields.Status ?? '')}>
                        {r.fields.Status ?? '—'}
                      </span>
                    </td>
                    <td>{r.fields.Triggered_By ?? '—'}</td>
                    <td>{fmt(r.fields.Started_At)}</td>
                    <td>{duration(r.fields.Started_At, r.fields.Completed_At)}</td>
                    <td style={{ textAlign: 'right' }}>{r.fields.Records_Processed ?? 0}</td>
                    <td>
                      {r.fields.Error_Message ? (
                        <span
                          className="truncate"
                          title={r.fields.Error_Message}
                          style={{ color: 'var(--color-danger)', maxWidth: 260 }}
                        >
                          {r.fields.Error_Message}
                        </span>
                      ) : '—'}
                    </td>
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
